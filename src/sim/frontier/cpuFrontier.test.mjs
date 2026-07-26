import assert from 'node:assert/strict';
import test from 'node:test';

import {
  makeSyntheticBondBlocks,
  makeSyntheticBootstrapBlocks,
} from '../model/bootstrap.ts';
import {
  computeCpuFrontier,
  CPU_FRONTIER_PATH_COUNT,
} from './cpuFrontier.ts';
import { toRegimeOutcome } from './modelRegistry.ts';

const FIXED_NOW = 123_456;

function makeParams() {
  return {
    model: 'bootstrap',
    pathCount: 100_000,
    horizonYears: 1,
    retireYear: 0,
    initialWealth: 1_000_000,
    contribution: 2_000,
    withdrawal: 5_000,
    mu: 0.07,
    sigma: 0.15,
    glidepath: { start: 0.8, end: 0.6 },
    seed: 42,
  };
}

function makeRequest() {
  const equity = makeSyntheticBootstrapBlocks(64);
  const bonds = makeSyntheticBondBlocks(64);
  return {
    type: 'compute-frontier',
    token: 7,
    params: makeParams(),
    analysisPathCount: 10_000,
    bootstrapBlocks: equity.blocks.slice().buffer,
    bondBlocks: bonds.slice().buffer,
  };
}

function assertFiniteTree(value, path = 'result') {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} must be finite`);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  assert.equal(ArrayBuffer.isView(value), false, `${path} must not contain typed arrays`);
  for (const [key, child] of Object.entries(value)) {
    assert.notEqual(key, 'terminalWealth', `${path} leaked terminalWealth`);
    assert.notEqual(key, 'maxDrawdown', `${path} leaked maxDrawdown`);
    assert.notEqual(key, 'failureStep', `${path} leaked failureStep`);
    assert.notEqual(key, 'history', `${path} leaked history`);
    assert.notEqual(key, 'elapsedMs', `${path} leaked elapsedMs`);
    assertFiniteTree(child, `${path}.${key}`);
  }
}

test('toRegimeOutcome strips runtime-only fields and adds calibration metadata', () => {
  const outcome = toRegimeOutcome({
    stats: {
      successRate: 0.91,
      percentiles: { p5: 1, p25: 2, p50: 3, p75: 4, p95: 5 },
      worstDecileMaxDD: 0.4,
      safeWithdrawalRate: 999,
      medianFailureYear: null,
      computedAt: 111,
    },
    magnitude: {
      medianShortfallYears: null,
      medianUnfundedObligation: null,
      failedPaths: 0,
      computedAt: 222,
    },
  });

  assert.equal(outcome.model, 'regime');
  assert.equal(outcome.initialization, 'latest-filtered');
  assert.equal(outcome.calibrationAsOf, '2026-06');
  assert.equal('safeWithdrawalRate' in outcome.stats, false);
  assert.equal('computedAt' in outcome.stats, false);
  assert.equal('computedAt' in outcome.magnitude, false);
});

test('computeCpuFrontier forces the four-model CPU basis, clones inputs, and returns summaries only', async () => {
  const request = makeRequest();
  const expectedParams = structuredClone(request.params);
  const progress = [];
  let nowCalls = 0;
  const now = () => {
    nowCalls += 1;
    return FIXED_NOW;
  };

  const pending = computeCpuFrontier(request, now, (entry) => progress.push(entry));
  request.params.seed = 999;
  request.params.pathCount = 50;
  request.params.glidepath.start = 0.1;
  const result = await pending;

  assert.equal(CPU_FRONTIER_PATH_COUNT, 10_000);
  assert.deepEqual(result.models.map(({ model }) => model), [
    'gbm',
    'bootstrap',
    'fattail',
    'regime',
  ]);
  assert.deepEqual(result.basis, {
    params: expectedParams,
    analysisPathCount: 10_000,
    engine: 'cpu',
    seed: 42,
  });
  assert.equal(result.computedAt, FIXED_NOW);
  assert.ok(nowCalls > 1, 'the injected clock must reach CPU runs and frontier assembly');
  assert.ok(progress.length > 0, 'frontier progress should be forwarded');
  const regime = result.models.find(({ model }) => model === 'regime');
  assert.ok(regime, 'regime model outcome must be present');
  assert.equal(regime.outcome.initialization, 'latest-filtered');
  assert.equal(regime.outcome.calibrationAsOf, '2026-06');
  assert.equal('safeWithdrawalRate' in regime.outcome.stats, false);
  assert.equal('computedAt' in regime.outcome.stats, false);
  assert.equal('computedAt' in regime.outcome.magnitude, false);
  assertFiniteTree(result);
});

test('computeCpuFrontier is deterministic for paired equity and bond bootstrap data', async () => {
  const first = await computeCpuFrontier(makeRequest(), () => FIXED_NOW);
  const second = await computeCpuFrontier(makeRequest(), () => FIXED_NOW);

  assert.deepEqual(second, first);
  const bootstrap = first.models.find(({ model }) => model === 'bootstrap');
  assert.ok(bootstrap, 'bootstrap model outcome must be present');
  assertFiniteTree(bootstrap, 'bootstrap');
});

test('computeCpuFrontier rejects missing glidepath bonds before starting any run', async () => {
  const request = makeRequest();
  request.bondBlocks = null;
  let nowCalls = 0;

  await assert.rejects(
    computeCpuFrontier(request, () => {
      nowCalls += 1;
      return FIXED_NOW;
    }),
    /bond bootstrap blocks are required/i,
  );
  assert.equal(nowCalls, 0);
});

test('computeCpuFrontier rejects truncated paired bonds before starting any run', async () => {
  const request = makeRequest();
  const full = new Float32Array(request.bondBlocks);
  request.bondBlocks = full.slice(0, -1).buffer;
  let nowCalls = 0;

  await assert.rejects(
    computeCpuFrontier(request, () => {
      nowCalls += 1;
      return FIXED_NOW;
    }),
    /bond|block|length/i,
  );
  assert.equal(nowCalls, 0);
});

test('computeCpuFrontier rejects malformed equity and unsupported path counts before runs', async (t) => {
  await t.test('equity buffer', async () => {
    const request = makeRequest();
    request.bootstrapBlocks = new Float32Array(11).buffer;
    let nowCalls = 0;
    await assert.rejects(
      computeCpuFrontier(request, () => {
        nowCalls += 1;
        return FIXED_NOW;
      }),
      /block|length|integer/i,
    );
    assert.equal(nowCalls, 0);
  });

  await t.test('path count', async () => {
    const request = makeRequest();
    request.analysisPathCount = 9_999;
    let nowCalls = 0;
    await assert.rejects(
      computeCpuFrontier(request, () => {
        nowCalls += 1;
        return FIXED_NOW;
      }),
      /exactly 10000 paths/i,
    );
    assert.equal(nowCalls, 0);
  });
});
