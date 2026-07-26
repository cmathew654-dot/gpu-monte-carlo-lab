import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mountainFitRadius } from './cameraFit.ts';
import { buildTerrainColorNode } from './mountain/terrainColor.ts';

const BASE_RADIUS = 34;
const TERRAIN_HALF_WIDTH = 13;
const VERTICAL_FOV_DEGREES = 45;

const expectedFitRadius = (aspect) => (
  (TERRAIN_HALF_WIDTH * 1.12)
  / (Math.tan((VERTICAL_FOV_DEGREES * Math.PI) / 360) * aspect)
);

const landscape = mountainFitRadius(
  BASE_RADIUS,
  TERRAIN_HALF_WIDTH,
  VERTICAL_FOV_DEGREES,
  982 / 800,
);
assert.equal(landscape, BASE_RADIUS);

const portrait390 = mountainFitRadius(
  BASE_RADIUS,
  TERRAIN_HALF_WIDTH,
  VERTICAL_FOV_DEGREES,
  390 / 844,
);
assert.ok(Math.abs(portrait390 - expectedFitRadius(390 / 844)) < 1e-10);

const portrait255 = mountainFitRadius(
  BASE_RADIUS,
  TERRAIN_HALF_WIDTH,
  VERTICAL_FOV_DEGREES,
  255 / 542,
);
assert.ok(Math.abs(portrait255 - expectedFitRadius(255 / 542)) < 1e-10);
assert.ok(portrait390 > portrait255);
assert.ok(Number.isFinite(landscape));
assert.ok(Number.isFinite(portrait390));
assert.ok(Number.isFinite(portrait255));

assert.equal(
  mountainFitRadius(
    BASE_RADIUS,
    TERRAIN_HALF_WIDTH,
    VERTICAL_FOV_DEGREES,
    Number.NaN,
  ),
  BASE_RADIUS,
);
assert.equal(
  mountainFitRadius(BASE_RADIUS, TERRAIN_HALF_WIDTH, 0, 0.5),
  BASE_RADIUS,
);
assert.equal(
  mountainFitRadius(
    BASE_RADIUS,
    TERRAIN_HALF_WIDTH,
    VERTICAL_FOV_DEGREES,
    0,
  ),
  BASE_RADIUS,
);

const terrainGraph = buildTerrainColorNode({
  minElev: 0,
  summit: { x: 0, y: 8, z: 0 },
  yScale: 1,
});
assert.ok(terrainGraph.opacityNode, 'terrain graph exposes boundary opacity');
const viz5Probe = readFileSync('probe/viz5-probe.js', 'utf8');
assert.match(viz5Probe, /mat\.opacityNode\s*=\s*terrainGraph\.opacityNode/);
assert.match(viz5Probe, /mat\.transparent\s*=\s*true/);
assert.match(viz5Probe, /mat\.depthWrite\s*=\s*true/);
assert.match(viz5Probe, /mat\.alphaTest\s*=\s*0\.02/);

console.log('cameraFit and terrain edge: 15 passed, 0 failed');
