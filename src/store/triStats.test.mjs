import assert from 'node:assert/strict';
import { useSimStore } from './simStore.ts';

const initial = useSimStore.getState();
const triStats = {
  successRates: { gbm: 0.71, bootstrap: 0.68, fattail: 0.7 },
  computedAt: 0,
};

const comparison = {
  models: [
    {
      model: 'gbm',
      stats: {
        successRate: 0.71,
        percentiles: { p5: 0, p25: 100_000, p50: 500_000, p75: 1_000_000, p95: 2_000_000 },
        worstDecileMaxDD: 0.54,
        medianFailureYear: 18,
      },
      magnitude: {
        medianShortfallYears: 12,
        medianUnfundedObligation: 720_000,
        failedPaths: 29_000,
      },
    },
    {
      model: 'bootstrap',
      stats: {
        successRate: 0.68,
        percentiles: { p5: 0, p25: 80_000, p50: 450_000, p75: 900_000, p95: 1_800_000 },
        worstDecileMaxDD: 0.59,
        medianFailureYear: 17,
      },
      magnitude: {
        medianShortfallYears: 13,
        medianUnfundedObligation: 780_000,
        failedPaths: 32_000,
      },
    },
    {
      model: 'fattail',
      stats: {
        successRate: 0.7,
        percentiles: { p5: 0, p25: 90_000, p50: 480_000, p75: 950_000, p95: 1_900_000 },
        worstDecileMaxDD: 0.57,
        medianFailureYear: 18,
      },
      magnitude: {
        medianShortfallYears: 12.5,
        medianUnfundedObligation: 750_000,
        failedPaths: 30_000,
      },
    },
  ],
  pathCount: initial.params.pathCount,
  seed: initial.params.seed,
};

initial.setTriStats(triStats);
const landed = useSimStore.getState().triStats;
assert.ok(landed);
assert.deepEqual(landed.successRates, triStats.successRates);
assert.ok(landed.computedAt > 0);

const before = Date.now();
useSimStore.getState().setModelComparison(comparison);
const landedComparison = useSimStore.getState().modelComparison;
assert.ok(landedComparison);
assert.deepEqual(landedComparison.models, comparison.models);
assert.ok(landedComparison.computedAt >= before);
assert.deepEqual(Object.keys(useSimStore.getState().triStats ?? triStats), [
  'successRates',
  'computedAt',
]);

useSimStore.getState().setParams({
  withdrawal: useSimStore.getState().params.withdrawal + 100,
});
assert.equal(useSimStore.getState().triStats, null);
assert.equal(useSimStore.getState().modelComparison, null);

useSimStore.getState().setTriStats(triStats);
useSimStore.getState().setModelComparison(comparison);
useSimStore.getState().setModel('gbm');
assert.equal(useSimStore.getState().triStats, null);
assert.equal(useSimStore.getState().modelComparison, null);

useSimStore.getState().setTriStats(triStats);
useSimStore.getState().setModelComparison(comparison);
useSimStore.getState().setMode(
  useSimStore.getState().mode === 'gpu' ? 'cpu' : 'gpu',
);
assert.equal(useSimStore.getState().triStats, null);
assert.equal(useSimStore.getState().modelComparison, null);

useSimStore.setState({
  params: initial.params,
  committedParams: initial.committedParams,
  mode: initial.mode,
  triStats: null,
  modelComparison: null,
});

console.log('triStats store: 5 passed, 0 failed');
