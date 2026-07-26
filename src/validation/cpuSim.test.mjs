/**
 * cpuSim.test.mjs — Agent 2 gate tests (spec §4.2 acceptance, R3, §2.6).
 *
 * Plain ESM, zero test-framework deps. Run via:
 *   npm run test:sim     (esbuild bundle → node; node_modules/.bin/esbuild)
 *
 * Covers:
 *  a. Determinism (R3): cpuSim twice, seed=42 → byte-identical stats.
 *  b. GBM analytic check (§2.6): E/Var[ln W_T] within ±1% at 100k paths.
 *  c. Hash sanity (§2.4/§3.8.6): deterministic, [0,1), χ²-uniform over 10⁶,
 *     golden vectors pinned against the three r185 Hash.js port.
 *  d. Bootstrap mechanics (§2.2 Model B): block boundaries, consumption
 *     order, indexing — small synthetic blocks.
 *  e. Failure semantics (§2.3): absorbing state, clamp, step recording.
 *  f. pathHistory (AMENDMENT A1, CONTRACTS §9): slot math, snapshot values,
 *     failure-slot semantics, R3 determinism of the history.
 */
import { runCpuSim, worstDecileTailMean, quantile } from '../sim/fallback/cpuSim.ts';
import {
  hashU32,
  streamHash,
  stepSeedU,
  streamUniform,
  drawBlockIndex,
  STREAM_BLOCK_U32,
  GOLDEN_U32,
} from '../sim/model/hash.ts';
import { BLOCK_LENGTH, glidepathMix } from '../sim/model/returnModels.ts';
import { makeSyntheticBondBlocks } from '../sim/model/bootstrap.ts';
import {
  SNAP_MAX,
  SNAP_STRIDE,
  snapStrideForSteps,
  snapCountForSteps,
  historySlot,
  validSnapCount,
} from '../sim/model/history.ts';

// --------------------------------------------------------------------------
// tiny harness
// --------------------------------------------------------------------------
let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const approx = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

const BASE = {
  model: 'gbm',
  pathCount: 10_000,
  horizonYears: 30,
  retireYear: 0,
  initialWealth: 1_000_000,
  contribution: 2_000,
  withdrawal: 5_000,
  mu: 0.07,
  sigma: 0.15,
  glidepath: null,
  seed: 42,
};
const NOW = () => 1_700_000_000_000; // fixed clock → deterministic computedAt

// --------------------------------------------------------------------------
// c. hash sanity (run first — everything else builds on it)
// --------------------------------------------------------------------------
console.log('\n[c] hash sanity');
{
  // determinism + golden vectors (three r185 src/nodes/math/Hash.js port)
  const golden = [
    [0, 0.030199997127056122],
    [1, 0.6591631174087524],
    [42, 0.28497618436813354],
    [0xdeadbeef, 0.4029785096645355],
    [0xffffffff, 0.8990827202796936],
  ];
  for (const [seed, expect] of golden) {
    const got = hashU32(seed);
    check(`hashU32(${seed}) golden`, got === expect, `got ${got}, want ${expect}`);
    check(`hashU32(${seed}) deterministic`, hashU32(seed) === got);
  }
  // AMENDMENT A3: stepSeedU goldens REGENERATED from the CPU implementation
  // after the seed decorrelation fix (the user seed is folded through one
  // raw PCG round before mixing — the old "+ seed" goldens 42 / 480000041
  // are superseded). hashU32 goldens above still pin the verbatim PCG port.
  check('stepSeedU(0,0,42) === 1223963391 (A3: pcg-folded seed)', stepSeedU(0, 0, 42) === 1223963391);
  check(
    'stepSeedU(999999,479,42) === 1703963390 (A3, u32-exact, no f32 collapse)',
    stepSeedU(999999, 479, 42) === 1703963390,
  );
  check(
    'streamUniform uses GOLDEN_U32 stride over streamHash',
    streamUniform(7, 1) === streamHash((7 + GOLDEN_U32) >>> 0),
  );
  check(
    'drawBlockIndex uses STREAM_BLOCK_U32 over streamHash',
    drawBlockIndex(7, 10) ===
      Math.min(Math.floor(streamHash((7 + STREAM_BLOCK_U32) >>> 0) * 10), 9),
  );
  check(
    'streamHash deterministic + in range',
    streamHash(123) === streamHash(123) && streamHash(123) >= 0 && streamHash(123) < 1,
  );

  // range + χ² uniformity over 10⁶ samples, 100 buckets
  const N = 1_000_000;
  const B = 100;
  const buckets = new Float64Array(B);
  let min = 1;
  let max = 0;
  for (let i = 0; i < N; i++) {
    const u = hashU32(i);
    if (u < min) min = u;
    if (u > max) max = u;
    buckets[Math.min(Math.floor(u * B), B - 1)]++;
  }
  check('hash range ⊂ [0,1)', min >= 0 && max < 1, `min ${min} max ${max}`);
  const expectPer = N / B;
  let chi2 = 0;
  for (let b = 0; b < B; b++) chi2 += ((buckets[b] - expectPer) ** 2) / expectPer;
  // dof=99; 5σ-ish gate ≈ 99 + 5·√198 ≈ 169.4 (p ≈ 0.999 quantile ~148)
  check('hash χ² uniformity (10⁶ samples)', chi2 < 170, `χ²=${chi2.toFixed(1)}`);
}

// --------------------------------------------------------------------------
// a. determinism (R3)
// --------------------------------------------------------------------------
console.log('\n[a] determinism (R3)');
{
  const r1 = runCpuSim(BASE, { now: NOW });
  const r2 = runCpuSim(BASE, { now: NOW });
  check(
    'stats identical (JSON, incl. computedAt via fixed clock)',
    JSON.stringify(r1.stats) === JSON.stringify(r2.stats),
  );
  check(
    'terminalWealth byte-identical',
    Buffer.from(r1.terminalWealth.buffer).equals(Buffer.from(r2.terminalWealth.buffer)),
  );
  check(
    'failureStep byte-identical',
    Buffer.from(r1.failureStep.buffer).equals(Buffer.from(r2.failureStep.buffer)),
  );
  // 6+ decimals on success rate explicitly (R3 acceptance wording)
  check(
    'successRate equal to 6+ decimals',
    r1.stats.successRate.toFixed(6) === r2.stats.successRate.toFixed(6),
    `${r1.stats.successRate} vs ${r2.stats.successRate}`,
  );
}

// --------------------------------------------------------------------------
// b. GBM analytic check (§2.6) — 100k paths, pure accumulation, no cash flows
//    W_T = W0·exp(Σ r_t) ⇒ ln W_T ~ N(ln W0 + (μ−σ²/2)·T, σ²·T)
// --------------------------------------------------------------------------
console.log('\n[b] GBM analytic moments (§2.6, 100k paths)');
{
  const W0 = 1_000_000;
  const T = 30;
  const params = {
    ...BASE,
    pathCount: 100_000,
    retireYear: T, // all accumulation ⇒ no failure clamping
    contribution: 0,
    withdrawal: 0,
    initialWealth: W0,
  };
  const { terminalWealth } = runCpuSim(params, { now: NOW });
  let mean = 0;
  const logs = new Float64Array(terminalWealth.length);
  for (let i = 0; i < terminalWealth.length; i++) logs[i] = Math.log(terminalWealth[i]);
  for (const x of logs) mean += x;
  mean /= logs.length;
  let varSum = 0;
  for (const x of logs) varSum += (x - mean) ** 2;
  const variance = varSum / (logs.length - 1);

  const expectMean = Math.log(W0) + (params.mu - 0.5 * params.sigma ** 2) * T;
  const expectVar = params.sigma ** 2 * T;
  console.log(`    E[ln W_T]  = ${mean.toFixed(6)}  (analytic ${expectMean.toFixed(6)})`);
  console.log(`    Var[ln W_T]= ${variance.toFixed(6)}  (analytic ${expectVar.toFixed(6)})`);
  check('E[ln W_T] within ±1% of analytic', approx(mean, expectMean, 0.01),
    `got ${mean}, want ${expectMean}`);
  check('Var[ln W_T] within ±1% of analytic', approx(variance, expectVar, 0.01),
    `got ${variance}, want ${expectVar}`);
}

// --------------------------------------------------------------------------
// d. bootstrap mechanics (§2.2 Model B)
// --------------------------------------------------------------------------
console.log('\n[d] bootstrap mechanics');
{
  // d1: single block ⇒ every path consumes data[m % 12] in order, with a
  // nonzero contribution so ORDER within the block matters (month-end cash).
  const oneBlock = new Float32Array(BLOCK_LENGTH);
  for (let m = 0; m < BLOCK_LENGTH; m++) oneBlock[m] = 0.01 * (m + 1); // 1%..12%
  const p1 = {
    ...BASE,
    model: 'bootstrap',
    pathCount: 10_000,
    horizonYears: 2,
    retireYear: 2, // accumulation only ⇒ no failure path
    initialWealth: 1_000,
    contribution: 100,
    withdrawal: 0,
  };
  const r1 = runCpuSim(p1, { bootstrapData: oneBlock, now: NOW });
  // hand-computed expected wealth (identical for every path)
  let w = p1.initialWealth;
  for (let t = 0; t < 24; t++) w = w * (1 + oneBlock[t % BLOCK_LENGTH]) + p1.contribution;
  let d1OK = true;
  for (let i = 0; i < r1.terminalWealth.length; i++) {
    if (Math.abs(r1.terminalWealth[i] - w) > Math.abs(w) * 1e-6) {
      d1OK = false;
      break;
    }
  }
  check('single-block consumption order exact (10k paths)', d1OK,
    `expected ${w}, got ${r1.terminalWealth[0]}`);

  // d2: 3 blocks, shadow-sim every path's block draws via exported
  // drawBlockIndex/stepSeedU — verifies boundary draws (step%12==0) and
  // per-path block indexing. Order matters (contribution ≠ 0).
  const data3 = new Float32Array(3 * BLOCK_LENGTH);
  for (let b = 0; b < 3; b++)
    for (let m = 0; m < BLOCK_LENGTH; m++) data3[b * BLOCK_LENGTH + m] = 0.02 * (b + 1) - 0.01 * m;
  const p2 = {
    ...BASE,
    model: 'bootstrap',
    pathCount: 1_000,
    horizonYears: 3,
    retireYear: 3,
    initialWealth: 500,
    contribution: 7,
    withdrawal: 0,
  };
  const r2 = runCpuSim(p2, { bootstrapData: data3, now: NOW });
  let d2OK = true;
  const steps = 36;
  for (let i = 0; i < p2.pathCount && d2OK; i++) {
    let sw = p2.initialWealth;
    let base = 0;
    for (let t = 0; t < steps; t++) {
      if (t % BLOCK_LENGTH === 0) {
        base = drawBlockIndex(stepSeedU(i, t, p2.seed >>> 0), 3) * BLOCK_LENGTH;
        if (base % BLOCK_LENGTH !== 0 || base < 0 || base >= 3 * BLOCK_LENGTH) {
          d2OK = false;
          break;
        }
      }
      sw = sw * (1 + data3[base + (t % BLOCK_LENGTH)]) + p2.contribution;
    }
    if (Math.abs(r2.terminalWealth[i] - sw) > Math.abs(sw) * 1e-6) d2OK = false;
  }
  check('block draws at 12-boundaries + per-path indexing (1k paths × 36 mo)', d2OK);
}

// --------------------------------------------------------------------------
// e. failure semantics (§2.3)
// --------------------------------------------------------------------------
console.log('\n[e] failure semantics');
{
  // e1: deterministic depletion — σ=0 ⇒ r=0 exactly, withdraw 500/mo on 1000:
  // step0 → 500, step1 → 0, step2 → −500 < 0 ⇒ fail at step 2, clamp 0.
  const p1 = {
    ...BASE,
    model: 'gbm',
    mu: 0,
    sigma: 0,
    pathCount: 10_000,
    horizonYears: 1,
    retireYear: 0,
    initialWealth: 1_000,
    contribution: 0,
    withdrawal: 500,
  };
  const r1 = runCpuSim(p1, { now: NOW });
  check('e1 successRate = 0', r1.stats.successRate === 0, `${r1.stats.successRate}`);
  let e1a = true;
  for (let i = 0; i < p1.pathCount; i++) {
    if (r1.failureStep[i] !== 2 || r1.terminalWealth[i] !== 0) {
      e1a = false;
      break;
    }
  }
  check('e1 failureStep = 2, wealth clamped to 0 (all paths)', e1a);
  check('e1 medianFailureYear = 2/12', r1.stats.medianFailureYear === 2 / 12,
    `${r1.stats.medianFailureYear}`);
  check('e1 maxDD = 1 after ruin', r1.stats.worstDecileMaxDD === 1,
    `${r1.stats.worstDecileMaxDD}`);

  // e2: no failure during accumulation even though wealth would go negative
  // only in retirement: retireYear=1 ⇒ failureStep must be exactly 12
  // (first retirement month), never < 12.
  const p2 = { ...p1, horizonYears: 2, retireYear: 1, initialWealth: 100, withdrawal: 10_000 };
  const r2 = runCpuSim(p2, { now: NOW });
  let e2 = true;
  for (let i = 0; i < p2.pathCount; i++) {
    if (r2.failureStep[i] !== 12) {
      e2 = false;
      break;
    }
  }
  check('e2 failure only in retirement (failureStep = 12, never < 12)', e2);

  // e3: sustainable withdrawal ⇒ never fails, absorbing gate never trips.
  const p3 = { ...p1, horizonYears: 30, withdrawal: 1 };
  const r3 = runCpuSim(p3, { now: NOW });
  check('e3 successRate = 1', r3.stats.successRate === 1);
  check('e3 medianFailureYear = null', r3.stats.medianFailureYear === null);
  let e3 = true;
  for (let i = 0; i < p3.pathCount; i++) {
    if (r3.failureStep[i] !== -1 || r3.terminalWealth[i] !== 1000 - 360 * 1) {
      e3 = false;
      break;
    }
  }
  check('e3 failureStep = −1, wealth = 1000 − 360·1 (no clamping)', e3,
    `${r3.terminalWealth[0]}`);
}

// --------------------------------------------------------------------------
// f. pathHistory decimated trajectory buffer (AMENDMENT A1, CONTRACTS §9)
// --------------------------------------------------------------------------
console.log('\n[f] pathHistory (AMENDMENT A1)');
{
  // f0: slot math (CONTRACTS §9 addressing; AMENDMENT A2: SNAP_MAX 40 → 32
  // so the 1M-path binding fits the spec-default 128 MiB storage limit, and
  // the stride is horizon-adaptive to still cover the 40y max horizon).
  check('f0 SNAP_MAX = 32, SNAP_STRIDE = 12 (A2)', SNAP_MAX === 32 && SNAP_STRIDE === 12);
  check('f0 A2 memory: 1M×32×4 B = 128 MB < 134,217,728 B default limit',
    1_000_000 * SNAP_MAX * 4 === 128_000_000 && 128_000_000 < 134_217_728);
  check('f0 snapStrideForSteps: 360→12, 372→12 (≤31y keeps yearly)',
    snapStrideForSteps(360) === 12 && snapStrideForSteps(372) === 12);
  check('f0 snapStrideForSteps: 384→13, 480→16 (>31y adaptive)',
    snapStrideForSteps(384) === 13 && snapStrideForSteps(480) === 16);
  check('f0 snapCountForSteps(360) = 31 (30y)', snapCountForSteps(360) === 31);
  check('f0 snapCountForSteps(480) = 31 (40y, stride 16 — grid lands on horizon)',
    snapCountForSteps(480) === 31 && snapCountForSteps(480, 16) === 31);
  check('f0 snapCountForSteps(12) = 2, (11) = 1, (30) = 3',
    snapCountForSteps(12) === 2 && snapCountForSteps(11) === 1 && snapCountForSteps(30) === 3);
  check('f0 GPU slot math historySlot(i,s) = i*SNAP_MAX + s',
    historySlot(7, 3) === 7 * SNAP_MAX + 3 && historySlot(999999, 31) === 999999 * 32 + 31);
  check('f0 validSnapCount: active = snapCount', validSnapCount(-1, 360) === 31);
  check('f0 validSnapCount: failed f=25 → floor(25/12)+2 = 4', validSnapCount(25, 60) === 4);
  check('f0 validSnapCount: failed on snapshot step f=11 → 2', validSnapCount(11, 12) === 2);
  check('f0 validSnapCount: capped at snapCount', validSnapCount(479, 480) === 31);

  // f1: snapshot values match the wealth path at snapshot steps (deterministic
  // accumulation: μ=σ=0 ⇒ gross = 1 exactly, w(t) = 1000 + 100·(t+1)).
  const p1 = {
    ...BASE,
    mu: 0, sigma: 0,
    pathCount: 1_000,
    horizonYears: 3,
    retireYear: 3, // accumulation only
    initialWealth: 1_000,
    contribution: 100,
    withdrawal: 0,
  };
  const r1 = runCpuSim(p1, { now: NOW, includeHistory: true });
  const sc1 = snapCountForSteps(36); // 4
  check('f1 history present, run-sized (n × snapCount)',
    r1.history instanceof Float32Array && r1.history.length === 1000 * sc1);
  let f1OK = sc1 === 4;
  for (let i = 0; i < 10 && f1OK; i++) {
    for (let s = 0; s < sc1; s++) {
      const want = s === 0 ? 1000 : 1000 + 100 * (12 * s); // end of month 12s
      if (r1.history[i * sc1 + s] !== want) f1OK = false;
    }
  }
  check('f1 snapshots 0..3 = initial / yearly wealth exactly', f1OK,
    `got [${Array.from(r1.history.slice(0, 4)).join(', ')}]`);

  // f2: final snapshot equals terminalWealth when the horizon is whole years
  // (GBM, stochastic — exact f32 equality, same value stored twice).
  const p2 = { ...BASE, pathCount: 1_000, horizonYears: 2, retireYear: 2, contribution: 0, withdrawal: 0 };
  const r2 = runCpuSim(p2, { now: NOW, includeHistory: true });
  const sc2 = snapCountForSteps(24); // 3
  let f2OK = sc2 === 3;
  for (let i = 0; i < p2.pathCount && f2OK; i++) {
    if (r2.history[i * sc2 + (sc2 - 1)] !== r2.terminalWealth[i]) f2OK = false;
  }
  check('f2 snapshot(terminal year) === terminalWealth (1k GBM paths)', f2OK);

  // f3: mid-period failure — deterministic depletion failing at f=25
  // (w(t) = 1000 − 40·(t+1); w(24) = 0 ≥ 0, w(25) = −40 < 0 ⇒ fail).
  const p3 = {
    ...BASE,
    mu: 0, sigma: 0,
    pathCount: 100,
    horizonYears: 5,
    retireYear: 0,
    initialWealth: 1_000,
    contribution: 0,
    withdrawal: 40,
  };
  const r3 = runCpuSim(p3, { now: NOW, includeHistory: true });
  const sc3 = snapCountForSteps(60); // 6
  const expect3 = [1000, 520, 40, 0, 0, 0]; // s0, s1(t=11), s2(t=23), failure slot 3, trailing zeros
  let f3OK = true;
  for (let i = 0; i < p3.pathCount && f3OK; i++) {
    if (r3.failureStep[i] !== 25) f3OK = false;
    for (let s = 0; s < sc3; s++) {
      if (r3.history[i * sc3 + s] !== expect3[s]) f3OK = false;
    }
  }
  check('f3 failure slot floor(25/12)+1 = 3 holds post-clamp 0; trailing slots 0', f3OK,
    `got [${Array.from(r3.history.slice(0, sc3)).join(', ')}], failureStep ${r3.failureStep[0]}`);
  check('f3 validSnapCount(25) = 4 matches the written slots', validSnapCount(25, 60) === 4);

  // f4: failure exactly ON a snapshot step — the regular write records the
  // post-clamp 0 (w(10) = 65 ≥ 0, w(11) = −20 < 0 ⇒ f = 11, (f+1)%12 == 0).
  const p4 = { ...p3, horizonYears: 1, withdrawal: 85 };
  const r4 = runCpuSim(p4, { now: NOW, includeHistory: true });
  const sc4 = snapCountForSteps(12); // 2
  let f4OK = sc4 === 2;
  for (let i = 0; i < p4.pathCount && f4OK; i++) {
    if (r4.failureStep[i] !== 11) f4OK = false;
    if (r4.history[i * sc4] !== 1000 || r4.history[i * sc4 + 1] !== 0) f4OK = false;
  }
  check('f4 failure on snapshot step: snapshot records post-clamp 0 (no extra slot)', f4OK,
    `got [${Array.from(r4.history.slice(0, sc4)).join(', ')}], failureStep ${r4.failureStep[0]}`);

  // f5: history determinism (R3 extended to the amendment)
  const r5a = runCpuSim(BASE, { now: NOW, includeHistory: true });
  const r5b = runCpuSim(BASE, { now: NOW, includeHistory: true });
  check('f5 history byte-identical across runs (R3)',
    Buffer.from(r5a.history.buffer).equals(Buffer.from(r5b.history.buffer)));
  check('f5 history absent by default',
    runCpuSim(BASE, { now: NOW }).history === undefined);

  // f6: AMENDMENT A2 adaptive stride — 40y horizon → stride 16 → 31
  // snapshots; the grid lands exactly on the horizon (480 % 16 === 0), so
  // the last snapshot equals terminalWealth. Deterministic accumulation:
  // μ=σ=0 ⇒ w(t) = 1000 + 100·(t+1); snapshot s = end of month 16s.
  const p6 = {
    ...BASE,
    mu: 0, sigma: 0,
    pathCount: 100,
    horizonYears: 40,
    retireYear: 40, // accumulation only
    initialWealth: 1_000,
    contribution: 100,
    withdrawal: 0,
  };
  const r6 = runCpuSim(p6, { now: NOW, includeHistory: true });
  const sc6 = snapCountForSteps(480); // 31 at stride 16
  let f6OK = sc6 === 31 && r6.history instanceof Float32Array
    && r6.history.length === p6.pathCount * sc6;
  for (let i = 0; i < p6.pathCount && f6OK; i++) {
    for (let s = 0; s < sc6; s++) {
      const want = s === 0 ? 1000 : 1000 + 100 * (16 * s); // end of month 16s
      if (r6.history[i * sc6 + s] !== want) f6OK = false;
    }
    if (r6.history[i * sc6 + (sc6 - 1)] !== r6.terminalWealth[i]) f6OK = false;
  }
  check('f6 A2: 40y → stride 16, 31 snapshots, last === terminalWealth', f6OK,
    `snapCount ${sc6}, got [${r6.history ? Array.from(r6.history.slice(0, 3)).join(', ') : 'none'}]`);

  // f6b: mid-period failure under the adaptive stride — same depletion as
  // f3 but on a 40y horizon (stride 16): w(t) = 1000 − 40·(t+1) ⇒ fail at
  // f = 25; failure slot = floor(25/16)+1 = 2 holds the post-clamp 0.
  const p6b = { ...p3, horizonYears: 40 };
  const r6b = runCpuSim(p6b, { now: NOW, includeHistory: true });
  const sc6b = snapCountForSteps(480); // 31
  let f6bOK = sc6b === 31;
  for (let i = 0; i < p6b.pathCount && f6bOK; i++) {
    if (r6b.failureStep[i] !== 25) f6bOK = false;
    if (r6b.history[i * sc6b] !== 1000) f6bOK = false; // snapshot 0
    if (r6b.history[i * sc6b + 1] !== 1000 - 40 * 16) f6bOK = false; // s1 = month 16
    for (let s = 2; s < sc6b; s++) {
      if (r6b.history[i * sc6b + s] !== 0) f6bOK = false; // failure slot + trailing zeros
    }
  }
  check('f6b A2: failure slot floor(25/16)+1 = 2 holds post-clamp 0; trailing 0', f6bOK,
    `got [${r6b.history ? Array.from(r6b.history.slice(0, 4)).join(', ') : 'none'}], failureStep ${r6b.failureStep[0]}`);
  check('f6b validSnapCount(25, 480) = 3 matches the written slots (stride 16)',
    validSnapCount(25, 480) === 3);
}

// --------------------------------------------------------------------------
// g. AMENDMENT A3 — real glidepath: equity/bond mixing (M1)
// --------------------------------------------------------------------------
console.log('\n[g] A3 glidepath — equity/bond mixing (Model B + Models A/C)');
{
  const SYNE = new Float32Array(4 * BLOCK_LENGTH);
  for (let b = 0; b < 4; b++)
    for (let m = 0; m < BLOCK_LENGTH; m++) SYNE[b * BLOCK_LENGTH + m] = 0.03 * (b + 1) - 0.008 * m;
  const SYNB = new Float32Array(4 * BLOCK_LENGTH);
  for (let b = 0; b < 4; b++)
    for (let m = 0; m < BLOCK_LENGTH; m++) SYNB[b * BLOCK_LENGTH + m] = 0.004 * (b + 1) - 0.001 * m;

  const glideBase = {
    ...BASE,
    model: 'bootstrap',
    pathCount: 1_000,
    horizonYears: 30,
    retireYear: 10,
    initialWealth: 650_000,
    contribution: 2_500,
    withdrawal: 4_500,
    glidepath: { start: 0.9, end: 0.6 },
  };

  // g1: glidepath under bootstrap is NOT a no-op (pre-A3 bug C1: output was
  // byte-identical with glidepath on/off).
  const gOn = runCpuSim(glideBase, { bootstrapData: SYNE, bondBlocks: SYNB, now: NOW });
  const gOff = runCpuSim(
    { ...glideBase, glidepath: null },
    { bootstrapData: SYNE, bondBlocks: SYNB, now: NOW },
  );
  check(
    'g1 bootstrap glidepath changes terminal wealth (not byte-identical)',
    !Buffer.from(gOn.terminalWealth.buffer).equals(Buffer.from(gOff.terminalWealth.buffer)),
  );
  check(
    'g1 bootstrap glidepath changes the stats',
    JSON.stringify(gOn.stats) !== JSON.stringify(gOff.stats),
  );

  // g2: shadow-sim lockstep — gross = 1 + A(t)·r_e + (1−A(t))·r_b from the
  // SAME drawn block, with A(t) = glidepathMix (lerp over [0, retireStep]).
  const steps = 360;
  const retireStep = 120;
  let g2OK = true;
  for (let i = 0; i < 1_000 && g2OK; i++) {
    let sw = glideBase.initialWealth;
    let base = 0;
    for (let t = 0; t < steps; t++) {
      const seedU = stepSeedU(i, t, glideBase.seed >>> 0);
      if (t % BLOCK_LENGTH === 0) {
        base = drawBlockIndex(seedU, 4) * BLOCK_LENGTH;
      }
      const A = glidepathMix(t, retireStep, 0.9, 0.6);
      const idx = base + (t % BLOCK_LENGTH);
      const gross = A * SYNE[idx] + (1 - A) * SYNB[idx] + 1;
      const cf = t < retireStep ? glideBase.contribution : -glideBase.withdrawal;
      sw = sw * gross + cf;
      if (t >= retireStep && sw < 0) sw = 0; // absorbing clamp (shadow only)
    }
    const got = gOn.terminalWealth[i];
    if (Math.abs(got - sw) > Math.max(1, Math.abs(sw)) * 1e-5) g2OK = false;
  }
  check('g2 A(t)·equity + (1−A(t))·bond shadow sim matches (1k paths × 360 mo)', g2OK,
    `path0 got ${gOn.terminalWealth[0]}`);

  // g3: A = 0.5 constant — mean gross equals the 50/50 blend mean exactly
  // (accumulation-only, W0 = 1 ⇒ terminalWealth = Π gross).
  const half = {
    ...BASE,
    model: 'bootstrap',
    pathCount: 1_000,
    horizonYears: 3,
    retireYear: 3, // accumulation only
    initialWealth: 1,
    contribution: 0,
    withdrawal: 0,
    glidepath: { start: 0.5, end: 0.5 },
  };
  const rHalf = runCpuSim(half, { bootstrapData: SYNE, bondBlocks: SYNB, now: NOW });
  let g3OK = true;
  for (let i = 0; i < 1_000 && g3OK; i++) {
    let sw = 1;
    let base = 0;
    for (let t = 0; t < 36; t++) {
      if (t % BLOCK_LENGTH === 0) base = drawBlockIndex(stepSeedU(i, t, half.seed >>> 0), 4) * BLOCK_LENGTH;
      const idx = base + (t % BLOCK_LENGTH);
      sw *= 0.5 * (1 + SYNE[idx]) + 0.5 * (1 + SYNB[idx]);
    }
    if (Math.abs(rHalf.terminalWealth[i] - sw) > Math.abs(sw) * 1e-6) g3OK = false;
  }
  check('g3 A=0.5 terminal wealth = Π [0.5·(1+r_e) + 0.5·(1+r_b)] exactly', g3OK);

  // g4: determinism preserved with the glidepath on (R3).
  const gDet = runCpuSim(glideBase, { bootstrapData: SYNE, bondBlocks: SYNB, now: NOW });
  check(
    'g4 same seed ⇒ byte-identical terminal wealth with glidepath (R3)',
    Buffer.from(gOn.terminalWealth.buffer).equals(Buffer.from(gDet.terminalWealth.buffer)),
  );

  // g5: bootstrap + glidepath without bond data refuses to run (fail loud).
  let threw = false;
  try {
    runCpuSim(glideBase, { bootstrapData: SYNE, now: NOW });
  } catch (e) {
    threw = /bond block data/.test(String(e));
  }
  check('g5 bootstrap + glidepath without bondBlocks throws', threw);

  // g6: glidepath null ⇒ pure equity, byte-identical to omitting bond data.
  const gOffNoBonds = runCpuSim(
    { ...glideBase, glidepath: null },
    { bootstrapData: SYNE, now: NOW },
  );
  check(
    'g6 glidepath null ⇒ bond data irrelevant (pure equity, unchanged)',
    Buffer.from(gOff.terminalWealth.buffer).equals(Buffer.from(gOffNoBonds.terminalWealth.buffer)),
  );

  // g7: Models A/C blend — μ_blend = A·μ + (1−A)·0.019, σ_blend = A·σ.
  // σ = 0 collapses the stochastic term: gross = exp(μ_blend·Δt) exactly,
  // so terminal wealth is a closed-form product over A(t).
  const gbmBlend = {
    ...BASE,
    model: 'gbm',
    pathCount: 100,
    horizonYears: 2,
    retireYear: 1,
    initialWealth: 1_000,
    contribution: 0,
    withdrawal: 0,
    mu: 0.07,
    sigma: 0,
    glidepath: { start: 1.0, end: 0.5 },
  };
  const rBlend = runCpuSim(gbmBlend, { now: NOW });
  let sw7 = gbmBlend.initialWealth;
  for (let t = 0; t < 24; t++) {
    const A = glidepathMix(t, 12, 1.0, 0.5);
    const muB = 0.07 * A + (1 - A) * 0.019;
    sw7 *= Math.exp((muB - 0) / 12);
  }
  check('g7 GBM glidepath blend μ = A·μ + (1−A)·0.019 (σ=0 closed form)',
    approx(rBlend.terminalWealth[0], sw7, 1e-6), // f32 terminal storage
    `got ${rBlend.terminalWealth[0]}, want ${sw7}`);

  // g8: real data — the flagship preset no longer collapses to null glide.
  const syn = makeSyntheticBondBlocks(8);
  check('g8 synthetic bond blocks are month-aligned Float32Array',
    syn.length === 8 * BLOCK_LENGTH && syn instanceof Float32Array);
}

// --------------------------------------------------------------------------
// h. AMENDMENT A3 — worstDecileMaxDD tells the truth (M2)
// --------------------------------------------------------------------------
console.log('\n[h] A3 worst-decile max drawdown = conditional mean of deepest 10%');
{
  // Constructed distribution: 90% of paths at maxDD 0.05, 10% ruined (1.0).
  // Old semantics: quantile(asc, 0.1) = 0.05 (SHALLOWEST decile boundary).
  // New semantics: mean of the deepest 10% = 1.0.
  const dd = new Float64Array(1_000).fill(0.05);
  for (let i = 900; i < 1_000; i++) dd[i] = 1.0;
  dd.sort();
  const p10 = quantile(dd, 0.1);
  const tail = worstDecileTailMean(dd);
  check('h1 constructed: p10 = 0.05 (the old, misleading stat)', approx(p10, 0.05, 1e-12),
    `${p10}`);
  check('h1 constructed: worst-decile mean = 1.0 (the truthful stat)', tail === 1.0, `${tail}`);
  check('h1 the two differ materially', Math.abs(tail - p10) > 0.5);

  // Decile count: max(1, floor(n/10)) — tiny samples still get a tail.
  check('h2 n=1 → the single value', worstDecileTailMean([0.42]) === 0.42);
  check('h2 n=19 → floor(19/10)=1 deepest value', worstDecileTailMean(
    [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.9],
  ) === 0.9);

  // e1-style deterministic ruin still reports maxDD 1 (mean of an all-1 tail).
  const ruin = runCpuSim(
    { ...BASE, mu: 0, sigma: 0, pathCount: 1_000, horizonYears: 1, retireYear: 0, initialWealth: 1_000, contribution: 0, withdrawal: 500 },
    { now: NOW },
  );
  check('h3 total ruin ⇒ worstDecileMaxDD = 1', ruin.stats.worstDecileMaxDD === 1,
    `${ruin.stats.worstDecileMaxDD}`);

  // A no-failure GBM run: worst-decile mean ≥ p90 ≥ p10 (mean of deepest
  // tail dominates any single quantile below it).
  const calm = runCpuSim({ ...BASE, withdrawal: 1 }, { now: NOW });
  const ddSorted = Float64Array.from(calm.maxDrawdown).sort();
  const p90 = quantile(ddSorted, 0.9);
  check('h4 worst-decile mean ≥ p90 of max drawdown',
    calm.stats.worstDecileMaxDD >= p90 - 1e-12,
    `tail ${calm.stats.worstDecileMaxDD} vs p90 ${p90}`);
}

// --------------------------------------------------------------------------
// i. AMENDMENT A3 — seed-mixing decorrelation (M3)
// --------------------------------------------------------------------------
console.log('\n[i] A3 seed decorrelation (seeds 42 vs 522 = 42 + 480)');
{
  // Pre-A3, seeds differing by a multiple of STEP_STRIDE (480) reused the
  // whole ensemble shifted by one path (measured 999/999 lane collisions).
  const a = runCpuSim({ ...BASE, seed: 42 }, { now: NOW });
  const b = runCpuSim({ ...BASE, seed: 522 }, { now: NOW });
  // Failed paths clamp to $0 in BOTH ensembles by construction — only
  // non-zero terminal wealth can evidence stream reuse.
  let laneCollisions = 0;
  for (let i = 0; i < BASE.pathCount; i++) {
    if (a.terminalWealth[i] !== 0 && a.terminalWealth[i] === b.terminalWealth[i]) laneCollisions++;
  }
  check('i1 no lane-aligned identical paths across seeds 42/522', laneCollisions === 0,
    `${laneCollisions} collisions`);
  // …and no SHIFTED reuse either: seed-522 path i must not equal seed-42
  // path i+1 (the pre-A3 failure mode).
  let shifted = 0;
  for (let i = 0; i < BASE.pathCount - 1; i++) {
    if (b.terminalWealth[i] !== 0 && b.terminalWealth[i] === a.terminalWealth[i + 1]) shifted++;
  }
  check('i2 no shifted-ensemble reuse (b[i] ≠ a[i+1])', shifted === 0, `${shifted}`);
  check('i3 the two seeds produce different stats',
    JSON.stringify(a.stats) !== JSON.stringify(b.stats));
}

// --------------------------------------------------------------------------
// j. AMENDMENT A3 — magnitude-of-failure metrics (M4)
// --------------------------------------------------------------------------
console.log('\n[j] A3 magnitude of failure (medianShortfallYears / medianUnfundedObligation)');
{
  // j1: deterministic ruin — every path fails at step 2 of 12 (e1 setup):
  // shortfall = 12 − 2 = 10 months exactly ⇒ 10/12 years, 10 × $500.
  const ruin = runCpuSim(
    { ...BASE, mu: 0, sigma: 0, pathCount: 1_000, horizonYears: 1, retireYear: 0, initialWealth: 1_000, contribution: 0, withdrawal: 500 },
    { now: NOW },
  );
  check('j1 all fail at step 2 ⇒ medianShortfallYears = 10/12',
    ruin.magnitude.medianShortfallYears === 10 / 12,
    `${ruin.magnitude.medianShortfallYears}`);
  check('j1 medianUnfundedObligation = 10 × $500 = $5000',
    ruin.magnitude.medianUnfundedObligation === 5_000,
    `${ruin.magnitude.medianUnfundedObligation}`);
  check('j1 failedPaths = pathCount', ruin.magnitude.failedPaths === 1_000);

  // j2: no failures ⇒ nulls (the honest "nothing to report" state).
  const calm = runCpuSim({ ...BASE, withdrawal: 1 }, { now: NOW });
  check('j2 no failures ⇒ medianShortfallYears null',
    calm.magnitude.medianShortfallYears === null);
  check('j2 no failures ⇒ medianUnfundedObligation null',
    calm.magnitude.medianUnfundedObligation === null);
  check('j2 no failures ⇒ failedPaths 0', calm.magnitude.failedPaths === 0);

  // j3: stochastic run — fields consistent (obligation = shortfall × w) and
  // bounded by the horizon; deterministic across runs (R3).
  const m1 = runCpuSim({ ...BASE, withdrawal: 8_000 }, { now: NOW });
  const m2 = runCpuSim({ ...BASE, withdrawal: 8_000 }, { now: NOW });
  check('j3 obligation = shortfallMonths × withdrawal (consistency)',
    approx(
      m1.magnitude.medianUnfundedObligation,
      m1.magnitude.medianShortfallYears * 12 * 8_000,
      1e-12,
    ),
    `${m1.magnitude.medianUnfundedObligation}`);
  check('j3 shortfall within (0, horizonYears]',
    m1.magnitude.medianShortfallYears > 0 &&
      m1.magnitude.medianShortfallYears <= BASE.horizonYears,
    `${m1.magnitude.medianShortfallYears}`);
  check('j3 magnitude deterministic (R3)',
    JSON.stringify(m1.magnitude) === JSON.stringify(m2.magnitude));
}

// --------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
