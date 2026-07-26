/**
 * terrain.ts — loads the baked Mt. Rainier heightmap asset
 * (public/terrain/, produced by scripts/build_terrain.mjs from USGS NED /
 * SRTM via Mapzen Terrarium), builds the world transform, and generates the
 * ascent routes ONCE per session (module-level cache — the scene remounts
 * on view toggles and must not re-fetch / re-route).
 *
 * States: 'loading' → 'ready' | 'failed'. 'failed' is the OFFLINE path:
 * ClientMountain then renders the viz4 PercentileBands client scene instead
 * (the mountain simply never existed for this session).
 *
 * World layout (matches the cone's X span so CameraRig framing stays sane):
 *   x,z ∈ ±13   (MOUNTAIN_WORLD_SIZE = 26, one full grid across)
 *   y = (elev − minElev) × yScale,  yScale = worldSize/extentMeters × 1.3
 *   summit ≈ (0, ~7.9, 0) — the crop is summit-centered by construction.
 */
import { useEffect, useState } from 'react';
import { generateRoutes, type RouteData, type TerrainFrame } from './routes';

/** Full world span of the terrain grid (matches layout.X_SPAN). */
export const MOUNTAIN_WORLD_SIZE = 26;
/** Vertical exaggeration for drama (spec: ~1.3×). */
export const MOUNTAIN_VERT_EXAG = 1.3;
/** Snowline elevation (m) — shader mixes snow above this on gentle slopes. */
export const SNOWLINE_ELEV = 2200;

export interface TerrainMeta {
  grid: number;
  minElev: number;
  maxElev: number;
  metersPerPixel: number;
  extentMeters: number;
}

export interface TerrainData extends TerrainMeta {
  /** Full-res elevations, meters (grid × grid, row-major). */
  heights: Float32Array;
  /** World units per meter of elevation (exaggeration included). */
  yScale: number;
  /** World-space summit position (argmax of the heightmap). */
  summit: { x: number; y: number; z: number };
  /** Ascent routes (world space). */
  routes: RouteData;
}

export type TerrainStatus = 'loading' | 'ready' | 'failed';

interface TerrainCache {
  status: TerrainStatus;
  data: TerrainData | null;
  listeners: Set<() => void>;
}

const cache: TerrainCache = { status: 'loading', data: null, listeners: new Set() };

function notify(): void {
  for (const l of cache.listeners) l();
}

/** Non-React peek (CameraRig reads this per frame). */
export function getTerrainStatus(): TerrainStatus {
  return cache.status;
}

/** Summit world Y for camera framing (0 while unloaded). */
export function getTerrainSummitY(): number {
  return cache.data?.summit.y ?? 0;
}

/**
 * Pure: meta + decoded uint16 heightmap → TerrainData (world transform,
 * routes, summit). Exported so the Tint probe (probe/viz5-probe.js) builds
 * the REAL data through the REAL path — no probe drift.
 */
export function buildTerrainData(meta: TerrainMeta, u16: Uint16Array): TerrainData {
  const grid = meta.grid;
  if (u16.length !== grid * grid) {
    throw new Error(`heights.bin size ${u16.length} != ${grid * grid}`);
  }
  const heights = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) heights[i] = u16[i];

  const yScale = (MOUNTAIN_WORLD_SIZE / meta.extentMeters) * MOUNTAIN_VERT_EXAG;
  const frame: TerrainFrame = {
    grid,
    metersPerPixel: meta.metersPerPixel,
    yScale,
    worldSize: MOUNTAIN_WORLD_SIZE,
    baseElev: meta.minElev,
  };
  const routes = generateRoutes(heights, frame);

  // Summit: argmax of the full-res field.
  let sIdx = 0;
  for (let i = 1; i < heights.length; i++) {
    if (heights[i] > heights[sIdx]) sIdx = i;
  }
  const si = sIdx % grid;
  const sj = Math.floor(sIdx / grid);
  const summit = {
    x: (si / (grid - 1) - 0.5) * MOUNTAIN_WORLD_SIZE,
    y: (heights[sIdx] - meta.minElev) * yScale,
    z: (sj / (grid - 1) - 0.5) * MOUNTAIN_WORLD_SIZE,
  };

  return { ...meta, heights, yScale, summit, routes };
}

async function loadTerrain(): Promise<void> {
  try {
    const base = import.meta.env.BASE_URL ?? '/';
    const metaRes = await fetch(`${base}terrain/terrain.json`);
    if (!metaRes.ok) throw new Error(`terrain.json HTTP ${metaRes.status}`);
    const meta = (await metaRes.json()) as TerrainMeta;
    const binRes = await fetch(`${base}terrain/heights.bin`);
    if (!binRes.ok) throw new Error(`heights.bin HTTP ${binRes.status}`);
    const u16 = new Uint16Array(await binRes.arrayBuffer());
    cache.data = buildTerrainData(meta, u16);
    cache.status = 'ready';
  } catch (e) {
    console.warn('[terrain] load failed — falling back to PercentileBands:', e);
    cache.status = 'failed';
  }
  notify();
}

let loadStarted = false;

/** React hook: current terrain state; starts the one-time load on mount. */
export function useTerrain(): TerrainCache {
  const [, force] = useState(0);
  useEffect(() => {
    if (!loadStarted) {
      loadStarted = true;
      void loadTerrain();
    }
    const l = () => force((n) => n + 1);
    cache.listeners.add(l);
    return () => {
      cache.listeners.delete(l);
    };
  }, []);
  return cache;
}
