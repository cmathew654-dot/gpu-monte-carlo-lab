import assert from 'node:assert/strict';
import { useFrontierStore } from './frontierStore.ts';
import { PARAM_COMMIT_DEBOUNCE_MS, useSimStore } from './simStore.ts';

const initialSim = useSimStore.getState();

const frontier = {
  basis: {
    params: initialSim.params,
    analysisPathCount: initialSim.params.pathCount,
    engine: 'cpu',
    seed: initialSim.params.seed,
  },
  models: [],
  robustSpend: 4_200,
  robustStatus: 'converged',
  computedAt: 1_735_689_600_000,
};

function seedComplete() {
  const state = useFrontierStore.getState();
  state.clear();
  state.setAdvisorLens('futures');
  state.complete(frontier);
}

function resetStores() {
  useSimStore.getState().commitParams();
  useFrontierStore.getState().clear();
  useFrontierStore.getState().setAdvisorLens('futures');
  useSimStore.setState({
    params: initialSim.params,
    committedParams: initialSim.committedParams,
    mode: initialSim.mode,
  });
}

const initial = useFrontierStore.getState();
assert.equal(initial.advisorLens, 'futures');
assert.equal(initial.status, 'idle');
initial.setAdvisorLens('frontier');
assert.equal(useFrontierStore.getState().status, 'idle');
initial.setAdvisorLens('models');
assert.equal(useFrontierStore.getState().advisorLens, 'models');

useFrontierStore.getState().begin(54);
assert.deepEqual(useFrontierStore.getState().progress, {
  completed: 0,
  total: 54,
  model: null,
});
useFrontierStore.getState().setProgress({
  completed: 7,
  total: 54,
  model: 'gbm',
});
useFrontierStore.getState().complete(frontier);
assert.equal(useFrontierStore.getState().status, 'complete');
assert.equal(useFrontierStore.getState().result, frontier);
assert.equal(useFrontierStore.getState().result.computedAt, frontier.computedAt);

useFrontierStore.getState().fail('restore failed');
assert.equal(useFrontierStore.getState().result, null);
assert.equal(useFrontierStore.getState().error, 'restore failed');
useFrontierStore.getState().clear();
assert.equal(useFrontierStore.getState().advisorLens, 'models');
assert.equal(useFrontierStore.getState().status, 'idle');

seedComplete();
const changedWithdrawal = useSimStore.getState().params.withdrawal + 100;
useSimStore.getState().setParams({ withdrawal: changedWithdrawal });
assert.equal(useFrontierStore.getState().result, frontier);
useSimStore.getState().commitParams();
assert.equal(useFrontierStore.getState().result, null);

resetStores();
seedComplete();
useSimStore.getState().setParams({
  withdrawal: useSimStore.getState().params.withdrawal + 100,
});
assert.equal(useFrontierStore.getState().result, frontier);
await new Promise((resolve) => setTimeout(resolve, PARAM_COMMIT_DEBOUNCE_MS + 25));
assert.equal(useFrontierStore.getState().result, null);

resetStores();
seedComplete();
useSimStore.getState().setParams({
  withdrawal: useSimStore.getState().params.withdrawal,
});
await new Promise((resolve) => setTimeout(resolve, PARAM_COMMIT_DEBOUNCE_MS + 25));
assert.equal(useFrontierStore.getState().result, frontier);

resetStores();
seedComplete();
useSimStore.getState().applyPreset({
  params: { withdrawal: useSimStore.getState().params.withdrawal + 100 },
});
assert.equal(useFrontierStore.getState().result, null);

resetStores();
seedComplete();
const nextModel = useSimStore.getState().params.model === 'gbm' ? 'bootstrap' : 'gbm';
useSimStore.getState().setModel(nextModel);
assert.equal(useFrontierStore.getState().result, null);

resetStores();
seedComplete();
useSimStore.getState().setModel(useSimStore.getState().params.model);
assert.equal(useFrontierStore.getState().result, frontier);

resetStores();
seedComplete();
const nextMode = useSimStore.getState().mode === 'gpu' ? 'cpu' : 'gpu';
useSimStore.getState().setMode(nextMode);
assert.equal(useFrontierStore.getState().result, null);

resetStores();
seedComplete();
useSimStore.getState().setMode(useSimStore.getState().mode);
assert.equal(useFrontierStore.getState().result, frontier);

resetStores();
seedComplete();
useSimStore.getState().setParams({
  withdrawal: useSimStore.getState().params.withdrawal + 100,
});
useSimStore.getState().setMode(useSimStore.getState().mode);
assert.equal(useFrontierStore.getState().result, null);

resetStores();
console.log('frontier store: 24 passed, 0 failed');
