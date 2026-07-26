/**
 * ConeParticles.tsx — luminous 3D cone of TRUE trajectories (spec §4.4,
 * contract AMENDMENT A1 / docs/CONTRACTS.md §9).
 * SINGLE OWNER: Agent 4.
 *
 * ---------------------------------------------------------------------------
 * RENDERING APPROACH (v2 — true trajectories from pathHistory)
 * ---------------------------------------------------------------------------
 * Amendment A1 (orchestrator-authorized, Agent 2B) added the decimated
 * trajectory buffer this component originally flagged as missing. Each
 * sprite is now one (path i, snapshot s) point on a REAL simulated
 * trajectory — every rendered quantity is kernel output, read GPU→GPU via
 * `.element(...)`; zero CPU arrays, zero recompute:
 *
 *   X = time     month(s) = s · uSnapStride (snapshot s; yearly at stride 12)
 *   Y = wealth   log10(pathHistory[i·SNAP_MAX + s]) around the initial pivot
 *   Z = jitter   deterministic PER-PATH hash-disc offset (constant along the
 *                trajectory, so each path renders as a coherent thread and
 *                the threads fan into a cone VOLUME, not a flat sheet)
 *
 * The terminal point is read from pathWealth when the snapshot grid doesn't
 * land exactly on the horizon (contract §9 — with A2's horizon-adaptive
 * stride this is the >31y case whenever steps % stride ≠ 0). Failed paths read 0
 * from their failure slot onward (zero-filled absorbing state): the sprite
 * AT the failure slot becomes an exact-death-step ember (X from pathFailed,
 * which is NOT snapshot-quantized), slots after it are culled — so a dying
 * path's thread visibly drops to the ember floor at its true death month.
 *
 * SPRITE BUDGET (hard ceiling ≈ 2M sprites; degrade sprites, NEVER the
 * simulated path count — stats always run the full count):
 *   policy = full trajectories for all paths → then snapshot decimation
 *   (≥ MIN_TRAJ_POINTS points/thread) → then deterministic path subsample
 *   (FULL trajectories of an evenly-strided subset — lead directive):
 *
 *   pathCount   horizon   snaps   plan                              sprites
 *   10k         30y       31      all paths, every snapshot           310k
 *   10k         40y       31      all paths, every snapshot           310k
 *   100k        30y       31      all paths, every 2nd snapshot       1.60M
 *   100k        40y       31      all paths, every 2nd snapshot       1.60M
 *   1M          30y       31      every 16th path (62.5k), FULL traj  1.94M
 *   1M          40y       31      every 16th path (62.5k), FULL traj  1.94M
 *   (10y horizons are cheaper everywhere: 110k / 1.10M / 1.83M. A2: the
 *   40y rows use stride 16 → 31 snapshots, grid landing on the horizon.)
 *
 *   HONESTY NOTE (1M case): the cone is then a density-faithful SAMPLE of
 *   the simulated distribution — an evenly-strided subset of paths, each
 *   with its complete trajectory. Path subsampling is VISUAL ONLY; the
 *   simulation and all statistics always use the full 1M paths.
 *   uSpriteStride remains the weak-GPU escape hatch (drops whole
 *   trajectories, never path count in the sim).
 *
 * REVEAL (spec §4.4): uReveal 0→1 over ~4 s after each re-sim; each sprite
 * appears when the wave passes its snapshot month (xNorm·0.96 + per-path
 * hash·0.04 shimmer) — paths genuinely sweep left→right along their
 * trajectories, embers ignite at their exact death step. Failure recoloring
 * is independent of uReveal → correct mid-reveal. Purely visual.
 *
 * DELETED: the v1 terminal-state fan (approach a′, commit bbba534) — it was
 * the honest workaround for the missing history buffer and is fully
 * superseded by A1. Kept in git history, not as a runtime fallback: the A1
 * buffers are now a hard contract (§9), so a fallback would be dead code.
 *
 * Ground-truth patterns (three@0.185.1, docs/TSL_AUDIT.md):
 *  - examples/webgpu_compute_particles.html (tag r185): `<sprite count>`
 *    instanced Sprite + SpriteNodeMaterial with positionNode (billboard
 *    CENTER — SpriteNodeMaterial.setupPositionView appends the corner
 *    expansion itself), scaleNode (per-instance size; 0 = culled), colorNode;
 *    storage reads via `.element(...)` in the material.
 *  - §3.6 additive transparent spriteNodeMaterial with depthWrite=false.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending } from 'three/webgpu';
import { useSimStore, PREVIEW_PATH_COUNT } from '../store/simStore';
import { buildConeNodes } from './coneNodes';
import { alphaScaleForCount, planSprites, type SpritePlan } from './spritePlan';

/** viz3 hero uniform sentinel: matches the uHeroPath default (uint max). */
const HERO_NONE = 0xffffffff;

/** Reveal sweep duration (spec §4.4: ~4 s). */
const REVEAL_SECONDS = 4.0;

export function ConeParticles() {
  const [plan, setPlan] = useState<SpritePlan>(() =>
    planSprites(
      useSimStore.getState().params.pathCount,
      useSimStore.getState().params.horizonYears,
    ),
  );

  // Visual uniforms — stable identities across renders (§3.4: organize all
  // nodes/uniforms in one useMemo; never recreate nodes per render).
  const nodes = useMemo(() => buildConeNodes(), []);

  // Track the restart time of the current reveal sweep (clock seconds).
  const revealStart = useRef<number | null>(null);

  // Restart the sweep after each re-sim: params identity changes when the
  // sim driver is re-run; stats.computedAt changes when Agent 3's readback
  // lands (the honest "re-sim completed" signal). Both merely restart the
  // same 4 s wave; a double restart within the feather window is invisible.
  useEffect(
    () =>
      useSimStore.subscribe((state, prev) => {
        if (
          state.params !== prev.params ||
          state.stats?.computedAt !== prev.stats?.computedAt
        ) {
          revealStart.current = null;
        }
      }),
    [],
  );

  // Push store params into the visual plan + uniforms (snapshot plan,
  // horizon, log pivot). Sim uniforms themselves stay owned by the driver.
  // viz2: while a live-drag preview is resident on the GPU (previewMode),
  // the plan must follow the PREVIEW's 10k paths, not params.pathCount —
  // SimDriver flips previewMode exactly when the displayed sim changes
  // class, so the plan always matches the GPU-resident run.
  useEffect(() => {
    const sync = (state: ReturnType<typeof useSimStore.getState>) => {
      const p = state.params;
      const next = planSprites(
        state.previewMode ? PREVIEW_PATH_COUNT : p.pathCount,
        p.horizonYears,
      );
      // three uniforms are DESIGNED for per-event mutation (the whole
      // point of uniform nodes); the React Compiler immutability heuristic
      // can't see through the imported factory. Same master pattern.
      // eslint-disable-next-line react-hooks/immutability
      nodes.uniforms.uHorizonSteps.value = p.horizonYears * 12;
       
      nodes.uniforms.uLogCenter.value = Math.log10(
        Math.max(p.initialWealth, 1),
      );
       
      nodes.uniforms.uSpritesPerPath.value = next.perPath;
       
      nodes.uniforms.uSnapDecimate.value = next.decimate;
       
      nodes.uniforms.uPathSubset.value = next.subset;
       
      nodes.uniforms.uSnapsTotal.value = next.snapsTotal;
       
      nodes.uniforms.uActiveSprites.value = next.total;
      // viz3: alpha normalization follows the rendered sprite count; hero
      // follows the driver's readback pick (-1 → HERO_NONE sentinel).
      nodes.uniforms.uAlphaScale.value = alphaScaleForCount(next.total);
      nodes.uniforms.uHeroPath.value =
        state.heroPathIndex >= 0 ? state.heroPathIndex : HERO_NONE;
      // viz4: SINGLE WRITER of the shared client-mode uniform (coneNodes
      // + trajNodes both read it). 1 = embers + hero thread only.
      nodes.uniforms.uClientMode.value = state.viewMode === 'client' ? 1 : 0;
      // Instanced draw COUNT follows the plan (draw range, not a buffer
      // resize — the pool is just a sprite object).
      setPlan(next);
    };
    sync(useSimStore.getState());
    return useSimStore.subscribe(sync);
  }, [nodes]);

  // Advance the reveal sweep (ease-out cubic). Writes ONLY the visual
  // uReveal uniform — never a sim uniform (contract §2: sim uniforms are
  // written on parameter change by the driver, never per frame).
  useFrame((state) => {
    if (revealStart.current === null) {
      revealStart.current = state.clock.elapsedTime;
    }
    const t = (state.clock.elapsedTime - revealStart.current) / REVEAL_SECONDS;
    const c = Math.min(Math.max(t, 0), 1);
    // eslint-disable-next-line react-hooks/immutability
    nodes.uniforms.uReveal.value = 1 - Math.pow(1 - c, 3);
  });

  return (
    <sprite count={plan.total} frustumCulled={false}>
      <spriteNodeMaterial
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        positionNode={nodes.positionNode}
        scaleNode={nodes.scaleNode}
        colorNode={nodes.colorNode}
      />
    </sprite>
  );
}

