# Robustness Frontier Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Amendment A5's additive multi-stat comparison and deterministic three-model spending frontier, including isolated GPU/CPU orchestration, cancellation, validation, and contracts, without implementing the React decision surface.

**Architecture:** Frozen simulation kernels remain the only model engines. New pure TypeScript modules convert complete existing results into additive comparison artifacts, search only evaluated spending points, validate monotonicity, and assemble an all-or-nothing frontier; a dedicated Zustand store owns analytical lifecycle. GPU orchestration is an injected adapter over the existing shared buffers with mandatory selected-model restoration, while CPU orchestration uses a separate whole-frontier worker that never changes the frozen fallback worker protocol.

**Tech Stack:** TypeScript 5.9 strict, Zustand 5, three.js/WebGPU/TSL r185 (`three` exactly `0.185.1`), Web Workers, Node assertions, esbuild, Vite 7, Playwright-driven Chromium/SwiftShader compute validation.

## Global Constraints

- Scope is Amendment A5 core only: additive multi-stat comparison, pure spending-capacity/frontier engine, dedicated store, GPU adapter/runtime/cancellation/restore, dedicated CPU worker, validation/compute probe, and A5 contract documentation.
- Do not add or change any React chart, advisor-lens component, client copy, layout, typography, or styling. Those belong to `docs/superpowers/plans/2026-07-26-robustness-frontier-experience.md`.
- Do not implement or reference runtime Regime-t behavior. Amendment A5 model order is exactly `gbm`, `bootstrap`, `fattail`; Amendment A6 appends `regime` later.
- Preserve `SimParams`, `SimStats`, `TriStats`, model IDs `0..2`, `CpuSimRequest`, `CpuSimResultMessage`, frozen buffers, `runSimulation` signature, `runCpuSim` signature, and CPU/GPU operation order byte-for-byte.
- Do not modify `src/ui/cpuSim.worker.ts`, `src/sim/fallback/cpuSim.ts`, `src/sim/runSimulation.ts`, `src/sim/kernels/initPaths.tsl.ts`, `src/sim/kernels/stepPaths.tsl.ts`, or `src/sim/buffers.ts`.
- Existing A4 `triStats` publication and selected-primary buffer restoration remain behaviorally unchanged.
- `ModelComparison` and `RobustnessFrontier` publish only after all three A5 models complete. A failure, abort, stale token, monotonicity violation, or restore failure publishes no new artifact.
- GPU analysis uses exactly `100_000` paths per model; CPU analysis uses exactly `10_000` paths per model. Every model in one frontier uses the same path count and seed.
- Frontier computation starts only from `simRuntime.requestRobustnessFrontier()`. Opening or switching a future lens must not start computation.
- Committed parameter or simulation-mode changes invalidate a prior frontier and supersede in-flight analytical work. Live slider movement alone does not run frontier work.
- A feasible point has `successRate >= 0.9`; tolerance is `0.005`; maximum bisections is `8`; maximum tested monthly spending is `$100_000`.
- Capacity and robust-spend values are evaluated spending points, never interpolated or extrapolated values.
- The spending axis is sensitivity analysis, not parameter uncertainty. No confidence interval or model probability is produced.
- Store actions set or clear state only; financial computations stay in pure simulation/frontier modules.
- Every task uses red-green-refactor, ends with focused verification, and ends with an atomic commit. Do not commit the plan itself as part of plan authoring.

---

## File Structure

- Create `src/sim/frontier/types.ts`: canonical additive A5 types shared by simulation, stores, workers, and the later experience plan.
- Create `src/sim/frontier/modelComparison.ts`: store-free conversion and exact model-order aggregation.
- Create `src/sim/frontier/modelComparison.test.mjs`: full-stat preservation, order, null semantics, and incomplete-set rejection.
- Modify `src/store/simStore.ts`: add only `modelComparison` and `setModelComparison`; keep frozen types and `TriStats` untouched.
- Modify `src/store/triStats.test.mjs`: prove A4 and A5 invalidation/publication coexist.
- Create `src/sim/frontier/capacity.ts`: pure injected measured-point capacity search.
- Create `src/sim/frontier/capacity.test.mjs`: brackets, statuses, budget, abort, sort/dedup, and evaluated-point tests.
- Create `src/sim/frontier/computeFrontier.ts`: sequential three-model assembly, monotonicity validation, progress, robust-spend derivation, and complete artifact creation.
- Create `src/sim/frontier/computeFrontier.test.mjs`: ordering, deterministic repeat, monotonicity rejection, progress, and robust-status tests.
- Create `src/store/frontierStore.ts`: dedicated advisor-lens and analytical lifecycle store.
- Create `src/store/frontierStore.test.mjs`: lifecycle, timestamp preservation, and clearer tests.
- Modify `src/scene/SimDriver.tsx`: retain full A4 GPU outcomes, publish `ModelComparison`, register the explicit frontier runtime, and abort frontier on the normal pipeline.
- Modify `src/ui/useCpuSim.ts`: retain full A4 CPU outcomes, publish `ModelComparison`, and register/cancel the dedicated CPU frontier runtime.
- Modify `src/scene/simRuntime.ts`: add nullable `requestRobustnessFrontier`.
- Create `src/sim/frontier/gpuFrontier.ts`: injected GPU frontier adapter with restore semantics.
- Create `src/sim/frontier/gpuFrontier.test.mjs`: run order, no partial commit seam, abort ownership, error restore, and restore-failure tests.
- Create `src/ui/frontier.worker.ts`: dedicated immutable whole-frontier CPU worker.
- Create `src/sim/frontier/cpuFrontier.ts`: store-free CPU worker computation over existing `runCpuSim`.
- Create `src/sim/frontier/frontierWorkerClient.ts`: terminate/recreate worker client with stale-token suppression.
- Create `src/sim/frontier/frontierWorkerClient.test.mjs`: termination, stale message, error, and disposal tests.
- Create `src/validation/frontierValidate.ts`: fixed seed-42, 10,000-path repeat and capacity recheck.
- Create `probe/run-compute-probe.mjs`: cross-platform production compute-graph launcher.
- Modify `probe/compute-probe.js`: await the real imported graph dispatches and expose structured checks.
- Modify `probe/launcherPaths.test.mjs`: retain portable root and browser resolution coverage used by both launchers.
- Modify `package.json`: add `test:frontier`, `test:frontier-validate`, and `test:compute-probe`.
- Create `docs/AMENDMENT_A5_ROBUSTNESS_FRONTIER.md`: canonical additive A5 contract.
- Modify `docs/CONTRACTS.md`: link A5 while leaving frozen sections intact.
- Modify `docs/CONTRACTS_STATS.md`: link A5 while leaving frozen statistic semantics intact.
- Modify `docs/DECISIONS.md`: record explicit trigger, pure measured-point engine, dedicated store/worker, and GPU restoration.
- Modify `validation/REPORT.md`: append measured A5 CPU validation and clearly mark physical-GPU wall time unmeasured.
- Modify `MEMORY.md`: record the implemented A5 core commit range and exact verification evidence only after it exists.

### Task 1: Canonical A5 contracts and multi-stat aggregation

**Files:**
- Create: `src/sim/frontier/types.ts`
- Create: `src/sim/frontier/modelComparison.ts`
- Create: `src/sim/frontier/modelComparison.test.mjs`

**Interfaces:**
- Consumes: frozen `SimParams`, `SimStats`, and additive `MagnitudeStats` from `src/store/simStore.ts`; `ComputedStats` from `src/sim/stats/computeStats.ts`.
- Produces:

```ts
export type ShippedModelKey = SimParams['model'];

export interface ModelOutcome {
  model: ShippedModelKey;
  stats: Omit<SimStats, 'safeWithdrawalRate' | 'computedAt'>;
  magnitude: Omit<MagnitudeStats, 'computedAt'>;
}

export interface ModelComparison {
  models: readonly ModelOutcome[];
  pathCount: SimParams['pathCount'];
  seed: number;
  computedAt: number;
}

export type FrontierModelKey = ShippedModelKey | 'regime';

export interface RegimeOutcome {
  model: 'regime';
  stats: Omit<SimStats, 'safeWithdrawalRate' | 'computedAt'>;
  magnitude: Omit<MagnitudeStats, 'computedAt'>;
  initialization: 'latest-filtered';
  calibrationAsOf: string;
}

export type FrontierOutcome = ModelOutcome | RegimeOutcome;

export interface SpendingCurvePoint {
  monthlySpending: number;
  successRate: number;
}

export type CapacityStatus =
  | 'converged'
  | 'unbounded-high'
  | 'infeasible-at-zero'
  | 'budget-exhausted';

export interface SpendingCapacity90 {
  monthlySpending: number | null;
  successRate: number | null;
  target: 0.9;
  tolerance: 0.005;
  evaluations: number;
  status: CapacityStatus;
}

export interface FrontierModelResult {
  model: FrontierModelKey;
  outcome: FrontierOutcome;
  curve: readonly SpendingCurvePoint[];
  capacity90: SpendingCapacity90;
}

export interface RobustnessFrontier {
  basis: {
    params: SimParams;
    analysisPathCount: SimParams['pathCount'];
    engine: 'gpu' | 'cpu';
    seed: number;
  };
  models: readonly FrontierModelResult[];
  robustSpend: number | null;
  robustStatus: CapacityStatus;
  computedAt: number;
}

export function modelOutcome(
  model: ShippedModelKey,
  computed: ComputedStats,
): ModelOutcome;

export function orderedModelComparison(
  outcomes: ReadonlyMap<ShippedModelKey, ModelOutcome>,
  basis: Pick<SimParams, 'pathCount' | 'seed'>,
): Omit<ModelComparison, 'computedAt'>;
```

- [ ] **Step 1: Write the failing comparison contract tests**

Create fixtures whose stats include all five percentiles, worst-decile drawdown, median failure year `null` for GBM and a number for bootstrap, and magnitude nulls for a no-failure model. Assert:

```js
assert.deepEqual(
  ordered.models.map((outcome) => outcome.model),
  ['gbm', 'bootstrap', 'fattail'],
);
assert.deepEqual(ordered.models[0].stats.percentiles, computed.stats.percentiles);
assert.equal(ordered.models[0].stats.worstDecileMaxDD, 0.567);
assert.equal(ordered.models[0].stats.medianFailureYear, null);
assert.equal(ordered.models[0].magnitude.medianShortfallYears, null);
assert.equal('safeWithdrawalRate' in ordered.models[0].stats, false);
assert.equal('computedAt' in ordered.models[0].stats, false);
assert.equal('computedAt' in ordered.models[0].magnitude, false);
assert.equal(ordered.pathCount, 100_000);
assert.equal(ordered.seed, 42);
assert.throws(
  () => orderedModelComparison(new Map([['gbm', gbm]]), basis),
  /complete model set/i,
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npx esbuild src/sim/frontier/modelComparison.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/modelComparison.test.bundle.mjs
node node_modules/.tmp/modelComparison.test.bundle.mjs
```

Expected: FAIL because `types.ts` and `modelComparison.ts` do not exist.

- [ ] **Step 3: Implement the additive types and conversion**

Use destructuring so forbidden fields cannot leak:

```ts
export function modelOutcome(
  model: ShippedModelKey,
  computed: ComputedStats,
): ModelOutcome {
  const {
    safeWithdrawalRate: _safeWithdrawalRate,
    computedAt: _statsComputedAt,
    ...stats
  } = computed.stats;
  const { computedAt: _magnitudeComputedAt, ...magnitude } = computed.magnitude;
  return { model, stats, magnitude };
}

const A5_MODELS = ['gbm', 'bootstrap', 'fattail'] as const;

export function orderedModelComparison(
  outcomes: ReadonlyMap<ShippedModelKey, ModelOutcome>,
  basis: Pick<SimParams, 'pathCount' | 'seed'>,
): Omit<ModelComparison, 'computedAt'> {
  const models = A5_MODELS.map((model) => outcomes.get(model));
  if (models.some((outcome) => outcome === undefined)) {
    throw new Error('orderedModelComparison: complete model set required');
  }
  return {
    models: models as readonly ModelOutcome[],
    pathCount: basis.pathCount,
    seed: basis.seed >>> 0,
  };
}
```

Keep `RegimeOutcome` in the additive contract for A6 consumers, but do not create a regime runner, calibration import, or fourth A5 result.

- [ ] **Step 4: Run the focused test**

Run the Step 2 commands again.

Expected: PASS; full stats and null values survive, derived timestamp/SWR fields do not, order is exact, and incomplete input throws.

- [ ] **Step 5: Commit**

```powershell
git add src/sim/frontier/types.ts src/sim/frontier/modelComparison.ts src/sim/frontier/modelComparison.test.mjs
git commit -m "feat: define additive frontier contracts"
```

### Task 2: Add `modelComparison` to `simStore` without changing A4

**Files:**
- Modify: `src/store/simStore.ts`
- Modify: `src/store/triStats.test.mjs`

**Interfaces:**
- Consumes: `ModelComparison` from `src/sim/frontier/types.ts`.
- Produces:

```ts
modelComparison: ModelComparison | null;
setModelComparison: (
  comparison: Omit<ModelComparison, 'computedAt'> | null,
) => void;
```

- [ ] **Step 1: Extend the failing store test**

Add a complete ordered comparison fixture and assert the store stamps one time only, preserves the supplied arrays, clears both A4/A5 artifacts on live parameter mutation, discrete model change, and mode change, and leaves `TriStats` shape unchanged:

```js
const before = Date.now();
useSimStore.getState().setModelComparison(comparison);
const landed = useSimStore.getState().modelComparison;
assert.ok(landed);
assert.deepEqual(landed.models, comparison.models);
assert.ok(landed.computedAt >= before);
assert.deepEqual(Object.keys(useSimStore.getState().triStats ?? triStats), [
  'successRates',
  'computedAt',
]);

useSimStore.getState().setParams({ withdrawal: initial.params.withdrawal + 100 });
assert.equal(useSimStore.getState().triStats, null);
assert.equal(useSimStore.getState().modelComparison, null);

useSimStore.getState().setModelComparison(comparison);
useSimStore.getState().setMode(
  useSimStore.getState().mode === 'gpu' ? 'cpu' : 'gpu',
);
assert.equal(useSimStore.getState().modelComparison, null);
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```powershell
npx esbuild src/store/triStats.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/triStats.test.bundle.mjs
node node_modules/.tmp/triStats.test.bundle.mjs
```

Expected: FAIL because `modelComparison` and `setModelComparison` are absent.

- [ ] **Step 3: Add the isolated store extension**

Import `ModelComparison` with `import type`. Add the field/action beside `triStats`, initialize it to `null`, and mirror every current `triStats: null` invalidation with `modelComparison: null`. Stamp once at the store boundary:

```ts
modelComparison: null,
setModelComparison: (modelComparison) =>
  set({
    modelComparison: modelComparison
      ? { ...modelComparison, computedAt: Date.now() }
      : null,
  }),
```

Do not edit the declarations of `SimParams`, `SimStats`, `TriStats`, their defaults, or `setTriStats`.

- [ ] **Step 4: Run store and legacy triangulation tests**

Run:

```powershell
node node_modules/.tmp/triStats.test.bundle.mjs
npm run test:triangulation
```

Expected: the extended store test passes and existing triangulation remains `5 + 5` passing checks.

- [ ] **Step 5: Commit**

```powershell
git add src/store/simStore.ts src/store/triStats.test.mjs
git commit -m "feat: store complete model outcomes"
```

### Task 3: Publish complete multi-stat outcomes in existing GPU and CPU pipelines

**Files:**
- Modify: `src/scene/SimDriver.tsx`
- Modify: `src/ui/useCpuSim.ts`
- Modify: `src/sim/frontier/modelComparison.test.mjs`

**Interfaces:**
- Consumes: `modelOutcome`, `orderedModelComparison`, existing `computeStats`, existing `secondaryModels`, and unchanged CPU worker result messages.
- Produces: atomic `modelComparison` publication after all three models, in addition to unchanged `triStats`.

- [ ] **Step 1: Add failing aggregation-boundary assertions**

Extend `modelComparison.test.mjs` with a small store-free harness that receives outcomes in selected-model-first order (`bootstrap`, `gbm`, `fattail`) and proves there is no ordered result until all three exist:

```js
const partial = new Map();
partial.set('bootstrap', bootstrap);
partial.set('gbm', gbm);
assert.throws(() => orderedModelComparison(partial, basis), /complete model set/i);
partial.set('fattail', fattail);
assert.deepEqual(
  orderedModelComparison(partial, basis).models.map(({ model }) => model),
  ['gbm', 'bootstrap', 'fattail'],
);
```

Also add a source guard:

```js
const frozenWorker = readFileSync(
  new URL('../../ui/cpuSim.worker.ts', import.meta.url),
  'utf8',
);
assert.doesNotMatch(frozenWorker, /modelComparison|frontier/i);
```

- [ ] **Step 2: Run the focused test**

Run the Task 1 test commands.

Expected: the aggregation assertions pass and establish the required publication boundary before wiring.

- [ ] **Step 3: Retain the full GPU `ComputedStats` values**

In `SimDriver`, keep the non-SWR primary `ComputedStats` object instead of immediately discarding its magnitude. In the existing `!preview && !withSafeWithdrawal` A4 block:

```ts
const outcomes = new Map<ShippedModelKey, ModelOutcome>();
outcomes.set(params.model, modelOutcome(params.model, primaryComputed));

for (const model of secondaryModels(params.model)) {
  const secondaryParams = { ...params, model };
  await runSimulation({ renderer, params: secondaryParams, bootstrapData, signal });
  const secondary = await computeStats(renderer, {
    params: secondaryParams,
    signal,
  });
  if (!isCurrent(myToken)) return;
  successRates[model] = secondary.stats.successRate;
  outcomes.set(model, modelOutcome(model, secondary));
}

await runSimulation({ renderer, params, bootstrapData, signal });
if (!isCurrent(myToken)) return;
setTriStats({ successRates, computedAt: 0 });
setModelComparison(orderedModelComparison(outcomes, params));
```

Do not move either setter before primary restoration. Do not publish comparison during preview or SWR work. Keep ordinary `stats`, `magnitudeStats`, snapshots, and hero-path semantics unchanged.

- [ ] **Step 4: Retain full CPU worker results**

In `useCpuSim`, require the already-present `magnitude` field before building an outcome:

```ts
function outcomeFromWorker(
  model: ShippedModelKey,
  result: CpuSimResultMessage,
): ModelOutcome {
  if (!result.magnitude) {
    throw new Error(`CPU ${model} result omitted magnitude statistics`);
  }
  return modelOutcome(model, {
    stats: result.stats,
    magnitude: result.magnitude,
  });
}
```

Collect the base and secondary messages in a map. After all three complete and the pipeline token is still current, call the existing `setTriStats` followed by `setModelComparison(orderedModelComparison(outcomes, params))`. A worker error, missing magnitude, or stale token reaches neither A5 setter.

- [ ] **Step 5: Run focused and static verification**

Run:

```powershell
npm run test:triangulation
npx esbuild src/sim/frontier/modelComparison.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/modelComparison.test.bundle.mjs
node node_modules/.tmp/modelComparison.test.bundle.mjs
npx tsc -b
npm run lint
```

Expected: all pass; existing A4 success rates still land only after restore, and A5 comparison contains every primary/secondary stat.

- [ ] **Step 6: Commit**

```powershell
git add src/scene/SimDriver.tsx src/ui/useCpuSim.ts src/sim/frontier/modelComparison.test.mjs
git commit -m "feat: publish complete three-model outcomes"
```

### Task 4: Pure measured-point spending-capacity search

**Files:**
- Create: `src/sim/frontier/capacity.ts`
- Create: `src/sim/frontier/capacity.test.mjs`

**Interfaces:**
- Consumes: `FrontierOutcome`, `SpendingCurvePoint`, `SpendingCapacity90`.
- Produces the approved signature:

```ts
export interface ComputeModelCapacityOptions {
  currentSpending: number;
  target: 0.9;
  tolerance: 0.005;
  maxBisections: 8;
  maxMonthlySpending: 100_000;
  signal?: AbortSignal;
  onProgress?: (completed: number) => void;
}

export async function computeModelCapacity(
  run: (
    monthlySpending: number,
    signal?: AbortSignal,
  ) => Promise<FrontierOutcome>,
  options: ComputeModelCapacityOptions,
): Promise<{
  outcome: FrontierOutcome;
  curve: SpendingCurvePoint[];
  capacity90: SpendingCapacity90;
}>;

export function capacityEvaluationBudget(
  options: Pick<
    ComputeModelCapacityOptions,
    'currentSpending' | 'maxBisections' | 'maxMonthlySpending'
  >,
): number;
```

- [ ] **Step 1: Write failing deterministic search tests**

Use a runner that records spending and returns `successRate = Math.max(0, 1 - spending / 50_000)`. Assert:

```js
assert.equal(calls[0], 5_000); // current outcome first
assert.equal(calls[1], 0);     // zero is measured
assert.equal(result.outcome.stats.successRate, 0.9);
assert.equal(result.capacity90.target, 0.9);
assert.equal(result.capacity90.tolerance, 0.005);
assert.ok(
  result.curve.some(
    (point) => point.monthlySpending === result.capacity90.monthlySpending,
  ),
);
assert.deepEqual(
  result.curve,
  [...result.curve].sort((a, b) => a.monthlySpending - b.monthlySpending),
);
assert.equal(
  new Set(result.curve.map(({ monthlySpending }) => monthlySpending)).size,
  result.curve.length,
);
assert.ok(result.capacity90.evaluations <= capacityEvaluationBudget(options));
```

Add separate runners/assertions for:

- zero below 90% => `infeasible-at-zero`, null capacity;
- every measured point through `$100_000` feasible => `unbounded-high`, null capacity, and `$100_000` was evaluated;
- no tolerance hit within eight bisections => `budget-exhausted` and highest measured feasible point;
- current spending `0` => zero evaluated exactly once;
- an already-aborted signal => zero runner calls and `AbortError`;
- abort during a runner promise => rejection occurs after the awaited run and no later evaluation;
- runner rejection => exact error propagates;
- non-finite/negative spending or invalid fixed A5 options => synchronous validation error before a runner call.

- [ ] **Step 2: Run the test and verify failure**

Run:

```powershell
npx esbuild src/sim/frontier/capacity.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/capacity.test.bundle.mjs
node node_modules/.tmp/capacity.test.bundle.mjs
```

Expected: FAIL because `capacity.ts` does not exist.

- [ ] **Step 3: Implement one cached evaluation path**

Use a `Map<number, FrontierOutcome>` so duplicate requested spending values do not re-run:

```ts
const evaluated = new Map<number, FrontierOutcome>();
let completed = 0;

const evaluate = async (monthlySpending: number): Promise<FrontierOutcome> => {
  const cached = evaluated.get(monthlySpending);
  if (cached) return cached;
  throwIfAborted(signal);
  const outcome = await run(monthlySpending, signal);
  throwIfAborted(signal);
  evaluated.set(monthlySpending, outcome);
  completed += 1;
  onProgress?.(completed);
  return outcome;
};
```

Evaluate current first and retain that exact outcome. Evaluate zero next. Generate high probes with:

```ts
let high = Math.min(
  Math.max(options.currentSpending * 2, 1_000),
  options.maxMonthlySpending,
);
while (true) {
  const highOutcome = await evaluate(high);
  if (highOutcome.stats.successRate < options.target) break;
  if (high === options.maxMonthlySpending) return unboundedResult();
  high = Math.min(high * 2, options.maxMonthlySpending);
}
```

Track the highest evaluated feasible spending and its rate. Bisect at most eight times. A tolerance hit may stop the search, but the returned capacity remains the tracked feasible point, never the infeasible candidate or an unevaluated midpoint. Return curve points from the map sorted by spending.

- [ ] **Step 4: Run the focused search tests**

Run the Step 2 commands again.

Expected: all search, status, abort, budget, sort, and dedup assertions pass.

- [ ] **Step 5: Commit**

```powershell
git add src/sim/frontier/capacity.ts src/sim/frontier/capacity.test.mjs
git commit -m "feat: compute measured spending capacity"
```

### Task 5: Sequential complete-frontier engine and monotonicity gate

**Files:**
- Create: `src/sim/frontier/computeFrontier.ts`
- Create: `src/sim/frontier/computeFrontier.test.mjs`

**Interfaces:**
- Consumes: `computeModelCapacity`, exact A5 model order, captured basis.
- Produces:

```ts
export interface FrontierModelRunner {
  model: ShippedModelKey;
  run: (
    monthlySpending: number,
    signal?: AbortSignal,
  ) => Promise<ModelOutcome>;
}

export interface FrontierProgress {
  completed: number;
  total: number;
  model: ShippedModelKey | null;
}

export interface ComputeRobustnessFrontierOptions {
  params: SimParams;
  analysisPathCount: SimParams['pathCount'];
  engine: 'gpu' | 'cpu';
  seed: number;
  signal?: AbortSignal;
  onProgress?: (progress: FrontierProgress) => void;
  now?: () => number;
}

export function assertMonotoneCurve(
  curve: readonly SpendingCurvePoint[],
  analysisPathCount: SimParams['pathCount'],
): void;

export async function computeRobustnessFrontier(
  runners: readonly FrontierModelRunner[],
  options: ComputeRobustnessFrontierOptions,
): Promise<RobustnessFrontier>;
```

- [ ] **Step 1: Write failing complete-engine tests**

Use threshold runners (`gbm: 6_000`, `bootstrap: 5_500`, `fattail: 5_750`) that append `start:model`/`end:model` events. Assert:

```js
assert.deepEqual(result.models.map(({ model }) => model), [
  'gbm',
  'bootstrap',
  'fattail',
]);
assert.deepEqual(events.filter((event) => event.startsWith('start:')), [
  'start:gbm',
  'start:bootstrap',
  'start:fattail',
]);
assert.equal(result.basis.analysisPathCount, 10_000);
assert.equal(result.basis.engine, 'cpu');
assert.equal(result.basis.seed, 42);
assert.deepEqual(result.basis.params, capturedParams);
assert.equal(result.computedAt, 1_234);
assert.equal(
  result.robustSpend,
  Math.min(...result.models.map(({ capacity90 }) => capacity90.monthlySpending)),
);
assert.deepEqual(
  await computeRobustnessFrontier(runners, { ...options, now: () => 1_234 }),
  result,
);
```

Add cases for:

- runners not in exact A5 order => reject before any run;
- a curve whose higher spend succeeds by more than `1 / analysisPathCount` above its predecessor => reject with both points in the message;
- a reversal of exactly one path => accepted;
- one runner rejection/abort => later models never start;
- all unbounded => `robustSpend: null`, `robustStatus: 'unbounded-high'`;
- any infeasible-at-zero => `robustSpend: null`, `robustStatus: 'infeasible-at-zero'`;
- a limiting budget-exhausted capacity => its measured capacity is the robust spend and robust status is `budget-exhausted`;
- progress model order and one fixed total for the whole run.

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx esbuild src/sim/frontier/computeFrontier.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/computeFrontier.test.bundle.mjs
node node_modules/.tmp/computeFrontier.test.bundle.mjs
```

Expected: FAIL because `computeFrontier.ts` does not exist.

- [ ] **Step 3: Implement sequential assembly**

Validate runner order against `['gbm', 'bootstrap', 'fattail']`. Clone the captured nested glidepath so the result cannot observe later mutation:

```ts
const capturedParams: SimParams = {
  ...options.params,
  glidepath: options.params.glidepath
    ? { ...options.params.glidepath }
    : null,
};
```

For each runner, call `computeModelCapacity` with fixed A5 values and `currentSpending: capturedParams.withdrawal`. Convert its local completed count into global progress. After each model returns, call:

```ts
assertMonotoneCurve(modelResult.curve, options.analysisPathCount);
```

The monotonicity check sorts a copy and rejects only when:

```ts
next.successRate - previous.successRate > 1 / analysisPathCount;
```

Do not expose any partial `RobustnessFrontier`. Derive robust status in this order:

1. any `infeasible-at-zero` => null / infeasible;
2. all capacities null and all unbounded => null / unbounded;
3. otherwise take the minimum non-null measured capacity;
4. among models tied at that minimum, `budget-exhausted` outranks `converged`;
5. stamp `computedAt` from `now()` only after every model succeeds.

- [ ] **Step 4: Run pure frontier tests**

Run Task 4 and Task 5 test commands.

Expected: both suites pass, including exact repeat and monotonicity rejection.

- [ ] **Step 5: Commit**

```powershell
git add src/sim/frontier/computeFrontier.ts src/sim/frontier/computeFrontier.test.mjs
git commit -m "feat: assemble complete robustness frontiers"
```

### Task 6: Dedicated frontier lifecycle store and committed-input invalidation

**Files:**
- Create: `src/store/frontierStore.ts`
- Create: `src/store/frontierStore.test.mjs`
- Modify: `src/store/simStore.ts`

**Interfaces:**
- Consumes: `FrontierModelKey`, `RobustnessFrontier`; `simStore` committed actions call only the clearer.
- Produces:

```ts
export type AdvisorLens = 'futures' | 'frontier' | 'gauntlet';
export type FrontierStatus = 'idle' | 'running' | 'complete' | 'error';

export interface FrontierState {
  advisorLens: AdvisorLens;
  status: FrontierStatus;
  progress: {
    completed: number;
    total: number;
    model: FrontierModelKey | null;
  };
  result: RobustnessFrontier | null;
  error: string | null;
  setAdvisorLens: (advisorLens: AdvisorLens) => void;
  begin: (total: number) => void;
  setProgress: (progress: FrontierState['progress']) => void;
  complete: (result: RobustnessFrontier) => void;
  fail: (error: string) => void;
  clear: () => void;
}

export const useFrontierStore: UseBoundStore<StoreApi<FrontierState>>;
```

- [ ] **Step 1: Write failing store lifecycle tests**

Assert:

```js
assert.equal(initial.advisorLens, 'futures');
assert.equal(initial.status, 'idle');
initial.setAdvisorLens('frontier');
assert.equal(useFrontierStore.getState().status, 'idle'); // lens switch does not run

useFrontierStore.getState().begin(54);
assert.deepEqual(useFrontierStore.getState().progress, {
  completed: 0,
  total: 54,
  model: null,
});
useFrontierStore.getState().setProgress({
  completed: 7,
  total: 54,
  model: 'gbm',
});
useFrontierStore.getState().complete(frontier);
assert.equal(useFrontierStore.getState().status, 'complete');
assert.equal(useFrontierStore.getState().result, frontier);
assert.equal(useFrontierStore.getState().result.computedAt, frontier.computedAt);

useFrontierStore.getState().fail('restore failed');
assert.equal(useFrontierStore.getState().result, null);
assert.equal(useFrontierStore.getState().error, 'restore failed');
useFrontierStore.getState().clear();
assert.equal(useFrontierStore.getState().advisorLens, 'frontier');
assert.equal(useFrontierStore.getState().status, 'idle');
```

Seed a complete frontier, call `setParams` without waiting 150 ms, and assert it remains until committed params change. Then call `commitParams` and assert it clears. Repeat for `setModel` and an actual mode change.

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx esbuild src/store/frontierStore.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/frontierStore.test.bundle.mjs
node node_modules/.tmp/frontierStore.test.bundle.mjs
```

Expected: FAIL because `frontierStore.ts` does not exist.

- [ ] **Step 3: Implement setter-only lifecycle**

Use exact state replacements:

```ts
begin: (total) =>
  set({
    status: 'running',
    progress: { completed: 0, total, model: null },
    result: null,
    error: null,
  }),
complete: (result) =>
  set({
    status: 'complete',
    result,
    error: null,
    progress: { completed: 0, total: 0, model: null },
  }),
fail: (error) =>
  set({
    status: 'error',
    result: null,
    error,
    progress: { completed: 0, total: 0, model: null },
  }),
clear: () =>
  set({
    status: 'idle',
    result: null,
    error: null,
    progress: { completed: 0, total: 0, model: null },
  }),
```

Do not stamp or alter `result`; the pure engine owns its deterministic timestamp.

- [ ] **Step 4: Wire only committed invalidation**

In `simStore.ts`, import `useFrontierStore` and call `clear()`:

- after the scheduled timer actually advances `committedParams`;
- in `applyNow`;
- when `commitParams` actually advances;
- when `setMode` receives a different mode.

Do not call it from the immediate live `setParams` write. Store actions perform no financial computation and do not dispatch frontier work.

- [ ] **Step 5: Run focused store tests**

Run:

```powershell
node node_modules/.tmp/frontierStore.test.bundle.mjs
npm run test:triangulation
npx tsc -b
```

Expected: all pass; live movement alone retains the last artifact, while every committed/mode change clears it.

- [ ] **Step 6: Commit**

```powershell
git add src/store/frontierStore.ts src/store/frontierStore.test.mjs src/store/simStore.ts
git commit -m "feat: add dedicated frontier lifecycle store"
```

### Task 7: Store-free GPU adapter with mandatory restore

**Files:**
- Create: `src/sim/frontier/gpuFrontier.ts`
- Create: `src/sim/frontier/gpuFrontier.test.mjs`

**Interfaces:**
- Consumes: `computeRobustnessFrontier`, captured committed params, and injected existing GPU operations.
- Produces:

```ts
export interface GpuFrontierDependencies {
  runSimulation: (params: SimParams, signal?: AbortSignal) => Promise<void>;
  readOutcome: (
    params: SimParams,
    signal?: AbortSignal,
  ) => Promise<ModelOutcome>;
  now?: () => number;
}

export interface RunGpuFrontierOptions {
  params: SimParams;
  signal?: AbortSignal;
  onProgress?: (progress: FrontierProgress) => void;
}

export async function runGpuRobustnessFrontier(
  dependencies: GpuFrontierDependencies,
  options: RunGpuFrontierOptions,
): Promise<RobustnessFrontier>;
```

- [ ] **Step 1: Write failing adapter tests with injected mocks**

Create a mock success curve per model and log every `run`, `read`, and `restore`. Assert:

```js
assert.deepEqual(
  firstEvaluationByModel,
  ['gbm', 'bootstrap', 'fattail'],
);
assert.ok(log.every((entry) => entry.kind !== 'store-write'));
assert.deepEqual(log.at(-1), {
  kind: 'run',
  model: captured.model,
  spending: captured.withdrawal,
  paths: captured.pathCount,
  restore: true,
});
assert.equal(result.basis.analysisPathCount, 100_000);
assert.equal(result.basis.engine, 'gpu');
```

Add cases:

- adapter candidate params always use `pathCount: 100_000`, captured seed, candidate model, and candidate withdrawal;
- owned abort during an awaited candidate rejects `AbortError` and performs no captured-primary restore;
- non-abort candidate/read error attempts exactly one restore with captured original params, then rethrows the original error;
- successful computation followed by restore rejection rejects and returns no result;
- non-abort error plus restore rejection throws an `AggregateError` containing both failures;
- progress is forwarded but no store module is imported.

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx esbuild src/sim/frontier/gpuFrontier.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/gpuFrontier.test.bundle.mjs
node node_modules/.tmp/gpuFrontier.test.bundle.mjs
```

Expected: FAIL because `gpuFrontier.ts` does not exist.

- [ ] **Step 3: Implement adapter-owned restoration**

Construct runner params as:

```ts
const analysisParams: SimParams = {
  ...captured,
  model,
  withdrawal: monthlySpending,
  pathCount: 100_000,
  seed: captured.seed,
};
```

Each runner awaits injected `runSimulation`, checks abort through the pure engine, then awaits `readOutcome`. After the complete engine returns, restore:

```ts
await dependencies.runSimulation(captured);
```

Track whether a restore was already attempted. In `catch`, if `signal?.aborted`, rethrow without restore because the newer normal pipeline owns the shared device. Otherwise attempt the captured restore once. If it also fails, throw `new AggregateError([originalError, restoreError], 'GPU frontier failed and primary restore failed')`. Never import either Zustand store.

- [ ] **Step 4: Run adapter and pure-engine tests**

Run:

```powershell
node node_modules/.tmp/gpuFrontier.test.bundle.mjs
node node_modules/.tmp/computeFrontier.test.bundle.mjs
```

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add src/sim/frontier/gpuFrontier.ts src/sim/frontier/gpuFrontier.test.mjs
git commit -m "feat: adapt frontier search to shared GPU buffers"
```

### Task 8: Explicit GPU runtime, cancellation ownership, and publication

**Files:**
- Modify: `src/scene/simRuntime.ts`
- Modify: `src/scene/SimDriver.tsx`
- Modify: `src/sim/frontier/gpuFrontier.test.mjs`

**Interfaces:**
- Consumes: `runGpuRobustnessFrontier`, `useFrontierStore`, existing renderer/bootstrap data, `runSimulation`, `computeStats`, `modelOutcome`.
- Produces:

```ts
export interface SimRuntime {
  requestSafeWithdrawal: (() => void) | null;
  requestRobustnessFrontier: (() => void) | null;
}
```

- [ ] **Step 1: Add a failing runtime-source assertion**

Extend `gpuFrontier.test.mjs` to read `simRuntime.ts` and assert:

```js
assert.match(runtimeSource, /requestRobustnessFrontier/);
assert.match(runtimeSource, /requestSafeWithdrawal/);
```

Run the focused test.

Expected: FAIL on the absent frontier action.

- [ ] **Step 2: Add the nullable runtime action**

Implement:

```ts
export const simRuntime: SimRuntime = {
  requestSafeWithdrawal: null,
  requestRobustnessFrontier: null,
};
```

No call occurs merely because this property becomes non-null.

- [ ] **Step 3: Wire the GPU request inside `SimDriver`**

Maintain a frontier-specific controller/token separate from the normal pipeline:

```ts
let frontierController: AbortController | null = null;
let frontierToken = 0;

const requestRobustnessFrontier = () => {
  const captured = useSimStore.getState().committedParams;
  frontierController?.abort();
  frontierController = new AbortController();
  const signal = frontierController.signal;
  const myFrontierToken = ++frontierToken;
  const frontierStore = useFrontierStore.getState();
  frontierStore.begin(frontierEvaluationBudgetForThreeModels(captured.withdrawal));
  void runGpuRobustnessFrontier(
    {
      runSimulation: async (params, runSignal) => {
        await runSimulation({
          renderer,
          params,
          bootstrapData,
          signal: runSignal,
        });
      },
      readOutcome: async (params, readSignal) =>
        modelOutcome(
          params.model,
          await computeStats(renderer, { params, signal: readSignal }),
        ),
    },
    {
      params: captured,
      signal,
      onProgress: (progress) =>
        useFrontierStore.getState().setProgress(progress),
    },
  )
    .then((result) => {
      const current = useSimStore.getState();
      if (
        signal.aborted ||
        myFrontierToken !== frontierToken ||
        current.mode !== 'gpu' ||
        current.committedParams !== captured
      ) {
        return;
      }
      useFrontierStore.getState().complete(result);
    })
    .catch((error: unknown) => {
      if (signal.aborted || myFrontierToken !== frontierToken) return;
      useFrontierStore
        .getState()
        .fail(error instanceof Error ? error.message : String(error));
    });
};
```

Export a `frontierEvaluationBudgetForThreeModels(currentSpending)` helper from `computeFrontier.ts` rather than duplicating budget math in React/runtime code.

- [ ] **Step 4: Make the normal pipeline the abort owner**

At the start of every full/preview/SWR `runPipeline`, abort and invalidate frontier work before touching shared buffers:

```ts
frontierController?.abort();
frontierController = null;
frontierToken += 1;
```

Committed input/mode actions already clear the store in Task 6. Preview work aborts an active frontier because both use shared GPU buffers, but it does not independently clear a previously complete current artifact.

On effect cleanup, abort frontier, null both runtime actions only if they still point at this effect's functions, and do not attempt a stale restore.

- [ ] **Step 5: Run focused and static checks**

Run:

```powershell
npx esbuild src/sim/frontier/gpuFrontier.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/gpuFrontier.test.bundle.mjs
node node_modules/.tmp/gpuFrontier.test.bundle.mjs
npx tsc -b
npm run lint
```

Expected: all pass; the explicit action is registered only in GPU mode, the normal pipeline supersedes it, and completion publishes only after restore.

- [ ] **Step 6: Commit**

```powershell
git add src/scene/simRuntime.ts src/scene/SimDriver.tsx src/sim/frontier/gpuFrontier.test.mjs
git commit -m "feat: expose cancellable GPU frontier runtime"
```

### Task 9: Dedicated whole-frontier CPU worker

**Files:**
- Create: `src/sim/frontier/cpuFrontier.ts`
- Create: `src/ui/frontier.worker.ts`
- Create: `src/sim/frontier/frontierWorkerClient.ts`
- Create: `src/sim/frontier/frontierWorkerClient.test.mjs`

**Interfaces:**
- Consumes: existing `runCpuSim`, pure frontier engine, captured bootstrap equity/bond arrays.
- Produces:

```ts
export interface CpuFrontierRequest {
  type: 'compute-frontier';
  token: number;
  params: SimParams;
  analysisPathCount: 10_000;
  bootstrapBlocks: ArrayBuffer;
  bondBlocks: ArrayBuffer | null;
}

export interface CpuFrontierResultMessage {
  type: 'frontier-result';
  token: number;
  result: RobustnessFrontier;
}

export interface CpuFrontierErrorMessage {
  type: 'frontier-error';
  token: number;
  message: string;
}

export type CpuFrontierResponse =
  | CpuFrontierResultMessage
  | CpuFrontierErrorMessage;

export async function computeCpuFrontier(
  request: Readonly<CpuFrontierRequest>,
  now?: () => number,
): Promise<RobustnessFrontier>;

export interface WorkerLike {
  onmessage: ((event: MessageEvent<CpuFrontierResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: CpuFrontierRequest, transfer: Transferable[]): void;
  terminate(): void;
}

export class FrontierWorkerClient {
  constructor(workerFactory: () => WorkerLike);
  run(
    request: Omit<CpuFrontierRequest, 'token'>,
    transfer: Transferable[],
  ): Promise<RobustnessFrontier>;
  cancel(): void;
  dispose(): void;
}
```

- [ ] **Step 1: Write failing worker-client tests**

Use fake workers that retain callbacks even after termination. Assert:

```js
const first = client.run(firstRequest, firstTransfers);
const firstWorker = workers[0];
const second = client.run(secondRequest, secondTransfers);
assert.equal(firstWorker.terminateCalls, 1);
await assert.rejects(first, (error) => error.name === 'AbortError');

firstWorker.emitResult(staleResult);
assert.equal(secondSettled, false);
workers[1].emitResult(currentResult);
assert.equal(await second, currentResult);

const third = client.run(thirdRequest, thirdTransfers);
workers[2].emitError('CPU frontier failed');
await assert.rejects(third, /CPU frontier failed/);

client.dispose();
assert.equal(workers[2].terminateCalls, 1);
await assert.rejects(
  client.run(thirdRequest, thirdTransfers),
  /disposed/i,
);
```

Read `src/ui/cpuSim.worker.ts` and assert it contains `type: 'run'` but no `compute-frontier`.

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx esbuild src/sim/frontier/frontierWorkerClient.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/frontierWorkerClient.test.bundle.mjs
node node_modules/.tmp/frontierWorkerClient.test.bundle.mjs
```

Expected: FAIL because the dedicated client/worker types do not exist.

- [ ] **Step 3: Implement the CPU computation module**

Validate `analysisPathCount === 10_000`. Create one immutable params snapshot and three runners. Each runner calls:

```ts
const simulation = runCpuSim(
  {
    ...capturedParams,
    model,
    withdrawal: monthlySpending,
    pathCount: request.analysisPathCount,
    seed: capturedParams.seed,
  },
  {
    bootstrapData:
      model === 'bootstrap' ? new Float32Array(request.bootstrapBlocks) : null,
    bondBlocks:
      model === 'bootstrap' && request.bondBlocks
        ? new Float32Array(request.bondBlocks)
        : null,
    now,
  },
);
return modelOutcome(model, {
  stats: simulation.stats,
  magnitude: simulation.magnitude,
});
```

Call `computeRobustnessFrontier` with engine `cpu`. Do not return terminal-wealth, drawdown, failure-step, or history arrays.

- [ ] **Step 4: Implement the dedicated worker**

`frontier.worker.ts` handles only `compute-frontier`, awaits the entire CPU computation, and posts exactly one result or error:

```ts
scope.onmessage = (event) => {
  const request = event.data;
  if (!request || request.type !== 'compute-frontier') return;
  void computeCpuFrontier(request)
    .then((result) => {
      scope.postMessage({
        type: 'frontier-result',
        token: request.token,
        result,
      });
    })
    .catch((error: unknown) => {
      scope.postMessage({
        type: 'frontier-error',
        token: request.token,
        message: error instanceof Error ? error.message : String(error),
      });
    });
};
```

Do not import or edit `cpuSim.worker.ts`.

- [ ] **Step 5: Implement terminate/recreate semantics**

Before every `run`, reject the previous pending promise with an `AbortError`, terminate its worker, increment the token, create a fresh worker, and transfer the request-owned array buffers. Resolve only when both worker identity and token match. On completion/error, terminate that worker. `cancel` performs the same abort/terminate without creating a replacement.

- [ ] **Step 6: Run focused tests and static checks**

Run:

```powershell
node node_modules/.tmp/frontierWorkerClient.test.bundle.mjs
npx tsc -b
npm run lint
```

Expected: all pass; old worker protocol source remains untouched.

- [ ] **Step 7: Commit**

```powershell
git add src/sim/frontier/cpuFrontier.ts src/ui/frontier.worker.ts src/sim/frontier/frontierWorkerClient.ts src/sim/frontier/frontierWorkerClient.test.mjs
git commit -m "feat: compute frontiers in a dedicated CPU worker"
```

### Task 10: Register CPU runtime and suppress stale publication

**Files:**
- Modify: `src/ui/useCpuSim.ts`
- Modify: `src/sim/frontier/frontierWorkerClient.test.mjs`

**Interfaces:**
- Consumes: `FrontierWorkerClient`, `useFrontierStore`, `simRuntime`, parsed bootstrap data.
- Produces: CPU implementation of the same no-argument `requestRobustnessFrontier`.

- [ ] **Step 1: Add a failing runtime contract assertion**

Extend the client test to read `useCpuSim.ts` and assert it references:

```js
assert.match(cpuRuntimeSource, /FrontierWorkerClient/);
assert.match(cpuRuntimeSource, /requestRobustnessFrontier/);
assert.match(cpuRuntimeSource, /frontier\.worker\.ts/);
```

Run the focused test.

Expected: FAIL because CPU runtime wiring is absent.

- [ ] **Step 2: Create one client per CPU-mode effect**

Inside the existing `mode === 'cpu'` effect:

```ts
const frontierClient = new FrontierWorkerClient(
  () =>
    new Worker(new URL('./frontier.worker.ts', import.meta.url), {
      type: 'module',
    }),
);
let frontierRequestToken = 0;
```

The request action captures `committedParams`, requires parsed bootstrap data because every A5 frontier includes bootstrap, copies both arrays once for the one immutable worker request, begins progress with the exact pure budget, and calls:

```ts
frontierClient.run(
  {
    type: 'compute-frontier',
    params: captured,
    analysisPathCount: 10_000,
    bootstrapBlocks,
    bondBlocks,
  },
  bondBlocks
    ? [bootstrapBlocks, bondBlocks]
    : [bootstrapBlocks],
);
```

On resolution, commit only when the local request token, mode, and `committedParams` identity still match. On an owned abort, do not set error. On other errors, call `frontierStore.fail`.

- [ ] **Step 3: Supersede from the normal CPU pipeline**

At the beginning of existing `runPipeline(params)`:

```ts
frontierRequestToken += 1;
frontierClient.cancel();
```

Committed parameter/mode actions clear the artifact through Task 6. This worker termination prevents a stale synchronous frontier from occupying a queue or publishing later.

Register `simRuntime.requestRobustnessFrontier` only while CPU mode is active. Cleanup cancels/disposes the client and nulls the action only when it still equals this effect's function.

- [ ] **Step 4: Run focused, legacy, and static checks**

Run:

```powershell
npx esbuild src/sim/frontier/frontierWorkerClient.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/frontierWorkerClient.test.bundle.mjs
node node_modules/.tmp/frontierWorkerClient.test.bundle.mjs
npm run test:triangulation
npx tsc -b
npm run lint
```

Expected: all pass; CPU triangulation still uses the frozen original worker, while frontier uses only the dedicated worker.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/useCpuSim.ts src/sim/frontier/frontierWorkerClient.test.mjs
git commit -m "feat: expose cancellable CPU frontier runtime"
```

### Task 11: Fixed-seed frontier validation and focused scripts

**Files:**
- Create: `src/validation/frontierValidate.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: real `historicalReturns.json`, `parseBootstrapBlocksFile`, `runCpuSim`, `computeRobustnessFrontier`.
- Produces: reproducible `test:frontier` and `test:frontier-validate` commands plus machine-readable measured output.

- [ ] **Step 1: Write the validation program with assertions before adding scripts**

Use:

```ts
const params: SimParams = {
  ...DEFAULT_SIM_PARAMS,
  model: 'bootstrap',
  pathCount: 10_000,
  seed: 42,
};
const NOW = () => 1_722_000_000_000;
```

Build the same three CPU runners used by the worker and execute twice. Assert deep equality, exact model order, engine/path count/seed basis, per-model monotonicity, and:

```ts
for (const modelResult of first.models) {
  const { capacity90, curve } = modelResult;
  if (
    capacity90.status === 'unbounded-high' ||
    capacity90.status === 'budget-exhausted'
  ) {
    continue;
  }
  if (capacity90.status !== 'converged' || capacity90.monthlySpending === null) {
    throw new Error(
      `frontier validation expected converged capacity for ${modelResult.model}`,
    );
  }
  const measured = curve.find(
    (point) => point.monthlySpending === capacity90.monthlySpending,
  );
  if (!measured) {
    throw new Error(`${modelResult.model} capacity is not an evaluated point`);
  }
  const rerun = await runnersByModel
    .get(modelResult.model)
    ?.run(capacity90.monthlySpending);
  if (!rerun || Math.abs(rerun.stats.successRate - 0.9) > 0.005) {
    throw new Error(`${modelResult.model} capacity rerun is outside 90% ±0.5%`);
  }
}
```

Print one JSON object containing date, engine, path count, seed, params, every capacity/status/evaluation count, robust spend/status, and elapsed milliseconds. Do not encode expected capacity dollars in source.

- [ ] **Step 2: Run the program directly**

Run:

```powershell
npx esbuild src/validation/frontierValidate.ts --bundle --platform=node --format=esm --outfile=node_modules/.tmp/frontierValidate.bundle.mjs
node node_modules/.tmp/frontierValidate.bundle.mjs
```

Expected: PASS, two runs match exactly, every converged capacity is an evaluated point and re-runs within `90% ±0.5%`, and measured JSON is printed. Record the actual elapsed time; the approved design expects approximately 15–17 seconds but the test must not assert wall time.

- [ ] **Step 3: Add the focused package scripts**

Set `test:frontier` to bundle/run, in order:

1. `modelComparison.test.mjs`
2. `capacity.test.mjs`
3. `computeFrontier.test.mjs`
4. `frontierStore.test.mjs`
5. `gpuFrontier.test.mjs`
6. `frontierWorkerClient.test.mjs`

Set:

```json
"test:frontier-validate": "esbuild src/validation/frontierValidate.ts --bundle --platform=node --format=esm --outfile=node_modules/.tmp/frontierValidate.bundle.mjs && node node_modules/.tmp/frontierValidate.bundle.mjs"
```

Use the repository's existing esbuild-and-node convention and PowerShell-compatible `&&`; do not add a Unix-only shell script.

- [ ] **Step 4: Run focused A5 verification**

Run:

```powershell
npm run test:frontier
npm run test:frontier-validate
npx tsc -b
npm run lint
```

Expected: all pass; record exact assertion counts and measured validation JSON in the implementation handoff.

- [ ] **Step 5: Commit**

```powershell
git add src/validation/frontierValidate.ts package.json
git commit -m "test: validate deterministic spending frontiers"
```

### Task 12: Cross-platform production compute probe

**Files:**
- Create: `probe/run-compute-probe.mjs`
- Modify: `probe/compute-probe.js`
- Modify: `probe/launcherPaths.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the real production `computeInit`, `computeStep`, and three stats node builders already imported by `probe/compute-probe.js`; shared portable helpers from `probe/launcherPaths.mjs`.
- Produces: `npm run test:compute-probe`.

- [ ] **Step 1: Add failing launcher-path coverage**

Extend `launcherPaths.test.mjs` to assert `systemChromiumCandidates('win32')` and the environment override contract used by the new runner. Windows may have no hard-coded candidate; `CHROMIUM_PATH` and Playwright's executable remain supported:

```js
assert.deepEqual(systemChromiumCandidates('win32'), []);
assert.equal(
  resolveChromiumExecutable({
    environmentPath: 'C:\\Browser\\chrome.exe',
    systemCandidates: [],
    playwrightPath: 'C:\\Playwright\\chrome.exe',
    existsSync: (candidate) => candidate === 'C:\\Browser\\chrome.exe',
  }),
  'C:\\Browser\\chrome.exe',
);
```

- [ ] **Step 2: Run launcher tests**

Run:

```powershell
npm run test:probe-launcher
```

Expected: PASS with the expanded portable assertions.

- [ ] **Step 3: Make compute checks structured and awaited**

In `compute-probe.js`, keep importing the real production builders. For each graph:

```js
await device.pushErrorScope('validation');
await renderer.computeAsync(node);
const gpuError = await device.popErrorScope();
window.__probe.checks[name] = gpuError ? gpuError.message : 'passed';
```

Initialize:

```js
window.__probe = { done: false, checks: {}, errors: [] };
```

Treat thrown errors, validation errors, uncaptured errors, and unhandled rejections as probe errors. The page sets `done = true` only after every real graph has compiled/dispatched.

- [ ] **Step 4: Implement the portable launcher**

Follow `run-viz5-probe.mjs`:

- resolve root with `projectRootFromModuleUrl(import.meta.url)`;
- resolve Chromium with `CHROMIUM_PATH`, `systemChromiumCandidates()`, then Playwright;
- spawn Vite directly through `process.execPath` and `node_modules/vite/bin/vite.js`;
- use a distinct strict port;
- poll `http://127.0.0.1:<port>/probe/compute-probe.html`;
- launch headless Chromium with existing SwiftShader flags;
- wait up to 60 seconds for `window.__probe.done`;
- print checks/errors/page-log tail;
- exit `0` only when all five checks equal `passed` and errors are empty;
- always kill the Vite child in `finally`.

Do not use raw URL `.pathname`, `/usr/bin/chromium` as the only path, `npx vite`, or an orphanable shell wrapper.

- [ ] **Step 5: Add and run the package command**

Add:

```json
"test:compute-probe": "node probe/run-compute-probe.mjs"
```

Run:

```powershell
npm run test:probe-launcher
npm run test:compute-probe
```

Expected: launcher tests pass; the real init, step, clear, reduce, and histogram graphs each report `passed` through WebGPU validation/Tint with zero probe errors. If SwiftShader loses the device, record it as an environmental limitation rather than a passing compile.

- [ ] **Step 6: Commit**

```powershell
git add probe/run-compute-probe.mjs probe/compute-probe.js probe/launcherPaths.test.mjs package.json
git commit -m "test: launch production compute probe portably"
```

### Task 13: Amendment A5 contract, measured report, and full compatibility gate

**Files:**
- Create: `docs/AMENDMENT_A5_ROBUSTNESS_FRONTIER.md`
- Modify: `docs/CONTRACTS.md`
- Modify: `docs/CONTRACTS_STATS.md`
- Modify: `docs/DECISIONS.md`
- Modify: `validation/REPORT.md`
- Modify: `MEMORY.md`

**Interfaces:**
- Consumes: landed code signatures and actual Task 11/12 command output.
- Produces: durable A5 core contract and measured handoff; the later experience plan extends the same amendment with presentation semantics.

- [ ] **Step 1: Write the canonical additive amendment**

Document these exact sections in `docs/AMENDMENT_A5_ROBUSTNESS_FRONTIER.md`:

1. authorization: approved robustness-frontier design, 2026-07-26;
2. compatibility table explicitly marking `SimParams`, `SimStats`, `TriStats`, model IDs, buffers, core operation order, `runSimulation`, `runCpuSim`, and `cpuSim.worker.ts` protocol unchanged;
3. exact TypeScript interfaces from Task 1;
4. exact A5 model order and 100k GPU / 10k CPU analysis counts;
5. measured-point search, all four statuses, abort checks before/after awaits, eight bisections, `$100_000` cap, and one-path monotonicity allowance;
6. complete-set atomic publication and robust-spend derivation;
7. explicit runtime trigger and committed-input invalidation;
8. GPU shared-buffer restore/error/owned-abort behavior;
9. dedicated CPU worker termination/stale-token contract;
10. test commands and physical-GPU performance limitation.

State that `RegimeOutcome` is an additive type seam only and has no A5 runtime producer.

- [ ] **Step 2: Add short links without rewriting frozen sections**

Append one A5 link paragraph to both contract documents:

```md
## Amendment A5 — Robustness Frontier core

The additive multi-stat comparison, measured spending-capacity search,
dedicated frontier store/worker, and GPU restoration contract are specified in
[AMENDMENT_A5_ROBUSTNESS_FRONTIER.md](AMENDMENT_A5_ROBUSTNESS_FRONTIER.md).
Frozen `SimParams`, `SimStats`, `TriStats`, buffers, model IDs, operation order,
and the existing CPU worker protocol remain unchanged.
```

- [ ] **Step 3: Record approved decisions**

Append decisions for:

- pure injected frontier search with evaluated points only;
- explicit action rather than lens-open/parameter-change trigger;
- dedicated `frontierStore`;
- sequential shared-buffer GPU work with mandatory selected-primary restore;
- dedicated whole-frontier CPU worker terminated on supersede;
- model ordering and analysis path-count policy.

Keep execution status out of `docs/DECISIONS.md`.

- [ ] **Step 4: Capture measured validation evidence**

Run:

```powershell
npm run test:frontier-validate
npm run test:compute-probe
```

Append the exact emitted seed-42 capacities, statuses, evaluation counts, robust spend/status, CPU elapsed time, date, and command to `validation/REPORT.md`. State:

> Physical-GPU frontier wall time is unmeasured; the SwiftShader compute probe validates production graph compilation and binding correctness, not hardware performance.

Do not copy the design's approximate 15–17 second estimate as a measurement. Do not add demo/client numbers in this core task.

- [ ] **Step 5: Run frozen-surface diff checks**

Run:

```powershell
git diff --exit-code 56350f8 -- src/ui/cpuSim.worker.ts src/sim/fallback/cpuSim.ts src/sim/runSimulation.ts src/sim/kernels/initPaths.tsl.ts src/sim/kernels/stepPaths.tsl.ts src/sim/buffers.ts
```

Expected: no diff. Then inspect:

```powershell
git diff 56350f8 -- src/store/simStore.ts
```

Expected: only additive `modelComparison`, its setter/invalidation, the frontier clearer import/calls, and no changes inside the frozen `SimParams`, `SimStats`, or `TriStats` declarations.

- [ ] **Step 6: Run the complete A5 plus legacy gate**

Run:

```powershell
npm run test:frontier
npm run test:frontier-validate
npm run test:compute-probe
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

Expected: every command passes. The legacy CPU golden vectors, stats, gauntlet, and A4 triangulation counts remain unchanged; both the focused compute probe and existing full production-node probe report zero errors. Do not claim a green full gate if any command is skipped or environmentally blocked.

- [ ] **Step 7: Update memory from actual evidence**

Add an A5 core entry to `MEMORY.md` with the real commit range, exact focused/full command results, measured seed/path/date convention, compute-probe result, frozen surfaces explicitly untouched, physical-GPU limitation, and next action:

> Implement the A5 experience plan, then begin Amendment A6 only after A5 is green.

- [ ] **Step 8: Commit**

```powershell
git add docs/AMENDMENT_A5_ROBUSTNESS_FRONTIER.md docs/CONTRACTS.md docs/CONTRACTS_STATS.md docs/DECISIONS.md validation/REPORT.md MEMORY.md
git commit -m "docs: freeze robustness frontier core contract"
```

## Plan Completion Check

- `ModelComparison` contains all three full outcome/magnitude records in `gbm`, `bootstrap`, `fattail` order and stamps only after complete A4 work.
- The pure capacity engine measures current and zero, power-of-two brackets to `$100_000`, bisects no more than eight times, returns only evaluated capacity points, sorts/deduplicates curves, and aborts around every awaited runner call.
- The complete engine runs models sequentially, rejects reversals greater than one path, and never exposes partial results.
- GPU success publishes only after selected-primary restoration; owned abort skips stale restore; non-abort failures attempt restore; restore failure publishes nothing.
- CPU frontier uses `frontier.worker.ts`, terminates/recreates on supersede, and stale tokens cannot commit.
- Committed params and mode changes clear the frontier; live slider movement never starts it.
- `simRuntime.requestRobustnessFrontier` is explicit and nullable in both modes.
- `npm run test:frontier`, `npm run test:frontier-validate`, and `npm run test:compute-probe` exist and pass.
- The full legacy gate passes, and the approved-base diff proves frozen kernel/worker files unchanged.
- A5 documentation contains actual measured CPU evidence and no physical-GPU performance claim.
- No React chart, advisor-lens component, client copy, CSS, or Regime-t runtime/calibration work appears in this plan.
