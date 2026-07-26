import type { SimParams } from '../../store/simStore';
import { runCpuSim } from '../fallback/cpuSim';
import {
  packBondBlocks,
  packBootstrapBlocks,
} from '../model/bootstrap';
import { BLOCK_LENGTH } from '../model/returnModels';
import { computeRobustnessFrontier } from './computeFrontier';
import type { FrontierProgress } from './computeFrontier';
import { modelOutcome } from './modelComparison';
import type { RobustnessFrontier, ShippedModelKey } from './types';

export const CPU_FRONTIER_PATH_COUNT = 10_000 as const;

const A5_MODELS: readonly ShippedModelKey[] = ['gbm', 'bootstrap', 'fattail'];

export interface CpuFrontierRequest {
  type: 'compute-frontier';
  token: number;
  params: SimParams;
  analysisPathCount: typeof CPU_FRONTIER_PATH_COUNT;
  bootstrapBlocks: ArrayBuffer;
  bondBlocks: ArrayBuffer | null;
}

export interface CpuFrontierProgressMessage {
  type: 'frontier-progress';
  token: number;
  progress: FrontierProgress;
}

export interface CpuFrontierResultMessage {
  type: 'frontier-result';
  token: number;
  result: RobustnessFrontier;
}

export interface CpuFrontierErrorMessage {
  type: 'frontier-error';
  token: number;
  message: string;
}

function cloneParams(params: SimParams): SimParams {
  return {
    ...params,
    glidepath: params.glidepath ? { ...params.glidepath } : null,
  };
}

function viewFloat32(buffer: ArrayBuffer, label: string): Float32Array {
  if (buffer.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error(`${label} byte length must be divisible by 4`);
  }
  return new Float32Array(buffer);
}

export async function computeCpuFrontier(
  request: Readonly<CpuFrontierRequest>,
  now: () => number = Date.now,
  onProgress?: (progress: FrontierProgress) => void,
): Promise<RobustnessFrontier> {
  if (request.analysisPathCount !== CPU_FRONTIER_PATH_COUNT) {
    throw new Error(`CPU frontier requires exactly ${CPU_FRONTIER_PATH_COUNT} paths`);
  }

  const captured = cloneParams(request.params);
  const equity = viewFloat32(request.bootstrapBlocks, 'Equity bootstrap buffer');
  const blockCount = equity.length / BLOCK_LENGTH;
  const bootstrapData = packBootstrapBlocks(equity, blockCount);

  let bondBlocks: Float32Array | null = null;
  if (request.bondBlocks !== null) {
    const bonds = viewFloat32(request.bondBlocks, 'Bond bootstrap buffer');
    bondBlocks = packBondBlocks(bonds, blockCount);
  }
  if (captured.glidepath !== null && bondBlocks === null) {
    throw new Error('Bond bootstrap blocks are required when a glidepath is active');
  }

  const runners = A5_MODELS.map((model) => ({
    model,
    run: async (monthlySpending: number) => {
      const simulation = runCpuSim(
        {
          ...captured,
          model,
          withdrawal: monthlySpending,
          pathCount: CPU_FRONTIER_PATH_COUNT,
          seed: captured.seed,
        },
        {
          bootstrapData: model === 'bootstrap' ? bootstrapData : null,
          bondBlocks: model === 'bootstrap' ? bondBlocks : null,
          now,
        },
      );
      return modelOutcome(model, {
        stats: simulation.stats,
        magnitude: simulation.magnitude,
      });
    },
  }));

  return computeRobustnessFrontier(runners, {
    params: captured,
    analysisPathCount: CPU_FRONTIER_PATH_COUNT,
    engine: 'cpu',
    seed: captured.seed,
    onProgress,
    now,
  });
}
