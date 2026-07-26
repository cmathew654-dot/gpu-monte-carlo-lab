import assert from 'node:assert/strict';
import {
  assertMonotoneCurve,
  computeRobustnessFrontier,
  frontierEvaluationBudget,
  frontierEvaluationBudgetForThreeModels,
} from './computeFrontier.ts';
import { capacityEvaluationBudget } from './capacity.ts';
import { FRONTIER_MODEL_ORDER } from './modelRegistry.ts';

const capturedParams = {
  initial: 750_000,
  monthlyContribution: 0,
  withdrawal: 5_000,
  retirementMonth: 0,
  horizonMonths: 360,
  pathCount: 100_000,
  seed: 7,
  model: 'gbm',
  mu: 0.07,
  sigma: 0.15,
  glidepath: { start: 0.8, end: 0.6 },
};

const options = {
  params: capturedParams,
  analysisPathCount: 10_000,
  engine: 'cpu',
  seed: 42,
};

function outcome(model, successRate) {
  return { model, stats: { successRate }, magnitude: {} };
}

function thresholdRunner(model, threshold, events) {
  let started = false;
  return {
    model,
    run: async (monthlySpending) => {
      if (!started) {
        started = true;
        events.push(`start:${model}`);
      }
      return outcome(model, monthlySpending <= threshold ? 0.91 : 0.89);
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function capacityBudget(withdrawal) {
  return capacityEvaluationBudget({
    currentSpending: withdrawal,
    maxBisections: 8,
    maxMonthlySpending: 100_000,
  });
}

assert.deepEqual(FRONTIER_MODEL_ORDER, [
  'gbm',
  'bootstrap',
  'fattail',
  'regime',
]);
assert.equal(frontierEvaluationBudget(0), 72);
assert.equal(frontierEvaluationBudget(5_000), 60);
assert.equal(frontierEvaluationBudget(100_000), 44);
assert.equal(frontierEvaluationBudgetForThreeModels(5_000), frontierEvaluationBudget(5_000));

{
  const events = [];
  const progress = [];
  const runners = [
    thresholdRunner('gbm', 6_000, events),
    thresholdRunner('bootstrap', 5_500, events),
    thresholdRunner('fattail', 5_750, events),
    thresholdRunner('regime', 4_750, events),
  ];
  const result = await computeRobustnessFrontier(runners, {
    ...options,
    now: () => 1_234,
    onProgress: (update) => progress.push(update),
  });

  assert.deepEqual(result.models.map(({ model }) => model), [
    'gbm',
    'bootstrap',
    'fattail',
    'regime',
  ]);
  assert.deepEqual(events.filter((event) => event.startsWith('start:')), [
    'start:gbm',
    'start:bootstrap',
    'start:fattail',
    'start:regime',
  ]);
  assert.equal(result.basis.analysisPathCount, 10_000);
  assert.equal(result.basis.engine, 'cpu');
  assert.equal(result.basis.seed, 42);
  assert.deepEqual(result.basis.params, capturedParams);
  assert.notEqual(result.basis.params, capturedParams);
  assert.notEqual(result.basis.params.glidepath, capturedParams.glidepath);
  assert.equal(result.computedAt, 1_234);
  assert.equal(
    result.robustSpend,
    Math.min(...result.models.map(({ capacity90 }) => capacity90.monthlySpending)),
  );
  assert.deepEqual(
    await computeRobustnessFrontier(runners, { ...options, now: () => 1_234 }),
    result,
  );
  assert.ok(progress.length > 0);
  assert.ok(progress.every(({ total }) => total === capacityBudget(5_000) * 4));
  assert.deepEqual(
    [...new Set(progress.map(({ model }) => model))],
    ['gbm', 'bootstrap', 'fattail', 'regime'],
  );
}

{
  const events = [];
  let active = 0;
  let peakActive = 0;
  const delayedRunner = (model, threshold) => ({
    model,
    run: async (monthlySpending) => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      events.push(`start:${model}`);
      await Promise.resolve();
      events.push(`end:${model}`);
      active -= 1;
      return outcome(model, monthlySpending <= threshold ? 0.91 : 0.89);
    },
  });

  await computeRobustnessFrontier([
    delayedRunner('gbm', 6_000),
    delayedRunner('bootstrap', 5_500),
    delayedRunner('fattail', 5_750),
    delayedRunner('regime', 4_750),
  ], options);

  assert.equal(peakActive, 1);
  assert.ok(
    events.lastIndexOf('end:gbm') < events.indexOf('start:bootstrap'),
  );
  assert.ok(
    events.lastIndexOf('end:bootstrap') < events.indexOf('start:fattail'),
  );
  assert.ok(
    events.lastIndexOf('end:fattail') < events.indexOf('start:regime'),
  );
  assert.deepEqual(
    [...new Set(events.filter((event) => event.startsWith('start:')).map(
      (event) => event.slice('start:'.length),
    ))],
    ['gbm', 'bootstrap', 'fattail', 'regime'],
  );
}

{
  const events = [];
  const regimeStarted = deferred();
  const releaseRegime = deferred();
  let settled = false;
  let regimeCalls = 0;
  const operation = computeRobustnessFrontier([
    thresholdRunner('gbm', 6_000, events),
    thresholdRunner('bootstrap', 5_500, events),
    thresholdRunner('fattail', 5_750, events),
    {
      model: 'regime',
      run: async (monthlySpending) => {
        if (regimeCalls === 0) {
          events.push('start:regime');
          regimeStarted.resolve();
          await releaseRegime.promise;
        }
        regimeCalls += 1;
        return outcome('regime', monthlySpending <= 4_750 ? 0.91 : 0.89);
      },
    },
  ], options).then((result) => {
    settled = true;
    return result;
  });

  await regimeStarted.promise;
  await Promise.resolve();
  assert.equal(settled, false, 'nothing publishes after only three models');
  assert.deepEqual(events, [
    'start:gbm', 'start:bootstrap', 'start:fattail', 'start:regime',
  ]);
  releaseRegime.resolve();
  assert.equal((await operation).models.length, 4);
}

{
  let runs = 0;
  await assert.rejects(
    computeRobustnessFrontier([
      { model: 'bootstrap', run: async () => { runs += 1; return outcome('bootstrap', 1); } },
      { model: 'gbm', run: async () => { runs += 1; return outcome('gbm', 1); } },
      { model: 'fattail', run: async () => { runs += 1; return outcome('fattail', 1); } },
      { model: 'regime', run: async () => { runs += 1; return outcome('regime', 1); } },
    ], options),
    /exact frontier model order/i,
  );
  assert.equal(runs, 0);
}

assert.throws(
  () => assertMonotoneCurve([
    { monthlySpending: 5_000, successRate: 0.89 },
    { monthlySpending: 6_000, successRate: 0.8902 },
  ], 10_000),
  /5000.*0\.89.*6000.*0\.8902/i,
);

assert.doesNotThrow(() => assertMonotoneCurve([
  { monthlySpending: 5_000, successRate: 0.89 },
  { monthlySpending: 6_000, successRate: 0.8901 },
], 10_000));

{
  const events = [];
  const expected = new Error('gbm failed');
  await assert.rejects(
    computeRobustnessFrontier([
      { model: 'gbm', run: async () => { events.push('start:gbm'); throw expected; } },
      { model: 'bootstrap', run: async () => { events.push('start:bootstrap'); return outcome('bootstrap', 1); } },
      { model: 'fattail', run: async () => { events.push('start:fattail'); return outcome('fattail', 1); } },
      { model: 'regime', run: async () => { events.push('start:regime'); return outcome('regime', 1); } },
    ], options),
    (error) => error === expected,
  );
  assert.deepEqual(events, ['start:gbm']);
}

{
  const events = [];
  await assert.rejects(
    computeRobustnessFrontier([
      { model: 'gbm', run: async () => { events.push('start:gbm'); return outcome('bootstrap', 0.89); } },
      { model: 'bootstrap', run: async () => { events.push('start:bootstrap'); return outcome('bootstrap', 1); } },
      { model: 'fattail', run: async () => { events.push('start:fattail'); return outcome('fattail', 1); } },
      { model: 'regime', run: async () => { events.push('start:regime'); return outcome('regime', 1); } },
    ], options),
    /gbm.*bootstrap/i,
  );
  assert.deepEqual(events, ['start:gbm', 'start:gbm']);
}

{
  const controller = new AbortController();
  const events = [];
  await assert.rejects(
    computeRobustnessFrontier([
      { model: 'gbm', run: async () => { events.push('start:gbm'); controller.abort(); return outcome('gbm', 1); } },
      { model: 'bootstrap', run: async () => { events.push('start:bootstrap'); return outcome('bootstrap', 1); } },
      { model: 'fattail', run: async () => { events.push('start:fattail'); return outcome('fattail', 1); } },
      { model: 'regime', run: async () => { events.push('start:regime'); return outcome('regime', 1); } },
    ], { ...options, signal: controller.signal }),
    (error) => error?.name === 'AbortError',
  );
  assert.deepEqual(events, ['start:gbm']);
}

{
  const controller = new AbortController();
  let published = false;
  await assert.rejects(
    (async () => {
      await computeRobustnessFrontier([
        { model: 'gbm', run: async () => outcome('gbm', 0.89) },
        { model: 'bootstrap', run: async () => outcome('bootstrap', 0.89) },
        { model: 'fattail', run: async () => outcome('fattail', 0.89) },
        { model: 'regime', run: async () => outcome('regime', 0.89) },
      ], {
        ...options,
        signal: controller.signal,
        now: () => {
          controller.abort();
          return 7;
        },
      });
      published = true;
    })(),
    (error) => error?.name === 'AbortError',
  );
  assert.equal(published, false);
}

{
  const result = await computeRobustnessFrontier([
    { model: 'gbm', run: async () => outcome('gbm', 1) },
    { model: 'bootstrap', run: async () => outcome('bootstrap', 1) },
    { model: 'fattail', run: async () => outcome('fattail', 1) },
    { model: 'regime', run: async () => outcome('regime', 1) },
  ], options);
  assert.equal(result.robustSpend, null);
  assert.equal(result.robustStatus, 'unbounded-high');
}

{
  const withdrawal = 0;
  const progress = [];
  await computeRobustnessFrontier([
    thresholdRunner('gbm', 0, []),
    thresholdRunner('bootstrap', 0, []),
    thresholdRunner('fattail', 0, []),
    thresholdRunner('regime', 0, []),
  ], {
    ...options,
    params: { ...capturedParams, withdrawal },
    onProgress: (update) => progress.push(update),
  });

  const expectedTotal = capacityBudget(withdrawal) * 4;
  assert.ok(progress.every(({ total }) => total === expectedTotal));
  assert.ok(progress.every(({ completed }) => completed <= expectedTotal));
  assert.ok(progress.every(
    ({ completed }, index) => index === 0 || completed > progress[index - 1].completed,
  ));
  assert.deepEqual(
    [...new Set(progress.map(({ model }) => model))],
    ['gbm', 'bootstrap', 'fattail', 'regime'],
  );
  const firstBootstrap = progress.find(({ model }) => model === 'bootstrap');
  const lastGbm = [...progress].reverse().find(({ model }) => model === 'gbm');
  assert.ok(firstBootstrap.completed - lastGbm.completed > 1);
}

{
  const result = await computeRobustnessFrontier([
    { model: 'gbm', run: async () => outcome('gbm', 0.89) },
    { model: 'bootstrap', run: async () => outcome('bootstrap', 1) },
    { model: 'fattail', run: async () => outcome('fattail', 1) },
    { model: 'regime', run: async () => outcome('regime', 1) },
  ], options);
  assert.equal(result.robustSpend, null);
  assert.equal(result.robustStatus, 'infeasible-at-zero');
}

{
  const result = await computeRobustnessFrontier([
    { model: 'gbm', run: async () => outcome('gbm', 1) },
    {
      model: 'bootstrap',
      run: async (monthlySpending) => outcome(
        'bootstrap',
        monthlySpending === 5_000 ? 0.9 : monthlySpending < 5_000 ? 0.91 : 0.89,
      ),
    },
    {
      model: 'fattail',
      run: async (monthlySpending) => outcome(
        'fattail',
        monthlySpending <= 7_000 ? 0.91 : 0.89,
      ),
    },
    thresholdRunner('regime', 4_500, []),
  ], options);
  assert.equal(result.models[0].capacity90.status, 'unbounded-high');
  assert.equal(
    result.robustSpend,
    result.models.find(({ model }) => model === 'regime').capacity90.monthlySpending,
  );
  assert.ok(result.robustSpend < 5_000);
  assert.equal(result.robustStatus, 'budget-exhausted');
}

{
  const result = await computeRobustnessFrontier([
    thresholdRunner('gbm', 5_001, []),
    thresholdRunner('bootstrap', 6_000, []),
    thresholdRunner('fattail', 7_000, []),
    { model: 'regime', run: async () => outcome('regime', 1) },
  ], options);
  assert.equal(result.models[0].capacity90.status, 'budget-exhausted');
  assert.equal(result.robustSpend, result.models[0].capacity90.monthlySpending);
  assert.equal(result.robustStatus, 'budget-exhausted');
}

{
  const result = await computeRobustnessFrontier([
    thresholdRunner('gbm', 5_001, []),
    {
      model: 'bootstrap',
      run: async (monthlySpending) => outcome(
        'bootstrap',
        monthlySpending <= 5_000 ? 0.9 : 0.89,
      ),
    },
    { model: 'fattail', run: async () => outcome('fattail', 1) },
    { model: 'regime', run: async () => outcome('regime', 1) },
  ], options);
  assert.equal(result.models[0].capacity90.status, 'budget-exhausted');
  assert.equal(result.models[1].capacity90.status, 'converged');
  assert.equal(result.models[0].capacity90.monthlySpending, 5_000);
  assert.equal(result.models[1].capacity90.monthlySpending, 5_000);
  assert.equal(result.robustSpend, 5_000);
  assert.equal(result.robustStatus, 'budget-exhausted');
}
