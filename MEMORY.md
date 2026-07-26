---
schema_version: 1
scope: GPU Monte Carlo Lab
owner: Cyril
updated_at: 2026-07-26
verified_at: 2026-07-26
verified_against: git:36e428d
review_by: 2026-08-09
---

# Project Memory

Mutable operational handoff only.

- Stable instructions: `AGENTS.md`
- Product contract: `PRODUCT.md`
- Frozen technical contracts: `docs/CONTRACTS.md`,
  `docs/CONTRACTS_STATS.md`
- Active plan: `docs/exec-plans/active/WAVE-2.md`
- Decisions: `docs/DECISIONS.md`
- Secrets: forbidden

## Current

### C-001 — Establish the durable workspace

- Status: completed
- Outcome sought: a clean Git-backed project root with scoped agent guidance,
  custom roles, product truth, current state, and evidence-bearing plans.
- Scope: repository root, `.codex/`, `docs/`, nested `AGENTS.md` files.
- Source snapshot: copied from the attached Wave-1 archive; original extraction
  remains untouched.
- Verified outcome: committed as `36e428d`; dependencies installed; full root
  gate and launcher regression test pass from this workspace.
- Next action: create both Wave-2 branches from the final documented base.

### C-002 — Wave 2A: model triangulation

- Status: planned; not implemented
- Outcome sought: committed parameter changes run all three return models with
  identical parameters and seed; primary model still drives paths and stats;
  client and advisor surfaces show assumption sensitivity.
- Scope: stats purity/commit split, `SimDriver`, CPU fallback orchestration,
  additive `triStats`, `StatCards`, `ClientHud`, device-loss fallback, docs.
- Done when: requirements in the active Wave-2 plan pass the full gate on its
  own branch.

### C-003 — Wave 2B: historical gauntlet visualization

- Status: planned; replay engine already exists
- Outcome sought: deterministic six-cohort HUD/table plus Rainier cohort trails,
  driven by a dedicated zustand store and the shared reveal sweep.
- Scope: gauntlet engine path output, store, UI panel, buffers, TSL graph,
  mountain rendering, real-builder probe coverage.
- Done when: requirements in the active Wave-2 plan pass the full gate on its
  own branch.

## Verified imported state

Wave 1 is present in the source snapshot:

- Real glidepath mixing across bootstrap/GBM/fat-tail.
- Worst-decile max drawdown is the conditional mean of the deepest decile.
- Seed mixing uses `pcgRound(seed)` in CPU and GPU mirrors.
- Additive magnitude stats exist and are populated, but are not displayed.
- Recruiter-grade README, MIT license, dependency cleanup, extracted summit
  node graph.
- Pure TypeScript historical gauntlet engine with six cohorts.

The imported source contains no `.git` history. The handoff named upstream
commit `7398c71`, but that SHA cannot be verified from the archive itself.

## Baseline evidence from the imported snapshot

| Check | Result | Evidence |
|---|---:|---|
| `npx tsc -b` | pass | local run, 2026-07-26 |
| `npm run lint` | pass | local run, 2026-07-26 |
| `npm run test:sim` | 84 pass | local run, 2026-07-26 |
| `npm run test:stats` | 52 + 19 pass | local run, 2026-07-26 |
| `npm run test:gauntlet` | 26 pass | local run, 2026-07-26 |
| `npm run test:validate` | 56 pass | local run, 2026-07-26 |
| `npm run build` | pass | local run, 2026-07-26 |
| `npm run test:probe-launcher` | 6 pass | cross-platform path/browser resolution |
| `node probe/run-viz5-probe.mjs` | pass | 194 routes, zero missing summits, eight WGSL outputs, zero probe errors |
| `npm audit --omit=dev --json` | 0 production vulnerabilities | local registry audit, 2026-07-26 |

The full baseline is green at `36e428d`. Re-run it after every branch merge.

### Validation numbers to use when refreshing `DEMO.md`

These are measured `npm run test:validate` outputs from 100,000-path,
seed-42 CPU reference runs:

| Preset | Success | P50 | P95 | Worst-decile DD | Median failure |
|---|---:|---:|---:|---:|---:|
| Early retiree 35-year | 83.45% | $6.710M | $68.234M | 100.0% | year 22.3 |
| Pre-retiree 10-year glidepath | 95.73% | $2.592M | $10.673M | 90.6% | year 26.1 |
| Fat-tail stress | 90.67% | $2.941M | $17.615M | 99.9% | year 23.6 |
| High-withdrawal cautionary | 47.05% | $0 | $20.133M | 100.0% | year 15.9 |
| Accumulation only | 100.0% | $2.184M | $7.976M | 0.0% | n/a |

Additional measured outputs:

- Fat-tail stress GBM twin: 90.58% versus 90.67% fat-tail, a -0.10
  percentage-point difference as printed by validation.
- Safe withdrawal: Early retiree approximately $4,576/month; high withdrawal
  approximately $3,958/month.
- Historical anchors: 1966 30-year max SWR 3.91%; a 4% rule fails at month 338
  (year 28.17). The 1929 cohort survives 4%.

## Active decisions

| ID | Decision | Rationale |
|---|---|---|
| D-001 | Refactor GPU stats into a store-free compute result plus a thin primary commit wrapper. | Secondary model stats must not corrupt primary UI state. |
| D-002 | Run secondary GPU models sequentially, then restore primary GPU buffers before committing triangulation. | Preserves primary paths and existing rendering behavior under finite GPU memory. |
| D-003 | CPU fallback triangulates through sequential existing worker jobs. | Keeps the frozen worker protocol additive/unchanged. |
| D-004 | Gauntlet state lives in its own store. | Keeps deterministic historical replay separate from stochastic simulation merge surfaces. |
| D-005 | Wave-2 contract changes are Amendment A4 and additive. | Preserves the repository's frozen-contract culture. |
| D-006 | W2-A and W2-B begin from the same verified base and merge only after their own full gates. | Isolates statistical orchestration from visualization risk. |

Full rationale: `docs/DECISIONS.md`.

## Future — not committed

1. Execute W2-A on `p2-trig`; merge only after the full gate.
2. Execute W2-B on `p2-gauntletviz`; merge only after the full gate.
3. Run Wave-3 integration, update product evidence, deploy the static build, and
   add the live URL/GIF.
4. Measure real-hardware WebGPU performance before publishing frame-time claims.

The stretch goal to code-split GPU buffers in CPU mode remains optional; skip it
if it makes frozen buffer initialization or Canvas ownership invasive.

## Freshness protocol

- Refresh after a merge, dependency change, contract amendment, release, or
  validation-number change.
- Replace superseded facts in place and retain the decision ID that replaced
  them; do not accumulate contradictory diary entries.
- Move detailed history to Git, an ADR, or an archived execution plan.
- Record exact command, result, date, and commit for every verification claim.
- Treat entries past `review_by` as suspect until rechecked.
