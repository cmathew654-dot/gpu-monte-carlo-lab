# Wave 2 Execution Plan

Status: base verified at `36e428d`; implementation not started.

## Base preparation

- [x] Initialize the imported source as a Git repository.
- [x] Install locked dependencies.
- [x] Fix only the cross-platform probe launcher necessary to reach the real Tint
  compile on Windows.
- [x] Run and record the full baseline against the base commit.
- [x] Create `p2-trig` and `p2-gauntletviz` from the final documented base.

## W2-A — Model triangulation and failure magnitude

### Outcome

On every committed parameter change, all three return models run with identical
parameters, seed, and path count. The selected model still exclusively drives
the primary stats and scene, while UI reports model disagreement and failure
magnitude.

### Work

1. Refactor GPU stats into pure compute plus primary commit wrapper.
2. Add an additive `triStats` store extension; do not alter `SimParams` or
   `SimStats`.
3. In `SimDriver`, run primary first, then the two secondary models
   sequentially with matching abort behavior.
4. Restore primary GPU buffers before committing triangulation.
5. In CPU mode, reuse sequential existing worker jobs.
6. Clear stale triangulation on live parameter changes; do not triangulate
   slider previews or SWR search iterations.
7. Add advisor triangulation and failure-magnitude cards.
8. Change client headline to a range only after all model results land.
9. Extend client failure text with median shortfall years and unfunded real
   obligation.
10. Correct the drawdown sub-label to conditional worst-decile mean.
11. Route device-init failure and `device.lost` to `setMode('cpu')`.
12. Refresh `DEMO.md` only from measured validation output.
13. Document Amendment A4 and add focused tests.

### Acceptance

- Secondary computation causes no store write before the explicit
  triangulation commit.
- Primary selected-model stats and buffers match pre-refactor output.
- Stale/aborted results never land.
- Client and advisor range share the same `triStats`.
- Full root verification gate passes on `p2-trig`.

## W2-B — Historical gauntlet presentation

### Outcome

Six deterministic historical retirement cohorts appear as readable client
chips, a precise advisor table, and distinct Rainier paths using the same
wealth-height visual language as stochastic trails.

### Work

1. Extend the pure gauntlet engine additively to retain monthly wealth paths.
2. Add a dedicated gauntlet zustand store computed on committed changes.
3. Use `glidepathMix` when enabled; otherwise use constant allocation 1.0.
4. Sample each cohort onto the existing adaptive `SNAP_MAX = 32` grid.
5. Preserve separate end, failure, and exhausted-data metadata.
6. Add `GauntletPanel`:
   - client: six year/status chips and one evidence-grounded narrative;
   - advisor: full cohort table including maxSWR.
7. Add a small planned buffer for `6 × 32` floats plus metadata.
8. Build a dedicated production TSL graph derived from the mountain trail
   visual language.
9. Assign six fixed golden-angle routes around the central +Z route.
10. Use distinct glacial/alpine hues, non-color status cues, shared `uReveal`,
    ember-red failure termination, and neutral exhausted-data termination.
11. Import the real builder into the probe.
12. Document Amendment A4 and add engine/store/graph tests.

### Acceptance

- Cohort table agrees with pure engine outputs.
- 1966 at 4% fails near year 28 and 1929 survives under the documented
  convention.
- Trails stop correctly for failure and exhaustion.
- No new default-limit violation or mixed uint/float select.
- Full root verification gate passes on `p2-gauntletviz`.

## Integration and Wave 3

- Merge in an integration worktree.
- Run the full gate again.
- Move completed plans into `docs/exec-plans/completed/`.
- Promote triangulation, gauntlet, and magnitude from roadmap to feature
  sections with current measured numbers.
- Deploy a static build and replace the live-demo/GIF placeholder.

## Explicitly optional

Code-split the GPU allocation path so CPU mode does not pay the module-scope
history-buffer cost only if it remains a clean, contract-preserving change.
