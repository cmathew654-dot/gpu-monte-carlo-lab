# Decision Log

Short durable decisions live here. Execution status belongs in `MEMORY.md`;
frozen interface details belong in the contract documents.

## D-001 — Pure statistics computation with explicit commit

- Date: 2026-07-26
- Status: approved for Wave 2
- Decision: split GPU stats recomputation into a store-free function returning
  `{ stats, magnitude }` and a thin wrapper that commits primary results.
- Why: triangulation must compute secondary-model success rates without
  overwriting the selected model's magnitude or primary stats.
- Constraint: primary outputs and operation order remain byte-identical.

## D-002 — Sequential GPU triangulation with primary restoration

- Date: 2026-07-26
- Status: approved for Wave 2
- Decision: on a committed parameter change, run the selected model first,
  then the other two sequentially with identical parameters, seed, and path
  count. Restore the selected model's GPU buffers before publishing `triStats`.
- Why: the scene consumes primary path buffers directly and memory limits rule
  out holding three full histories.
- Rejected: concurrent full-model GPU runs or separate 128 MB histories.

## D-003 — Reuse CPU worker jobs for fallback triangulation

- Date: 2026-07-26
- Status: approved for Wave 2
- Decision: in CPU mode, run three sequential jobs using the existing worker
  request/response contract.
- Why: delivers parity without mutating a frozen protocol.

## D-004 — Dedicated gauntlet store

- Date: 2026-07-26
- Status: approved for Wave 2
- Decision: historical-cohort results and sampled paths live in a small new
  zustand store, computed on committed parameter changes.
- Why: deterministic historical replay is a separate analytical layer and
  should not enlarge the frozen simulation-store merge surface.

## D-005 — Additive Amendment A4

- Date: 2026-07-26
- Status: approved for Wave 2
- Decision: document triangulation, gauntlet presentation buffers/state, and
  any sanctioned trigger/store extensions as Amendment A4.
- Why: the repository evolves contracts additively and records measured
  justification.

## D-006 — Isolated workstreams

- Date: 2026-07-26
- Status: active
- Decision: create `p2-trig` and `p2-gauntletviz` from the same verified base.
  Each passes the full gate before integration.
- Why: limits merge surfaces and makes quantitative and rendering regressions
  independently attributable.

## D-007 — Measured, injected capacity points only

- Date: 2026-07-26
- Status: approved for Amendment A5
- Decision: spending-capacity curves contain only evaluations from an injected
  simulation runner; convergence and robust spending are derived from those
  measured points.
- Why: this keeps the comparison truthful across stochastic models and makes
  search behavior deterministic under test clocks and injected runners.

## D-008 — Frontier analysis is an explicit action

- Date: 2026-07-26
- Status: approved for Amendment A5
- Decision: start robustness analysis only through an explicit runtime request,
  never from lens visibility, draft control changes, or ordinary parameter
  observation.
- Why: the analysis is expensive and must bind to a single committed input
  identity.

## D-009 — Dedicated frontier lifecycle store

- Date: 2026-07-26
- Status: approved for Amendment A5
- Decision: frontier status, progress, result, and error state live in a
  dedicated frontierStore.
- Why: it keeps the frozen primary simulation-store contract and ordinary
  simulation lifecycle independent from long-running comparison work.

## D-010 — Sequential GPU ownership with primary restoration

- Date: 2026-07-26
- Status: approved for Amendment A5
- Decision: GPU frontier model evaluations are serialized with all normal GPU
  work and restore the selected primary model's buffers before publication.
- Why: all GPU paths use the same frozen buffers; overlapping owners or a
  secondary model left resident would corrupt the selected visualization.

## D-011 — Dedicated whole-frontier CPU worker

- Date: 2026-07-26
- Status: approved for Amendment A5
- Decision: CPU frontier analysis runs in a separate worker that is terminated
  when superseded and whose callbacks are guarded by worker identity and token.
- Why: whole-frontier cancellation must not alter the frozen normal
  cpuSim.worker.ts protocol or let terminated work publish stale state.

## D-012 — Fixed model order and bounded search policy

- Date: 2026-07-26
- Status: approved for Amendment A5
- Decision: evaluate gbm, bootstrap, and fattail in that order using 100,000
  GPU or 10,000 CPU analysis paths, a $100,000/month upper cap, and at most
  eight bisections.
- Why: a stable order and bounded evaluation budget make complete-set
  publication, cancellation, and validation reproducible.

## D-013 — Offline, fail-closed regime calibration

- Date: 2026-07-26
- Status: approved for Amendment A6
- Decision: reconstruct, fit, accept, and serialize the regime model only in a
  deterministic Node calibration command; validate and consume the committed
  artifact at runtime without fitting.
- Why: the browser should run a reviewed quantitative artifact, and any data,
  fit, or serialization drift must fail before deployment.

## D-014 — Parsimonious scale HMM after empirical rejection

- Date: 2026-07-26
- Status: approved for Amendment A6
- Decision: use a common mean and common covariance shape with two latent
  positive scales, Student-t(5) emissions, and Markov persistence.
- Why: the initially planned unconstrained HMM partitioned persistent eras and
  mean levels but failed the unchanged 1.5× volatility-separation gate. The
  scale model cleared every in-sample and rolling-origin gate without weakening
  acceptance thresholds.
- Limitation: state scale changes; conditional stock–bond correlation does not.

## D-015 — Latest-filtered application initialization

- Date: 2026-07-26
- Status: approved for Amendment A6
- Decision: initialize application paths from the artifact's filtered state
  probability through 2026-06. Evaluate stationary initialization only as a
  validation sensitivity.
- Why: this makes the conditional starting assumption explicit without
  presenting it as a market forecast or a second displayed curve.

## D-016 — Separate frontier-only regime runners

- Date: 2026-07-26
- Status: approved for Amendment A6
- Decision: implement separate CPU and TSL/GPU regime runners; never add
  `'regime'` to `SimParams['model']`, never allocate model ID 3, and never
  change the frozen primary model kernel/driver.
- Why: the regime process is an assumption lens, while the selected primary
  simulator and its visualization contracts remain stable.

## D-017 — Four-model atomic frontier

- Date: 2026-07-26
- Status: approved for Amendment A6
- Decision: append regime after gbm/bootstrap/fattail, run all four
  sequentially with identical inputs and seed, restore the selected primary on
  GPU, and publish only the complete set.
- Why: robust spending is meaningful only when the orthogonal persistence lens
  participates in the same measured decision boundary.
