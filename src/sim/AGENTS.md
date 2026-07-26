# Simulation Instructions

Applies to `src/sim/**` in addition to the repository root guidance.

- Treat `docs/CONTRACTS.md`, `docs/CONTRACTS_STATS.md`, and
  `docs/calibration.md` as authoritative.
- `SimParams`, `SimStats`, per-path buffer layouts, worker protocol, and
  operation order are frozen. Use additive types/files/fields and document an
  amendment.
- Every stochastic formula, seed operation, failure boundary, and glidepath
  operation must match between TSL and CPU mirrors with the same operation
  order, `Math.imul`, and `Math.fround` conventions.
- Preserve exact seed/path subset determinism. Update golden vectors only when
  an authorized semantic change explains the new values.
- A statistic must state its population, conditioning, units, and null behavior.
  Never compute a display-only financial statistic in React.
- Keep gauntlet code pure TypeScript with no three.js or main-store import.
- Historical exhaustion is not failure. Preserve separate metadata.
- Add tests before or with behavior changes. Run the focused suite plus the full
  root gate before handoff.
- Never “fix” a surprising financial result by changing calibration or
  conventions without measured evidence and explicit approval.
