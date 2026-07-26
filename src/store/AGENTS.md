# Store Instructions

Applies to `src/store/**` in addition to the repository root guidance.

- `SimParams` and `SimStats` are frozen shapes.
- Follow the existing additive snapshot/magnitude extension pattern: new
  interfaces and top-level fields, with explicit setters/clearers.
- Do not place deterministic historical gauntlet state in `simStore`; use its
  dedicated store.
- Store timestamps identify a complete matching computation, not render time.
- Clear derived state when committed inputs invalidate it. Aborted or stale work
  must never commit.
- Preserve the single sanctioned primary stats commit path; secondary-model
  computation remains store-free until the explicit `triStats` commit.
- Store actions do not dispatch GPU work or compute financial formulas.
