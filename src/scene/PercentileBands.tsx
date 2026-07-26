/**
 * PercentileBands.tsx — the CLIENT-view centerpiece (viz4 deliverable 2):
 * a calm river of light. Four solid ribbon SURFACES built from the
 * existing per-snapshot SURVIVOR quantiles (src/sim/stats/snapStats.ts —
 * the same param-change-only readback the advisor percentile guides use;
 * nothing per frame, no second sim):
 *
 *   band 0: p5–p25   outer, faint  (#3080ff → #7fb2ff, α .16)
 *   band 1: p25–p50  inner, luminous (#7fb2ff → #f2f7ff, α .32)
 *   band 2: p50–p75  inner, luminous (#f2f7ff → #7fb2ff, α .32)
 *   band 3: p75–p95  outer, faint  (#7fb2ff → #3080ff, α .16)
 *
 * The two inner bands share a hot median edge, so the p50 path reads as a
 * luminous ridge down the middle of the river without any extra geometry.
 * Surfaces, not particles: additive triangle strips can stack at most a
 * few layers deep, so the client view cannot white-out into the v3 blob.
 * NO texture, NO grid — smooth is the point.
 *
 * Geometry: each band is a fixed 32-point triangle strip (SNAP_MAX ≤ 32
 * snapshots × 2 edge verts = 64 verts, static index buffer, static
 * vertex-color gradient) in the SAME world transform as the cone
 * (./layout.ts — X = time, Y = log-wealth around the initial pivot, the
 * z = 0 center plane). Points past the last live snapshot hold the final
 * position, so the tail collapses to zero area instead of smearing.
 *
 * Morph (reuses the v3 PercentileGuides recipe): on every fresh snap
 * readback — 10k live-drag previews AND full runs — the five boundary
 * series lerp from their old shape to the new over ~1.2 s ease-out while
 * the PREVIOUS shape stays on screen as a dim amber ghost that fades over
 * the same window (amber 0xc8792a is reserved for ghosts, palette
 * discipline §4.4). Per morph frame: 5×32 lerps + 4×64 vertex writes —
 * trivial CPU geometry updates.
 *
 * Plain CPU geometry + MeshBasicMaterial: no authored TSL, no custom
 * shader graph (the Tint probe still compiles one band material to prove
 * the vertex-colors pipeline — probe/viz2-probe.js).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
} from 'three/webgpu';
import { SNAP_MAX } from '../sim/model/history';
import { SNAP_QUANTILE_LEVELS } from '../sim/stats/snapStats';
import { useSimStore, type SnapshotStats } from '../store/simStore';
import { xFromNorm, yFromWealth } from './layout';

/** Fixed points per boundary series — flat Float32Array lerp, same trick
 * as the guides' fixed 97-vert splines. */
const PTS = SNAP_MAX; // 32
const SERIES = 5;

/** Outer bands whisper (spec: #3080ff at ~0.10–0.18 α); the inner pair
 * carries the light. Vertex colors gradient toward the median edge. */
const BAND_STYLE = [
  { lo: 0x3080ff, hi: 0x7fb2ff, opacity: 0.16 }, // p5–p25
  { lo: 0x7fb2ff, hi: 0xf2f7ff, opacity: 0.32 }, // p25–p50
  { lo: 0xf2f7ff, hi: 0x7fb2ff, opacity: 0.32 }, // p50–p75
  { lo: 0x7fb2ff, hi: 0x3080ff, opacity: 0.16 }, // p75–p95
] as const;

/** Morph + ghost-fade window (matches the v3 guides). */
const MORPH_SECONDS = 1.2;
/** Ghost surface: dim amber (ghosts ONLY), fading to 0. */
const GHOST_COLOR = 0xc8792a;
const GHOST_OPACITY = 0.12;

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const nowSeconds = (): number => performance.now() / 1000;

/** Per-series morph state (same shape as the guides' GuideAnim). */
interface SeriesAnim {
  from: Float32Array | null;
  to: Float32Array | null;
  ghostFrom: Float32Array | null;
}

/**
 * Extract the five boundary series (PTS × xyz) from a snap readback.
 * Points at/past the first no-survivor snapshot (or beyond snapCount)
 * repeat the last live position, collapsing the tail to zero area.
 * Returns null per series only when NOTHING is alive (practically never —
 * snapshot 0 always has survivors) — callers hide the bands.
 */
function seriesTargets(
  snap: SnapshotStats | null,
  logCenter: number,
): (Float32Array | null)[] {
  const out: (Float32Array | null)[] = [];
  for (let q = 0; q < SERIES; q++) {
    if (!snap) {
      out.push(null);
      continue;
    }
    const arr = new Float32Array(PTS * 3);
    let lastX: number | null = null;
    let lastY = 0;
    for (let s = 0; s < PTS; s++) {
      if (s < snap.snapCount) {
        const w = snap.quantiles[s * SNAP_QUANTILE_LEVELS.length + q];
        if (w > 0) {
          const xNorm =
            snap.horizonMonths > 0
              ? Math.min(1, (s * snap.snapStrideMonths) / snap.horizonMonths)
              : 0;
          lastX = xFromNorm(xNorm);
          lastY = yFromWealth(w, logCenter);
        }
      }
      // Before the first live snapshot there is none only when the series
      // is entirely dead — pinned to the pivot (invisible in practice).
      arr[s * 3] = lastX ?? xFromNorm(0);
      arr[s * 3 + 1] = lastY;
      arr[s * 3 + 2] = 0;
    }
    out.push(lastX === null ? null : arr);
  }
  return out;
}

/** Write one band strip from its lower/upper boundary series. */
function writeBand(attr: Float32BufferAttribute, lo: Float32Array, hi: Float32Array): void {
  const arr = attr.array as Float32Array;
  for (let i = 0; i < PTS; i++) {
    arr[i * 6] = lo[i * 3];
    arr[i * 6 + 1] = lo[i * 3 + 1];
    arr[i * 6 + 2] = lo[i * 3 + 2];
    arr[i * 6 + 3] = hi[i * 3];
    arr[i * 6 + 4] = hi[i * 3 + 1];
    arr[i * 6 + 5] = hi[i * 3 + 2];
  }
  attr.needsUpdate = true;
}

/** Band strip geometry: static index + static median-gradient colors,
 * dynamic positions (2 verts per point: lower edge, upper edge). */
function makeBandGeometry(lo: number, hi: number): BufferGeometry {
  const geo = new BufferGeometry();
  const pos = new Float32BufferAttribute(PTS * 2 * 3, 3);
  pos.setUsage(DynamicDrawUsage);
  geo.setAttribute('position', pos);
  const cLo = new Color(lo);
  const cHi = new Color(hi);
  const colors = new Float32Array(PTS * 2 * 3);
  for (let i = 0; i < PTS; i++) {
    colors[i * 6] = cLo.r;
    colors[i * 6 + 1] = cLo.g;
    colors[i * 6 + 2] = cLo.b;
    colors[i * 6 + 3] = cHi.r;
    colors[i * 6 + 4] = cHi.g;
    colors[i * 6 + 5] = cHi.b;
  }
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const idx: number[] = [];
  for (let i = 0; i < PTS - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setIndex(idx);
  return geo;
}

export function PercentileBands() {
  const bands = useMemo(
    () =>
      BAND_STYLE.map((style) => {
        const mesh = new Mesh(
          makeBandGeometry(style.lo, style.hi),
          new MeshBasicMaterial({
            transparent: true,
            opacity: style.opacity,
            blending: AdditiveBlending,
            depthWrite: false,
            side: DoubleSide,
            vertexColors: true,
          }),
        );
        mesh.frustumCulled = false;
        mesh.visible = false;
        return mesh;
      }),
    [],
  );

  const ghosts = useMemo(
    () =>
      BAND_STYLE.map((style) => {
        const mesh = new Mesh(
          makeBandGeometry(style.lo, style.hi),
          new MeshBasicMaterial({
            color: GHOST_COLOR,
            transparent: true,
            opacity: 0,
            blending: AdditiveBlending,
            depthWrite: false,
            side: DoubleSide,
          }),
        );
        mesh.frustumCulled = false;
        mesh.visible = false;
        return mesh;
      }),
    [],
  );

  const anim = useRef<{
    series: SeriesAnim[];
    /** The currently RENDERED shape of each boundary series. */
    cur: (Float32Array | null)[];
    start: number;
    settled: boolean;
  }>({
    series: Array.from({ length: SERIES }, () => ({
      from: null,
      to: null,
      ghostFrom: null,
    })),
    cur: Array.from({ length: SERIES }, () => null),
    start: 0,
    settled: true,
  });

  // Recompute targets + arm the morph/ghost on every fresh snap readback
  // (preview OR full) and every $-pivot move — same triggers as the guides.
  useEffect(() => {
    const rebuild = () => {
      const state = useSimStore.getState();
      const logCenter = Math.log10(Math.max(state.params.initialWealth, 1));
      const targets = seriesTargets(state.snapshotStats, logCenter);
      const a = anim.current;
      // THREE meshes are scene-graph mutable by design; the React Compiler
      // heuristic can't see that these memoized objects are the imperative
      // three layer (same master pattern as PercentileGuides).
      /* eslint-disable react-hooks/immutability */
      a.start = nowSeconds();
      a.settled = false;
      for (let q = 0; q < SERIES; q++) {
        const s = a.series[q];
        // Capture the CURRENT rendered shape: it is both the morph start
        // and (frozen) the amber ghost.
        const rendered = a.cur[q];
        s.from = rendered ? new Float32Array(rendered) : null;
        s.ghostFrom = s.from;
        s.to = targets[q];
      }
      // Ghost bands: freeze the previous shape in amber while it fades.
      for (let b = 0; b < ghosts.length; b++) {
        const ghost = ghosts[b];
        const lo = a.series[b].ghostFrom;
        const hi = a.series[b + 1].ghostFrom;
        if (lo && hi) {
          writeBand(
            ghost.geometry.getAttribute('position') as Float32BufferAttribute,
            lo,
            hi,
          );
          ghost.visible = true;
          (ghost.material as MeshBasicMaterial).opacity = GHOST_OPACITY;
        } else {
          ghost.visible = false;
        }
      }
      for (let b = 0; b < bands.length; b++) {
        const lo = a.series[b];
        const hi = a.series[b + 1];
        if (!lo.from || !hi.from) {
          // First appearance: snap straight to the target instead of
          // lerping out of nowhere (same rule as the guides).
          if (lo.to && hi.to) {
            a.cur[b] = lo.to;
            a.cur[b + 1] = hi.to;
            writeBand(
              bands[b].geometry.getAttribute(
                'position',
              ) as Float32BufferAttribute,
              lo.to,
              hi.to,
            );
            bands[b].visible = true;
            lo.from = lo.to;
            hi.from = hi.to;
          } else {
            bands[b].visible = false;
          }
        } else {
          bands[b].visible = lo.to !== null && hi.to !== null;
        }
      }
      /* eslint-enable react-hooks/immutability */
    };
    rebuild();
    return useSimStore.subscribe((state, prev) => {
      if (
        state.snapshotStats !== prev.snapshotStats ||
        state.params !== prev.params
      ) {
        rebuild();
      }
    });
  }, [bands, ghosts]);

  // Advance the morph + ghost fade: 5×32 lerps + 4 strip rewrites while
  // animating — trivial.
  useFrame(() => {
    /* eslint-disable react-hooks/immutability */
    const a = anim.current;
    if (a.settled) return;
    const t = Math.min((nowSeconds() - a.start) / MORPH_SECONDS, 1);
    const e = easeOutCubic(t);
    for (let q = 0; q < SERIES; q++) {
      const s = a.series[q];
      if (!s.from || !s.to) continue;
      let cur = a.cur[q];
      if (cur === null || cur.length !== s.to.length) {
        cur = new Float32Array(s.to.length);
        a.cur[q] = cur;
      }
      for (let i = 0; i < cur.length; i++) {
        cur[i] = s.from[i] + (s.to[i] - s.from[i]) * e;
      }
    }
    for (let b = 0; b < bands.length; b++) {
      const lo = a.cur[b];
      const hi = a.cur[b + 1];
      if (bands[b].visible && lo && hi) {
        writeBand(
          bands[b].geometry.getAttribute('position') as Float32BufferAttribute,
          lo,
          hi,
        );
      }
    }
    for (const ghost of ghosts) {
      if (ghost.visible) {
        (ghost.material as MeshBasicMaterial).opacity = GHOST_OPACITY * (1 - e);
        if (t >= 1) ghost.visible = false;
      }
    }
    if (t >= 1) {
      // Settle exactly on the targets (kills lerp drift at the endpoint).
      for (let q = 0; q < SERIES; q++) {
        const s = a.series[q];
        if (s.to) {
          a.cur[q] = s.to;
          s.from = s.to;
        }
      }
      for (let b = 0; b < bands.length; b++) {
        const lo = a.cur[b];
        const hi = a.cur[b + 1];
        if (bands[b].visible && lo && hi) {
          writeBand(
            bands[b].geometry.getAttribute(
              'position',
            ) as Float32BufferAttribute,
            lo,
            hi,
          );
        }
      }
      a.settled = true;
    }
    /* eslint-enable react-hooks/immutability */
  });

  // Dispose the imperative three objects on unmount.
  useEffect(
    () => () => {
      for (const mesh of [...bands, ...ghosts]) {
        mesh.geometry.dispose();
        (mesh.material as MeshBasicMaterial).dispose();
      }
    },
    [bands, ghosts],
  );

  return (
    <group>
      {ghosts.map((ghost, i) => (
        <primitive key={`g${i}`} object={ghost} />
      ))}
      {bands.map((band, i) => (
        <primitive key={i} object={band} />
      ))}
    </group>
  );
}
