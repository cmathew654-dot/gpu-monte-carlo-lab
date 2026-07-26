# Amendment A5 — Robustness Frontier core

**Authorization:** approved design, 2026-07-26.

This amendment adds a measured, three-model spending-capacity comparison and
its cancellable GPU/CPU execution paths. It is additive. It does not authorize
an A5 presentation/experience change, a runtime producer for the regime model,
or a change to any frozen simulation contract.

## 1. Frozen compatibility boundary

The following remain unchanged:

| Frozen surface | A5 compatibility |
| --- | --- |
| SimParams, SimStats, and TriStats | No fields, meanings, or required consumers changed. |
| Shipped model IDs | gbm = 0, bootstrap = 1, fattail = 2 remain unchanged. |
| Per-path and stats buffers | No buffer name, layout, binding, allocation, or ownership shape changed. |
| Kernel operation order | Initialization, return generation, cash-flow application, retirement bookkeeping, and failure semantics remain unchanged. |
| runSimulation() | Signature and normal simulation semantics remain unchanged. |
| runCpuSim() | Signature and normal CPU reference semantics remain unchanged. |
| cpuSim.worker.ts | The existing { type: 'run', ... } request/response protocol remains unchanged. |

RegimeOutcome below is an additive type seam only. A5 has no runtime producer
for regime; its presence neither changes the shipped model set nor causes a
fourth model to be evaluated.

## 2. Public frontier types

~~~ts
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
~~~

The public construction helpers are:

~~~ts
export function modelOutcome(
  model: ShippedModelKey,
  computed: ComputedStats,
): ModelOutcome;

export function orderedModelComparison(
  outcomes: ReadonlyMap<ShippedModelKey, ModelOutcome>,
  basis: Pick<SimParams, 'pathCount' | 'seed'>,
): Omit<ModelComparison, 'computedAt'>;
~~~

## 3. Model order and analysis budgets

Every complete A5 frontier uses this exact model order:

~~~ts
['gbm', 'bootstrap', 'fattail']
~~~

GPU frontier analysis uses 100,000 paths. CPU frontier analysis uses 10,000
paths. These are dedicated analysis counts; they do not redefine the selected
simulation's committed pathCount or the frozen normal simulation path.

## 4. Measured spending-capacity search

computeModelCapacity accepts an injected runner and records only runner
measurements. There is no analytical interpolation, extrapolated curve point,
or inferred success rate.

- It evaluates the committed current spending and zero spending, then brackets
  upward by doubling from max(currentSpending * 2, 1000) to a hard
  $100,000/month cap.
- A zero-spending success rate below 90% returns infeasible-at-zero with
  monthlySpending: null.
- Reaching the $100,000 cap at or above 90% returns unbounded-high with
  monthlySpending: null.
- A bracketed search performs at most eight bisections. converged requires a
  measured success rate within the inclusive 90% ± 0.5 percentage-point band.
  Otherwise the best measured feasible point is returned with budget-exhausted.
- The curve is the sorted, de-duplicated set of measured points. Abort is
  checked before awaiting every runner call and again after it resolves, so
  cancellation cannot publish a late measurement.

The frontier permits one observed upward success-rate reversal only when it is
at most 1 / analysisPathCount. Larger reversals reject the curve rather than
inventing monotonicity.

## 5. Complete-set publication and robust spending

All three model results are evaluated in the required order and assembled
before publication. No partial model set is exposed as a RobustnessFrontier.

robustSpend is the minimum of the measured non-null model capacities. The
matching robustStatus is derived from the complete set:

- any infeasible-at-zero result makes the robust result null and
  infeasible-at-zero;
- when every capacity is null and every status is unbounded-high, the robust
  result is null and unbounded-high;
- otherwise the minimum measured capacity is used; if a model tied at that
  minimum is budget-exhausted, the robust status is budget-exhausted,
  otherwise it is converged.

## 6. Explicit trigger and invalidation

The runtime exposes requestRobustnessFrontier as an explicit action. Opening a
lens, changing draft controls, or observing store state does not begin frontier
analysis. A request captures the committed input and may publish only when its
work identity is current, its abort signal is live, the active engine still
matches, and the current committed parameters are the captured parameters.
Semantic committed-input changes invalidate and clear frontier state.

## 7. GPU execution ownership and restoration

GPU frontier evaluation is sequential because it reuses the frozen shared
simulation buffers. The selected committed parameters are deep-captured, and
the selected primary buffers are restored by rerunning that captured simulation
after analysis before a complete frontier is published.

Every normal GPU simulation and frontier run shares one coordinator. A
superseded owner must reach a terminal state before the next owner dispatches;
cooperative abort requests do not permit overlapping buffer owners. On a
non-abort error, A5 attempts primary restoration and reports an aggregate error
if restoration also fails. An owned abort is checked first and does not perform
a stale restore.

## 8. Dedicated CPU frontier worker

CPU frontier analysis uses a dedicated whole-frontier worker, distinct from
the frozen cpuSim.worker.ts protocol. Starting a new frontier terminates the
previous dedicated worker, rejects its promise with AbortError, advances a
request token, and creates a new worker. Result, progress, error, and cleanup
callbacks require both the active worker identity and current token, preventing
a terminated worker from publishing stale output.

## 9. Validation commands and performance boundary

The A5 core validation matrix is:

~~~text
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
~~~

npm run test:compute-probe and node probe/run-viz5-probe.mjs test the
production compute graph and the visualization probe respectively.
Physical-GPU frontier wall time is unmeasured; the SwiftShader compute probe
validates production graph compilation and binding correctness, not hardware
performance.

## 10. Experience contract

The advisor experience has three analytical lenses: Simulated futures,
Robustness frontier, and Historical gauntlet. The frontier is started only by
the explicit **Run robustness frontier** action. Opening its lens, changing a
draft control, and rendering a client or advisor view remain non-triggers.

Each plotted marker and each table row is an evaluated simulation point. A line
may join measured points only to make the tested decision surface readable; it
does not assert an interpolation, an untested result, or a prediction between
points. A complete result reports the captured engine, seed, and analysis path
count. Unbounded-high, infeasible-at-zero, budget-exhausted, stale, running,
and error states remain explicit in place.

“Robust spend” means the highest **tested** real monthly spending at which
**every included model** reached at least 90 in 100 simulated futures. It is
not a recommendation, a personal financial plan, a guarantee, or a model
weighting scheme. When all included models reach the 100% success ceiling for
the tested measure, client wording identifies that ceiling as a limit of the
measure, not as certainty.

The client and advisor views consume the same committed-input comparison and
frontier artifacts. Client language may simplify the result into a natural
frequency and its observed range; advisor language retains models, real-dollar
units, tested-point status, and the limiting model. Neither surface may invent
an additional result in presentation code.

The decision-critical DOM surface is a peer of the canvas:

- The chart has an SVG title and description, direct series labels, a 90%
  target, and explicit current/robust reference lines.
- The comparison and tested-point tables expose model, real monthly spending,
  success, and measured status as ordinary semantic table cells.
- Keyboard-reachable point controls synchronize focus with the matching plot
  marker and expose the model, spend, success, and target status in their
  accessible name. Color is duplicated by marker shape, dash, label, and table
  symbol.

The visual system uses Barlow Semi Condensed for interpretation and IBM Plex
Mono for measured facts. GBM is glacial cyan and circular/solid; historical
bootstrap is amber and square/dashed; Student-t(5) is periwinkle and
triangular/dotted. Regime is reserved green with a diamond/dash encoding only;
this amendment still authorizes no runtime regime producer. Interactive and
data boundaries use the #606060 control line, decorative separation uses the
#2e2e2e hairline, and the flat black field uses a low-contrast embedded SVG
contour field rather than decorative gradients, glass, ambient shadows, or
colored side stripes. Reduced motion shortens all motion to an effectively
instant 0.01ms state change without hiding content.
