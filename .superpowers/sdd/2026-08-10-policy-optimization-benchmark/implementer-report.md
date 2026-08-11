# Policy optimization benchmark implementation report

Worktree: `C:\Users\Cyril\GPU-Monte-Carlo-Lab-wt\policy-benchmark`
Branch: `feat/policy-benchmark`

## RED evidence

Before production files existed, the focused test was bundled with:

`& .\node_modules\.bin\esbuild research\policy-benchmark\policyBenchmark.test.mjs --bundle --platform=node --format=esm --outfile=node_modules\.tmp\policy-benchmark.test.bundle.mjs; node node_modules\.tmp\policy-benchmark.test.bundle.mjs`

Result: RED in approximately 4.9 seconds. esbuild failed for the expected missing-feature reason: `Could not resolve "./benchmark.ts"` and `Could not resolve "./report.ts"`.

## Implementation

Added the dependency-free paired historical cross-fit harness, finite-horizon policy optimizer, fixed/guardrail counterpart selection, common-random-number path matrices, severe-tail metric, paired bootstrap intervals, separate mathematical/implementable verdicts, deterministic JSON serialization, and standalone accessible HTML report.

## Files changed

- `C:\Users\Cyril\GPU-Monte-Carlo-Lab-wt\policy-benchmark\research\policy-benchmark\benchmark.ts`
- `C:\Users\Cyril\GPU-Monte-Carlo-Lab-wt\policy-benchmark\research\policy-benchmark\report.ts`
- `C:\Users\Cyril\GPU-Monte-Carlo-Lab-wt\policy-benchmark\research\policy-benchmark\run.ts`
- `C:\Users\Cyril\GPU-Monte-Carlo-Lab-wt\policy-benchmark\research\policy-benchmark\policyBenchmark.test.mjs`
- `C:\Users\Cyril\GPU-Monte-Carlo-Lab-wt\policy-benchmark\package.json`
- `C:\Users\Cyril\GPU-Monte-Carlo-Lab-wt\policy-benchmark\research\policy-benchmark\out\policy-benchmark.json`
- `C:\Users\Cyril\GPU-Monte-Carlo-Lab-wt\policy-benchmark\research\policy-benchmark\out\policy-benchmark.html`

## Verification

1. `npm run test:policy-benchmark` — PASS, 7/7 focused tests, 35.00 seconds wall time.
2. `npm run benchmark:policy -- --preview` — PASS, emitted `PREVIEW — NO VERDICT`, 17.78 seconds wall time; benchmark runtime recorded in JSON: 17,307 ms.
3. Preview JSON integrity — PASS: 12 frontiers, 3 wealth states, both verdicts `inconclusive`, no `NaN` or `Infinity`, reverse fold training metadata ends at `2026-06` while full-year training blocks end at `2025-12`.
4. Preview HTML integrity — PASS: mathematical and implementable verdicts lead the report; inline SVG and semantic table equivalents are present; limitations are disclosed; no external script or Inter font stack.

## Commit

Implementation commit SHA: `01c05fe`.

## Self-review

- Existing product source and contracts were not modified.
- No dependencies were added.
- Preview defaults to inconclusive and the CLI accepts only `--preview`, `--full`, or no flag.
- Training and validation use disjoint dates within each fold and share common block-start matrices for paired comparisons.
- The report explicitly labels mathematical freedom as research evidence, not advice.

## Limitations

Cross-fit is not an external never-touched dataset. Bootstrap intervals are conditional on two historical eras. Thirty-six-month validation blocks miss longer dependence. The implementable comparison ignores taxes, costs, RMDs, cash flows, mortality, and allocation-change limits. No consumption-smoothing utility is modeled. Full 20,000/50,000-path certification was not run because the plan gates it behind review of the preview.
