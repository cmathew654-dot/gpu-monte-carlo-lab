/**
 * stats.test.mjs — Agent 3 tests (spec §4.3 acceptance: quantile extraction
 * + safe-withdrawal binary search, deterministic, no GPU required).
 *
 * Plain ESM, zero test-framework deps. Run via:
 *   npm run test:stats     (esbuild bundle → node)
 *
 * Covers:
 *  a. quantileFromHistogram on a synthetic histogram (exact hand-checks).
 *  b. Histogram→SimStats extraction vs runCpuSim's EXACT quantiles on the
 *     same paths (§2.6 tolerances: median ±1%, p5/p95 ±2%, success ±0.5pp).
 *  c. Failure-heavy bin-0 interpolation (linear from the true minimum).
 *  d. Packed stats buffer decode round trip (decodeStatsBuffer).
 *  e. Determinism (R3): same histograms → identical SimStats.
 *  f. findSafeWithdrawal: convergence on a monotonic mock runner, budget,
 *     bracket edge cases, and AbortSignal cancellation.
 *  g. findSafeWithdrawal driven by runCpuSim (spec §4.3 task 5 wiring,
 *     CPU mock) — converges within 8 iterations into the 90%±0.5pp band.
 */
import { runCpuSim } from '../fallback/cpuSim.ts';
import {
  WEALTH_BINS,
  DD_BINS,
  FAIL_BINS,
  STATS_UINTS,
  SLOT_MIN_WEALTH_BITS,
  SLOT_MAX_WEALTH_BITS,
  SLOT_FAILED_COUNT,
  SLOT_WEALTH_HIST,
  SLOT_DD_HIST,
  SLOT_FAIL_HIST,
  WEALTH_LOG_FLOOR,
  decodeStatsBuffer,
  quantileFromHistogram,
  buildHistogramsFromPaths,
  extractSimStats,
  extractMagnitudeStats,
  worstDecileMaxDdFromHistogram,
  _internals,
} from './cpuReference.ts';
import {
  findSafeWithdrawal,
  upperBoundForParams,
  SWR_MAX_ITERATIONS,
} from './safeWithdrawal.ts';

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
const NOW = () => 1_700_000_000_000;

// --------------------------------------------------------------------------
// a. quantileFromHistogram hand-checks
// --------------------------------------------------------------------------
console.log('\n[a] quantileFromHistogram');
{
  // 4 linear bins [0,1),[1,2),[2,3),[3,4) with counts 1,1,1,1 (N=4).
  const hist = [1, 1, 1, 1];
  const q = (p) => quantileFromHistogram(hist, 4, p, (b) => b, (b) => b + 1);
  check('p=0.5 → 2.0 (crossing at bin 2 left edge)', q(0.5) === 2.0);
  check('p=0.25 → 1.0', q(0.25) === 1.0);
  check('p=1 → 4 (right edge of last bin)', q(1) === 4);
  // All mass in one bin → linear interpolation inside it.
  const spike = [0, 10, 0, 0];
  const qs = quantileFromHistogram(spike, 10, 0.5, (b) => b * 10, (b) => (b + 1) * 10);
  check('single-bin p50 interpolates to midpoint', qs === 15, `got ${qs}`);
}

// --------------------------------------------------------------------------
// b. extraction vs exact CPU reference (§2.6 tolerances)
// --------------------------------------------------------------------------
console.log('\n[b] histogram extraction vs runCpuSim exact quantiles (10k, gbm, seed 42)');
{
  const ref = runCpuSim(BASE, { now: NOW });
  const data = buildHistogramsFromPaths(
    ref.terminalWealth,
    ref.maxDrawdown,
    ref.failureStep,
  );
  const stats = extractSimStats(data, { now: NOW });

  check(
    'successRate matches exactly (same failed paths)',
    approx(stats.successRate, ref.stats.successRate, 1e-12),
    `hist ${stats.successRate} vs exact ${ref.stats.successRate}`,
  );
  check(
    'p50 within ±1% (§2.6)',
    approx(stats.percentiles.p50, ref.stats.percentiles.p50, 0.01),
    `hist ${stats.percentiles.p50.toFixed(2)} vs exact ${ref.stats.percentiles.p50.toFixed(2)}`,
  );
  check(
    'p5 within ±2% (§2.6)',
    approx(stats.percentiles.p5, ref.stats.percentiles.p5, 0.02),
    `hist ${stats.percentiles.p5.toFixed(2)} vs exact ${ref.stats.percentiles.p5.toFixed(2)}`,
  );
  check(
    'p95 within ±2% (§2.6)',
    approx(stats.percentiles.p95, ref.stats.percentiles.p95, 0.02),
    `hist ${stats.percentiles.p95.toFixed(2)} vs exact ${ref.stats.percentiles.p95.toFixed(2)}`,
  );
  check(
    'p25/p75 within ±2%',
    approx(stats.percentiles.p25, ref.stats.percentiles.p25, 0.02) &&
      approx(stats.percentiles.p75, ref.stats.percentiles.p75, 0.02),
  );
  check(
    'worstDecileMaxDD (A3: worst-decile MEAN) within one DD bin (1/256)',
    Math.abs(stats.worstDecileMaxDD - ref.stats.worstDecileMaxDD) <= 1 / DD_BINS + 1e-9,
    `hist ${stats.worstDecileMaxDD} vs exact ${ref.stats.worstDecileMaxDD}`,
  );
  const mfyH = stats.medianFailureYear;
  const mfyR = ref.stats.medianFailureYear;
  check(
    'medianFailureYear within one month (1/12 y) or both null',
    (mfyH === null && mfyR === null) ||
      (mfyH !== null && mfyR !== null && Math.abs(mfyH - mfyR) <= 1 / 12 + 1e-9),
    `hist ${mfyH} vs exact ${mfyR}`,
  );
  check('safeWithdrawalRate is 0 (search layer owns it)', stats.safeWithdrawalRate === 0);
  check('computedAt uses injected clock', stats.computedAt === NOW());

  // e. determinism on the same payload
  const again = extractSimStats(data, { now: NOW });
  check(
    'deterministic: identical SimStats JSON (R3)',
    JSON.stringify(again) === JSON.stringify(stats),
  );
}

// --------------------------------------------------------------------------
// c. failure-heavy bin-0 interpolation
// --------------------------------------------------------------------------
console.log('\n[c] bin-0 linear interpolation with mass at $0');
{
  // 1000 paths: 600 failed (wealth 0), 400 uniform in [100, 1000].
  const n = 1000;
  const tw = new Float32Array(n);
  const dd = new Float32Array(n);
  const fs = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (i < 600) {
      tw[i] = 0;
      fs[i] = 12 + i; // arbitrary failure months
    } else {
      tw[i] = 100 + ((i - 600) / 399) * 900;
      fs[i] = -1;
    }
  }
  const data = buildHistogramsFromPaths(tw, dd, fs);
  check('bin 0 holds all 600 zero-wealth paths', data.wealthHist[0] === 600);
  check('minWealth is 0', data.minWealth === 0);
  const stats = extractSimStats(data, { now: NOW });
  check('successRate = 0.4', approx(stats.successRate, 0.4, 1e-12));
  // p50 target (500) falls inside the 600-strong exact-zero mass → exactly $0
  // (uniform-in-bin smear would wrongly lift it; parity with exact reference).
  check('p50 = $0 when zero-mass covers the quantile', stats.percentiles.p50 === 0);
  check('medianFailureYear present', stats.medianFailureYear !== null);

  // Interpolation path: 300 zeros + 300 sub-floor ($0.50, non-failed) +
  // 400 uniform in [100,1000] → bin 0 = 600, target 500 > zeros 300.
  const tw2 = new Float32Array(n);
  const dd2 = new Float32Array(n);
  const fs2 = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (i < 300) {
      tw2[i] = 0;
      fs2[i] = i;
    } else if (i < 600) {
      tw2[i] = 0.5;
      fs2[i] = -1;
    } else {
      tw2[i] = 100 + ((i - 600) / 399) * 900;
      fs2[i] = -1;
    }
  }
  const data2 = buildHistogramsFromPaths(tw2, dd2, fs2);
  check('bin 0 holds zeros + sub-floor mass', data2.wealthHist[0] === 600);
  const stats2 = extractSimStats(data2, { now: NOW });
  const step2 = Math.log(1000 / WEALTH_LOG_FLOOR) / WEALTH_BINS;
  const edge1 = Math.exp(step2); // logLo = log(1) = 0
  const expectedP50 = ((0.5 * n - 300) / (600 - 300)) * edge1;
  check(
    'p50 interpolates past the zero mass within bin 0',
    approx(stats2.percentiles.p50, expectedP50, 1e-9),
    `got ${stats2.percentiles.p50}, want ${expectedP50}`,
  );
}

// --------------------------------------------------------------------------
// d. packed buffer decode round trip
// --------------------------------------------------------------------------
console.log('\n[d] decodeStatsBuffer round trip');
{
  const raw = new Uint32Array(STATS_UINTS);
  raw[SLOT_MIN_WEALTH_BITS] = _internals.floatToBits(123.5);
  raw[SLOT_MAX_WEALTH_BITS] = _internals.floatToBits(9876.5);
  raw[SLOT_FAILED_COUNT] = 7;
  raw[SLOT_WEALTH_HIST + 3] = 100;
  raw[SLOT_DD_HIST + 9] = 50;
  raw[SLOT_FAIL_HIST + 24] = 7;
  const data = decodeStatsBuffer(raw);
  check('decode non-null', data !== null);
  check('min/max bits round-trip', data.minWealth === 123.5 && data.maxWealth === 9876.5);
  check('failedCount decoded', data.failedCount === 7);
  check('hist slices decoded', data.wealthHist[3] === 100 && data.ddHist[9] === 50 && data.failStepHist[24] === 7);
  check('totalPaths from wealth hist', data.totalPaths === 100);
  const pristine = new Uint32Array(STATS_UINTS);
  pristine[SLOT_MIN_WEALTH_BITS] = 0xffffffff;
  check('pristine buffer decodes to null', decodeStatsBuffer(pristine) === null);
}

// --------------------------------------------------------------------------
// f. findSafeWithdrawal — mock runners
// --------------------------------------------------------------------------
console.log('\n[f] findSafeWithdrawal (mock runners)');
{
  // Monotonic decreasing success rate: sr(w) = 1 - w/10000 → 90% at w=1000.
  const calls = [];
  const run = async (w) => {
    calls.push(w);
    return 1 - w / 10_000;
  };
  const res = await findSafeWithdrawal(run, { upperBound: 4_000 });
  check('converged inside the 90%±0.5pp band', res.converged);
  check('withdrawal ≈ 1000 (bracket midpoint)', approx(res.withdrawal, 1000, 0.01), `got ${res.withdrawal}`);
  check('success rate in [0.895, 0.905]', res.successRate >= 0.895 && res.successRate <= 0.905);
  check(
    '≤ 8 binary-search iterations (+2 bracket probes)',
    res.iterations <= SWR_MAX_ITERATIONS && calls.length <= SWR_MAX_ITERATIONS + 2,
    `iterations ${res.iterations}, calls ${calls.length}`,
  );

  // Unbounded high: always-safe runner → returns upper bound, unbounded.
  const resHi = await findSafeWithdrawal(async () => 0.99, { upperBound: 5_000 });
  check('always-safe → unbounded at upper bound', resHi.unbounded && resHi.withdrawal === 5_000);

  // Unbounded low: always-failing runner → 0.
  const resLo = await findSafeWithdrawal(async () => 0.5, { upperBound: 5_000 });
  check('always-failing → unbounded at 0', resLo.unbounded && resLo.withdrawal === 0);

  // Budget: runner that never lands in the band (oscillates across it).
  let calls2 = 0;
  const resBudget = await findSafeWithdrawal(
    async (w) => {
      calls2++;
      return w < 1234 ? 0.99 : 0.8; // step function jumping over the band
    },
    { upperBound: 4_000 },
  );
  check(
    'band-jumping runner exhausts budget (8 iterations) and still brackets',
    !resBudget.converged && resBudget.iterations === SWR_MAX_ITERATIONS && calls2 === SWR_MAX_ITERATIONS + 2,
    `iterations ${resBudget.iterations}, calls ${calls2}`,
  );
  check(
    'budget result is the bracket midpoint near the step',
    approx(resBudget.withdrawal, 1234, 0.02),
    `got ${resBudget.withdrawal}`,
  );

  // Cancellation: abort after the first evaluation.
  const ac = new AbortController();
  let evals = 0;
  let abortErr = null;
  try {
    await findSafeWithdrawal(
      async (w) => {
        evals++;
        if (evals >= 3) ac.abort();
        return 1 - w / 10_000;
      },
      { upperBound: 4_000, signal: ac.signal },
    );
  } catch (e) {
    abortErr = e;
  }
  check(
    'AbortSignal cancels the search with AbortError',
    abortErr !== null && abortErr.name === 'AbortError',
    abortErr ? abortErr.name : 'no error thrown',
  );

  // Pre-aborted signal rejects before any evaluation.
  const ac2 = new AbortController();
  ac2.abort();
  let evals2 = 0;
  let err2 = null;
  try {
    await findSafeWithdrawal(
      async () => {
        evals2++;
        return 0.9;
      },
      { upperBound: 4_000, signal: ac2.signal },
    );
  } catch (e) {
    err2 = e;
  }
  check('pre-aborted signal: zero evaluations', err2?.name === 'AbortError' && evals2 === 0);
}

// --------------------------------------------------------------------------
// g. findSafeWithdrawal driven by runCpuSim (spec wiring, CPU mock of
//    "runSimulation() at 100k paths" — 10k here for test speed, seeded →
//    deterministic)
// --------------------------------------------------------------------------
console.log('\n[g] findSafeWithdrawal via runCpuSim (10k, gbm, seed 42)');
{
  const swrParams = { ...BASE, pathCount: 10_000 };
  const run = async (withdrawal) => {
    const r = runCpuSim({ ...swrParams, withdrawal }, { now: NOW });
    return r.stats.successRate;
  };
  const ub = upperBoundForParams(swrParams);
  check('upper bound positive', ub > 0, `ub=${ub}`);
  const res = await findSafeWithdrawal(run, { upperBound: ub });
  check(
    'converges within 8 iterations into [0.895, 0.905]',
    res.converged && res.iterations <= SWR_MAX_ITERATIONS &&
      res.successRate >= 0.895 && res.successRate <= 0.905,
    `converged=${res.converged} iters=${res.iterations} w=${res.withdrawal} sr=${res.successRate}`,
  );
  // Sanity: success rate is non-increasing around the answer.
  const below = runCpuSim({ ...swrParams, withdrawal: res.withdrawal * 0.9 }, { now: NOW }).stats.successRate;
  const above = runCpuSim({ ...swrParams, withdrawal: res.withdrawal * 1.1 }, { now: NOW }).stats.successRate;
  check(
    'monotone: sr(0.9·w*) ≥ sr(w*) ≥ sr(1.1·w*)',
    below >= res.successRate - 1e-12 && res.successRate >= above - 1e-12,
    `below=${below} at=${res.successRate} above=${above}`,
  );
}

// --------------------------------------------------------------------------
// h. AMENDMENT A3 — worstDecileMaxDD is the conditional mean of the worst
//    decile, from the histogram side (M2)
// --------------------------------------------------------------------------
console.log('\n[h] A3 worst-decile max drawdown from histograms');
{
  // Constructed: 900 paths at maxDD 0.05, 100 paths ruined (maxDD 1.0).
  // Old semantics (p10 ascending) ≈ 0.05 — the SHALLOWEST decile boundary.
  // New semantics: mean of the deepest 10% = bin-255 midpoint 255.5/256.
  const n = 1000;
  const tw = new Float32Array(n).fill(5000);
  const dd = new Float32Array(n).fill(0.05);
  const fs = new Int32Array(n).fill(-1);
  for (let i = 900; i < n; i++) dd[i] = 1.0;
  const data = buildHistogramsFromPaths(tw, dd, fs);
  const tail = worstDecileMaxDdFromHistogram(data.ddHist, data.totalPaths);
  const expectTail = 255.5 / 256; // full bin 255 at its midpoint
  check('h1 histogram worst-decile mean = 255.5/256 (deepest 10% = ruined paths)',
    approx(tail, expectTail, 1e-12), `got ${tail}, want ${expectTail}`);
  const oldP10 = quantileFromHistogram(data.ddHist, data.totalPaths, 0.1, (b) => b / DD_BINS, (b) => (b + 1) / DD_BINS);
  check('h1 old p10 semantic would report ≈ 0.05 (materially misleading)',
    approx(oldP10, (12 + 1) / 256, 1 / DD_BINS), `got ${oldP10}`);
  check('h1 new and old differ materially', tail - oldP10 > 0.5,
    `tail ${tail} vs p10 ${oldP10}`);
  const stats = extractSimStats(data, { now: NOW });
  check('h2 extractSimStats carries the new semantic', stats.worstDecileMaxDD === tail);

  // Partial boundary bin: 50 ruined (bin 255), 950 at 0.05 (bin 12) —
  // the decile (100) takes all 50 of bin 255 + the TOP 50 of bin 12.
  const dd2 = new Float32Array(n).fill(0.05);
  for (let i = 950; i < n; i++) dd2[i] = 1.0;
  const data2 = buildHistogramsFromPaths(tw, dd2, fs);
  const tail2 = worstDecileMaxDdFromHistogram(data2.ddHist, data2.totalPaths);
  const frac2 = 50 / 950; // partial take from the 950-strong bin 12
  const expect2 = (50 * (255.5 / 256) + 50 * ((12 + 1 - frac2 / 2) / 256)) / 100;
  check('h3 partial boundary bin takes the TOP fraction of the bin',
    approx(tail2, expect2, 1e-12), `got ${tail2}, want ${expect2}`);
}

// --------------------------------------------------------------------------
// i. AMENDMENT A3 — magnitude-of-failure extraction from the failure-step
//    histogram (M4, GPU readback path)
// --------------------------------------------------------------------------
console.log('\n[i] A3 extractMagnitudeStats');
{
  // Constructed: 250 failures at month 12, 500 at month 24, 250 at month 36.
  // Median failure month = 24.5 (in-bin interpolation) ⇒ shortfall at
  // H=360: 335.5 months = 27.9583 yr; obligation at $2000/mo = $671,000.
  const n = 1000;
  const tw = new Float32Array(n);
  const dd = new Float32Array(n);
  const fs = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    fs[i] = i < 250 ? 12 : i < 750 ? 24 : 36;
  }
  const data = buildHistogramsFromPaths(tw, dd, fs);
  const m = extractMagnitudeStats(data, { horizonMonths: 360, monthlyWithdrawal: 2000, now: NOW });
  check('i1 median failure month = 24.5 ⇒ shortfall 335.5 months',
    approx(m.medianShortfallYears, 335.5 / 12, 1e-12),
    `got ${m.medianShortfallYears}, want ${335.5 / 12}`);
  check('i1 medianUnfundedObligation = 335.5 × $2000 = $671,000',
    m.medianUnfundedObligation === 671_000, `${m.medianUnfundedObligation}`);
  check('i1 failedPaths = 1000', m.failedPaths === 1000);
  check('i1 computedAt uses injected clock', m.computedAt === NOW());

  // Consistency with the SimStats median failure year from the SAME data.
  const stats = extractSimStats(data, { now: NOW });
  check('i2 consistent: shortfallYears = horizon − medianFailureYear',
    approx(m.medianShortfallYears, 30 - stats.medianFailureYear, 1e-12),
    `${m.medianShortfallYears} vs 30 − ${stats.medianFailureYear}`);

  // No failures ⇒ nulls.
  const fs2 = new Int32Array(n).fill(-1);
  const data2 = buildHistogramsFromPaths(tw, dd, fs2);
  const m2 = extractMagnitudeStats(data2, { horizonMonths: 360, monthlyWithdrawal: 2000, now: NOW });
  check('i3 no failures ⇒ both medians null, failedPaths 0',
    m2.medianShortfallYears === null && m2.medianUnfundedObligation === null && m2.failedPaths === 0);

  // All fail at month 0 ⇒ median month = 0.5 (in-bin interpolation over the
  // single month bin) ⇒ near-full-horizon shortfall.
  const fs3 = new Int32Array(n).fill(0);
  const data3 = buildHistogramsFromPaths(tw, dd, fs3);
  const m3 = extractMagnitudeStats(data3, { horizonMonths: 360, monthlyWithdrawal: 1000, now: NOW });
  check('i4 ruin at month 0 ⇒ shortfall ≈ full horizon, obligation ≈ H×w',
    approx(m3.medianShortfallYears, 359.5 / 12, 1e-12) &&
      m3.medianUnfundedObligation === 359_500,
    `${m3.medianShortfallYears} / ${m3.medianUnfundedObligation}`);
}

// --------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
