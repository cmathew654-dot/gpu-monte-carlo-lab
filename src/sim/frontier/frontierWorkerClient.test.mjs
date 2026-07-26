import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FrontierWorkerClient } from './frontierWorkerClient.ts';

function params(overrides = {}) {
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
    seed: 42,
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    type: 'compute-frontier',
    params: params(),
    analysisPathCount: 10_000,
    bootstrapBlocks: new ArrayBuffer(48),
    bondBlocks: new ArrayBuffer(48),
    ...overrides,
  };
}

function result(computedAt) {
  return {
    basis: {
      params: params(),
      analysisPathCount: 10_000,
      engine: 'cpu',
      seed: 42,
    },
    models: [],
    robustSpend: null,
    robustStatus: 'unbounded-high',
    computedAt,
  };
}

function nextTurn() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class FakeWorker {
  onmessage = null;
  onerror = null;
  retainedMessageHandler = null;
  retainedErrorHandler = null;
  terminateCalls = 0;
  posts = [];
  postFailure = null;

  postMessage(message, transfer) {
    if (this.postFailure) throw this.postFailure;
    this.retainedMessageHandler = this.onmessage;
    this.retainedErrorHandler = this.onerror;
    this.posts.push({ message, transfer });
  }

  terminate() {
    this.terminateCalls += 1;
  }

  emit(message) {
    (this.onmessage ?? this.retainedMessageHandler)?.({ data: message });
  }

  emitWorkerError(message) {
    (this.onerror ?? this.retainedErrorHandler)?.({ message });
  }
}

{
  const workers = [];
  const client = new FrontierWorkerClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const firstRequest = request();
  const firstTransfers = [
    firstRequest.bootstrapBlocks,
    firstRequest.bondBlocks,
  ];
  let secondSettled = false;

  const first = client.run(firstRequest, firstTransfers);
  const firstWorker = workers[0];
  const firstToken = firstWorker.posts[0].message.token;
  assert.equal(firstWorker.posts[0].message.bootstrapBlocks, firstRequest.bootstrapBlocks);
  assert.equal(firstWorker.posts[0].message.bondBlocks, firstRequest.bondBlocks);
  assert.deepEqual(firstWorker.posts[0].transfer, firstTransfers);

  const secondRequest = request();
  const second = client.run(secondRequest, [
    secondRequest.bootstrapBlocks,
    secondRequest.bondBlocks,
  ]).then((value) => {
    secondSettled = true;
    return value;
  });
  const secondWorker = workers[1];
  const secondToken = secondWorker.posts[0].message.token;

  assert.equal(firstWorker.terminateCalls, 1);
  await assert.rejects(first, (error) => error?.name === 'AbortError');

  firstWorker.emit({
    type: 'frontier-result',
    token: firstToken,
    result: result(1),
  });
  await nextTurn();
  assert.equal(secondSettled, false);

  secondWorker.emit({
    type: 'frontier-result',
    token: secondToken,
    result: result(2),
  });
  assert.equal((await second).computedAt, 2);
  assert.equal(secondWorker.terminateCalls, 1);
  client.dispose();
  assert.equal(secondWorker.terminateCalls, 1);
}

{
  const workers = [];
  const progress = [];
  const client = new FrontierWorkerClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const current = request();
  let settled = false;
  const operation = client.run(
    current,
    [current.bootstrapBlocks, current.bondBlocks],
    (update) => progress.push(update),
  ).then(
    (value) => {
      settled = true;
      return value;
    },
    (error) => {
      settled = true;
      throw error;
    },
  );
  const worker = workers[0];
  const token = worker.posts[0].message.token;

  worker.emit({
    type: 'frontier-progress',
    token: token + 1,
    progress: { completed: 1, total: 45, model: 'gbm' },
  });
  worker.emit({
    type: 'frontier-result',
    token: token + 1,
    result: result(3),
  });
  await nextTurn();
  assert.equal(settled, false);
  assert.deepEqual(progress, []);

  const ownedProgress = { completed: 2, total: 45, model: 'gbm' };
  worker.emit({
    type: 'frontier-progress',
    token,
    progress: ownedProgress,
  });
  assert.deepEqual(progress, [ownedProgress]);
  assert.equal(worker.terminateCalls, 0);

  worker.emit({
    type: 'frontier-result',
    token,
    result: result(4),
  });
  assert.equal((await operation).computedAt, 4);
  assert.equal(worker.terminateCalls, 1);

  worker.emit({
    type: 'frontier-progress',
    token,
    progress: { completed: 3, total: 45, model: 'gbm' },
  });
  worker.emit({
    type: 'frontier-error',
    token,
    message: 'late duplicate',
  });
  assert.deepEqual(progress, [ownedProgress]);
  assert.equal(worker.terminateCalls, 1);
}

{
  const workers = [];
  const client = new FrontierWorkerClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const failed = request();
  const operation = client.run(failed, [
    failed.bootstrapBlocks,
    failed.bondBlocks,
  ]);
  const worker = workers[0];
  const token = worker.posts[0].message.token;
  worker.emit({
    type: 'frontier-error',
    token,
    message: 'CPU frontier failed',
  });
  await assert.rejects(operation, /CPU frontier failed/);
  assert.equal(worker.terminateCalls, 1);
}

{
  const workers = [];
  const client = new FrontierWorkerClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const failed = request();
  const operation = client.run(failed, [
    failed.bootstrapBlocks,
    failed.bondBlocks,
  ]);
  const worker = workers[0];
  worker.emitWorkerError('frontier worker crashed');
  await assert.rejects(operation, /frontier worker crashed/);
  assert.equal(worker.terminateCalls, 1);
  worker.emitWorkerError('duplicate crash');
  assert.equal(worker.terminateCalls, 1);
}

{
  const workers = [];
  const failure = new Error('postMessage rejected the transfer');
  const client = new FrontierWorkerClient(() => {
    const worker = new FakeWorker();
    if (workers.length === 0) worker.postFailure = failure;
    workers.push(worker);
    return worker;
  });
  const failed = request();
  await assert.rejects(
    client.run(failed, [failed.bootstrapBlocks, failed.bondBlocks]),
    (error) => error === failure,
  );
  assert.equal(workers[0].terminateCalls, 1);

  workers[0].postFailure = null;
  const replacement = request();
  const operation = client.run(replacement, [
    replacement.bootstrapBlocks,
    replacement.bondBlocks,
  ]);
  const currentWorker = workers[1];
  const token = currentWorker.posts[0].message.token;
  workers[0].emit({
    type: 'frontier-result',
    token,
    result: result(5),
  });
  currentWorker.emit({
    type: 'frontier-result',
    token,
    result: result(6),
  });
  assert.equal((await operation).computedAt, 6);
  assert.equal(currentWorker.terminateCalls, 1);
}

{
  const workers = [];
  const client = new FrontierWorkerClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const cancelled = request();
  const operation = client.run(cancelled, [
    cancelled.bootstrapBlocks,
    cancelled.bondBlocks,
  ]);
  const worker = workers[0];
  const token = worker.posts[0].message.token;
  client.cancel();
  assert.equal(worker.terminateCalls, 1);
  await assert.rejects(operation, (error) => error?.name === 'AbortError');
  worker.emit({
    type: 'frontier-result',
    token,
    result: result(7),
  });
  worker.emit({
    type: 'frontier-error',
    token,
    message: 'stale after cancel',
  });
  assert.equal(worker.terminateCalls, 1);

  const disposed = request();
  const disposedOperation = client.run(disposed, [
    disposed.bootstrapBlocks,
    disposed.bondBlocks,
  ]);
  const disposedWorker = workers[1];
  const disposedToken = disposedWorker.posts[0].message.token;
  client.dispose();
  client.dispose();
  assert.equal(disposedWorker.terminateCalls, 1);
  await assert.rejects(disposedOperation, (error) => error?.name === 'AbortError');
  disposedWorker.emit({
    type: 'frontier-result',
    token: disposedToken,
    result: result(8),
  });
  await assert.rejects(
    client.run(disposed, [disposed.bootstrapBlocks, disposed.bondBlocks]),
    /disposed/i,
  );
  assert.equal(workers.length, 2);
  assert.equal(disposedWorker.terminateCalls, 1);
}

const frozenWorkerSource = await readFile(
  new URL('../../src/ui/cpuSim.worker.ts', import.meta.url),
  'utf8',
);
assert.match(frozenWorkerSource, /type:\s*'run'/);
assert.doesNotMatch(frozenWorkerSource, /compute-frontier/);

const frontierWorkerSource = await readFile(
  new URL('../../src/ui/frontier.worker.ts', import.meta.url),
  'utf8',
);
assert.match(frontierWorkerSource, /computeCpuFrontier/);
assert.match(frontierWorkerSource, /frontier-progress/);
assert.match(frontierWorkerSource, /frontier-result/);
assert.match(frontierWorkerSource, /frontier-error/);
