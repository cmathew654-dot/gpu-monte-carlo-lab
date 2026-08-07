/**
 * summitNodes.ts — the summit cairn sprite's TSL graph (viz5). Steady
 * near-white glow, extracted from SummitMarker.tsx so probe/viz5-probe.js
 * compiles the REAL production graph instead of an inline replica — same
 * no-drift pattern as mountainTrailNodes/mountainEmberNodes.
 *
 */
import { Fn, color, float, smoothstep, uv, vec2, vec3, vec4 } from 'three/tsl';
import { uReveal } from '../playhead';
import type { TerrainData } from './terrain';

const CAIRN = /*#__PURE__*/ color(0xf2f7ff);
const BASE_SIZE = 0.17;

export function buildSummitNodes(summit: TerrainData['summit']) {
  const pos = vec3(summit.x, summit.y + 0.18, summit.z);
  const arrived = smoothstep(0.96, 1.0, uReveal);
  const scale = float(BASE_SIZE)
    .mul(arrived.mul(0.65).add(0.35));
  const radial = smoothstep(0.18, 0.42, uv().sub(0.5).length()).oneMinus();
  return {
    positionNode: Fn(() => pos)(),
    scaleNode: Fn(() => vec2(scale))(),
    colorNode: Fn(() =>
      vec4(CAIRN, float(0.85).mul(arrived.mul(0.6).add(0.4)).mul(radial)),
    )(),
  };
}
