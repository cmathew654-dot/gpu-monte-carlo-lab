/**
 * snapReadback.ts — GPU→CPU per-snapshot stats readback (viz2). Mirrors
 * readback.ts exactly: dispatch clear+build, ONE getArrayBufferAsync of the
 * 12,288 B snap histogram buffer, decode. Same trigger contract (§1.4):
 * ONLY after runSimulation() has resolved, on parameter-change completion
 * — never per frame. WebGPU queue ordering puts the readback copy after
 * the compute dispatches; no explicit fence.
 */
import type { WebGPURenderer } from 'three/webgpu';
import type { SimParams, SnapshotStats } from '../../store/simStore';
import { getStorageAttribute } from '../buffers';
import { snapStrideForSteps, snapCountForSteps } from '../model/history';
import { computeSnapHistBuild, computeSnapHistClear, snapHistBuffer } from './snapHistogram.tsl';
import { extractSnapshotStats } from './snapStats';

/**
 * Dispatch the two snap-histogram passes and read back + decode the packed
 * buffer. Returns null when the run had no active paths (callers treat as
 * "snapshot stats unavailable" and keep the previous scene state).
 */
export async function runSnapHistPassesAndRead(
  renderer: WebGPURenderer,
  params: SimParams,
): Promise<SnapshotStats | null> {
  renderer.compute(computeSnapHistClear);
  renderer.compute(computeSnapHistBuild);

  const attr = getStorageAttribute(snapHistBuffer);
  const buf = await renderer.getArrayBufferAsync(attr);

  const horizonMonths = Math.round(params.horizonYears * 12);
  const snapStrideMonths = snapStrideForSteps(horizonMonths);
  return extractSnapshotStats({
    raw: new Uint32Array(buf),
    snapCount: snapCountForSteps(horizonMonths, snapStrideMonths),
    snapStrideMonths,
    horizonMonths,
  });
}
