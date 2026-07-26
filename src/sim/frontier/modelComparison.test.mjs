import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { modelOutcome, orderedModelComparison } from './modelComparison.ts';

const basis = { pathCount: 100_000, seed: 42 };

const makeComputed = ({ medianFailureYear, magnitude }) => ({
  stats: {
    successRate: 0.913,
    percentiles: { p5: 12_000, p25: 42_000, p50: 86_000, p75: 141_000, p95: 225_000 },
    worstDecileMaxDD: 0.567,
    safeWithdrawalRate: 0.039,
    medianFailureYear,
    computedAt: 1_700_000_000_000,
  },
  magnitude: {
    medianShortfallYears: magnitude ? 4.5 : null,
    medianUnfundedObligation: magnitude ? 270_000 : null,
    failedPaths: magnitude ? 87 : 0,
    computedAt: 1_700_000_000_001,
  },
});

const computed = makeComputed({ medianFailureYear: null, magnitude: false });
const gbm = modelOutcome('gbm', computed);
const bootstrap = modelOutcome(
  'bootstrap',
  makeComputed({ medianFailureYear: 18.5, magnitude: true }),
);
const fattail = modelOutcome('fattail', makeComputed({ medianFailureYear: 15, magnitude: true }));
const ordered = orderedModelComparison(
  new Map([
    ['fattail', fattail],
    ['gbm', gbm],
    ['bootstrap', bootstrap],
  ]),
  basis,
);

assert.deepEqual(
  ordered.models.map((outcome) => outcome.model),
  ['gbm', 'bootstrap', 'fattail'],
);
assert.deepEqual(ordered.models[0].stats.percentiles, computed.stats.percentiles);
assert.equal(ordered.models[0].stats.worstDecileMaxDD, 0.567);
assert.equal(ordered.models[0].stats.medianFailureYear, null);
assert.equal(ordered.models[0].magnitude.medianShortfallYears, null);
assert.equal('safeWithdrawalRate' in ordered.models[0].stats, false);
assert.equal('computedAt' in ordered.models[0].stats, false);
assert.equal('computedAt' in ordered.models[0].magnitude, false);
assert.equal(ordered.pathCount, 100_000);
assert.equal(ordered.seed, 42);

const partial = new Map();
partial.set('bootstrap', bootstrap);
partial.set('gbm', gbm);
assert.throws(
  () => orderedModelComparison(partial, basis),
  /complete model set/i,
);
partial.set('fattail', fattail);
assert.deepEqual(
  orderedModelComparison(partial, basis).models.map(({ model }) => model),
  ['gbm', 'bootstrap', 'fattail'],
);

const frozenWorker = readFileSync(
  new URL('../../src/ui/cpuSim.worker.ts', import.meta.url),
  'utf8',
);
assert.doesNotMatch(frozenWorker, /modelComparison|frontier/i);
