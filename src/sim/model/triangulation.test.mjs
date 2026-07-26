import assert from 'node:assert/strict';
import {
  RETURN_MODELS,
  secondaryModels,
  successRateRange,
} from './triangulation.ts';

assert.deepEqual(RETURN_MODELS, ['gbm', 'bootstrap', 'fattail']);
assert.deepEqual(secondaryModels('gbm'), ['bootstrap', 'fattail']);
assert.deepEqual(secondaryModels('bootstrap'), ['gbm', 'fattail']);
assert.deepEqual(secondaryModels('fattail'), ['gbm', 'bootstrap']);

const range = successRateRange({
  successRates: { gbm: 0.74, bootstrap: 0.7, fattail: 0.72 },
  computedAt: 1,
});
assert.deepEqual(range, { min: 0.7, max: 0.74 });

console.log('triangulation: 5 passed, 0 failed');
