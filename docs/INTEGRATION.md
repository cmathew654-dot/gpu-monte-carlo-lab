# INTEGRATION.md — GPU-mode wiring (integrator)

Wires Agent 2's sim driver, Agent 3's stats, Agent 4's reveal, Agent 5's
data, and Agent 6's store/UI into a live GPU data flow. No component was
redesigned; no frozen file was modified.

## Files

| File | Change |
|---|---|
| `src/scene/SimDriver.tsx` | **New.** GPU sim driver, mounted inside the R3F Canvas. |
| `src/scene/CanvasRoot.tsx` | +2 lines: import + `<SimDriver />` in the WebGPU branch. |
| `src/ui/SwrButton.tsx` | **New.** On-demand safe-withdrawal trigger (`.btn .btn--secondary`). |
| `src/app/App.tsx` | +2 lines: import + `<SwrButton />` next to `<StatCards />`. |
| `src/app/theme.css` | +1 rule block: `.swr-dock` positioning (button reuses Agent 6's `.btn`). |

## Wiring trace (param drag → pixels)

1. Slider drag → `setParams` (live `params`, `isStale: true`) → 150 ms
   trailing debounce → `committedParams` advances (simStore.ts, Agent 6).
2. `SimDriver` subscribes to `committedParams` via
   `useSimStore.subscribe` (identity compare against a local ref — same
   pattern as `useCpuSim`). On change (and once on mount, so the scene is
   never empty):
   - aborts the in-flight run (one `AbortController` per change),
   - `markRecomputing(true)` (StatCards shimmer),
   - `await runSimulation({ renderer, params, bootstrapData, signal })`
     — `renderer = useThree((s) => s.gl) as unknown as WebGPURenderer`;
     `bootstrapData` = `parseBootstrapBlocksFile(historicalReturns.json)`
     parsed once (1195 blocks × 12, CONTRACTS §7; runSimulation skips the
     re-upload while the reference is unchanged),
   - `await recomputeStats(renderer, { params, bootstrapData, signal })`
     with `withSafeWithdrawal: false` (SWR is on-demand,
     CONTRACTS_STATS §5),
   - `setStats(stats)` — stamps `computedAt` at the store boundary,
   - `markRecomputing(false)` (only if this run is still current).
3. `setStats` → `stats.computedAt` changes → `ConeParticles`' existing
   subscription resets `revealStart` → the 4 s reveal sweep restarts
   (verified: ConeParticles.tsx lines 380–395). No new store fields.
4. `setStats` → `StatCards` re-render with fresh percentiles/SWR/DD.
5. `isStale` clears on `setStats`; shimmer hides.

## Safe withdrawal on demand

`SwrButton` (docked left of the right stat rail; GPU mode only — the CPU
pipeline already computes SWR automatically in `useCpuSim`) calls
`simRuntime.requestSafeWithdrawal()`, which re-enters the **same**
SimDriver pipeline with `withSafeWithdrawal: true` for the current
`committedParams`: abort → `markRecomputing(true)` → runSimulation →
recomputeStats (readback → ≤10-search at 100k paths → restore re-sim per
CONTRACTS_STATS §5) → `setStats` → `markRecomputing(false)`. Pending
state rides the existing `isRecomputing` flag; the button label switches
CALC SAFE WR → CALCULATING… → RECALC SAFE WR.

## Error handling

- Superseded runs are swallowed **only when our own signal aborted**
  (`signal.aborted`), not by matching `err.name === 'AbortError'` —
  Chromium rejects `GPUBuffer.mapAsync` on a dead device with an
  'AbortError'-named DOMException, and name-matching silently swallowed a
  real device failure during smoke testing. (Found and fixed here; this
  was the one genuine integration bug.)
- Any other failure (WGSL compile, missing bootstrap data, dead device)
  → `console.error('[SimDriver] GPU simulation failed:', err)` +
  `markRecomputing(false)`; `isStale` stays true so the UI honestly shows
  the stale/shimmer state until a later commit succeeds. No store shape
  additions.

## Gates

- `npx tsc -b` — clean.
- `npm run build` — clean.

## Smoke tests (headless Chromium 150, this container)

**CPU path (`?cpu=1`) — PASS.** Stats land (success 69.8%, P50 $1.67M at
default params), SWR button correctly hidden, shimmer reflects the
worker pipeline. (A pre-existing, non-integration GLSL compile error
from ConeParticles' TSL appears in this mode *without* WebGPU flags —
the `?cpu=1` override keeps the canvas mounted, three falls back to the
WebGL2 backend, and Agent 4's material doesn't compile as GLSL. Frozen
files; reported, not touched.)

**GPU path — verified up to a documented environment limitation.**
WebGPU *is* available headless (SwiftShader adapter; a raw probe
dispatched compute + mapAsync successfully and a 160 MB storage buffer
allocated fine). Instrumented run shows the full wiring firing:
SimDriver effect enters in `gpu` mode → runPipeline starts →
`runSimulation` resolves (init + 360 step dispatches, 5 compute
pipelines: init/step/clear/reduce/histogram) → `recomputeStats` reaches
the 3,980-byte (995-uint) stats-buffer readback — and then fails:
Chromium **destroys the WebGPU device ~1.4 s after init** in this
container (`device.lost → "destroyed"`; swap-chain SharedImage creation
fails under headless SwiftShader:
`Could not find SharedImageBackingFactory … WebGPUSwapChainTexture`).
Reproduced across 7 flag combinations (`--in-process-gpu`,
`--disable-gpu-sandbox`, `--use-angle=swiftshader`,
`--disable-gpu-compositing`, `--single-process`, …) and 2 browser
binaries; it also happens with SimDriver gated off (render-only), while
an idle raw WebGPU device on the same page survives 40 s+. The driver
now surfaces this as a real console error instead of hanging. **The GPU
stats landing could not be demonstrated in this environment and is not
faked** — on real WebGPU hardware the same code path ends at
`setStats(...)` one microtask after the readback that was reached here.
