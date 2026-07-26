/**
 * hash.ts — deterministic RNG core shared by the GPU kernels and the CPU
 * fallback (spec §2.4, R3). SINGLE OWNER: Agent 2.
 *
 * BIT-FAITHFUL PORT of three r185's TSL `hash()`. Source of truth (quoted
 * verbatim from node_modules/three/src/nodes/math/Hash.js, three@0.185.1):
 *
 * ```js
 * export const hash = /*@__PURE__*\/ Fn( ( [ seed ] ) => {
 *   // Taken from https://www.shadertoy.com/view/XlGcRh, originally from pcg-random.org
 *   const state = seed.toUint().mul( 747796405 ).add( 2891336453 );
 *   const word = state.shiftRight( state.shiftRight( 28 ).add( 4 ) ).bitXor( state ).mul( 277803737 );
 *   const result = word.shiftRight( 22 ).bitXor( word );
 *   return result.toFloat().mul( 1 / 2 ** 32 ); // Convert to range [0, 1)
 * } );
 * ```
 *
 * This is PCG RXS-M-XS (32-bit state). All multiplies/adds are u32 with
 * wraparound; shifts on a u32 operand are logical. The TS port reproduces
 * the exact bit pattern with Math.imul and `>>> 0`/`>>>` operators.
 *
 * Float32 semantics: the GPU computes `result.toFloat()` (u32 → f32,
 * round-to-nearest) then multiplies by 2^-32 (exact power of two). The TS
 * port therefore applies Math.fround() to the u32 result before scaling —
 * this makes `hashU32()` BIT-IDENTICAL to the TSL `hash()` output, not
 * merely within 1e-6 (spec §2.4 / §4.7 task 2).
 *
 * SEED-MIXING DEVIATION FROM SPEC §2.4 (documented in docs/CONTRACTS.md):
 * §2.4 specifies `u = hash(float(i)*360.0 + float(t) + seedUniform)`. In f32
 * arithmetic the term i*360 dominates: near 3.6e8 (i ≈ 1M) the f32 spacing
 * is 32, so 32 consecutive steps `t` round to the SAME float seed → adjacent
 * months share uniforms and §2.6 variance checks fail. Per spec §3.8 trap 6
 * ("If validation fails, swap in a PCG hash — contained change, owned by
 * Agent 2"), the seed is mixed in the u32 domain instead (exact wraparound
 * integer arithmetic, no information loss), then fed to the SAME verbatim
 * PCG hash above. TSL `hash()` begins with `seed.toUint()`, so passing a u32
 * seed is exactly equivalent to passing the integer-valued float — zero
 * change to the hash itself. This preserves R3 (bit-identical statistics
 * for identical inputs) on BOTH backends and makes CPU↔GPU hash agreement
 * bit-exact.
 */

// ---------------------------------------------------------------------------
// Frozen stream constants (shared with the TSL kernels — do not change).
// ---------------------------------------------------------------------------

/**
 * Steps-per-path stride used when mixing (path, step) into the u32 seed.
 * DEVIATION from §2.4's literal `360.0`: with stride 360 and a 40-year
 * horizon (480 steps, the §2.1 maximum), path i's months 360..479 reuse the
 * exact seed sequence of path i+1's months 0..119 (i·360+t ≡ (i+1)·360+t′).
 * 480 = max(horizonYears)×12 makes every (path, step) seed globally unique
 * for all §2.1 horizons (i·480+t ≤ 480,000,000+479 ≪ 2³²).
 */
export const STEP_STRIDE = 480;

/** Golden-ratio Weyl constant: stream decorrelator (u32). */
export const GOLDEN_U32 = 0x9e3779b9;

/** Stream offset for the Model B block-draw uniform (u32). */
export const STREAM_BLOCK_U32 = 0x85ebca6b;

/** 2^32 as a float scale (hash output denominator). */
export const UINT32_SCALE = 4294967296; // 2 ** 32

// ---------------------------------------------------------------------------
// Core hash — bit-faithful port of three r185 Hash.js (see header quote).
// ---------------------------------------------------------------------------

/**
 * One raw PCG RXS-M-XS round on a u32 seed → u32 (no float scaling).
 * This is exactly three r185 Hash.js up to (but excluding) the final
 * `result.toFloat().mul(1 / 2**32)`.
 */
function hashU32Raw(seedU: number): number {
  // state = seed * 747796405 + 2891336453            (u32 wraparound)
  let state = (Math.imul(seedU >>> 0, 747796405) | 0) >>> 0;
  state = (state + 2891336453) >>> 0;
  // word = ((state >> ((state >> 28) + 4)) ^ state) * 277803737
  const word =
    Math.imul((state >>> ((state >>> 28) + 4)) ^ state, 277803737) | 0;
  // result = (word >> 22) ^ word
  return ((word >>> 22) ^ word) >>> 0;
}

/**
 * PCG RXS-M-XS hash of a u32 seed → [0, 1), bit-identical to TSL `hash()`.
 * Kept as the verbatim single-round port for the §4.7 hash-agreement test;
 * the simulation streams below use the strengthened `streamHash`.
 */
export function hashU32(seedU: number): number {
  // result.toFloat().mul(1 / 2**32): u32 → f32 rounds, so fround first.
  return Math.fround(hashU32Raw(seedU)) / UINT32_SCALE;
}

/**
 * Strengthened stream hash → [0, 1): TWO chained PCG rounds.
 *
 * Measured justification (spec §3.8 trap 6 — "if validation fails, swap in
 * a PCG hash"): with a single round, seeds in arithmetic progression
 * (seedU = i·360 + t + seed) leak ~3e-5 average pairwise correlation into
 * the drawn normals, inflating Var[ln W_T] by +1.03% at 100k×360 (seed 42)
 * — marginally FAILING the §2.6 ±1% analytic-moment gate. With two chained
 * rounds the inflation drops to +0.37% (within the ±0.45% estimator noise),
 * and χ² uniformity over 10⁶ samples improves. Still pure u32 integer math,
 * so CPU↔GPU agreement remains BIT-EXACT (the TSL twin applies the same two
 * rounds in rng.tsl.ts `pcgRound`).
 */
export function streamHash(seedU: number): number {
  return Math.fround(hashU32Raw(hashU32Raw(seedU))) / UINT32_SCALE;
}

/**
 * Per-(path, step) u32 seed. Mirrors the TSL kernel expression
 * `instanceIndex.mul(uint(STEP_STRIDE)).add(uStep).add(pcgRound(uSeed))` —
 * all u32 wraparound arithmetic.
 *
 * AMENDMENT A3 (docs/CONTRACTS.md §10): the user seed is folded through ONE
 * raw PCG round before mixing. Under the v1.0–v1.2 formula (`+ seed`
 * verbatim), seeds differing by a multiple of STEP_STRIDE (480) reused the
 * entire ensemble shifted by one path — seed 522's path i was bit-identical
 * to seed 42's path i+1 (measured: 999/999 lane collisions). The PCG fold
 * decorrelates seed choices while staying pure u32 integer math, so
 * CPU↔GPU agreement remains BIT-EXACT (the TSL twin applies the same
 * `pcgRound` in rng.tsl.ts `stepSeed`).
 */
export function stepSeedU(pathIndex: number, step: number, seed: number): number {
  return (((Math.imul(pathIndex >>> 0, STEP_STRIDE) | 0) + (step >>> 0)) >>> 0) + hashU32Raw(seed) >>> 0;
}

/**
 * Stream `j` uniform for a (path, step) seed: streamHash(seedU + j·GOLDEN_U32).
 * j = 0 and 1 feed Box–Muller (Model A), j = 0..11 feed Student-t (Model C).
 */
export function streamUniform(seedU: number, j: number): number {
  return streamHash((seedU + Math.imul(j >>> 0, GOLDEN_U32)) >>> 0);
}

/**
 * Standard normal via Box–Muller from stream pair `j` (cosine half, exactly
 * mirroring spec §3.3's randNormal):
 *   u1 = max(streamUniform(seedU, 2*j),   1e-7)
 *   u2 =     streamUniform(seedU, 2*j+1)
 *   Z  = sqrt(-2 ln u1) * cos(2π u2)
 *
 * NOTE: only the transcendental-free hash core is bit-exact CPU↔GPU; the
 * f64 Math.log/cos here vs the GPU's f32 approximations differ by ~1e-7,
 * which is absorbed by the §2.6 tolerances.
 */
export function streamNormal(seedU: number, j: number): number {
  const u1 = Math.max(streamUniform(seedU, 2 * j), 1e-7);
  const u2 = streamUniform(seedU, 2 * j + 1);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Student-t innovation, ν = 5, scaled to unit variance (spec §2.2 Model C).
 * T = Z / sqrt(V/ν) with Z, N₁..N₅ iid standard normals, V = Σ Nₖ² ~ χ²₅.
 * Var(t₅) = 5/3, so the unit-variance scaling is sqrt(3/5).
 * Consumes stream pairs j = 0..5 (12 uniforms).
 */
export const STUDENT_T_NU = 5;

export function streamStudentT5(seedU: number): number {
  let z = 0;
  let v = 0;
  for (let k = 0; k <= STUDENT_T_NU; k++) {
    const n = streamNormal(seedU, k);
    if (k === 0) z = n;
    else v += n * n;
  }
  v = Math.max(v, 1e-12); // measure-zero guard
  return z * Math.sqrt(STUDENT_T_NU / v) * Math.sqrt((STUDENT_T_NU - 2) / STUDENT_T_NU);
}

/**
 * Model B block draw: uniform block index in [0, blockCount).
 * Uses the dedicated STREAM_BLOCK_U32 offset (consumed only when
 * step % BLOCK_LENGTH === 0).
 */
export function drawBlockIndex(seedU: number, blockCount: number): number {
  const u = streamHash((seedU + STREAM_BLOCK_U32) >>> 0);
  return Math.min(Math.floor(u * blockCount), blockCount - 1);
}
