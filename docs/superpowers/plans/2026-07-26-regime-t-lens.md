# Regime-t Lens (Amendment A6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deterministic, calibrated two-state bivariate Student-t(5) regime simulator as the fourth robustness-frontier model, with CPU/GPU parity, a committed calibration artifact, reproducible acceptance evidence, and honest documentation.

**Architecture:** Calibration is an offline, deterministic pure-TypeScript pipeline that reconstructs the 1,206-month equity/bond series, fits and accepts the HMM, and writes a reviewed JSON artifact; runtime code validates and consumes that artifact but never fits. A separate pure CPU runner and separate TSL graph/GPU driver reuse existing financial buffers additively, while A5's frontier orchestration appends a `'regime'` runner after the three frozen models and publishes only the complete four-model result.

**Tech Stack:** TypeScript 5.9, Node.js/esbuild test harness, Zustand 5, three.js/TSL exactly 0.185.1, WebGPU/Tint production probe, JSON calibration artifact.

## Global Constraints

- A5 must be implemented and green before A6 integration begins.
- Keep `three` exactly at `0.185.1`.
- Do not mutate `SimParams`, `SimStats`, `TriStats`, model IDs `0`–`2`, existing buffer layouts, `runSimulation`, `cpuSim.worker.ts`, or the frozen CPU worker protocol.
- Regime-t is a frontier-only lens; never add `'regime'` to `SimParams['model']` and never assign model ID `3`.
- Preserve the frozen wealth/cash-flow/drawdown/failure/history operation order.
- CPU and GPU must use the same `stepSeedU(path, month, seed)`, stream numbers `0`–`7`, f32 artifact constants, comparisons, Cholesky order, gross-return formula, and wealth-step order.
- Every path-month reserves all eight branch-independent streams: `0` state, `1`/`2` Gaussian coordinates, and `3`–`7` the five chi-square coordinates.
- During a regime run only, existing `pathBlockBase` stores state `0` or `1`; do not allocate another per-path buffer or a ninth storage binding.
- Runtime initialization is `'latest-filtered'` and displays the artifact's 2026-06 as-of date; stationary initialization is validation sensitivity only.
- Regime-t ignores the user's `mu` and `sigma`; it uses existing financial fields and the existing `glidepathMix` allocation convention.
- All frontier models use 100,000 GPU paths or 10,000 CPU paths, identical seed/inputs, sequential execution, atomic publication, and selected-primary restoration.
- Do not claim physical-GPU performance until physical hardware is measured.

## A5 prerequisite surfaces

Before Task 1, verify these landed exports. If A5 used a different filename, update A6 import paths to the landed equivalent without renaming A5's public types:

```ts
// src/sim/frontier/types.ts
export type FrontierModelKey = SimParams['model'] | 'regime';
export interface RegimeOutcome {
  model: 'regime';
  stats: Omit<SimStats, 'safeWithdrawalRate' | 'computedAt'>;
  magnitude: Omit<MagnitudeStats, 'computedAt'>;
  initialization: 'latest-filtered';
  calibrationAsOf: string;
}
export type FrontierOutcome = ModelOutcome | RegimeOutcome;

// src/sim/frontier/capacity.ts
export function computeModelCapacity(
  run: (monthlySpending: number, signal?: AbortSignal) => Promise<FrontierOutcome>,
  options: ComputeModelCapacityOptions,
): Promise<{
  outcome: FrontierOutcome;
  curve: SpendingCurvePoint[];
  capacity90: SpendingCapacity90;
}>;

// src/sim/frontier/computeFrontier.ts
export function computeRobustnessFrontier(
  runners: readonly FrontierModelRunner[],
  options: ComputeRobustnessFrontierOptions,
): Promise<RobustnessFrontier>;
```

A5 also owns `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\store\frontierStore.ts`, `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\frontier\gpuFrontier.ts`, `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\frontier\cpuFrontier.ts`, `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\ui\frontier.worker.ts`, and `simRuntime.requestRobustnessFrontier`.

---

### Task 1: Reconstruct the paired historical series and freeze the artifact contract

**Files:**
- Create: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\regime\types.ts`
- Create: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\regime\series.ts`
- Create: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\regime\series.test.mjs`

**Interfaces:**
- Consumes: `BootstrapBlocksFile`-shaped `historicalReturns.json` with overlapping equity and bond blocks.
- Produces:

```ts
export type Vec2 = readonly [number, number];
export type Mat2 = readonly [number, number, number, number]; // row-major
export type StatePair<T> = readonly [T, T]; // [calm, stress]

export interface PairedLogReturnSeries {
  dates: readonly string[];
  values: readonly Vec2[]; // [log1p(equity), log1p(bond)]
  inputSha256: string;
}

export interface RegimeCalibrationArtifact {
  schemaVersion: 1;
  model: 'two-state-bivariate-student-t';
  degreesOfFreedom: 5;
  stateOrder: readonly ['calm', 'stress'];
  data: { start: string; end: string; observations: number; inputSha256: string };
  states: StatePair<{
    mean: Vec2;
    covariance: Mat2;
    cholesky: readonly [number, number, number]; // L00,L10,L11
    equityVolMonthly: number;
  }>;
  transition: Mat2;
  stationary: Vec2;
  latestFiltered: Vec2;
  filteredOccupancy: Vec2;
  expectedDurationMonths: Vec2;
  fit: {
    logLikelihood: number;
    iterations: number;
    converged: boolean;
    convergedOrderedStarts: number;
  };
  rollingOrigin: {
    firstOrigin: 600;
    refitEveryMonths: 12;
    observationsScored: number;
    twoStateMeanLogScore: number;
    oneStateMeanLogScore: number;
  };
}
```

- [ ] **Step 1: Write the failing series-recovery tests**

```js
import historical from '../../data/historicalReturns.json' with { type: 'json' };
import { recoverPairedLogReturns } from './series.ts';

const a = recoverPairedLogReturns(historical);
const b = recoverPairedLogReturns(historical);
check('recovers 1,206 observations', a.values.length === 1206);
check('dates cover 1926-01 through 2026-06',
  a.dates[0] === '1926-01' && a.dates.at(-1) === '2026-06');
check('digest is deterministic SHA-256',
  a.inputSha256 === b.inputSha256 && /^[0-9a-f]{64}$/.test(a.inputSha256));
check('log1p conversion is paired',
  a.values[0][0] === Math.log1p(historical.blocks[0]) &&
  a.values[0][1] === Math.log1p(historical.bondBlocks[0]));

const broken = structuredClone(historical);
broken.blocks[13] += 1e-6;
checkThrows('rejects any overlap mismatch', () => recoverPairedLogReturns(broken), /overlap/);
```

- [ ] **Step 2: Run the test and verify red**

Run:

```powershell
npx esbuild src/sim/regime/series.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/regime-series.test.bundle.mjs
node node_modules/.tmp/regime-series.test.bundle.mjs
```

Expected: bundle failure because `src/sim/regime/series.ts` does not exist.

- [ ] **Step 3: Implement exact overlap recovery, dates, `log1p`, and digest**

```ts
export function recoverPairedLogReturns(file: HistoricalBlocksFile): PairedLogReturnSeries {
  assertHistoricalShape(file);
  const { blockCount, blockLength, startDate } = file._meta;
  for (let b = 0; b < blockCount - 1; b++) {
    for (let m = 1; m < blockLength; m++) {
      assertSame(file.blocks[b * 12 + m], file.blocks[(b + 1) * 12 + m - 1], 'equity overlap');
      assertSame(file.bondBlocks[b * 12 + m], file.bondBlocks[(b + 1) * 12 + m - 1], 'bond overlap');
    }
  }
  const equity = Array.from({ length: blockCount }, (_, b) => file.blocks[b * 12]);
  const bonds = Array.from({ length: blockCount }, (_, b) => file.bondBlocks[b * 12]);
  equity.push(...file.blocks.slice((blockCount - 1) * 12 + 1));
  bonds.push(...file.bondBlocks.slice((blockCount - 1) * 12 + 1));
  const dates = monthSequence(startDate, equity.length);
  const canonical = dates.map((d, i) =>
    `${d}\t${equity[i].toPrecision(17)}\t${bonds[i].toPrecision(17)}\n`).join('');
  return {
    dates,
    values: equity.map((r, i) => [Math.log1p(r), Math.log1p(bonds[i])] as const),
    inputSha256: createHash('sha256').update(canonical, 'utf8').digest('hex'),
  };
}
```

Require exact equality for overlaps because the committed JSON repeats the same decimal values. Reject missing bonds, non-finite values, returns `<= -1`, wrong length, or a recovered end date unequal to `_meta.endDate`.

- [ ] **Step 4: Run green**

Run the two commands from Step 2.

Expected: all recovery, rejection, date, `log1p`, and deterministic-digest checks pass.

- [ ] **Step 5: Commit**

```powershell
git add src/sim/regime/types.ts src/sim/regime/series.ts src/sim/regime/series.test.mjs
git commit -m "feat(regime): recover paired calibration series"
```

---

### Task 2: Fit, accept, and commit the deterministic HMM artifact

**Files:**
- Create: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\regime\hmm.ts`
- Create: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\regime\acceptance.ts`
- Create: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\regime\hmm.test.mjs`
- Create: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\scripts\buildRegimeCalibration.ts`
- Create: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\data\regimeCalibration.json`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\package.json`

**Interfaces:**

```ts
export interface HmmFitOptions {
  maxIterations: 250;
  perObservationTolerance: 1e-7;
  meanShrinkageObservations: 12;
  covarianceEigenFloor: 1e-8;
  transitionPseudoCount: 1; // Beta(2,2): alpha - 1 per cell
}
export interface HmmFit { artifact fields plus filtered: readonly Vec2[] }
export function fitRegimeHmm(values: readonly Vec2[], options?: Partial<HmmFitOptions>): HmmFit;
export function rollingOriginScores(values: readonly Vec2[]): RegimeCalibrationArtifact['rollingOrigin'];
export function assertRegimeAcceptance(
  artifact: RegimeCalibrationArtifact,
  orderedStartLogLikelihoods: readonly number[],
): void;
```

- [ ] **Step 1: Write failing synthetic-fit and acceptance tests**

Use a fixed synthetic dataset generated with a local deterministic LCG, known transition `[[0.96,0.04],[0.14,0.86]]`, calm/stress equity standard deviations `0.025/0.075`, and 2,400 paired observations. Assert convergence, `calm` before `stress`, transition recovery within `0.05`, each occupancy above `0.10`, positive Cholesky diagonals, and identical JSON from two fits. Add one rejection fixture for each acceptance rule, including rolling score and same-solution count.

```js
const fit1 = fitRegimeHmm(SYNTHETIC);
const fit2 = fitRegimeHmm(SYNTHETIC);
check('deterministic fit', JSON.stringify(stripTiming(fit1)) === JSON.stringify(stripTiming(fit2)));
check('ordered by equity volatility',
  fit1.states[0].equityVolMonthly < fit1.states[1].equityVolMonthly);
check('transition recovered',
  Math.abs(fit1.transition[0] - 0.96) < 0.05 &&
  Math.abs(fit1.transition[3] - 0.86) < 0.05);
checkThrows('rolling score gate is binding',
  () => assertRegimeAcceptance({...accepted, rollingOrigin: {...accepted.rollingOrigin,
    twoStateMeanLogScore: -9, oneStateMeanLogScore: -8}}, [1, 1]), /rolling-origin/);
```

- [ ] **Step 2: Run red**

Run:

```powershell
npx esbuild src/sim/regime/hmm.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/regime-hmm.test.bundle.mjs
node node_modules/.tmp/regime-hmm.test.bundle.mjs
```

Expected: bundle failure because `hmm.ts` and `acceptance.ts` do not exist.

- [ ] **Step 3: Implement scaled forward-backward and Student-t(5) EM**

For dimension `d=2`, treat stored covariance `C` as actual covariance and density scale `S=C*(5-2)/5`. Compute:

```ts
const logDensity = logGamma(3.5) - logGamma(2.5)
  - Math.log(5 * Math.PI) - 0.5 * logDet(scale)
  - 3.5 * Math.log1p(mahalanobis(x, mean, inverse(scale)) / 5);
const mixtureWeight = (5 + 2) / (5 + mahalanobisValue);
```

Scale every forward row and backward row, accumulate total log likelihood from the forward scale factors, and form normalized `gamma`/`xi`. Update means with 12 observation-equivalents toward the full-sample mean, update t scale with `gamma * mixtureWeight`, convert back to actual covariance with `5/3`, floor the smaller 2x2 eigenvalue at `1e-8`, and update each transition row as:

```ts
p00 = (xi00 + 1) / (xi00 + xi01 + 2);
p01 = 1 - p00;
p11 = (xi11 + 1) / (xi10 + xi11 + 2);
p10 = 1 - p11;
```

Use four deterministic starts: equity absolute-deviation median split, equity bottom/top quartile split, first/last-half moments, and full-sample covariance scaled `0.5x/2x`; each start uses `[[0.95,0.05],[0.10,0.90]]` with a deterministic perturbation of at most `0.02`. Stop at 250 iterations or per-observation improvement below `1e-7`. Reorder all state-indexed values after every fit so `equityVolCalm < equityVolStress`; keep the highest-likelihood converged result.

- [ ] **Step 4: Implement rolling-origin scoring and acceptance**

At origins `600, 612, …` before observation 1,206, refit using only observations `[0, origin)`, then score the next at most 12 observations by propagating the last filtered state probability and evaluating the joint predictive mixture. Refit a one-state bivariate Student-t(5) with the same mean shrinkage/covariance floor at every origin. Average over every scored month, not over origins.

`assertRegimeAcceptance` must throw unless covariance determinants and Cholesky diagonals are positive, both occupancies are at least `0.10`, stress equity volatility is at least `1.5 * calm`, all four cells lie in `[0.0001,0.9999]`, both diagonal persistence probabilities lie in `[0.5,0.9999]`, two starts agree with the winner within `1e-4` log likelihood per observation, and the two-state rolling score is at least the one-state score.

The approved phrase “every transition probability is in `[0.5,0.9999]`” cannot literally apply to all four cells of a row-stochastic 2x2 matrix. Implement and document it as the persistence gate on `p00` and `p11`; require the off-diagonal complements to remain strictly inside `(0,0.5]`.

- [ ] **Step 5: Add deterministic write/check modes and package scripts**

```ts
// scripts/buildRegimeCalibration.ts
const artifact = buildRegimeCalibration(recoverPairedLogReturns(historical));
assertRegimeAcceptance(artifact, artifactBuildEvidence.orderedStartLogLikelihoods);
const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== serialized) process.exitCode = 1;
} else {
  writeFileSync(output, serialized, 'utf8');
}
printAcceptanceTable(artifact);
```

Add:

```json
"build:regime-calibration": "esbuild scripts/buildRegimeCalibration.ts --bundle --platform=node --format=esm --outfile=node_modules/.tmp/buildRegimeCalibration.mjs && node node_modules/.tmp/buildRegimeCalibration.mjs",
"check:regime-calibration": "esbuild scripts/buildRegimeCalibration.ts --bundle --platform=node --format=esm --outfile=node_modules/.tmp/buildRegimeCalibration.mjs && node node_modules/.tmp/buildRegimeCalibration.mjs --check",
"test:regime": "esbuild src/sim/regime/series.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/regime-series.test.bundle.mjs && node node_modules/.tmp/regime-series.test.bundle.mjs && esbuild src/sim/regime/hmm.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/regime-hmm.test.bundle.mjs && node node_modules/.tmp/regime-hmm.test.bundle.mjs && npm run check:regime-calibration"
```

- [ ] **Step 6: Generate once, inspect, and prove reproducibility**

Run:

```powershell
npm run build:regime-calibration
git diff -- src/data/regimeCalibration.json
npm run check:regime-calibration
npm run test:regime
```

Expected: the artifact reports 1,206 observations through 2026-06, SHA-256, four starts, at least two agreeing converged starts, every acceptance line `PASS`, rolling two-state score not below one-state, `--check` exits zero, and the test suite passes. Inspect the measured artifact rather than editing fit values by hand.

- [ ] **Step 7: Commit**

```powershell
git add package.json src/data/regimeCalibration.json src/sim/regime scripts/buildRegimeCalibration.ts
git commit -m "feat(regime): calibrate and accept deterministic HMM"
```

---

### Task 3: Implement pure regime draws and the separate CPU simulator

**Files:**
- Create: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\regime\artifact.ts`
- Create: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\regime\math.ts`
- Create: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\fallback\cpuRegimeSim.ts`
- Create: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\regime\runtime.test.mjs`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\package.json`

**Interfaces:**

```ts
export const SHIPPED_REGIME_CALIBRATION: Readonly<RegimeCalibrationArtifact>;
export const REGIME_CALIBRATION_F32: Readonly<RegimeCalibrationArtifact>;
export function nextRegimeState(
  previous: 0 | 1 | null, stateUniform: number, calibration: RegimeCalibrationArtifact,
): 0 | 1;
export function drawRegimeMonth(
  path: number, month: number, seed: number, previous: 0 | 1 | null,
  calibration: RegimeCalibrationArtifact,
): { state: 0 | 1; equityLogReturn: number; bondLogReturn: number };
export function runCpuRegimeSim(
  baseParams: SimParams,
  calibration: RegimeCalibrationArtifact,
  options?: { now?: () => number; includeHistory?: boolean },
): CpuSimResult;
```

- [ ] **Step 1: Write failing golden, moment, persistence, and CPU-result tests**

Pin the first 12 `{state,equityLogReturn,bondLogReturn}` values for seed 42/path 0 from the implementation, then independently shadow the formula in the test using `stepSeedU`, `streamUniform(seedU,0)`, and `streamNormal(seedU,1..7)`. Add 250,000 draw moment tests by state, transition frequency tests within binomial tolerance, stationary/duration identities, deterministic byte equality, glidepath paired-gross math, null failure semantics, and assertions that changing only `mu`/`sigma` leaves every output byte unchanged.

Also snapshot the legacy `stepSeedU`, GBM, bootstrap, and fattail goldens before adding A6 and assert the same values afterward.

- [ ] **Step 2: Run red**

Run:

```powershell
npx esbuild src/sim/regime/runtime.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/regime-runtime.test.bundle.mjs
node node_modules/.tmp/regime-runtime.test.bundle.mjs
```

Expected: bundle failure because `artifact.ts`, `math.ts`, and `cpuRegimeSim.ts` do not exist.

- [ ] **Step 3: Validate the JSON at runtime and produce f32 constants**

`artifact.ts` must verify schema/model/df/state order, finite tuples, row-stochastic transition matrix, dates/digest, positive Cholesky diagonals, and covariance reconstruction `L L'` within `1e-6`. Deep-freeze the validated object. Create `REGIME_CALIBRATION_F32` by `Math.fround` on every runtime mean, Cholesky entry, transition probability, and latest-filtered probability.

- [ ] **Step 4: Implement fixed-stream regime math**

```ts
export function drawRegimeMonth(path, month, seed, previous, c) {
  const seedU = stepSeedU(path, month, seed);
  const state = nextRegimeState(previous, streamUniform(seedU, 0), c);
  const z0 = streamNormal(seedU, 1);
  const z1 = streamNormal(seedU, 2);
  let chi2 = 0;
  for (let stream = 3; stream <= 7; stream++) {
    const n = streamNormal(seedU, stream);
    chi2 += n * n;
  }
  const radial = Math.sqrt(3 / Math.max(chi2, 1e-12));
  const t0 = z0 * radial;
  const t1 = z1 * radial;
  const s = c.states[state];
  return {
    state,
    equityLogReturn: s.mean[0] + s.cholesky[0] * t0,
    bondLogReturn: s.mean[1] + s.cholesky[1] * t0 + s.cholesky[2] * t1,
  };
}
```

For month zero, return stress iff stream 0 is less than `latestFiltered[1]`. Later, return stress iff stream 0 is less than `transition[1]` from calm or `transition[3]` from stress. The comparison order must match TSL exactly.

- [ ] **Step 5: Implement `runCpuRegimeSim` without calling or changing `runCpuSim`**

Mirror the existing CPU initializer, snapshot schedule, and `applyMonthlyStep`. For each active month, compute `A = glidepathMix(...)` when enabled and `A = 1` otherwise, then:

```ts
const gross =
  allocation * Math.exp(draw.equityLogReturn) +
  (1 - allocation) * Math.exp(draw.bondLogReturn);
applyMonthlyStep(state, gross, month, retireStep, baseParams.contribution, baseParams.withdrawal);
```

Return the exact `CpuSimResult` categories. Reuse exported `quantile`, `worstDecileTailMean`, and `magnitudeOfFailure`; set `safeWithdrawalRate: 0`. Do not inspect `baseParams.model`, `mu`, or `sigma`.

- [ ] **Step 6: Run green and add the runtime suite to `test:regime`**

Append the runtime bundle/run to `test:regime`, then run:

```powershell
npm run test:regime
npm run test:sim
```

Expected: regime goldens/moments/persistence/determinism pass; all pre-A6 simulation goldens remain unchanged.

- [ ] **Step 7: Commit**

```powershell
git add package.json src/sim/regime/artifact.ts src/sim/regime/math.ts src/sim/regime/runtime.test.mjs src/sim/fallback/cpuRegimeSim.ts
git commit -m "feat(regime): add pure math and CPU simulator"
```

---

### Task 4: Add the separate TSL graph, GPU driver, and real production probe

**Files:**
- Create: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\kernels\regimeStep.tsl.ts`
- Create: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\runRegimeSimulation.ts`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\probe\run-compute-probe.mjs`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\probe\compute-probe.js`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\package.json`

**Interfaces:**

```ts
export const computeRegimeStep: ComputeNode;
export interface RunRegimeSimulationOptions {
  renderer: WebGPURenderer;
  params: SimParams;
  signal?: AbortSignal;
  onProgress?: (completedSteps: number, totalSteps: number) => void;
  stepsPerChunk?: number;
}
export function runRegimeSimulation(options: RunRegimeSimulationOptions): Promise<RunSimulationResult>;
```

- [ ] **Step 1: Make the production probe fail for the absent graph**

Import `computeRegimeStep` in `probe/compute-probe.js`, add it immediately after `computeInit`, and add a 16-lane month-zero state parity readback using `getStorageAttribute(pathBlockBase)` and the CPU `stepSeedU/streamUniform` formula.

Run:

```powershell
npm run test:compute-probe
```

Expected: failure because `regimeStep.tsl.ts` and/or the script do not exist.

- [ ] **Step 2: Implement the real graph with typed state and float twins**

Use `uint(...).toVar()` for state/index comparisons and separate float variables for means/Cholesky math; do not use one `select()` output in both domains. Compile f32 constants from `REGIME_CALIBRATION_F32`. Use `streamUniformTsl(seedU,0)` and `streamNormalTsl(seedU,1..7)`, assign state to `pathBlockBase`, compute:

```ts
const radial = float(3).div(chi2.max(1e-12)).sqrt();
const equityGross = meanEquity.add(l00.mul(z0.mul(radial))).exp();
const bondGross = meanBond
  .add(l10.mul(z0.mul(radial)))
  .add(l11.mul(z1.mul(radial)))
  .exp();
gross.assign(mix.mul(equityGross).add(mix.oneMinus().mul(bondGross)));
```

Copy the existing retirement bookkeeping and history write order into this separate graph. Import existing buffers/uniforms; create no buffer, uniform, or model switch. `computeStep` must remain byte-for-byte unchanged.

- [ ] **Step 3: Implement the separate driver**

Write the same existing financial uniform values (`uActiveN`, `uSeed`, `uRetireStep`, wealth/cash flow, glidepath, snapshot stride/count), deliberately omit `uModel`, dispatch existing `computeInit`, then dispatch only `computeRegimeStep`. Preserve abort-before-dispatch, chunk progress, final `computeAsync`, and `RunSimulationResult` semantics from the frozen driver without modifying it.

- [ ] **Step 4: Extend the cross-platform probe launcher**

Preserve A5's launcher and add the regime parity check to its existing result gate. It must continue to reuse `projectRootFromModuleUrl`, `resolveChromiumExecutable`, and `systemChromiumCandidates`, launch Chromium/SwiftShader, wait for `window.__probe.done`, print checks/errors, terminate the server in `finally`, and exit nonzero on timeout or any validation error.

Add:

```json
"test:compute-probe": "node probe/run-compute-probe.mjs"
```

- [ ] **Step 5: Run graph, parity, typing, and legacy checks**

```powershell
npx tsc -b
npm run test:regime
npm run test:compute-probe
npm run test:probe-launcher
```

Expected: the real `computeRegimeStep` dispatch compiles through Tint with zero validation errors, the first 16 integer states match the CPU mirror, no ninth binding appears, and launcher tests remain green. Record SwiftShader compilation separately from physical-GPU performance.

- [ ] **Step 6: Commit**

```powershell
git add package.json probe/compute-probe.js probe/run-compute-probe.mjs src/sim/kernels/regimeStep.tsl.ts src/sim/runRegimeSimulation.ts
git commit -m "feat(regime): add TSL graph GPU driver and probe"
```

---

### Task 5: Append Regime-t as the fourth atomic frontier model

**Files:**
- Create: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\frontier\modelRegistry.ts`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\frontier\computeFrontier.ts`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\frontier\computeFrontier.test.mjs`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\frontier\gpuFrontier.ts`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\frontier\gpuFrontier.test.mjs`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\frontier\cpuFrontier.ts`
- Create: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\sim\frontier\cpuFrontier.test.mjs`

**Interfaces:**

```ts
export const FRONTIER_MODEL_ORDER = [
  'gbm', 'bootstrap', 'fattail', 'regime',
] as const satisfies readonly FrontierModelKey[];

export function toRegimeOutcome(result: Pick<CpuSimResult, 'stats' | 'magnitude'>): RegimeOutcome {
  const { safeWithdrawalRate: _swr, computedAt: _statsAt, ...stats } = result.stats;
  const { computedAt: _magnitudeAt, ...magnitude } = result.magnitude;
  return {
    model: 'regime',
    stats,
    magnitude,
    initialization: 'latest-filtered',
    calibrationAsOf: SHIPPED_REGIME_CALIBRATION.data.end,
  };
}
```

- [ ] **Step 1: Extend A5 tests first**

Assert exact order `gbm,bootstrap,fattail,regime`; four sequential model completions; no result commit after the first three; identical spending/path count/seed for all; RegimeOutcome metadata; complete-result robust spend includes regime; CPU termination suppresses a stale four-model response; GPU error/abort/restore behavior remains A5-correct when the failing candidate is regime.

- [ ] **Step 2: Run focused tests and verify red**

Run:

```powershell
npm run test:frontier
```

Expected: failures showing only three runners/results and absent regime metadata.

- [ ] **Step 3: Add the ordered registry and CPU worker runner**

Keep `frontier.worker.ts` unchanged as transport. In `cpuFrontier.ts`, map the first three keys to `runCpuSim({...params, model, withdrawal, pathCount: 10_000})` and `'regime'` to:

```ts
runCpuRegimeSim(
  {...params, withdrawal: monthlySpending, pathCount: 10_000},
  SHIPPED_REGIME_CALIBRATION,
  {now: fixedComputationClock},
)
```

Convert with `toRegimeOutcome`. `computeRobustnessFrontier` must consume the ordered four-runner registry. Preserve A5's worker terminate/recreate supersession and one final `postMessage`; do not modify either worker protocol and do not touch `cpuSim.worker.ts`.

- [ ] **Step 4: Add the GPU candidate**

In `gpuFrontier.ts`'s injected candidate dispatcher, route `'regime'` to `runRegimeSimulation`, then call existing store-free `computeStats(renderer,{params:candidateParams,signal})` and convert to `RegimeOutcome`. Route the other keys through frozen `runSimulation`. Keep sequential shared-buffer use and perform the selected primary `runSimulation` restore after regime completes and before the one frontier commit. On owned abort, skip stale restore; on non-abort error attempt restore; if restore fails publish nothing.

- [ ] **Step 5: Run focused and integration tests**

```powershell
npm run test:frontier
npm run test:regime
npm run test:triangulation
```

Expected: all four models run in exact order, publication remains atomic, primary restore semantics pass every injected failure case, and frozen triangulation still contains only the original three models.

- [ ] **Step 6: Commit**

```powershell
git add src/sim/frontier/modelRegistry.ts src/sim/frontier/computeFrontier.ts src/sim/frontier/computeFrontier.test.mjs src/sim/frontier/gpuFrontier.ts src/sim/frontier/gpuFrontier.test.mjs src/sim/frontier/cpuFrontier.ts src/sim/frontier/cpuFrontier.test.mjs
git commit -m "feat(frontier): append regime as fourth model"
```

---

### Task 6: Add repeatable 10,000-path acceptance and quantitative evidence

**Files:**
- Create: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\validation\regimeValidate.ts`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\src\validation\frontierValidate.ts`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\package.json`

**Interfaces:** Validation imports production `computeModelCapacity`, `runCpuRegimeSim`, the four-model `cpuFrontier` adapter, and the committed artifact. It must not contain a duplicate frontier search or regime formula.

- [ ] **Step 1: Write the failing validation assertions**

For seed 42 and 10,000 paths, run all four models twice with the same committed params. Assert byte-identical serialized results, exact order, `analysisPathCount === 10_000`, each capacity is a tested curve point, curve reversal does not exceed `1/10_000`, and each converged capacity reruns within `[0.895,0.905]`. Explicitly accept `unbounded-high` or `budget-exhausted` without claiming a crossing.

Also run regime with latest-filtered and stationary initialization in validation only and print both outcomes as sensitivity; the application still publishes one latest-filtered curve.

- [ ] **Step 2: Run red**

```powershell
npm run test:frontier-validate
```

Expected: failure because the validator still expects three models or `regimeValidate.ts` is absent.

- [ ] **Step 3: Implement measured output and chain the package script**

Emit a stable table containing model, current success, P50, worst-decile drawdown, capacity/status, evaluations, initialization, calibration as-of, path count, seed, and elapsed CPU time. Print the artifact acceptance metrics and both initialization sensitivities from live computations. Extend A5's existing `test:frontier-validate` script by bundling/running `regimeValidate.ts`; retain A5's validation command first.

- [ ] **Step 4: Run twice and save the console output for documentation**

```powershell
npm run test:frontier-validate
npm run test:frontier-validate
npm run test:validate
```

Expected: both frontier runs print exactly matching quantitative result fields (elapsed time may differ), every invariant passes, and the pre-A6 validation suite remains green. These outputs, not estimates, are the only numbers permitted in Task 7.

- [ ] **Step 5: Commit**

```powershell
git add package.json src/validation/frontierValidate.ts src/validation/regimeValidate.ts
git commit -m "test(regime): validate four-model frontier evidence"
```

---

### Task 7: Document A6, run the clean full gate, and capture review evidence

**Files:**
- Create: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\docs\AMENDMENT_A6.md`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\docs\CONTRACTS.md`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\docs\CONTRACTS_STATS.md`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\docs\calibration.md`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\docs\DECISIONS.md`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\README.md`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\DEMO.md`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\validation\REPORT.md`
- Modify: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-worktrees\p3-robustness-frontier\MEMORY.md`

**Interfaces:** Documentation cites the committed artifact and Task 6 console evidence. `CONTRACTS.md` and `CONTRACTS_STATS.md` receive links to A6 only; their frozen sections are not rewritten.

- [ ] **Step 1: Write Amendment A6 and calibration evidence**

Document authorization, additive surfaces, data digest/window, exact HMM formula, df=5, actual-covariance convention, four starts, stop rule, shrinkage/floor/pseudocounts, measured fitted parameters, occupancy/durations/latest probability, all acceptance values, rolling-origin comparison, deterministic RNG streams, `pathBlockBase` temporary meaning, and CPU/GPU/frontier trigger/cancellation semantics.

- [ ] **Step 2: Add the required limitations verbatim in substance**

State that the data are US-only and may embed US exceptionalism; two states are parsimonious statistical classes, not two literal market conditions; regimes are latent and do not label known future events; latest-state initialization is conditional on data through 2026-06 and is not a market call; parameter uncertainty is not mixed into displayed paths; structural range is not a confidence interval and has no model probabilities; robust spend is a 90% threshold over tested simulations, not individualized advice; Regime-t ignores the `mu`/`sigma` sliders; physical-GPU performance remains unmeasured.

- [ ] **Step 3: Update decisions, feature story, demo, report, and memory from measured output**

Record the separate runner, offline calibration, latest-filtered initialization, explicit frontier trigger, and fourth-model atomicity decisions. Copy only Task 6's measured path-count/seed/date/result values into `DEMO.md` and `validation/REPORT.md`. `README.md` gets the reproducible `npm run test:regime`, `npm run test:frontier-validate`, and `npm run test:compute-probe` commands. `MEMORY.md` records the actual commit under verification, current evidence, unmeasured GPU limitation, and next action.

- [ ] **Step 4: Run focused A6 gates**

```powershell
npm run check:regime-calibration
npm run test:regime
npm run test:frontier
npm run test:frontier-validate
npm run test:compute-probe
```

Expected: all acceptance, runtime, four-model frontier, repeatability, and real-graph Tint checks pass.

- [ ] **Step 5: Run the mandatory full baseline**

```powershell
npx tsc -b
npm run lint
npm run test:sim
npm run test:stats
npm run test:gauntlet
npm run test:validate
npm run test:probe-launcher
npm run test:triangulation
npm run build
node probe/run-viz5-probe.mjs
```

Expected: every command exits zero. Confirm old three-model golden vectors and `TriStats` remain unchanged, the production visualization probe still reports zero errors, and no physical-GPU timing claim appears.

- [ ] **Step 6: Inspect frozen-surface and change scope**

```powershell
git diff --check
git diff -- src/store/simStore.ts src/sim/runSimulation.ts src/sim/fallback/cpuSim.ts src/ui/cpuSim.worker.ts src/sim/kernels/stepPaths.tsl.ts src/sim/buffers.ts
git status --short
```

Expected: `git diff --check` is clean; the frozen-surface diff is empty except an A5-owned additive import adjustment if integration required it; status contains only A6 implementation/evidence files plus already-reviewed A5 changes.

- [ ] **Step 7: Commit documentation and evidence**

```powershell
git add docs/AMENDMENT_A6.md docs/CONTRACTS.md docs/CONTRACTS_STATS.md docs/calibration.md docs/DECISIONS.md README.md DEMO.md validation/REPORT.md MEMORY.md
git commit -m "docs(regime): record A6 contracts and measured evidence"
```

- [ ] **Step 8: Request task-level code review before integration**

Provide reviewers the seven A6 commits, artifact diff, focused/full command results, exact measured values, absolute paths changed, frozen surfaces explicitly untouched, and the physical-GPU limitation. Merge only after A5 and A6 review findings are resolved and the full gate is rerun in the clean integration worktree.
