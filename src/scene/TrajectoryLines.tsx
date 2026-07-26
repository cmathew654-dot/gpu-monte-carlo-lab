/**
 * TrajectoryLines.tsx — faint additive threads connecting each rendered
 * path's snapshot points (viz2 deliverable 3). Dots + threads together.
 *
 * ONE THREE.LineSegments pool; every vertex position is computed GPU→GPU
 * from the frozen sim buffers with the SAME math as ConeParticles (its
 * header is the ground truth for the layout/failure semantics). Per vertex:
 *
 *   v          = vertexIndex
 *   segment    = v / 2          endpoint = v % 2 (0 = tail, 1 = head)
 *   pathSlot   = segment / (perPath−1)
 *   slot       = segment % (perPath−1) + endpoint
 *
 * DEATH-STEP SEMANTICS (mirrors the sprite ember rule): for a failed path,
 * slots past the death slot are CLAMPED to the death slot itself, so the
 * segment from the last live point drops to the ember floor at the exact
 * death month and every later segment collapses INTO the ember (zero
 * length → zero fragments). No vertex is ever repositioned across the
 * scene, so a culled thread can never smear a wrong line.
 *
 * BUDGET (viz2 rule: ≤ ~2× sprite budget total): the plan is ConeParticles'
 * OWN planSprites() — segments/path = sprites/path − 1, same path subset —
 * so line vertices ≈ 2× the sprite instance count at most, and the same
 * adaptive decimation/subsampling keeps the sum inside the 2M-sprite
 * envelope. The dummy position attribute only carries the vertex COUNT
 * (positionNode replaces it GPU-side) and is CAPPED by the adapter's
 * maxBufferSize (see LINE_VERT_BUDGET_BYTES in ./spritePlan.ts — v2.1 fix:
 * uncapped 36–45 MB uploads exceeded mappedAtCreation limits on
 * SwiftShader-backed browsers and black-holed the canvas); line threads
 * sparsify path-wise to fit, sprites/stats never degrade.
 *
 * Reveal + year cursor: threads read the SHARED uReveal/uCursorX uniforms
 * (./playhead.ts; ConeParticles/YearCursor are the single writers) so dots
 * and threads sweep and dim in lockstep.
 *
 * three r185 ConditionalNode pitfall (the v1 black screen): the uint
 * select() results (sEff, deathSlot, clamped slot) are consumed in UINT
 * contexts ONLY; separate float twins (slotF→sEffF) feed the time axis.
 * Never mix.
 */import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
} from 'three/webgpu';
import { PREVIEW_PATH_COUNT, useSimStore } from '../store/simStore';
import {
  alphaScaleForCount,
  lineStrideForBudget,
  maxLineVerts,
  planSprites,
} from './spritePlan';
import { buildTrajectoryNodes } from './trajNodes';

/** viz3 hero uniform sentinel: matches the uHeroPath default (uint max). */
const HERO_NONE = 0xffffffff;

// Dummy-position budget: the count-carrier position array uploads with
// `mappedAtCreation: true`, so its size must fit the ADAPTER's
// maxBufferSize — SwiftShader-backed browsers (GPU-blocklist laptops) can
// cap that as low as ~32 MB, and the uncapped 36–45 MB array threw
// `RangeError: createBuffer … too large … mappedAtCreation == true` →
// uncaught in the frame loop → black canvas (the v2.1 "all black" report).
// Budget helpers live in ./spritePlan.ts (shared with the hero picker:
// the hero must be a path the THREADS render).

export function TrajectoryLines() {
  const [vertexCount, setVertexCount] = useState(0);
  const gl = useThree((s) => s.gl);

  // Node identities created exactly once (§3.4).
  const nodes = useMemo(() => buildTrajectoryNodes(), []);

  // Adapter-aware vertex budget (device exists — CanvasRoot awaited init()).
  // @types/three@0.185 doesn't expose the backend device; cast narrowly.
  const maxVerts = useMemo(() => {
    const device = (
      gl as unknown as {
        backend?: { device?: { limits?: { maxBufferSize?: number } } };
      }
    ).backend?.device;
    return maxLineVerts(device?.limits?.maxBufferSize);
  }, [gl]);

  // Sync plan uniforms + vertex count with the store (same rule as
  // ConeParticles: previewMode plans for the 10k preview sim).
  useEffect(() => {
    const sync = (state: ReturnType<typeof useSimStore.getState>) => {
      const p = state.params;
      const plan = planSprites(
        state.previewMode ? PREVIEW_PATH_COUNT : p.pathCount,
        p.horizonYears,
      );
      // Budget guard: if the full plan's line pool exceeds maxVerts, drop
      // whole line THREADS (multiply the path subset stride) — sprites and
      // stats are untouched; worst case lines render a sparser subset.
      const segsPerPath = Math.max(0, plan.perPath - 1);
      const lineStride = lineStrideForBudget(plan, maxVerts);
      const linePaths = Math.floor(plan.paths / lineStride);
      // three uniform nodes are designed for mutation (see ConeParticles).
      // eslint-disable-next-line react-hooks/immutability
      nodes.uniforms.uHorizonSteps.value = p.horizonYears * 12;

      nodes.uniforms.uLogCenter.value = Math.log10(Math.max(p.initialWealth, 1));

      nodes.uniforms.uSpritesPerPath.value = plan.perPath;

      nodes.uniforms.uSnapDecimate.value = plan.decimate;

      nodes.uniforms.uPathSubset.value = plan.subset * lineStride;

      nodes.uniforms.uSnapsTotal.value = plan.snapsTotal;
      // viz3: alpha normalization on the sprite-EQUIVALENT count of the
      // rendered line subset (matches the sprites 1:1 when lineStride = 1;
      // brightens when the buffer cap sparsifies threads); hero pick.
      nodes.uniforms.uAlphaScale.value = alphaScaleForCount(
        linePaths * plan.perPath,
      );
      nodes.uniforms.uHeroPath.value =
        state.heroPathIndex >= 0 ? state.heroPathIndex : HERO_NONE;
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
        positionNode={nodes.positionNode}
        colorNode={nodes.colorNode}
      />
    </lineSegments>
  );
}

