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
