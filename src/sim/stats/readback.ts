/**
 * readback.ts — GPU→CPU stats readback (spec §4.3 task 3; §1.4 data-flow
 * rule: NEVER per frame — only on parameter-change completion).
 * SINGLE OWNER: Agent 3.
 *
 * r185 readback API (docs/TSL_AUDIT.md drift mapping #1): there is NO
 * `readbackAsync`; the pinned API is
 *   `renderer.getArrayBufferAsync(attribute)` → Promise<ArrayBuffer>.
 *
 * The ENTIRE stats state is one packed 995-uint buffer (see
 * histogram.tsl.ts), so a recompute is exactly:
 *
 *   dispatch computeStatsClear + computeStatsReduce + computeStatsHistogram
 *   (queue-ordered, sync submits) → ONE `getArrayBufferAsync` → decode.
 *
 * WebGPU's single-queue ordering guarantees the readback copies execute
 * after the three compute dispatches complete — no explicit fence needed.
 * The buffer attribute is obtained through Agent 2's frozen
 * `getStorageAttribute()` helper (src/sim/buffers.ts).
 */
import type { WebGPURenderer } from 'three/webgpu';
import { getStorageAttribute } from '../buffers';
import { decodeStatsBuffer, type StatsHistogramData } from './cpuReference';
import {
  computeStatsClear,
  computeStatsHistogram,
  computeStatsReduce,
  statsBuffer,
} from './histogram.tsl';

/**
 * Dispatch the three stats passes and read back the packed stats buffer.
 * MUST be called only after runSimulation() has resolved (its promise
 * resolves when GPU state is final — docs/CONTRACTS.md §5) and only on
 * parameter-change completion. Sync `renderer.compute` submits are
 * queue-ordered ahead of the readback copy.
 *
 * Returns the DECODED histogram payload, or null when the buffer came back
 * pristine (e.g. zero active paths — treated as "stats unavailable").
 */
export async function runStatsPassesAndRead(
  renderer: WebGPURenderer,
): Promise<StatsHistogramData | null> {
  renderer.compute(computeStatsClear);
  renderer.compute(computeStatsReduce);
  renderer.compute(computeStatsHistogram);

  const attr = getStorageAttribute(statsBuffer);
  const buf = await renderer.getArrayBufferAsync(attr);
  return decodeStatsBuffer(new Uint32Array(buf));
}

/**
 * Read back ONLY the success rate for the current GPU state.
 * Used by the safe-withdrawal search (safeWithdrawal.ts / recomputeStats.ts):
 * each search iteration re-sims, then needs just the failed counter — but
 * the packed buffer is so small (≈3.9 kB) that re-running the full three
 * passes and reading the whole thing is simpler and equally cheap, and it
 * keeps ONE readback path in the codebase.
 */
export async function readSuccessRate(renderer: WebGPURenderer): Promise<number> {
  const data = await runStatsPassesAndRead(renderer);
  if (data == null || data.totalPaths <= 0) {
    throw new Error('readSuccessRate: stats buffer empty (no active paths)');
  }
  return 1 - data.failedCount / data.totalPaths;
}
