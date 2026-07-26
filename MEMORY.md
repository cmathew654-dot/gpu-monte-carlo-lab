---
schema_version: 1
scope: GPU Monte Carlo Lab
owner: Cyril
updated_at: 2026-07-26
verified_at: 2026-07-26
verified_against: git:fe2b92f + production deploy 6a664cf926780901772552c0
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
- Next action: begin W2-A on `p2-trig` and W2-B on `p2-gauntletviz`.

### C-002 — Wave 2A: model triangulation

- Status: completed
- Outcome sought: committed parameter changes run all three return models with
  identical parameters and seed; primary model still drives paths and stats;
  client and advisor surfaces show assumption sensitivity.
- Scope: stats purity/commit split, `SimDriver`, CPU fallback orchestration,
  additive `triStats`, `StatCards`, `ClientHud`, device-loss fallback, docs.
- Verified outcome: committed as `3d7964b`, merged into integration at
  `f5a9ebb`; focused triangulation suites pass 5 + 5 checks and the combined
  full gate remains green.

### C-003 — Wave 2B: historical gauntlet visualization

- Status: completed
- Outcome sought: deterministic six-cohort HUD/table plus Rainier cohort trails,
  driven by a dedicated zustand store and the shared reveal sweep.
- Scope: gauntlet engine path output, store, UI panel, buffers, TSL graph,
  mountain rendering, real-builder probe coverage.
- Verified outcome: implemented in `752f812`, correctness review fixes in
  `9b66419`, merged into integration at `f5a9ebb`; engine + visualization
  suites pass 26 + 38 checks and the real gauntlet graph compiles through
  Tint at 5,687/869-byte WGSL with zero validation errors.

### C-004 — Amendment A5 core: robustness frontier computation contract

- Status: completed
- Outcome sought: an additive, complete three-model robustness frontier with
  measured spending capacity, explicit committed-input triggering, and
  cancellable GPU/CPU execution that preserves the frozen normal simulation
  path.
- Scope: frontier types/search/assembly, dedicated frontier lifecycle store and
  CPU worker, shared GPU work coordination/restoration, deterministic frontier
  validation, production compute-probe hardening, and canonical contracts.
- Core history: fe35059 through 9865bfe, including complete outcome publication
  (169c80e, 0809655), capacity/frontier computation (428c816, 5aca89d,
  72bf74f, df49086), GPU ownership/restoration (5e01b66, b22f4a2, e379343,
  f4e5847, 685d59c, eb3f516), the dedicated CPU worker/runtime (852832e,
  6f55aaa, f44b2e6), deterministic capacity evidence (ac8c2f2), and Task 12
  probe history (870553f, 450f322, 9865bfe).
- Verified outcome: final gate from 9865bfe passes focused frontier tests,
  deterministic CPU frontier validation, TypeScript, lint, simulation, stats,
  gauntlet, baseline validation, launcher, triangulation, production build,
  compute probe, and Viz5 probe. The deterministic artifact fixes logical time
  at 2024-07-26T13:20:00.000Z (distinct from the 2026-07-26 wall-clock gate).
  The measured seed-42, 10,000-path CPU result is gbm 3632.8125 at 0.9026,
  bootstrap 3476.5625 at 0.9044, fattail
  3632.8125 at 0.9049; robust spending is 3476.5625/month, converged, in
  20899.61 ms. The full command matrix and JSON are in validation/REPORT.md.
- Frozen surfaces: the exact diff from 56350f8 is empty for cpuSim.worker,
  cpuSim, runSimulation, initPaths, stepPaths, and buffers. The simStore diff
  is limited to additive modelComparison state/setter and frontier invalidation.
- Hardware boundary: Physical-GPU frontier wall time is unmeasured; the
  SwiftShader compute probe validates production graph compilation and binding
  correctness, not hardware performance.
- Next action: begin Amendment A6 Regime-t lens work.

### C-005 — Amendment A5: robustness frontier experience

- Status: completed
- Outcome sought: a single, accessible advisor decision surface for simulated
  futures, the tested three-model robustness frontier, and the named historical
  gauntlet, with calm client wording that never turns a tested comparison into
  advice or certainty.
- Scope: experience commit range 6a24075..HEAD, ending with this Task 5
  visual-system finalization. The surface replaces Inter/JetBrains Mono with
  Barlow Semi Condensed and IBM Plex
  Mono, adds exact #606060 interactive/data boundaries, explicit plot
  encodings, responsive frontier overflow, reduced motion, and tested-point
  keyboard focus.
- Verified outcome: focused npm run test:frontier, npx tsc -b, npm run lint,
  and npm run build pass on 2026-07-26. The production build transformed 150
  modules in 5.73s. This is focused A5 experience evidence; it is not a claim
  that the full baseline was rerun.
- Next action: begin Amendment A6 Regime-t lens work.

### C-006 — Amendment A6: Regime-t and four-model Robustness Frontier

- Status: completed, integrated into canonical `master`, and deployed.
- Outcome sought: extend the tested spending frontier with one orthogonal,
  CFA-defensible persistence lens without changing any frozen primary model,
  model ID, buffer, worker protocol, store shape, or financial operation order.
- Accepted model: a two-state bivariate Student-t(5) scale HMM with one common
  mean and covariance shape, persistent state-specific scales, and paired
  equity/bond innovations. The initially planned unconstrained HMM was rejected
  by the unchanged 1.5× volatility-separation gate rather than rationalized.
- Calibration evidence: 1,206 paired months, 1926-01 through 2026-06, digest
  `22cce814073cdf5fba6288afbdf7d4c78d000a7f62110c757905eb3076cc49e4`;
  calm/stress monthly equity volatility 0.0330749726 / 0.0617423330;
  persistence 0.9767339270 / 0.9542764748; four agreeing starts; rolling
  score 4.3010423089 versus 4.2562176532 for the one-state comparator.
- Production sequence: `gbm → bootstrap → fattail → regime`; complete-set
  publication only; selected primary GPU simulation restored on success,
  failure, and abort. Regime-t remains frontier-only and ignores μ/σ.
- Fixed validation result: current success 0.5149 / 0.6031 / 0.5158 / 0.6491;
  90% capacities 3632.8125 / 3476.5625 / 3632.8125 / 3984.375 dollars per
  month; robust floor 3476.5625; all searches converged on real tested points
  with zero upward reversal. Latest-filtered versus stationary Regime-t
  success was 0.6491 versus 0.6468.
- GPU evidence: the production graph compiles through Tint with no new binding;
  the first 16 state values match CPU exactly. Physical-GPU performance remains
  unmeasured.
- Visual evidence: final CPU-fallback screenshots pass at 1920×1080 and
  720×900 after fixing nested flex shrinkage, client/Gauntlet overlap, idle
  bounds/copy, and collision-proof four-model label lanes.
- Verified outcome: the complete release-candidate gate in
  `validation/REPORT.md` passed after `61a0c0f`. The exact frozen-surface diff
  from A5 head `2bade36` is empty.
- Production: [gpu-monte-carlo-lab.netlify.app](https://gpu-monte-carlo-lab.netlify.app),
  Netlify deployment `6a664cf926780901772552c0`, state `ready`. The host
  received only the validated `dist` contents, not the source tree or internal
  planning documents. Independent HTTPS verification returned 200 and the
  expected `index-CXDfHSRG.js` asset reference.
- Next action: run the documented physical-GPU performance/parity protocol and
  add a captured demo GIF when suitable hardware is available.

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

The full combined Wave-2 baseline is green at `f5a9ebb`. Re-run it after every
subsequent branch merge.

### Wave 2 integration evidence

| Check | Result | Evidence |
|---|---:|---|
| `npx tsc -b` | pass | integration worktree, 2026-07-26 |
| `npm run lint` | pass | integration worktree, 2026-07-26 |
| `npm run test:sim` | 84 pass | integration worktree, 2026-07-26 |
| `npm run test:stats` | 52 + 19 pass | integration worktree, 2026-07-26 |
| `npm run test:gauntlet` | 26 + 38 pass | integration worktree, 2026-07-26 |
| `npm run test:triangulation` | 5 + 5 pass | integration worktree, 2026-07-26 |
| `npm run test:validate` | 56 pass | integration worktree, 2026-07-26 |
| `npm run test:probe-launcher` | 6 pass | integration worktree, 2026-07-26 |
| `npm run build` | pass | 136 modules, integration worktree, 2026-07-26 |
| `node probe/run-viz5-probe.mjs` | pass | 194 routes; all five production graphs; zero errors |

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

1. Measure real-hardware WebGPU performance before publishing frame-time claims.
2. Capture a production demo GIF on suitable GPU hardware.
3. Broaden the historical evidence beyond US-only data before claiming
   geographic robustness.

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
