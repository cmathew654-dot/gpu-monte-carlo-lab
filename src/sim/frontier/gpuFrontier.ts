import {
  computeRobustnessFrontier,
  type ComputeRobustnessFrontierOptions,
  type FrontierProgress,
  type FrontierModelRunner,
} from './computeFrontier';
import type {
  ModelOutcome,
  RobustnessFrontier,
  ShippedModelKey,
} from './types';

type SimParams = ComputeRobustnessFrontierOptions['params'];

const ANALYSIS_PATH_COUNT = 100_000 as const;
const A5_MODELS: readonly ShippedModelKey[] = ['gbm', 'bootstrap', 'fattail'];

export interface GpuFrontierDependencies {
  runSimulation: (params: SimParams, signal?: AbortSignal) => Promise<void>;
  readOutcome: (
    params: SimParams,
    signal?: AbortSignal,
  ) => Promise<ModelOutcome>;
  now?: () => number;
}

export interface RunGpuFrontierOptions {
  params: SimParams;
  signal?: AbortSignal;
  onProgress?: (progress: FrontierProgress) => void;
}

function abortError(): Error {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

async function awaitWithAbortPriority<T>(
  operation: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  let result: T;
  try {
    result = await operation;
  } catch (error) {
    throwIfAborted(signal);
    throw error;
  }
  throwIfAborted(signal);
  return result;
}

function captureParams(params: SimParams): SimParams {
  return {
    ...params,
    glidepath: params.glidepath ? { ...params.glidepath } : null,
  };
}

export async function runGpuRobustnessFrontier(
  dependencies: GpuFrontierDependencies,
  options: RunGpuFrontierOptions,
): Promise<RobustnessFrontier> {
  const captured = captureParams(options.params);
  let restoreAttempted = false;

  const restore = async (): Promise<void> => {
    if (restoreAttempted) return;
    restoreAttempted = true;
    await dependencies.runSimulation(captured);
  };

  const runners: FrontierModelRunner[] = A5_MODELS.map((model) => ({
    model,
    run: async (monthlySpending, signal) => {
      const analysisParams: SimParams = {
        ...captured,
        model,
        withdrawal: monthlySpending,
        pathCount: ANALYSIS_PATH_COUNT,
        seed: captured.seed,
      };
      await awaitWithAbortPriority(
        dependencies.runSimulation(analysisParams, signal),
        signal,
      );
      return awaitWithAbortPriority(
        dependencies.readOutcome(analysisParams, signal),
        signal,
      );
    },
  }));

  let frontier: RobustnessFrontier;
  try {
    frontier = await computeRobustnessFrontier(runners, {
      params: captured,
      analysisPathCount: ANALYSIS_PATH_COUNT,
      engine: 'gpu',
      seed: captured.seed,
      signal: options.signal,
      onProgress: options.onProgress,
      now: dependencies.now,
    });
  } catch (originalError) {
    throwIfAborted(options.signal);

    try {
      await restore();
    } catch (restoreError) {
      throwIfAborted(options.signal);
      throw new AggregateError(
        [originalError, restoreError],
        'GPU frontier failed and primary restore failed',
      );
    }
    throwIfAborted(options.signal);
    throw originalError;
  }

  throwIfAborted(options.signal);
  try {
    await restore();
  } catch (restoreError) {
    throwIfAborted(options.signal);
    throw restoreError;
  }
  throwIfAborted(options.signal);
  return frontier;
}
