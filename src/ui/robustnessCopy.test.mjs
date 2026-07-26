import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatCardsView } from './StatCards.tsx';
import { ClientNarrative } from './ClientHud.tsx';

const committedParams = {
  model: 'gbm',
  pathCount: 100000,
  horizonYears: 30,
  retireYear: 0,
  initialWealth: 1000000,
  contribution: 0,
  withdrawal: 4000,
  mu: 0.05,
  sigma: 0.15,
  glidepath: null,
  seed: 42,
};

const stats = {
  successRate: 1,
  percentiles: {
    p5: 80000,
    p25: 350000,
    p50: 115188,
    p75: 1600000,
    p95: 3900000,
  },
  worstDecileMaxDD: 0.567,
  safeWithdrawalRate: 4500,
  medianFailureYear: null,
  computedAt: 123,
};

const magnitudeStats = {
  medianShortfallYears: null,
  medianUnfundedObligation: null,
  failedPaths: 0,
  computedAt: 123,
};

function outcome(model, successRate, medianWealth, worstDecileMaxDD, medianFailureYear) {
  return {
    model,
    stats: {
      successRate,
      percentiles: {
        p5: 80000,
        p25: 350000,
        p50: medianWealth,
        p75: 1600000,
        p95: 3900000,
      },
      worstDecileMaxDD,
      medianFailureYear,
    },
    magnitude: {
      medianShortfallYears: medianFailureYear === null ? null : 4.2,
      medianUnfundedObligation: medianFailureYear === null ? null : 210000,
      failedPaths: medianFailureYear === null ? 0 : 900,
    },
  };
}

const saturatedComparison = {
  models: [
    outcome('gbm', 1, 115188, 0.567, null),
    outcome('bootstrap', 1, 150906, 0.713, null),
    outcome('fattail', 1, 115697, 0.569, null),
  ],
  pathCount: 100000,
  seed: 42,
  computedAt: 123,
};

const nonSaturatedComparison = {
  ...saturatedComparison,
  models: [
    outcome('gbm', 0.7, 115188, 0.567, 22.4),
    outcome('bootstrap', 0.74, 150906, 0.713, 20.8),
    outcome('fattail', 0.72, 115697, 0.569, 21.6),
  ],
};

function capacity(monthlySpending, status = 'converged') {
  return {
    monthlySpending,
    successRate: monthlySpending === null ? null : 0.902,
    target: 0.9,
    tolerance: 0.005,
    evaluations: 18,
    status,
  };
}

const frontierResult = {
  basis: {
    params: committedParams,
    analysisPathCount: 100000,
    engine: 'gpu',
    seed: 42,
  },
  models: [
    {
      model: 'gbm',
      outcome: saturatedComparison.models[0],
      curve: [],
      capacity90: capacity(3500),
    },
    {
      model: 'bootstrap',
      outcome: saturatedComparison.models[1],
      curve: [],
      capacity90: capacity(3400),
    },
    {
      model: 'fattail',
      outcome: saturatedComparison.models[2],
      curve: [],
      capacity90: capacity(3600),
    },
  ],
  robustSpend: 3400,
  robustStatus: 'converged',
  computedAt: 123,
};

const statsMarkup = renderToStaticMarkup(
  React.createElement(StatCardsView, {
    stats,
    isStale: false,
    isRecomputing: false,
    magnitudeStats,
    modelComparison: saturatedComparison,
  }),
);
assert.match(statsMarkup, /Success agrees at 100\.0%/);
assert.match(statsMarkup, /Median ending wealth/);
assert.match(statsMarkup, /\$115K to \$151K/);
assert.match(statsMarkup, /Worst-decile max drawdown/);
assert.match(statsMarkup, /GBM/);
assert.match(statsMarkup, /Historical bootstrap/);
assert.match(statsMarkup, /Student-t\(5\)/);

function clientMarkup(overrides = {}) {
  return renderToStaticMarkup(
    React.createElement(ClientNarrative, {
      stats,
      modelComparison: saturatedComparison,
      magnitudeStats,
      frontierStatus: 'idle',
      frontierResult: null,
      committedParams,
      mode: 'gpu',
      ...overrides,
    }),
  );
}

const saturatedMarkup = clientMarkup();
assert.match(saturatedMarkup, /ceiling of this measure, not a guarantee/i);
assert.match(saturatedMarkup, /roughest 1 in 10 futures/i);
assert.doesNotMatch(saturatedMarkup, /guaranteed|recommended|affordable/i);

const nonSaturatedMarkup = clientMarkup({
  stats: { ...stats, successRate: 0.7, medianFailureYear: 22.4 },
  modelComparison: nonSaturatedComparison,
});
assert.match(nonSaturatedMarkup, /70–74/);
assert.doesNotMatch(nonSaturatedMarkup, /ceiling of this measure, not a guarantee/i);

const currentFrontierMarkup = clientMarkup({
  frontierStatus: 'complete',
  frontierResult,
});
assert.match(currentFrontierMarkup, /Across all included models/);
assert.match(currentFrontierMarkup, /real monthly spending/i);

const runningFrontierMarkup = clientMarkup({
  frontierStatus: 'running',
  frontierResult,
});
assert.doesNotMatch(runningFrontierMarkup, /Across all included models/);

const errorFrontierMarkup = clientMarkup({
  frontierStatus: 'error',
  frontierResult,
});
assert.doesNotMatch(errorFrontierMarkup, /Across all included models/);

const staleParamsMarkup = clientMarkup({
  frontierStatus: 'complete',
  frontierResult,
  committedParams: { ...committedParams, withdrawal: 4200 },
});
assert.doesNotMatch(staleParamsMarkup, /Across all included models/);

const staleEngineMarkup = clientMarkup({
  frontierStatus: 'complete',
  frontierResult,
  mode: 'cpu',
});
assert.doesNotMatch(staleEngineMarkup, /Across all included models/);

const incompleteMarkup = clientMarkup({
  frontierStatus: 'complete',
  frontierResult: {
    ...frontierResult,
    models: frontierResult.models.map((model, index) => (
      index === 1
        ? { ...model, capacity90: capacity(null, 'unbounded-high') }
        : model
    )),
  },
});
assert.doesNotMatch(incompleteMarkup, /Across all included models/);
