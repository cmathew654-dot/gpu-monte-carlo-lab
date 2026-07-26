import type { SimParams } from '../../store/simStore';
import {
  capacityEvaluationBudget,
  computeModelCapacity,
} from './capacity';
import type {
  CapacityStatus,
  ModelOutcome,
  RobustnessFrontier,
  ShippedModelKey,
  SpendingCurvePoint,
} from './types';

const A5_MODELS = ['gbm', 'bootstrap', 'fattail'] as const;

const A5_CAPACITY_OPTIONS = {
  target: 0.9,
  tolerance: 0.005,
  maxBisections: 8,
  maxMonthlySpending: 100_000,
} as const;

export function frontierEvaluationBudgetForThreeModels(
  currentSpending: number,
): number {
  return capacityEvaluationBudget({
    currentSpending,
    ...A5_CAPACITY_OPTIONS,
  }) * A5_MODELS.length;
}

export interface FrontierModelRunner {
  model: ShippedModelKey;
  run: (
    monthlySpending: number,
    signal?: AbortSignal,
  ) => Promise<ModelOutcome>;
}

export interface FrontierProgress {
  completed: number;
  total: number;
  model: ShippedModelKey | null;
}

export interface ComputeRobustnessFrontierOptions {
  params: SimParams;
  analysisPathCount: SimParams['pathCount'];
  engine: 'gpu' | 'cpu';
  seed: number;
  signal?: AbortSignal;
  onProgress?: (progress: FrontierProgress) => void;
  now?: () => number;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  throw error;
}

function assertA5RunnerOrder(runners: readonly FrontierModelRunner[]): void {
  if (
    runners.length !== A5_MODELS.length
    || runners.some((runner, index) => runner.model !== A5_MODELS[index])
  ) {
    throw new Error('computeRobustnessFrontier requires exact A5 model order');
  }
}

export function assertMonotoneCurve(
  curve: readonly SpendingCurvePoint[],
  analysisPathCount: SimParams['pathCount'],
): void {
  const tolerance = 1 / analysisPathCount;
  const sorted = [...curve].sort(
    (left, right) => left.monthlySpending - right.monthlySpending,
  );

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const next = sorted[index];
    if (next.successRate - previous.successRate > tolerance) {
      throw new Error(
        `Spending curve violates monotonicity: ${JSON.stringify(previous)} then ${JSON.stringify(next)}`,
      );
    }
  }
}

function robustSummary(
  models: RobustnessFrontier['models'],
): Pick<RobustnessFrontier, 'robustSpend' | 'robustStatus'> {
  if (models.some(({ capacity90 }) => capacity90.status === 'infeasible-at-zero')) {
    return { robustSpend: null, robustStatus: 'infeasible-at-zero' };
  }

  if (
    models.every(({ capacity90 }) => capacity90.monthlySpending === null)
    && models.every(({ capacity90 }) => capacity90.status === 'unbounded-high')
  ) {
    return { robustSpend: null, robustStatus: 'unbounded-high' };
  }

  const measured = models.filter(
    (model): model is typeof model & {
      capacity90: typeof model.capacity90 & { monthlySpending: number };
    } => model.capacity90.monthlySpending !== null,
  );
  if (measured.length === 0) {
    throw new Error('computeRobustnessFrontier requires a measured capacity');
  }

  const robustSpend = Math.min(
    ...measured.map(({ capacity90 }) => capacity90.monthlySpending),
  );
  const tiedStatuses = measured
    .filter(({ capacity90 }) => capacity90.monthlySpending === robustSpend)
    .map(({ capacity90 }) => capacity90.status);
  const robustStatus: CapacityStatus = tiedStatuses.includes('budget-exhausted')
    ? 'budget-exhausted'
    : 'converged';
  return { robustSpend, robustStatus };
}

export async function computeRobustnessFrontier(
  runners: readonly FrontierModelRunner[],
  options: ComputeRobustnessFrontierOptions,
): Promise<RobustnessFrontier> {
  assertA5RunnerOrder(runners);
  throwIfAborted(options.signal);

  const capturedParams: SimParams = {
    ...options.params,
    glidepath: options.params.glidepath
      ? { ...options.params.glidepath }
      : null,
  };
  const perModelTotal = capacityEvaluationBudget({
    currentSpending: capturedParams.withdrawal,
    ...A5_CAPACITY_OPTIONS,
  });
  const total = frontierEvaluationBudgetForThreeModels(
    capturedParams.withdrawal,
  );
  const models: RobustnessFrontier['models'][number][] = [];

  for (const [index, runner] of runners.entries()) {
    const offset = index * perModelTotal;
    const modelResult = await computeModelCapacity(runner.run, {
      currentSpending: capturedParams.withdrawal,
      ...A5_CAPACITY_OPTIONS,
      signal: options.signal,
      onProgress: (completed) => {
        options.onProgress?.({
          completed: offset + completed,
          total,
          model: runner.model,
        });
      },
    });
    throwIfAborted(options.signal);
    if (modelResult.outcome.model !== runner.model) {
      throw new Error(
        `Frontier runner ${runner.model} returned outcome for ${modelResult.outcome.model}`,
      );
    }
    assertMonotoneCurve(modelResult.curve, options.analysisPathCount);
    throwIfAborted(options.signal);
    models.push({
      model: runner.model,
      outcome: modelResult.outcome,
      curve: modelResult.curve,
      capacity90: modelResult.capacity90,
    });
  }

  throwIfAborted(options.signal);
  const summary = robustSummary(models);
  throwIfAborted(options.signal);
  const computedAt = (options.now ?? Date.now)();
  throwIfAborted(options.signal);
  return {
    basis: {
      params: capturedParams,
      analysisPathCount: options.analysisPathCount,
      engine: options.engine,
      seed: options.seed,
    },
    models,
    ...summary,
    computedAt,
  };
}
