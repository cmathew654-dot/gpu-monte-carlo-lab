import assert from 'node:assert/strict';
import {
  advisorComparisonSentence,
  capacityLabel,
  clientRobustSpendSentence,
  clientSaturationSentence,
  comparisonRange,
  isFrontierCurrent,
} from './frontierPresentation.ts';

const committed = {
  model: 'bootstrap',
  pathCount: 100_000,
  horizonYears: 30,
  retireYear: 0,
  initialWealth: 1_000_000,
  contribution: 2_000,
  withdrawal: 5_000,
  mu: 0.07,
  sigma: 0.15,
  glidepath: { start: 0.8, end: 0.6 },
  seed: 42,
};

function outcome(model, successRate, p50, worstDecileMaxDD) {
  return {
    model,
    stats: {
      successRate,
      percentiles: {
        p5: 0,
        p25: 0,
        p50,
        p75: p50,
        p95: p50,
      },
      worstDecileMaxDD,
      medianFailureYear: null,
    },
    magnitude: {
      medianShortfallYears: null,
      medianUnfundedObligation: null,
      failedPaths: 0,
    },
  };
}

const comparison = {
  models: [
    outcome('gbm', 1, 115_188, 0.567),
    outcome('bootstrap', 1, 150_906, 0.713),
    outcome('fattail', 1, 115_697, 0.569),
  ],
  pathCount: 100_000,
  seed: 42,
  computedAt: 1,
};

const converged = {
  monthlySpending: 4_576,
  successRate: 0.9019,
  target: 0.9,
  tolerance: 0.005,
  evaluations: 8,
  status: 'converged',
};

const frontier = {
  basis: {
    params: structuredClone(committed),
    analysisPathCount: 100_000,
    engine: 'gpu',
    seed: 42,
  },
  models: comparison.models.map((outcome) => ({
    model: outcome.model,
    outcome,
    curve: [{ monthlySpending: 4_576, successRate: 0.9 }],
    capacity90: converged,
  })),
  robustSpend: 4_576,
  robustStatus: 'converged',
  computedAt: 2,
};

assert.deepEqual(comparisonRange(comparison), {
  success: { min: 1, max: 1 },
  medianWealth: { min: 115_188, max: 150_906 },
  worstDecileMaxDD: { min: 0.567, max: 0.713 },
});
assert.throws(
  () =>
    comparisonRange({
      ...comparison,
      models: [
        outcome('gbm', 1, 115_188, 0.567),
        outcome('bootstrap', 1, Number.NaN, 0.713),
        outcome('fattail', 1, 115_697, 0.569),
      ],
    }),
  /finite measured values/,
);

const advisorSentence = advisorComparisonSentence(comparison);
assert.match(advisorSentence, /Success agrees at 100\.0%/);
assert.match(advisorSentence, /\$115K to \$151K/);
assert.match(advisorSentence, /56\.7% to 71\.3%/);

assert.match(
  clientSaturationSentence(comparison),
  /ceiling of this measure, not a guarantee/i,
);
assert.equal(
  clientSaturationSentence({
    ...comparison,
    models: [
      outcome('gbm', 1, 115_188, 0.567),
      outcome('bootstrap', 0.999, 150_906, 0.713),
      outcome('fattail', 1, 115_697, 0.569),
    ],
  }),
  null,
);

assert.equal(isFrontierCurrent(frontier, committed, 'gpu'), true);
for (const changedParams of [
  { ...committed, model: 'gbm' },
  { ...committed, pathCount: 10_000 },
  { ...committed, horizonYears: 31 },
  { ...committed, retireYear: 1 },
  { ...committed, initialWealth: 1_000_001 },
  { ...committed, contribution: 2_001 },
  { ...committed, withdrawal: 6_001 },
  { ...committed, mu: 0.08 },
  { ...committed, sigma: 0.16 },
  { ...committed, seed: 43 },
  { ...committed, glidepath: { start: 0.7, end: 0.6 } },
  { ...committed, glidepath: { start: 0.8, end: 0.5 } },
  { ...committed, glidepath: null },
]) {
  assert.equal(isFrontierCurrent(frontier, changedParams, 'gpu'), false);
}
assert.equal(isFrontierCurrent(frontier, committed, 'cpu'), false);

assert.equal(capacityLabel(converged), '$4,576/mo real');
assert.equal(
  capacityLabel({ ...converged, monthlySpending: null, status: 'unbounded-high' }),
  'Above tested range',
);

assert.match(
  clientRobustSpendSentence(frontier),
  /highest tested real monthly spending.*90 in 100/i,
);
assert.equal(
  clientRobustSpendSentence({
    ...frontier,
    models: [
      ...frontier.models.slice(0, 2),
      {
        ...frontier.models[2],
        capacity90: { ...converged, monthlySpending: null, status: 'unbounded-high' },
      },
    ],
  }),
  null,
);
