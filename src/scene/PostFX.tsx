/**
 * PostFX.tsx — native TSL post-processing chain (spec §4.4).
 * SINGLE OWNER: Agent 4.
 *
 * CRITICAL (docs/TSL_AUDIT.md drift mapping #2): `@react-three/postprocessing`
 * / `postprocessing@6.39.3` is WebGL-only and CANNOT drive the pinned
 * WebGPURenderer. Per spec §4.4's fallback clause ("hand-roll … do NOT
 * downgrade the renderer"), this uses three r185's native TSL post stack,
 * every import verified present in the audit:
 *
 *   pass          from 'three/tsl'                              (audit ✅)
 *   bloom         from 'three/addons/tsl/display/BloomNode.js'  (audit ✅)
 *   PostProcessing from 'three/webgpu'                          (audit ✅)
 *
 * Pipeline composition (ground truth: three.js r185 example
 * `webgpu_postprocessing_bloom.html` and BloomNode.js docstring):
 *
 *   scenePass  = pass(scene, camera)          → HalfFloatType HDR target
 *                (PassNode.js line ~246: `{ type: HalfFloatType }` default —
 *                the HDR pipeline is preserved, NOT downgraded)
 *   color      = scenePass.getTextureNode()   (HDR linear)
 *   bloomPass  = bloom(color, strength, radius, threshold)
 *   vignette   = radial screen-space multiplier (pure-black design language)
 *   outputNode = vec4((color + bloom) × vignette, 1)
 *
 * PostProcessing.outputColorTransform defaults to true, so tone mapping and
 * the output color-space transform are applied once at the end of the chain
 * (RenderPipeline.js) — bloom and vignette operate in HDR linear space
 * BEFORE the output transform, which is the correct order.
 *
 * Bloom tuning per spec §4.4 "threshold high so only the densest core
 * blooms": single sprites sit at luminance ≤ ~0.55; only where hundreds of
 * additive sprites stack (the terminal-fan core) does the HDR buffer exceed
 * the 0.85 threshold and bloom.
 *
 * DOF note: `DepthOfFieldNode` exists in r185 but keys off the depth
 * texture; cone sprites render depthWrite=false (additive, §3.6), so the
 * depth buffer carries no sprite depth. The spec's "gentle … depth-fade on
 * the far horizon, if cheap" is therefore implemented as an in-material
 * aerial-perspective fade in ConeParticles.tsx instead — cheaper and correct
 * for depth-less billboards. Documented, not improvised around.
 *
 * R3F glue: a `useFrame` with render priority 1 takes over rendering from
 * R3F's automatic loop and drives `postProcessing.render()` manually — the
 * standard R3F v9 manual-render pattern. No drei StatsGl anywhere (audit
 * hazard: nested three@0.170).
 */
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PostProcessing, type WebGPURenderer } from 'three/webgpu';
import { pass, screenUV, smoothstep, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

// Bloom parameters (strength, radius, threshold) — threshold high per spec.
// v2.2: bloom was the "shitton of ambient light" — strength 1.1→0.55,
// threshold 0.85→1.4 (only the truest core glows), radius 0.4→0.25 (tight).
// v2.3: user recording still showed a white-out — threshold 1.4→2.2,
// strength 0.55→0.4. Bloom is now a whisper on the median core only.
const BLOOM_STRENGTH = 0.4;
const BLOOM_RADIUS = 0.25;
const BLOOM_THRESHOLD = 2.2;
// Vignette: start/end of the radial falloff (unit-diagonal-normalized) and
// max darkening at the corners. Subtle — the scene must stay pure black.
const VIGNETTE_START = 0.55;
const VIGNETTE_END = 1.15;
const VIGNETTE_DEPTH = 0.35;

export function PostFX() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  const postProcessing = useMemo(() => {
    // R3F types state.gl as WebGLRenderer; the audit documents this cast for
    // WebGPU-only APIs (TSL_AUDIT.md, R3F glue note 4).
    const renderer = gl as unknown as WebGPURenderer;
    const pp = new PostProcessing(renderer);

    const scenePass = pass(scene, camera);
    const scenePassColor = scenePass.getTextureNode();
    const bloomPass = bloom(
      scenePassColor,
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    );

    // Subtle radial vignette in HDR linear space (screenUV ∈ [0,1]²;
    // distance from center normalized so corners ≈ 1).
    const d = screenUV.sub(0.5).length().mul(1.41421356);
    const vig = smoothstep(VIGNETTE_START, VIGNETTE_END, d)
      .mul(VIGNETTE_DEPTH)
      .oneMinus();

    pp.outputNode = vec4(scenePassColor.add(bloomPass).rgb.mul(vig), 1.0);
    return pp;
  }, [gl, scene, camera]);

  // Release the quad material / internal nodes with the canvas.
  useEffect(() => () => postProcessing.dispose(), [postProcessing]);

  // Priority 1 → R3F hands the frame to us (manual render takeover).
  useFrame(() => {
    postProcessing.render();
  }, 1);

  return null;
}
