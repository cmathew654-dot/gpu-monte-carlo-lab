import assert from 'node:assert/strict';
import { useSimStore } from './simStore.ts';

const initial = useSimStore.getState();
const triStats = {
  successRates: { gbm: 0.71, bootstrap: 0.68, fattail: 0.7 },
  computedAt: 0,
};

initial.setTriStats(triStats);
const landed = useSimStore.getState().triStats;
assert.ok(landed);
assert.deepEqual(landed.successRates, triStats.successRates);
assert.ok(landed.computedAt > 0);

useSimStore.getState().setParams({
  withdrawal: useSimStore.getState().params.withdrawal + 100,
});
assert.equal(useSimStore.getState().triStats, null);

useSimStore.getState().setTriStats(triStats);
useSimStore.getState().setModel('gbm');
assert.equal(useSimStore.getState().triStats, null);

useSimStore.setState({
  params: initial.params,
  committedParams: initial.committedParams,
  triStats: null,
});

console.log('triStats store: 5 passed, 0 failed');
