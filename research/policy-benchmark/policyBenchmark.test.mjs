import assert from 'node:assert/strict';
import test from 'node:test';

import historical from '../../src/data/historicalReturns.json';
import {
  FULL_CONFIG,
  PREVIEW_CONFIG,
  aggregateVerdicts,
  annualAffineTransition,
  assessVerdict,
  buildAnnualBlocks,
  buildCounterpartEnvelope,
  chooseFrozenPair,
  EXPECTED_INPUT_SHA256,
  interpolateValue,
  makeBootstrapIndices,
  pairedBootstrapMetrics,
  pooledBootstrapMetrics,
  simulatePolicyPair,
  solveDynamicPolicy,
  summarizeOutcomes,
  allocationBound,
  getPolicyActions,
  guardrailAction,
  makeCommonBlockStarts,
  recoverHistoricalSeries,
  validateBenchmarkIntegrity,
  runBenchmark,
} from './benchmark.ts';
import { renderBenchmarkHtml } from './report.ts';

test('recovers the paired history and keeps cross-fit eras disjoint', () => {
  const series = recoverHistoricalSeries(historical);
  assert.equal(series.dates.length, 1206);
  assert.equal(series.dates[0], '1926-01');
  assert.equal(series.dates.at(-1), '2026-06');
  assert.match(series.inputSha256, /^[0-9a-f]{64}$/);
  assert.equal(series.inputSha256, '22cce814073cdf5fba6288afbdf7d4c78d000a7f62110c757905eb3076cc49e4');
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
  assert.match(html, /scroll-cue/);
  assert.match(html, /position:sticky/);
  assert.match(html, /actual observed funded-spending range/);
  assert.match(html, /Limitations/);
  assert.doesNotMatch(html, /Inter/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.ok(first.frontiers.every((frontier) => frontier.selectedByFold.length === 2));
  assert.ok(first.frontiers.every((frontier) => frontier.selectedByFold.every((selection) => selection.counterpart.kind === 'fixed' || selection.counterpart.kind === 'guardrail')));
  assert.ok(first.frontiers.every((frontier) => frontier.learnedActionMap.length > 0));
  assert.ok(first.frontiers.filter((frontier) => frontier.family === 'implementable').every((frontier) => frontier.learnedActionMap.every((row) => row.priorSpending !== 5_000 || row.spendingAction >= 4_500)));
  const validationChanged = runBenchmark({ ...config, validationSeeds: [51011, 51012] });
  assert.deepEqual(first.frontiers.map((frontier) => frontier.optimizedPolicy), validationChanged.frontiers.map((frontier) => frontier.optimizedPolicy));
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

test('Bellman interpolation is exact and the breach penalty is absorbing', () => {
  assert.equal(interpolateValue(new Float64Array([0, 100]), 50, [0, 100]), 50);
  const cell = {
    startDate: 'synthetic',
    equity: Array.from({ length: 12 }, () => -0.2),
    bond: Array.from({ length: 12 }, () => 0),
    annualEquityReturn: -0.2,
    annualBondReturn: 0,
    equityDrawdown: -0.2,
    cell: '0:0',
    weight: 1,
  };
  const config = { ...PREVIEW_CONFIG, horizonYears: 2, wealthGrid: [0, 100_000], spendingGrid: [4_000], startingWealth: [50_000], representatives: 1, penalties: [0] };
  const solved = solveDynamicPolicy('freedom', [cell], config, 10_000);
  assert.equal(solved.penaltyModel, 'absorbing-any-breach');
  assert.ok(solved.firstBreachPenaltyApplications > 0);
  assert.ok(solved.repeatedBreachPenaltyApplications === 0);

  const choiceConfig = { ...PREVIEW_CONFIG, horizonYears: 1, wealthGrid: [0, 100_000], spendingGrid: [4_000, 5_000], startingWealth: [100_000], representatives: 1, penalties: [0] };
  const choice = solveDynamicPolicy('freedom', [{ ...cell, equity: Array.from({ length: 12 }, () => 0), bond: Array.from({ length: 12 }, () => 0) }], choiceConfig, 0);
  const choiceRow = choice.policy.stateActionMap.find((row) => row.year === 0 && row.wealth === 100_000 && row.breached === false);
  assert.equal(choiceRow.action.spending, 5_000);
  assert.equal(choice.valueAtStart, 5_000);
});

test('a refined controller freezes with its own matched counterpart', () => {
  const selected = chooseFrozenPair([
    { rho: 0, policyId: 'base', risk: 0.2, counterpartId: 'base-counterpart' },
    { rho: 62_500, policyId: 'refined', risk: 0.105, counterpartId: 'refined-counterpart' },
  ], 0.1);
  assert.equal(selected.policyId, 'refined');
  assert.equal(selected.rho, 62_500);
  assert.equal(selected.counterpartId, 'refined-counterpart');
});

test('counterpart envelope evaluates every configured training path and keeps refinement metadata capped', () => {
  const block = {
    startDate: 'synthetic',
    equity: Array.from({ length: 12 }, () => 0.01),
    bond: Array.from({ length: 12 }, () => 0.005),
    annualEquityReturn: 0.1268,
    annualBondReturn: 0.0617,
    equityDrawdown: 0,
  };
  const config = { ...PREVIEW_CONFIG, horizonYears: 1, trainingPaths: 4, representatives: 1, spendingGrid: [4_500, 5_000], freedomEquityGrid: [0, 0.5, 1], implementableEquityGrid: [0.3, 0.6, 0.8], wealthGrid: [0, 100_000], startingWealth: [100_000], bootstrapResamples: 0 };
  const starts = [[0], [0], [0], [0]];
  const envelope = buildCounterpartEnvelope('freedom', [block], starts, 100_000, config, 0);
  assert.ok(envelope.points.length > 0);
  assert.ok(envelope.points.every((point) => point.training.pathCount === starts.length));
  const report = runBenchmark(config);
  assert.ok(report.frontiers.every((frontier) => frontier.selectedByFold.every((selection) => selection.refinementHistory.length <= 3)));
});

test('paired policy paths expose aligned CRN ids while policy outcomes differ', () => {
  const block = {
    startDate: 'synthetic',
    equity: Array.from({ length: 12 }, () => 0.01),
    bond: Array.from({ length: 12 }, () => 0.005),
    annualEquityReturn: 0.1268,
    annualBondReturn: 0.0617,
    equityDrawdown: 0,
  };
  const config = { ...PREVIEW_CONFIG, horizonYears: 1, wealthGrid: [0, 100_000], startingWealth: [100_000] };
  const starts = makeCommonBlockStarts(4, 1, 1, 123);
  const pair = simulatePolicyPair('freedom', { kind: 'fixed', equity: 0.6, spending: 5_000 }, { kind: 'fixed', equity: 0.6, spending: 4_500 }, 100_000, [block], starts, config);
  assert.deepEqual(pair.left.pathIds, pair.right.pathIds);
  assert.deepEqual(pair.left.pathIds, [0, 1, 2, 3]);
  assert.notDeepEqual(pair.left.outcomes.map((outcome) => outcome.fundedLifetimeSpending), pair.right.outcomes.map((outcome) => outcome.fundedLifetimeSpending));
});

test('paired bootstrap uses aggregate ratios and recomputes severe-tail summaries', () => {
  const outcome = (fundedLifetimeSpending, unpaidFloorObligations, floorBreach = false) => ({ fundedLifetimeSpending, unpaidFloorObligations, floorBreach, terminalWealth: 0, failureMonth: null, yearsAtFloor: 0, spendingAdjustments: 0, equityExposure: 0, turnover: 0, timeAtAllocationBounds: 0 });
  const optimized = [outcome(200, 0), outcome(300, 0)];
  const counterpart = [outcome(100, 0), outcome(200, 0)];
  const result = pairedBootstrapMetrics(optimized, counterpart, { resamples: 0, seed: 1 });
  assert.equal(result.fundedSpendingGain.estimate, (250 - 150) / 150);
  assert.notEqual(result.fundedSpendingGain.estimate, (1 + 0.5) / 2);
  const tail = pairedBootstrapMetrics(
    [outcome(100, 0), outcome(100, 100), outcome(100, 300), outcome(100, 500)],
    [outcome(100, 0), outcome(100, 200), outcome(100, 400), outcome(100, 600)],
    { resamples: 0, seed: 1 },
  );
  assert.equal(tail.tailShortfallReduction.estimate, (600 - 500) / 600);
});

test('pooled bootstrap is replicate-outer, reuses fold counts, and returns no index matrix', () => {
  const outcome = (spending, shortfall = 0) => ({ fundedLifetimeSpending: spending, unpaidFloorObligations: shortfall, floorBreach: shortfall > 0, terminalWealth: 0, failureMonth: null, yearsAtFloor: 0, spendingAdjustments: 0, equityExposure: 0, turnover: 0, timeAtAllocationBounds: 0 });
  const pairs = Array.from({ length: 6 }, (_, selection) => ({
    folds: [
      { optimized: Array.from({ length: 4 }, (_, path) => outcome(100 + selection + path)), counterpart: Array.from({ length: 4 }, (_, path) => outcome(90 + selection + path, path)) },
      { optimized: Array.from({ length: 4 }, (_, path) => outcome(110 + selection + path)), counterpart: Array.from({ length: 4 }, (_, path) => outcome(95 + selection + path, path)) },
    ],
  }));
  const result = pooledBootstrapMetrics(pairs, { resamples: 3, seed: 1 });
  assert.equal(result.drawCount, 2 * 3 * 4);
  assert.equal('indices' in result, false);
  assert.equal(result.metrics.length, 6);
});

test('full configuration is locked and common-random matrices are identical for paired policies', () => {
  assert.equal(FULL_CONFIG.horizonYears, 35);
  assert.equal(FULL_CONFIG.trainingPaths, 20_000);
  assert.equal(FULL_CONFIG.validationPaths, 50_000);
  assert.equal(FULL_CONFIG.representatives, 24);
  assert.equal(FULL_CONFIG.bootstrapResamples, 2_000);
  assert.deepEqual(FULL_CONFIG.penalties, [0, 125_000, 250_000, 500_000, 1_000_000, 2_000_000, 4_000_000, 8_000_000]);
  assert.deepEqual(makeCommonBlockStarts(3, 4, 10, 61001), makeCommonBlockStarts(3, 4, 10, 61001));
});

test('integrity pins the input digest and recursively rejects nested non-finite values', () => {
  assert.equal(EXPECTED_INPUT_SHA256, '22cce814073cdf5fba6288afbdf7d4c78d000a7f62110c757905eb3076cc49e4');
  const changed = validateBenchmarkIntegrity('changed', { nested: { value: 1 } }, []);
  assert.equal(changed.inputDigestMatches, false);
  const nonFinite = validateBenchmarkIntegrity(EXPECTED_INPUT_SHA256, { nested: [{ value: NaN }] }, []);
  assert.equal(nonFinite.finite, false);
});

test('selected evidence is compact, interpretable for both families, and every table has a scroll cue', () => {
  const config = { ...PREVIEW_CONFIG, trainingPaths: 4, validationPaths: 4, representatives: 1, bootstrapResamples: 4, horizonYears: 1, wealthGrid: [0, 100_000], startingWealth: [100_000], spendingGrid: [4_000, 4_500, 5_000], penalties: [0] };
  const report = runBenchmark(config);
  assert.ok(Buffer.byteLength(JSON.stringify(report), 'utf8') < 2_000_000);
  assert.ok(report.frontiers.some((frontier) => frontier.family === 'freedom' && frontier.learnedActionMap.length > 0));
  assert.ok(report.frontiers.some((frontier) => frontier.family === 'implementable' && frontier.learnedActionMap.length > 0));
  assert.ok(report.frontiers.every((frontier) => frontier.learnedActionMap.every((row) => row.family && row.fold && typeof row.rho === 'number' && typeof row.year === 'number' && typeof row.wealth === 'number' && typeof row.priorSpending === 'number' && typeof row.spendingAction === 'number' && typeof row.equityAction === 'number')));
  const html = renderBenchmarkHtml(report);
  assert.equal((html.match(/class="table-wrap"/g) ?? []).length, (html.match(/<p class="scroll-cue"/g) ?? []).length);
  assert.doesNotMatch(html, /counterpart: \{"kind"/);
  assert.doesNotMatch(html, /actual funded-spending range: \$0-/);
  for (const selection of report.frontiers[0].selectedByFold) {
    assert.match(html, new RegExp(selection.policy.identity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(html, new RegExp(selection.counterpartId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('production aggregation considers every rho and allocation bounds are family-specific', () => {
  const item = (rho, verdict) => ({ family: 'freedom', rho, startingWealth: 1_000_000, verdict });
  assert.equal(aggregateVerdicts([item(0, 'stop'), item(1_000_000, 'pass'), { ...item(1_000_000, 'pass'), startingWealth: 1_200_000 }, item(2_000_000, 'stop')], 'full'), 'pass');
  assert.equal(allocationBound('freedom', 0), true);
  assert.equal(allocationBound('freedom', 0.3), false);
  assert.equal(allocationBound('implementable', 0.3), true);
  assert.equal(allocationBound('implementable', 0), false);
  const summary = summarizeOutcomes([{
    fundedLifetimeSpending: 100,
    unpaidFloorObligations: 100,
    floorBreach: true,
    terminalWealth: 0,
    failureMonth: 1,
    yearsAtFloor: 1,
    spendingAdjustments: 0,
    equityExposure: 0.3,
    turnover: 0,
    timeAtAllocationBounds: 1,
  }]);
  assert.equal(summary.meanYearsAtFloor, 1);
});
