import assert from 'node:assert/strict';
import {
  capacityEvaluationBudget,
  computeModelCapacity,
} from './capacity.ts';

const A5_OPTIONS = {
  currentSpending: 5_000,
  target: 0.9,
  tolerance: 0.005,
  maxBisections: 8,
  maxMonthlySpending: 100_000,
};

function outcome(successRate) {
  return {
    model: 'gbm',
    stats: { successRate },
    magnitude: {},
  };
}

{
  const calls = [];
  const progress = [];
  const run = async (monthlySpending) => {
    calls.push(monthlySpending);
    return outcome(Math.max(0, 1 - monthlySpending / 50_000));
  };
  const result = await computeModelCapacity(run, {
    ...A5_OPTIONS,
    onProgress: (completed) => progress.push(completed),
  });

  assert.equal(calls[0], 5_000);
  assert.equal(calls[1], 0);
  assert.equal(result.outcome.stats.successRate, 0.9);
  assert.equal(result.capacity90.target, 0.9);
  assert.equal(result.capacity90.tolerance, 0.005);
  assert.equal(result.capacity90.status, 'converged');
  assert.equal(result.capacity90.monthlySpending, 5_000);
  assert.equal(result.capacity90.successRate, 0.9);
  assert.ok(
    result.curve.some(
      (point) => point.monthlySpending === result.capacity90.monthlySpending,
    ),
  );
  assert.deepEqual(
    result.curve,
    [...result.curve].sort((a, b) => a.monthlySpending - b.monthlySpending),
  );
  assert.equal(
    new Set(result.curve.map(({ monthlySpending }) => monthlySpending)).size,
    result.curve.length,
  );
  assert.ok(result.capacity90.evaluations <= capacityEvaluationBudget(A5_OPTIONS));
  assert.deepEqual(progress, Array.from({ length: calls.length }, (_, index) => index + 1));
}

{
  const result = await computeModelCapacity(async () => outcome(0.89), A5_OPTIONS);
  assert.equal(result.capacity90.status, 'infeasible-at-zero');
  assert.equal(result.capacity90.monthlySpending, null);
  assert.equal(result.capacity90.successRate, null);
}

{
  const calls = [];
  const result = await computeModelCapacity(async (monthlySpending) => {
    calls.push(monthlySpending);
    return outcome(1);
  }, A5_OPTIONS);

  assert.equal(result.capacity90.status, 'unbounded-high');
  assert.equal(result.capacity90.monthlySpending, null);
  assert.equal(result.capacity90.successRate, null);
  assert.ok(calls.includes(100_000));
}

{
  const result = await computeModelCapacity(
    async (monthlySpending) => outcome(monthlySpending <= 5_001 ? 0.91 : 0.89),
    A5_OPTIONS,
  );
  const highestMeasuredFeasible = Math.max(
    ...result.curve
      .filter((point) => point.successRate >= A5_OPTIONS.target)
      .map((point) => point.monthlySpending),
  );

  assert.equal(result.capacity90.status, 'budget-exhausted');
  assert.equal(result.capacity90.monthlySpending, highestMeasuredFeasible);
  assert.ok(result.capacity90.evaluations <= capacityEvaluationBudget(A5_OPTIONS));
}

{
  const calls = [];
  await computeModelCapacity(async (monthlySpending) => {
    calls.push(monthlySpending);
    return outcome(monthlySpending === 0 ? 1 : 0);
  }, { ...A5_OPTIONS, currentSpending: 0 });
  assert.equal(calls.filter((monthlySpending) => monthlySpending === 0).length, 1);
}

{
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    computeModelCapacity(async () => {
      calls += 1;
      return outcome(1);
    }, { ...A5_OPTIONS, signal: controller.signal }),
    (error) => error?.name === 'AbortError',
  );
  assert.equal(calls, 0);
}

{
  const controller = new AbortController();
  const calls = [];
  await assert.rejects(
    computeModelCapacity(async (monthlySpending) => {
      calls.push(monthlySpending);
      controller.abort();
      return outcome(1);
    }, { ...A5_OPTIONS, signal: controller.signal }),
    (error) => error?.name === 'AbortError',
  );
  assert.deepEqual(calls, [5_000]);
}

{
  const controller = new AbortController();
  const calls = [];
  await assert.rejects(
    computeModelCapacity(async (monthlySpending) => {
      calls.push(monthlySpending);
      return outcome(1);
    }, {
      ...A5_OPTIONS,
      currentSpending: 100_000,
      signal: controller.signal,
      onProgress: (completed) => {
        if (completed === 2) controller.abort();
      },
    }),
    (error) => error?.name === 'AbortError',
  );
  assert.deepEqual(calls, [100_000, 0]);
}

{
  const result = await computeModelCapacity(async (monthlySpending) => {
    if (monthlySpending <= 7_500) return outcome(0.91);
    return outcome(0.899);
  }, A5_OPTIONS);

  assert.equal(
    result.curve.find((point) => point.monthlySpending === 7_500)?.successRate,
    0.91,
  );
  assert.equal(
    result.curve.find((point) => point.monthlySpending === 8_750)?.successRate,
    0.899,
  );
  assert.equal(result.capacity90.status, 'budget-exhausted');
  assert.equal(result.capacity90.monthlySpending, 7_500);
  assert.equal(result.capacity90.successRate, 0.91);
}

{
  const expected = new Error('runner failed');
  await assert.rejects(
    computeModelCapacity(async () => Promise.reject(expected), A5_OPTIONS),
    (error) => error === expected,
  );
}

{
  const invalidOptions = [
    { ...A5_OPTIONS, currentSpending: Number.NaN },
    { ...A5_OPTIONS, currentSpending: -1 },
    { ...A5_OPTIONS, target: 0.8 },
    { ...A5_OPTIONS, tolerance: 0.01 },
    { ...A5_OPTIONS, maxBisections: 7 },
    { ...A5_OPTIONS, maxMonthlySpending: 99_999 },
  ];

  for (const options of invalidOptions) {
    let calls = 0;
    assert.throws(
      () => computeModelCapacity(async () => {
        calls += 1;
        return outcome(1);
      }, options),
      /options|spending/i,
    );
    assert.equal(calls, 0);
  }

  assert.throws(
    () => capacityEvaluationBudget({ ...A5_OPTIONS, maxBisections: 7 }),
    /options|spending/i,
  );
}
