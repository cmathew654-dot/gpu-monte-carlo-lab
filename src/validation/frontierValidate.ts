import historicalReturnsJson from '../data/historicalReturns.json';
import { runCpuRegimeSim } from '../sim/fallback/cpuRegimeSim';
import { runCpuSim } from '../sim/fallback/cpuSim';
import {
  parseBootstrapBlocksFile,
  type BootstrapBlocksFile,
} from '../sim/model/bootstrap';
import { assertMonotoneCurve } from '../sim/frontier/computeFrontier';
import {
  computeCpuFrontier,
  CPU_FRONTIER_PATH_COUNT,
  type CpuFrontierRequest,
} from '../sim/frontier/cpuFrontier';
import { FRONTIER_MODEL_ORDER } from '../sim/frontier/modelRegistry';
import type {
  FrontierModelKey,
  FrontierModelResult,
  RobustnessFrontier,
} from '../sim/frontier/types';
import { REGIME_CALIBRATION_F32 } from '../sim/regime/artifact';
import { DEFAULT_SIM_PARAMS, type SimParams } from '../store/simStore';

const NOW = () => 1_722_000_000_000;
const FIXED_PARAMS: SimParams = {
  ...DEFAULT_SIM_PARAMS,
  model: 'bootstrap',
  pathCount: CPU_FRONTIER_PATH_COUNT,
  seed: 42,
  glidepath: { start: 0.8, end: 0.6 },
};

interface CapacityRerunEvidence {
  successRate: number | null;
  elapsedMs: number | null;
  maximumReversal: number;
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectJsonEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message);
  }
}

const historicalFile = historicalReturnsJson as unknown as BootstrapBlocksFile;
const parsedBootstrap = parseBootstrapBlocksFile(historicalFile);
if (!parsedBootstrap) {
  throw new Error('frontier validation requires populated historical bootstrap blocks');
}
const bootstrap = parsedBootstrap;
const parsedBondBlocks = bootstrap.bondBlocks;
if (!parsedBondBlocks) {
  throw new Error('frontier validation requires paired historical bond blocks');
}
const bondBlocks = parsedBondBlocks;
if (bootstrap.blocks.length !== bondBlocks.length) {
  throw new Error(
    `frontier validation requires equal equity/bond lengths, got ${bootstrap.blocks.length}/${bondBlocks.length}`,
  );
}

function copiedRequest(): CpuFrontierRequest {
  return {
    type: 'compute-frontier',
    token: 0,
    params: {
      ...FIXED_PARAMS,
      glidepath: FIXED_PARAMS.glidepath ? { ...FIXED_PARAMS.glidepath } : null,
    },
    analysisPathCount: CPU_FRONTIER_PATH_COUNT,
    bootstrapBlocks: bootstrap.blocks.slice().buffer as ArrayBuffer,
    bondBlocks: bondBlocks.slice().buffer as ArrayBuffer,
  };
}

function rerunCapacity(
  model: FrontierModelKey,
  monthlySpending: number,
): { successRate: number; elapsedMs: number } {
  const startedAt = performance.now();
  const params: SimParams = {
    ...FIXED_PARAMS,
    withdrawal: monthlySpending,
    pathCount: CPU_FRONTIER_PATH_COUNT,
    seed: FIXED_PARAMS.seed,
  };
  const simulation = model === 'regime'
    ? runCpuRegimeSim(params, REGIME_CALIBRATION_F32, { now: NOW })
    : runCpuSim(
        { ...params, model },
        {
          bootstrapData: model === 'bootstrap' ? bootstrap : null,
          bondBlocks: model === 'bootstrap' ? bondBlocks : null,
          now: NOW,
        },
      );
  return {
    successRate: simulation.stats.successRate,
    elapsedMs: performance.now() - startedAt,
  };
}

function maximumCurveReversal(
  modelResult: FrontierModelResult,
): number {
  const sorted = [...modelResult.curve].sort(
    (left, right) => left.monthlySpending - right.monthlySpending,
  );
  let maximum = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    maximum = Math.max(
      maximum,
      sorted[index].successRate - sorted[index - 1].successRate,
    );
  }
  return maximum;
}

function validateModel(modelResult: FrontierModelResult): CapacityRerunEvidence {
  const { model, capacity90, curve } = modelResult;
  assertMonotoneCurve(curve, CPU_FRONTIER_PATH_COUNT);
  expect(
    capacity90.evaluations === curve.length,
    `${model} capacity evaluation count does not match its tested curve`,
  );
  for (const point of curve) {
    const successes = point.successRate * CPU_FRONTIER_PATH_COUNT;
    expect(
      Math.abs(successes - Math.round(successes)) <= 1e-9,
      `${model} curve point is not a 10,000-path observed rate`,
    );
  }

  const maximumReversal = maximumCurveReversal(modelResult);
  expect(
    maximumReversal <= 1 / CPU_FRONTIER_PATH_COUNT,
    `${model} spending curve reversal exceeds 1/10,000`,
  );
  if (capacity90.status === 'infeasible-at-zero') {
    throw new Error(`frontier validation found infeasible-at-zero for ${model}`);
  }

  const measured = capacity90.monthlySpending === null
    ? null
    : curve.find(
        (point) => point.monthlySpending === capacity90.monthlySpending,
      ) ?? null;
  if (capacity90.monthlySpending !== null) {
    expect(measured !== null, `${model} capacity is not a real evaluated curve point`);
    expect(
      capacity90.successRate === measured.successRate,
      `${model} capacity success rate differs from its evaluated point`,
    );
  }

  if (capacity90.status === 'unbounded-high') {
    expect(
      capacity90.monthlySpending === null && capacity90.successRate === null,
      `${model} unbounded-high status must not claim a crossing`,
    );
    const ceiling = curve.find((point) => point.monthlySpending === 100_000);
    expect(
      ceiling !== undefined && ceiling.successRate >= 0.9,
      `${model} unbounded-high status lacks a successful tested ceiling`,
    );
    return { successRate: null, elapsedMs: null, maximumReversal };
  }

  if (capacity90.status === 'budget-exhausted') {
    expect(
      measured !== null && measured.successRate >= 0.9,
      `${model} budget-exhausted status must retain a successful tested point`,
    );
    expect(
      Math.abs(measured.successRate - 0.9) > 0.005,
      `${model} budget-exhausted status incorrectly hides a converged point`,
    );
    return { successRate: null, elapsedMs: null, maximumReversal };
  }

  expect(
    capacity90.status === 'converged' && measured !== null,
    `frontier validation received unexpected capacity status for ${model}`,
  );
  const rerun = rerunCapacity(model, measured.monthlySpending);
  expect(
    rerun.successRate >= 0.895 && rerun.successRate <= 0.905,
    `${model} capacity rerun is outside [0.895,0.905] (${rerun.successRate})`,
  );
  return {
    successRate: rerun.successRate,
    elapsedMs: rerun.elapsedMs,
    maximumReversal,
  };
}

function validateRobustResult(frontier: RobustnessFrontier): void {
  const measured = frontier.models
    .map(({ capacity90 }) => capacity90.monthlySpending)
    .filter((value): value is number => value !== null);
  if (measured.length === 0) {
    expect(
      frontier.robustSpend === null && frontier.robustStatus === 'unbounded-high',
      'all-unbounded frontier must remain explicitly unbounded-high',
    );
    return;
  }
  expect(
    frontier.robustSpend === Math.min(...measured),
    'robust spend must include the minimum tested capacity across all four models',
  );
}

const firstStartedAt = performance.now();
const first = await computeCpuFrontier(copiedRequest(), NOW);
const firstElapsedMs = performance.now() - firstStartedAt;
const secondStartedAt = performance.now();
const second = await computeCpuFrontier(copiedRequest(), NOW);
const secondElapsedMs = performance.now() - secondStartedAt;

expectJsonEqual(second, first, 'fresh copied-buffer four-model frontiers must match');
expectJsonEqual(
  first.models.map(({ model }) => model),
  FRONTIER_MODEL_ORDER,
  'production frontier model order changed',
);
expect(first.basis.engine === 'cpu', 'frontier validation requires the CPU engine');
expect(
  first.basis.analysisPathCount === CPU_FRONTIER_PATH_COUNT,
  'frontier validation requires exactly 10,000 paths',
);
expect(first.basis.seed === FIXED_PARAMS.seed, 'frontier validation seed changed');
expectJsonEqual(first.basis.params, FIXED_PARAMS, 'frontier validation params changed');
expect(first.computedAt === NOW(), 'frontier validation clock changed');

const reruns = new Map<FrontierModelKey, CapacityRerunEvidence>();
for (const modelResult of first.models) {
  reruns.set(modelResult.model, validateModel(modelResult));
  if (modelResult.model === 'regime') {
    expect(
      modelResult.outcome.model === 'regime'
        && modelResult.outcome.initialization === 'latest-filtered'
        && modelResult.outcome.calibrationAsOf === REGIME_CALIBRATION_F32.data.end,
      'production regime outcome metadata changed',
    );
  }
}
validateRobustResult(first);

const date = new Date(NOW()).toISOString();
const table = first.models.map((modelResult) => {
  const { outcome, capacity90 } = modelResult;
  const rerun = reruns.get(modelResult.model);
  expect(rerun !== undefined, `missing rerun evidence for ${modelResult.model}`);
  return {
    model: modelResult.model,
    currentSuccess: outcome.stats.successRate,
    p50: outcome.stats.percentiles.p50,
    worstDecileDrawdown: outcome.stats.worstDecileMaxDD,
    capacity: capacity90.monthlySpending,
    capacitySuccess: capacity90.successRate,
    capacityRerunSuccess: rerun.successRate,
    status: capacity90.status,
    evaluations: capacity90.evaluations,
    maximumReversal: rerun.maximumReversal,
    initialization: outcome.model === 'regime'
      ? outcome.initialization
      : 'not-applicable',
    calibrationAsOf: outcome.model === 'regime'
      ? outcome.calibrationAsOf
      : 'not-applicable',
    date,
    pathCount: first.basis.analysisPathCount,
    seed: first.basis.seed,
    rerunElapsedCpuMs: rerun.elapsedMs,
  };
});
console.table(table);

const stableTable = table.map(({ rerunElapsedCpuMs, ...row }) => {
  void rerunElapsedCpuMs;
  return row;
});
const stableEvidence = {
  date,
  modelOrder: first.models.map(({ model }) => model),
  engine: first.basis.engine,
  analysisPathCount: first.basis.analysisPathCount,
  seed: first.basis.seed,
  params: first.basis.params,
  models: stableTable,
  robustResult: {
    monthlySpending: first.robustSpend,
    status: first.robustStatus,
  },
};
const timingEvidence = {
  firstFrontierElapsedCpuMs: firstElapsedMs,
  secondFrontierElapsedCpuMs: secondElapsedMs,
  capacityRerunElapsedCpuMs: Object.fromEntries(
    [...reruns].map(([model, evidence]) => [model, evidence.elapsedMs]),
  ),
};

console.log(`FRONTIER_VALIDATION_STABLE ${JSON.stringify(stableEvidence)}`);
console.log(`FRONTIER_VALIDATION_TIMING ${JSON.stringify(timingEvidence)}`);