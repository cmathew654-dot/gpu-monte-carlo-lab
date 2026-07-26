# CONTRACTS.md — Frozen Kernel Contracts (Agent 2)

**Status: FROZEN at commit of this file — contract v1.1.** Single owner:
Agent 2. Agents 3–7 read, never write. Changes require orchestrator
arbitration (spec §5).

**v1.1 (branch `kernel-history`):** AMENDMENT A1 adds the `pathHistory`
decimated trajectory buffer (§9), its two uniforms (§2), and the matching
additive `runCpuSim` history fields (§6) — the ONE sanctioned exception to
the frozen-contract rule, authorized by the orchestrator at Agent 4's
request (the cone-of-outcomes visual needs true path trajectories, which
the terminal-state-only buffers cannot provide). **Every other section and
guarantee of v1.0 remains FROZEN and byte-stable.**

**v1.3 (branch `p1-math`):** AMENDMENT A3 (§10, user green-light
2026-07-26) fixes four review findings: real equity/bond glidepath mixing
(adds a month-aligned bond region to `bootstrapBlocks`), truthful
worst-decile max-drawdown semantics, seed-mixing decorrelation, and adds
magnitude-of-failure metrics (additive store extension). A1/A2 and all
v1.0 guarantees not explicitly amended by §10 remain FROZEN.

Ground truth: three@0.185.1 (r185), zero TSL name drift (docs/TSL_AUDIT.md).
Readback API is `renderer.getArrayBufferAsync(attribute)` (audit drift
mapping #1) — there is no `readbackAsync`.

---

## 1. Buffers (`src/sim/buffers.ts`)

All per-path buffers are `instancedArray` storage nodes allocated ONCE at
`PATHS_MAX` and never resized (§3.8 trap 3); the active count is the
`uActiveN` uniform.

```ts
export const PATHS_MAX = 1_000_000;
export const BLOCK_LENGTH = 12;
export const BOOTSTRAP_BLOCKS_MAX = 4096; // re-exported from model/bootstrap.ts

export const pathWealth: StorageBufferNode<'float'>;   // current wealth (real $)
export const pathPeak: StorageBufferNode<'float'>;     // running peak, RETIREMENT phase only
export const pathMaxDD: StorageBufferNode<'float'>;    // running max drawdown ∈ [0,1], retirement only
export const pathFailed: StorageBufferNode<'uint'>;    // 0 = active; >0 = failed at step (value−1)
export const pathBlockBase: StorageBufferNode<'uint'>; // Model B: drawn block base = block×12
export const pathBlockRet: StorageBufferNode<'float'>; // applied SIMPLE return this month (debug/viz)
export const bootstrapBlocks: StorageBufferNode<'float'>; // READ-ONLY, 4096×24 (A3 §10), block-major
export const BOND_BLOCKS_OFFSET = 4096 * 12;              // A3 (§10): bond region starts here — same buffer, month-aligned
```

Semantics notes:

- **`pathFailed` doubles as the failure-step record** (§2.5 years-to-failure
  histogram): 0 = never failed, else failedStep = value − 1. Agent 3 reads it
  directly for both the success-rate counter and the failure-step histogram.
- **`pathMaxDD` is an addition beyond the §3.1 list** — §2.5's worst-decile
  max-drawdown stat requires a persistent per-path accumulator; peak alone
  only yields the *current* drawdown.
- Read-only access: `bootstrapBlocks` was built with `.toReadOnly()`.
- CPU-side attribute (for readback/upload):
  `getStorageAttribute(node) → StorageBufferAttribute | StorageInstancedBufferAttribute`
  → pass to `renderer.getArrayBufferAsync(attribute)` (Agent 3) or write
  `.array` + `needsUpdate = true` (Agent 5 data path, via `setBootstrapBlocks`).

## 2. Uniform block (`src/sim/buffers.ts`, spec §3.4)

Written ONLY on parameter change by `runSimulation()` / the store layer —
never per frame. Types are TSL declarations; `.value` is a JS number.

| Uniform | TSL type | Default | Meaning |
|---|---|---|---|
| `uModel` | uint | 1 | 0=gbm, 1=bootstrap, 2=fattail (`MODEL_IDS` in model/returnModels.ts) |
| `uActiveN` | uint | 100000 | active path count; lanes `instanceIndex ≥ uActiveN` early-out |
| `uSeed` | uint | 42 | RNG seed (u32) |
| `uStep` | uint | 0 | current month; written by the driver before EVERY step dispatch |
| `uRetireStep` | uint | 0 | first retirement month = `round(retireYear×12)` |
| `uInitialWealth` | float | 1e6 | starting wealth, real $ |
| `uContribution` | float | 2000 | monthly contribution (accumulation), real $ |
| `uWithdrawal` | float | 5000 | monthly withdrawal (retirement), real $ |
| `uMu` | float | 0.07 | annual real drift (Models A/C) |
| `uSigma` | float | 0.15 | annual real vol (Models A/C) |
| `uGlideEnabled` | uint | 0 | 1 = glidepath active |
| `uGlideStart` / `uGlideEnd` | float | 1.0 / 0.4 | equity allocation at t=0 / at retirement |
| `uBlockCount` | uint | 1 | valid blocks in `bootstrapBlocks` (≤ 4096) |
| `uSnapStride` | uint | 12 | A1/A2: history decimation stride in months (driver: horizon-adaptive — 12 for horizons ≤ 31y, ceil(steps/31) beyond) |
| `uSnapCount` | uint | 31 | A1: valid snapshots per path = min(1+steps/stride, SNAP_MAX) |

Grouped handle: `export const simUniforms = { ... } as const`.

**Glidepath semantics (AMENDED by A3, §10):** equity allocation
`A(t) = lerp(start, end, clamp(t/retireStep))` — linear start→end over the
accumulation phase, constant `end` throughout retirement. The non-equity
fraction is a **bond sleeve**, not cash:
- Models A/C: `μ_eff = A(t)·μ + (1−A(t))·0.019`, `σ_eff = σ·A(t)`.
- Model B: `gross = 1 + A(t)·r_equity + (1−A(t))·r_bond` from the SAME
  drawn block (bond region of `bootstrapBlocks` at `BOND_BLOCKS_OFFSET`,
  month-aligned).
- Glidepath null ⇒ `A(t) = 1` (pure equity) — pre-A3 behavior unchanged.
(Supersedes the v1.0 "μ/σ scale toward zero-return cash, Models A/C only"
interpretation — deviation-log entry 7 is amended by entry 12.)

## 3. Return application (frozen resolution of a §2.2↔§3.1 conflict)

§2.2 defines `r_t` as a monthly **log-return**; §3.1's illustrative snippet
applies `w·(1+r)`. These conflict: `(1+r)` application biases E[ln W_T] by
−σ²T/2 ≈ −2.2% and FAILS §2.6's analytic-moment gate. Frozen resolution:

- **Models A/C:** `wealth *= exp(r_t)` with `r_t = (μ−σ²/2)Δt + σ√Δt·Z`.
  Exact lognormal moments: `E[ln W_T] = ln W0 + (μ−σ²/2)T`,
  `Var[ln W_T] = σ²T` (validated: −0.012% / +0.36% at 100k, seed 42).
- **Model B:** bootstrap block values are SIMPLE historical returns;
  `wealth *= (1 + r_simple)`.
- `pathBlockRet` always stores the applied SIMPLE return (gross − 1).

Cash-flow order (frozen, mirrored in `model/withdrawal.ts`):
`wealth := wealth × gross + cashFlow` — month-END convention;
`cashFlow = +contribution` when `step < retireStep`, else `−withdrawal`.
Retirement-phase bookkeeping: `peak := max(peak, wealth)`;
`maxDD := max(maxDD, clamp((peak−wealth)/max(peak,1e-9), 0, 1))`;
`wealth < 0 ⇒ wealth := 0, failed := step+1` (absorbing; failed lanes
early-out on all later steps).

## 4. RNG contract (`src/sim/model/hash.ts` ↔ `src/sim/kernels/rng.tsl.ts`)

Ported from `node_modules/three/src/nodes/math/Hash.js` (three@0.185.1),
quoted verbatim in hash.ts — PCG RXS-M-XS:

```
state = seed.toUint()·747796405 + 2891336453
word  = ((state >> ((state>>28)+4)) ^ state)·277803737
out   = ((word >> 22) ^ word) → [0,1) via f32(u32)·2⁻³²
```

- `hashU32(seedU)` — bit-identical TS port of TSL `hash()` (single round;
  `Math.fround` reproduces the GPU's u32→f32 conversion). Used by Agent 7's
  §4.7 hash-agreement test (10⁶ samples, max diff must be 0, under the 1e-6
  bound).
- **Seed mixing is in the u32 domain, NOT §2.4's float formula** (authorized
  deviation, §3.8 trap 6): in f32, `float(i)·360 + t` has spacing 32 near
  3.6×10⁸, so 32 consecutive months would share one uniform at 1M paths.
  `stepSeedU(i,t,seed) = i·STEP_STRIDE + t + seed` (u32 wraparound) loses no
  information; TSL `hash()` starts with `seed.toUint()`, so a u32 seed is the
  exact integer-seed case of the same hash. **AMENDMENT A3 (§10):** the
  user seed is folded through ONE raw PCG round first —
  `stepSeedU(i,t,seed) = i·STEP_STRIDE + t + pcgRound(seed)` — because the
  verbatim `+ seed` form reused the whole ensemble shifted by one path for
  seeds a multiple of STEP_STRIDE apart (999/999 measured lane collisions).
- `STEP_STRIDE = 480` (deviation from §2.4's 360): eliminates the
  (i, t≥360) ↔ (i+1, t−360) seed collisions for 40-year horizons.
- `streamHash(seedU)` — **two chained PCG rounds** (§3.8 trap 6 swap,
  measured): one round leaks ~3×10⁻⁵ pairwise correlation over arithmetic-
  progression seeds → Var[ln W_T] inflated +1.03% at 100k×360 (marginal §2.6
  failure). Two rounds: +0.36%, inside estimator noise. CPU↔GPU bit-exact
  (the TSL twin `pcgRound` in rng.tsl.ts applies the same two rounds).
- Stream layout per (path, step): `streamUniform(seedU, j) =
  streamHash(seedU + j·0x9E3779B9)`; Box–Muller pair `j` consumes streams
  `2j, 2j+1` (cosine half only, §3.3 formula). Model A uses pair 0; Model C
  uses pairs 0..5 (Z + χ²₅); Model B's block draw uses
  `streamHash(seedU + 0x85EBCA6B)` only when `step % 12 === 0`.
- Student-t (Model C): `T = Z·sqrt(ν/V)`, `V = Σ₅ Nₖ²`, unit-variance scale
  `sqrt((ν−2)/ν)`, ν=5 (`streamStudentT5` / `studentT5`).

## 5. Resim driver (`src/sim/runSimulation.ts`) — FROZEN SIGNATURE

```ts
export interface RunSimulationOptions {
  renderer: WebGPURenderer;                 // R3F: useThree(s=>s.gl) as unknown as WebGPURenderer
  params: SimParams;                        // frozen store shape (src/store/simStore.ts)
  bootstrapData?: BootstrapBlocksData | Float32Array | null; // REQUIRED iff model==='bootstrap'
  signal?: AbortSignal;                     // cancellable (Agent 3 SWR search)
  onProgress?: (completedSteps: number, totalSteps: number) => void;
  stepsPerChunk?: number;                   // default Infinity (single-shot)
}
export interface RunSimulationResult {
  paths: number;
  steps: number;
  elapsedMs: number;
  dispatchTimestampsMs: number[];           // perf stamp per dispatch (init + each step)
  chunks: number;                           // 1 = single-shot
}
export function runSimulation(options: RunSimulationOptions): Promise<RunSimulationResult>;
```

Behavior: writes the §2 uniform block from `params` → uploads
`bootstrapBlocks` (skipped when the payload reference is unchanged) →
`computeInit` once → `computeStep` × `horizonYears×12` with `uStep = 0..N−1`.
Steps are submitted synchronously (`renderer.compute`, the r185 bitonic-sort
multi-dispatch pattern); only the FINAL step is awaited via
`computeAsync`, so **the promise resolves when GPU state is final** and
Agent 3 may read back immediately. Runs ONCE per parameter change — never
per frame. Chunking (`stepsPerChunk`, yields to rAF between chunks) exists
only as the §4.2 "≤2 frames IF measurement demands it" knob — default is
single-shot; per-dispatch timestamps are returned so Agent 7's perf audit
decides from data. Throws `AbortError`-named Error when `signal` aborts
between dispatches.

## 6. CPU fallback (`src/sim/fallback/cpuSim.ts`) — reference for Agent 7

Pure TS, no DOM/three imports — runs in Node and Web Workers (R4).

```ts
export interface CpuSimResult {
  stats: SimStats;                 // safeWithdrawalRate is 0 — SWR is Agent 3's search layer
  terminalWealth: Float32Array;    // failed paths clamped to 0
  maxDrawdown: Float32Array;       // ∈ [0,1], retirement phase
  failureStep: Int32Array;         // −1 = never failed (== GPU pathFailed−1)
  history?: Float32Array;          // A1 (§9): present iff includeHistory; n×snapCount, no padding
  magnitude: MagnitudeStats;       // A3 (§10): additive, always computed
  elapsedMs: number;
}
export function runCpuSim(
  params: SimParams,
  options?: {
    bootstrapData?: BootstrapBlocksData | Float32Array | null;
    bondBlocks?: Float32Array | null;  // A3 (§10): raw bond bytes (worker path)
    now?: () => number;
    includeHistory?: boolean;      // A1 (§9): default false
  },
): CpuSimResult;
export function quantile(sorted: ArrayLike<number>, p: number): number; // type-7 linear interp
export function worstDecileTailMean(ddSorted: ArrayLike<number>): number; // A3 (§10)
export function magnitudeOfFailure(failureStep, horizonMonths, monthlyWithdrawal, computedAt): MagnitudeStats; // A3 (§10)
```

Mirrors the TSL kernel operation-for-operation (same frozen order, §3
above). Quantile convention: type-7 linear interpolation (numpy default).

### Worker message protocol (for Agent 6's fallback worker)

```ts
// Main → Worker
type CpuSimRequest = {
  type: 'run';
  jobId: number;
  params: SimParams;
  bootstrapBlocks?: ArrayBuffer | null; // Float32Array bytes, blockCount×12, block-major
  bondBlocks?: ArrayBuffer | null;      // A3 (§10): month-aligned bond bytes, required for bootstrap+glidepath
  includePaths?: boolean;               // default false
};
// Worker → Main
type CpuSimResultMessage = {
  type: 'result'; jobId: number; stats: SimStats; elapsedMs: number;
  magnitude?: MagnitudeStats;           // A3 (§10): additive, always present
  paths?: { terminalWealth: ArrayBuffer; maxDrawdown: ArrayBuffer; failureStep: ArrayBuffer;
            history?: ArrayBuffer };   // A1 (§9): Float32Array bytes, n×snapCount
};
type CpuSimErrorMessage = { type: 'error'; jobId: number; message: string };
```

All ArrayBuffers are transferred (zero-copy). Callers discard stale
`jobId`s (debounced supersede). The worker wrapper itself is Agent 6's;
`runCpuSim` is the only entry point it may call.

## 7. Bootstrap data schema (for Agent 5 — `src/data/historicalReturns.json`)

```jsonc
{
  "_meta": {
    "blockCount": 1188,              // ≥1, ≤ BOOTSTRAP_BLOCKS_MAX (4096)
    "blockLength": 12,               // MUST equal 12
    "startDate": "1926-01",
    "endDate":   "2025-12",
    "source": "…exact series + as-of date…"
  },
  "blocks": [ /* blockCount×12 numbers, decimal REAL monthly total returns,
                 block-major: blocks[b*12 + m] = month m of block b;
                 overlapping blocks, start months 0,1,2,… */ ],
  "bondBlocks": [ /* A3 (§10, additive/optional): SAME layout, 10-yr
                 Treasury real TR, month-aligned with blocks */ ]
}
```

Must load via `parseBootstrapBlocksFile()` / `packBootstrapBlocks()`
(`src/sim/model/bootstrap.ts`) with **no transformation** (§4.5 acceptance).
The Agent-1 placeholder (`blockCount: 0, blocks: []`) parses to `null` —
Model B must refuse to run until real data ships (`runSimulation`/`runCpuSim`
throw on missing data). `makeSyntheticBootstrapBlocks()` exists for tests only.

## 8. Deviation log (everything, with reasons)

1. **u32 seed mixing** instead of §2.4's float formula — f32 rounding
   collapses adjacent months at large path counts (§4 above). §3.8.6.
2. **STEP_STRIDE 480** instead of 360 — kills (i,t)↔(i+1,t′) seed collisions
   at >30y horizons (§4 above).
3. **Two chained PCG rounds** for sim streams — single round fails the §2.6
   variance gate by +1.03%; two rounds +0.36% (§4 above, numbers measured).
4. **exp() application of §2.2 log-returns** (Models A/C) instead of §3.1's
   illustrative `(1+r)` — required for §2.6 analytic moments (§3 above).
5. **`pathMaxDD` buffer added** beyond §3.1 — required by §2.5's
   worst-decile-max-drawdown stat.
6. **`pathFailed` = step+1 encoding** — one uint carries flag + failure step
   for the §2.5 histogram.
7. **Glidepath = μ/σ scale toward cash** — §2.3 leaves the blend target
   unspecified; zero-real-return cash is the conservative reading.
   **AMENDED by A3 (entry 12):** the sleeve is now a 1.9 %-real bond
   allocation, matching the calibration doc all along.
8. **`initPaths` initializes ALL PATHS_MAX slots** (no uActiveN gate) —
   one-time cost, guarantees known state if a later run raises pathCount.
9. **hash is validated, not trusted** (§3.8 trap 6): 10⁶-sample χ² test in
   `src/validation/cpuSim.test.mjs` (`npm run test:sim`).
10. **AMENDMENT A1: `pathHistory` added** (v1.1, orchestrator-authorized at
    Agent 4's request) — the terminal-state-only buffers of v1.0 cannot
    render the cone-of-outcomes trajectory fan. See §9. All v1.0 buffers,
    uniforms, semantics, and signatures are unchanged.
11. **AMENDMENT A2: `SNAP_MAX` 40 → 32, horizon-adaptive stride** (v1.2,
    orchestrator-authorized) — A1's 160 MB `pathHistory` binding exceeded
    the WebGPU spec-default `maxStorageBufferBindingSize` (128 MiB) and
    failed bind-group creation on every adapter. 128 MB fits the default
    limit; `uSnapStride` adapts to the horizon so 32 slots still cover 40y.
    See §9. All other buffers, uniforms, semantics, and signatures unchanged.
12. **AMENDMENT A3: glidepath sleeve = bonds, and Model B honors it**
    (§10) — the bootstrap branch silently ignored the glidepath (measured:
    the flagship preset produced byte-identical output with glidepath
    on/off), and Models A/C used the cash proxy while calibration.md §2
    documented the 1.9 %-bond blend. Code now matches the doc.
13. **AMENDMENT A3: `worstDecileMaxDD` = conditional mean of the worst
    decile** (§10) — the frozen NAME is kept (SimStats shape untouched);
    only the semantics changed. The old `quantile(ddSorted, 0.1)` reported
    the SHALLOWEST decile boundary (measured: card showed 41.5 % where the
    median path's max drawdown was 100 %).
14. **AMENDMENT A3: user seed folded through one PCG round** in
    `stepSeedU`/`stepSeed` (§10) — old stepSeedU golden vectors (42,
    480000041) in `cpuSim.test.mjs` are SUPERSEDED and were regenerated
    from the CPU implementation; the `hashU32` goldens still pin the
    verbatim three r185 PCG port. Measured: seeds 42/522 previously shared
    999/999 lanes (shifted ensemble); now zero lane-aligned collisions.
15. **AMENDMENT A3: additive magnitude-of-failure stats** (§10;
    CONTRACTS_STATS.md §10) — new exported `MagnitudeStats` interface +
    `magnitudeStats`/`setMagnitudeStats` store field (SnapshotStats
    pattern). SimStats/SimParams shapes untouched.

## 9. `pathHistory` — decimated trajectory buffer (AMENDMENT A1, v1.1; AMENDMENT A2, v1.2)

**Authorized exception to the frozen-contract rule.** Requested by Agent 4
(visualization), approved by the orchestrator, executed by Agent 2B as the
owning agent. Purpose: render true path trajectories (the cone of outcomes
fanning across the horizon), which the v1.0 terminal-state buffers cannot
express. Single source of truth for the slot math: `src/sim/model/history.ts`
(pure TS, shared by GPU layout, kernels, and cpuSim).

**AMENDMENT A2 (v1.2, orchestrator-authorized, Agent 2C).** A1 sized the
buffer at SNAP_MAX = 40 → 1M × 40 × 4 B = **160,000,000 B**, which exceeds
the WebGPU **spec-default** `maxStorageBufferBindingSize` (134,217,728 B =
128 MiB). three r185 passes `requiredLimits: {}` by default and no raised
limit was requested, so bind-group creation failed with `GPUValidationError`
on EVERY adapter (reproduced live by Agent 7). A2 shrinks **SNAP_MAX 40 →
32** (1M × 32 × 4 B = **128,000,000 B < 134,217,728 B**): the binding fits
the DEFAULT limit everywhere — no `requiredLimits`, no adapter gate. To
still cover the 40y max horizon inside 32 slots the decimation stride
becomes **horizon-adaptive** (see Stride / count below); snapshot, failure,
and addressing semantics are otherwise unchanged.

```ts
export const SNAP_MAX = 32;                       // max snapshots per path (A2)
export const pathHistory: StorageBufferNode<'float'>; // PATHS_MAX × SNAP_MAX
```

- **Slot addressing (path-major, padded):**
  `pathHistory.element(pathIndex * SNAP_MAX + snapIndex)`.
  CPU-side readback (Agent 3/4/7):
  `renderer.getArrayBufferAsync(getStorageAttribute(pathHistory))` →
  `float32[i * SNAP_MAX + s]`. The CPU mirror (`runCpuSim` `history`) uses
  the same semantics in a run-sized layout `history[i * snapCount + s]`
  (no SNAP_MAX padding).
- **Snapshot semantics.** Snapshot 0 = initial wealth (written by
  `computeInit`). Snapshot s ≥ 1 = `pathWealth` at the END of step
  `s·uSnapStride − 1` (i.e. month `s·stride`), written by `computeStep`
  when `(step+1) % uSnapStride === 0`. The write happens AFTER the §3
  failure clamp, so a failure landing exactly on a snapshot step records
  the post-clamp wealth (0).
- **Stride / count (A2: horizon-adaptive).** The driver writes
  `uSnapStride = snapStrideForSteps(steps)` and
  `uSnapCount = min(1 + floor(steps/stride), SNAP_MAX)`; the buffer is
  allocated ONCE at PATHS_MAX × SNAP_MAX and never resized (§3.8 trap 3).
  `snapStrideForSteps` keeps yearly snapshots (stride 12) whenever the
  horizon fits SNAP_MAX at that stride — horizons ≤ 31 years — and widens
  to the smallest stride that fits beyond that, `ceil(steps / 31)`:

  | horizon | steps | stride | snapCount | terminal point |
  |---------|-------|--------|-----------|----------------|
  | ≤ 31 y  | ≤ 372 | 12     | 1 + years (≤ 32) | in the grid (whole-year horizons land exactly) |
  | 32 y    | 384   | 13     | 30        | pathWealth (384 % 13 ≠ 0) |
  | 33 y    | 396   | 13     | 31        | pathWealth (396 % 13 ≠ 0) |
  | 34 y    | 408   | 14     | 30        | pathWealth (408 % 14 ≠ 0) |
  | 35 y    | 420   | 14     | 31        | in the grid (420 % 14 = 0) |
  | 36 y    | 432   | 14     | 31        | pathWealth (432 % 14 ≠ 0) |
  | 37 y    | 444   | 15     | 30        | pathWealth (444 % 15 ≠ 0) |
  | 38 y    | 456   | 15     | 31        | pathWealth (456 % 15 ≠ 0) |
  | 39 y    | 468   | 16     | 30        | pathWealth (468 % 16 ≠ 0) |
  | 40 y    | 480   | 16     | 31        | in the grid (480 % 16 = 0) |

  **Terminal-slot rule:** when the snapshot grid does not land exactly on
  the horizon (`steps % stride ≠ 0`), the terminal value is NOT in
  `pathHistory` — read it from `pathWealth` (terminal state) instead. With
  the adaptive stride the SNAP_MAX cap never binds (1 + floor(steps/stride)
  ≤ 32 for all steps ≤ 480), so this is the ONLY case a consumer needs
  `pathWealth` for the trajectory tip.
- **Failure semantics.** Written for ACTIVE paths only (failed lanes
  early-out on all later steps). A path failing at step f with
  `(f+1) % stride ≠ 0` gets one extra write: the FAILURE SLOT
  `floor(f/stride) + 1` receives the post-clamp wealth (0) — so the last
  snapshot written before/at failure holds the failure-point wealth.
  Valid snapshots per path:
  `validSnapCount(f, steps) = min(floor(f/stride) + 2, uSnapCount)` for a
  failed path (−1/active → `uSnapCount`). `computeInit` zero-fills ALL
  slots every run, so slots at/after the failure slot read 0 — the clamped
  absorbing state — and Agent 4 may render `uSnapCount` slots per path
  uniformly; failed paths drop to 0 at the failure slot and stay 0. Exact
  failure timing remains in `pathFailed` (the failure slot is quantized to
  the next snapshot boundary).
- **Guards.** Both kernel writes are conditional on `slot < uSnapCount`;
  `uSnapStride` must never be 0 (driver invariant). Inactive lanes
  (`≥ uActiveN`) hold init state: slot 0 = initial wealth, rest 0.
- **Memory cost (A2).** PATHS_MAX × SNAP_MAX × 4 B = 1,000,000 × 32 × 4 =
  **128 MB** (128,000,000 B < 134,217,728 B — fits the WebGPU spec-default
  `maxStorageBufferBindingSize` on every adapter, no raised device limit;
  allocated once at startup; brings total sim buffer memory from ~24 MB to
  ~152 MB). CPU mirror is run-sized:
  `pathCount × snapCount × 4 B` (e.g. 100k × 31 × 4 ≈ 12.4 MB), and only
  when `includeHistory` is requested.
- **CPU↔GPU agreement.** `runCpuSim(..., { includeHistory: true })` records
  the same snapshots with the same (horizon-adaptive) stride and slot math;
  element (i, s) must match GPU `pathHistory[i*SNAP_MAX + s]` within the
  usual f32-vs-f64 §2.6 tolerance. Verified in
  `src/validation/cpuSim.test.mjs` (§f).

## 10. AMENDMENT A3 (v1.3) — math-layer review fixes + magnitude-of-failure metrics

**Authorization:** user green-light 2026-07-26, executed on branch
`p1-math` after a four-specialist quantitative review (findings C1, C2,
C5 + the magnitude-of-failure feature request). Everything below is
ADDITIVE to the frozen contracts except the three explicitly-flagged
semantic redefinitions, each with measured justification. CPU↔GPU
bit-exact lockstep is preserved: every formula change landed in BOTH the
TSL kernel and the CPU mirror with identical operation order.

### 10.1 Real glidepath via bond mixing (finding C1)

**Bug:** the Model B (bootstrap) kernel/CPU branch ignored the glidepath
entirely — `muEff`/`sigmaEff` were computed but never read by that branch,
so `{start→end}` was a silent no-op under Model B (measured: the flagship
"Pre-retiree 10-yr glidepath" preset produced BYTE-IDENTICAL terminal
wealth with the glidepath on vs off). Models A/C used a zero-real-return
cash proxy that calibration.md §2 never described (the doc always
specified the 1.9 %-bond blend).

**Fix (CPU↔GPU lockstep):**
- **Model B:** month-aligned mixing from the SAME drawn block index:
  `gross = 1 + A(t)·r_equity + (1−A(t))·r_bond`, `A(t) = glidepathMix(...)`
  (lerp start→end over [0, retireStep], constant `end` afterwards — the
  time fraction clamps at 1, so retirement holds the final allocation).
  The bond element `BOND_BLOCKS_OFFSET + i` aligns with the equity element
  `bootstrapBlocks[i]` (same month windows; Shiller 10-yr Treasury real TR
  deflated identically — see historicalReturns.json
  `_meta.extensions.bondBlocks`).
- **Models A/C:** the blend calibration.md §2 already documents:
  `μ_eff = A(t)·μ + (1−A(t))·BOND_MU_REAL` (`BOND_MU_REAL = 0.019`, the
  measured 1.89 % 10-yr Treasury real arithmetic mean),
  `σ_eff = σ·A(t)` — bond volatility folded conservatively (no extra vol
  term; a slight 60/40 vol overestimate, the safe direction).
- Glidepath null ⇒ `A(t) = 1` pure equity — pre-A3 behavior byte-preserved
  (tested: bootstrap without glidepath is identical with/without bond data
  present).
- **Buffer layout (measured):** `bootstrapBlocks` grows from 4096×12 to
  4096×24 floats — equity region at `[0, BOND_BLOCKS_OFFSET)`, bond region
  at `[BOND_BLOCKS_OFFSET, 2·BOND_BLOCKS_OFFSET)` (month-aligned, gated by
  the same `uBlockCount`), uploaded by the same `setBootstrapBlocks()`
  call (the bond region is zero-filled when the payload has no bonds, so
  stale bonds can never leak into a later run). A SEPARATE `bondBlocks`
  storage buffer was prototyped first and REJECTED: computeStep already
  binds 8 storage buffers — the WebGPU spec-default
  `maxStorageBuffersPerShaderStage` — and a 9th binding failed pipeline
  creation under default limits (measured live on SwiftShader via
  probe/compute-probe.js: "The number of storage buffers (9) in the
  Compute stage exceeds the maximum per-stage limit (8)"). Two regions in
  ONE buffer keep the binding count at 8 — no `requiredLimits`, no
  adapter gate (same principle as A2). +192 kB GPU memory, no new
  uniforms.
- **Fail loud:** `runSimulation`/`runCpuSim` throw on bootstrap +
  glidepath without bond data (never silently mix zeros).
- Worker protocol (§6) gains the additive `bondBlocks` request field.

### 10.2 Truthful worst-decile max drawdown (finding C2)

**Bug:** `worstDecileMaxDD = quantile(ddSorted, 0.1)` of the ASCENDING
sort = the SHALLOWEST decile boundary (measured: the card showed 41.5 %
where the median path's max drawdown was 100 %).

**Fix (semantic redefinition, frozen field NAME kept):**
`worstDecileMaxDD` = conditional MEAN of the worst decile — the mean of
the deepest `max(1, floor(N/10))` per-path max drawdowns. Magnitude-style,
matches the "worst-decile" language. Applied in BOTH `cpuSim.ts`
(`worstDecileTailMean`, exact) and `cpuReference.ts`
(`worstDecileMaxDdFromHistogram`, histogram twin: full bins contribute
their midpoint, the partially-taken boundary bin contributes the mean of
its TOP fraction; agrees with the exact value within half a bin, 1/512).

### 10.3 Seed-mixing decorrelation (finding C5)

**Bug:** `stepSeedU = path·480 + step + seed` reused the entire ensemble
shifted by one path for seeds differing by a multiple of STEP_STRIDE=480
(measured: seeds 42 vs 522 → 999/999 lane collisions, seed-522 path i ≡
seed-42 path i+1).

**Fix:** fold the user seed through ONE raw PCG round before mixing:
`stepSeedU = path·480 + step + pcgRound(seed)` (u32 wraparound), in BOTH
`hash.ts stepSeedU` and `rng.tsl.ts stepSeed` (bit-exact lockstep). The
§4.7 `hashU32` golden vectors are unaffected (they pin the verbatim PCG
port); the two `stepSeedU` golden vectors in `cpuSim.test.mjs` were
REGENERATED from the CPU implementation (old values 42 / 480000041
superseded by 1223963391 / 1703963390). The §2.6 analytic-moment gates
still pass. New regression test: seeds 42/522 produce zero lane-aligned
identical paths and zero shifted-ensemble reuse.

### 10.4 Magnitude-of-failure metrics (new feature)

Vanilla MC's binary success metric hides that failure has a SIZE. Two new
stats over FAILED paths (conventions: CONTRACTS_STATS.md §10):
- `medianShortfallYears` = median of (horizonMonths − failureMonth)/12;
- `medianUnfundedObligation` = median of (horizonMonths − failureMonth) ×
  monthly withdrawal (real, UNDISCOUNTED — documented convention).
Both null when nothing failed. Delivery is ADDITIVE: new exported
`MagnitudeStats` interface + `magnitudeStats`/`setMagnitudeStats` store
field (the SnapshotStats pattern); SimStats is untouched. Computed where
`medianFailureYear` is computed: exactly in `runCpuSim`
(`magnitudeOfFailure`, per-path), and from the decoded failure-step
histogram in `extractMagnitudeStats` (GPU readback path — medians commute
with the monotone shortfall transform, so no per-path readback is
needed). GPU-mode delivery: `recomputeStats` populates the store field
directly (its ONE store write — the frozen SimDriver integrator is
outside A3's scope; documented in CONTRACTS_STATS.md §10). CPU mode: the
additive `magnitude` field of the §6 worker result message, wired through
`useCpuSim`.

### 10.5 What A3 deliberately does NOT change

- SimParams/SimStats shapes, buffer names/types (the A3 bond data rides
  in a second region of the existing `bootstrapBlocks` buffer — no new
  binding, no reshape of any per-path buffer), the §5 `runSimulation`
  signature, the A1/A2 snapshot contract (§9), the PCG hash itself, and
  all §2.6 tolerance gates.

## Amendment A4 (Wave 2)

Model triangulation, store-free secondary stats, failure-magnitude presentation, and device-loss CPU fallback are specified in [AMENDMENT_A4.md](AMENDMENT_A4.md). Frozen shapes and A3 semantics remain unchanged.

## 11. ADDENDUM (Amendment A4, Part B): Historical gauntlet presentation

The additive deterministic replay path, dedicated store, 840-byte view-buffer
layout, committed-parameter trigger, failure/exhaustion metadata, and seven-
storage-binding Rainier graph are specified in
`docs/AMENDMENT_A4_W2B.md`. Frozen `SimParams`, `SimStats`, stochastic buffer
layouts, kernels, and worker protocol are unchanged.
