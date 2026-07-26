/**
 * gauntlet.test.mjs — Historical Gauntlet engine tests.
 *
 * Plain ESM, zero test-framework deps (mirrors src/validation/cpuSim.test.mjs).
 * Run via:  npm run test:gauntlet   (esbuild bundle → node)
 *
 * Covers:
 *  a. recoverMonthlySeries: hand-checkable reconstruction + error cases.
 *  b. Overlap-consistency of the SHIPPED float32 data: every recovered
 *     month must equal blocks[i*12+j] for EVERY covering (i,j) — equity
 *     and bonds. (Result: perfectly consistent — 14,340 positions each.)
 *  c. Micro cases on synthetic blocks: exact closed-form wealth paths,
 *     allocation mixing, failure timing.
 *  d. Failure conventions mirror withdrawal.ts/cpuSim exactly: a path
 *     hitting EXACTLY 0 after a debit survives; the next debit fails;
 *     absorbing state; failureMonth = 0-indexed step (cpuSim failureStep).
 *  e. Literature anchors (Pfau safemax cohort analysis):
 *       - 1966 cohort 30-year maxSWR ∈ [3.5%, 4.5%] (the famous ~4%).
 *       - 1929 cohort at 4%/yr of initial wealth SURVIVES 30 years
 *         (Depression cohorts recovered; it's 1966 that breaks the 4% rule).
 *       - 2000 & 2008 cohorts at a 40-year horizon report exhaustedData.
 *  f. Determinism: runGauntlet twice ⇒ byte-identical JSON.
 */
import {
  recoverMonthlySeries,
  loadHistoricalSeries,
  replayCohort,
  computeMaxSWR,
  runGauntlet,
  MAX_SWR_PRECISION,
} from './engine.ts';
import { GAUNTLET_COHORTS } from './cohorts.ts';
import { applyMonthlyStep } from '../model/withdrawal.ts';
import historicalReturnsJson from '../../data/historicalReturns.json';

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

/** Constant-return synthetic blocks: blockCount blocks, all months = r. */
function constBlocks(blockCount, r) {
  return new Float64Array(blockCount * 12).fill(r);
}
function seriesOf(equityBlocks, bondBlocks = null) {
  const equity = recoverMonthlySeries(equityBlocks);
  const bonds = bondBlocks ? recoverMonthlySeries(bondBlocks) : equity.slice();
  return { equity, bonds, monthCount: equity.length };
}

// --------------------------------------------------------------------------
// a. recoverMonthlySeries — hand-checkable
// --------------------------------------------------------------------------
console.log('\n[a] recoverMonthlySeries');
{
  // blocks[i*12+j] = i*12+j (2 blocks): month 0 = 0 (block 0), month 1 = 12
  // (block 1, offset 0), months 2..12 = last block offsets 1..11 = 13..23.
  const blocks = Array.from({ length: 24 }, (_, i) => i);
  const s = recoverMonthlySeries(blocks);
  const expected = [0, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  check(
    '2-block recovery is exact',
    s.length === 13 && expected.every((v, k) => s[k] === v),
    `got [${Array.from(s).join(',')}]`,
  );
  check(
    'monthCount = blockCount + 11',
    recoverMonthlySeries(constBlocks(100, 0.001)).length === 111,
  );
  let threw = false;
  try {
    recoverMonthlySeries([0.01, 0.02, 0.03]);
  } catch {
    threw = true;
  }
  check('rejects non-multiple-of-12 length', threw);
}

// --------------------------------------------------------------------------
// b. Overlap-consistency of the shipped data (equity + bonds)
// --------------------------------------------------------------------------
console.log('\n[b] shipped-data overlap consistency');
{
  const series = loadHistoricalSeries();
  check('series spans 1926-01..2026-06 (1206 months)',
    series.monthCount === 1206 &&
      series.startDate === '1926-01' &&
      series.endDate === '2026-06',
    `got ${series.monthCount} months ${series.startDate}..${series.endDate}`);

  for (const [name, blocks, recovered] of [
    ['equity', historicalReturnsJson.blocks, series.equity],
    ['bonds', historicalReturnsJson.bondBlocks, series.bonds],
  ]) {
    const blockCount = blocks.length / 12;
    let mismatches = 0;
    let checked = 0;
    for (let k = 0; k < blockCount + 11; k++) {
      for (let i = Math.max(0, k - 11); i <= Math.min(k, blockCount - 1); i++) {
        checked++;
        if (blocks[i * 12 + (k - i)] !== recovered[k]) mismatches++;
      }
    }
    check(
      `${name}: all ${checked} overlapping positions agree (perfectly consistent)`,
      mismatches === 0,
      `${mismatches} mismatches — would fall back to earliest-covering-block convention`,
    );
  }
}

// --------------------------------------------------------------------------
// c. micro cases — synthetic blocks, exact outcomes
// --------------------------------------------------------------------------
console.log('\n[c] synthetic micro cases');
{
  // c1: pure accumulation, constant +1%/mo, contribution 100/mo.
  // w_n = 1000·1.01^n + 100·(1.01^n − 1)/0.01 (growth, then month-end flow).
  const s1 = seriesOf(constBlocks(24, 0.01));
  const p1 = { initialWealth: 1000, contribution: 100, withdrawal: 0, retireYear: 10, horizonYears: 1 };
  const r1 = replayCohort(p1, s1, 0);
  const g = 1.01 ** 12;
  const expected = 1000 * g + (100 * (g - 1)) / 0.01;
  check('accumulation closed-form (growth then month-end contribution)',
    approx(r1.endingWealth, expected, 1e-12),
    `got ${r1.endingWealth}, want ${expected}`);
  check('accumulation never fails / never exhausts (24+11 months ≥ 12)',
    !r1.failed && !r1.exhaustedData && r1.monthsSimulated === 12);

  // c2: allocation mixing — 50% equity (+1%/mo) / 50% bonds (+2%/mo) ⇒
  // monthly gross = 0.5·1.01 + 0.5·1.02 = 1.015.
  const s2 = seriesOf(constBlocks(24, 0.01), constBlocks(24, 0.02));
  const p2 = { initialWealth: 1000, contribution: 0, withdrawal: 0, retireYear: 10, horizonYears: 1 };
  const r2 = replayCohort(p2, s2, 0, () => 0.5);
  check('allocation mix gross = a·(1+rE)+(1−a)·(1+rB)',
    approx(r2.endingWealth, 1000 * 1.015 ** 12, 1e-12),
    `got ${r2.endingWealth}, want ${1000 * 1.015 ** 12}`);

  // c3: retireYear honored — 6 months accumulation then retirement.
  // months 0..5: w = w·1.01 + 100; months 6..11: w = w·1.01 − 50.
  const s3 = seriesOf(constBlocks(24, 0.01));
  const p3 = { initialWealth: 1000, contribution: 100, withdrawal: 50, retireYear: 0.5, horizonYears: 1 };
  const r3 = replayCohort(p3, s3, 0);
  let w = 1000;
  for (let t = 0; t < 12; t++) w = w * 1.01 + (t >= 6 ? -50 : 100);
  check('retireYear switch at retireStep = round(retireYear·12)',
    approx(r3.endingWealth, w, 1e-12), `got ${r3.endingWealth}, want ${w}`);

  // c4: exhaustedData — 3-block series (14 months) vs 2-year horizon.
  const s4 = seriesOf(constBlocks(3, 0.01));
  const p4 = { initialWealth: 1000, contribution: 0, withdrawal: 10, retireYear: 0, horizonYears: 2 };
  const r4 = replayCohort(p4, s4, 0);
  check('exhaustedData when history runs out (14 of 24 months)',
    r4.exhaustedData === true && r4.monthsSimulated === 14 && !r4.failed,
    JSON.stringify(r4));

  // c5: maxSWR on a ZERO-return series is exact: level monthly withdrawal
  // over m months survives iff w ≤ W/m ⇒ annualized rate = 12/m.
  // 40 blocks ⇒ 51 months ⇒ rate = 12/51 ≈ 0.23529.
  const s5 = seriesOf(constBlocks(40, 0));
  const m5 = computeMaxSWR(s5, 0, 1_000_000, 51 / 12);
  check('maxSWR exact on zero-return series (12/51)',
    approx(m5.annualRate, 12 / 51, 0.005) && !m5.capped && m5.monthsUsed === 51,
    `got ${m5.annualRate}, want ${12 / 51}`);
  check('maxSWR boundary: found rate survives, +0.1%/yr fails',
    !replayCohort(
      { initialWealth: 1e6, contribution: 0, withdrawal: (m5.annualRate * 1e6) / 12, retireYear: 0, horizonYears: 51 / 12 },
      s5, 0,
    ).failed &&
      replayCohort(
        { initialWealth: 1e6, contribution: 0, withdrawal: ((m5.annualRate + 0.001) * 1e6) / 12, retireYear: 0, horizonYears: 51 / 12 },
        s5, 0,
      ).failed);
}

// --------------------------------------------------------------------------
// d. failure conventions mirror withdrawal.ts / cpuSim exactly
// --------------------------------------------------------------------------
console.log('\n[d] failure conventions');
{
  // d1: zero-return series, withdraw 500/mo from 1000:
  //   month 0: 1000 − 500 = 500  (survives)
  //   month 1:  500 − 500 = 0    (EXACTLY 0 ⇒ survives — failure is wealth < 0)
  //   month 2:    0 − 500 = −500 ⇒ fails, clamped to 0, absorbing.
  const s = seriesOf(constBlocks(6, 0));
  const p = { initialWealth: 1000, contribution: 0, withdrawal: 500, retireYear: 0, horizonYears: 1 };
  const r = replayCohort(p, s, 0);
  check('exact-zero wealth after debit SURVIVES; negative fails',
    r.failed === true && r.failureMonth === 2,
    JSON.stringify(r));
  check('failureMonth is the 0-indexed step (cpuSim failureStep); failureYear = month/12',
    r.failureYear === 2 / 12 && r.monthsSimulated === 3);
  check('failed path clamps to 0 (endingWealth 0, minWealth 0)',
    r.endingWealth === 0 && r.minWealth === 0);

  // d2: replay must match a manual applyMonthlyStep loop month-for-month on
  // REAL data with a mixed allocation (gross formula + step order).
  const series = loadHistoricalSeries();
  const p2 = { initialWealth: 750_000, contribution: 1_500, withdrawal: 4_000, retireYear: 3, horizonYears: 20 };
  const startMonth = 480; // 1966 cohort — guaranteed stress
  const alloc = (t) => 0.6 - 0.2 * Math.min(t / 36, 1);
  const r2 = replayCohort(p2, series, startMonth, alloc);
  const state = { wealth: p2.initialWealth, peak: p2.initialWealth, maxDD: 0, failed: 0 };
  let minW = p2.initialWealth;
  let months = 0;
  const steps = 240;
  for (let t = 0; t < steps; t++) {
    const m = startMonth + t;
    if (m >= series.monthCount) break;
    const a = alloc(t);
    applyMonthlyStep(state, a * (1 + series.equity[m]) + (1 - a) * (1 + series.bonds[m]), t, 36, 1500, 4000);
    if (state.wealth < minW) minW = state.wealth;
    months = t + 1;
    if (state.failed !== 0) break;
  }
  check('replay ≡ applyMonthlyStep loop (real 1966 data, glidepath-like mix)',
    r2.endingWealth === state.wealth &&
      r2.minWealth === minW &&
      r2.monthsSimulated === months &&
      r2.failed === (state.failed !== 0) &&
      r2.failureMonth === (state.failed !== 0 ? state.failed - 1 : null),
    `engine ${JSON.stringify(r2)} vs manual ${JSON.stringify(state)}`);
}

// --------------------------------------------------------------------------
// e. literature anchors
// --------------------------------------------------------------------------
console.log('\n[e] literature anchors (real data)');
{
  const series = loadHistoricalSeries();
  const W = 1_000_000;
  const by = (id) => GAUNTLET_COHORTS.find((c) => c.id === id);
  const swr = (id, years) => computeMaxSWR(series, by(id).startMonth, W, years);
  const at4pct = (id, years) =>
    replayCohort(
      { initialWealth: W, contribution: 0, withdrawal: (0.04 * W) / 12, retireYear: 0, horizonYears: years },
      series, by(id).startMonth,
    );

  const swr1966 = swr('stag1966', 30);
  console.log(`  info: 1966 30y maxSWR = ${(swr1966.annualRate * 100).toFixed(2)}%/yr`);
  check('1966 cohort 30y maxSWR ∈ [3.5%, 4.5%] (Pfau safemax ~4%)',
    swr1966.annualRate >= 0.035 && swr1966.annualRate <= 0.045,
    `got ${(swr1966.annualRate * 100).toFixed(3)}%`);

  const r1929 = at4pct('gd1929', 30);
  check('1929 cohort SURVIVES 30y at 4%/yr (Depression cohorts recovered)',
    !r1929.failed && !r1929.exhaustedData && r1929.endingWealth > 0,
    JSON.stringify(r1929));

  const r1966 = at4pct('stag1966', 30);
  check('1966 cohort FAILS 30y at 4%/yr (the cohort that breaks the 4% rule)',
    r1966.failed === true,
    JSON.stringify(r1966));
  console.log(`  info: 1966 4%/yr fails at month ${r1966.failureMonth} (year ${r1966.failureYear.toFixed(2)})`);

  for (const id of ['dot2000', 'gfc2008']) {
    const r = replayCohort(
      { initialWealth: W, contribution: 0, withdrawal: (0.04 * W) / 12, retireYear: 0, horizonYears: 40 },
      series, by(id).startMonth,
    );
    check(`${id} at 40y horizon reports exhaustedData (no fabricated returns)`,
      r.exhaustedData === true && r.monthsSimulated === 1206 - by(id).startMonth,
      JSON.stringify(r));
  }
  console.log(`  info: 2008 has ${(1206 - by('gfc2008').startMonth) / 12} years of history; 2000 has ${(1206 - by('dot2000').startMonth) / 12}`);

  // informational: full maxSWR table at 30y and 35y (the report's table)
  for (const years of [30, 35]) {
    const row = GAUNTLET_COHORTS.map((c) => {
      const m = computeMaxSWR(series, c.startMonth, W, years);
      return `${c.startDate}: ${(m.annualRate * 100).toFixed(2)}%${m.dataLimited ? ` (${(m.monthsUsed / 12).toFixed(1)}y only)` : ''}`;
    }).join('  |  ');
    console.log(`  info: maxSWR ${years}y — ${row}`);
  }
}

// --------------------------------------------------------------------------
// f. runGauntlet end-to-end + determinism
// --------------------------------------------------------------------------
console.log('\n[f] runGauntlet + determinism');
{
  const params = { initialWealth: 1_000_000, contribution: 2_000, withdrawal: 4_500, retireYear: 5, horizonYears: 35 };
  const r1 = runGauntlet(params);
  const r2 = runGauntlet(params);
  check('six cohorts in roster order', r1.cohorts.length === 6 &&
    r1.cohorts.every((c, i) => c.cohortId === GAUNTLET_COHORTS[i].id));
  check('determinism: identical JSON across runs',
    JSON.stringify(r1) === JSON.stringify(r2));
  check('every cohort carries a maxSWR with binary-search precision metadata',
    r1.cohorts.every((c) => c.maxSWR.annualRate >= 0 && c.maxSWR.monthsUsed > 0) &&
    MAX_SWR_PRECISION <= 0.001);
  check('result shape: failureMonth/failureYear consistent',
    r1.cohorts.every((c) =>
      c.failed
        ? c.failureMonth !== null && c.failureYear === c.failureMonth / 12
        : c.failureMonth === null && c.failureYear === null));
}

// --------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
