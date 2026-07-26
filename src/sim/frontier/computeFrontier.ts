import type { SimParams } from '../../store/simStore';
import {
  capacityEvaluationBudget,
  computeModelCapacity,
} from './capacity';
import { FRONTIER_MODEL_ORDER } from './modelRegistry';
import type {
  CapacityStatus,
  FrontierModelKey,
  FrontierOutcome,
  RobustnessFrontier,
  SpendingCurvePoint,
} from './types';

const FRONTIER_CAPACITY_OPTIONS = {
  target: 0.9,
  tolerance: 0.005,
  maxBisections: 8,
  maxMonthlySpending: 100_000,
} as const;

export function frontierEvaluationBudget(
  currentSpending: number,
): number {
  return capacityEvaluationBudget({
    currentSpending,
    ...FRONTIER_CAPACITY_OPTIONS,
  }) * FRONTIER_MODEL_ORDER.length;
}

/** @deprecated Compatibility alias; the budget now covers every frontier model. */
export const frontierEvaluationBudgetForThreeModels = frontierEvaluationBudget;

export interface FrontierModelRunner {
  model: FrontierModelKey;
  run: (
    monthlySpending: number,
    signal?: AbortSignal,
  ) => Promise<FrontierOutcome>;
}

export interface FrontierProgress {
  completed: number;
  total: number;
  model: FrontierModelKey | null;
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

function assertFrontierRunnerOrder(runners: readonly FrontierModelRunner[]): void {
  if (
    runners.length !== FRONTIER_MODEL_ORDER.length
    || runners.some((runner, index) => runner.model !== FRONTIER_MODEL_ORDER[index])
  ) {
    throw new Error('computeRobustnessFrontier requires exact frontier model order');
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
  assertFrontierRunnerOrder(runners);
  throwIfAborted(options.signal);

  const capturedParams: SimParams = {
    ...options.params,
    glidepath: options.params.glidepath
      ? { ...options.params.glidepath }
      : null,
  };
  const perModelTotal = capacityEvaluationBudget({
    currentSpending: capturedParams.withdrawal,
    ...FRONTIER_CAPACITY_OPTIONS,
  });
  const total = frontierEvaluationBudget(
    capturedParams.withdrawal,
  );
  const models: RobustnessFrontier['models'][number][] = [];

  for (const [index, runner] of runners.entries()) {
    const offset = index * perModelTotal;
    const modelResult = await computeModelCapacity(runner.run, {
      currentSpending: capturedParams.withdrawal,
      ...FRONTIER_CAPACITY_OPTIONS,
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
