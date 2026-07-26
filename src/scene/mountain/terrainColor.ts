/**
 * terrainColor.ts — the night-look color graph for the Rainier terrain
 * mesh (extracted from TerrainMesh.tsx so the component file exports ONLY
 * the component, and so the Tint probe compiles the REAL graph — the
 * coneNodes/trajNodes convention). Pure TSL: no React, no store.
 *
 *   rock   deep indigo-grey valleys → cold blue-grey ridges (by world y)
 *   snow   above the snowline AND on slopes gentle enough to hold it
 *          (normalWorld.y — steep rock stays dark even up high)
 *   sparkle fine noise gated to the snow mask (faint glints)
 *
 * Lighting comes from the standard pipeline (moon key + ambient, mounted
 * by ClientMountain) — this graph only sets the diffuse color.
 */
import {
  color,
  mix,
  mx_noise_float,
  normalWorld,
  positionWorld,
  smoothstep,
  uniform,
} from 'three/tsl';
import { MOUNTAIN_WORLD_SIZE, SNOWLINE_ELEV, type TerrainData } from './terrain';

export function buildTerrainColorNode(data: TerrainData) {
  const snowlineWorld = (SNOWLINE_ELEV - data.minElev) * data.yScale;
  const summitY = data.summit.y;
  const uSnowLo = uniform(snowlineWorld);
  const uSnowHi = uniform(snowlineWorld + summitY * 0.12);
  const uSummitY = uniform(Math.max(summitY, 1e-3));
  const uTerrainHalfWidth = uniform(MOUNTAIN_WORLD_SIZE * 0.5);
  const uEdgeFadeWidth = uniform(1.75);

  const hN = positionWorld.y.div(uSummitY).clamp(0, 1);
  const rock = mix(color(0x1d2a44), color(0x4a5f88), hN.pow(0.8));

  const snowMask = smoothstep(uSnowLo, uSnowHi, positionWorld.y).mul(
    smoothstep(0.45, 0.72, normalWorld.y),
  );
  const snow = color(0xd8e4f4);

  const sparkle = mx_noise_float(positionWorld.mul(38.0))
    .max(0.0)
    .pow(8.0)
    .mul(0.35)
    .mul(snowMask);

  const edgeDistance = uTerrainHalfWidth.sub(
    positionWorld.x.abs().max(positionWorld.z.abs()),
  );
  const opacityNode = smoothstep(0.0, uEdgeFadeWidth, edgeDistance);

  return {
    colorNode: mix(rock, snow, snowMask).add(sparkle),
    // Moonlit snow glows faintly even in shadow — "one luminous mountain".
    emissiveNode: snow.mul(snowMask).mul(0.085).add(sparkle.mul(0.5)),
    opacityNode,
    uniforms: {
      uSnowLo,
      uSnowHi,
      uSummitY,
      uTerrainHalfWidth,
      uEdgeFadeWidth,
    },
  };
}
