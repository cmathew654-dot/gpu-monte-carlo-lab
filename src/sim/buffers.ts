/**
 * buffers.ts — FROZEN GPU storage-buffer + uniform contract (spec §3.1, §3.4).
 * SINGLE OWNER: Agent 2. Other agents READ, never write (spec §5).
 *
 * FROZEN AFTER COMMIT. Any change here gates Agents 3–6 — coordinate first.
 *
 * Layout (all per-path buffers at PATHS_MAX; allocate-once, never resized —
 * the active path count is the `uActiveN` uniform, spec §3.8 trap 3):
 *
 *   pathWealth     float  current wealth per path (real $)
 *   pathPeak       float  running peak during RETIREMENT phase (drawdown)
 *   pathMaxDD      float  running max drawdown during retirement ∈ [0,1]
 *   pathFailed     uint   0 = active; >0 = failed at step (value−1) — the
 *                         flag doubles as the failure-step record (§2.5)
 *   pathBlockBase  uint   Model B: base index into bootstrapBlocks
 *                         (= drawnBlock × 12), refreshed when step%12==0
 *   pathBlockRet   float  the monthly return applied this step (debug/viz)
 *   pathHistory    float × (PATHS_MAX×SNAP_MAX) — decimated trajectory
 *                         (AMENDMENTS A1+A2, docs/CONTRACTS.md §9): slot
 *                         pathIndex*SNAP_MAX + snapIndex; snapshot 0 = initial
 *                         wealth, snapshot s = wealth at end of month
 *                         s·uSnapStride. 128 MB at full capacity (A2: fits
 *                         the spec-default maxStorageBufferBindingSize).
 *
 *   bootstrapBlocks float × (BOOTSTRAP_BLOCKS_MAX×24), READ-ONLY storage:
 *                         blockCount×12 real monthly returns, block-major
 *                         (contract with Agent 5 — see sim/model/bootstrap.ts).
 *                         AMENDMENT A3 (docs/CONTRACTS.md §10): the buffer is
 *                         TWO month-aligned regions — equity at [0, 4096×12),
 *                         10-yr Treasury real TR at [4096×12, 4096×24). A
 *                         SEPARATE bondBlocks binding was prototyped and
 *                         rejected: computeStep already binds 8 storage
 *                         buffers (the WebGPU spec-default per-stage max),
 *                         so a 9th binding fails pipeline creation on
 *                         default-limit devices (measured on SwiftShader,
 *                         probe/compute-probe.js). Two regions in ONE
 *                         buffer keep the binding count at 8.
 *
 * CPU-side attribute access (Agent 3 readback per docs/TSL_AUDIT.md drift
 * mapping #1): `renderer.getArrayBufferAsync(getStorageAttribute(pathWealth))`.
 */
import { instancedArray, uniform } from 'three/tsl';
import type {
  StorageBufferAttribute,
  StorageInstancedBufferAttribute,
} from 'three/webgpu';
import {
  BOOTSTRAP_BLOCKS_MAX,
  packBootstrapBlocks,
  type BootstrapBlocksData,
} from './model/bootstrap';
import { SNAP_MAX } from './model/history';

export { SNAP_MAX };
export {
  SNAP_STRIDE,
  snapStrideForSteps,
  snapCountForSteps,
  historySlot,
  validSnapCount,
} from './model/history';

// ---------------------------------------------------------------------------
// Frozen capacities
// ---------------------------------------------------------------------------

/** Max simulated paths (spec §2.1). Buffers are allocated once at this size. */
export const PATHS_MAX = 1_000_000;

/** Months per bootstrap block (spec §2.2, L = 12). */
export const BLOCK_LENGTH = 12;

/** Re-exported so consumers don't reach into model/ for the capacity cap. */
export { BOOTSTRAP_BLOCKS_MAX };

// ---------------------------------------------------------------------------
// §3.1 per-path state buffers (FROZEN names/types)
// ---------------------------------------------------------------------------

export const pathWealth = instancedArray(PATHS_MAX, 'float');
export const pathPeak = instancedArray(PATHS_MAX, 'float');
export const pathMaxDD = instancedArray(PATHS_MAX, 'float');
export const pathFailed = instancedArray(PATHS_MAX, 'uint');
export const pathBlockBase = instancedArray(PATHS_MAX, 'uint');
export const pathBlockRet = instancedArray(PATHS_MAX, 'float');

/**
 * Decimated per-path trajectory history (AMENDMENTS A1+A2 — docs/CONTRACTS.md
 * §9; the ONE sanctioned exception to the frozen-contract rule, authorized
 * by the orchestrator so Agent 4 can render the cone of outcomes).
 *
 * Slot addressing (path-major, padded): pathIndex·SNAP_MAX + snapIndex.
 *   snapshot 0     = initial wealth (initPaths)
 *   snapshot s ≥ 1 = pathWealth at end of step s·uSnapStride − 1
 *   failure slot   = floor(f/stride)+1 for a path failing at step f with
 *                    (f+1)%stride ≠ 0 — holds the post-clamp wealth (0)
 * Written for ACTIVE paths only (failed lanes early-out; trailing slots
 * stay zero-filled by init). Valid slots per path: `validSnapCount()`.
 *
 * MEMORY: PATHS_MAX × SNAP_MAX × 4 B = 1M × 32 × 4 = 128 MB, allocated once,
 * never resized (§3.8 trap 3). AMENDMENT A2 shrank SNAP_MAX 40 → 32 because
 * A1's 160 MB exceeded the WebGPU SPEC-DEFAULT maxStorageBufferBindingSize
 * (134,217,728 B) on every adapter; 128,000,000 B fits the default limit
 * with no requiredLimits and no adapter gate. `uSnapCount` adapts the valid
 * range to the horizon; `uSnapStride` is horizon-adaptive (driver: 12 for
 * horizons ≤ 31y, ceil(steps/31) beyond — see snapStrideForSteps).
 */
export const pathHistory = instancedArray(PATHS_MAX * SNAP_MAX, 'float');

/**
 * AMENDMENT A3: element offset of the bond region inside `bootstrapBlocks`.
 * Equity blocks live at [0, BOND_BLOCKS_OFFSET); the month-aligned 10-yr
 * Treasury real-TR blocks live at [BOND_BLOCKS_OFFSET, 2×BOND_BLOCKS_OFFSET)
 * — same block-major layout, element BOND_BLOCKS_OFFSET + b*12+m aligns with
 * equity element b*12+m. `uBlockCount` gates the valid range of BOTH regions.
 */
export const BOND_BLOCKS_OFFSET = BOOTSTRAP_BLOCKS_MAX * BLOCK_LENGTH;

/**
 * Read-only bootstrap block data (Model B). Element `b*12+m` = month m of
 * equity block b; element `BOND_BLOCKS_OFFSET + b*12+m` = the SAME month's
 * bond return (AMENDMENT A3 two-region layout — see the header note for why
 * this is one buffer, not two bindings). Filled by `setBootstrapBlocks()`;
 * `uBlockCount` gates the valid range.
 */
export const bootstrapBlocks = instancedArray(
  BOOTSTRAP_BLOCKS_MAX * BLOCK_LENGTH * 2,
  'float',
).toReadOnly();

/** Public node types for consumers' annotations (zero-`any` strictness). */
export type FloatStorageNode = typeof pathWealth;
export type UintStorageNode = typeof pathFailed;

// ---------------------------------------------------------------------------
// §3.4 uniform block (FROZEN names/types) — written by the store/driver on
// parameter change only, never per frame.
// ---------------------------------------------------------------------------

/** 0 = gbm, 1 = bootstrap, 2 = fattail (see sim/model/returnModels.ts). */
export const uModel = uniform(1, 'uint');
/** Active path count: threads instanceIndex ≥ uActiveN early-out. */
export const uActiveN = uniform(100_000, 'uint');
/** RNG seed (u32). */
export const uSeed = uniform(42, 'uint');
/** Current month being simulated, written by the driver before each step dispatch. */
export const uStep = uniform(0, 'uint');
/** First retirement month = round(retireYear × 12). */
export const uRetireStep = uniform(0, 'uint');
/** Starting wealth (real $). */
export const uInitialWealth = uniform(1_000_000);
/** Monthly contribution in accumulation (real $). */
export const uContribution = uniform(2_000);
/** Monthly withdrawal in retirement (real $). */
export const uWithdrawal = uniform(5_000);
/** Model A/C annual real drift. */
export const uMu = uniform(0.07);
/** Model A/C annual real volatility. */
export const uSigma = uniform(0.15);
/** 1 = glidepath active, 0 = constant μ/σ. */
export const uGlideEnabled = uniform(0, 'uint');
/** Glidepath allocation at t=0 / at retirement. */
export const uGlideStart = uniform(1.0);
export const uGlideEnd = uniform(0.4);
/** Number of valid blocks in bootstrapBlocks (≤ BOOTSTRAP_BLOCKS_MAX). */
export const uBlockCount = uniform(1, 'uint');
/** History decimation stride in months (A1; A2: horizon-adaptive, driver
 * writes snapStrideForSteps(steps) — 12 for horizons ≤ 31y). */
export const uSnapStride = uniform(12, 'uint');
/** Valid snapshots per path this run = min(1+steps/stride, SNAP_MAX). */
export const uSnapCount = uniform(31, 'uint');

/** Grouped handle for drivers that bind the whole block. */
export const simUniforms = {
  uModel,
  uActiveN,
  uSeed,
  uStep,
  uRetireStep,
  uInitialWealth,
  uContribution,
  uWithdrawal,
  uMu,
  uSigma,
  uGlideEnabled,
  uGlideStart,
  uGlideEnd,
  uBlockCount,
  uSnapStride,
  uSnapCount,
} as const;

// ---------------------------------------------------------------------------
// CPU-side accessors (readback + data upload)
// ---------------------------------------------------------------------------

export type StorageAttribute = StorageBufferAttribute | StorageInstancedBufferAttribute;

/**
 * The BufferAttribute backing a storage node — pass to
 * `renderer.getArrayBufferAsync(attribute)` (r185 readback API,
 * docs/TSL_AUDIT.md drift mapping #1) or write `.array` + `needsUpdate`.
 */
export function getStorageAttribute(node: FloatStorageNode | UintStorageNode): StorageAttribute {
  return node.value as StorageAttribute;
}

/** Block count currently uploaded into bootstrapBlocks (uBlockCount mirror). */
export function getBootstrapBlockCount(): number {
  return uBlockCount.value;
}

/**
 * Upload Model B block data (Agent 5's packed Float32Array, blockCount×12)
 * into the read-only storage buffer. Validates via the bootstrap contract,
 * updates `uBlockCount`, marks the attribute dirty for GPU re-upload.
 * Call on parameter/data change only — never per frame.
 */
export function setBootstrapBlocks(
  data: BootstrapBlocksData | Float32Array,
  blockCount?: number,
): void {
  const packed: BootstrapBlocksData =
    data instanceof Float32Array
      ? packBootstrapBlocks(data, blockCount ?? data.length / BLOCK_LENGTH)
      : data;
  const attr = getStorageAttribute(bootstrapBlocks);
  const array = attr.array as Float32Array;
  array.set(packed.blocks);
  // AMENDMENT A3: upload the month-aligned bond sleeve into the bond region;
  // zero-fill when the payload has none so a previous run's bonds can never
  // mix with new equity blocks (the kernel reads the bond region only under
  // the glidepath).
  const bondRegion = array.subarray(BOND_BLOCKS_OFFSET);
  if (packed.bondBlocks) {
    bondRegion.set(packed.bondBlocks);
    if (packed.bondBlocks.length < bondRegion.length) {
      bondRegion.fill(0, packed.bondBlocks.length);
    }
  } else {
    bondRegion.fill(0);
  }
  attr.needsUpdate = true;
  uBlockCount.value = packed.blockCount;
}
