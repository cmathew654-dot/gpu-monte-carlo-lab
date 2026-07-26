/**
 * PercentileGuides.tsx — p5/p25/p50/p75/p95 smooth threads through the
 * cone (viz2 deliverable 2). These ARE the "cone" an advisor points at.
 *
 * Data: per-snapshot SURVIVOR quantiles from the snapshotStats readback
 * (src/sim/stats/snapStats.ts — same param-change-only readback as the
 * year cursor's cross-section; nothing per frame). Points sit on the
 * z = 0 center plane (the cone's z is symmetric hash jitter around 0), X
 * at each snapshot month, Y through the shared layout transform; a
 * Catmull-Rom spline smooths the ≤32 snapshot points into a thread.
 *
 * Quantile semantics (documented in snapStats.ts): conditional on
 * survival — ruin is told by the ember field + the failure HUD, so the
 * guides keep their shape instead of collapsing onto the floor.
 *
 * viz3 SCENARIO DELTA (the "analysis visibly changes" money feature):
 * every time new quantiles land — 10k live-drag previews AND full runs
 * (SimDriver calls setSnapshotStats for both) — the guides MORPH from
 * their old shape to the new over ~1.2 s ease-out (CPU lerp of 5×97
 * points in useFrame — trivial), while the PREVIOUS shape stays on
 * screen as a dim amber GHOST ribbon that fades out over the same
 * window. During a slider drag the ribbons visibly squirm from preview
 * to preview; on release they settle onto the full-count truth.
 *
 * Plain CPU geometry + LineBasicMaterial: no authored TSL, no shader-graph
 * risk. Median is bright white; p5/p95 cool blue; p25/p75 mid blue.
 * Amber (0xc8792a) is reserved for ghosts — palette discipline §4.4.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Vector3,
} from 'three/webgpu';
import { SNAP_QUANTILE_LEVELS } from '../sim/stats/snapStats';
import { useSimStore } from '../store/simStore';
import { xFromNorm, yFromWealth } from './layout';

const GUIDE_STYLE = [
  { color: 0x3080ff, opacity: 0.34 }, // p5  — cool blue
  { color: 0x7fb2ff, opacity: 0.5 }, //  p25 — mid blue
  { color: 0xf2f7ff, opacity: 0.95 }, // p50 — near-white
  { color: 0x7fb2ff, opacity: 0.5 }, //  p75 — mid blue
  { color: 0x3080ff, opacity: 0.34 }, // p95 — cool blue
] as const;

/** Fixed spline subdivision: 96 segments → 97 vertices per guide. Fixed
 * counts make the old→new lerp a flat Float32Array op. */
const GUIDE_VERTS = 97;
/** Morph + ghost-fade window. */
const MORPH_SECONDS = 1.2;
/** Ghost ribbon: dim amber (reserved for ghosts ONLY), fading to 0. */
const GHOST_COLOR = 0xc8792a;
const GHOST_OPACITY = 0.25;

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const nowSeconds = (): number => performance.now() / 1000;

/** Per-guide morph state: lerp from → to over the window; ghostFrom is
 * the frozen previous shape rendered in amber while it fades. */
interface GuideAnim {
  from: Float32Array | null;
  to: Float32Array | null;
  ghostFrom: Float32Array | null;
}

export function PercentileGuides() {
  const lines = useMemo(
    () =>
      GUIDE_STYLE.map((style) => {
        const geo = new BufferGeometry();
        const attr = new Float32BufferAttribute(GUIDE_VERTS * 3, 3);
        attr.setUsage(DynamicDrawUsage);
        geo.setAttribute('position', attr);
        const line = new Line(
          geo,
          new LineBasicMaterial({
            color: style.color,
            transparent: true,
            opacity: style.opacity,
            blending: AdditiveBlending,
            depthWrite: false,
          }),
        );
        line.frustumCulled = false;
        line.visible = false;
        return line;
      }),
    [],
  );

  const ghosts = useMemo(
    () =>
      GUIDE_STYLE.map(() => {
        const geo = new BufferGeometry();
        const attr = new Float32BufferAttribute(GUIDE_VERTS * 3, 3);
        attr.setUsage(DynamicDrawUsage);
        geo.setAttribute('position', attr);
        const ghost = new Line(
          geo,
          new LineBasicMaterial({
            color: GHOST_COLOR,
            transparent: true,
            opacity: 0,
            blending: AdditiveBlending,
            depthWrite: false,
          }),
        );
        ghost.frustumCulled = false;
        ghost.visible = false;
        return ghost;
      }),
    [],
  );

  const anim = useRef<{
    guides: GuideAnim[];
    start: number;
    settled: boolean;
  }>({
    guides: GUIDE_STYLE.map(() => ({ from: null, to: null, ghostFrom: null })),
    start: 0,
    settled: true,
  });

  // Recompute targets + arm the morph/ghost on every fresh snap readback
  // (preview OR full — SimDriver feeds both) and every $-pivot move.
  useEffect(() => {
    const rebuild = () => {
      const state = useSimStore.getState();
      const snap = state.snapshotStats;
      const logCenter = Math.log10(Math.max(state.params.initialWealth, 1));
      const a = anim.current;
      // THREE.Line objects are scene-graph mutable by design; the React
      // Compiler heuristic can't see that these memoized objects are the
      // imperative three layer (same master pattern as viz2).
      /* eslint-disable react-hooks/immutability */
      a.start = nowSeconds();
      a.settled = false;
      for (let q = 0; q < lines.length; q++) {
        const g = a.guides[q];
        const line = lines[q];
        // Capture the CURRENT rendered shape before anything moves: it is
        // both the morph start and (frozen) the amber ghost.
        const attr = line.geometry.getAttribute(
          'position',
        ) as Float32BufferAttribute;
        const current = line.visible
          ? new Float32Array(attr.array as Float32Array)
          : null;
        g.from = current;
        g.ghostFrom = current;

        // New target from the snap readback (same extraction as viz2).
        let target: Float32Array | null = null;
        if (snap) {
          const pts: Vector3[] = [];
          for (let s = 0; s < snap.snapCount; s++) {
            const w = snap.quantiles[s * SNAP_QUANTILE_LEVELS.length + q];
            if (!(w > 0)) break; // no survivors at this snapshot — end thread
            const xNorm =
              snap.horizonMonths > 0
                ? (s * snap.snapStrideMonths) / snap.horizonMonths
                : 0;
            pts.push(new Vector3(xFromNorm(xNorm), yFromWealth(w, logCenter), 0));
          }
          if (pts.length >= 2) {
            const curve = new CatmullRomCurve3(pts);
            const smooth = curve.getPoints(GUIDE_VERTS - 1); // 97 points
            target = new Float32Array(GUIDE_VERTS * 3);
            for (let i = 0; i < smooth.length; i++) {
              target[i * 3] = smooth[i].x;
              target[i * 3 + 1] = smooth[i].y;
              target[i * 3 + 2] = smooth[i].z;
            }
          }
        }
        g.to = target;

        // Ghost: show the frozen previous shape in amber while it fades.
        const ghost = ghosts[q];
        if (g.ghostFrom) {
          const gAttr = ghost.geometry.getAttribute(
            'position',
          ) as Float32BufferAttribute;
          (gAttr.array as Float32Array).set(g.ghostFrom);
          gAttr.needsUpdate = true;
          ghost.visible = true;
          (ghost.material as LineBasicMaterial).opacity = GHOST_OPACITY;
        } else {
          ghost.visible = false;
        }

        // First appearance has no previous shape to morph FROM — snap
        // straight to the target instead of lerping out of nowhere.
        if (!g.from && g.to) {
          (attr.array as Float32Array).set(g.to);
          attr.needsUpdate = true;
          line.visible = true;
          g.from = g.to; // degenerate lerp = already settled
        } else {
          line.visible = g.to !== null;
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
  }, [lines, ghosts]);

  // Advance the morph + ghost fade. 5×97 lerps while animating — trivial.
  useFrame(() => {
    /* eslint-disable react-hooks/immutability */
    const a = anim.current;
    if (a.settled) return;
    const t = Math.min((nowSeconds() - a.start) / MORPH_SECONDS, 1);
    const e = easeOutCubic(t);
    for (let q = 0; q < lines.length; q++) {
      const g = a.guides[q];
      const line = lines[q];
      if (g.from && g.to && g.from !== g.to) {
        const attr = line.geometry.getAttribute(
          'position',
        ) as Float32BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let i = 0; i < arr.length; i++) {
          arr[i] = g.from[i] + (g.to[i] - g.from[i]) * e;
        }
        attr.needsUpdate = true;
      }
      const ghost = ghosts[q];
      if (ghost.visible) {
        (ghost.material as LineBasicMaterial).opacity = GHOST_OPACITY * (1 - e);
        if (t >= 1) ghost.visible = false;
      }
    }
    if (t >= 1) {
      // Settle exactly on the targets (kills lerp drift at the endpoint).
      for (let q = 0; q < lines.length; q++) {
        const g = a.guides[q];
        if (g.to && g.from !== g.to) {
          const attr = lines[q].geometry.getAttribute(
            'position',
          ) as Float32BufferAttribute;
          (attr.array as Float32Array).set(g.to);
          attr.needsUpdate = true;
        }
        g.from = g.to;
      }
      a.settled = true;
    }
    /* eslint-enable react-hooks/immutability */
  });

  // Dispose the imperative three objects on unmount.
  useEffect(
    () => () => {
      for (const line of [...lines, ...ghosts]) {
        line.geometry.dispose();
        (line.material as LineBasicMaterial).dispose();
      }
    },
    [lines, ghosts],
  );

  return (
    <group>
      {ghosts.map((ghost, i) => (
        <primitive key={`g${i}`} object={ghost} />
      ))}
      {lines.map((line, i) => (
        <primitive key={i} object={line} />
      ))}
    </group>
  );
}
