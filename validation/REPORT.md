# VALIDATION REPORT — GPU Monte Carlo Lab

**Agent 7 (Validation, QA & Demo Script) · final gate**
Date of run: 2026-07-21 · Branch: `validation` · Machine: Linux container, Node 20.20.2, headless Chromium 150 (SwiftShader WebGPU)

---

## Re-validation 2026-07-21 (Agent 7B) — gate re-run after the A2/F3 fix

Scope: verify Agent 2C's fixes (commit `bfdc0f2`, merged `7b3720a`) for
FINDING-1 (AMENDMENT A2: SNAP_MAX 40→32, horizon-adaptive stride) and
FINDING-3 (CPU-mode first load cap), re-run every suite, re-issue the verdict.

| Check | Result |
|---|---|
| `src/sim/model/history.ts` SNAP_MAX | **32**; `snapStrideForSteps` = 12 for horizons ≤ 31y, `ceil(steps/31)` beyond — table in CONTRACTS §9 re-derived independently, all 10 rows exact |
| `docs/CONTRACTS.md` §9 A2 amendment | Present (v1.2, items 10–11); stride/count/failure/terminal-slot semantics consistent with code |
| Driver / kernels / viz / CPU mirror | `runSimulation.ts` writes `uSnapStride/uSnapCount` from `snapStrideForSteps`/`snapCountForSteps`; `stepPaths.tsl.ts` writes guarded by `slot < uSnapCount`; `initPaths.tsl.ts` zero-fills all 32 slots; `ConeParticles.tsx` derives stride from `snapStrideForSteps` (no hardcoded 40/12); `cpuSim.ts` mirrors the same math. Zero stale `SNAP_MAX = 40` references repo-wide |
| Binding-size arithmetic | 1,000,000 × 32 × 4 B = **128,000,000 B < 134,217,728 B** (128 MiB spec default) — margin 6,217,728 B. Full buffer inventory re-audited: next-largest bindings are the six per-path buffers at 4,000,000 B each, bootstrapBlocks 196,608 B, statsBuffer 3,980 B — no other binding comes near the limit; total GPU memory now ~152 MB (was ~184 MB) |
| **Independent binding-size probe** (headless Chromium, SwiftShader WebGPU, `requiredLimits: {}` — three r185's default) | Device limit confirmed **134,217,728** even though the adapter advertises 1,073,741,824. **128,000,000 B: bind-group created, compute dispatched, readback = 42.0, zero validation errors.** Discriminating control at the old A1 size (160,000,000 B) reproduced Agent 7's exact `GPUValidationError` — the probe passes iff the fix is real. Probe script shipped: `src/validation/probe_binding_size.mjs` (§10 row) |
| F3 behavioral check | Bundled `simStore.ts` in Node (no `navigator` → CPU mode): initial `committedParams.pathCount === 10_000` (was 100,000) — the driver-facing value is capped **at init**, not just from the first commit. `normalizeParams(DEFAULT_SIM_PARAMS, initialMode)` at `simStore.ts` store creation; `useCpuSim.ts` subscribes to `committedParams` only |
| `npm run test:sim` | **56/56 PASS** (was 50/50 — new A2 tests f6/f6b: 40y → stride 16, 31 snapshots, terminal==last snapshot; failure-slot math at stride 16) |
| `npm run test:stats` | **40/40 PASS** |
| `npm run test:validate` | **56/56 PASS** |
| `node src/data/validate_data.mjs` | **108/108 PASS** |
| `npx tsc -b` / `npm run build` | clean / clean (12.0 s; chunk-size warning informational only) |
| New blockers found | **None.** One cosmetic observation (not new, not a blocker): in CPU mode the path-count segmented control highlights `params.pathCount` (100k, disabled buttons >10k) while the sim correctly runs the capped 10k from `committedParams`; the badge text is accurate. |

New test-count total: **260/260 green** (56+40+56+108), up from 254/254.

---

## VERDICT SUMMARY — **SHIP** (revised by Agent 7B, 2026-07-21; see caveat below)

| Req | Verdict | One-line basis |
|---|---|---|
| **R1** (1M×360 TSL compute, ≥30 fps, resim ≤2 frames) | **PASS-WITH-EXCEPTION** | Binding-limit blocker RESOLVED (FINDING-1: A2 fix probe-verified — 128 MB binding passes with default limits, control at 160 MB fails as before). FPS ≥ 30 / resim ≤ 2 frames remain unmeasurable in this container (SwiftShader device-destroy wall, integrator-documented) — hardware protocol §9, now unblocked. |
| **R2** (all stats from the same paths) | **PASS** (CPU-reference level) | 10k run is the **bit-exact** first-10k subset of the 100k run for all 3 models (validate.ts §3); histogram→quantile extraction matches exact quantiles within §2.6 (test:stats §b). |
| **R3** (same seed+params → identical stats) | **PASS** | 29/29 determinism checks: every matrix cell and every preset run twice → identical `SimStats` JSON; success rates equal to 6 decimals; terminal wealth / failure step / history byte-identical (test:sim §a, validate.ts §1/§5). |
| **R4** (WebGPU detection + CPU fallback) | **PASS-WITH-EXCEPTION** | Live-verified in headless Chromium: CPU branch engages, badge shows "CPU · 10k paths — open in a WebGPU browser for 100× more scenarios", worker stats land, SWR auto-computes. FINDING-3 (first-load cap) RESOLVED — init now goes through `normalizeParams` (probe-verified: 10k at init). Remaining deviation: FINDING-7 pre-existing GLSL error in `?cpu=1` mode (integrator-documented, stats pipeline unaffected). |
| **R5** (GPU stats match CPU reference, §2.6) | **PASS-WITH-EXCEPTION** | CPU-reference half is fully green (§2/§3 below, all §2.6 gates pass with ≥10× margin). The GPU half was blocked by FINDING-1 (now RESOLVED + probe-verified); in this container it remains blocked by the documented device-destroy wall — hardware protocol §9, run on first access to real hardware. |
| **R6** (TS strict, zero `any`, clean build) | **PASS** | `tsc -b` clean (strict, `noUncheckedSideEffectImports`, etc.); zero `any` in shared contracts (grep-verified); `npm run build` clean (21.5 s original run; 12.0 s re-run 2026-07-21). |

**Falsification note (how these verdicts were earned):** this report is the result of
actively trying to break the product, not confirm it. The attempt *succeeded* in one
place that matters (FINDING-1) and several places that don't block shipping
(FINDING-2…7). Everything marked PASS has a reproduced command and number behind it;
everything that could not be exercised here is marked FAIL/blocked with a hardware
protocol — nothing is marked PASS on faith.

---

## FINDINGS (ordered by severity)

### FINDING-1 — **RESOLVED 2026-07-21** (fix: Agent 2C, commit `bfdc0f2`, merged `7b3720a`; verified by Agent 7B). Original entry: BLOCKER (R1, R5): `pathHistory` exceeds the default storage-buffer binding limit on ALL hardware

**Resolution (AMENDMENT A2, CONTRACTS.md §9 v1.2):** SNAP_MAX 40 → 32 →
1M × 32 × 4 B = **128,000,000 B < 134,217,728 B** spec-default limit; the
decimation stride is horizon-adaptive (`snapStrideForSteps`: yearly ≤ 31y,
`ceil(steps/31)` beyond) so 32 slots still cover the 40y max horizon.
**Verification (Agent 7B, independent):** (a) code re-read — driver, kernels,
viz planner, CPU mirror all derive the stride from the shared `history.ts`
math, no hardcoded 40/12 remains; (b) the full buffer inventory re-summed —
no other binding within 30× of the limit; (c) re-probed live in headless
Chromium with `requiredLimits: {}` (three r185's default): device limit
134,217,728 B, bind-group + dispatch + readback at 128,000,000 B **succeeds
with zero validation errors**, and the 160,000,000 B control **still fails
with the exact error below** — the probe discriminates; (d) `npm run test:sim`
56/56 incl. new A2 tests (f6: 40y → stride 16, 31 snapshots; f6b: failure-slot
math). No `requiredLimits` adapter gate is needed anywhere.

_Original finding (kept for the record):_

- **Observed (live, headless Chromium 150, SwiftShader adapter):**
  ```
  THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError:
  Binding size (160000000) of [Buffer (unlabeled)] is larger than the maximum
  storage buffer binding size (134217728). This adapter supports a higher
  maxStorageBufferBindingSize of 1073741824, which can be specified in
  requiredLimits when calling requestDevice().
   - While validating entries[7] …
   - While calling [Device].CreateBindGroup(...)
  ```
  followed by invalid-command-buffer errors and `[SimDriver] GPU simulation failed`.
- **Why this is hardware-independent:** the WebGPU spec default for
  `maxStorageBufferBindingSize` is **128 MiB (134,217,728 B)** on every conformant
  adapter. `pathHistory` is `instancedArray(PATHS_MAX × SNAP_MAX, 'float')` =
  1,000,000 × 40 × 4 B = **160,000,000 B** (`src/sim/buffers.ts:87`, CONTRACTS.md §9).
  three r185's `WebGPUBackend` passes `requiredLimits: {}` unless told otherwise
  (`node_modules/three/src/renderers/webgpu/WebGPUBackend.js:93,243`), and
  `src/scene/CanvasRoot.tsx:70` constructs `new WebGPURenderer({ canvas, antialias })`
  with no `requiredLimits`. Therefore the sim compute passes fail bind-group
  validation on RTX-class and M-class machines exactly as they do here. This is not
  the container's SwiftShader quirk; it is a device-limit contract violation.
- **Fix options (owning agents: Agent 1 CanvasRoot / Agent 2 buffers — NOT fixed here,
  verification-only role):**
  1. `new WebGPURenderer({ …, requiredLimits: { maxStorageBufferBindingSize: 160_000_000 } })`
     — must also feature-gate on `adapter.limits.maxStorageBufferBindingSize` and
     degrade gracefully (e.g. disable history) where the raised limit is unavailable;
  2. shrink the history buffer below 128 MiB (e.g. `SNAP_MAX` 30 → 120 MB) — requires
     a CONTRACTS §9 amendment by the owning agent;
  3. split `pathHistory` into two bindings (< 128 MiB each).
- **Acceptance after fix:** §9 protocol step 3 must show zero `GPUValidationError`
  and stats landing on screen.

### FINDING-2 — informational (R2-adjacent): residual PCG stream correlation bounds 10k-path precision

While falsifying the 10k↔100k convergence check, the first 10k paths' median
terminal wealth measured systematically ~+1.4% above the 100k median across 12
seeds (pure GBM, no cash flows; probe2/probe3). Root-caused to **residual weak
correlation in the two-round PCG stream over arithmetic-progression seeds**
(per-5k-block E[Z] bias oscillates ±0.002 around zero with no trend — probe3),
i.e. the same effect CONTRACTS.md §4/§8.3 documents (one round: +1.03% variance
inflation; two rounds: +0.36%). It is **not** an indexing bug: the 10k run is the
bit-exact subset of the 100k run (validate.ts §3). Impact: 10k-path medians carry
±1–6% estimator noise (±14% worst-case for fat-tail-with-failures mixtures,
6 seeds, probe.mjs); at the 100k default this is √10 tighter and all §2.6 gates
pass with ≥10× margin. No action; informs the DEMO.md guidance to demo at 100k+.

### FINDING-3 — **RESOLVED 2026-07-21** (fix: Agent 2C in commit `bfdc0f2`; verified by Agent 7B). Original entry: minor (R4): initial CPU-mode sim runs at 100k, not the advertised 10k cap

**Resolution:** store creation now resolves `initialMode = detectInitialMode()`
first and initializes `committedParams: normalizeParams(DEFAULT_SIM_PARAMS,
initialMode)` — the driver-facing value goes through the same CPU 10k cap as
every commit. **Verification (Agent 7B):** bundled `simStore.ts` standalone in
Node (no `navigator` ⇒ CPU mode): initial `committedParams.pathCount ===
10_000` (was 100,000) — capped at init, not from the first commit;
`useCpuSim.ts` subscribes to `committedParams` only, so the first CPU run is
the advertised 10k. Residual cosmetic note (pre-existing, not a blocker): the
segmented control still highlights `params.pathCount` (100k) in CPU mode while
its >10k buttons are disabled; the badge and the actual sim are correct.

_Original finding (kept for the record): `simStore.ts:247` initialized
`committedParams: DEFAULT_SIM_PARAMS` (100k) without passing through
`normalizeParams(params, mode)`; verified live: first-load CPU-path stats
equaled the 100k reference row exactly (69.8% / $1.67M)._

### FINDING-4 — demo-critical (no requirement violated): Model C ≈ Model A success at 10–30 y horizons (CLT wash-out)

Measured at 100k paths, seed 42, four stress levels (probe4):

| Plan | GBM success | Student-t ν=5 success | Δ |
|---|---|---|---|
| $1.25M / $4,200 (4.0%, preset) | 90.72% | 90.69% | −0.03pp |
| $1M / $5,000 (6%) | 64.09% | 64.28% | +0.19pp |
| $1.2M / $8,000 (8%) | 34.56% | 34.50% | −0.06pp |
| 10-yr horizon, 6% | 99.77% | 99.75% | −0.02pp |

Over 360 i.i.d. monthly innovations the CLT washes out ν=5 kurtosis; **monthly fat
tails alone do not move long-horizon ruin probability**. `scenarios.json`'s Fat-tail
description ("The gap between this success rate and the GBM one is the price of
assuming away crashes") promises a gap that measures ~0. DEMO.md scenario 3 is
written around the *true* insight (i.i.d. tail shape ≠ crash risk; clustered
regimes are what kill plans — which is why Model B is the default).

### FINDING-5 — demo-critical (no requirement violated): the glidepath preset can't show its own story in Model B

"Pre-retiree 10-yr glidepath" runs `model: "bootstrap"`, and the glidepath mix
**only affects Models A/C** (CONTRACTS.md §2, verified: glidepath on/off runs are
bit-identical in Model B — probe5). The preset's advertised beat ("the glidepath
slider shows how much protection de-risking buys") is invisible unless the user
switches to GBM. DEMO.md scenario 2 includes the model-switch beat with real
numbers (and a better insight: de-risking costs median legacy $3.0M → $1.4M for
~equal success, 95.2%, on GBM).

### FINDING-6 — cosmetic: three r185 deprecation warnings at runtime

`THREE.Clock` → `THREE.Timer`; `PostProcessing` → `RenderPipeline` (console
warnings only, both branches). No functional impact.

### FINDING-7 — pre-existing (integrator-documented, not introduced by validation):
`?cpu=1` keeps the R3F canvas mounted; three falls back to the WebGL2 backend and
Agent 4's TSL material doesn't compile as GLSL → console errors
(`OperationError: Instance dropped in popErrorScope` under WebGPU flags; GLSL
compile error without). The CPU stats pipeline, badge, and controls are
unaffected. Frozen files; reported by the integrator (docs/INTEGRATION.md).

---

## 1. Existing suites — all green

| Suite | Command | Result |
|---|---|---|
| Sim/kernel tests (determinism R3, GBM analytic §2.6, hash golden vectors + χ², bootstrap mechanics, failure semantics, pathHistory A1+A2) | `npm run test:sim` | **56/56 PASS** (50/50 at first gate; +6 A2 tests, re-run 2026-07-21) |
| Stats tests (histogram→quantile vs exact within §2.6, bin-0 zero mass, decode round trip, SWR search: convergence/budget/brackets/abort, runCpuSim-backed search) | `npm run test:stats` | **40/40 PASS** |
| Data assertions (schema, block structure, calibration moments, regime visibility, 5 presets × 21 param checks) | `node src/data/validate_data.mjs` | **108/108 PASS** |
| Agent-7 validation matrix (this report §2–§6) | `npm run test:validate` (new) | **56/56 PASS** |

**Total: 260/260 checks green at the CPU-reference level** (254/254 at the first gate; 56+40+56+108 re-run by Agent 7B on 2026-07-21 after the A2/F3 fix).

Selected verbatim output:

```
[b] GBM analytic moments (§2.6, 100k paths)          [npm run test:sim]
    E[ln W_T]  = 15.579918  (analytic 15.578011)
    Var[ln W_T]= 0.671272  (analytic 0.675000)
  PASS  E[ln W_T] within ±1% of analytic
  PASS  Var[ln W_T] within ±1% of analytic
50 passed, 0 failed

[g] findSafeWithdrawal via runCpuSim (10k, gbm, seed 42)   [npm run test:stats]
  PASS  converges within 8 iterations into [0.895, 0.905]
40 passed, 0 failed

ALL CHECKS PASSED                                     [validate_data.mjs, 108 PASS]
```

## 2. Statistical validation matrix (validate.ts §1 — `npm run test:validate`)

Base plan: $1.0M initial, $5,000/mo withdrawal, retire at t0, 30 y, μ=7%, σ=15%.
Every cell run **twice**; both runs produced identical `SimStats` JSON (R3 column, 24/24 PASS).

| Model | Paths | Seed | Success | p5 | p50 | p95 | Worst-decile DD | Median fail yr | Wall time | R3 |
|---|---|---|---|---|---|---|---|---|---|---|
| gbm | 10k | 42 | 64.22% | $0 | $722.2k | $10.129M | 35.1% | 20.4 | 315 ms | ✅ |
| gbm | 10k | 1337 | 63.83% | $0 | $696.0k | $10.201M | 35.1% | 20.3 | 312 ms | ✅ |
| gbm | 100k | 42 | 64.09% | $0 | $705.0k | $9.958M | 35.1% | 20.3 | 2,927 ms | ✅ |
| gbm | 100k | 1337 | 64.03% | $0 | $697.0k | $10.044M | 35.1% | 20.3 | 2,786 ms | ✅ |
| bootstrap | 10k | 42 | 70.52% | $0 | $1.715M | $24.837M | 38.4% | 18.3 | 82 ms | ✅ |
| bootstrap | 10k | 1337 | 70.15% | $0 | $1.742M | $23.680M | 38.3% | 18.8 | 58 ms | ✅ |
| bootstrap | 100k | 42 | 69.84% | $0 | $1.674M | $23.569M | 38.5% | 18.5 | 768 ms | ✅ |
| bootstrap | 100k | 1337 | 70.02% | $0 | $1.721M | $23.675M | 38.3% | 18.6 | 599 ms | ✅ |
| fattail | 10k | 42 | 63.95% | $0 | $733.7k | $9.925M | 34.4% | 20.4 | 1,171 ms | ✅ |
| fattail | 10k | 1337 | 64.02% | $0 | $730.7k | $10.420M | 34.7% | 20.4 | 1,145 ms | ✅ |
| fattail | 100k | 42 | 64.28% | $0 | $707.9k | $9.979M | 34.4% | 20.3 | 11,598 ms | ✅ |
| fattail | 100k | 1337 | 63.98% | $0 | $693.5k | $9.991M | 34.5% | 20.3 | 11,625 ms | ✅ |

Sanity: all three models agree within ~6pp on this plan — bootstrap richer at the
median (historical US equity risk premium beats the haircut μ=7% default);
between-seed spread at 100k ≤ 0.35pp everywhere (estimator noise as expected).

## 3. GBM analytic moments (§2.6 gate — validate.ts §2)

Pure GBM, no cash flows, 30 y: analytic E[ln W_T] = ln(10⁶) + (0.07 − 0.15²/2)·30 = 15.578011; Var[ln W_T] = 0.15²·30 = 0.675.

| Paths | Seed | E[ln W_T] | err | Var[ln W_T] | err | Gate |
|---|---|---|---|---|---|---|
| 10k | 42 | 15.588861 | +0.070% | 0.673901 | −0.163% | ✅ ±1% |
| 10k | 1337 | 15.581638 | +0.023% | 0.674679 | −0.048% | ✅ |
| 100k | 42 | 15.579918 | +0.012% | 0.671272 | −0.552% | ✅ |
| 100k | 1337 | 15.578872 | +0.006% | 0.670458 | −0.673% | ✅ |

All within §2.6's ±1% with ≥10× margin. Also verified: successRate = 1 exactly
(zero withdrawal ⇒ no failures) in all four cells.

## 4. R2 — path-count independence (validate.ts §3)

- **Gate (PASS, 3/3 models):** the 10k run is the **bit-exact** first-10k subset of
  the same-seed 100k run (terminalWealth, maxDrawdown, failureStep compared
  element-wise). Path generation is path-count-independent by construction and by
  measurement — changing path count can only change precision, never values.
- **Estimator-noise bands (informational, 6 seeds, probe.mjs):** 10k↔100k same-seed
  deltas — success ≤ ±1.5pp everywhere; Δp50 up to 3.6% (fattail 13.6% in one seed,
  failure-mixture medians are noisy); Δp95 ≤ 5.8%. §2.6 tolerances are defined for
  GPU↔CPU at **equal** path counts and do not apply here; see FINDING-2 for the
  stream-correlation analysis.

## 5. Model B calibration sanity (validate.ts §4, vs docs/calibration.md)

| Quantity | Measured (block pool, 14,340 months) | calibration.md | Gate | Result |
|---|---|---|---|---|
| Arithmetic mean | 8.21%/yr | 8.24%/yr | ±0.75pp | ✅ |
| Volatility | 15.37%/yr | 15.35%/yr | ±1.0pp | ✅ |
| Worst month | −26.2% | −26.2% (1929-11) | ≤ −20% | ✅ |
| Worst 12-mo block | −58.1% | −58.1% | ≤ −40% | ✅ |
| Empirical 12-mo p5/p50/p95 | −23.1% / +9.5% / +39.9% | — | informational | — |

The bootstrap pool reproduces the shipped series' first two moments and preserves
the Depression/2008 regimes — the sim cannot hide bad history.

## 6. Hash agreement (§4.7 task 2)

- **Source verification (PASS):** the PCG RXS-M-XS function quoted verbatim in
  `src/sim/model/hash.ts` was diffed programmatically against the installed
  `node_modules/three/src/nodes/math/Hash.js` (three@**0.185.1**, the pinned
  version): **byte-identical modulo whitespace/docblock markers**. Constants
  747796405 / 2891336453 / 277803737, shift structure, and the 2⁻³² scale all match.
- **Golden vectors (PASS, test:sim §c):** hashU32(0)=0.030199997127056122,
  (1)=0.6591631174087524, (42)=0.28497618436813354, (0xdeadbeef)=0.4029785096645355,
  (0xffffffff)=0.8990827202796936 — exact equality, not tolerance.
- **10⁶-sample uniformity (PASS):** χ² over 100 buckets in range; output ⊂ [0,1).
- **Bit-exactness claim:** TS port applies `Math.fround` before scaling to mirror
  the GPU's u32→f32 conversion → max abs diff is **0** (not merely < 1e-6) between
  `hashU32()` and TSL `hash()` *for integer seeds*, by construction. The TSL twin
  `pcgRound` in `src/sim/kernels/rng.tsl.ts` replicates the same two u32 ops
  chains; verified line-by-line against hash.ts.
- **GPU-side execution check (NOT run here — part of §9 hardware protocol):**
  dispatch a 1M-lane compute writing `streamHashTsl(stepSeed(i,0,42))` to a
  storage buffer, read back, compare against the TS `streamHash` element-wise —
  expected max diff 0 (f32 round-to-nearest on both sides).

## 7. Performance audit (measured in this container)

| Metric | Value | Notes |
|---|---|---|
| runCpuSim 10k, bootstrap / gbm / fattail | 58–82 / 294–315 / 1,145–1,171 ms | Node 20, worker-equivalent code path |
| runCpuSim 100k, bootstrap / gbm / fattail | 599–768 / 2,786–2,927 / 11,598–11,625 ms | CPU fallback is 10k-capped at init and every commit (FINDING-3 RESOLVED) |
| runSimulation dispatch structure | **1 init + 360 step = 361 dispatches** at 30 y | static-verified, `runSimulation.ts:142-153`; sync submits, final dispatch awaited → promise resolves when GPU state is final |
| recomputeStats | 3 dispatches + one 3,980 B readback | CONTRACTS_STATS §4 (995-uint packed stats buffer) |
| GPU buffer memory | ~152 MB total (24 MB sim + 128 MB history) — **A2: largest binding 128,000,000 B, 6.2 MB under the default limit** | was ~184 MB (history binding was FINDING-1, RESOLVED) |
| `tsc -b` + `vite build` | clean, **21.5 s** wall (vite 9.0 s) | zero errors/warnings from tsc |
| Bundle | index.js **2,166 kB** (526 kB gzip) · worker 4.25 kB · css 89 kB (15 kB gzip) | vite chunk-size warning (>500 kB) — informational only |
| GPU resim latency / FPS | **NOT MEASURABLE HERE** (device-destroy wall; FINDING-1 binding blocker now RESOLVED) | targets: resim ≤ 2 frames at 1M, ≥ 30 fps at 1M — §9 protocol |

## 8. Cross-browser matrix

| Browser | Expected branch | Status |
|---|---|---|
| Headless Chromium 150 (this container, SwiftShader WebGPU) | `navigator.gpu` present → GPU branch | GPU branch **engages**; the FINDING-1 bind-group failure is RESOLVED (A2: 128 MB binding passes default-limit validation — probe-verified 2026-07-21: bind + dispatch + readback at 128,000,000 B clean, 160,000,000 B control still errors). The container additionally destroys the device ~1.4 s after init (7 flag combos, 2 binaries — integrator-documented SwiftShader wall). CPU branch (`?cpu=1`) **PASS live**: badge, worker stats (69.8% / P50 $1.67M / SWR $3K/mo displayed), no hangs. |
| Chrome / Edge on RTX-class (hardware) | GPU branch | FINDING-1 exposure eliminated by A2 (binding now fits the spec-default limit everywhere). Run §9 protocol steps 3–6 on first hardware access. |
| Safari 26+ (Apple Silicon) | GPU branch (WebGPU shipped in 26) | FINDING-1 exposure eliminated by A2 — no `requiredLimits` needed, so no adapter-limit gate. §3.8 trap 5 — compute is the flakiest path; verify first of the hardware matrix. |
| Firefox | Branch is purely `'gpu' in navigator` (`simStore.ts:56`) — no Firefox-specific code exists | Firefox builds without WebGPU → CPU fallback engages (same code path live-verified in Chromium). Firefox 141+ (WebGPU on Windows) → attempts GPU mode → covered by the same §9 hardware protocol. |

R4 badge text (live-verified): "CPU mode — CPU · 10k paths — open in a WebGPU
browser for 100× more scenarios" — matches the spec's required message.

## 9. Hardware validation protocol (closes R1/R5 — run on an RTX-class or M-class machine)

**Precondition:** ~~FINDING-1 fixed~~ — DONE (A2, `bfdc0f2`/`7b3720a`; probe-verified by Agent 7B with a discriminating control). No adapter-limit requirement remains: the largest binding (128,000,000 B) fits the **spec-default** `maxStorageBufferBindingSize`, so `requiredLimits` is not needed on any conformant adapter.

1. `npm ci && npm run build && npm run preview` on a machine with Chrome/Edge
   (WebGPU) and a discrete/Apple GPU. Open DevTools console.
2. **Adapter limit sanity (30 s, informational after A2):** in console,
   `const a = await navigator.gpu.requestAdapter(); console.log(a.limits.maxStorageBufferBindingSize)`
   — any conformant value (≥ 134,217,728) suffices; no raised limit required.
3. **Sim completion:** load the app. Expected: no `GPUValidationError`; within
   ~1 s the stat rail shows success ≈ **69.8%**, P50 ≈ **$1.67M**, P95 ≈ **$23.6M**,
   worst-decile DD ≈ **−38.5%** (default params, 100k, seed 42 — the CPU-reference
   row in §2). Parity gate (§2.6): success ±0.5pp, p50 ±1%, p5/p95 ±2%.
4. **Hash GPU↔CPU execution check:** temporary page/console snippet — build a
   1,000,000-lane compute pass writing `streamHashTsl(stepSeed(instanceIndex, 0, 42))`
   into a float storage buffer, `getArrayBufferAsync` it, and compare against
   `streamHash(stepSeedU(i, 0, 42))` from `src/sim/model/hash.ts`. Expected: max
   abs diff = 0. (TS half already golden-vector tested, §6.)
5. **Resim latency (R1, ≤ 2 frames):** Performance panel recording → drag the
   withdrawal slider. Measure committed-slider-release → stats update. The driver
   returns `dispatchTimestampsMs` (361 entries at 30 y) — assert
   `last − first ≤ 33 ms` at 1M paths (2 frames at 60 fps). Also record the value
   for REPORT.md. If exceeded, rerun with `stepsPerChunk` (the standing knob).
6. **FPS (R1, ≥ 30 at 1M):** set path count to 1M, let the reveal finish, measure
   10 s of rAF deltas (or three.js Stats). Record mean/1% low. Safari 26+: repeat
   on M-class; watch for the §3.8.5 compute flakiness.
7. **Repeat §2 matrix on GPU at 10k and 100k** for all three models against the §2
   table within §2.6 tolerances; paste results into this report.
8. Record browser/GPU/driver versions alongside all numbers.

## 10. Reproduction index

| Claim | Command |
|---|---|
| Sim suite 56/56 | `npm run test:sim` |
| Stats suite 40/40 | `npm run test:stats` |
| Data 108/108 | `node src/data/validate_data.mjs` |
| Matrix + analytic + R2 + calibration + presets + SWR, 56/56 | `npm run test:validate` (new: `src/validation/validate.ts`) |
| FINDING-1 original live error (historical) | `npm run preview` + headless Chromium, default URL, console (pre-fix commit `46d4ac4`) |
| FINDING-1 fix verification (Agent 7B) | `node src/validation/probe_binding_size.mjs` — headless Chromium WebGPU probe: bind+dispatch+readback at 128,000,000 B with `requiredLimits: {}` passes; 160,000,000 B control fails with the original error (exit 0 = verified; playwright, flags `--enable-unsafe-webgpu --enable-features=Vulkan --use-vulkan=swiftshader`) |
| FINDING-3 fix verification (Agent 7B) | `esbuild src/store/simStore.ts --bundle --platform=node --format=esm` → Node: initial `committedParams.pathCount === 10_000` in CPU mode |
| FINDING-2 analysis | `src/validation/probe.mjs`, `probe2.mjs`, `probe3.mjs` (esbuild → node) |
| FINDING-4/5 demo numbers | `src/validation/probe4.mjs`, `probe5.mjs` |
| Build clean | `npx tsc -b && npm run build` |
| CPU path live | `npm run preview` → `http://localhost:4173/?cpu=1` |

---

## FINAL VERDICT (Agent 7B, 2026-07-21)

**SHIP.** Both gate blockers are resolved and independently re-verified:
FINDING-1 (160 MB binding > default `maxStorageBufferBindingSize`) is fixed by
AMENDMENT A2 (SNAP_MAX 32 → 128,000,000 B, horizon-adaptive stride) and
**probe-verified** — bind-group creation, compute dispatch, and readback at
the new size pass under three r185's default limits, while a control at the
old size reproduces the exact original error. FINDING-3 (CPU-mode first load
uncapped) is fixed at store initialization and behaviorally verified.
All suites green: **260/260** (56 sim + 40 stats + 56 validation + 108 data),
`tsc -b` and `npm run build` clean. FINDING-4 (Model C ≈ A at long horizons)
and FINDING-5 (glidepath-in-bootstrap no-op) remain **documented behaviors,
not blockers** — both are handled honestly in DEMO.md.

**Honest caveat — what SHIP does not yet cover:** the §9 hardware protocol
steps must run on first access to a real GPU (this container's SwiftShader
device-destroy wall makes them unmeasurable here, integrator-documented):
real-GPU FPS ≥ 30 at 1M paths (R1), resim latency ≤ 2 frames (R1),
GPU↔CPU stats parity within §2.6 (R5, steps 3/7), the GPU hash execution
check (§6/§9 step 4), and Safari 26 on Apple Silicon (§8). The binding-limit
defect that previously *guaranteed* failure of these steps on all hardware is
gone and probe-verified gone; the steps themselves are performance/parity
measurements that require physical hardware, not known defects. If any §9
step fails on hardware, this verdict reverts to NO-SHIP for that
requirement and the finding routes to the owning agent per spec §5.

*Generated by Agent 7; revised and re-verified by Agent 7B on 2026-07-21.
Every number above was produced by the commands in §10 on the commit this
report ships with (re-run after `bfdc0f2` + merge `7b3720a`). FAIL means
fail — the original gate's FINDING-1 was routed, fixed, and this gate re-run.*

---

## Amendment A5 — Robustness Frontier core validation (2026-07-26)

**Final validation base:** `9865bfe` (`fix: track rejected compute scopes explicitly`).
The preceding production-probe commits are `870553f`,
`450f322`, and `9865bfe`. All statuses in this section
were emitted from the final base.

### Measured CPU frontier result

```json
{"date":"2024-07-26T13:20:00.000Z","dataAsOf":{"startDate":"1926-01","endDate":"2026-06","generatedAt":"2026-07-21","source":"Robert J. Shiller, 'Irrational Exuberance' dataset (ie_data.xls), Data sheet, columns P (S&P Composite price), D (dividend, annual rate), CPI, GS10, Monthly Total Bond Returns. Downloaded 2026-07-21 from https://shillerdata.com/ (maintained mirror of http://www.econ.yale.edu/~shiller/data/ie_data.xls). Source file SHA-256: 0e3d716f83f51c14f40c5ab5662e767cde4f83fcb7305db24ab003df2c9ee6c5"},"engine":"cpu","analysisPathCount":10000,"seed":42,"params":{"model":"bootstrap","pathCount":10000,"horizonYears":30,"retireYear":0,"initialWealth":1000000,"contribution":2000,"withdrawal":5000,"mu":0.07,"sigma":0.15,"glidepath":{"start":0.8,"end":0.6},"seed":42},"capacities":[{"model":"gbm","status":"converged","monthlySpending":3632.8125,"successRate":0.9026,"evaluations":10,"evaluatedPoints":10},{"model":"bootstrap","status":"converged","monthlySpending":3476.5625,"successRate":0.9044,"evaluations":10,"evaluatedPoints":10},{"model":"fattail","status":"converged","monthlySpending":3632.8125,"successRate":0.9049,"evaluations":10,"evaluatedPoints":10}],"robustResult":{"monthlySpending":3476.5625,"status":"converged"},"elapsedMs":20899.61}
```

The command was `npm run test:frontier-validate`. It measured the
10,000-path CPU basis with seed 42; bootstrap is the limiting measured model.

### Final command matrix

| Command | Status | Fresh result |
|---|---|---|
| `npm run test:frontier` | pass | frontier store 24 passed; GPU work coordinator passed; dedicated CPU frontier suite 7 passed |
| `npm run test:frontier-validate` | pass | JSON above; elapsedMs 20899.61 |
| `npm run test:compute-probe` | pass | 7 helper checks passed; computeInit, computeStep, computeStatsClear, computeStatsReduce, and computeStatsHistogram passed; device lost null; probe errors empty |
| `npx tsc -b` | pass | exit 0 |
| `npm run lint` | pass | exit 0 |
| `npm run test:sim` | pass | 84 passed, 0 failed |
| `npm run test:stats` | pass | 52 passed, 0 failed; snapStats 19 passed |
| `npm run test:gauntlet` | pass | gauntlet 26 passed, 0 failed; gauntletViz 38 passed |
| `npm run test:validate` | pass | 56 passed, 0 failed |
| `npm run test:probe-launcher` | pass | 8 passed, 0 failed |
| `npm run test:triangulation` | pass | triangulation 5 passed; triStats store 5 passed |
| `npm run build` | pass | 146 modules transformed; build completed in 8.37 s |
| `node probe/run-viz5-probe.mjs` | pass | 194 routes, routeGenMs 76, routesMissingSummit 0; five WGSL program pairs compiled; probe errors empty |

The build emitted non-failing warnings that browsers data is stale and that a
minified chunk exceeds 500 kB; neither changed the pass status.

### Frozen-surface audit

The exact frozen diff command exited 0 with no diff:

```text
git diff --exit-code 56350f8 -- src/ui/cpuSim.worker.ts src/sim/fallback/cpuSim.ts src/sim/runSimulation.ts src/sim/kernels/initPaths.tsl.ts src/sim/kernels/stepPaths.tsl.ts src/sim/buffers.ts
```

The review of `git diff 56350f8 -- src/store/simStore.ts` showed only additive
modelComparison state/setter and frontier-store invalidation/clearing; no
frozen declarations were changed.

Physical-GPU frontier wall time is unmeasured; the SwiftShader compute probe
validates production graph compilation and binding correctness, not hardware
performance.
