/**
 * summitNodes.ts — the summit cairn sprite's TSL graph (viz5). Steady
 * near-white glow; a subtle pulse rides in as the reveal sweep completes
 * (uReveal → 1). Extracted from SummitMarker.tsx so probe/viz5-probe.js
 * compiles the REAL production graph instead of an inline replica — same
 * no-drift pattern as mountainTrailNodes/mountainEmberNodes.
 *
 * `uTime` is created here and returned so the owner (the component's
 * useFrame, or the probe) drives it; it starts at 0.
 */
import { Fn, color, float, smoothstep, uniform, vec2, vec3, vec4 } from 'three/tsl';
import { uReveal } from '../playhead';
import type { TerrainData } from './terrain';

const CAIRN = /*#__PURE__*/ color(0xf2f7ff);
const BASE_SIZE = 0.42;

export function buildSummitNodes(summit: TerrainData['summit']) {
  const uTime = uniform(0);
  const pos = vec3(summit.x, summit.y + 0.18, summit.z);
  // Pulse: gentle breathing that arrives as the reveal sweep completes.
  const arrived = smoothstep(0.96, 1.0, uReveal);
  const breath = uTime.mul(2.2).sin().mul(0.5).add(0.5); // 0..1
  const scale = float(BASE_SIZE)
    .mul(arrived.mul(0.65).add(0.35))
    .mul(breath.mul(0.35).add(0.75));
  return {
    uTime,
    positionNode: Fn(() => pos)(),
    scaleNode: Fn(() => vec2(scale))(),
    colorNode: Fn(() =>
      vec4(CAIRN, float(0.85).mul(arrived.mul(0.6).add(0.4))),
    )(),
  };
}
