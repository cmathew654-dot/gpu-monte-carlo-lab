/**
 * histogram.tsl.ts — GPU stats-reduction passes (spec §4.3 tasks 1–2, §2.5).
 * SINGLE OWNER: Agent 3.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ ATOMICITY DECISION (spec §2.5 "Agent 3 owns this decision"):        │
 * │ **TSL `atomicAdd` on uint storage buffers IS used.** Evidence in    │
 * │ pinned three@0.185.1 (r185):                                        │
 * │   1. Runtime: `import { atomicAdd } from 'three/tsl'` resolves to a │
 * │      function (verified via `node --input-type=module`);            │
 * │      `instancedArray(...).toAtomic()` exists (StorageBufferNode).   │
 * │   2. Source: src/nodes/gpgpu/AtomicFunctionNode.js implements       │
 * │      atomicAdd/atomicMin/atomicMax/atomicStore codegen;             │
 * │      src/renderers/webgpu/nodes/WGSLNodeBuilder.js:2163 emits       │
 * │      `atomic<u32>` storage-buffer element types when                │
 * │      `bufferNode.isAtomic` is set, and AtomicFunctionNode generates │
 * │      `atomicAdd(&ptr, value)` WGSL.                                 │
 * │   3. Types: @types/three@0.185.0 declares atomicAdd etc. in         │
 * │      Three.TSL.d.ts and `toAtomic()` on StorageBufferNode.          │
 * │ The §2.5 fallback (per-path bin-index buffer + CPU build, 4 MB      │
 * │ readback) is therefore NOT needed; the CPU builder remains in       │
 * │ cpuReference.ts for Node tests and as a standing fallback.          │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Three passes, dispatched once per recomputeStats() call — AFTER
 * runSimulation() resolves, NEVER per frame (§1.4 data-flow rule):
 *
 *   1. computeStatsClear   — STATS_UINTS threads: zero the packed stats
 *      buffer; min slot → 0xFFFFFFFF (atomicMin identity).
 *   2. computeStatsReduce  — PATHS_MAX threads gated by uActiveN:
 *      atomicMin/atomicMax of floatBitsToUint(max(wealth,0)) (bit order ==
 *      float order for non-negative floats → exact min/max), atomic
 *      failed counter, failure-step histogram (pathFailed−1 per the
 *      Agent-2 contract), and the max-drawdown histogram (range-free,
 *      linear [0,1] bins).
 *   3. computeStatsHistogram — PATHS_MAX threads gated by uActiveN:
 *      terminal-wealth histogram, WEALTH_BINS log-spaced bins over the
 *      DYNAMIC [min,max] range read back from slots 0/1 (GPU-side
 *      atomicLoad — no intermediate CPU round trip, so the whole stats
 *      reduction is ONE readback of the 995-uint buffer).
 *
 * Dynamic range (vs a fixed decade range) is what keeps 256 bins tight
 * enough for the §2.6 median ±1% / p5,p95 ±2% gates; see cpuReference.ts
 * for the matching CPU extraction (log-space in-bin interpolation).
 *
 * Wealth is clamped to ≥ WEALTH_LOG_FLOOR ($1) before log-binning; all
 * sub-floor mass (including failed paths clamped to $0) lands in bin 0,
 * which the CPU extractor interpolates linearly from the true minimum.
 */
import {
  Fn,
  If,
  Return,
  atomicAdd,
  atomicLoad,
  atomicMax,
  atomicMin,
  atomicStore,
  float,
  floatBitsToUint,
  instancedArray,
  instanceIndex,
  uint,
  uintBitsToFloat,
} from 'three/tsl';
import { PATHS_MAX, pathWealth, pathMaxDD, pathFailed, uActiveN } from '../buffers';
import {
  DD_BINS,
  FAIL_BINS,
  MIN_SLOT_EMPTY,
  SLOT_DD_HIST,
  SLOT_FAILED_COUNT,
  SLOT_FAIL_HIST,
  SLOT_MAX_WEALTH_BITS,
  SLOT_MIN_WEALTH_BITS,
  SLOT_WEALTH_HIST,
  STATS_UINTS,
  WEALTH_BINS,
  WEALTH_LOG_FLOOR,
} from './cpuReference';

/**
 * The packed stats buffer (single readback source, 995 uints ≈ 3.9 kB):
 *   [0] minWealth bits (atomicMin)   [1] maxWealth bits (atomicMax)
 *   [2] failed counter               [3..259)   wealth histogram (log bins)
 *   [259..515) max-drawdown hist     [515..995) failure-step histogram
 * Declared atomic so WGSL emits `array<atomic<u32>>` (see header).
 */
export const statsBuffer = instancedArray(STATS_UINTS, 'uint').toAtomic();

/** Chainable f32 node type (see the uintBitsToFloat type note in pass 3). */
type FloatNode = ReturnType<typeof float>;

// ---------------------------------------------------------------------------
// Pass 1 — clear
// ---------------------------------------------------------------------------

export const computeStatsClear = /*#__PURE__*/ Fn(() => {
  const value = uint(0).toVar();
  If(instanceIndex.equal(uint(SLOT_MIN_WEALTH_BITS)), () => {
    value.assign(uint(MIN_SLOT_EMPTY)); // atomicMin identity
  });
  atomicStore(statsBuffer.element(instanceIndex), value);
})().compute(STATS_UINTS);

// ---------------------------------------------------------------------------
// Pass 2 — range reduction, failure counter/step histogram, drawdown hist
// ---------------------------------------------------------------------------

export const computeStatsReduce = /*#__PURE__*/ Fn(() => {
  If(instanceIndex.greaterThanEqual(uActiveN), () => {
    Return();
  });

  // Terminal-wealth range via order-preserving float-bit atomics.
  const wBits = floatBitsToUint(pathWealth.element(instanceIndex).max(0));
  atomicMin(statsBuffer.element(uint(SLOT_MIN_WEALTH_BITS)), wBits);
  atomicMax(statsBuffer.element(uint(SLOT_MAX_WEALTH_BITS)), wBits);

  // Max-drawdown histogram (linear bins over [0,1], no range needed).
  const ddBin = uint(
    float(pathMaxDD.element(instanceIndex)).mul(DD_BINS).floor().min(DD_BINS - 1),
  );
  atomicAdd(statsBuffer.element(uint(SLOT_DD_HIST).add(ddBin)), uint(1));

  // Failure counter + failure-step histogram (pathFailed = step+1, 0 = never).
  const failed = pathFailed.element(instanceIndex);
  If(failed.notEqual(uint(0)), () => {
    atomicAdd(statsBuffer.element(uint(SLOT_FAILED_COUNT)), uint(1));
    const stepBin = uint(float(failed).sub(1).min(FAIL_BINS - 1));
    atomicAdd(statsBuffer.element(uint(SLOT_FAIL_HIST).add(stepBin)), uint(1));
  });
})().compute(PATHS_MAX);

// ---------------------------------------------------------------------------
// Pass 3 — terminal-wealth histogram over the dynamic log range
// ---------------------------------------------------------------------------

export const computeStatsHistogram = /*#__PURE__*/ Fn(() => {
  If(instanceIndex.greaterThanEqual(uActiveN), () => {
    Return();
  });

  // Dynamic range from pass 2 (GPU-side atomic loads — no CPU round trip).
  // TYPE NOTE: @types/three@0.185.0 declares uintBitsToFloat() as returning
  // an un-generic'd BitcastNode (no chain methods). The WGSL it emits is
  // bitcast<f32> — genuinely a float node — so we restore the precise type
  // locally (zero runtime effect; no `any`).
  const minBitsF = uintBitsToFloat(
    atomicLoad(statsBuffer.element(uint(SLOT_MIN_WEALTH_BITS))),
  ) as unknown as FloatNode;
  const maxBitsF = uintBitsToFloat(
    atomicLoad(statsBuffer.element(uint(SLOT_MAX_WEALTH_BITS))),
  ) as unknown as FloatNode;
  const wFloor = minBitsF.max(WEALTH_LOG_FLOOR);
  const wCeil = maxBitsF.max(wFloor.mul(1 + 1e-6)); // degenerate-range guard

  const logLo = wFloor.log();
  const logRange = wCeil.log().sub(logLo);

  const w = pathWealth.element(instanceIndex).max(0);
  const lw = w.max(wFloor).log(); // sub-floor mass → bin 0
  const bin = uint(lw.sub(logLo).div(logRange).mul(WEALTH_BINS).floor().min(WEALTH_BINS - 1));
  atomicAdd(statsBuffer.element(uint(SLOT_WEALTH_HIST).add(bin)), uint(1));
})().compute(PATHS_MAX);
