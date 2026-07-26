/**
 * history.ts — decimated per-path trajectory history (contract amendments
 * A1 + A2, docs/CONTRACTS.md §9). Pure TS, no DOM/three imports: shared by
 * the GPU buffer layout (sim/buffers.ts), the TSL kernels, AND the CPU
 * fallback — single source of truth for the snapshot slot math.
 *
 * pathHistory holds one snapshot of pathWealth every `stride` months so the
 * visualization layer (Agent 4) can draw the "cone of outcomes" fan:
 *
 *   snapshot 0        = initial wealth (written by initPaths)
 *   snapshot s (s≥1)  = wealth at END of step s·stride − 1 (month s·stride)
 *   failure slot      = for a path failing at step f with (f+1)%stride ≠ 0,
 *                       slot floor(f/stride)+1 holds the post-clamp wealth (0)
 *
 * GPU slot (pathHistory, path-major, padded to SNAP_MAX):
 *   pathIndex * SNAP_MAX + snapIndex
 * CPU mirror (runCpuSim history, run-sized, no padding):
 *   pathIndex * snapCount + snapIndex
 *
 * The buffer is allocated ONCE at PATHS_MAX × SNAP_MAX and never resized
 * (§3.8 trap 3); `uSnapCount` adapts the valid range to the horizon.
 *
 * AMENDMENT A2: SNAP_MAX is 32 (not 40) so the binding fits the WebGPU
 * SPEC-DEFAULT maxStorageBufferBindingSize (134,217,728 B):
 * 1M × 32 × 4 B = 128,000,000 B. A1's 160 MB binding exceeded the default
 * limit on EVERY adapter (GPUValidationError at bind-group creation) and
 * would have needed a requiredLimits adapter gate. To still cover the 40y
 * max horizon inside 32 slots the stride is horizon-adaptive
 * (snapStrideForSteps): yearly (12) for horizons ≤ 31 years, coarser above.
 */

/** Max snapshots per path (AMENDMENT A2): 1 initial + 31 decimated —
 * PATHS_MAX × SNAP_MAX × 4 B = 128 MB < the 128 MiB spec-default storage
 * binding limit, so no raised device limit is required anywhere. */
export const SNAP_MAX = 32;

/** Base decimation stride in months (yearly snapshots). Used whenever the
 * horizon fits SNAP_MAX at this stride (≤ 31 years — the common case);
 * longer horizons widen it via snapStrideForSteps (AMENDMENT A2). The
 * `uSnapStride` uniform keeps the kernel stride-agnostic. */
export const SNAP_STRIDE = 12;

/**
 * Horizon-adaptive decimation stride (AMENDMENT A2), in months:
 *   steps ≤ 31·12 (≤ 31 years) → SNAP_STRIDE (12): yearly snapshots, and
 *     the last yearly snapshot lands exactly on whole-year horizons.
 *   longer horizons             → ceil(steps / (SNAP_MAX−1)): the smallest
 *     stride keeping 1 + floor(steps/stride) ≤ SNAP_MAX (e.g. 40y → 16).
 * Because steps ≤ 480 (40y cap), the result is ≤ 16 and the count never
 * exceeds SNAP_MAX.
 */
export function snapStrideForSteps(steps: number): number {
  return steps <= (SNAP_MAX - 1) * SNAP_STRIDE
    ? SNAP_STRIDE
    : Math.ceil(steps / (SNAP_MAX - 1));
}

/**
 * Number of valid snapshots for a run of `steps` months at `stride`:
 * 1 (initial) + floor(steps/stride), capped at SNAP_MAX. With the A2
 * adaptive default stride the cap never binds; when the grid does not land
 * exactly on the horizon (steps % stride ≠ 0), the terminal value is read
 * from pathWealth (contract §9 terminal-slot rule).
 */
export function snapCountForSteps(
  steps: number,
  stride: number = snapStrideForSteps(steps),
): number {
  return Math.min(1 + Math.floor(steps / stride), SNAP_MAX);
}

/** GPU slot addressing into pathHistory (path-major, SNAP_MAX-padded). */
export function historySlot(pathIndex: number, snapIndex: number): number {
  return pathIndex * SNAP_MAX + snapIndex;
}

/**
 * Number of valid snapshots for one path (all later slots are zero-filled by
 * init and must not be read as trajectory data):
 *   active path           → snapCountForSteps(steps, stride)
 *   failed at step f      → min(floor(f/stride) + 2, snapCountForSteps)
 *     (snapshots 0..floor(f/stride) regular + the failure slot, or one less
 *      when (f+1)%stride === 0 because the regular snapshot IS the failure
 *      record; capped when failure lands in the final partial period)
 */
export function validSnapCount(
  failureStep: number,
  steps: number,
  stride: number = snapStrideForSteps(steps),
): number {
  const snapCount = snapCountForSteps(steps, stride);
  if (failureStep < 0) return snapCount;
  return Math.min(Math.floor(failureStep / stride) + 2, snapCount);
}
