---
schema_version: 1
scope: GPU Monte Carlo Lab
owner: Cyril
updated_at: 2026-07-26
verified_at: 2026-07-26
verified_against: git:2b7a9c3 + production deploy 6a6664a86c760905de08d74d
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

### C-007 — Client model provenance and short-viewport repair

- Status: completed, committed, validated, and deployed.
- Trigger: the 982×319 client view allowed independently positioned narrative
  and Gauntlet overlays to collide, and it did not visibly state how many
  statistical models supported the displayed range.
- Layout outcome: `ClientHud` now owns one normal-flow top stack containing the
  narrative and client Gauntlet. At content viewport 982×319, measured bounds
  were narrative 16–62 px, Gauntlet 71–132 px, and controls 202–307 px. The
  short-height mode preserves the headline, cohort outcomes, and two core
  controls while collapsing secondary audit prose, presets, and attribution.
- Provenance outcome: a complete, current four-model Frontier drives the client
  success range and states that four statistical market models tested the plan.
  Before that exact complete result exists, the UI honestly reports three
  models after triangulation or a build-in-progress message. Running, stale,
  partial, and wrong-engine Frontier results never earn the four-model claim.
- Reproducibility repair: `scripts/buildRegimeCalibration.ts` normalizes only
  CRLF to LF before strict artifact comparison, keeping deterministic content
  checking intact across Windows Git worktrees.
- Research outcome: `docs/MODEL_RIGOR_ROADMAP.md` records current all-real-dollar
  semantics, the proposed Advisor market-filter readout, and the rigor ladder:
  joint nominal/CPI paths, parameter uncertainty and international histories,
  richer regimes, stochastic volatility/jumps, then household risks.
- Verified outcome: root gate, A6 regime/frontier gates, build, production TSL
  graph probe, compute probe, and independent four-model validation all exited
  zero. Exact current Frontier validation remains 51.49% / 60.31% / 51.58% /
  64.91% success for GBM/bootstrap/Student-t/Regime-t at 10,000 paths, seed 42,
  with a $3,476.5625/month robust 90% tested floor.
- Source commit: `982aa74`. Production deploy: `6a665dc290a1d9fa1fab5612`,
  state `ready`, published 2026-07-26T19:19:35.237Z. HTTPS verification returned
  200 and assets `index-CtNLOqQ6.js` / `index-LHPkB58d.css`; only staged `dist`
  contents were uploaded.
- Next action: treat `docs/MODEL_RIGOR_ROADMAP.md` as research, not an approved
  amendment. The smallest next product slice is the read-only Advisor market
  filter plus explicit latest-filtered/stationary/forced-stress sensitivity.

### C-008 — Client evidence hierarchy and model explainer

- Status: completed, committed, visually verified, and deployed.
- Trigger: the client historical cohort card still hid the Rainier scene, the
  committed household inputs were not visible near the result, and the client
  had no plain-language explanation of the four statistical lenses.
- Experience outcome: the client Gauntlet is now a transparent, borderless
  evidence line with six year/status markers instead of an opaque card grid.
  The result is preceded by a committed-plan readout covering invested wealth,
  monthly saving, monthly spending, retirement timing, horizon, and allocation.
- Method outcome: a collapsed, keyboard-focusable `How we tested this`
  disclosure explains GBM as baseline compounding, historical bootstrap as
  real one-year sequences, Student-t(5) as more extreme months, and Regime-t as
  persistent clustered stress with joint stocks/bonds. It says all four ran
  only for a current complete four-model Frontier; otherwise it explicitly says
  three run automatically and Regime-t joins the full robustness test.
- CPU fallback outcome: duplicate advisor fallback readouts are suppressed only
  when the client HUD is present, leaving one capability badge and one source of
  result truth without changing CPU computation.
- Visual evidence: read-only browser review passed at 982×800 and the reported
  982×319 short-landscape viewport. The Gauntlet computed transparent with no
  border; visible client leaf elements had zero intersections. The open model
  disclosure measured 620×233.8 px and remained fully visible at y=78.5–312.3
  in the 319 px viewport.
- Verification: focused Frontier/UI tests, TypeScript, lint, production build,
  all simulation/statistics/Gauntlet/triangulation/Regime/frontier validation
  suites, launcher tests, and the real Viz5 TSL probe exited zero. The final
  production assets are `index-CgCDKsH9.js` and `index-BaxRAZaH.css`.
- Source commit: `2b7a9c3`. Production deploy:
  `6a6664a86c760905de08d74d`, state `ready`, published
  2026-07-26T19:49:01.075Z. Independent HTTPS verification returned 200.
- Frozen surfaces: untouched. No simulation formula, buffer layout, worker
  protocol, `SimParams`, or `SimStats` contract changed.
- Next action: the planned Advisor market-filter slice remains the next
  quantitative product addition; this change only repairs client hierarchy and
  methodology disclosure.

### C-009 — Client composition and responsive framing

- Status: completed, committed, visually verified, and merged locally; not
  deployed.
- Composition outcome: the client HUD uses the specified responsive breathing
  room, the Rainier summit targets 60% of scene height, historical cohort labels
  remain borderless with a dark text edge, and plan/method/cohort text never
  drops below 10 px.
- Responsive outcome: compact-height rules now require a landscape-like aspect
  ratio. Narrow portrait layouts wrap the committed plan and reflow all six
  historical cohorts into two rows inside a vertically scrollable HUD.
- Camera outcome: client terrain views compute a frame-local minimum radius
  from terrain half-width, vertical FOV, aspect ratio, and a 1.12 safety margin.
  Stored wheel radius and the Advisor camera path remain unchanged.
- Terrain outcome: the outermost 1.75 world units fade into the night
  background with opaque interior depth writing and a 0.02 alpha cutoff. The
  real Viz5 probe compiles the opacity graph.
- Visual evidence: read-only Playwright/WebGPU review passed at 982×800,
  982×443, 982×319, 390×844, and 255×542. Landscape viewports retain one
  cohort row; portrait viewports retain two rows; no required text falls below
  10 px. Pixel inspection at 982×800 confirmed the terrain edge falls from
  luminance 187 near x=900 to approximately 2 by x=950.
- Verification: `npx tsc -b`, lint, framing, simulation, statistics, Gauntlet,
  validation, probe-launcher, triangulation, Frontier, Regime, frontier
  validation, production build, and `node probe/run-viz5-probe.mjs` all exited
  zero on 2026-07-26. The final probe compiled 194 routes with zero missing
  summits and zero probe errors.
- Frozen surfaces: untouched. No simulation formula, store, worker protocol,
  buffer layout, `SimParams`, or `SimStats` contract changed.
- Source and merged commit: `1168d58`.
- Next action: deployment remains a separate explicit decision.

### C-010 — Portfolio-grade pilot proof ladder

- Status: design approved; two executable milestone plans complete; not implemented.
- Outcome sought: move from a technically credible portfolio product to an
  evidence-bearing engine, then to a directionally validated advisor pilot
  instrument without expanding into a regulated planning platform.
- Milestone 1: a reproducible physical-WebGPU benchmark and recovery system on
  the RTX 3080 Ti, with sanitized raw evidence, CPU/GPU correctness gates,
  cancellation/device-loss drills, rendering measurements, and one secondary
  portability attempt.
- Milestone 2: one frozen synthetic decision case and three-to-five structured
  professional sessions, with uncoached comprehension gates, anonymized
  findings, dispositions for up to the three highest-severity observed
  failures, and at least one post-repair verification.
- Boundaries: no new return model, frozen simulation-contract change, client
  data storage, authentication, or commercial-platform scope is authorized.
- Canonical design: `docs/superpowers/specs/2026-07-27-portfolio-grade-pilot-evidence-design.md`.
- Execution plans: `docs/superpowers/plans/2026-07-27-physical-gpu-evidence.md`
  followed by `docs/superpowers/plans/2026-07-27-advisor-decision-proof-pilot.md`.
- Planning correction: CPU fallback evidence is limited to the product-capped
  10,000-path cells; higher CPU path counts are explicitly excluded.
- Design commit: `a7d9130`.
- Next action: choose an execution mode and implement Milestone 1 first.

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
