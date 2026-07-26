# probe/ — headless WebGPU shader harness

This harness proves the production TSL shader graphs actually compile: it
drives headless Chromium (SwiftShader WebGPU) against a vite dev server,
builds materials from the REAL production node builders
(`mountainTrailNodes.ts`, `gauntletTrailNodes.ts`,
`mountainEmberNodes.ts`, `summitNodes.ts`, `terrainColor.ts`) over the REAL
baked terrain asset and route generation,
and forces WGSL compilation via `renderer.debug.getShaderAsync` — Tint
(Dawn's compiler) rejects anything invalid, so a green run means the
shaders a client GPU will see are valid, not just plausible.

Run: `node probe/run-viz5-probe.mjs` (exit 0 = every graph compiled, zero
GPU validation errors; requires chromium + a global playwright install).

The `out-*.wgsl` dumps are committed on purpose: they are reviewable
snapshots of the exact WGSL each production graph emits, so shader drift
shows up as a readable diff in code review.
