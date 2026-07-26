/**
 * snapHistogram.tsl.ts — per-snapshot wealth-histogram GPU passes (viz2:
 * year-cursor cross-section + percentile guide lines).
 *
 * Sibling of Agent 3's histogram.tsl.ts (same atomic design — see its
 * header for the TSL atomicAdd evidence); THIS module only ADDS a buffer
 * and two passes. The frozen stats pipeline (computeStatsClear/Reduce/
 * Histogram and the 995-uint statsBuffer) is untouched.
 *
 * Two passes, dispatched once per completed re-sim (same param-change-only
 * trigger as the terminal stats — §1.4: NEVER per frame):
 *
 *   1. computeSnapHistClear — SNAP_HIST_UINTS threads: zero the buffer.
 *   2. computeSnapHistBuild — PATHS_MAX threads gated by uActiveN; each
 *      thread walks its path's snapshots (Loop over SNAP_MAX, gated by
 *      uSnapCount) and atomicAdds the alive slots into row s of the fixed
 *      log10 range [SNAP_LOG_LO, SNAP_LOG_LO+SNAP_LOG_SPAN]. Dead slots
 *      (history zero-filled from the failure slot onward, contract §9) are
 *      skipped → row sums shrink as paths fail, which is what the
 *      cumulative-failure HUD reads.
 *
 * Cost: 1M threads × ≤32 iterations of one buffer read + (rarely contended)
 * atomicAdd — a one-shot ~32 M-op reduction per re-sim, far cheaper than
 * one month of the sim itself.
 *
 * TYPE DISCIPLINE (three r185 ConditionalNode pitfall — the v1 black-screen
 * bug): this graph uses NO select() at all; If() gates carry no cached
 * cross-type temp. Loop index i is INT (LoopNode default) — every use in a
 * uint context (comparison vs uSnapCount, buffer addressing) goes through
 * an explicit uint(i) conversion. Wealth math is float-only.
 */
import {
  Fn,
  If,
  Loop,
  Return,
  atomicAdd,
  atomicStore,
  float,
  instancedArray,
  instanceIndex,
  uint,
} from 'three/tsl';
import { PATHS_MAX, pathHistory, uActiveN, uSnapCount } from '../buffers';
import { SNAP_MAX } from '../model/history';
import {
  SNAP_ALIVE_FLOOR,
  SNAP_BINS,
  SNAP_HIST_UINTS,
  SNAP_LOG_LO,
  SNAP_LOG_SPAN,
} from './snapStats';

/** 1/ln(10) — three r185 TSL has no log10 node (same pattern as Agent 4). */
const LOG10E = 0.43429448190325176;

/**
 * Packed per-snapshot histogram (single readback source, 12,288 B):
 * row-major [SNAP_MAX × SNAP_BINS] — row s = wealth distribution of paths
 * alive at snapshot s. Declared atomic so WGSL emits array<atomic<u32>>.
 */
export const snapHistBuffer = instancedArray(SNAP_HIST_UINTS, 'uint').toAtomic();

// ---------------------------------------------------------------------------
// Pass 1 — clear
// ---------------------------------------------------------------------------

export const computeSnapHistClear = /*#__PURE__*/ Fn(() => {
  atomicStore(snapHistBuffer.element(instanceIndex), uint(0));
})().compute(SNAP_HIST_UINTS);

// ---------------------------------------------------------------------------
// Pass 2 — per-snapshot histogram build
// ---------------------------------------------------------------------------

export const computeSnapHistBuild = /*#__PURE__*/ Fn(() => {
  If(instanceIndex.greaterThanEqual(uActiveN), () => {
    Return();
  });

  const pathBase = instanceIndex.mul(uint(SNAP_MAX));
  Loop(SNAP_MAX, ({ i }) => {
    // i is INT (LoopNode default) — explicit uint() twin for every uint
    // context; w stays float-only. No select() anywhere in this graph.
    const s = uint(i);
    If(s.lessThan(uSnapCount), () => {
      const w = pathHistory.element(pathBase.add(s));
      If(w.greaterThan(float(SNAP_ALIVE_FLOOR)), () => {
        const bin = uint(
          w
            .log()
            .mul(LOG10E)
            .sub(SNAP_LOG_LO)
            .div(SNAP_LOG_SPAN)
            .mul(SNAP_BINS)
            .floor()
            .clamp(0, SNAP_BINS - 1),
        );
        atomicAdd(
          snapHistBuffer.element(s.mul(uint(SNAP_BINS)).add(bin)),
          uint(1),
        );
      });
    });
  });
})().compute(PATHS_MAX);
