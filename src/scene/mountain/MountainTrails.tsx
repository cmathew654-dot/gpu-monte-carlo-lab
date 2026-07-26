/**
 * MountainTrails.tsx — 100k simulated retirements climbing the mountain.
 * ONE THREE.LineSegments pool; every vertex position is computed GPU→GPU
 * from the frozen sim buffers + the baked route buffers (see
 * mountainTrailNodes.ts for the math). Budget discipline mirrors
 * TrajectoryLines exactly: same sprite plan, same adapter maxBufferSize cap
 * (the v2.1 incident), whole-thread sparsification when over budget.
 *
 * Side effects owned here (param-change / readback-driven, never per frame):
 *   - route buffers upload (once per terrain load)
 *   - medianLog buffer: log10(p50 survivor wealth) per snap, from the
 *     existing snapshotStats readback (param-change-only, contract-safe)
 */
import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
} from 'three/webgpu';
import { PREVIEW_PATH_COUNT, useSimStore } from '../../store/simStore';
import { getStorageAttribute } from '../../sim/buffers';
import { SNAP_QUANTILE_LEVELS } from '../../sim/stats/snapStats';
import {
  alphaScaleForCount,
  lineStrideForBudget,
  maxLineVerts,
  MOUNTAIN_LINE_DENSITY,
  planSprites,
} from '../spritePlan';
import { buildMountainTrailNodes } from './mountainTrailNodes';
import {
  medianLog,
  routeNrm,
  routePos,
  uRouteCount,
} from './mountainBuffers';
import { SNAP_MAX } from '../../sim/model/history';
import { ROUTE_POINTS } from './routes';
import type { TerrainData } from './terrain';

/** viz3 hero uniform sentinel: matches the uHeroPath default (uint max). */
const HERO_NONE = 0xffffffff;
/** Index of p50 in SNAP_QUANTILE_LEVELS ([0.05, 0.25, 0.5, 0.75, 0.95]). */
const P50_INDEX = SNAP_QUANTILE_LEVELS.indexOf(0.5);

export function MountainTrails({ data }: { data: TerrainData }) {
  const [vertexCount, setVertexCount] = useState(0);
  const gl = useThree((s) => s.gl);

  // Node identities created exactly once (§3.4).
  const nodes = useMemo(() => buildMountainTrailNodes(), []);

  // Upload the baked routes into the TSL storage buffers (once per terrain).
  useEffect(() => {
    const posAttr = getStorageAttribute(routePos);
    (posAttr.array as Float32Array).set(data.routes.points);
    posAttr.needsUpdate = true;
    const nrmAttr = getStorageAttribute(routeNrm);
    (nrmAttr.array as Float32Array).set(data.routes.normals);
    nrmAttr.needsUpdate = true;
    uRouteCount.value = data.routes.count;

    // v5.3: pick the CENTRAL route for the highlighted hero thread. The
    // camera's home azimuth is 0 (it sways around the +Z axis — see
    // CameraRig), so "straight up the middle" = the route whose base camp
    // points most directly at +Z from the mountain center.
    let heroRoute = 0;
    let bestAlign = -Infinity;
    for (let r = 0; r < data.routes.count; r++) {
      const o = r * ROUTE_POINTS * 3; // route start (base camp)
      const x = data.routes.points[o];
      const z = data.routes.points[o + 2];
      const align = z / Math.max(1e-6, Math.hypot(x, z));
      if (align > bestAlign) {
        bestAlign = align;
        heroRoute = r;
      }
    }
    // three uniform nodes are designed for mutation (see ConeParticles).
    // eslint-disable-next-line react-hooks/immutability
    nodes.uniforms.uHeroRoute.value = heroRoute;
  }, [data, nodes]);

  // Adapter-aware vertex budget (device exists — CanvasRoot awaited init()).
  const maxVerts = useMemo(() => {
    const device = (
      gl as unknown as {
        backend?: { device?: { limits?: { maxBufferSize?: number } } };
      }
    ).backend?.device;
    return maxLineVerts(device?.limits?.maxBufferSize);
  }, [gl]);

  // Sync plan uniforms + vertex count + median wealth reference with the
  // store (same rule as TrajectoryLines: previewMode plans for the 10k
  // preview sim).
  useEffect(() => {
    const sync = (state: ReturnType<typeof useSimStore.getState>) => {
      const p = state.params;
      const plan = planSprites(
        state.previewMode ? PREVIEW_PATH_COUNT : p.pathCount,
        p.horizonYears,
      );
      const segsPerPath = Math.max(0, plan.perPath - 1);
      // v5.3: thin the braid — "it doesn't need every single strand".
      const lineStride =
        lineStrideForBudget(plan, maxVerts) * MOUNTAIN_LINE_DENSITY;
      const linePaths = Math.floor(plan.paths / lineStride);
      // three uniform nodes are designed for mutation (see ConeParticles).
      // eslint-disable-next-line react-hooks/immutability
      nodes.uniforms.uHorizonSteps.value = p.horizonYears * 12;
      nodes.uniforms.uSpritesPerPath.value = plan.perPath;
      nodes.uniforms.uSnapDecimate.value = plan.decimate;
      nodes.uniforms.uPathSubset.value = plan.subset * lineStride;
      nodes.uniforms.uSnapsTotal.value = plan.snapsTotal;
      nodes.uniforms.uAlphaScale.value = alphaScaleForCount(
        linePaths * plan.perPath,
      );
      nodes.uniforms.uHeroPath.value =
        state.heroPathIndex >= 0 ? state.heroPathIndex : HERO_NONE;

      // Median wealth per snap (p50 survivor quantile → log10) — the
      // wealth-offset reference. Before the first readback the reference is
      // the initial wealth at every snap (trails sit at zero offset).
      const medAttr = getStorageAttribute(medianLog);
      const med = medAttr.array as Float32Array;
      const fallback = Math.log10(Math.max(p.initialWealth, 1));
      for (let s = 0; s < SNAP_MAX; s++) {
        const snap = state.snapshotStats;
        med[s] =
          snap && s < snap.snapCount
            ? Math.log10(
                Math.max(
                  snap.quantiles[s * SNAP_QUANTILE_LEVELS.length + P50_INDEX],
                  1,
                ),
              )
            : fallback;
      }
      medAttr.needsUpdate = true;

      setVertexCount(linePaths * segsPerPath * 2);
    };
    sync(useSimStore.getState());
    return useSimStore.subscribe(sync);
  }, [nodes, maxVerts]);

  const geometry = useMemo(() => {
    if (vertexCount <= 0) return null;
    const geo = new BufferGeometry();
    // Count carrier only — positionNode replaces position GPU-side.
    geo.setAttribute(
      'position',
      new Float32BufferAttribute(new Float32Array(vertexCount * 3), 3),
    );
    return geo;
  }, [vertexCount]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;
  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicNodeMaterial
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        fog={false}
        positionNode={nodes.positionNode}
        colorNode={nodes.colorNode}
      />
    </lineSegments>
  );
}
