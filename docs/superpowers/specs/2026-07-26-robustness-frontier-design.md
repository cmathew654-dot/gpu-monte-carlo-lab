# Robustness Frontier Design

**Status:** Approved for implementation  
**Owner:** Cyril  
**Date:** 2026-07-26  
**Base:** `56350f8`  
**Goal:** Replace a saturated success-rate comparison with a decision surface that shows how outcomes, spending capacity, and persistent market regimes change the conclusion.

## 1. Product question

The current three-model result can be mathematically correct and still be uninformative. With no withdrawals, every shipped return process has positive gross wealth multipliers and therefore reports 100% success. With long horizons, GBM and Student-t(5) also converge toward similar ruin rates because both are stationary, independent-month models with the same mean and variance.

The product must answer a stronger question:

> What level of real spending remains acceptable when the return model and the starting market regime are plausibly wrong?

The answer is not another point estimate. It is a robustness frontier:

1. Compare more than success probability at the current plan.
2. Trace success against real monthly spending for every included model.
3. Identify the lowest model-specific 90% spending capacity.
4. Add one orthogonal regime model that introduces persistent market states and changing stock–bond diversification.

The interface must teach three different uncertainties without conflating them:

- **Within a curve:** simulated path variation conditional on one model.
- **Between curves:** structural/model-assumption uncertainty.
- **Along the spending axis:** decision sensitivity.

The spending sweep is sensitivity analysis, not parameter uncertainty. No confidence band may appear unless a sampling interval is actually computed.

## 2. Measured diagnosis

The following 100,000-path, seed-42 CPU reference results explain the apparent “tiny differences”:

| Scenario | Model | Success | P5 | P50 | P95 | Worst-decile max drawdown |
|---|---|---:|---:|---:|---:|---:|
| Screenshot inputs: $25k initial, $200/mo contribution, $0 withdrawal, 22 years, retire year 3 | GBM | 100.00% | $36,677 | $115,188 | $363,289 | 56.7% |
| Same | Historical bootstrap | 100.00% | $33,342 | $150,906 | $607,291 | 71.3% |
| Same | Student-t(5) | 100.00% | $36,662 | $115,697 | $363,494 | 56.9% |
| Early retiree | GBM | 82.70% | — | $3.614M | $28.662M | — |
| Same | Historical bootstrap | 83.45% | — | $6.710M | $68.234M | — |
| Same | Student-t(5) | 82.69% | — | $3.624M | $28.849M | — |
| High withdrawal | GBM | 34.40% | — | — | — | — |
| Same | Historical bootstrap | 47.05% | — | — | — | — |
| Same | Student-t(5) | 34.47% | — | — | — | — |

Student-t(5) is not broken. A 250,000-innovation check measured 0.582% of t innovations below −3 standard deviations versus 0.136% for Gaussian innovations, and 0.0676% below −5 versus none in the Gaussian sample. The missing behavior is persistence, not tail frequency.

## 3. Delivery boundaries

This goal ships as two additive amendments:

- **Amendment A5 — Robustness Frontier:** multi-stat comparison, three-model spending curves, 90% capacities, robust spend, dedicated advisor lens, and client saturation copy. It changes no simulation kernel or frozen contract.
- **Amendment A6 — Regime-t Lens:** a separate two-state bivariate Markov-switching Student-t(5) simulator, offline calibration artifact, CPU/GPU mirrors, and a fourth frontier curve. It does not make the regime model selectable through frozen `SimParams`.

The two amendments are separate reviewable commits and remain one product goal. A5 must be green before A6 integrates.

### Non-goals

- No tax, Social Security, annuity, mortality, or nominal-inflation engine.
- No model averaging or model weights.
- No claim that 90% is universally “safe,” “optimal,” or a recommendation.
- No mutation of `SimParams`, `SimStats`, `TriStats`, existing model IDs 0–2, frozen buffers, the existing CPU worker protocol, or frozen core operation order.
- No runtime Bayesian calibration and no hidden randomization of parameters inside one path cloud.
- No interpolation or extrapolation presented as measured evidence.
- No physical-GPU performance claim until physical hardware is measured.

## 4. Product surface

### 4.1 Advisor lenses

Advisor mode gains a compact central navigation:

`SIMULATED FUTURES | ROBUSTNESS FRONTIER | HISTORICAL GAUNTLET`

- **Simulated Futures** is the existing GPU scene and right-side outcome rail.
- **Robustness Frontier** is a dedicated central decision surface, not another small card.
- **Historical Gauntlet** contains the existing six-cohort table and mountain trails.
- Client mode keeps the existing mountain and cohort chips; it does not expose the full advisor table by default.

The default advisor lens is Simulated Futures. Switching lenses never mutates financial inputs and never starts a simulation by itself. Frontier computation is an explicit analytical action because it can require dozens of simulations.

### 4.2 Frontier plot

The advisor plot uses:

- X-axis: real monthly spending.
- Y-axis: simulated success rate.
- Directly labeled curves for GBM, historical bootstrap, Student-t(5), and, after A6, Regime-t.
- Line pattern plus color for every curve; color is never the only differentiator.
- A horizontal `90 in 100` threshold.
- A vertical current-spending marker.
- A measured marker at each model-specific 90% capacity.
- A strong `ROBUST SPEND` marker at the lowest included model capacity.

The chart connects measured points for readability but labels them “tested points.” It does not claim the connecting segments are evaluated outcomes. A DOM table exposes every tested point.

### 4.3 Definitions and copy

Primary definition:

> Robust spend is the highest tested real monthly spending at which every included model reaches at least 90 in 100 simulated futures.

Advisor detail:

> Minimum of the included model-specific 90% spending levels. Based on the displayed path count, seed, tested points, and real-dollar cash flows.

Never use “recommended,” “affordable,” “guaranteed,” or “you can spend.”

At 100% success:

> All included models reach the full horizon in 100 of 100 simulated futures at this spending level. Success probability is at its ceiling here, so it cannot distinguish the models. Median ending wealth and severe drawdown still differ.

At 0% success:

> None of the simulated paths reaches the full horizon under the included models at this spending level. This describes the tested plan and assumptions; it is not a statement of certain failure.

When the 90% crossing lies above the tested range:

> The 90% crossing lies above the tested spending range.

When a complete result is unavailable:

> No robust-spend result is published because the full model set did not complete.

### 4.4 Current-plan comparison

The advisor comparison is an aligned table:

| Model | Success now | Median ending wealth | Worst-decile max drawdown | Median failure year | 90% spending |
|---|---:|---:|---:|---:|---:|

A sentence above it describes agreement and disagreement:

> Success agrees at 100.0%, while median ending wealth ranges from $115k to $151k and worst-decile max drawdown ranges from 56.7% to 71.3%.

The comparison must use outcomes already computed by A4. It must not launch extra simulations.

### 4.5 Client surface

Client view preserves one calm headline. When success is saturated, it adds:

> That is the ceiling of this measure, not a guarantee. Across the models, typical ending wealth ranges from $115k to $151k, while the roughest 1 in 10 futures lose 56.7% to 71.3% peak-to-trough on average.

When a current, complete frontier exists:

> Across all included models, spending up to $X per month reaches at least 90 in 100 simulated futures.

“Real monthly spending” appears next to the value. Client copy never names a model as “the truth.”

## 5. Additive data contracts

### 5.1 Multi-stat model comparison

`TriStats` remains byte-for-byte unchanged. Add a new field to `simStore`:

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

export interface RegimeOutcome {
  model: 'regime';
  stats: Omit<SimStats, 'safeWithdrawalRate' | 'computedAt'>;
  magnitude: Omit<MagnitudeStats, 'computedAt'>;
  initialization: 'latest-filtered';
  calibrationAsOf: string;
}

export type FrontierOutcome = ModelOutcome | RegimeOutcome;
```

The exact order is `gbm`, `bootstrap`, `fattail`. `setModelComparison` stamps `computedAt` once. The store performs no financial computation.

`SimDriver` and `useCpuSim` already receive full primary and secondary results. They collect them instead of discarding secondary fields. Publication is atomic and occurs only after all three models complete. Existing `triStats` publication and primary-buffer restore remain unchanged.

### 5.2 Spending frontier

Create a dedicated `frontierStore`; do not enlarge `simStore` with the long-running analytical lifecycle.

```ts
export type FrontierModelKey = ShippedModelKey | 'regime';

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
```

`frontierStore` owns:

- `advisorLens: 'futures' | 'frontier' | 'gauntlet'`
- `status: 'idle' | 'running' | 'complete' | 'error'`
- `progress: { completed: number; total: number; model: FrontierModelKey | null }`
- `result: RobustnessFrontier | null`
- `error: string | null`
- setter/clearer actions only

Every committed parameter change or simulation-mode change clears the frontier result. Live slider movement does not start frontier work. The result stores a complete `params` snapshot so stale results cannot masquerade as current.

## 6. Spending-capacity algorithm

Create a store-free, injected async function:

```ts
export async function computeModelCapacity(
  run: (monthlySpending: number, signal?: AbortSignal) => Promise<FrontierOutcome>,
  options: {
    currentSpending: number;
    target: 0.9;
    tolerance: 0.005;
    maxBisections: 8;
    maxMonthlySpending: 100_000;
    signal?: AbortSignal;
    onProgress?: (completed: number) => void;
  },
): Promise<{
  outcome: FrontierOutcome;
  curve: SpendingCurvePoint[];
  capacity90: SpendingCapacity90;
}>;
```

Required behavior:

1. Evaluate current spending for the displayed outcome.
2. Evaluate zero; do not assume it is feasible without measurement.
3. Raise the high bracket from `max(currentSpending * 2, 1_000)` by powers of two, capped at `$100,000/month`, until success falls below 90%.
4. If no high point falls below 90%, return `unbounded-high`; do not extrapolate.
5. If zero is below 90%, return `infeasible-at-zero`.
6. Otherwise bisect at most eight times.
7. A point is feasible when `successRate >= 0.9`.
8. Early convergence requires `abs(successRate - 0.9) <= 0.005`.
9. The reported capacity must be the highest **evaluated** feasible spending, never an unevaluated midpoint.
10. Sort and deduplicate points by spending.
11. With common seeds and identical inputs, success must be non-increasing with spending. A reversal larger than one path (`1 / analysisPathCount`) invalidates the model result and blocks publication.
12. Abort before and after every awaited run.

The complete frontier runs models sequentially. A5 order is GBM, historical bootstrap, Student-t(5). A6 appends Regime-t. `robustSpend` is the minimum non-null capacity across the complete included set. If any model fails or aborts, publish nothing.

Analysis path count is visible:

- GPU: 100,000 paths for every model.
- CPU fallback: 10,000 paths for every model.

No model within one frontier may use a different path count. Existing validation measures approximately 15–17 seconds for a 10,000-path, three-model CPU frontier. GPU wall time remains unclaimed until physical hardware is measured.

## 7. Orchestration and cancellation

### 7.1 GPU

Add `requestRobustnessFrontier` to `simRuntime` as a separate explicit action.

The GPU frontier adapter:

1. Captures `committedParams`, mode, and a fresh `AbortController`.
2. Runs every model and spending evaluation sequentially against the shared buffers.
3. Reads only the statistics required by the pure frontier core.
4. Shows an advisor progress veil because shared scene buffers temporarily contain candidate runs.
5. Restores the selected primary model before publishing.
6. On an owned abort, does not restore stale parameters because the newer pipeline owns the device.
7. On a non-abort error, attempts the captured primary restore, then surfaces the error.
8. If restoration fails, publishes nothing.

The normal A4 pipeline aborts frontier work on a committed parameter change. Frontier work never runs during a 10,000-path slider preview.

### 7.2 CPU

Create a dedicated `frontier.worker.ts`. Do not change `cpuSim.worker.ts` or its frozen protocol.

- The worker receives one immutable request containing the captured params, bootstrap arrays, and analysis path count.
- It computes the entire frontier and returns one complete result.
- Superseding work terminates and recreates the worker, preventing stale synchronous jobs from blocking a queue.
- A stale token can never commit.

After A6, the worker imports `runCpuRegimeSim` for the fourth model.

## 8. Regime-t model

### 8.1 Purpose

The shipped models cover constant-parameter diffusion, one-year historical blocks, and independent heavy tails. They do not create an uncertain multi-year state with persistent return, volatility, and stock–bond correlation.

Regime-t is a separate planning lens, not a selectable fourth value in frozen `SimParams.model`.

### 8.2 Model

For monthly real equity and Treasury total returns:

```text
x_t = [log(1 + r_equity,t), log(1 + r_bond,t)]
S_t ∈ {calm, stress}
P(S_t = j | S_t-1 = i) = P_ij
x_t = μ_S + L_S z_t sqrt((ν - 2) / χ²_ν), ν = 5
L_S L_S' = covariance_S
```

For equity allocation `A_t`:

```text
gross_t = A_t * exp(x_equity,t) + (1 - A_t) * exp(x_bond,t)
```

This is monthly rebalancing with paired stock/bond outcomes. `A_t` uses the existing `glidepathMix` convention when a glidepath is active and equals 1.0 otherwise. The regime lens ignores the user’s parametric `mu` and `sigma` sliders because it is calibrated from the shipped data; the UI states this explicitly.

The state ordering is fixed by `equityVolCalm < equityVolStress`. Degrees of freedom remain 5 so the difference from Model C primarily isolates regime persistence and changing diversification.

### 8.3 Calibration artifact

Create a deterministic offline calibrator over the recovered 1,206-month equity/bond series in `historicalReturns.json`.

The calibrator:

- Recovers the unique chronological series from overlapping blocks and verifies all overlaps.
- Converts simple returns with `log1p`.
- Fits a two-state bivariate Student-t(5) hidden Markov model with scaled forward-backward recursion.
- Uses t-mixture weights in the M-step, 12-month shrinkage of regime means toward the full-sample mean, a positive-definite covariance floor, and Beta(2,2)-equivalent transition pseudocounts.
- Runs at least four deterministic dispersed initializations and keeps the highest-likelihood converged fit.
- Stops at 250 iterations or when the per-observation log-likelihood improvement is below `1e-7`.
- Orders states by equity volatility after every fit.
- Stores means, actual covariance matrices, Cholesky factors, transition matrix, stationary probabilities, latest filtered probabilities, state occupancy, expected durations, log likelihood, iteration count, convergence flag, data window, and a SHA-256 digest of the recovered input series.

The generated JSON is code-reviewed and committed. Runtime code never fits parameters.

Acceptance checks:

- Both covariance matrices are positive definite.
- Each state has at least 10% filtered occupancy.
- Stress equity volatility is at least 1.5 times calm equity volatility.
- Every transition probability is in `[0.5, 0.9999]`.
- The final fit converges from at least two dispersed starts to the same ordered solution within `1e-4` log likelihood per observation.
- Expanding-window rolling-origin mean joint log predictive score, beginning after month 600 and refitting every 12 months, is not worse than the one-state bivariate Student-t(5) baseline.

If an acceptance check fails, the build script exits nonzero and A6 cannot ship. The report publishes the actual measured values without inventing favorable claims.

### 8.4 Runtime initialization and RNG

The runtime initializes the state from the latest filtered stress probability and displays the as-of date. The calibration report also publishes stationary initialization as a sensitivity, but the first UI release shows one curve to avoid pretending two initializations are two models.

Every path-month reserves fixed branch-independent streams:

- stream 0: initial-state or transition uniform;
- stream 1: first Gaussian coordinate;
- stream 2: second Gaussian coordinate;
- streams 3–7: five Gaussian coordinates for the shared chi-square radial shock.

The CPU and GPU use the same `stepSeedU(path, month, seed)`, stream numbers, f32 calibration constants, comparison order, Cholesky order, gross-return formula, and wealth-step order. No branch consumes a variable number of draws.

### 8.5 Additive GPU path

Create a separate `computeRegimeStep` graph and `runRegimeSimulation` driver.

- Reuse the existing `computeInit`, wealth, peak, drawdown, failure, history, and `pathBlockBase` allocations.
- During a regime run only, `pathBlockBase` stores state `0` or `1`; existing core-model meanings are unchanged.
- Calibration parameters compile as f32 constants in the real node graph; no ninth storage binding and no new large allocation are introduced.
- The driver writes the existing financial uniforms and dispatches the separate step graph.
- It never assigns model ID 3 and never enters the frozen core `uModel` switch.
- The production compute probe imports and Tint-compiles the real regime graph.

This is an additive semantic use documented by A6, not a frozen buffer-layout change.

### 8.6 Additive CPU path

Create `runCpuRegimeSim(baseParams, calibration, options)` in a separate module. It returns the same result categories needed by the frontier but does not change `runCpuSim` or the frozen worker protocol.

Tests pin:

- deterministic state and return golden vectors;
- stationary distribution and expected-duration math;
- empirical simulated regime frequencies;
- empirical conditional means, covariance, and correlation;
- CPU/GPU integer state-transition lockstep;
- old three-model golden vectors unchanged.

## 9. Accessibility and visual system

- The SVG plot has a concise text summary and an adjacent DOM data table.
- Curves use direct labels, patterns, point shapes, and color.
- Plot strokes, labels, focus states, and controls meet WCAG 2.2 AA contrast.
- Keyboard users can move among tested spending points and hear model, spending, and success.
- `aria-live` announces only a completed frontier or a committed-plan invalidation.
- Reduced-motion mode replaces the frontier reveal with an immediate crossfade.
- Mobile places the plot above a horizontally scrollable comparison table.
- Visual direction remains an alpine field instrument: near-black terrain, glacial cyan, mineral gold, ember only for failure, and etched contour-grid geometry. The frontier must not become a generic rounded-card dashboard or a purple SaaS gradient.

## 10. Validation and evidence

Add focused scripts:

- `npm run test:frontier`
- `npm run test:regime`
- `npm run test:frontier-validate`
- `npm run test:compute-probe`

Required test groups:

1. Multi-stat aggregation order, full-stat preservation, null failure semantics, atomic publication, and legacy `TriStats` stability.
2. Spending search measured-point capacity, bracket statuses, sort/deduplication, budget, aborts, monotonicity, and deterministic repeat.
3. GPU adapter run order, no intermediate commits, selected-model restore, abort ownership, error restore, and restore-failure behavior using injected mocks.
4. CPU worker termination and stale-token suppression.
5. Store invalidation on committed parameters and mode changes.
6. Regime calibration recovery, likelihood convergence, state ordering, acceptance checks, and rolling-origin score.
7. Regime distribution moments, state persistence, deterministic seed vectors, CPU/GPU mirror, and unchanged legacy golden vectors.
8. Real production compute graphs compile through Tint. The launcher must be cross-platform.
9. A fixed seed-42, 10,000-path frontier repeats exactly. Each published capacity is an evaluated point and re-runs inside the documented 90% band unless its explicit status is unbounded or budget-exhausted.

The pre-existing full baseline remains mandatory:

```text
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

## 11. Documentation and disclosure

Update:

- `PRODUCT.md`: robustness question and four-lens model set.
- `MEMORY.md`: current commit, measured validation, active decisions, and next action.
- `docs/CONTRACTS.md` and `docs/CONTRACTS_STATS.md`: links to A5/A6 only; frozen sections remain intact.
- `docs/calibration.md`: Regime-t data, fit method, measured parameters, backtest evidence, and limitations.
- `docs/DECISIONS.md`: structural uncertainty, explicit frontier trigger, separate regime runner, and latest-state initialization.
- `README.md`: feature story and reproducible commands only after measurements land.
- `DEMO.md`: no copied numbers until validation prints them.
- `validation/REPORT.md`: exact frontier and regime outputs, path counts, dates, commands, and unmeasured physical-GPU limitation.

Methodology disclosure must state:

- The data are US-only and may embed US exceptionalism.
- The HMM has two discrete states for parsimony, not because markets literally have only two states.
- Regimes are latent statistical classifications, not labels for known future events.
- Latest-state initialization is conditional on data through 2026-06 and is not a market call.
- Parameter uncertainty is not mixed into the displayed paths in this release.
- Structural range is not a confidence interval and carries no model probabilities.
- Robust spend is a 90% threshold on tested simulations, not individualized advice.

## 12. Ship criteria

The feature is complete only when:

- A5 and A6 each have task-level review evidence and green focused tests.
- The four-model frontier publishes atomically and restores the selected primary scene.
- The client and advisor values derive from the same landed artifacts.
- The regime calibration acceptance script passes on the committed dataset.
- The real regime TSL graph passes Tint through the production compute probe.
- The full baseline plus new tests pass from a clean integration worktree.
- README, demo, calibration, contracts, decisions, validation report, and memory contain measured current facts.
- The feature branch merges to master without overwriting unrelated user work.

## 13. Research basis

- Hamilton, “A New Approach to the Economic Analysis of Nonstationary Time Series and the Business Cycle” (1989): https://doi.org/10.2307/1912559
- Guidolin and Timmermann, “An Econometric Model of Nonlinear Dynamics in the Joint Distribution of Stock and Bond Returns” (2006): https://doi.org/10.1002/jae.824
- Gneiting and Raftery, “Strictly Proper Scoring Rules, Prediction, and Estimation” (2007): https://doi.org/10.1198/016214506000001437
- Diebold, Gunther, and Tay, “Evaluating Density Forecasts” (1998): https://doi.org/10.2307/2527342
- Christoffersen, “Evaluating Interval Forecasts” (1998): https://doi.org/10.2307/2527341
- Tashman, “Out-of-sample tests of forecasting accuracy” (2000): https://doi.org/10.1016/S0169-2070(00)00065-0
- Allman, Matias, and Rhodes, “Identifiability of parameters in latent structure models” (2009): https://doi.org/10.1214/09-AOS689
- Barberis, “Investing for the Long Run when Returns Are Predictable” (2000): https://doi.org/10.1111/0022-1082.00205
- Campbell, Sunderam, and Viceira, “Inflation Bets or Deflation Hedges?” (2017): https://doi.org/10.1561/104.00000043
