/* viz5 probe: Tint-validates every NEW shader graph authored for the
 * Rainier client view, against the REAL baked terrain asset and the REAL
 * route-generation path (no probe drift):
 *
 *   1. fetch /terrain/terrain.json + /terrain/heights.bin (served from
 *      public/ by the vite dev server), build TerrainData via the REAL
 *      buildTerrainData() — this also functionally exercises route
 *      generation in-browser (route count + summit terminus checks).
 *   2. Upload the REAL route buffers + a synthetic medianLog.
 *   3. getShaderAsync on:
 *      a. the terrain mesh material (MeshStandardNodeMaterial +
 *         buildTerrainColorNode: positionWorld/normalWorld/mx_noise_float,
 *         lit by a real DirectionalLight),
 *      b. the trail LineSegments (buildMountainTrailNodes: route storage
 *         reads + frozen sim buffer reads + uint/float select discipline),
 *      c. the summit cairn sprite (buildSummitNodes — the REAL production
 *         graph from summitNodes.ts, no inline replica).
 *      Tint errors surface as uncapturederror / getShaderAsync rejections.
 *
 * Served by the vite dev server so /src TS imports resolve; driven by
 * probe/run-viz5-probe.mjs (headless chromium + SwiftShader).
 */
import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  LineBasicNodeMaterial,
  LineSegments,
  Mesh,
  MeshStandardNodeMaterial,
  PerspectiveCamera,
  Scene,
  Sprite,
  SpriteNodeMaterial,
  Uint32BufferAttribute,
  WebGPURenderer,
} from 'three/webgpu';
import { buildTerrainData } from '/src/scene/mountain/terrain.ts';
import { buildTerrainColorNode } from '/src/scene/mountain/terrainColor.ts';
import { buildMountainTrailNodes } from '/src/scene/mountain/mountainTrailNodes.ts';
import { buildGauntletTrailNodes } from '/src/scene/mountain/gauntletTrailNodes.ts';
import { buildSummitNodes } from '/src/scene/mountain/summitNodes.ts';
import {
  gauntletEndSlot,
  gauntletEndState,
  gauntletRouteIndex,
  gauntletWealth,
  medianLog,
  routeNrm,
  routePos,
  uRouteCount,
} from '/src/scene/mountain/mountainBuffers.ts';
import { getStorageAttribute } from '/src/sim/buffers.ts';
import { uReveal } from '/src/scene/playhead.ts';

const out = (s) => {
  document.getElementById('out').textContent += '\n' + s;
  console.log('[probe] ' + s);
};
window.__probe = { done: false, wgsl: {}, errors: [], checks: {} };
window.addEventListener('error', (e) =>
  window.__probe.errors.push('window.onerror: ' + e.message),
);
window.addEventListener('unhandledrejection', (e) =>
  window.__probe.errors.push(
    'unhandledrejection: ' +
      (e.reason && (e.reason.stack || e.reason.message || String(e.reason))),
  ),
);

async function main() {
  const renderer = new WebGPURenderer({
    canvas: document.getElementById('c'),
  });
  await renderer.init();
  out('renderer.init OK');
  const device = renderer.backend.device;
  device.addEventListener('uncapturederror', (ev) => {
    window.__probe.errors.push('uncapturederror: ' + ev.error.message);
    out('UNCAPTURED: ' + ev.error.message.slice(0, 2500));
  });

  // --- 1) real asset + real route generation ------------------------------
  let data;
  try {
    const t0 = performance.now();
    const meta = await (await fetch('/terrain/terrain.json')).json();
    const u16 = new Uint16Array(
      await (await fetch('/terrain/heights.bin')).arrayBuffer(),
    );
    data = buildTerrainData(meta, u16);
    const dt = performance.now() - t0;
    window.__probe.checks.routeCount = data.routes.count;
    window.__probe.checks.routeGenMs = Math.round(dt);
    out(
      `terrain loaded: grid=${data.grid} max=${data.maxElev}m summitY=${data.summit.y.toFixed(2)} ` +
        `routes=${data.routes.count} in ${dt.toFixed(0)}ms`,
    );
    if (data.maxElev < 4292 || data.maxElev > 4492) {
      window.__probe.errors.push('maxElev out of range: ' + data.maxElev);
    }
    if (data.routes.count < 150 || data.routes.count > 250) {
      window.__probe.errors.push('route count out of range: ' + data.routes.count);
    }
    // Every route must end at the summit.
    let bad = 0;
    for (let r = 0; r < data.routes.count; r++) {
      const o = (r * 32 + 31) * 3;
      const dx = data.routes.points[o] - data.summit.x;
      const dy = data.routes.points[o + 1] - data.summit.y;
      const dz = data.routes.points[o + 2] - data.summit.z;
      if (Math.hypot(dx, dy, dz) > 0.6) bad++;
    }
    window.__probe.checks.routesMissingSummit = bad;
    if (bad > 0) window.__probe.errors.push(bad + ' routes miss the summit');
  } catch (e) {
    window.__probe.errors.push('terrain load/route gen: ' + (e.stack || e.message));
    out('terrain THREW: ' + e.message);
    window.__probe.done = true;
    return;
  }

  // --- 2) upload the real route buffers + synthetic median ----------------
  const fill = (node, arr) => {
    const a = getStorageAttribute(node);
    a.array.set(arr);
    a.needsUpdate = true;
  };
  fill(routePos, data.routes.points);
  fill(routeNrm, data.routes.normals);
  uRouteCount.value = data.routes.count;
  {
    const a = getStorageAttribute(medianLog);
    for (let s = 0; s < 32; s++) a.array[s] = 6 + s * 0.01; // synthetic p50
    a.needsUpdate = true;
  }
  {
    const wealth = new Float32Array(6 * 32);
    for (let cohort = 0; cohort < 6; cohort++) {
      for (let snap = 0; snap < 32; snap++) {
        wealth[cohort * 32 + snap] = 1_000_000 * (1 + cohort * 0.08 + snap * 0.02);
      }
    }
    fill(gauntletWealth, wealth);
    fill(gauntletEndSlot, new Uint32Array([30, 30, 24, 30, 26, 18]));
    fill(gauntletEndState, new Uint32Array([0, 0, 1, 0, 2, 2]));
    fill(gauntletRouteIndex, new Uint32Array([0, 31, 62, 93, 124, 155]));
  }
  uReveal.value = 0.5;

  const scene = new Scene();
  scene.add(new AmbientLight(0x26324a, 0.1));
  const moon = new DirectionalLight(0xb8ccff, 1.6);
  moon.position.set(-22, 12, -6);
  scene.add(moon);
  const camera = new PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.set(0, 4, 30);
  camera.lookAt(0, 4, 0);

  // --- 3a) terrain material ------------------------------------------------
  try {
    const mat = new MeshStandardNodeMaterial();
    mat.roughness = 0.95;
    mat.transparent = true;
    mat.depthWrite = true;
    mat.alphaTest = 0.02;
    const terrainGraph = buildTerrainColorNode(data);
    mat.colorNode = terrainGraph.colorNode;
    mat.emissiveNode = terrainGraph.emissiveNode;
    mat.opacityNode = terrainGraph.opacityNode;
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new Float32BufferAttribute(new Float32Array(9), 3),
    );
    geo.setAttribute(
      'normal',
      new Float32BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3),
    );
    geo.setIndex(new Uint32BufferAttribute(new Uint32Array([0, 1, 2]), 1));
    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const shaders = await renderer.debug.getShaderAsync(scene, camera, mesh);
    window.__probe.wgsl.terrainVertex = shaders.vertexShader;
    window.__probe.wgsl.terrainFragment = shaders.fragmentShader;
    out('terrain WGSL OK (' + shaders.vertexShader.length + '/' + shaders.fragmentShader.length + ' chars)');
    scene.remove(mesh);
  } catch (e) {
    window.__probe.errors.push('getShaderAsync(terrain): ' + (e.stack || e.message));
    out('getShaderAsync(terrain) THREW: ' + e.message);
  }

  // --- 3b) trail material ---------------------------------------------------
  try {
    const nodes = buildMountainTrailNodes();
    const mat = new LineBasicNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = AdditiveBlending;
    mat.positionNode = nodes.positionNode;
    mat.colorNode = nodes.colorNode;
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new Float32BufferAttribute(new Float32Array(2048 * 3), 3),
    );
    const lines = new LineSegments(geo, mat);
    lines.frustumCulled = false;
    scene.add(lines);
    const shaders = await renderer.debug.getShaderAsync(scene, camera, lines);
    window.__probe.wgsl.trailVertex = shaders.vertexShader;
    window.__probe.wgsl.trailFragment = shaders.fragmentShader;
    out('trail WGSL OK (' + shaders.vertexShader.length + '/' + shaders.fragmentShader.length + ' chars)');
    scene.remove(lines);
  } catch (e) {
    window.__probe.errors.push('getShaderAsync(trails): ' + (e.stack || e.message));
    out('getShaderAsync(trails) THREW: ' + e.message);
  }

  // --- 3c) historical gauntlet trails (REAL production graph) ------------
  try {
    const nodes = buildGauntletTrailNodes();
    const mat = new LineBasicNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = AdditiveBlending;
    mat.positionNode = nodes.positionNode;
    mat.colorNode = nodes.colorNode;
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new Float32BufferAttribute(new Float32Array(512 * 3), 3),
    );
    const lines = new LineSegments(geo, mat);
    lines.frustumCulled = false;
    scene.add(lines);
    const shaders = await renderer.debug.getShaderAsync(scene, camera, lines);
    window.__probe.wgsl.gauntletVertex = shaders.vertexShader;
    window.__probe.wgsl.gauntletFragment = shaders.fragmentShader;
    out('gauntlet WGSL OK (' + shaders.vertexShader.length + '/' + shaders.fragmentShader.length + ' chars)');
    scene.remove(lines);
  } catch (e) {
    window.__probe.errors.push('getShaderAsync(gauntlet): ' + (e.stack || e.message));
    out('getShaderAsync(gauntlet) THREW: ' + e.message);
  }

  // --- 3d) summit cairn sprite (REAL production graph — summitNodes.ts) ---
  try {
    const nodes = buildSummitNodes(data.summit);
    const mat = new SpriteNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = AdditiveBlending;
    mat.positionNode = nodes.positionNode;
    mat.scaleNode = nodes.scaleNode;
    mat.colorNode = nodes.colorNode;
    const sprite = new Sprite(mat);
    sprite.frustumCulled = false;
    scene.add(sprite);
    const shaders = await renderer.debug.getShaderAsync(scene, camera, sprite);
    window.__probe.wgsl.summitVertex = shaders.vertexShader;
    window.__probe.wgsl.summitFragment = shaders.fragmentShader;
    out('summit WGSL OK (' + shaders.vertexShader.length + '/' + shaders.fragmentShader.length + ' chars)');
    scene.remove(sprite);
  } catch (e) {
    window.__probe.errors.push('getShaderAsync(summit): ' + (e.stack || e.message));
    out('getShaderAsync(summit) THREW: ' + e.message);
  }

  window.__probe.done = true;
}

main().catch((e) => {
  window.__probe.errors.push('main: ' + (e.stack || e.message));
  window.__probe.done = true;
});
