/* viz2 probe: Tint-validates every NEW shader graph authored for viz2, and
 * functionally checks the per-snapshot histogram pass end-to-end:
 *
 *   1. computeInit + computeSnapHistClear + computeSnapHistBuild dispatched
 *      inside validation error scopes (uActiveN capped at 10k to fit the
 *      container's ~1.4 s device lifetime), then ONE readback of
 *      snapHistBuffer: row 0 must sum to 10k (all paths alive at
 *      initialWealth) — a real GPU compute + readback, not just compile.
 *   2. getShaderAsync on a Sprite wearing the REAL buildConeNodes() graph
 *      (cursor-dim delta vs v1) and a LineSegments wearing the REAL
 *      buildTrajectoryNodes() graph (vertexIndex + varying + storage reads).
 *      Tint errors surface as uncapturederror / getShaderAsync rejections.
 *
 * Served by the vite dev server so /src TS imports resolve; driven by
 * probe/run-viz2-probe.mjs (headless chromium + SwiftShader).
 */
import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  LineBasicNodeMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  Sprite,
  SpriteNodeMaterial,
  WebGPURenderer,
} from 'three/webgpu';
import { computeInit } from '/src/sim/kernels/initPaths.tsl.ts';
import {
  computeSnapHistBuild,
  computeSnapHistClear,
  snapHistBuffer,
} from '/src/sim/stats/snapHistogram.tsl.ts';
import { SNAP_HIST_UINTS } from '/src/sim/stats/snapStats.ts';
import { buildConeNodes } from '/src/scene/coneNodes.ts';
import { buildTrajectoryNodes } from '/src/scene/trajNodes.ts';
import { pickHeroPath } from '/src/sim/stats/heroPath.ts';
import { getStorageAttribute, pathWealth, uActiveN } from '/src/sim/buffers.ts';

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

const PROBE_PATHS = 10_000;

async function scopedDispatch(device, renderer, name, node) {
  await device.pushErrorScope('validation');
  try {
    renderer.compute(node);
  } catch (e) {
    window.__probe.errors.push(name + ' dispatch threw: ' + (e.stack || e.message));
    out(name + ' THREW: ' + e.message);
  }
  const gpuErr = await device.popErrorScope();
  if (gpuErr) {
    window.__probe.errors.push(name + ' validation: ' + gpuErr.message);
    out(name + ' VALIDATION ERROR: ' + gpuErr.message.slice(0, 3000));
  } else {
    out(name + ' dispatch passed validation scope');
  }
}

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

  // --- 1) functional compute check (fast — before shader compiles) --------
  uActiveN.value = PROBE_PATHS;
  await scopedDispatch(device, renderer, 'computeInit', computeInit);
  await scopedDispatch(device, renderer, 'computeSnapHistClear', computeSnapHistClear);
  await scopedDispatch(device, renderer, 'computeSnapHistBuild', computeSnapHistBuild);

  try {
    const attr = getStorageAttribute(snapHistBuffer);
    const buf = await renderer.getArrayBufferAsync(attr);
    const raw = new Uint32Array(buf);
    out('snapHist readback uints=' + raw.length + ' (expect ≥' + SNAP_HIST_UINTS + ')');
    let row0 = 0;
    let row0MaxBin = -1;
    for (let b = 0; b < 96; b++) {
      row0 += raw[b];
      if (raw[b] > 0) row0MaxBin = b;
    }
    window.__probe.checks.row0Sum = row0;
    window.__probe.checks.row0MaxBin = row0MaxBin;
    // All 10k paths alive at snapshot 0 with wealth $1e6 → log10=6 lands in
    // bin floor((6−3)/5.5×96) = 52.
    out('row0 sum=' + row0 + ' (expect ' + PROBE_PATHS + '), maxBin=' + row0MaxBin + ' (expect 52)');
    if (row0 !== PROBE_PATHS) {
      window.__probe.errors.push('row0 sum mismatch: ' + row0 + ' != ' + PROBE_PATHS);
    }
    if (row0MaxBin !== 52) {
      window.__probe.errors.push('row0 bin mismatch: ' + row0MaxBin + ' != 52');
    }
  } catch (e) {
    window.__probe.errors.push('snapHist readback: ' + (e.stack || e.message));
    out('readback THREW: ' + e.message);
  }

  // --- 1b) viz3 hero-path pick (functional: real pathWealth readback) -----
  // After computeInit all 10k paths sit at initialWealth ($1e6), so the
  // median-closest rendered survivor must exist with wealth ≈ 1e6.
  try {
    const wbuf = await renderer.getArrayBufferAsync(getStorageAttribute(pathWealth));
    const wealth = new Float32Array(wbuf);
    const hero = pickHeroPath(wealth, PROBE_PATHS, 1_000_000, 1);
    window.__probe.checks.heroPath = hero;
    out('hero pick=' + hero + ' wealth=' + (hero >= 0 ? wealth[hero] : 'n/a'));
    if (hero < 0 || hero >= PROBE_PATHS || Math.abs(wealth[hero] - 1_000_000) > 1) {
      window.__probe.errors.push('hero pick mismatch: ' + hero);
    }
  } catch (e) {
    window.__probe.errors.push('hero readback: ' + (e.stack || e.message));
    out('hero readback THREW: ' + e.message);
  }

  // --- 2) material compiles (real graphs, no probe drift) -----------------
  const scene = new Scene();
  const camera = new PerspectiveCamera(45, 64 / 64, 0.1, 500);
  camera.position.set(0, 10, 32);
  camera.lookAt(0, 0, 0);

  try {
    const coneNodes = buildConeNodes();
    const spriteMat = new SpriteNodeMaterial();
    spriteMat.transparent = true;
    spriteMat.depthWrite = false;
    spriteMat.blending = AdditiveBlending;
    spriteMat.positionNode = coneNodes.positionNode;
    spriteMat.scaleNode = coneNodes.scaleNode;
    spriteMat.colorNode = coneNodes.colorNode;
    const sprite = new Sprite(spriteMat);
    sprite.count = 1024;
    sprite.frustumCulled = false;
    scene.add(sprite);
    const shaders = await renderer.debug.getShaderAsync(scene, camera, sprite);
    window.__probe.wgsl.spriteVertex = shaders.vertexShader;
    window.__probe.wgsl.spriteFragment = shaders.fragmentShader;
    out('cone sprite WGSL OK (' + shaders.vertexShader.length + '/' + shaders.fragmentShader.length + ' chars)');
    scene.remove(sprite);
  } catch (e) {
    window.__probe.errors.push('getShaderAsync(sprite): ' + (e.stack || e.message));
    out('getShaderAsync(sprite) THREW: ' + e.message);
  }

  try {
    const lineNodes = buildTrajectoryNodes();
    const lineMat = new LineBasicNodeMaterial();
    lineMat.transparent = true;
    lineMat.depthWrite = false;
    lineMat.blending = AdditiveBlending;
    lineMat.positionNode = lineNodes.positionNode;
    lineMat.colorNode = lineNodes.colorNode;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(2048 * 3), 3));
    const lines = new LineSegments(geo, lineMat);
    lines.frustumCulled = false;
    scene.add(lines);
    const shaders = await renderer.debug.getShaderAsync(scene, camera, lines);
    window.__probe.wgsl.lineVertex = shaders.vertexShader;
    window.__probe.wgsl.lineFragment = shaders.fragmentShader;
    out('trajectory line WGSL OK (' + shaders.vertexShader.length + '/' + shaders.fragmentShader.length + ' chars)');
    scene.remove(lines);
  } catch (e) {
    window.__probe.errors.push('getShaderAsync(lines): ' + (e.stack || e.message));
    out('getShaderAsync(lines) THREW: ' + e.message);
  }

  // --- 2b) viz4 client-mode graphs ----------------------------------------
  // The sprite/line compiles above already cover the uClientMode cull (the
  // probe imports the REAL buildConeNodes/buildTrajectoryNodes graphs —
  // the new uniform is part of them). Additionally compile the percentile
  // BAND material: plain MeshBasicMaterial + vertexColors + additive
  // (no authored TSL, but the strip pipeline is proven here end-to-end).
  try {
    const bandMat = new MeshBasicMaterial({
      transparent: true,
      opacity: 0.32,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      vertexColors: true,
    });
    const PTS = 32;
    const bandGeo = new BufferGeometry();
    bandGeo.setAttribute(
      'position',
      new Float32BufferAttribute(new Float32Array(PTS * 2 * 3), 3),
    );
    bandGeo.setAttribute(
      'color',
      new Float32BufferAttribute(new Float32Array(PTS * 2 * 3).fill(0.5), 3),
    );
    const idx = [];
    for (let i = 0; i < PTS - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    bandGeo.setIndex(idx);
    const band = new Mesh(bandGeo, bandMat);
    band.frustumCulled = false;
    scene.add(band);
    const shaders = await renderer.debug.getShaderAsync(scene, camera, band);
    window.__probe.wgsl.bandVertex = shaders.vertexShader;
    window.__probe.wgsl.bandFragment = shaders.fragmentShader;
    out('percentile band WGSL OK (' + shaders.vertexShader.length + '/' + shaders.fragmentShader.length + ' chars)');
    scene.remove(band);
  } catch (e) {
    window.__probe.errors.push('getShaderAsync(band): ' + (e.stack || e.message));
    out('getShaderAsync(band) THREW: ' + e.message);
  }

  window.__probe.done = true;
  out('DONE errors=' + window.__probe.errors.length);
}

main().catch((e) => {
  window.__probe.errors.push('main: ' + (e.stack || e.message));
  window.__probe.done = true;
  out('MAIN THREW: ' + e.message);
});
