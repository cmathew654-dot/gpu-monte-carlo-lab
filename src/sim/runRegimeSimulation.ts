/** Separate GPU driver for the frontier-only Regime-t graph. */
import type { WebGPURenderer } from 'three/webgpu';
import type { SimParams } from '../store/simStore';
import {
  uActiveN,
  uContribution,
  uGlideEnabled,
  uGlideEnd,
  uGlideStart,
  uInitialWealth,
  uRetireStep,
  uSeed,
  uSnapCount,
  uSnapStride,
  uStep,
  uWithdrawal,
} from './buffers';
import { computeInit } from './kernels/initPaths.tsl';
import { computeRegimeStep } from './kernels/regimeStep.tsl';
import { snapCountForSteps, snapStrideForSteps } from './model/history';
import type { RunSimulationResult } from './runSimulation';

export interface RunRegimeSimulationOptions {
  renderer: WebGPURenderer;
  params: SimParams;
  signal?: AbortSignal;
  onProgress?: (completedSteps: number, totalSteps: number) => void;
  stepsPerChunk?: number;
}

function abortError(): Error {
  const error = new Error('runRegimeSimulation aborted');
  error.name = 'AbortError';
  return error;
}

export async function runRegimeSimulation(
  options: RunRegimeSimulationOptions,
): Promise<RunSimulationResult> {
  const { renderer, params, signal, onProgress } = options;
  const stepsPerChunk = options.stepsPerChunk ?? Infinity;
  const steps = Math.round(params.horizonYears * 12);
  if (!Number.isFinite(steps) || steps < 1) {
    throw new Error(
      `runRegimeSimulation: invalid horizonYears ${params.horizonYears}`,
    );
  }

  // Existing financial uniforms only. Regime-t deliberately ignores uModel,
  // uMu, uSigma, and bootstrap data.
  uActiveN.value = params.pathCount;
  uSeed.value = params.seed >>> 0;
  uRetireStep.value = Math.round(params.retireYear * 12);
  uInitialWealth.value = params.initialWealth;
  uContribution.value = params.contribution;
  uWithdrawal.value = params.withdrawal;
  if (params.glidepath) {
    uGlideEnabled.value = 1;
    uGlideStart.value = params.glidepath.start;
    uGlideEnd.value = params.glidepath.end;
  } else {
    uGlideEnabled.value = 0;
  }
  const snapshotStride = snapStrideForSteps(steps);
  uSnapStride.value = snapshotStride;
  uSnapCount.value = snapCountForSteps(steps, snapshotStride);

  if (signal?.aborted) throw abortError();

  const startedAt = performance.now();
  const dispatchTimestampsMs: number[] = [];
  await renderer.computeAsync(computeInit);
  dispatchTimestampsMs.push(performance.now());

  let chunks = 1;
  for (let step = 0; step < steps; step++) {
    if (signal?.aborted) throw abortError();
    uStep.value = step;
    if (step === steps - 1) {
      await renderer.computeAsync(computeRegimeStep);
    } else {
      renderer.compute(computeRegimeStep);
    }
    dispatchTimestampsMs.push(performance.now());

    const completedSteps = step + 1;
    if (
      completedSteps % stepsPerChunk === 0 &&
      completedSteps < steps
    ) {
      chunks++;
      onProgress?.(completedSteps, steps);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      if (signal?.aborted) throw abortError();
    }
  }
  onProgress?.(steps, steps);

  return {
    paths: params.pathCount,
    steps,
    elapsedMs: performance.now() - startedAt,
    dispatchTimestampsMs,
    chunks,
  };
}
