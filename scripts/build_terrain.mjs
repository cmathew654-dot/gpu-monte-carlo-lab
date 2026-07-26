#!/usr/bin/env node
/**
 * build_terrain.mjs — bake the Mt. Rainier heightmap asset for the viz5
 * client view (the REAL mountain, from public USGS elevation data).
 *
 * Source: Mapzen Terrarium tiles (public, no API key)
 *   https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
 *   data = USGS NED (conus) / SRTM; decode: elevation_m = R*256 + G + B/256 − 32768
 *
 * Pipeline:
 *   1. compute the z=12 slippy tile containing the Rainier summit
 *      (46.8529°N, −121.7604°W, 4392 m),
 *   2. download a 4×4 tile grid centered so the summit sits ≥ 1 tile from
 *      the grid edge (16 tiles, ~140 KB each — NOT committed),
 *   3. merge into a 1024×1024 elevation grid (float meters),
 *   4. VERIFY the merged max elevation is 4392 m ±100 (tile math guard),
 *   5. crop a GRID×GRID window centered on the summit (the massif),
 *   6. quantize to uint16 meters and write:
 *        public/terrain/heights.bin   (GRID×GRID uint16 LE, row-major)
 *        public/terrain/terrain.json  (bounds, grid, min/max, attribution)
 *
 * Zero dependencies: PNG decode uses node:zlib inflate + scanline unfilter
 * (Terrarium tiles are 256×256 8-bit RGB/RGBA, non-interlaced).
 *
 * Reproduce:  node scripts/build_terrain.mjs
 */
import { inflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SUMMIT = { lat: 46.8529, lon: -121.7604, elev: 4392 };
const ZOOM = 12;
const TILES = 4; // 4×4 tile grid
const GRID = 512; // baked heightmap resolution (crop of the 1024×1024 merge)
const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'terrain',
);

// --- slippy tile math -------------------------------------------------------
function lonToTileX(lon, z) {
  return ((lon + 180) / 360) * 2 ** z;
}
function latToTileY(lat, z) {
  const phi = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * 2 ** z;
}
function tileLonSpan(z) {
  return 360 / 2 ** z;
}

// --- minimal PNG decode (8-bit RGB/RGBA, non-interlaced) --------------------
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`unsupported bitDepth ${bitDepth}`);
  if (interlace !== 0) throw new Error('interlaced PNG unsupported');
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  if (channels === 0) throw new Error(`unsupported colorType ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * channels);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = row[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (f !== 0) {
        throw new Error(`bad filter ${f}`);
      }
      cur[x] = v & 0xff;
    }
    prev = cur;
  }
  return { width, height, channels, data: out };
}

function terrariumElev(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

// --- main -------------------------------------------------------------------
async function main() {
  const txf = lonToTileX(SUMMIT.lon, ZOOM);
  const tyf = latToTileY(SUMMIT.lat, ZOOM);
  const tx = Math.floor(txf);
  const ty = Math.floor(tyf);
  console.log(
    `summit tile: x=${tx} y=${ty} (frac ${(txf - tx).toFixed(3)}, ${(tyf - ty).toFixed(3)})`,
  );

  // 4×4 grid with the summit tile at (1,1)-ish so the massif is centered.
  const x0 = tx - 1;
  const y0 = ty - 1;
  const W = TILES * 256;
  const merged = new Float32Array(W * W);

  for (let j = 0; j < TILES; j++) {
    for (let i = 0; i < TILES; i++) {
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${x0 + i}/${y0 + j}.png`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
      const png = decodePng(Buffer.from(await res.arrayBuffer()));
      if (png.width !== 256 || png.height !== 256) {
        throw new Error(`unexpected tile size ${png.width}×${png.height}`);
      }
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const p = (y * 256 + x) * png.channels;
          merged[(j * 256 + y) * W + (i * 256 + x)] = terrariumElev(
            png.data[p],
            png.data[p + 1],
            png.data[p + 2],
          );
        }
      }
      process.stdout.write(`tile ${x0 + i}/${y0 + j} ok  `);
    }
  }
  console.log();

  // Meters per pixel at this latitude (web-mercator ground resolution).
  const metersPerPixel =
    (Math.cos((SUMMIT.lat * Math.PI) / 180) * 40075016.686) / (2 ** ZOOM * 256);

  // Global max (verification) + summit pixel in the merged grid.
  let maxElev = -Infinity;
  for (const e of merged) if (e > maxElev) maxElev = e;
  console.log(
    `merged max elevation: ${maxElev.toFixed(1)} m (expect ${SUMMIT.elev} ±100)`,
  );
  if (Math.abs(maxElev - SUMMIT.elev) > 100) {
    throw new Error('summit not in grid — tile math is off');
  }

  const sx = Math.round((txf - x0) * 256);
  const sy = Math.round((tyf - y0) * 256);
  const half = GRID / 2;
  const cx = sx - half;
  const cy = sy - half;
  if (cx < 0 || cy < 0 || cx + GRID > W || cy + GRID > W) {
    throw new Error('crop window out of grid');
  }

  const heights = new Uint16Array(GRID * GRID);
  let minElev = Infinity;
  let cropMax = -Infinity;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const e = merged[(cy + j) * W + (cx + i)];
      const q = Math.max(0, Math.min(65535, Math.round(e)));
      heights[j * GRID + i] = q;
      if (q < minElev) minElev = q;
      if (q > cropMax) cropMax = q;
    }
  }
  console.log(
    `crop ${GRID}×${GRID} @ (${cx},${cy}): min ${minElev} m, max ${cropMax} m, ` +
      `${((metersPerPixel * GRID) / 1000).toFixed(1)} km across (${metersPerPixel.toFixed(1)} m/px)`,
  );

  const lon0 = -180 + (x0 + cx / 256) * tileLonSpan(ZOOM);
  const lon1 = -180 + (x0 + (cx + GRID) / 256) * tileLonSpan(ZOOM);
  const latOf = (tyPixels) => {
    const n = Math.PI * (1 - (2 * (y0 + tyPixels / 256)) / 2 ** ZOOM);
    return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
  };
  const meta = {
    name: 'Mount Rainier',
    grid: GRID,
    minElev,
    maxElev: cropMax,
    summit: { lat: SUMMIT.lat, lon: SUMMIT.lon, elev: SUMMIT.elev },
    metersPerPixel: Number(metersPerPixel.toFixed(3)),
    extentMeters: Number((metersPerPixel * GRID).toFixed(1)),
    bounds: {
      west: Number(lon0.toFixed(5)),
      east: Number(lon1.toFixed(5)),
      north: Number(latOf(cy).toFixed(5)),
      south: Number(latOf(cy + GRID).toFixed(5)),
    },
    encoding: 'uint16 little-endian, row-major (north first), meters',
    source: {
      tiles: `terrarium z${ZOOM} x[${x0}..${x0 + TILES - 1}] y[${y0}..${y0 + TILES - 1}]`,
      url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
      attribution: 'Elevation: USGS NED / SRTM via Mapzen Terrarium',
    },
    bake: 'node scripts/build_terrain.mjs',
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'heights.bin'), Buffer.from(heights.buffer));
  writeFileSync(join(OUT_DIR, 'terrain.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log(
    `wrote ${join(OUT_DIR, 'heights.bin')} (${(heights.byteLength / 1024).toFixed(0)} KB) + terrain.json`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
