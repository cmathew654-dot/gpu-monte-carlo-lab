/**
 * mountainTrailNodes.ts — the viz5 mountain TRAIL vertex/color node graph.
 * Pure TSL (no React, no store), mirroring trajNodes.ts conventions so the
 * Tint probe compiles the REAL graph.
 *
 * Each rendered path is assigned an ascent route (hash by pathId). A trail
 * vertex rides the route at progress t = snap/(snapsTotal−1):
 *
 *   pos = route[routeIdx][t] + normal[t] × (LIFT + offset)
 *   offset = clamp((log10(wealth) − log10(p50 wealth at snap)) × K, −LO, +HI)
 *
 * Winners ride ABOVE the terrain on ridgelines; strugglers sink toward the
 * surface. v5.3: the median (hero) path is forced onto the CENTRAL route
 * (uHeroRoute — the ascent pointing at the camera's home azimuth), climbs
 * dead straight (no lateral weave), floats HERO_LIFT above the braid, and
 * renders GOLD at 5× alpha — "a path straight up the middle, highlight it
 * some color".
 *
 * DEATH SEMANTICS (mirrors trajNodes): for a failed path, slots past the
 * death slot collapse onto it (zero-length segments → the trail STOPS at
 * its death snap); the death slot itself is ember-red. The ember slide
 * downhill is a separate sprite pool (mountainEmberNodes.ts).
 *
 * three r185 ConditionalNode discipline (the v1 black screen): every
 * select() result is consumed in ONE type context — uint selects (slot,
 * deathSlot, sEff, routeIdx) feed buffer indices/comparisons only; float
 * twins (slotF, deathSlotF, sEffF) feed progress math. Never mix.
 */
import {
  Fn,
  color,
  float,
  hash,
  mix,
  select,
  smoothstep,
  uint,
  uniform,
  varying,
  vec3,
  vec4,
  vertexIndex,
} from 'three/tsl';
import {
  pathFailed,
  pathHistory,
  pathWealth,
  uSnapCount,
  uSnapStride,
} from '../../sim/buffers';
import { SNAP_MAX } from '../../sim/model/history';
import { CURSOR_FEATHER, CURSOR_GHOST, uCursorX, uReveal } from '../playhead';
import { medianLog, routeNrm, routePos, uRouteCount } from './mountainBuffers';
import { ROUTE_POINTS } from './routes';
import {
  HERO_LIFT,
  LAT_SPREAD,
  LAT_WEAVE_AMP,
  OFFSET_HI,
  OFFSET_K,
  OFFSET_LO,
  TRAIL_LIFT,
} from './trailStyle';

/** Thread alpha at full reveal (mountain trails carry the whole scene). */
const TRAIL_ALPHA = 0.045;
/** Reveal feather — same value as the cone/traj graphs. */
const REVEAL_FEATHER = 0.02;

const TRAIL_BLUE = /*#__PURE__*/ mix(color(0x3080ff), color(0x6fb2ff), 0.35);
const TRAIL_EMBER = /*#__PURE__*/ color(0xfb2c36).mul(0.6);
/** v5.3: the hero is GOLD — "a path straight up the middle, highlight it
 * some color". One warm thread on the central route, above the blue braid.
 * Authored as vec3 (0xffb547) so the hero/state select() sees ONE type —
 * color() would produce a color-typed node and break the overload. */
const TRAIL_HERO = /*#__PURE__*/ vec3(1.0, 0.71, 0.28);

/**
 * The full vertex/node graph, exported as a pure function so the Tint
 * probe (probe/viz5-probe.js) compiles the REAL material — no drift
 * between probe and product. The component calls it once in useMemo.
 */
export function buildMountainTrailNodes() {
  // Plan uniforms — JS-written when params/previewMode change (same sync
  // rule as TrajectoryLines).
  const uHorizonSteps = uniform(360.0);
  const uSpritesPerPath = uniform(31, 'uint');
  const uSnapDecimate = uniform(1, 'uint');
  const uPathSubset = uniform(1, 'uint');
  const uSnapsTotal = uniform(31, 'uint');
  /** Alpha normalization (alphaScaleForCount on the rendered subset). */
  const uAlphaScale = uniform(1.0);
  /** Hero path index (terminal-median); 0xffffffff = none. */
  const uHeroPath = uniform(0xffffffff, 'uint');
  /** v5.3: the hero is forced onto the CENTRAL route (the ascent pointing
   * at the camera's home azimuth — "straight up the middle"). JS picks the
   * route index when the terrain uploads. */
  const uHeroRoute = uniform(0, 'uint');

  // --- vertex → (pathSlot, slot) ------------------------------------------
  const seg = vertexIndex.div(uint(2));
  const endU = vertexIndex.sub(seg.mul(uint(2)));
  const perSeg = uSpritesPerPath.sub(uint(1));
  const pathSlot = seg.div(perSeg);
  const segSlot = seg.sub(pathSlot.mul(perSeg));
  const slotRaw = segSlot.add(endU);

  const pathId = pathSlot.mul(uPathSubset);
  const isHero = pathId.equal(uHeroPath); // uint mul → uint equal, safe

  // Route assignment: deterministic per-path hash → [0, uRouteCount).
  // UINT-only consumption below (buffer index math).
  const seedBase = pathId.mul(uint(64));
  const routeHash = hash(seedBase.add(uint(777)));
  const routeIdxHashed = uint(
    routeHash.mul(uRouteCount.toFloat()).min(uRouteCount.toFloat().sub(1.0)),
  );
  // v5.3: the hero climbs the central route. UINT-only select (isHero is a
  // uint comparison; the result feeds buffer indices only — r185 rule).
  const routeIdx = select(isHero, uHeroRoute, routeIdxHashed);

  // --- frozen-buffer reads (contract §1/§9) -------------------------------
  const failedVal = pathFailed.element(pathId);
  const isFailed = failedVal.greaterThan(uint(0));
  const failSlot = failedVal.sub(uint(1)).div(uSnapStride).add(uint(1));
  const ceilSlot = failSlot
    .add(uSnapDecimate.sub(uint(1)))
    .div(uSnapDecimate)
    .mul(uSnapDecimate);
  const maxGridSlot = uSpritesPerPath.sub(uint(2)).mul(uSnapDecimate);
  // UINT-only select (comparison + buffer index below).
  const deathSlot = select(
    ceilSlot.greaterThan(maxGridSlot),
    uSnapsTotal.sub(uint(1)),
    ceilSlot,
  );
  // Death clamp: slots past the death slot collapse onto it — the trail
  // STOPS at the death snap. UINT-only select.
  const slot = select(
    isFailed.and(slotRaw.greaterThan(deathSlot)),
    deathSlot,
    slotRaw,
  );
  const isLastSlot = slot.equal(uSpritesPerPath.sub(uint(1)));
  const sEff = select(
    isLastSlot,
    uSnapsTotal.sub(uint(1)),
    slot.mul(uSnapDecimate),
  ); // UINT-only: buffer indices + comparison below.

  const wHist = pathHistory.element(pathId.mul(uint(SNAP_MAX)).add(sEff));
  const wealth = select(
    sEff.lessThan(uSnapCount),
    wHist,
    pathWealth.element(pathId),
  ); // FLOAT result — consumed as float only.
  const medLog = medianLog.element(sEff); // uint index consumption
  const isDeathSlot = isFailed.and(sEff.equal(deathSlot));

  // --- FLOAT TWINS (r185 ConditionalNode pitfall — see trajNodes) ---------
  const deathSlotF = select(
    ceilSlot.greaterThan(maxGridSlot),
    uSnapsTotal.toFloat().sub(1.0),
    float(ceilSlot),
  );
  const slotF = select(
    isFailed.and(slotRaw.greaterThan(deathSlot)),
    deathSlotF,
    float(slotRaw),
  );
  const sEffF = select(
    isLastSlot,
    uSnapsTotal.toFloat().sub(1.0),
    slotF.mul(uSnapDecimate.toFloat()),
  );

  // --- route position at progress t = snap/(snapsTotal−1) ------------------
  const t01 = sEffF.div(uSnapsTotal.toFloat().sub(1.0)).clamp(0, 1);
  const rf = t01.mul(ROUTE_POINTS - 1);
  const i0 = uint(rf.min(ROUTE_POINTS - 2)); // float min → uint conversion
  const f = rf.sub(float(i0));
  const b0 = routeIdx.mul(uint(ROUTE_POINTS)).add(i0).mul(uint(3));
  const b1 = b0.add(uint(3));
  const p0 = vec3(
    routePos.element(b0),
    routePos.element(b0.add(uint(1))),
    routePos.element(b0.add(uint(2))),
  );
  const p1 = vec3(
    routePos.element(b1),
    routePos.element(b1.add(uint(1))),
    routePos.element(b1.add(uint(2))),
  );
  const n0 = vec3(
    routeNrm.element(b0),
    routeNrm.element(b0.add(uint(1))),
    routeNrm.element(b0.add(uint(2))),
  );
  const n1 = vec3(
    routeNrm.element(b1),
    routeNrm.element(b1.add(uint(1))),
    routeNrm.element(b1.add(uint(2))),
  );
  const base = mix(p0, p1, f);
  const nrm = mix(n0, n1, f);

  // --- wealth-mapped offset along the terrain normal -----------------------
  const lw = wealth.max(1.0).log().mul(0.43429448190325176);
  const offset = lw
    .sub(medLog)
    .mul(OFFSET_K)
    .clamp(OFFSET_LO, OFFSET_HI);
  // v5.2 lateral spread: direction = tangent × normal (lies in the slope
  // plane, perpendicular to the route). Per-path hash offset + weave.
  const lateral = p1
    .sub(p0)
    .cross(nrm)
    .normalize();
  const latH = hash(seedBase.add(uint(888)));
  const latPhase = hash(seedBase.add(uint(999)));
  const latOffsetRaw = latH
    .sub(0.5)
    .mul(LAT_SPREAD)
    .add(
      t01
        .mul(Math.PI * 4)
        .add(latPhase.mul(Math.PI * 2))
        .sin()
        .mul(LAT_WEAVE_AMP),
    );
  // v5.3: the hero does NOT weave — it climbs the central route dead
  // straight. FLOAT-only select (r185 rule).
  const latOffset = select(isHero, float(0.0), latOffsetRaw);
  // The hero also floats a touch above the braid so the gold thread never
  // tangles into the blue. FLOAT-only select.
  const lift = float(TRAIL_LIFT)
    .add(offset)
    .add(select(isHero, float(HERO_LIFT), float(0.0)));
  const worldPos = base.add(nrm.mul(lift)).add(lateral.mul(latOffset));

  // --- reveal sweep along the route (progress, not world X) ----------------
  const revealH = hash(seedBase.add(uint(505)));
  const revealAt = t01.mul(0.96).add(revealH.mul(0.04));
  const vis = smoothstep(revealAt, revealAt.add(REVEAL_FEATHER), uReveal);
  const cursorDim = smoothstep(uCursorX, uCursorX.add(CURSOR_FEATHER), t01)
    .mul(1 - CURSOR_GHOST)
    .oneMinus();

  const notSingularity = segSlot.greaterThan(uint(0));
  const alpha = float(TRAIL_ALPHA)
    .mul(vis)
    .mul(cursorDim)
    .mul(uAlphaScale)
    .mul(select(notSingularity, float(1.0), float(0.0)))
    .mul(select(isHero, float(5.0), float(1.0)));
  const rgbState = select(isDeathSlot, TRAIL_EMBER, TRAIL_BLUE);
  const rgb = select(isHero.and(isDeathSlot.not()), TRAIL_HERO, rgbState);

  return {
    uniforms: {
      uHorizonSteps,
      uSpritesPerPath,
      uSnapDecimate,
      uPathSubset,
      uSnapsTotal,
      uAlphaScale,
      uHeroPath,
      uHeroRoute,
    },
    positionNode: Fn(() => worldPos)(),
    colorNode: varying(vec4(rgb, alpha)),
  };
}

