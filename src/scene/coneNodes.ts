/**
 * coneNodes.ts — the ConeParticles sprite node graph (extracted verbatim
 * from ConeParticles.tsx so the component file exports ONLY the component,
 * and so the Tint probe compiles the REAL graph without pulling in React).
 * Pure TSL: no React, no store imports.
 */
import {
  Fn,
  PI2,
  cameraPosition,
  color,
  float,
  hash,
  instanceIndex,
  mix,
  select,
  smoothstep,
  uint,
  uniform,
  vec2,
  vec3,
  vec4,
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
import {
  CURSOR_FEATHER,
  CURSOR_GHOST,
  uCursorX,
  uReveal as sharedReveal,
} from './playhead';
import { uClientMode as sharedClientMode } from './clientMode';

/** Base sprite size in world units (attenuated by distance). */
const SPRITE_SIZE = 0.075; // v2.2: 0.06→0.075 — more definition per point
/** Reveal feather width in normalized time units. */
const REVEAL_FEATHER = 0.02;
/** viz3 ember rain: the death-slot fall spans this much of the reveal sweep
 * (0.2 × 4 s sweep ≈ 0.8 s). */
const EMBER_DROP_SPAN = 0.2;

// Palette discipline (§4.4): cool blue core → near-white hot, ember failures.
// color() hex is converted sRGB → linear working space by ColorManagement.
const COOL_BLUE = /*#__PURE__*/ color(0x3080ff);
const HOT_WHITE = /*#__PURE__*/ color(0xf2f7ff);
const EMBER_RED = /*#__PURE__*/ color(0xfb2c36).mul(0.85); // v2.2: brighter — failures must POP

export function buildConeNodes() {
    /** 0→1 reveal sweep (visual only) — SHARED (./playhead.ts): this
     * component is the only writer; TrajectoryLines reads the same node. */
    const uReveal = sharedReveal;
    /** Total simulated months (params.horizonYears × 12). */
    const uHorizonSteps = uniform(360.0);
    /** log10(initialWealth) — log-scale pivot. */
    const uLogCenter = uniform(Math.log10(1_000_000));
    /** Weak-GPU escape hatch: render every s-th PATH (1 = all kept paths). */
    const uSpriteStride = uniform(1, 'uint');
    // --- plan uniforms (JS-written when params change) ---
    const uSpritesPerPath = uniform(31, 'uint');
    const uSnapDecimate = uniform(1, 'uint');
    const uPathSubset = uniform(1, 'uint');
    const uSnapsTotal = uniform(31, 'uint');
    const uActiveSprites = uniform(310_000, 'uint');
    /** viz3 alpha normalization (alphaScaleForCount, ./spritePlan.ts): scales
     * LIVE sprite alpha with the rendered sprite count so the additive
     * interior stays blue at 100k+ paths and brightens below the reference.
     * Written by ConeParticles on plan sync. Embers + hero exempt. */
    const uAlphaScale = uniform(1.0);
    /** viz3 hero thread: path index whose terminal wealth is closest to the
     * median (picked CPU-side from the param-change pathWealth readback —
     * see src/sim/stats/heroPath.ts). HERO_NONE = no hero. */
    const uHeroPath = uniform(0xffffffff, 'uint');
    /** viz4 audience split (./clientMode.ts): 1 = client view — cull the
     * whole live density field; only death-slot embers (the rain) and the
     * hero protagonist thread survive. SHARED with trajNodes; single writer
     * is ConeParticles' store sync. */
    const uClientMode = sharedClientMode;

    // --- index decomposition: instance → (pathSlot, snapSlot) --------------
    // slot = instance mod perPath; pathSlot = instance div perPath.
    // float math is exact far below 2^24 (max 2M instances).
    const perPathF = uSpritesPerPath.toFloat();
    const pathSlotF = float(instanceIndex).div(perPathF).floor();
    const slotF = float(instanceIndex).sub(pathSlotF.mul(perPathF));
    const pathSlot = uint(pathSlotF);
    const slot = uint(slotF);

    // Kept path id (evenly-strided subset when uPathSubset > 1 — visual
    // subsample only, the sim always runs all paths).
    const pathId = pathSlot.mul(uPathSubset);

    // Gate: live draw region + weak-GPU stride (drops whole threads).
    const inRange = instanceIndex.lessThan(uActiveSprites);
    const strideOk = pathSlot.mod(uSpriteStride).equal(uint(0));

    // Snapshot index: decimated, with the LAST slot always the terminal
    // point so no plan ever loses the trajectory tip.
    const isLastSlot = slot.equal(uSpritesPerPath.sub(uint(1)));
    const sEff = select(
      isLastSlot,
      uSnapsTotal.sub(uint(1)),
      slot.mul(uSnapDecimate),
    );

    // --- frozen-buffer reads (GPU→GPU, contract §1/§9) ----------------------
    // sEff < uSnapCount → history slot; sEff == uSnapCount (only when the
    // grid misses the horizon) → terminal pathWealth (contract §9 rule).
    const wHist = pathHistory.element(
      pathId.mul(uint(SNAP_MAX)).add(sEff),
    );
    const wealth = select(
      sEff.lessThan(uSnapCount),
      wHist,
      pathWealth.element(pathId),
    );
    const failedVal = pathFailed.element(pathId); // 0, or failureStep+1
    const isFailed = failedVal.greaterThan(uint(0));
    // viz3 hero thread: every sprite of the median-terminal-wealth path.
    // pathId is a plain uint mul (NOT a select result) — .equal is a uint
    // consumption, safe under the r185 ConditionalNode pitfall.
    const isHero = pathId.equal(uHeroPath);

    // Failure slots (contract §9): history is zero-filled from the failure
    // slot (floor(f/stride)+1) onward. Under snapshot decimation the exact
    // failure slot may not be a RENDERED slot, so the ember is the FIRST
    // rendered slot at/after it (uint ceil-div, clamped to the terminal
    // slot); later slots are culled so dead paths don't smear along the
    // floor. The ember is placed at the EXACT death month from pathFailed.
    const failStepF = float(failedVal).sub(1.0);
    const failSlot = failedVal.sub(uint(1)).div(uSnapStride).add(uint(1));
    const ceilSlot = failSlot
      .add(uSnapDecimate.sub(uint(1)))
      .div(uSnapDecimate)
      .mul(uSnapDecimate);
    // The rendered grid is multiples of uSnapDecimate up to (perPath−2)·d,
    // PLUS the terminal slot — a ceil-slotted death beyond the last grid
    // point must land on the terminal slot or it would never be drawn.
    const maxGridSlot = uSpritesPerPath.sub(uint(2)).mul(uSnapDecimate);
    const deathSlot = select(
      ceilSlot.greaterThan(maxGridSlot),
      uSnapsTotal.sub(uint(1)),
      ceilSlot,
    );
    const isDeathSlot = isFailed.and(sEff.equal(deathSlot));
    const afterDeath = isFailed.and(sEff.greaterThan(deathSlot));
    // v2.3: CULL slot 0 — snapshot 0 is every path at EXACTLY initialWealth,
    // i.e. 100k sprites stacked on one point: a zero-information density
    // singularity that white-outs into the "nuclear glow ball" (user
    // recording 2026-07-21). Death slots are ≥ 1 by contract, unaffected.
    const notSingularity = slot.greaterThan(uint(0));
    // viz4 client view: cull ALL non-death, non-hero sprites — the particle
    // cone body is replaced by the percentile band surfaces; what remains is
    // the ember rain (failures still fall) plus the protagonist hero thread.
    // Bool algebra only (no select, no float twin): uClientMode is consumed
    // solely in this uint comparison — r185 ConditionalNode-safe.
    const modeKeep = uClientMode.equal(uint(0)).or(isDeathSlot).or(isHero);
    const gate = select(
      inRange
        .and(strideOk)
        .and(afterDeath.not())
        .and(notSingularity)
        .and(modeKeep),
      float(1.0),
      float(0.0),
    );

    // Deterministic PER-PATH seeds (constant along a trajectory → coherent
    // threads fanning into a volume; per-sprite seeds would fuzz the thread).
    const seedBase = pathId.mul(uint(64));
    const angH = hash(seedBase.add(uint(101)));
    const radH = hash(seedBase.add(uint(202)));
    const yJitH = hash(seedBase.add(uint(404)));
    const revealH = hash(seedBase.add(uint(505)));

    // --- layout -------------------------------------------------------------
    // X = time. Death slot uses the exact failure step; all others use the
    // snapshot month s·uSnapStride (≤ horizonSteps by contract §9).
    //
    // THREE r185 ConditionalNode PITFALL (root cause of the black screen on
    // real drivers): `float(sEff)` here generated INVALID WGSL —
    // `(sEff_u32 * f32(uSnapStride))` — because ConditionalNode.generate()
    // returns its cached nodeProperty RAW on repeat builds
    // (ConditionalNode.js: `if (nodeData.nodeProperty !== undefined) return
    // nodeData.nodeProperty`), so when sEff is built first in uint contexts
    // (buffer indices, comparisons) and later requested as float, the f32()
    // wrap is elided → `u32 * f32` → Tint rejects the whole sprite pipeline.
    // Rule: never consume ONE select() node in two different type contexts.
    // sEff stays uint-only below; this float-only twin feeds the time axis.
    const sEffF = select(
      isLastSlot,
      uSnapsTotal.toFloat().sub(1.0),
      slotF.mul(uSnapDecimate.toFloat()),
    );
    const xNormSlot = sEffF
      .mul(uSnapStride.toFloat())
      .div(uHorizonSteps);
    const xNorm = select(
      isDeathSlot,
      failStepF.div(uHorizonSteps),
      xNormSlot,
    );
    const x = xNorm.sub(0.5).mul(X_SPAN);

    // Reveal timing (hoisted — viz3 ember rain shares it with `vis` below).
    // Each sprite's wave passes at xNorm·0.96 + per-path hash·0.04 shimmer.
    // xNorm is a FLOAT-context select result; one more float consumption is
    // safe (the r185 pitfall is uint/float mixing only).
    const revealAt = xNorm.mul(0.96).add(revealH.mul(0.04));

    // Y = log10 wealth around the initial-wealth pivot (natural log × 1/ln10;
    // three r185 TSL has no log10 node). Death slot → ember floor.
    const lw = wealth.max(1.0).log().mul(0.43429448190325176);
    const yLive = lw.sub(uLogCenter).mul(Y_SCALE).clamp(-Y_CLAMP, Y_CLAMP);
    const yDeath = float(Y_FLOOR).add(yJitH.sub(0.5).mul(1.0));
    // viz3 EMBER RAIN: the death-slot ember FALLS from the path's last live
    // point to the ember floor over ~0.8 s as the reveal wave passes its
    // death month. Start = the previous rendered slot's wealth (always live:
    // deathSlot is the FIRST rendered slot at/after the failure slot, so the
    // slot before it is pre-failure; clamp guards the sEff=0 underflow).
    // sEff stays uint-only (buffer index); the static end state (dropT=1 →
    // yDeath) is identical to v2.3, so death-slot semantics are untouched.
    // sEff−1 clamps at 0 via a UINT-only select (slot-0 sprites are culled
    // anyway; the clamp just keeps the storage index in range). Consumed
    // only as a buffer index — r185-safe.
    const sPrev = select(sEff.equal(uint(0)), uint(0), sEff.sub(uint(1)));
    const wPrev = pathHistory.element(
      pathId.mul(uint(SNAP_MAX)).add(sPrev),
    );
    const lwPrev = wPrev.max(1.0).log().mul(0.43429448190325176);
    const yPrev = lwPrev.sub(uLogCenter).mul(Y_SCALE).clamp(-Y_CLAMP, Y_CLAMP);
    const dropT = smoothstep(revealAt, revealAt.add(EMBER_DROP_SPAN), uReveal);
    const yFall = mix(yPrev, yDeath, dropT);
    const y = select(isDeathSlot, yFall, yLive);

    // Z = deterministic per-path hash-disc jitter (cone volume; sqrt for a
    // uniform disc). Constant along the thread.
    const angle = angH.mul(PI2);
    const z = angle.cos().mul(radH.sqrt().mul(Z_RAD));

    const worldPos = vec3(x, y, z);

    // --- reveal wave (visual only) ------------------------------------------
    // Each sprite appears when the wave passes its snapshot month (revealAt
    // hoisted above — the ember rain shares it). Recolor works mid-reveal
    // because the grade never depends on uReveal.
    const vis = smoothstep(
      revealAt,
      revealAt.add(REVEAL_FEATHER),
      uReveal,
    ).mul(gate);

    // --- color grade by state (density talks; size/brightness encode nothing)
    // Live: cool blue → near-white across ±1.5 decades around the pivot.
    // Death slot: dim ember.
    const tHot = lw
      .sub(uLogCenter)
      .add(1.5)
      .div(3.0)
      .clamp(0, 1)
      .pow(1.8);
    const liveRGB = mix(COOL_BLUE, HOT_WHITE, tHot);
    const rgbState = select(isDeathSlot, EMBER_RED, liveRGB);
    // viz3 hero thread: the protagonist path renders near-white (vec3-only
    // select — same type context both branches, r185-safe).
    const rgb = select(
      isHero.and(isDeathSlot.not()),
      mix(rgbState, HOT_WHITE, float(0.85)),
      rgbState,
    );

    // Aerial-perspective far fade (spec's "depth-fade on the far horizon, if
    // cheap": sprites are depthWrite=false, so depth-texture DOF has no
    // sprite depth — this in-material fade is the cheap correct equivalent).
    const aerial = smoothstep(16.0, 42.0, cameraPosition.distance(worldPos))
      .mul(0.55) // v2.2: 0.3→0.55 — stronger far fade cuts the ambient haze
      .oneMinus();

    // viz2 year cursor: sprites AHEAD of the cursor ghost to CURSOR_GHOST
    // alpha (embers at/before stay lit — the cursor makes the story
    // temporal). xNorm is already a float-context select() result (used by
    // x and revealAt above); this adds one more FLOAT consumption of the
    // same node — no uint twin needed, the r185 ConditionalNode pitfall is
    // uint/float mixing only.
    const cursorDim = smoothstep(
      uCursorX,
      uCursorX.add(CURSOR_FEATHER),
      xNorm,
    )
      .mul(1 - CURSOR_GHOST)
      .oneMinus();

    // v2.3 density compensation: path spread grows ~√time, so per-sprite
    // alpha ramps 0.12→1.0 along the thread — early clustered years stop
    // stacking into a white ball, the spread tail (the actual risk story)
    // gets full brightness. Embers exempt (they're the loudest by design).
    const tNorm = sEffF.div(uSnapsTotal.toFloat()).clamp(0, 1);
    const densityComp = mix(float(0.12), float(1.0), tNorm.pow(0.6));
    // v2.2 hierarchy pass: live alpha DOWN (0.35→0.22 — the additive stack
    // was saturating the cone interior into white fog), ember alpha UP
    // (0.42→0.65 — deaths are the story, they read through the blue mass).
    // viz3: uAlphaScale normalizes for the rendered sprite count (0.40× at
    // 100k/30y kills the mid-cone white mass; ≈1× at the 10k reference;
    // up to 2× for sparse plans). Embers exempt — they stay loud.
    const alpha = select(
      isDeathSlot,
      float(0.65),
      float(0.22).mul(densityComp).mul(uAlphaScale),
    )
      .mul(vis)
      .mul(aerial)
      .mul(cursorDim)
      // viz3 hero thread: 3× alpha so the protagonist path reads through
      // the density field (float-only select, r185-safe).
      .mul(select(isHero, float(3.0), float(1.0)));

    return {
      uniforms: {
        uReveal,
        uHorizonSteps,
        uLogCenter,
        uSpriteStride,
        uSpritesPerPath,
        uSnapDecimate,
        uPathSubset,
        uSnapsTotal,
        uActiveSprites,
        uAlphaScale,
        uHeroPath,
        uClientMode,
      },
      // positionNode = billboard CENTER in object space; SpriteNodeMaterial
      // appends the camera-facing corner expansion itself (r185 source).
      positionNode: Fn(() => worldPos)(),
      // v2.2: embers render 2× — the death of a path should be VISIBLE.
      // viz3: hero sprites 1.5× — the protagonist thread is slightly fatter.
      scaleNode: Fn(() =>
        vec2(SPRITE_SIZE)
          .mul(vis)
          .mul(select(isDeathSlot, float(2.0), float(1.0)))
          .mul(select(isHero, float(1.5), float(1.0))),
      )(),
      colorNode: Fn(() => vec4(rgb, alpha))(),
    };
}
