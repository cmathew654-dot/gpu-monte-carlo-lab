import assert from 'node:assert/strict';
import test from 'node:test';

import historical from '../../src/data/historicalReturns.json';
import {
  PREVIEW_CONFIG,
  annualAffineTransition,
  assessVerdict,
  buildAnnualBlocks,
  getPolicyActions,
  guardrailAction,
  recoverHistoricalSeries,
  runBenchmark,
} from './benchmark.ts';
import { renderBenchmarkHtml } from './report.ts';

test('recovers the paired history and keeps cross-fit eras disjoint', () => {
  const series = recoverHistoricalSeries(historical);
  assert.equal(series.dates.length, 1206);
  assert.equal(series.dates[0], '1926-01');
  assert.equal(series.dates.at(-1), '2026-06');
  assert.match(series.inputSha256, /^[0-9a-f]{64}$/);
  assert.equal(series.trainingValidationOverlap.length, 0);
  assert.equal(series.folds[0].trainStart, '1926-01');
  assert.equal(series.folds[0].validationStart, '1976-01');
});

test('annual affine transition matches monthly replay, including depletion midyear', () => {
  const equity = Array.from({ length: 12 }, (_, month) => (month === 6 ? -0.8 : 0.01));
  const bonds = Array.from({ length: 12 }, () => 0.005);
  const allocation = 0.6;
  const spending = 5_000;
  const expected = { wealth: 1_000_000, fundedSpending: 0, unpaidFloor: 0, floorBreach: false };
  let wealth = expected.wealth;
  let fundedSpending = 0;
  let unpaidFloor = 0;
  let floorBreach = false;
  for (let month = 0; month < 12; month += 1) {
    wealth *= 1 + allocation * equity[month] + (1 - allocation) * bonds[month];
    const funded = Math.min(wealth, spending);
    wealth -= funded;
    fundedSpending += funded;
    if (funded < 4_000) {
      floorBreach = true;
      unpaidFloor += 4_000 - funded;
    }
  }
  const actual = annualAffineTransition(1_000_000, allocation, spending, equity, bonds);
  assert.ok(Math.abs(actual.wealth - wealth) < 1e-6);
  assert.ok(Math.abs(actual.fundedSpending - fundedSpending) < 1e-6);
  assert.ok(Math.abs(actual.unpaidFloor - unpaidFloor) < 1e-6);
  assert.equal(actual.floorBreach, floorBreach);

  const depletion = annualAffineTransition(10_000, allocation, 5_000, equity, bonds);
  assert.equal(depletion.wealth, 0);
  assert.equal(depletion.floorBreach, true);
  assert.ok(depletion.unpaidFloor > 0);
});

test('policy action grids enforce freedom and first-year implementable boundaries', () => {
  const freedom = getPolicyActions('freedom', 5_000);
  assert.equal(freedom.at(0).equity, 0);
  assert.equal(freedom.at(-1).equity, 1);
  assert.ok(freedom.some((action) => action.spending === 4_000));
  assert.ok(freedom.some((action) => action.spending === 5_000));

  const implementable = getPolicyActions('implementable', 5_000);
  assert.deepEqual([...new Set(implementable.map((action) => action.spending))], [4_500, 4_600, 4_700, 4_800, 4_900, 5_000]);
  assert.deepEqual([...new Set(implementable.map((action) => action.equity))], [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
  assert.equal(getPolicyActions('implementable', 4_500).at(0).spending, 4_100);
});

test('guardrails trigger only at the boundary and round to the $100 grid', () => {
  assert.equal(guardrailAction(5_000, 0.05, 0.03, 0.049), 5_000);
  assert.equal(guardrailAction(5_000, 0.05, 0.03, 0.05), 4_800);
  assert.equal(guardrailAction(5_000, 0.05, 0.03, 0.03), 5_000);
  assert.equal(guardrailAction(5_000, 0.08, 0.03, 0.10), 4_800);
});

test('verdict boundaries require matched risk and a material paired advantage', () => {
  assert.equal(assessVerdict({ matchedRisk: false, runtimeOk: true, integrityOk: true, sensitivityOk: true, spendingGainCiLow: 0.08, tailReductionCiLow: 0.01, spendingDeltaCiLow: 0 }), 'inconclusive');
  assert.equal(assessVerdict({ matchedRisk: true, runtimeOk: true, integrityOk: true, sensitivityOk: true, spendingGainCiLow: 0.05, tailReductionCiLow: 0, spendingDeltaCiLow: 0 }), 'pass');
  assert.equal(assessVerdict({ matchedRisk: true, runtimeOk: true, integrityOk: true, sensitivityOk: true, spendingGainCiLow: 0, tailReductionCiLow: 0.2, spendingDeltaCiLow: -0.02 }), 'pass');
  assert.equal(assessVerdict({ matchedRisk: true, runtimeOk: true, integrityOk: true, sensitivityOk: true, spendingGainCiLow: 0.01, tailReductionCiLow: 0.01, spendingDeltaCiLow: -0.03 }), 'stop');
});

test('benchmark output is deterministic apart from runtime and renders an accessible preview', () => {
  const config = { ...PREVIEW_CONFIG, trainingPaths: 8, validationPaths: 8, representatives: 2, bootstrapResamples: 16 };
  const first = runBenchmark(config);
  const second = runBenchmark(config);
  const stable = (report) => {
    const copy = structuredClone(report);
    delete copy.runtimeMs;
    return JSON.stringify(copy);
  };
  assert.equal(stable(first), stable(second));
  assert.equal(JSON.stringify(first).includes('NaN'), false);
  assert.equal(JSON.stringify(first).includes('Infinity'), false);
  const html = renderBenchmarkHtml(first);
  assert.match(html, /PREVIEW — NO VERDICT/);
  assert.match(html, /Mathematical freedom/);
  assert.match(html, /Implementable policy/);
  assert.match(html, /<svg/);
  assert.match(html, /<table/);
  assert.match(html, /Limitations/);
  assert.doesNotMatch(html, /Inter/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
});

test('annual blocks stay paired and keep twelve months per training block', () => {
  const series = recoverHistoricalSeries(historical);
  const blocks = buildAnnualBlocks(series, '1926-01', '1975-12');
  assert.equal(blocks.length, 50);
  assert.equal(blocks[0].equity.length, 12);
  assert.equal(blocks[0].bond.length, 12);
  assert.equal(blocks[0].startDate, '1926-01');
  assert.equal(blocks.at(-1).startDate, '1975-01');
});
