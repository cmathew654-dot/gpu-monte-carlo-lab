/**
 * heroPath.ts — viz3 hero-thread selection (GPU → CPU, param-change-only).
 *
 * The hero is the path whose TERMINAL wealth is closest to the run's median
 * (SimStats.percentiles.p50, which comes from Agent 3's dynamic-range
 * terminal histogram — no extra stats pass needed). One protagonist thread
 * weaves the cone so the scenario story has a subject.
 *
 * TRIGGER CONTRACT (same as readback.ts / snapReadback.ts, §1.4): call ONLY
 * after runSimulation() has resolved, on parameter-change completion — never
 * per frame. ONE additional getArrayBufferAsync of pathWealth per landed run
 * (400 kB at 100k paths; the buffer is allocated at PATHS_MAX so the copy is
 * 4 MB at capacity — one shot per re-sim, inside the existing readback
 * envelope). Queue ordering puts the copy after the sim's final step; no
 * fence. This is an ADDITIVE readback — no frozen buffer or stats layout
 * changes (documented in docs/CONTRACTS_STATS.md §9).
 *
 * RENDERABILITY: the cone/threads render only the evenly-strided path
 * subset (planSprites().subset — visual-only subsampling at 1M paths), so
 * the scan is restricted to rendered indices (i % subset === 0). Dead paths
 * (terminal wealth ≤ 0) are skipped — the hero must weave the cone, not
 * dive to the ember floor.
 */
import type { WebGPURenderer } from 'three/webgpu';
import type { SimParams } from '../../store/simStore';
import { getStorageAttribute, pathWealth } from '../buffers';
import {
  lineStrideForBudget,
  maxLineVerts,
  MOUNTAIN_LINE_DENSITY,
  planSprites,
} from '../../scene/spritePlan';

/**
 * Pure core (Node-testable): index of the rendered, surviving path whose
 * terminal wealth is closest to `medianWealth`, or -1 when none qualifies.
 * `activeN` = paths actually simulated this run (≤ wealth.length).
 */
export function pickHeroPath(
  wealth: Float32Array,
  activeN: number,
  medianWealth: number,
  subset: number,
): number {
  const stride = Math.max(1, Math.floor(subset));
  const n = Math.min(activeN, wealth.length);
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < n; i += stride) {
    const w = wealth[i];
    if (!(w > 0)) continue; // dead/absent path — hero must survive
    const d = Math.abs(w - medianWealth);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/**
 * Read back pathWealth for the currently GPU-resident run and pick the
 * hero. `medianWealth` is the SAME run's p50 (pass stats.percentiles.p50
 * from the recomputeStats result that just landed). Returns -1 when the
 * run had no rendered survivors (callers store -1 = no hero).
 *
 * The scan stride is the CONE subset × the line-budget stride, computed
 * from the SAME adapter maxBufferSize TrajectoryLines uses — so the hero
 * is guaranteed renderable by BOTH the sprites and the threads (at the
 * default 100k/30y the 12 MB line cap drops every 3rd thread; a hero
 * picked without that stride would vanish from the lines 2/3 of the time).
 */
export async function readHeroPathIndex(
  renderer: WebGPURenderer,
  params: SimParams,
  medianWealth: number,
): Promise<number> {
  const attr = getStorageAttribute(pathWealth);
  const buf = await renderer.getArrayBufferAsync(attr);
  const wealth = new Float32Array(buf);
  const plan = planSprites(params.pathCount, params.horizonYears);
  // @types/three@0.185 doesn't expose the backend device; cast narrowly
  // (same pattern as TrajectoryLines).
  const device = (
    renderer as unknown as {
      backend?: { device?: { limits?: { maxBufferSize?: number } } };
    }
  ).backend?.device;
  const lineStride = lineStrideForBudget(
    plan,
    maxLineVerts(device?.limits?.maxBufferSize),
  );
  // v5.3: the mountain trails thin the rendered threads by
  // MOUNTAIN_LINE_DENSITY — scan on the MOUNTAIN stride so the hero exists
  // in every rendered subset (mountain stride is a multiple of both the
  // advisor line stride and the cone sprite subset).
  return pickHeroPath(
    wealth,
    params.pathCount,
    medianWealth,
    plan.subset * lineStride * MOUNTAIN_LINE_DENSITY,
  );
}
