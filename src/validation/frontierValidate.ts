import historicalReturnsJson from '../data/historicalReturns.json';
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
import type { RobustnessFrontier } from '../sim/frontier/types';
import { DEFAULT_SIM_PARAMS, type SimParams } from '../store/simStore';

const A5_MODELS = ['gbm', 'bootstrap', 'fattail'] as const;
const NOW = () => 1_722_000_000_000;
const FIXED_PARAMS: SimParams = {
  ...DEFAULT_SIM_PARAMS,
  model: 'bootstrap',
  pathCount: CPU_FRONTIER_PATH_COUNT,
  seed: 42,
  glidepath: { start: 0.8, end: 0.6 },
};

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
  model: SimParams['model'],
  monthlySpending: number,
): number {
  return runCpuSim(
    {
      ...FIXED_PARAMS,
      model,
      withdrawal: monthlySpending,
    },
    {
      bootstrapData: model === 'bootstrap' ? bootstrap : null,
      bondBlocks: model === 'bootstrap' ? bondBlocks : null,
      now: NOW,
    },
  ).stats.successRate;
}

function validateModel(modelResult: RobustnessFrontier['models'][number]): void {
  if (!A5_MODELS.includes(modelResult.model as SimParams['model'])) {
    throw new Error(`frontier validation received unexpected model ${modelResult.model}`);
  }
  const model = modelResult.model as SimParams['model'];
  const { capacity90, curve } = modelResult;
  assertMonotoneCurve(curve, CPU_FRONTIER_PATH_COUNT);

  if (capacity90.status === 'infeasible-at-zero') {
    throw new Error(`frontier validation found infeasible-at-zero for ${model}`);
  }
  if (
    capacity90.status === 'unbounded-high'
    || capacity90.status === 'budget-exhausted'
  ) {
    return;
  }
  if (capacity90.status !== 'converged' || capacity90.monthlySpending === null) {
    throw new Error(`frontier validation expected converged capacity for ${model}`);
  }

  const measured = curve.find(
    (point) => point.monthlySpending === capacity90.monthlySpending,
  );
  if (!measured) {
    throw new Error(`${model} capacity is not an evaluated point`);
  }
  const successRate = rerunCapacity(model, capacity90.monthlySpending);
  if (Math.abs(successRate - 0.9) > 0.005) {
    throw new Error(
      `${model} capacity rerun is outside 90% ±0.5% (${(successRate * 100).toFixed(3)}%)`,
    );
  }
}

const startedAt = performance.now();
const first = await computeCpuFrontier(copiedRequest(), NOW);
const second = await computeCpuFrontier(copiedRequest(), NOW);

expectJsonEqual(second, first, 'fresh copied-buffer production frontiers must match');
expectJsonEqual(first.models.map(({ model }) => model), A5_MODELS, 'A5 model order changed');
expect(first.basis.engine === 'cpu', 'frontier validation requires the CPU engine');
expect(
  first.basis.analysisPathCount === CPU_FRONTIER_PATH_COUNT,
  'frontier validation requires exactly 10,000 paths',
);
expect(first.basis.seed === FIXED_PARAMS.seed, 'frontier validation seed changed');
expectJsonEqual(first.basis.params, FIXED_PARAMS, 'frontier validation params changed');
expect(first.computedAt === NOW(), 'frontier validation clock changed');
for (const modelResult of first.models) validateModel(modelResult);
const elapsedMs = performance.now() - startedAt;

const metadata = historicalFile._meta;
const report = {
  date: new Date(NOW()).toISOString(),
  dataAsOf: {
    startDate: metadata.startDate,
    endDate: metadata.endDate,
    generatedAt: typeof metadata.generatedAt === 'string' ? metadata.generatedAt : null,
    source: metadata.source,
  },
  engine: first.basis.engine,
  analysisPathCount: first.basis.analysisPathCount,
  seed: first.basis.seed,
  params: first.basis.params,
  capacities: first.models.map(({ model, capacity90, curve }) => ({
    model,
    status: capacity90.status,
    monthlySpending: capacity90.monthlySpending,
    successRate: capacity90.successRate,
    evaluations: capacity90.evaluations,
    evaluatedPoints: curve.length,
  })),
  robustResult: {
    monthlySpending: first.robustSpend,
    status: first.robustStatus,
  },
  elapsedMs,
};

console.log(JSON.stringify(report));
