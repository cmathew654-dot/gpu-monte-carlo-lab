/**
 * routes.ts — ascent-route generation for the viz5 mountain client view.
 * Pure TS (no three, no React) so it is unit-testable and probe-loadable.
 *
 * Approach (validated against the baked Rainier heightmap):
 *
 *   1. Downsample the 512×512 heightmap to 256×256 (routing grid — the
 *      single-source Dijkstra then relaxes ~0.5M edges, <200 ms in V8).
 *   2. ONE Dijkstra FROM the summit over the whole grid with a hiking-cost
 *      edge model — cost = dist × (1 + 6·(slope/tan50°)⁴) with a ridge
 *      discount on locally convex cells — producing a least-cost-to-summit
 *      field. Cliff bands (slope > ~50°) are priced out, never hard-banned,
 *      so every route is guaranteed to reach the summit.
 *   3. Each route starts at a base-camp ring point (elevation < 1800 m)
 *      chosen by golden-angle angular spread (route k → angle k·2.3999…,
 *      outermost candidate inside ±0.3 rad) and follows STEEPEST DESCENT
 *      of the cost field to the summit — always terminates, naturally
 *      merges onto ridges, spreads across the whole face.
 *   4. Resample each polyline to ROUTE_POINTS (32 = SNAP_MAX) by arc
 *      length, lift to world coordinates, and bake per-point terrain
 *      normals for the trail
 *      offset shader.
 */
import { SNAP_MAX } from '../../sim/model/history';

/** Routes generated (spec: 150–250). */
export const ROUTE_COUNT = 200;
/** Points per resampled route (matches SNAP_MAX so trail progress = snap/31). */
export const ROUTE_POINTS = SNAP_MAX; // 32

/** Base-camp ring: start candidates below this elevation (m). */
const BASE_CAMP_MAX_ELEV = 1800;
/** Golden angle (rad) for angular start spread. */
const GOLDEN_ANGLE = 2.399963229728653;
/** Slope at which the cost explodes (~50°, the cliff-band threshold). */
const S50 = Math.tan((50 * Math.PI) / 180);

export interface RouteData {
  /** Number of valid routes. */
  count: number;
  /** count × ROUTE_POINTS × 3 world-space xyz (on the terrain surface). */
  points: Float32Array;
  /** count × ROUTE_POINTS × 3 world-space terrain normals (unit). */
  normals: Float32Array;
  /** count × ROUTE_POINTS × 3 world-space steepest-descent unit vectors. */
}

/** Everything the route baker needs to know about the world transform. */
export interface TerrainFrame {
  /** Full-resolution grid size (square). */
  grid: number;
  /** Meters per heightmap pixel. */
  metersPerPixel: number;
  /** World units per meter of elevation (includes vertical exaggeration). */
  yScale: number;
  /** World width of the full grid (X and Z span). */
  worldSize: number;
  /** Elevation (m) mapped to world y = 0. */
  baseElev: number;
}

// --- tiny helpers -----------------------------------------------------------

/** 3×3 box blur (edge-clamped), in place into `out`. */
function boxBlur3(src: Float32Array, out: Float32Array, g: number): void {
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) {
      let sum = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = Math.min(g - 1, Math.max(0, j + dj));
        for (let di = -1; di <= 1; di++) {
          const ii = Math.min(g - 1, Math.max(0, i + di));
          sum += src[jj * g + ii];
        }
      }
      out[j * g + i] = sum / 9;
    }
  }
}

/** Bilinear sample of a square grid at fractional (i, j), edge-clamped. */
function sampleBilinear(g: number, src: Float32Array, i: number, j: number): number {
  const x = Math.min(g - 1.001, Math.max(0, i));
  const y = Math.min(g - 1.001, Math.max(0, j));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const a = src[y0 * g + x0];
  const b = src[y0 * g + x0 + 1];
  const c = src[(y0 + 1) * g + x0];
  const d = src[(y0 + 1) * g + x0 + 1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Flat-index binary min-heap keyed on `cost`. */
class MinHeap {
  private idx: number[] = [];
  private cost: Float64Array;
  constructor(cost: Float64Array) {
    this.cost = cost;
  }
  get size(): number {
    return this.idx.length;
  }
  push(i: number): void {
    const a = this.idx;
    a.push(i);
    let c = a.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (this.cost[a[p]] <= this.cost[a[c]]) break;
      [a[p], a[c]] = [a[c], a[p]];
      c = p;
    }
  }
  pop(): number {
    const a = this.idx;
    const top = a[0];
    const last = a.pop() as number;
    if (a.length > 0) {
      a[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1;
        const r = l + 1;
        let m = p;
        if (l < a.length && this.cost[a[l]] < this.cost[a[m]]) m = l;
        if (r < a.length && this.cost[a[r]] < this.cost[a[m]]) m = r;
        if (m === p) break;
        [a[p], a[m]] = [a[m], a[p]];
        p = m;
      }
    }
    return top;
  }
}

/**
 * Generate ROUTE_COUNT ascent routes from the heightmap.
 * `heights` = full-res elevations in meters (grid × grid, row-major).
 * Deterministic (no RNG) — the same asset always yields the same routes.
 */
export function generateRoutes(
  heights: Float32Array,
  frame: TerrainFrame,
): RouteData {
  const G = frame.grid;
  const DS = G / 2; // routing grid (256 for a 512 heightmap)
  const mpp = frame.metersPerPixel * 2; // meters per routing pixel

  // --- routing grid: downsample + smooth ----------------------------------
  const hs = new Float32Array(DS * DS);
  for (let j = 0; j < DS; j++) {
    for (let i = 0; i < DS; i++) {
      const si = Math.min(G - 1, i * 2);
      const sj = Math.min(G - 1, j * 2);
      hs[j * DS + i] =
        (heights[sj * G + si] +
          heights[sj * G + Math.min(G - 1, si + 1)] +
          heights[Math.min(G - 1, sj + 1) * G + si] +
          heights[Math.min(G - 1, sj + 1) * G + Math.min(G - 1, si + 1)]) /
        4;
    }
  }
  const smooth = new Float32Array(DS * DS);
  boxBlur3(hs, smooth, DS);

  // Summit on the routing grid (argmax of the smoothed field).
  let sj = 0;
  let si = 0;
  let best = -Infinity;
  for (let j = 0; j < DS; j++) {
    for (let i = 0; i < DS; i++) {
      const v = smooth[j * DS + i];
      if (v > best) {
        best = v;
        sj = j;
        si = i;
      }
    }
  }

  // Ridge map: elevation minus a 5×5 local mean (convex cells > 0).
  const ridge = new Float32Array(DS * DS);
  for (let j = 0; j < DS; j++) {
    for (let i = 0; i < DS; i++) {
      let sum = 0;
      let n = 0;
      for (let dj = -2; dj <= 2; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= DS) continue;
        for (let di = -2; di <= 2; di++) {
          const ii = i + di;
          if (ii < 0 || ii >= DS) continue;
          sum += smooth[jj * DS + ii];
          n++;
        }
      }
      ridge[j * DS + i] = smooth[j * DS + i] - sum / n;
    }
  }

  // --- least-cost-to-summit field (single Dijkstra from the summit) -------
  const cost = new Float64Array(DS * DS).fill(Infinity);
  cost[sj * DS + si] = 0;
  const heap = new MinHeap(cost);
  heap.push(sj * DS + si);
  // Precomputed 8-neighborhood (dj, di, dist) — keeps the relax loop tight.
  const NBS: number[][] = [];
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      if (dj !== 0 || di !== 0) NBS.push([dj, di, Math.hypot(dj, di)]);
    }
  }
  while (heap.size > 0) {
    const cur = heap.pop();
    const cj = Math.floor(cur / DS);
    const ci = cur % DS;
    const cc = cost[cur];
    const hc = smooth[cur];
    for (const [dj, di, d] of NBS) {
      const nj = cj + dj;
      if (nj < 0 || nj >= DS) continue;
      const ni = ci + di;
      if (ni < 0 || ni >= DS) continue;
      const n = nj * DS + ni;
      const q = Math.abs(smooth[n] - hc) / (d * mpp * S50);
      const q2 = q * q;
      let step = d * (1 + 6 * q2 * q2);
      if (ridge[n] > 2) step *= 0.8; // ridge preference
      const nc = cc + step;
      if (nc < cost[n]) {
        cost[n] = nc;
        heap.push(n);
      }
    }
  }

  // --- start selection: base-camp ring, golden-angle spread ----------------
  const candI: number[] = [];
  const candJ: number[] = [];
  const candAng: number[] = [];
  const candRad: number[] = [];
  for (let j = 2; j < DS - 2; j++) {
    for (let i = 2; i < DS - 2; i++) {
      const dx = i - si;
      const dy = j - sj;
      const r = Math.hypot(dx, dy);
      if (smooth[j * DS + i] < BASE_CAMP_MAX_ELEV && r > DS * 0.2) {
        candI.push(i);
        candJ.push(j);
        candAng.push(Math.atan2(dy, dx));
        candRad.push(r);
      }
    }
  }

  const routesI: number[][] = [];
  const routesJ: number[][] = [];
  for (let k = 0; k < ROUTE_COUNT; k++) {
    const theta = k * GOLDEN_ANGLE;
    let pick = -1;
    let pickR = -1;
    for (let c = 0; c < candI.length; c++) {
      let dang = Math.abs(candAng[c] - theta) % (Math.PI * 2);
      if (dang > Math.PI) dang = Math.PI * 2 - dang;
      if (dang > 0.35) continue;
      if (candRad[c] > pickR) {
        pickR = candRad[c];
        pick = c;
      }
    }
    if (pick < 0) continue;

    // Steepest descent of the cost field to the summit (always terminates).
    const pathI: number[] = [candI[pick]];
    const pathJ: number[] = [candJ[pick]];
    let pj = candJ[pick];
    let pi = candI[pick];
    for (let step = 0; step < 4000; step++) {
      if (pj === sj && pi === si) break;
      let bj = -1;
      let bi = -1;
      let bc = cost[pj * DS + pi];
      for (let dj = -1; dj <= 1; dj++) {
        const nj = pj + dj;
        if (nj < 0 || nj >= DS) continue;
        for (let di = -1; di <= 1; di++) {
          const ni = pi + di;
          if (ni < 0 || ni >= DS) continue;
          if (cost[nj * DS + ni] < bc) {
            bc = cost[nj * DS + ni];
            bj = nj;
            bi = ni;
          }
        }
      }
      if (bj < 0) break; // should not happen (cost field is total)
      pj = bj;
      pi = bi;
      pathI.push(pi);
      pathJ.push(pj);
    }
    if (pathI.length < 2) continue;
    routesI.push(pathI);
    routesJ.push(pathJ);
  }

  // --- resample + lift to world -------------------------------------------
  const count = routesI.length;
  const points = new Float32Array(count * ROUTE_POINTS * 3);
  const normals = new Float32Array(count * ROUTE_POINTS * 3);
  const pxWorld = frame.worldSize / (G - 1); // world units per full-res pixel

  const worldX = (i: number): number => (i / (G - 1) - 0.5) * frame.worldSize;
  const worldZ = (j: number): number => (j / (G - 1) - 0.5) * frame.worldSize;
  const worldY = (e: number): number => (e - frame.baseElev) * frame.yScale;

  for (let r = 0; r < count; r++) {
    const pI = routesI[r];
    const pJ = routesJ[r];
    // arc-length table (in routing-grid px, ×2 → full-res px)
    const seg: number[] = [0];
    for (let s = 1; s < pI.length; s++) {
      seg.push(seg[s - 1] + Math.hypot(pI[s] - pI[s - 1], pJ[s] - pJ[s - 1]));
    }
    const total = seg[seg.length - 1];
    let s = 1; // targets increase monotonically — the pointer never resets
    for (let p = 0; p < ROUTE_POINTS; p++) {
      const target = (p / (ROUTE_POINTS - 1)) * total;
      while (s < seg.length - 1 && seg[s] < target) s++;
      const span = Math.max(1e-6, seg[s] - seg[s - 1]);
      const f = (target - seg[s - 1]) / span;
      const iDs = pI[s - 1] + (pI[s] - pI[s - 1]) * f; // routing-grid coords
      const jDs = pJ[s - 1] + (pJ[s] - pJ[s - 1]) * f;
      const i = iDs * 2; // full-res fractional coords
      const j = jDs * 2;

      const e = sampleBilinear(G, heights, i, j);
      const eL = sampleBilinear(G, heights, i - 1.5, j);
      const eR = sampleBilinear(G, heights, i + 1.5, j);
      const eT = sampleBilinear(G, heights, i, j - 1.5);
      const eB = sampleBilinear(G, heights, i, j + 1.5);
      // World slope (dy per world unit) along X and Z.
      const sX = ((eR - eL) / 3) * (frame.yScale / pxWorld);
      const sZ = ((eB - eT) / 3) * (frame.yScale / pxWorld);

      const o = (r * ROUTE_POINTS + p) * 3;
      points[o] = worldX(i);
      points[o + 1] = worldY(e);
      points[o + 2] = worldZ(j);

      // Terrain normal: (−∂y/∂x, 1, −∂y/∂z), normalized.
      const nLen = Math.hypot(sX, 1, sZ);
      normals[o] = -sX / nLen;
      normals[o + 1] = 1 / nLen;
      normals[o + 2] = -sZ / nLen;
    }
  }

  return { count, points, normals };
}
