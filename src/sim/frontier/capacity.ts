import type {
  FrontierOutcome,
  SpendingCapacity90,
  SpendingCurvePoint,
} from './types';

export interface ComputeModelCapacityOptions {
  currentSpending: number;
  target: 0.9;
  tolerance: 0.005;
  maxBisections: 8;
  maxMonthlySpending: 100_000;
  signal?: AbortSignal;
  onProgress?: (completed: number) => void;
}

export interface ModelCapacityResult {
  outcome: FrontierOutcome;
  curve: SpendingCurvePoint[];
  capacity90: SpendingCapacity90;
}

type CapacityBudgetOptions = Pick<
  ComputeModelCapacityOptions,
  'currentSpending' | 'maxBisections' | 'maxMonthlySpending'
>;

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  throw error;
}

function validateBudgetOptions(options: CapacityBudgetOptions): void {
  const { currentSpending, maxBisections, maxMonthlySpending } = options;
  if (!Number.isFinite(currentSpending) || currentSpending < 0) {
    throw new Error('currentSpending must be a finite, non-negative number');
  }
  if (maxBisections !== 8 || maxMonthlySpending !== 100_000) {
    throw new Error('options must use the fixed A5 search limits');
  }
  if (currentSpending > maxMonthlySpending) {
    throw new Error('currentSpending cannot exceed maxMonthlySpending');
  }
}

function validateOptions(options: ComputeModelCapacityOptions): void {
  validateBudgetOptions(options);
  if (options.target !== 0.9 || options.tolerance !== 0.005) {
    throw new Error('options must use the fixed A5 target and tolerance');
  }
}

export function capacityEvaluationBudget(options: CapacityBudgetOptions): number {
  validateBudgetOptions(options);

  let high = Math.min(
    Math.max(options.currentSpending * 2, 1_000),
    options.maxMonthlySpending,
  );
  let highProbeCount = 1;
  while (high < options.maxMonthlySpending) {
    high = Math.min(high * 2, options.maxMonthlySpending);
    highProbeCount += 1;
  }

  return 2 + highProbeCount + options.maxBisections;
}

function curveFrom(
  evaluated: ReadonlyMap<number, FrontierOutcome>,
): SpendingCurvePoint[] {
  return [...evaluated.entries()]
    .map(([monthlySpending, outcome]) => ({
      monthlySpending,
      successRate: outcome.stats.successRate,
    }))
    .sort((left, right) => left.monthlySpending - right.monthlySpending);
}

export async function computeModelCapacity(
  run: (
    monthlySpending: number,
    signal?: AbortSignal,
  ) => Promise<FrontierOutcome>,
  options: ComputeModelCapacityOptions,
): Promise<ModelCapacityResult> {
  validateOptions(options);

  const { signal, onProgress } = options;
  const evaluated = new Map<number, FrontierOutcome>();
  let completed = 0;
  const evaluate = async (monthlySpending: number): Promise<FrontierOutcome> => {
    const cached = evaluated.get(monthlySpending);
    if (cached) return cached;
    throwIfAborted(signal);
    const outcome = await run(monthlySpending, signal);
    throwIfAborted(signal);
    evaluated.set(monthlySpending, outcome);
    completed += 1;
    onProgress?.(completed);
    return outcome;
  };
  const result = (
    outcome: FrontierOutcome,
    capacity90: SpendingCapacity90,
  ): ModelCapacityResult => ({
    outcome,
    curve: curveFrom(evaluated),
    capacity90,
  });

  const currentOutcome = await evaluate(options.currentSpending);
  const zeroOutcome = await evaluate(0);
  if (zeroOutcome.stats.successRate < options.target) {
    return result(currentOutcome, {
      monthlySpending: null,
      successRate: null,
      target: options.target,
      tolerance: options.tolerance,
      evaluations: completed,
      status: 'infeasible-at-zero',
    });
  }

  let bestSpending = 0;
  let bestSuccessRate = zeroOutcome.stats.successRate;
  if (
    currentOutcome.stats.successRate >= options.target
    && options.currentSpending > bestSpending
  ) {
    bestSpending = options.currentSpending;
    bestSuccessRate = currentOutcome.stats.successRate;
  }

  let high = Math.min(
    Math.max(options.currentSpending * 2, 1_000),
    options.maxMonthlySpending,
  );
  while (true) {
    const highOutcome = await evaluate(high);
    if (highOutcome.stats.successRate < options.target) break;
    if (high > bestSpending) {
      bestSpending = high;
      bestSuccessRate = highOutcome.stats.successRate;
    }
    if (high === options.maxMonthlySpending) {
      return result(currentOutcome, {
        monthlySpending: null,
        successRate: null,
        target: options.target,
        tolerance: options.tolerance,
        evaluations: completed,
        status: 'unbounded-high',
      });
    }
    high = Math.min(high * 2, options.maxMonthlySpending);
  }

  let low = bestSpending;
  for (let iteration = 0; iteration < options.maxBisections; iteration += 1) {
    const middle = (low + high) / 2;
    const middleOutcome = await evaluate(middle);
    const middleSuccessRate = middleOutcome.stats.successRate;
    const withinTolerance = Math.abs(middleSuccessRate - options.target) <= options.tolerance;
    if (middleSuccessRate >= options.target) {
      low = middle;
      if (middle > bestSpending) {
        bestSpending = middle;
        bestSuccessRate = middleSuccessRate;
      }
    } else {
      high = middle;
    }
    if (withinTolerance) {
      return result(currentOutcome, {
        monthlySpending: bestSpending,
        successRate: bestSuccessRate,
        target: options.target,
        tolerance: options.tolerance,
        evaluations: completed,
        status: 'converged',
      });
    }
  }

  return result(currentOutcome, {
    monthlySpending: bestSpending,
    successRate: bestSuccessRate,
    target: options.target,
    tolerance: options.tolerance,
    evaluations: completed,
    status: 'budget-exhausted',
  });
}
