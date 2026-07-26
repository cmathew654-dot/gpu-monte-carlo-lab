import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runGpuRobustnessFrontier } from './gpuFrontier.ts';

const captured = {
  model: 'bootstrap',
  pathCount: 10_000,
  horizonYears: 30,
  retireYear: 0,
  initialWealth: 1_000_000,
  contribution: 2_000,
  withdrawal: 5_000,
  mu: 0.07,
  sigma: 0.15,
  glidepath: { start: 0.8, end: 0.6 },
  seed: 73,
};

function abortError() {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

function successRate(params) {
  const threshold = { gbm: 5_000, bootstrap: 6_000, fattail: 5_500 }[params.model];
  return params.withdrawal <= threshold ? 0.9 : 0.89;
}

function loggedDependencies(log, overrides = {}) {
  return {
    runSimulation: async (params) => {
      const restore = params.pathCount === captured.pathCount;
      log.push({
        kind: 'run',
        model: params.model,
        spending: params.withdrawal,
        paths: params.pathCount,
        seed: params.seed,
        restore,
      });
    },
    readOutcome: async (params) => {
      log.push({
        kind: 'read',
        model: params.model,
        spending: params.withdrawal,
        paths: params.pathCount,
        seed: params.seed,
      });
      return { model: params.model, stats: { successRate: successRate(params) }, magnitude: {} };
    },
    now: () => 1_234,
    ...overrides,
  };
}

{
  const log = [];
  const progress = [];
  const result = await runGpuRobustnessFrontier(loggedDependencies(log), {
    params: captured,
    onProgress: (update) => progress.push(update),
  });
  const firstEvaluationByModel = ['gbm', 'bootstrap', 'fattail'].map(
    (model) => log.find((entry) => entry.kind === 'run' && !entry.restore && entry.model === model)?.model,
  );

  assert.deepEqual(firstEvaluationByModel, ['gbm', 'bootstrap', 'fattail']);
  assert.ok(log.every((entry) => entry.kind !== 'store-write'));
  assert.deepEqual(log.at(-1), {
    kind: 'run',
    model: captured.model,
    spending: captured.withdrawal,
    paths: captured.pathCount,
    seed: captured.seed,
    restore: true,
  });
  assert.equal(result.basis.analysisPathCount, 100_000);
  assert.equal(result.basis.engine, 'gpu');
  const candidates = log.filter((entry) => entry.kind === 'run' && !entry.restore);
  assert.ok(candidates.every((entry) => entry.paths === 100_000));
  assert.ok(candidates.every((entry) => entry.seed === captured.seed));
  assert.ok(candidates.every((entry) => ['gbm', 'bootstrap', 'fattail'].includes(entry.model)));
  assert.ok(progress.length > 0);
  assert.deepEqual([...new Set(progress.map(({ model }) => model))], [
    'gbm',
    'bootstrap',
    'fattail',
  ]);
}

{
  const controller = new AbortController();
  const log = [];
  await assert.rejects(
    runGpuRobustnessFrontier(loggedDependencies(log, {
      runSimulation: async (params) => {
        log.push({ kind: 'run', paths: params.pathCount });
        if (params.pathCount === 100_000) controller.abort();
      },
    }), { params: captured, signal: controller.signal }),
    (error) => error?.name === 'AbortError',
  );
  assert.equal(log.filter((entry) => entry.kind === 'run' && entry.paths === captured.pathCount).length, 0);
}

{
  const log = [];
  const original = new Error('candidate failed');
  let calls = 0;
  await assert.rejects(
    runGpuRobustnessFrontier(loggedDependencies(log, {
      runSimulation: async (params) => {
        calls += 1;
        log.push({ kind: 'run', params });
        if (params.pathCount === 100_000) throw original;
      },
    }), { params: captured }),
    (error) => error === original,
  );
  assert.equal(calls, 2);
  assert.deepEqual(log.at(-1).params, captured);
}

{
  const log = [];
  const restoreFailure = new Error('restore failed');
  await assert.rejects(
    runGpuRobustnessFrontier(loggedDependencies(log, {
      runSimulation: async (params) => {
        log.push({ kind: 'run', params });
        if (params.pathCount === captured.pathCount) throw restoreFailure;
      },
    }), { params: captured }),
    (error) => error === restoreFailure,
  );
  assert.equal(log.filter(({ kind }) => kind === 'run').length > 1, true);
}

{
  const log = [];
  const original = new Error('read failed');
  const restoreFailure = new Error('restore failed');
  await assert.rejects(
    runGpuRobustnessFrontier(loggedDependencies(log, {
      runSimulation: async (params) => {
        log.push({ kind: 'run', params });
        if (params.pathCount === captured.pathCount) throw restoreFailure;
      },
      readOutcome: async () => { throw original; },
    }), { params: captured }),
    (error) => error instanceof AggregateError
      && error.errors[0] === original
      && error.errors[1] === restoreFailure,
  );
  assert.equal(log.filter(({ kind }) => kind === 'run' && kind === 'run').length, 2);
}

{
  const controller = new AbortController();
  const log = [];
  await assert.rejects(
    runGpuRobustnessFrontier(loggedDependencies(log, {
      now: () => {
        controller.abort();
        return 1;
      },
    }), { params: captured, signal: controller.signal }),
    (error) => error?.name === 'AbortError',
  );
  assert.equal(log.filter((entry) => entry.kind === 'run' && entry.paths === captured.pathCount).length, 0);
}

const moduleText = await readFile(
  new URL('../../src/sim/frontier/gpuFrontier.ts', import.meta.url),
  'utf8',
);
assert.doesNotMatch(moduleText, /zustand|store\//i);
assert.equal(typeof abortError, 'function');
