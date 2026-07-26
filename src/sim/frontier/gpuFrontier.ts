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
      await dependencies.runSimulation(analysisParams, signal);
      throwIfAborted(signal);
      const outcome = await dependencies.readOutcome(analysisParams, signal);
      throwIfAborted(signal);
      return outcome;
    },
  }));

  try {
    const frontier = await computeRobustnessFrontier(runners, {
      params: captured,
      analysisPathCount: ANALYSIS_PATH_COUNT,
      engine: 'gpu',
      seed: captured.seed,
      signal: options.signal,
      onProgress: options.onProgress,
      now: dependencies.now,
    });
    throwIfAborted(options.signal);
    await restore();
    throwIfAborted(options.signal);
    return frontier;
  } catch (originalError) {
    if (options.signal?.aborted || restoreAttempted) throw originalError;

    try {
      await restore();
    } catch (restoreError) {
      throw new AggregateError(
        [originalError, restoreError],
        'GPU frontier failed and primary restore failed',
      );
    }
    throw originalError;
  }
}
