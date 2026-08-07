/**
 * mountainEmberNodes.ts — viz5 mountain EMBERS: one sprite per rendered
 * FAILED path. When the reveal wave passes a path's death snap, the ember
 * ignites at the trail's death point and slides DOWNHILL along the baked
 * steepest-descent vector (−∇h from the heightmap, per route point),
 * fading toward the valley over the same ~0.2-reveal drop span the cone's
 * ember rain uses. Red #fb2c36. Survivors render at scale 0.
 *
 * Pure TSL, same r185 ConditionalNode discipline as mountainTrailNodes:
 * uint selects feed buffer indices; separate float twins feed slide math.
 */
import {
  Fn,
  color,
  float,
  hash,
  instanceIndex,
  mix,
  select,
  smoothstep,
  uint,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { pathFailed, uSnapStride } from '../../sim/buffers';
import { uReveal } from '../playhead';
import { routeDown, routeNrm, routePos, uRouteCount } from './mountainBuffers';
import { ROUTE_POINTS } from './routes';
import { LAT_SPREAD, LAT_WEAVE_AMP } from './trailStyle';

/** Death-slot ember color (the cone's failure red). */
const EMBER_RED = /*#__PURE__*/ color(0xfb2c36).mul(0.9);
/** Ember sprite size (world units). */
const EMBER_SIZE = 0.18;
const EMBER_SURFACE_LIFT = 0.02;
/** Reveal fraction over which the ember slides + fades (cone's drop span). */
const EMBER_DROP_SPAN = 0.2;
const REVEAL_FEATHER = 0.02;
/** Downhill slide distance (world units). */
const SLIDE_DIST = 2.4;

export function buildMountainEmberNodes() {
  const uSpritesPerPath = uniform(31, 'uint');
  const uSnapDecimate = uniform(1, 'uint');
  const uPathSubset = uniform(1, 'uint');
  const uSnapsTotal = uniform(31, 'uint');

  // One sprite per rendered line path (same subset as the trails).
  const pathSlot = uint(instanceIndex); // plain conversion, not a select
  const pathId = pathSlot.mul(uPathSubset);
  const seedBase = pathId.mul(uint(64));
  const routeHash = hash(seedBase.add(uint(777)));
  const routeIdx = uint(
    routeHash.mul(uRouteCount.toFloat()).min(uRouteCount.toFloat().sub(1.0)),
  );

  // --- death snap (same contract math as the trails) -----------------------
  const failedVal = pathFailed.element(pathId); // 0 = alive
  const isFailed = failedVal.greaterThan(uint(0));
  const failSlot = failedVal.sub(uint(1)).div(uSnapStride).add(uint(1));
  const ceilSlot = failSlot
    .add(uSnapDecimate.sub(uint(1)))
    .div(uSnapDecimate)
    .mul(uSnapDecimate);
  const maxGridSlot = uSpritesPerPath.sub(uint(2)).mul(uSnapDecimate);
  // FLOAT twin only (embers need the progress, never a uint buffer index of
  // the death slot) — one select, one type context.
  const deathSlotF = select(
    ceilSlot.greaterThan(maxGridSlot),
    uSnapsTotal.toFloat().sub(1.0),
    float(ceilSlot),
  );
  const t01 = deathSlotF.div(uSnapsTotal.toFloat().sub(1.0)).clamp(0, 1);

  // --- route point + downhill vector at the death snap ---------------------
  const rf = t01.mul(ROUTE_POINTS - 1);
  const i0 = uint(rf.min(ROUTE_POINTS - 2));
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
  const d0 = vec3(
    routeDown.element(b0),
    routeDown.element(b0.add(uint(1))),
    routeDown.element(b0.add(uint(2))),
  );
  const d1 = vec3(
    routeDown.element(b1),
    routeDown.element(b1.add(uint(1))),
    routeDown.element(b1.add(uint(2))),
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
  const down = mix(d0, d1, f);

  // --- ignite at the death snap, slide downhill, fade to the valley --------
  const revealH = hash(seedBase.add(uint(505)));
  const revealAt = t01.mul(0.96).add(revealH.mul(0.04));
  const vis = smoothstep(revealAt, revealAt.add(REVEAL_FEATHER), uReveal);
  const dropT = smoothstep(revealAt, revealAt.add(EMBER_DROP_SPAN), uReveal);

  // v5.2: inherit the trail's lateral offset so the ember ignites WHERE
  // the trail actually is (trails now spread across the face). Constants
  // come from trailStyle.ts so the two graphs can never drift.
  const lateral = p1
    .sub(p0)
    .cross(nrm)
    .normalize();
  const latH = hash(seedBase.add(uint(888)));
  const latPhase = hash(seedBase.add(uint(999)));
  const latOffset = latH
    .sub(0.5)
    .mul(LAT_SPREAD)
    .add(
      t01
        .mul(Math.PI * 4)
        .add(latPhase.mul(Math.PI * 2))
        .sin()
        .mul(LAT_WEAVE_AMP),
    );
  const restingPos = base.add(lateral.mul(latOffset));
  const worldPos = restingPos
    .add(nrm.mul(EMBER_SURFACE_LIFT))
    .add(down.mul(dropT.pow(1.4).mul(SLIDE_DIST)));
  const radial = smoothstep(0.18, 0.44, uv().sub(0.5).length()).oneMinus();
  const alpha = float(0.9)
    .mul(vis)
    .mul(dropT.mul(0.85).oneMinus())
    .mul(radial)
    .mul(select(isFailed, float(1.0), float(0.0)));

  return {
    uniforms: { uSpritesPerPath, uSnapDecimate, uPathSubset, uSnapsTotal },
    positionNode: Fn(() => worldPos)(),
    scaleNode: Fn(() =>
      vec2(EMBER_SIZE)
        .mul(vis)
        .mul(dropT.mul(0.35).oneMinus())
        .mul(select(isFailed, float(1.0), float(0.0))),
    )(),
    colorNode: Fn(() => vec4(EMBER_RED, alpha))(),
  };
}
