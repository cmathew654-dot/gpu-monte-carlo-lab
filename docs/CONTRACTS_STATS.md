# CONTRACTS_STATS.md — Stats Module Contracts (Agent 3)

**Namespace addition.** This document extends (never modifies)
`docs/CONTRACTS.md` per the spec §5 conflict rules. Owner: Agent 3.
Consumers: Agents 6 (integration), 7 (validation). Ground truth:
three@0.185.1 (r185), docs/TSL_AUDIT.md.

---

## 1. Histogram atomicity decision (spec §2.5 — Agent 3 owns this)

**DECISION: TSL `atomicAdd` on a uint storage buffer is USED.** The §2.5
fallback (per-path bin-index buffer + CPU build) is NOT needed.

Evidence in the pinned three@0.185.1:

1. **Runtime:** `import { atomicAdd, atomicMin, atomicMax, atomicStore,
   atomicLoad } from 'three/tsl'` all resolve to functions
   (`node --input-type=module` check). `instancedArray(n,'uint').toAtomic()`
   exists (`StorageBufferNode.toAtomic()`, verified live).
2. **Source:** `node_modules/three/src/nodes/gpgpu/AtomicFunctionNode.js`
   implements the full atomic op set; the WGSL backend
   (`src/renderers/webgpu/nodes/WGSLNodeBuilder.js:2163`) emits
   `atomic<u32>` storage element types when `bufferNode.isAtomic` is set.
3. **Types:** `@types/three@0.185.0` declares `atomicAdd` etc. in
   `Three.TSL.d.ts` and `toAtomic()` in `StorageBufferNode.d.ts`.
4. three.js r185 ships `webgpu_compute_atomic*.html` examples using this
   exact pattern (`instancedArray(...).toAtomic()` + `atomicAdd`).

The CPU builder (`buildHistogramsFromPaths` in cpuReference.ts) remains as
(a) the Node-test fixture and (b) the standing §2.5 fallback.

## 2. Stats buffer layout (Agent-3-owned, single readback source)

One packed atomic uint32 buffer, `statsBuffer` in
`src/sim/stats/histogram.tsl.ts` — 995 uints ≈ 3.9 kB:

| Slot(s) | Content |
|---|---|
| 0 | min terminal-wealth float bits (atomicMin; cleared to 0xFFFFFFFF) |
| 1 | max terminal-wealth float bits (atomicMax) |
| 2 | failure counter (atomicAdd; == sum of failure-step histogram) |
| 3..258 | terminal-wealth histogram — 256 log-spaced bins over the DYNAMIC [min,max] range (slots 0/1) |
| 259..514 | max-drawdown histogram — 256 linear bins over [0,1] |
| 515..994 | failure-step histogram — 480 bins, bin b = failure at month b (from `pathFailed − 1`) |

Layout constants live in `cpuReference.ts` (`SLOT_*`, `WEALTH_BINS`,
`DD_BINS`, `FAIL_BINS`, `STATS_UINTS`, `WEALTH_LOG_FLOOR`) and are the
single source of truth shared by the TSL passes and the CPU extractor.

Wealth is clamped to ≥ $1 (`WEALTH_LOG_FLOOR`) before log-binning; bin 0
additionally holds all sub-floor mass including failed paths ($0). The
extractor treats the first `failedCount` entries of bin 0 as EXACT zeros
(parity with the exact CPU reference for p5/p25 in failure-heavy runs).

**Why dynamic range:** §2.6 demands median ±1% / p5,p95 ±2% vs the exact
CPU reference. A fixed decade range wastes bins; the observed [min,max]
range keeps 256 log bins tight (≈2.7%/bin at a 3-decade spread), and
log-space in-bin interpolation is near-exact for lognormal-ish tails.
Min/max come from order-preserving float-bit atomics — no extra readback
(pass 3 reads slots 0/1 GPU-side via `atomicLoad`).

## 3. recomputeStats signature (orchestrator-facing, spec §4.3 task 6)

```ts
export async function recomputeStats(
  renderer: WebGPURenderer,
  opts: RecomputeStatsOptions,
): Promise<SimStats>;

export interface RecomputeStatsOptions {
  params: SimParams;                     // whose sim state is on the GPU NOW
  bootstrapData?: BootstrapBlocksData | Float32Array | null;
  withSafeWithdrawal?: boolean;          // default false — see §5
  signal?: AbortSignal;                  // abort supersedes in-flight work
  onProgress?: (stage: StatsStage, completed: number, total: number) => void;
  onStats?: (stats: SimStats) => void;   // readback stats, then final stats
  now?: () => number;                    // test clock
}
export type StatsStage = 'readback' | 'safe-withdrawal' | 'restore';
```

**This module never touches the Zustand store.** Integrator wiring:

```ts
useSimStore.getState().setStats(await recomputeStats(renderer, opts));
```

## 4. Readback triggers (§1.4 data-flow rule)

- `recomputeStats` is called ONLY on parameter-change completion, AFTER
  the matching `runSimulation()` promise resolved (GPU state final,
  CONTRACTS.md §5). NEVER per frame.
- One recompute = 3 compute dispatches (clear → reduce → histogram) +
  ONE `renderer.getArrayBufferAsync(getStorageAttribute(statsBuffer))`
  (r185 readback API, audit drift mapping #1). WebGPU queue ordering makes
  the copy follow the dispatches; no fence needed.
- Abort contract: rejects with an `AbortError`-named `Error`. Call sites
  must catch-and-swallow aborts (superseded work is not an error).

## 5. Safe-withdrawal search (spec §2.5 / §4.3 task 5)

- `findSafeWithdrawal(run, opts, params?)` (`safeWithdrawal.ts`) is pure
  and runner-injected; `recomputeStats` supplies a runner that re-sims at
  **100k paths** (`SWR_PATH_COUNT`) and reads back the success rate.
- Binary search on monthly withdrawal; stop band successRate ∈
  [89.5%, 90.5%], max 8 iterations (+ ≤2 bracket probes at the bounds).
  Upper-bound heuristic: `upperBoundForParams(params)` = 2× the linear
  exhaustion rate of the at-retirement nest egg.
- **GPU-state side effect (integrators MUST know):** the search overwrites
  the shared per-path buffers (withdrawal ≠ user's, 100k paths). On
  success, `recomputeStats` RE-RUNS `runSimulation` with the original
  params to restore visualization state (stage `'restore'`). If the search
  is ABORTED, restore is skipped — the caller's normal parameter-change
  flow re-sims anyway, so state self-heals on the next commit.
- Because of this side effect, `withSafeWithdrawal` defaults to false —
  wire it to an explicit user action (e.g. a "compute safe withdrawal"
  button), not to every slider tick.

## 6. Debounce ownership (no double-debounce)

- **Agent 6's store debounces slider→setParams at 150 ms** (spec §4.6
  task 3). `recomputeStats` therefore does NOT debounce; call it on
  committed param changes, one fresh `AbortController` per change (abort
  the previous one).
- A generic trailing-edge `debounce(fn, 150)` helper IS exported from
  `recomputeStats.ts` for non-store callers only. Do not stack it on top
  of the store debounce.

## 7. CPU mode

In CPU fallback mode the worker path (CONTRACTS.md §6 protocol) returns
`runCpuSim`'s SimStats directly — no GPU readback is involved. This module
is GPU-mode only. `runCpuSim`'s `safeWithdrawalRate: 0` convention is
preserved: the search layer owns that field in both modes.

## 8. Tests

`npm run test:stats` (esbuild → Node, no GPU): histogram→quantile
extraction vs runCpuSim's exact quantiles within §2.6 tolerances, bin-0
zero-mass handling, packed-buffer decode round trip, determinism (R3),
the A3 worst-decile-mean and magnitude-of-failure extraction (§10),
and the binary search (convergence, budget, brackets, AbortSignal) with
both mock and runCpuSim-backed runners. 52 checks (40 pre-A3 + 12 A3).

## 9. ADDENDUM (viz3): hero-path readback — additive, no layout changes

viz3 adds ONE more param-change-only readback: `readHeroPathIndex()` in
`src/sim/stats/heroPath.ts` reads back `pathWealth` (the frozen §3.1
buffer — READ, never written) and picks the RENDERED, SURVIVING path
whose terminal wealth is closest to the run's median
(`SimStats.percentiles.p50` from the §2 terminal pass — no extra stats
pass). The picked index lands in the store's additive `heroPathIndex`
field and drives the cone/threads `uHeroPath` visual uniform.

- **Trigger:** identical to §4 — only after `runSimulation()` resolves,
  once per landed run (full-count AND 10k live-drag previews; the hero
  must exist in the sim class currently on the GPU). Never per frame.
- **Cost:** ONE `getArrayBufferAsync(getStorageAttribute(pathWealth))`.
  The buffer is allocated at PATHS_MAX, so the copy is 4 MB at capacity
  (400 kB of it meaningful at 100k paths) — one shot per re-sim, inside
  the existing readback envelope; CPU scan of ≤ 1M floats, strided by
  the render subset.
- **Renderability:** the scan stride is the cone's path subset × the
  line-budget stride (`lineStrideForBudget`, shared with
  TrajectoryLines via `spritePlan.ts`), so the hero is always a path
  BOTH the sprites and the threads render.
- **No frozen changes:** no buffer, kernel, SimParams, SimStats, or
  stats-layout modification. Failure/abort semantics per §4 (aborts
  swallowed; a hero readback failure is logged and does NOT invalidate
  the landed stats).

## 10. ADDENDUM (Amendment A3): truthful worst-decile DD + magnitude-of-failure stats

Authorized with CONTRACTS.md §10 (user green-light 2026-07-26). Additive
to this document; the frozen SimStats shape and the §2 buffer layout are
untouched.

### 10.1 `worstDecileMaxDD` semantic redefinition (finding C2)

`extractSimStats` now computes `worstDecileMaxDD` as the CONDITIONAL MEAN
of the worst decile of per-path max drawdowns
(`worstDecileMaxDdFromHistogram`): the deepest `max(1, floor(N/10))`
paths' mean max-DD. Full bins contribute their midpoint; the
partially-taken boundary bin contributes the mean of its TOP fraction
(uniform-in-bin). Parity with `runCpuSim`'s exact `worstDecileTailMean`
within half a bin (1/512), inside the §2.6 tolerances (tested in
`stats.test.mjs` §b/§h). The pre-A3 `quantile(ddHist, 0.1)` was the
SHALLOWEST decile boundary — measured 41.5 % where the median path's
maxDD was 100 %.

### 10.2 Magnitude-of-failure metrics (new store field)

New ADDITIVE store extension (SnapshotStats pattern — frozen SimStats
untouched): `MagnitudeStats` + `magnitudeStats`/`setMagnitudeStats` in
`src/store/simStore.ts`:

```ts
interface MagnitudeStats {
  medianShortfallYears: number | null;       // median (horizonMonths − failureMonth)/12 over FAILED paths
  medianUnfundedObligation: number | null;   // median (horizonMonths − failureMonth) × monthly withdrawal
  failedPaths: number;
  computedAt: number;
}
```

**Conventions (documented, deliberately simple):**
- `failureMonth` is the recorded failure step (0-indexed month of ruin,
  `pathFailed − 1`); `shortfallMonths = horizonMonths − failureMonth`.
- The unfunded obligation is a REAL, **UNDISCOUNTED** sum of the unpaid
  monthly withdrawals after ruin — no discount-rate assumption is
  smuggled in; it answers "how big is the hole", not a present value.
- Both are medians over FAILED paths only; both are `null` when no path
  failed (the honest "nothing to report" state).

**Computation paths (where `medianFailureYear` is computed):**
- CPU: `magnitudeOfFailure()` in `cpuSim.ts` (exact, per-path), always
  returned as the additive `CpuSimResult.magnitude`; the §6 worker
  protocol carries it as the additive `magnitude` message field and
  `useCpuSim` populates the store.
- GPU: `extractMagnitudeStats()` in `cpuReference.ts` derives both from
  the SAME decoded failure-step histogram — both stats are medians of a
  strictly monotone (decreasing linear) transform of the failure month
  and medians commute with monotone transforms, so they equal the
  transform of the median failure month exactly; no per-path readback is
  needed. Consistency with `medianFailureYear` is tested
  (`stats.test.mjs` §i2).

**Delivery deviation (sanctioned):** `recomputeStats` populates
`magnitudeStats` directly via `useSimStore.getState().setMagnitudeStats()`
when the caller supplies no `onMagnitudeStats` callback — the module's
ONE store write, an A3 exception to §3's "never touches the store" rule,
made because the frozen SimDriver integrator wiring is outside A3's
scope. The frozen SimStats flow remains store-free. Trigger, abort, and
staleness semantics are identical to §4 (same readback, same commit
boundary).


## Amendment A4 (Wave 2)

Model triangulation, store-free secondary stats, failure-magnitude presentation, and device-loss CPU fallback are specified in [AMENDMENT_A4.md](AMENDMENT_A4.md). Frozen shapes and A3 semantics remain unchanged.
