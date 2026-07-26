/**
 * trajNodes.ts — the TrajectoryLines vertex/color node graph (extracted
 * verbatim from TrajectoryLines.tsx so the component file exports ONLY the
 * component, and so the Tint probe compiles the REAL graph without React).
 * Pure TSL: no React, no store imports. Ground truth for the math is
 * ConeParticles.tsx / coneNodes.ts (identical layout + failure semantics).
 */
import {
  Fn,
  PI2,
  color,
  float,
  hash,
  mix,
  select,
  smoothstep,
  uint,
  uniform,
  varying,
  vec3,
  vec4,
  vertexIndex,
} from 'three/tsl';
import {
  pathFailed,
  pathHistory,
  pathWealth,
  uSnapCount,
  uSnapStride,
} from '../sim/buffers';
import { SNAP_MAX } from '../sim/model/history';
import { X_SPAN, Y_CLAMP, Y_FLOOR, Y_SCALE, Z_RAD } from './layout';
import { CURSOR_FEATHER, CURSOR_GHOST, uCursorX, uReveal } from './playhead';
import { uClientMode as sharedClientMode } from './clientMode';

/** Thread alpha at full reveal (faint — density must keep talking). */
const LINE_ALPHA = 0.09; // v2.3: 0.05→0.09 — threads stitch the snapshot
// "curtains" into readable paths (user recording: curtains read as
// disconnected stripes without the lines carrying continuity)
/** Reveal feather — same value as ConeParticles. */
const REVEAL_FEATHER = 0.02;

const THREAD_BLUE = /*#__PURE__*/ mix(color(0x3080ff), color(0xf2f7ff), 0.25);
const THREAD_EMBER = /*#__PURE__*/ color(0xfb2c36).mul(0.5);
/** viz3 hero thread: near-white protagonist (matches the sprite grade). */
const THREAD_HERO = /*#__PURE__*/ mix(color(0x3080ff), color(0xf2f7ff), 0.9);

/**
 * The full vertex/node graph, exported as a pure function so the Tint
 * probe (probe/viz2-probe.js) compiles the REAL material — no drift
 * between probe and product. The component calls it once in useMemo.
 */
export function buildTrajectoryNodes() {
    // Plan uniforms — JS-written when params/previewMode change (same
    // sync rule as ConeParticles).
    const uHorizonSteps = uniform(360.0);
    const uLogCenter = uniform(Math.log10(1_000_000));
    const uSpriteStride = uniform(1, 'uint'); // weak-GPU hatch (1 = all)
    const uSpritesPerPath = uniform(31, 'uint');
    const uSnapDecimate = uniform(1, 'uint');
    const uPathSubset = uniform(1, 'uint');
    const uSnapsTotal = uniform(31, 'uint');
    /** viz3 alpha normalization — SAME shared formula as the cone sprites
     * (alphaScaleForCount, ./spritePlan.ts), fed the sprite-equivalent count
     * of the rendered line subset (linePaths × perPath) so threads dim and
     * brighten in lockstep with the dots. Written by TrajectoryLines. */
    const uAlphaScale = uniform(1.0);
    /** viz3 hero thread: path index closest to the terminal median
     * (src/sim/stats/heroPath.ts); 0xffffffff = none. */
    const uHeroPath = uniform(0xffffffff, 'uint');
    /** viz4 audience split (./clientMode.ts): 1 = client view — the thread
     * swarm is hidden; only the hero path's segments render (the SINGLE
     * dedicated protagonist thread). SHARED with coneNodes; ConeParticles
     * is the single writer. */
    const uClientMode = sharedClientMode;

    // --- vertex → (pathSlot, slot) ------------------------------------------
    const seg = vertexIndex.div(uint(2));
    const endU = vertexIndex.sub(seg.mul(uint(2)));
    const perSeg = uSpritesPerPath.sub(uint(1)); // segments per path
    const pathSlot = seg.div(perSeg);
    const segSlot = seg.sub(pathSlot.mul(perSeg));
    const slotRaw = segSlot.add(endU);

    const pathId = pathSlot.mul(uPathSubset);

    // viz3 hero thread: every segment of the median path (uint mul → uint
    // .equal — not a select result, r185-safe).
    const isHero = pathId.equal(uHeroPath);

    // Weak-GPU stride gate: collapse dropped threads (alpha 0).
    const strideOk = pathSlot.mod(uSpriteStride).equal(uint(0));

    // --- frozen-buffer reads (contract §1/§9) -------------------------------
    const failedVal = pathFailed.element(pathId); // 0, or failureStep+1
    const isFailed = failedVal.greaterThan(uint(0));
    const failStepF = float(failedVal).sub(1.0);
    const failSlot = failedVal.sub(uint(1)).div(uSnapStride).add(uint(1));
    const ceilSlot = failSlot
      .add(uSnapDecimate.sub(uint(1)))
      .div(uSnapDecimate)
      .mul(uSnapDecimate);
    const maxGridSlot = uSpritesPerPath.sub(uint(2)).mul(uSnapDecimate);
    // UINT-only selects (indices/comparisons) — float twins below.
    const deathSlot = select(
      ceilSlot.greaterThan(maxGridSlot),
      uSnapsTotal.sub(uint(1)),
      ceilSlot,
    );

    // Death clamp: slots past the death slot collapse onto it (segments
    // after death become zero-length; the segment AT death drops to the
    // ember floor). UINT-only select.
    const slot = select(
      isFailed.and(slotRaw.greaterThan(deathSlot)),
      deathSlot,
      slotRaw,
    );

    const isLastSlot = slot.equal(uSpritesPerPath.sub(uint(1)));
    const sEff = select(
      isLastSlot,
      uSnapsTotal.sub(uint(1)),
      slot.mul(uSnapDecimate),
    ); // UINT-only consumption below (buffer index + comparison)

    const wHist = pathHistory.element(pathId.mul(uint(SNAP_MAX)).add(sEff));
    const wealth = select(
      sEff.lessThan(uSnapCount),
      wHist,
      pathWealth.element(pathId),
    ); // FLOAT result — consumed as float only (log below)

    const isDeathSlot = isFailed.and(sEff.equal(deathSlot));

    // --- layout (same math as ConeParticles) --------------------------------
    // FLOAT TWINS of every uint select above — the r185 ConditionalNode
    // cache pitfall (v1 black screen): `float(slot)` / `deathSlot.toFloat()`
    // would elide the f32() wrap on the cached var and emit u32×f32 WGSL
    // (the viz2 probe caught exactly this). float() of NON-select nodes
    // (slotRaw, ceilSlot) is a real conversion and safe.
    const deathSlotF = select(
      ceilSlot.greaterThan(maxGridSlot),
      uSnapsTotal.toFloat().sub(1.0),
      float(ceilSlot),
    );
    const slotF = select(
      isFailed.and(slotRaw.greaterThan(deathSlot)),
      deathSlotF,
      float(slotRaw),
    );
    const sEffF = select(
      isLastSlot,
      uSnapsTotal.toFloat().sub(1.0),
      slotF.mul(uSnapDecimate.toFloat()),
    );
    const xNormSlot = sEffF.mul(uSnapStride.toFloat()).div(uHorizonSteps);
    const xNorm = select(isDeathSlot, failStepF.div(uHorizonSteps), xNormSlot);
    const x = xNorm.sub(0.5).mul(X_SPAN);

    const lw = wealth.max(1.0).log().mul(0.43429448190325176);
    const yLive = lw.sub(uLogCenter).mul(Y_SCALE).clamp(-Y_CLAMP, Y_CLAMP);
    const seedBase = pathId.mul(uint(64));
    const yJitH = hash(seedBase.add(uint(404)));
    const yDeath = float(Y_FLOOR).add(yJitH.sub(0.5).mul(1.0));
    const y = select(isDeathSlot, yDeath, yLive);

    const angH = hash(seedBase.add(uint(101)));
    const radH = hash(seedBase.add(uint(202)));
    const z = angH.mul(PI2).cos().mul(radH.sqrt().mul(Z_RAD));

    const worldPos = vec3(x, y, z);

    // --- reveal + cursor dim (shared uniforms; sprite-locked) ---------------
    const revealH = hash(seedBase.add(uint(505)));
    const revealAt = xNorm.mul(0.96).add(revealH.mul(0.04));
    const vis = smoothstep(revealAt, revealAt.add(REVEAL_FEATHER), uReveal);
    const cursorDim = smoothstep(uCursorX, uCursorX.add(CURSOR_FEATHER), xNorm)
      .mul(1 - CURSOR_GHOST)
      .oneMinus();

    // v2.3: cull the snap0→snap1 segment (starts at the all-paths-shared
    // initial-wealth singularity) and density-compensate along the thread
    // (same √time ramp as the sprites) so early clustered years stop
    // stacking into a white ball.
    const notSingularity = segSlot.greaterThan(uint(0));
    // viz4 client view: collapse every non-hero thread to zero alpha so the
    // protagonist path renders as a single dedicated line (bool algebra
    // only — uClientMode stays uint-only, r185-safe).
    const modeKeep = uClientMode.equal(uint(0)).or(isHero);
    // (reuses the existing sEffF float twin above — float-only select, safe)
    const tNorm = sEffF.div(uSnapsTotal.toFloat()).clamp(0, 1);
    const densityComp = mix(float(0.15), float(1.0), tNorm.pow(0.6));
    const alpha = float(LINE_ALPHA)
      .mul(vis)
      .mul(cursorDim)
      .mul(densityComp)
      .mul(uAlphaScale) // viz3: same count normalization as the sprites
      .mul(
        select(
          strideOk.and(notSingularity).and(modeKeep),
          float(1.0),
          float(0.0),
        ),
      )
      // viz3 hero thread: 3× alpha for the protagonist path.
      .mul(select(isHero, float(3.0), float(1.0)));
    const rgbState = select(isDeathSlot, THREAD_EMBER, THREAD_BLUE);
    // Hero recolor never masks an ember — deaths keep their color.
    const rgb = select(isHero.and(isDeathSlot.not()), THREAD_HERO, rgbState);

    return {
      uniforms: {
        uHorizonSteps,
        uLogCenter,
        uSpritesPerPath,
        uSnapDecimate,
        uPathSubset,
        uSnapsTotal,
        uAlphaScale,
        uHeroPath,
      },
      positionNode: Fn(() => worldPos)(),
      // varying(): computed per-vertex, interpolated across the segment —
      // gives the thread its ember dip near death and the reveal sweep.
      colorNode: varying(vec4(rgb, alpha)),
    };
}

