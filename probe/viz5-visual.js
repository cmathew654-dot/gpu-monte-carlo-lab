/* viz5 visual probe: renders the REAL terrain mesh + REAL route geometry
 * (CPU-built line strips standing in for the GPU trail shader, which is
 * Tint-probed separately) so the night look / camera framing / route spread
 * can be eyeballed from a screenshot. No sim buffers (too heavy for the
 * sandbox device lifetime). Drives a few frames then idles.
 */
import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardNodeMaterial,
  PerspectiveCamera,
  RenderTarget,
  Scene,
  Uint32BufferAttribute,
  WebGPURenderer,
} from 'three/webgpu';
import { buildTerrainData, MOUNTAIN_WORLD_SIZE } from '/src/scene/mountain/terrain.ts';
import { buildTerrainColorNode } from '/src/scene/mountain/terrainColor.ts';

const out = (s) => {
  document.getElementById('out').textContent = s;
  console.log('[visual] ' + s);
};
window.__visual = { frames: 0, errors: [] };
window.addEventListener('error', (e) => window.__visual.errors.push(e.message));

const MESH_RES = 384;

function buildGeometry(data) {
  const G = data.grid;
  const M = MESH_RES;
  const positions = new Float32Array(M * M * 3);
  const normals = new Float32Array(M * M * 3);
  const pxWorld = MOUNTAIN_WORLD_SIZE / (M - 1);
  const elevAt = (i, j) => {
    const fi = (i / (M - 1)) * (G - 1);
    const fj = (j / (M - 1)) * (G - 1);
    const i0 = Math.min(G - 2, Math.floor(fi));
    const j0 = Math.min(G - 2, Math.floor(fj));
    const fx = fi - i0;
    const fy = fj - j0;
    const a = data.heights[j0 * G + i0];
    const b = data.heights[j0 * G + i0 + 1];
    const c = data.heights[(j0 + 1) * G + i0];
    const d = data.heights[(j0 + 1) * G + i0 + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const worldY = (e) => (e - data.minElev) * data.yScale;
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < M; i++) {
      const o = (j * M + i) * 3;
      positions[o] = (i / (M - 1) - 0.5) * MOUNTAIN_WORLD_SIZE;
      positions[o + 1] = worldY(elevAt(i, j));
      positions[o + 2] = (j / (M - 1) - 0.5) * MOUNTAIN_WORLD_SIZE;
    }
  }
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < M; i++) {
      const iL = Math.max(0, i - 1);
      const iR = Math.min(M - 1, i + 1);
      const jT = Math.max(0, j - 1);
      const jB = Math.min(M - 1, j + 1);
      const sX = (worldY(elevAt(iR, j)) - worldY(elevAt(iL, j))) / ((iR - iL) * pxWorld);
      const sZ = (worldY(elevAt(i, jB)) - worldY(elevAt(i, jT))) / ((jB - jT) * pxWorld);
      const len = Math.hypot(sX, 1, sZ);
      const o = (j * M + i) * 3;
      normals[o] = -sX / len;
      normals[o + 1] = 1 / len;
      normals[o + 2] = -sZ / len;
    }
  }
  const index = new Uint32Array((M - 1) * (M - 1) * 6);
  let k = 0;
  for (let j = 0; j < M - 1; j++) {
    for (let i = 0; i < M - 1; i++) {
      const a = j * M + i;
      index[k++] = a; index[k++] = a + M; index[k++] = a + 1;
      index[k++] = a + 1; index[k++] = a + M; index[k++] = a + M + 1;
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geo.setIndex(new Uint32BufferAttribute(index, 1));
  return geo;
}

async function main() {
  const meta = await (await fetch('/terrain/terrain.json')).json();
  const u16 = new Uint16Array(await (await fetch('/terrain/heights.bin')).arrayBuffer());
  const data = buildTerrainData(meta, u16);
  out(`routes=${data.routes.count} summitY=${data.summit.y.toFixed(2)}`);

  const renderer = new WebGPURenderer({ canvas: document.getElementById('c'), antialias: true });
  await renderer.init();
  const scene = new Scene();
  scene.background = new Color(0x04060d);
  scene.add(new AmbientLight(0x2a3852, Number(new URLSearchParams(location.search).get('ai') ?? 0.16)));
  const mi = Number(new URLSearchParams(location.search).get('mi') ?? 2.2);
  const moon = new DirectionalLight(0xb8ccff, mi);
  moon.position.set(-16, 11, 15);
  scene.add(moon);
  const fill = new DirectionalLight(0x3a4a70, 0.3);
  fill.position.set(18, 5, 22);
  scene.add(fill);

  const mat = new MeshStandardNodeMaterial();
  mat.roughness = 0.95;
  const dbg = new URLSearchParams(location.search).get('debug');
  if (dbg === 'mask') {
    const { positionWorld, normalWorld, smoothstep, uniform, vec3 } = await import('three/tsl');
    const snowlineWorld = (2200 - data.minElev) * data.yScale;
    const m = smoothstep(snowlineWorld, snowlineWorld + data.summit.y*0.12, positionWorld.y).mul(smoothstep(0.45, 0.72, normalWorld.y));
    mat.colorNode = vec3(m, m.mul(0.4), m.mul(0.2));
  } else if (dbg === 'elev') {
    const { positionWorld, uniform, vec3 } = await import('three/tsl');
    mat.colorNode = vec3(positionWorld.y.div(data.summit.y), 0.1, 0.1);
  } else {
    const g = buildTerrainColorNode(data);
    mat.colorNode = g.colorNode;
    mat.emissiveNode = g.emissiveNode;
  }
  scene.add(new Mesh(buildGeometry(data), mat));

  // Routes as CPU line strips (stand-in for the GPU trail shader).
  const R = data.routes;
  const linePos = new Float32Array(R.count * 31 * 2 * 3);
  let k = 0;
  for (let r = 0; r < R.count; r++) {
    for (let p = 0; p < 31; p++) {
      const a = (r * 32 + p) * 3;
      const b = a + 3;
      for (const s of [a, b]) {
        linePos[k++] = R.points[s] + R.normals[s] * 0.15;
        linePos[k++] = R.points[s + 1] + R.normals[s + 1] * 0.15;
        linePos[k++] = R.points[s + 2] + R.normals[s + 2] * 0.15;
      }
    }
  }
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute('position', new Float32BufferAttribute(linePos, 3));
  const lineMat = new LineBasicMaterial({
    color: 0x4a8fff,
    transparent: true,
    opacity: 0.5,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const lines = new LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  if (new URLSearchParams(location.search).get('trails') !== '0') scene.add(lines);

  const camera = new PerspectiveCamera(45, 960 / 640, 0.1, 500);
  const targetY = data.summit.y * 0.52;

  // Render into a render target so pixels can be read back (headless
  // compositor screenshots of WebGPU canvases come back black).
  const rt = new RenderTarget(960, 640);
  const az0 = Number(new URLSearchParams(location.search).get('az') ?? 0.45);
  const el = Number(new URLSearchParams(location.search).get('el') ?? 0.15);
  const r0 = Number(new URLSearchParams(location.search).get('r') ?? 30);
  camera.position.set(
    r0 * Math.cos(el) * Math.sin(az0),
    r0 * Math.sin(el),
    r0 * Math.cos(el) * Math.cos(az0),
  );
  camera.lookAt(0, targetY, 0);

  // Single frame, then readback (no animation loop — SwiftShader in this
  // sandbox starves mapAsync while frames are in flight).
  try {
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    window.__visual.frames = 1;
  } catch (e) {
    window.__visual.errors.push(String(e));
  }
  out('readback start');
  renderer
    .readRenderTargetPixelsAsync(rt, 0, 0, 960, 640)
    .then((buf) => {
      out('readback resolved ' + buf.byteLength);
      const px = new Uint8Array(buf);
      const cv = document.createElement('canvas');
      cv.width = 960;
      cv.height = 640;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(960, 640);
      img.data.set(px); // WebGPU copyTextureToBuffer rows are already top-first
      ctx.putImageData(img, 0, 0);
      window.__visual.png = cv.toDataURL('image/png');
      out('png ready');
    })
    .catch((e) => {
      out('readback FAILED ' + e);
      window.__visual.errors.push(String(e));
    });
}

main().catch((e) => window.__visual.errors.push(String(e.stack || e)));
