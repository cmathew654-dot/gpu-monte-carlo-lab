import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RobustnessFrontierPanelView } from './RobustnessFrontierPanel.tsx';

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

function outcome(model, successRate, medianWealth, worstDecileMaxDD, medianFailureYear) {
  return {
    model,
    stats: {
      successRate,
      percentiles: {
        p5: 120000,
        p25: 450000,
        p50: medianWealth,
        p75: 1800000,
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

const completeResult = {
  basis: {
    params: committedParams,
    analysisPathCount: 100000,
    engine: 'gpu',
    seed: 42,
  },
  models: [
    {
      model: 'gbm',
      outcome: outcome('gbm', 0.93, 115188, 0.567, null),
      curve: [
        { monthlySpending: 6000, successRate: 0.72 },
        { monthlySpending: 0, successRate: 1 },
        { monthlySpending: 3500, successRate: 0.92 },
        { monthlySpending: Number.NaN, successRate: 0.8 },
      ],
      capacity90: capacity(3500),
    },
    {
      model: 'bootstrap',
      outcome: outcome('bootstrap', 0.91, 150906, 0.713, 23.8),
      curve: [
        { monthlySpending: 6000, successRate: 0.67 },
        { monthlySpending: 0, successRate: 1 },
        { monthlySpending: 3400, successRate: 0.9 },
        { monthlySpending: 2500, successRate: Number.NaN },
      ],
      capacity90: capacity(3400),
    },
    {
      model: 'fattail',
      outcome: outcome('fattail', 0.92, 115697, 0.569, 25.1),
      curve: [
        { monthlySpending: 6000, successRate: 0.7 },
        { monthlySpending: 0, successRate: 1 },
        { monthlySpending: 3600, successRate: 0.905 },
        { monthlySpending: -10, successRate: 0.99 },
      ],
      capacity90: capacity(3600),
    },
  ],
  robustSpend: 3400,
  robustStatus: 'converged',
  computedAt: 123456,
};

function render(overrides = {}) {
  return renderToStaticMarkup(
    React.createElement(RobustnessFrontierPanelView, {
      status: 'idle',
      progress: { completed: 0, total: 0, model: null },
      result: null,
      error: null,
      committedParams,
      mode: 'gpu',
      onRun: () => {},
      ...overrides,
    }),
  );
}

const idleMarkup = render();
assert.match(idleMarkup, /Run robustness frontier/);
assert.match(idleMarkup, /explicit four-model frontier analysis/i);
assert.match(idleMarkup, /up to 100,000 paths per model/i);
assert.doesNotMatch(idleMarkup, /three-model/i);
assert.doesNotMatch(idleMarkup, /Robust spend/);

const runningMarkup = render({
  status: 'running',
  progress: { completed: 7, total: 54, model: 'bootstrap' },
  result: completeResult,
});
assert.match(runningMarkup, /role="status"/);
assert.match(runningMarkup, /aria-busy="true"/);
assert.match(runningMarkup, /HISTORICAL BOOTSTRAP/);
assert.match(runningMarkup, /7 \/ 54/);
assert.doesNotMatch(runningMarkup, /<path /);
assert.doesNotMatch(runningMarkup, /Robust spend/);
assert.equal((runningMarkup.match(/<table/g) ?? []).length, 0);

const errorMarkup = render({
  status: 'error',
  error: 'restore failed',
});
assert.match(errorMarkup, /role="alert"/);
assert.match(errorMarkup, /restore failed/);
assert.match(errorMarkup, /Run robustness frontier/);
assert.doesNotMatch(errorMarkup, /Robust spend/);

const completeMarkup = render({
  status: 'complete',
  result: completeResult,
});
assert.match(completeMarkup, /Robust spend/);
assert.match(completeMarkup, /100K paths per model/);
assert.match(completeMarkup, /seed 42/);
assert.match(completeMarkup, /Limiting model: Historical bootstrap/);
assert.match(completeMarkup, /highest tested real monthly spending/i);
assert.match(completeMarkup, /every included model/i);
assert.match(completeMarkup, /90 in 100 simulated futures/i);
assert.equal((completeMarkup.match(/<path /g) ?? []).length, 3);
assert.equal((completeMarkup.match(/<table/g) ?? []).length >= 2, true);
assert.match(completeMarkup, /Tested spending points/);
assert.match(completeMarkup, /Within a curve: simulated path variation/);
assert.match(completeMarkup, /Between curves: model-assumption uncertainty/);
assert.match(completeMarkup, /Along the spending axis: decision sensitivity/);
assert.match(completeMarkup, /Median ending wealth/);
assert.match(completeMarkup, /Worst-decile max drawdown/);
assert.match(completeMarkup, /Median failure year/);
assert.match(completeMarkup, /90% spending/);
assert.match(completeMarkup, /GBM/);
assert.match(completeMarkup, /Historical bootstrap/);
assert.match(completeMarkup, /Student-t\(5\)/);
assert.match(completeMarkup, /—/);
assert.equal((completeMarkup.match(/frontier-point-button/g) ?? []).length, 9);
assert.doesNotMatch(completeMarkup, /NaN/);

const staleParamsMarkup = render({
  status: 'complete',
  result: completeResult,
  committedParams: { ...committedParams, withdrawal: 4200 },
});
assert.match(staleParamsMarkup, /Current plan changed/);
assert.match(staleParamsMarkup, /Run robustness frontier/);
assert.doesNotMatch(staleParamsMarkup, /Robust spend/);
assert.doesNotMatch(staleParamsMarkup, /<path /);
assert.equal((staleParamsMarkup.match(/<table/g) ?? []).length, 0);

const staleEngineMarkup = render({
  status: 'complete',
  result: completeResult,
  mode: 'cpu',
});
assert.match(staleEngineMarkup, /Current plan changed/);
assert.doesNotMatch(staleEngineMarkup, /Robust spend/);

const unboundedMarkup = render({
  status: 'complete',
  result: {
    ...completeResult,
    robustSpend: null,
    robustStatus: 'unbounded-high',
    models: completeResult.models.map((model) => ({
      ...model,
      capacity90: capacity(null, 'unbounded-high'),
    })),
  },
});
assert.match(unboundedMarkup, /Above tested range/);
assert.match(unboundedMarkup, /Status: unbounded-high/);
assert.doesNotMatch(unboundedMarkup, /\$3,400\/mo real/);

const infeasibleMarkup = render({
  status: 'complete',
  result: {
    ...completeResult,
    robustSpend: null,
    robustStatus: 'infeasible-at-zero',
    models: completeResult.models.map((model) => ({
      ...model,
      capacity90: capacity(null, 'infeasible-at-zero'),
    })),
  },
});
assert.match(infeasibleMarkup, /Below 90% at \$0\/mo/);
assert.match(infeasibleMarkup, /Status: infeasible-at-zero/);
assert.doesNotMatch(infeasibleMarkup, /\$3,400\/mo real/);

const budgetMarkup = render({
  status: 'complete',
  result: {
    ...completeResult,
    robustSpend: 3400,
    robustStatus: 'budget-exhausted',
    models: completeResult.models.map((model) => ({
      ...model,
      capacity90: capacity(3400, 'budget-exhausted'),
    })),
  },
});
assert.match(budgetMarkup, /Best tested/);
assert.match(budgetMarkup, /Status: budget-exhausted/);
assert.match(budgetMarkup, /limited by the evaluation budget/i);

const tiedMarkup = render({
  status: 'complete',
  result: {
    ...completeResult,
    models: completeResult.models.map((model) => ({
      ...model,
      capacity90: capacity(3400),
    })),
  },
});
assert.match(
  tiedMarkup,
  /Limiting models: GBM, Historical bootstrap, Student-t\(5\)/,
);
