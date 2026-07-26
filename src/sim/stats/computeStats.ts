import type { WebGPURenderer } from 'three/webgpu';
import type {
  MagnitudeStats,
  SimParams,
  SimStats,
} from '../../store/simStore';
import { extractMagnitudeStats, extractSimStats } from './cpuReference';
import { runStatsPassesAndRead } from './readback';

export interface ComputedStats {
  stats: SimStats;
  magnitude: MagnitudeStats;
}

export interface ComputeStatsOptions {
  params: SimParams;
  signal?: AbortSignal;
  now?: () => number;
}

function abortError(): Error {
  const error = new Error('computeStats aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

/**
 * Store-free stats readback. It is safe for primary or secondary model runs:
 * callers decide explicitly whether and where to commit the returned values.
 */
export async function computeStats(
  renderer: WebGPURenderer,
  options: ComputeStatsOptions,
): Promise<ComputedStats> {
  const { params, signal } = options;
  const now = options.now ?? Date.now;

  throwIfAborted(signal);
  const data = await runStatsPassesAndRead(renderer);
  throwIfAborted(signal);
  if (data == null || data.totalPaths <= 0) {
    throw new Error('computeStats: stats buffer empty — did runSimulation run?');
  }

  return {
    stats: extractSimStats(data, { now }),
    magnitude: extractMagnitudeStats(data, {
      horizonMonths: Math.round(params.horizonYears * 12),
      monthlyWithdrawal: params.withdrawal,
      now,
    }),
  };
}
