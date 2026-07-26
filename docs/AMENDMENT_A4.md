# Amendment A4 — Model Triangulation and Failure-Magnitude Presentation

Authorization: user-approved Wave 2, 2026-07-26.

## Additive surfaces

- `TriStats` and `triStats`/`setTriStats` are additive store extensions.
  `SimParams` and `SimStats` remain unchanged.
- `computeStats()` is the store-free GPU readback path returning
  `{ stats, magnitude }`; `recomputeStats()` remains the compatibility commit
  wrapper for the primary/SWR flow.
- `triStats.successRates` contains one success rate for each frozen return-model
  identifier (`gbm`, `bootstrap`, `fattail`) plus a store-stamped `computedAt`.

## Trigger and consistency contract

- Triangulation runs only for a full committed parameter change.
- Slider previews and safe-withdrawal search iterations do not triangulate.
- All three runs use identical parameters, seed, and active path count; only
  `model` changes.
- GPU secondary runs are sequential. They never commit ordinary or magnitude
  statistics. The selected model is re-run after both secondaries so its path
  buffers again drive every scene consumer before `triStats` commits.
- CPU fallback reuses three sequential jobs through the existing frozen worker
  protocol.
- Any live parameter mutation clears the previous range immediately. Abort/token
  checks prevent stale results from committing.

## Presentation contract

- Advisor view shows all three success rates, their min–max range, and the line
  “Where the models disagree, the assumptions live.”
- Client view retains the selected-model point estimate until all three matching
  results land, then reports the min–max natural-frequency range.
- A3 magnitude fields are now visible in both views. The unfunded obligation is
  explicitly real and undiscounted.
- Worst-decile drawdown copy now states its A3 conditional-mean definition.

## Capability fallback

WebGPU renderer initialization failure and `device.lost` both call
`setMode('cpu')`. CanvasRoot renders the existing CPU fallback whenever the
store mode is CPU, including on a WebGPU-capable browser whose device failed.

## Verification

- `npm run test:triangulation`: model ordering/range and store invalidation.
- Existing simulation, statistics, gauntlet, and validation suites remain green.
- `npm run build` and the real production-node Tint probe remain green.
