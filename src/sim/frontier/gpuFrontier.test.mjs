import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runGpuRobustnessFrontier } from './gpuFrontier.ts';

const FRONTIER_MODELS = ['gbm', 'bootstrap', 'fattail', 'regime'];

function capturedParams(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function successRate(model, params) {
  const threshold = {
    gbm: 5_000,
    bootstrap: 6_000,
    fattail: 5_500,
    regime: 4_750,
  }[model];
  return params.withdrawal <= threshold ? 0.9 : 0.89;
}

function outcome(model, params) {
  const base = {
    model,
    stats: { successRate: successRate(model, params) },
    magnitude: {},
  };
  return model === 'regime'
    ? {
        ...base,
        initialization: 'latest-filtered',
        calibrationAsOf: '2026-06',
      }
    : base;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function loggedDependencies(log, hooks = {}) {
  return {
    runSimulation: async (params, signal) => {
      const entry = { kind: 'run', params, signal };
      log.push(entry);
      await hooks.runSimulation?.(params, signal, entry);
    },
    readOutcome: async (params, signal) => {
      const entry = { kind: 'read', params, signal };
      log.push(entry);
      if (hooks.readOutcome) return hooks.readOutcome(params, signal, entry);
      return outcome(params.model, params);
    },
    runRegimeSimulation: async (params, signal) => {
      const entry = { kind: 'regime-run', params, signal };
      log.push(entry);
      await hooks.runRegimeSimulation?.(params, signal, entry);
    },
    readRegimeOutcome: async (params, signal) => {
      const entry = { kind: 'regime-read', params, signal };
      log.push(entry);
      if (hooks.readRegimeOutcome) {
        return hooks.readRegimeOutcome(params, signal, entry);
      }
      return outcome('regime', params);
    },
    now: hooks.now ?? (() => 1_234),
  };
}

function candidateModel(entry) {
  return entry.kind === 'regime-run' ? 'regime' : entry.params.model;
}

function runEntries(log) {
  return log.filter(({ kind }) => kind === 'run');
}

function readEntries(log) {
  return log.filter(({ kind }) => kind === 'read' || kind === 'regime-read');
}

function pairedCandidateRuns(log) {
  const readParams = new Set(readEntries(log).map(({ params }) => params));
  return log.filter(({ kind, params }) => (
    (kind === 'run' || kind === 'regime-run') && readParams.has(params)
  ));
}

function unpairedRestoreRuns(log) {
  const readParams = new Set(readEntries(log).map(({ params }) => params));
  return runEntries(log).filter(({ params }) => !readParams.has(params));
}

{
  const params = capturedParams();
  const log = [];
  const progress = [];
  const result = await runGpuRobustnessFrontier(loggedDependencies(log), {
    params,
    onProgress: (update) => progress.push(update),
  });
  const candidates = pairedCandidateRuns(log);
  const candidateParams = new Set(candidates.map(({ params: candidate }) => candidate));
  const firstEvaluationByModel = [];
  const seenModels = new Set();
  for (const entry of log) {
    if (
      (entry.kind === 'run' || entry.kind === 'regime-run')
      && candidateParams.has(entry.params)
      && !seenModels.has(candidateModel(entry))
    ) {
      seenModels.add(candidateModel(entry));
      firstEvaluationByModel.push(candidateModel(entry));
    }
  }

  assert.deepEqual(firstEvaluationByModel, FRONTIER_MODELS);
  assert.ok(log.every((entry) => entry.kind !== 'store-write'));
  assert.equal(result.basis.analysisPathCount, 100_000);
  assert.equal(result.basis.engine, 'gpu');
  assert.deepEqual(result.models.map(({ model }) => model), FRONTIER_MODELS);
  const regime = result.models.find(({ model }) => model === 'regime');
  assert.ok(regime);
  assert.equal(regime.outcome.initialization, 'latest-filtered');
  assert.equal(regime.outcome.calibrationAsOf, '2026-06');
  assert.equal(
    result.robustSpend,
    regime.capacity90.monthlySpending,
    'the regime lens must constrain the complete-result robust spend',
  );
  assert.ok(result.robustSpend < 5_000);
  assert.equal(new Set(candidates.map(({ params: candidate }) => candidate)).size, candidates.length);
  assert.ok(candidates.every(({ params: candidate }) => candidate !== params));
  assert.ok(candidates.every(({ params: candidate }) => candidate.pathCount === 100_000));
  assert.ok(candidates.every(({ params: candidate }) => candidate.seed === params.seed));
  assert.ok(candidates.every((candidate) => (
    FRONTIER_MODELS.includes(candidateModel(candidate))
  )));

  for (const read of readEntries(log)) {
    const readIndex = log.indexOf(read);
    const run = log[readIndex - 1];
    assert.equal(
      run.kind,
      read.kind === 'regime-read' ? 'regime-run' : 'run',
    );
    assert.equal(run.params, read.params);
    assert.equal(run.params.withdrawal, read.params.withdrawal);
    assert.equal(run.params.seed, read.params.seed);
    assert.equal(run.params.pathCount, read.params.pathCount);
  }
  for (const modelResult of result.models) {
    const measured = candidates
      .filter((candidate) => candidateModel(candidate) === modelResult.model)
      .map(({ params: candidate }) => candidate.withdrawal)
      .sort((left, right) => left - right);
    const curve = modelResult.curve
      .map(({ monthlySpending }) => monthlySpending)
      .sort((left, right) => left - right);
    assert.deepEqual(measured, curve);
  }

  const restores = unpairedRestoreRuns(log);
  assert.equal(restores.length, 1);
  assert.equal(log.at(-1), restores[0]);
  assert.deepEqual(restores[0].params, params);
  assert.notEqual(restores[0].params, params);
  assert.ok(candidates.every(({ params: candidate }) => candidate !== restores[0].params));
  assert.ok(progress.length > 0);
  assert.deepEqual([...new Set(progress.map(({ model }) => model))], FRONTIER_MODELS);
}

{
  const params = capturedParams({ pathCount: 100_000 });
  const log = [];
  await runGpuRobustnessFrontier(loggedDependencies(log), { params });
  assert.ok(runEntries(log).every(({ params: runParams }) => runParams.pathCount === 100_000));
  const restores = unpairedRestoreRuns(log);
  assert.equal(restores.length, 1);
  assert.deepEqual(restores[0].params, params);
}

{
  const params = capturedParams();
  const snapshot = structuredClone(params);
  const log = [];
  const firstRunStarted = deferred();
  const releaseFirstRun = deferred();
  let runCount = 0;
  const operation = runGpuRobustnessFrontier(loggedDependencies(log, {
    runSimulation: async () => {
      runCount += 1;
      if (runCount === 1) {
        firstRunStarted.resolve();
        await releaseFirstRun.promise;
      }
    },
  }), { params });

  await firstRunStarted.promise;
  params.model = 'fattail';
  params.pathCount = 1_000_000;
  params.withdrawal = 99_999;
  params.seed = 999;
  params.glidepath.start = 0.1;
  params.glidepath.end = 0.2;
  releaseFirstRun.resolve();
  const result = await operation;

  assert.deepEqual(result.basis.params, snapshot);
  const restores = unpairedRestoreRuns(log);
  assert.equal(restores.length, 1);
  assert.deepEqual(restores[0].params, snapshot);
  assert.ok(pairedCandidateRuns(log).every(({ params: candidate }) => (
    candidate.seed === snapshot.seed
    && candidate.pathCount === 100_000
    && candidate.glidepath.start === snapshot.glidepath.start
    && candidate.glidepath.end === snapshot.glidepath.end
  )));
}

{
  const params = capturedParams();
  const controller = new AbortController();
  const log = [];
  const original = new Error('regime candidate failed');
  await assert.rejects(
    runGpuRobustnessFrontier(loggedDependencies(log, {
      runRegimeSimulation: async () => { throw original; },
    }), { params, signal: controller.signal }),
    (error) => error === original,
  );
  assert.deepEqual(
    [...new Set(pairedCandidateRuns(log).map(candidateModel))],
    FRONTIER_MODELS.slice(0, 3),
  );
  assert.equal(log.filter(({ kind }) => kind === 'regime-run').length, 1);
  assert.equal(log.filter(({ kind }) => kind === 'regime-read').length, 0);
  const restores = unpairedRestoreRuns(log);
  assert.equal(restores.length, 1);
  assert.equal(restores[0].signal, undefined);
  assert.deepEqual(restores[0].params, params);
}

{
  const params = capturedParams();
  const controller = new AbortController();
  const log = [];
  const concurrentFailure = new Error('regime rejected while aborting');
  await assert.rejects(
    runGpuRobustnessFrontier(loggedDependencies(log, {
      runRegimeSimulation: async () => {
        controller.abort();
        throw concurrentFailure;
      },
    }), { params, signal: controller.signal }),
    (error) => error?.name === 'AbortError' && error !== concurrentFailure,
  );
  assert.equal(log.filter(({ kind }) => kind === 'regime-run').length, 1);
  assert.equal(log.filter(({ kind }) => kind === 'regime-read').length, 0);
  assert.equal(unpairedRestoreRuns(log).length, 0);
}

{
  const params = capturedParams();
  const controller = new AbortController();
  const log = [];
  const original = new Error('regime read failed');
  const restoreFailure = new Error('restore failed after regime');
  await assert.rejects(
    runGpuRobustnessFrontier(loggedDependencies(log, {
      runSimulation: async (_runParams, signal) => {
        if (!signal) throw restoreFailure;
      },
      readRegimeOutcome: async () => { throw original; },
    }), { params, signal: controller.signal }),
    (error) => error instanceof AggregateError
      && error.errors.length === 2
      && error.errors[0] === original
      && error.errors[1] === restoreFailure,
  );
  assert.equal(log.filter(({ kind }) => kind === 'regime-run').length, 1);
  assert.equal(log.filter(({ kind }) => kind === 'regime-read').length, 1);
  assert.equal(runEntries(log).filter(({ signal }) => signal === undefined).length, 1);
}

{
  const params = capturedParams();
  await assert.rejects(
    runGpuRobustnessFrontier({
      runSimulation: async () => {},
      readOutcome: async (runParams) => outcome(runParams.model, runParams),
    }, { params }),
    /GPU regime frontier requires a renderer or injected regime runner/,
  );
}

{
  const params = capturedParams();
  const controller = new AbortController();
  const log = [];
  const original = new Error('read failed');
  await assert.rejects(
    runGpuRobustnessFrontier(loggedDependencies(log, {
      readOutcome: async () => { throw original; },
    }), { params, signal: controller.signal }),
    (error) => error === original,
  );
  assert.equal(runEntries(log).length, 2);
  assert.equal(readEntries(log).length, 1);
  assert.equal(runEntries(log)[0].params, readEntries(log)[0].params);
  assert.equal(runEntries(log)[1].signal, undefined);
  assert.deepEqual(runEntries(log)[1].params, params);
}

{
  const params = capturedParams();
  const controller = new AbortController();
  const log = [];
  const externalAbort = new Error('dependency aborted independently');
  externalAbort.name = 'AbortError';
  await assert.rejects(
    runGpuRobustnessFrontier(loggedDependencies(log, {
      readOutcome: async () => { throw externalAbort; },
    }), { params, signal: controller.signal }),
    (error) => error === externalAbort,
  );
  assert.equal(runEntries(log).length, 2);
  assert.equal(runEntries(log)[1].signal, undefined);
}

{
  const params = capturedParams();
  const controller = new AbortController();
  const log = [];
  const original = new Error('candidate failed');
  await assert.rejects(
    runGpuRobustnessFrontier(loggedDependencies(log, {
      runSimulation: async (_runParams, signal) => {
        if (signal) throw original;
      },
    }), { params, signal: controller.signal }),
    (error) => error === original,
  );
  assert.equal(runEntries(log).length, 2);
  assert.equal(runEntries(log)[1].signal, undefined);
}

{
  const params = capturedParams();
  const controller = new AbortController();
  const log = [];
  const restoreFailure = new Error('restore failed');
  let artifact;
  await assert.rejects(
    runGpuRobustnessFrontier(loggedDependencies(log, {
      runSimulation: async (_runParams, signal) => {
        if (!signal) throw restoreFailure;
      },
    }), { params, signal: controller.signal }).then((result) => { artifact = result; }),
    (error) => error === restoreFailure,
  );
  assert.equal(artifact, undefined);
  assert.equal(runEntries(log).filter(({ signal }) => signal === undefined).length, 1);
}

{
  const params = capturedParams();
  const controller = new AbortController();
  const log = [];
  const original = new Error('read failed');
  const restoreFailure = new Error('restore failed');
  await assert.rejects(
    runGpuRobustnessFrontier(loggedDependencies(log, {
      runSimulation: async (_runParams, signal) => {
        if (!signal) throw restoreFailure;
      },
      readOutcome: async () => { throw original; },
    }), { params, signal: controller.signal }),
    (error) => error instanceof AggregateError
      && error.errors.length === 2
      && error.errors[0] === original
      && error.errors[1] === restoreFailure,
  );
  assert.equal(runEntries(log).length, 2);
  assert.equal(runEntries(log).filter(({ signal }) => signal === undefined).length, 1);
}

{
  const params = capturedParams();
  const controller = new AbortController();
  const log = [];
  const concurrentFailure = new Error('candidate rejected while aborting');
  await assert.rejects(
    runGpuRobustnessFrontier(loggedDependencies(log, {
      runSimulation: async (_runParams, signal) => {
        if (signal) {
          controller.abort();
          throw concurrentFailure;
        }
      },
    }), { params, signal: controller.signal }),
    (error) => error?.name === 'AbortError' && error !== concurrentFailure,
  );
  assert.equal(runEntries(log).length, 1);
}

{
  const params = capturedParams();
  const controller = new AbortController();
  const log = [];
  const concurrentReadFailure = new Error('read rejected while aborting');
  let artifact;
  await assert.rejects(
    runGpuRobustnessFrontier(loggedDependencies(log, {
      readOutcome: async () => {
        controller.abort();
        throw concurrentReadFailure;
      },
    }), { params, signal: controller.signal }).then((result) => { artifact = result; }),
    (error) => error?.name === 'AbortError' && error !== concurrentReadFailure,
  );
  assert.equal(artifact, undefined);
  assert.equal(runEntries(log).length, 1);
  assert.equal(runEntries(log)[0].signal, controller.signal);
  assert.equal(runEntries(log).filter(({ signal }) => signal === undefined).length, 0);
  assert.equal(readEntries(log).length, 1);
}

{
  const params = capturedParams();
  const controller = new AbortController();
  const log = [];
  const restoreStarted = deferred();
  const releaseRestore = deferred();
  let artifact;
  const operation = runGpuRobustnessFrontier(loggedDependencies(log, {
    runSimulation: async (_runParams, signal) => {
      if (!signal) {
        restoreStarted.resolve();
        await releaseRestore.promise;
      }
    },
  }), { params, signal: controller.signal }).then((result) => { artifact = result; });
  await restoreStarted.promise;
  controller.abort();
  releaseRestore.resolve();
  await assert.rejects(operation, (error) => error?.name === 'AbortError');
  assert.equal(artifact, undefined);
  assert.equal(runEntries(log).filter(({ signal }) => signal === undefined).length, 1);
}

{
  const params = capturedParams();
  const controller = new AbortController();
  const log = [];
  const restoreStarted = deferred();
  const releaseRestore = deferred();
  const restoreFailure = new Error('restore rejected while aborting');
  let artifact;
  const operation = runGpuRobustnessFrontier(loggedDependencies(log, {
    runSimulation: async (_runParams, signal) => {
      if (!signal) {
        restoreStarted.resolve();
        await releaseRestore.promise;
        throw restoreFailure;
      }
    },
  }), { params, signal: controller.signal }).then((result) => { artifact = result; });
  await restoreStarted.promise;
  controller.abort();
  releaseRestore.resolve();
  await assert.rejects(
    operation,
    (error) => error?.name === 'AbortError' && error !== restoreFailure,
  );
  assert.equal(artifact, undefined);
  assert.equal(runEntries(log).filter(({ signal }) => signal === undefined).length, 1);
}

{
  const params = capturedParams();
  const controller = new AbortController();
  const log = [];
  const restoreStarted = deferred();
  const releaseRestore = deferred();
  const original = new Error('read failed before restore abort');
  const operation = runGpuRobustnessFrontier(loggedDependencies(log, {
    runSimulation: async (_runParams, signal) => {
      if (!signal) {
        restoreStarted.resolve();
        await releaseRestore.promise;
      }
    },
    readOutcome: async () => { throw original; },
  }), { params, signal: controller.signal });
  await restoreStarted.promise;
  controller.abort();
  releaseRestore.resolve();
  await assert.rejects(
    operation,
    (error) => error?.name === 'AbortError' && error !== original,
  );
  assert.equal(runEntries(log).length, 2);
  assert.equal(runEntries(log).filter(({ signal }) => signal === undefined).length, 1);
}

{
  const params = capturedParams();
  const controller = new AbortController();
  const log = [];
  const restoreStarted = deferred();
  const releaseRestore = deferred();
  const original = new Error('read failed before restore rejection');
  const restoreFailure = new Error('restore failed while aborting');
  const operation = runGpuRobustnessFrontier(loggedDependencies(log, {
    runSimulation: async (_runParams, signal) => {
      if (!signal) {
        restoreStarted.resolve();
        await releaseRestore.promise;
        throw restoreFailure;
      }
    },
    readOutcome: async () => { throw original; },
  }), { params, signal: controller.signal });
  await restoreStarted.promise;
  controller.abort();
  releaseRestore.resolve();
  await assert.rejects(
    operation,
    (error) => error?.name === 'AbortError'
      && error !== original
      && error !== restoreFailure
      && !(error instanceof AggregateError),
  );
  assert.equal(runEntries(log).length, 2);
  assert.equal(runEntries(log).filter(({ signal }) => signal === undefined).length, 1);
}

{
  const params = capturedParams();
  const controller = new AbortController();
  const log = [];
  await assert.rejects(
    runGpuRobustnessFrontier(loggedDependencies(log, {
      now: () => {
        controller.abort();
        return 1;
      },
    }), { params, signal: controller.signal }),
    (error) => error?.name === 'AbortError',
  );
  assert.equal(runEntries(log).filter(({ signal }) => signal === undefined).length, 0);
}

const moduleText = await readFile(
  new URL('../../src/sim/frontier/gpuFrontier.ts', import.meta.url),
  'utf8',
);
assert.doesNotMatch(moduleText, /zustand|store\//i);

const runtimeSource = await readFile(
  new URL('../../src/scene/simRuntime.ts', import.meta.url),
  'utf8',
);
assert.match(runtimeSource, /requestRobustnessFrontier/);
assert.match(runtimeSource, /requestSafeWithdrawal/);
