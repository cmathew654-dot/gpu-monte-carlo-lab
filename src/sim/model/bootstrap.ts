/**
 * bootstrap.ts — Model B block-bootstrap DATA CONTRACT (spec §2.2, §4.5).
 * Pure TS, no DOM/three imports. GPU contract side owned by Agent 2;
 * real data production owned by Agent 5 (src/data/historicalReturns.json).
 *
 * Contract (FROZEN — Agent 5's JSON must satisfy `parseBootstrapBlocks`
 * without transformation, spec §4.5 acceptance):
 *
 *   blocks: flat array of blockCount × BLOCK_LENGTH monthly REAL total
 *   returns (decimal, e.g. 0.007 = +0.7 %/mo), block-major order:
 *   blocks[b * 12 + m] = return of month m of block b. Blocks overlap in
 *   the source series (start months 0, 1, 2, …).
 *
 * The GPU consumes the same bytes via the read-only `bootstrapBlocks`
 * storage buffer (src/sim/buffers.ts). Block count must be ≤
 * BOOTSTRAP_BLOCKS_MAX (4096) — a century of monthly data is ~1.2k blocks.
 */

import { BLOCK_LENGTH } from './returnModels';

/** Hard capacity of the GPU bootstrapBlocks buffer (see buffers.ts). */
export const BOOTSTRAP_BLOCKS_MAX = 4096;

/** Shape of src/data/historicalReturns.json (Agent 5 fills `blocks`). */
export interface BootstrapBlocksFile {
  _meta: {
    blockCount: number;
    blockLength: number; // must equal BLOCK_LENGTH (12)
    startDate: string | null;
    endDate: string | null;
    source: string;
    [extra: string]: unknown;
  };
  blocks: number[];
  /**
   * AMENDMENT A3 (additive, optional): 10-yr US Treasury REAL total returns,
   * same block layout and SAME month windows as `blocks` — `bondBlocks[i]`
   * is month-aligned with `blocks[i]`. Consumed by the A3 glidepath mixing
   * (Model B equity/bond blend); equity-only consumers may ignore it.
   */
  bondBlocks?: number[];
}

/** Packed, validated block data ready for GPU upload / CPU sim. */
export interface BootstrapBlocksData {
  /** blockCount × 12 real monthly returns, block-major. */
  blocks: Float32Array;
  blockCount: number;
  blockLength: typeof BLOCK_LENGTH;
  /** AMENDMENT A3: month-aligned bond blocks (present when the source file
   * provides them). Required for Model B runs WITH a glidepath. */
  bondBlocks?: Float32Array;
}

/**
 * Validate + pack raw block data. Throws with a precise message on any
 * contract violation (called by the resim driver and the CPU worker).
 */
export function packBootstrapBlocks(
  blocks: ArrayLike<number>,
  blockCount: number,
): BootstrapBlocksData {
  if (!Number.isInteger(blockCount) || blockCount < 1) {
    throw new Error(`bootstrap: blockCount must be a positive integer, got ${blockCount}`);
  }
  if (blockCount > BOOTSTRAP_BLOCKS_MAX) {
    throw new Error(
      `bootstrap: blockCount ${blockCount} exceeds BOOTSTRAP_BLOCKS_MAX=${BOOTSTRAP_BLOCKS_MAX}`,
    );
  }
  if (blocks.length !== blockCount * BLOCK_LENGTH) {
    throw new Error(
      `bootstrap: expected ${blockCount * BLOCK_LENGTH} returns (blockCount×${BLOCK_LENGTH}), got ${blocks.length}`,
    );
  }
  const packed = new Float32Array(blockCount * BLOCK_LENGTH);
  for (let i = 0; i < packed.length; i++) {
    const v = blocks[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`bootstrap: blocks[${i}] is not a finite number: ${String(v)}`);
    }
    packed[i] = v;
  }
  return { blocks: packed, blockCount, blockLength: BLOCK_LENGTH };
}

/**
 * Parse the historicalReturns.json shape into packed block data.
 * Tolerates the Agent-1 placeholder (blockCount 0, empty blocks) by
 * returning null — callers must then refuse Model B until real data ships.
 */
export function parseBootstrapBlocksFile(json: BootstrapBlocksFile): BootstrapBlocksData | null {
  const blockCount = json?._meta?.blockCount ?? 0;
  const blockLength = json?._meta?.blockLength ?? 0;
  if (blockLength !== BLOCK_LENGTH) {
    throw new Error(`bootstrap: blockLength must be ${BLOCK_LENGTH}, got ${blockLength}`);
  }
  if (blockCount === 0 && json.blocks.length === 0) return null; // placeholder
  const packed = packBootstrapBlocks(json.blocks, blockCount);
  // AMENDMENT A3: month-aligned bond sleeve (optional, additive).
  if (json.bondBlocks != null) {
    packed.bondBlocks = packBondBlocks(json.bondBlocks, blockCount);
  }
  return packed;
}

/**
 * Validate + pack the AMENDMENT A3 bond block array (same contract as the
 * equity blocks: blockCount×12 finite numbers, block-major, month-aligned
 * with the equity blocks).
 */
export function packBondBlocks(
  bondBlocks: ArrayLike<number>,
  blockCount: number,
): Float32Array {
  if (bondBlocks.length !== blockCount * BLOCK_LENGTH) {
    throw new Error(
      `bootstrap: expected ${blockCount * BLOCK_LENGTH} bond returns (blockCount×${BLOCK_LENGTH}), got ${bondBlocks.length}`,
    );
  }
  const packed = new Float32Array(blockCount * BLOCK_LENGTH);
  for (let i = 0; i < packed.length; i++) {
    const v = bondBlocks[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`bootstrap: bondBlocks[${i}] is not a finite number: ${String(v)}`);
    }
    packed[i] = v;
  }
  return packed;
}

/**
 * Deterministic SYNTHETIC block data for tests and demos until Agent 5's
 * real series lands. NOT for production statistics. block b, month m:
 * r = base + amplitude·sin(2π·m/12 + b·φ) with a per-block level tilt —
 * hand-checkable, mean-reverting-ish, no RNG involved.
 */
export function makeSyntheticBootstrapBlocks(blockCount = 64): BootstrapBlocksData {
  const blocks = new Float32Array(blockCount * BLOCK_LENGTH);
  for (let b = 0; b < blockCount; b++) {
    const tilt = 0.004 * Math.sin(b * 1.7);
    for (let m = 0; m < BLOCK_LENGTH; m++) {
      blocks[b * BLOCK_LENGTH + m] =
        0.006 + tilt + 0.05 * Math.sin((2 * Math.PI * m) / BLOCK_LENGTH + b * 0.9);
    }
  }
  return { blocks, blockCount, blockLength: BLOCK_LENGTH };
}

/**
 * Deterministic SYNTHETIC bond blocks for tests (AMENDMENT A3) — lower mean,
 * lower amplitude than the equity blocks, same month-aligned layout. Not for
 * production statistics.
 */
export function makeSyntheticBondBlocks(blockCount = 64): Float32Array {
  const bonds = new Float32Array(blockCount * BLOCK_LENGTH);
  for (let b = 0; b < blockCount; b++) {
    const tilt = 0.001 * Math.sin(b * 2.3);
    for (let m = 0; m < BLOCK_LENGTH; m++) {
      bonds[b * BLOCK_LENGTH + m] =
        0.0015 + tilt + 0.01 * Math.sin((2 * Math.PI * m) / BLOCK_LENGTH + b * 1.3);
    }
  }
  return bonds;
}
