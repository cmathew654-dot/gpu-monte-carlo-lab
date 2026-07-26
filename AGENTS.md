# GPU Monte Carlo Lab — Repository Instructions

## Scope and authority

This file applies to the entire repository. A nested `AGENTS.md` adds rules
for its own subtree and takes precedence there. Nested guidance may tighten,
but never weaken, the frozen contracts in `docs/CONTRACTS.md` and
`docs/CONTRACTS_STATS.md`.

## Start here

Before changing code:

1. Read `PRODUCT.md` for product intent and audience.
2. Read `MEMORY.md` for current verified state, active decisions, and next work.
3. Read the applicable nested `AGENTS.md`.
4. Inspect `git status`; preserve unrelated user changes.
5. For planned work, use the relevant file under `docs/exec-plans/active/`.

`MEMORY.md` is a mutable handoff, not a source of mandatory rules. Verify stale
claims against code, contracts, tests, or Git history.

## Product bar

- This is a retirement-planning decision aid and a public wealth-tech portfolio
  project. Quantitative claims must survive a CFA-leaning review.
- Client language is calm and plain. Advisor language is precise. Never imply
  certainty the models do not provide.
- Preserve the thesis: success probability alone is weak; triangulation,
  historical replay, and failure magnitude expose where assumptions matter.
- Do not redesign a frozen surface. Extend additively and document the amendment.

## Repository map

- `src/sim/`: CPU and GPU simulation, statistics, historical gauntlet.
- `src/scene/`: three.js r185 WebGPU/TSL scene and simulation orchestration.
- `src/ui/`: client and advisor DOM interfaces.
- `src/store/`: zustand state contracts and additive extensions.
- `docs/`: contracts, calibration, decisions, plans, and operating guidance.
- `validation/`: independent quantitative validation.
- `probe/`: real production TSL graph compilation through Tint.

## Non-negotiable engineering invariants

- Keep `three` exactly at `0.185.1` unless a separately approved migration
  changes every affected contract and probe.
- Preserve CPU↔GPU formula order and f32/u32 behavior. Any simulation formula
  change lands in the TSL kernel and CPU mirror together.
- `SimParams`, `SimStats`, frozen buffer layouts, worker protocol, and operation
  order change only through an explicitly authorized contract amendment.
- Simulation, readback, and stats work runs only on committed parameter changes,
  never in the frame loop or on a slider drag preview.
- Default WebGPU limits are design constraints: 128 MB history buffer, eight
  storage bindings, and adapter-planned line/sprite pools.
- A TSL `select()` result used as an index/comparison must not also feed float
  math. Create a separately typed float twin.
- Probe files import real production node builders; never reproduce shader graphs
  inside the harness.

## Exact commands

Install:

```powershell
npm ci --registry=https://registry.npmjs.org --replace-registry-host=always
```

Development:

```powershell
npm run dev
```

Full verification gate:

```powershell
npx tsc -b
npm run lint
npm run test:sim
npm run test:stats
npm run test:gauntlet
npm run test:validate
npm run test:probe-launcher
npm run build
node probe/run-viz5-probe.mjs
```

Do not report a green baseline when any command was skipped or blocked. Record
environmental limitations separately from product defects.

## Branch and ownership discipline

- Keep W2-A triangulation and W2-B gauntlet visualization on separate branches
  from the same verified base.
- One implementation writer owns a file at a time. Parallel reviewers are
  read-only unless the parent explicitly assigns disjoint files.
- Run the full gate before merging each workstream. Merge in an integration
  branch/worktree, verify again, then promote.
- Do not delete or rewrite user work to make a merge easy.

## Completion evidence

Every handoff states:

- absolute paths changed;
- contract surfaces touched or explicitly untouched;
- exact commands run and their results;
- measured numbers used in UI/docs;
- unresolved risks or environment limitations;
- the corresponding `MEMORY.md` update.

Never store secrets, tokens, signed URLs, or raw environment dumps in repository
documentation.
