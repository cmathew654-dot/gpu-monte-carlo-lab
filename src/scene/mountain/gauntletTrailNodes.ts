/**
 * W2-B historical cohort trail graph. Six CPU-replayed wealth paths ride
 * fixed Rainier routes using the same log10(wealth / simulated median)
 * terrain-normal offset as the stochastic braid.
 *
 * Storage bindings: routePos, routeNrm, medianLog, gauntletWealth,
 * gauntletEndSlot, gauntletEndState, gauntletRouteIndex = 7 (limit: 8).
 *
 * three r185 rule: slot/endSlot/routeIdx selects remain uint-only; slotF is
 * a separate float twin for progress math. Never reuse a select result across
 * uint and float contexts.
 */
import {
  Fn,
  float,
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
import { SNAP_MAX } from '../../sim/model/history';
import { GAUNTLET_RGB } from '../../sim/gauntlet/palette';
import { uReveal } from '../playhead';
import {
  gauntletEndSlot,
  gauntletRouteIndex,
  gauntletWealth,
  medianLog,
  routeNrm,
  routePos,
} from './mountainBuffers';
import { ROUTE_POINTS } from './routes';
import { TRAIL_LIFT } from './trailStyle';

const REVEAL_FEATHER = 0.025;
const TRAIL_ALPHA = 0.1;
const COHORT_LIFT = 0.13;
const GAUNTLET_OFFSET_K = 0.24;
const GAUNTLET_OFFSET_HI = 0.3;
const GAUNTLET_OFFSET_LO = -0.04;

const COHORT_COLORS = GAUNTLET_RGB.map(
  (rgb) => /*#__PURE__*/ vec3(rgb[0], rgb[1], rgb[2]),
);

export function buildGauntletTrailNodes() {
  const uSpritesPerCohort = uniform(31, 'uint');

  // Geometry layout: six cohorts × (points - 1) segments × two endpoints.
  const segment = vertexIndex.div(uint(2));
  const endpoint = vertexIndex.sub(segment.mul(uint(2)));
  const segmentsPerCohort = uSpritesPerCohort.sub(uint(1));
  const cohort = segment.div(segmentsPerCohort);
  const segmentSlot = segment.sub(cohort.mul(segmentsPerCohort));
  const slotRaw = segmentSlot.add(endpoint);

  const endSlot = gauntletEndSlot.element(cohort);
  // UINT-only endpoint clamp: later geometry collapses onto the true end.
  const slot = select(slotRaw.greaterThan(endSlot), endSlot, slotRaw);
  const routeIdx = gauntletRouteIndex.element(cohort);
  const wealth = gauntletWealth.element(
    cohort.mul(uint(SNAP_MAX)).add(slot),
  );
  const median = medianLog.element(slot);

  // FLOAT TWIN — progress math only (r185 ConditionalNode discipline).
  const slotF = select(
    slotRaw.greaterThan(endSlot),
    float(endSlot),
    float(slotRaw),
  );
  const t01 = slotF
    .div(uSpritesPerCohort.toFloat().sub(1.0))
    .clamp(0, 1);

  // Interpolate the assigned route at normalized horizon progress.
  const routeFloat = t01.mul(ROUTE_POINTS - 1);
  const i0 = uint(routeFloat.min(ROUTE_POINTS - 2));
  const fraction = routeFloat.sub(float(i0));
  const base0 = routeIdx
    .mul(uint(ROUTE_POINTS))
    .add(i0)
    .mul(uint(3));
  const base1 = base0.add(uint(3));
  const point0 = vec3(
    routePos.element(base0),
    routePos.element(base0.add(uint(1))),
    routePos.element(base0.add(uint(2))),
  );
  const point1 = vec3(
    routePos.element(base1),
    routePos.element(base1.add(uint(1))),
    routePos.element(base1.add(uint(2))),
  );
  const normal0 = vec3(
    routeNrm.element(base0),
    routeNrm.element(base0.add(uint(1))),
    routeNrm.element(base0.add(uint(2))),
  );
  const normal1 = vec3(
    routeNrm.element(base1),
    routeNrm.element(base1.add(uint(1))),
    routeNrm.element(base1.add(uint(2))),
  );
  const base = mix(point0, point1, fraction);
  const normal = mix(normal0, normal1, fraction);

  const logWealth = wealth.max(1.0).log().mul(0.43429448190325176);
  const offset = logWealth
    .sub(median)
    .mul(GAUNTLET_OFFSET_K)
    .clamp(GAUNTLET_OFFSET_LO, GAUNTLET_OFFSET_HI);
  const worldPosition = base.add(
    normal.mul(float(TRAIL_LIFT + COHORT_LIFT).add(offset)),
  );

  const revealAt = t01.mul(0.97).add(float(cohort).mul(0.004));
  const visible = smoothstep(
    revealAt,
    revealAt.add(REVEAL_FEATHER),
    uReveal,
  );
  // Segment zero is a real base-to-first-sample interval. Keeping it visible
  // is essential when a cohort fails or exhausts before the next snap: later
  // segments collapse at endSlot, leaving this as the only drawable segment.
  const alpha = float(TRAIL_ALPHA).mul(visible);
  const cohortRgb = select(
    cohort.equal(uint(1)),
    COHORT_COLORS[1],
    select(
      cohort.equal(uint(2)),
      COHORT_COLORS[2],
      select(
        cohort.equal(uint(3)),
        COHORT_COLORS[3],
        select(
          cohort.equal(uint(4)),
          COHORT_COLORS[4],
          select(cohort.equal(uint(5)), COHORT_COLORS[5], COHORT_COLORS[0]),
        ),
      ),
    ),
  );
  const rgb = cohortRgb;

  return {
    uniforms: { uSpritesPerCohort },
    positionNode: Fn(() => worldPosition)(),
    colorNode: varying(vec4(rgb, alpha)),
  };
}



