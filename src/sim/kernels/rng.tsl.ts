/**
 * rng.tsl.ts — deterministic RNG helpers (spec §4.2 task 2).
 * SINGLE OWNER: Agent 2.
 *
 * Contents:
 *  1. `randValue` / `randNormal` — spec §3.3 ported VERBATIM (instanceIndex
 *     streams; kept for spec fidelity and viz use).
 *  2. `stepSeed` / `streamUniformTsl` / `streamNormalTsl` / `drawBlockIndexTsl`
 *     — the §2.4 simulation stream RNG. These mirror src/sim/model/hash.ts
 *     LINE BY LINE (u32-domain seed mixing + three r185's verbatim PCG hash).
 *     See hash.ts header for why the seed is mixed in u32, not f32
 *     (f32 rounding of i*360+t collapses adjacent steps at 1M paths;
 *     swap authorized by spec §3.8 trap 6).
 *  3. `studentT5` — Student-t innovation (ν=5, unit variance) for Model C.
 *
 * cpuSim counterpart: src/sim/model/hash.ts (BIT-IDENTICAL integer math;
 * transcendentals differ by f32-vs-f64 rounding only, covered by §2.6).
 */
import { Fn, If, Loop, PI2, float, hash, instanceIndex, uint } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import {
  GOLDEN_U32,
  STEP_STRIDE,
  STREAM_BLOCK_U32,
  STUDENT_T_NU,
} from '../model/hash';

/** Scalar TSL node (mirrors three's internal ScalarNode union, which the
 * published types don't export). */
type Scalar = Node<'float'> | Node<'int'> | Node<'uint'> | Node<'bool'>;

/** uint() overloads don't accept a Scalar|number union — narrow first. */
const toUint = (v: Scalar | number) => (typeof v === 'number' ? uint(v) : uint(v as Scalar));

// ---------------------------------------------------------------------------
// §3.3 verbatim port (kept exactly as specified)
// ---------------------------------------------------------------------------

// Uniform in [min, max) for thread `instanceIndex`, sub-seed `stream`
export const randValue = /*#__PURE__*/ Fn(
  ({ min, max, stream = 42 }: { min: Node<'float'>; max: Node<'float'>; stream?: number }) => {
    return hash(instanceIndex.add(stream)).mul(max.sub(min)).add(min);
  },
);

// Standard normal via Box–Muller — call with two distinct streams
export const randNormal = /*#__PURE__*/ Fn(
  ({ streamA, streamB }: { streamA: number; streamB: number }) => {
    const u1 = hash(instanceIndex.add(streamA)).max(1e-7);
    const u2 = hash(instanceIndex.add(streamB));
    return u1.log().mul(-2).sqrt().mul(PI2.mul(u2).cos());
  },
);

// ---------------------------------------------------------------------------
// §2.4 simulation streams (mirror src/sim/model/hash.ts line by line)
// ---------------------------------------------------------------------------

/**
 * One raw PCG RXS-M-XS round (u32 → u32), replicating three r185 Hash.js
 * exactly (state/word/result), minus the final toFloat scaling. Needed
 * explicitly because TSL `hash()` scales to [0,1), which is not re-seedable.
 */
const pcgRound = /*#__PURE__*/ Fn(([s]: [Scalar]) => {
  const state = toUint(s).mul(uint(747796405)).add(uint(2891336453));
  const word = state
    .shiftRight(state.shiftRight(uint(28)).add(uint(4)))
    .bitXor(state)
    .mul(uint(277803737));
  return word.shiftRight(uint(22)).bitXor(word);
});

/**
 * Per-(path, step) u32 seed.
 * Mirrors `stepSeedU(pathIndex, step, seed)` in hash.ts.
 * `hash()` begins with `seed.toUint()`, so feeding a u32 seed is exactly
 * the integer-seeded case of three's hash — no float rounding anywhere.
 *
 * AMENDMENT A3 (docs/CONTRACTS.md §10): the user seed passes through ONE
 * pcgRound before mixing — seeds a multiple of STEP_STRIDE apart (e.g. 42
 * vs 522) previously reused the whole ensemble shifted by one path
 * (999/999 measured lane collisions). Bit-exact with hash.ts stepSeedU.
 */
export const stepSeed = /*#__PURE__*/ Fn(([pathIdx, step, seed]: [Scalar, Scalar, Scalar]) => {
  return toUint(pathIdx).mul(uint(STEP_STRIDE)).add(toUint(step)).add(pcgRound(seed));
});

/**
 * Strengthened stream hash ∈ [0, 1): TWO chained PCG rounds.
 * Mirrors `streamHash(seedU)` in hash.ts — see that file for the measured
 * justification (single round fails the §2.6 variance gate by +1.03%;
 * two rounds: +0.37%, within estimator noise). Bit-exact CPU↔GPU.
 */
export const streamHashTsl = /*#__PURE__*/ Fn(([seedU]: [Scalar]) => {
  return float(pcgRound(pcgRound(seedU))).mul(1 / 2 ** 32);
});

/**
 * Stream-j uniform: streamHash(seedU + j·GOLDEN_U32) ∈ [0, 1).
 * Mirrors `streamUniform(seedU, j)` in hash.ts.
 */
export const streamUniformTsl = /*#__PURE__*/ Fn(([seedU, j]: [Scalar, Scalar | number]) => {
  return streamHashTsl(toUint(seedU).add(toUint(j).mul(uint(GOLDEN_U32))));
});

/**
 * Standard normal via Box–Muller from stream pair j (cosine half, same
 * formula as §3.3's randNormal). Mirrors `streamNormal(seedU, j)` in hash.ts.
 */
export const streamNormalTsl = /*#__PURE__*/ Fn(([seedU, j]: [Scalar, Scalar | number]) => {
  const jj = toUint(j);
  const u1 = streamUniformTsl(seedU, jj.mul(uint(2))).max(1e-7);
  const u2 = streamUniformTsl(seedU, jj.mul(uint(2)).add(uint(1)));
  return u1.log().mul(-2).sqrt().mul(PI2.mul(u2).cos());
});

/**
 * Student-t innovation, ν = 5, scaled to unit variance (spec §2.2 Model C).
 * T = Z / sqrt(V/ν), V = Σ Nₖ² ~ χ²₅, unit-variance scale sqrt((ν−2)/ν).
 * Mirrors `streamStudentT5(seedU)` in hash.ts — consumes stream pairs 0..5.
 * All accumulators are `.toVar()`-bound per §3.8 trap 2.
 */
export const studentT5 = /*#__PURE__*/ Fn(([seedU]: [Scalar]) => {
  const z = float(0).toVar();
  const v = float(0).toVar();
  Loop(STUDENT_T_NU + 1, ({ i }) => {
    const n = streamNormalTsl(seedU, i);
    If(i.equal(0), () => {
      z.assign(n);
    }).Else(() => {
      v.addAssign(n.mul(n));
    });
  });
  return z
    .mul(float(STUDENT_T_NU).div(v.max(1e-12)).sqrt())
    .mul(Math.sqrt((STUDENT_T_NU - 2) / STUDENT_T_NU));
});

/**
 * Model B block draw: uniform block index (uint) in [0, blockCount).
 * Consumed only when step % BLOCK_LENGTH === 0.
 * Mirrors `drawBlockIndex(seedU, blockCount)` in hash.ts.
 */
export const drawBlockIndexTsl = /*#__PURE__*/ Fn(([seedU, blockCount]: [Scalar, Scalar]) => {
  const u = streamHashTsl(toUint(seedU).add(uint(STREAM_BLOCK_U32)));
  const count = float(blockCount);
  return u.mul(count).floor().min(count.sub(1)).toUint();
});
