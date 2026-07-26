/**
 * runSimulation.ts — GPU resim driver (spec §4.2 task 5). SINGLE OWNER: Agent 2.
 *
 * FROZEN SIGNATURE (docs/CONTRACTS.md). Runs ONCE per parameter change —
 * NEVER per frame (§1.4 data-flow rule). Sequence:
 *
 *   1. write the §3.4 uniform block from SimParams
 *   2. upload bootstrapBlocks if Model B data supplied (skipped when unchanged)
 *   3. dispatch computeInit once
 *   4. dispatch computeStep horizonYears×12 times, uStep = 0..steps−1
 *      (submitted synchronously via renderer.compute() — the r185 bitonic-
 *       sort multi-dispatch pattern — awaiting only the FINAL dispatch via
 *       computeAsync, so the returned promise resolves when GPU state is
 *       final and the buffers are safe to read back, per §4.3)
 *
 * CHUNKING: spec allows ≤2 frames "only if measurement demands it". The
 * `stepsPerChunk` knob exists for that measurement (default: single-shot).
 * Every dispatch is timestamped (performance.now) and returned in
 * `dispatchTimestampsMs` so Agent 7's perf audit gets real numbers without
 * re-instrumenting. Chunk boundaries yield to requestAnimationFrame.
 */
import type { WebGPURenderer } from 'three/webgpu';
import type { SimParams } from '../store/simStore';
import {
  uModel,
  uActiveN,
  uSeed,
  uStep,
  uRetireStep,
  uInitialWealth,
  uContribution,
  uWithdrawal,
  uMu,
  uSigma,
  uGlideEnabled,
  uGlideStart,
  uGlideEnd,
  uSnapStride,
  uSnapCount,
  setBootstrapBlocks,
} from './buffers';
import { MODEL_BOOTSTRAP, MODEL_IDS } from './model/returnModels';
import { snapCountForSteps, snapStrideForSteps } from './model/history';
import type { BootstrapBlocksData } from './model/bootstrap';
import { computeInit } from './kernels/initPaths.tsl';
import { computeStep } from './kernels/stepPaths.tsl';

export interface RunSimulationOptions {
  /** WebGPURenderer (R3F: `useThree((s) => s.gl) as unknown as WebGPURenderer`). */
  renderer: WebGPURenderer;
  /** Store params — written into the §3.4 uniform block. */
  params: SimParams;
  /**
   * Model B block data (blockCount×12 Float32Array or packed
   * BootstrapBlocksData). REQUIRED when params.model === 'bootstrap'
   * (throws otherwise). Re-uploaded only when the reference changes.
   */
  bootstrapData?: BootstrapBlocksData | Float32Array | null;
  /** Abort between step dispatches (Agent 3's cancellable SWR search). */
  signal?: AbortSignal;
  /** Called after each chunk: (completedSteps, totalSteps). */
  onProgress?: (completedSteps: number, totalSteps: number) => void;
  /**
   * Max step dispatches per frame. Default Infinity (single-shot — the
   * §1.2/R1 perf claim). Set ≥1 only when frame-time measurement demands
   * chunking (spec allows ≤2 frames).
   */
  stepsPerChunk?: number;
}

export interface RunSimulationResult {
  /** Active paths simulated (= params.pathCount). */
  paths: number;
  /** Months simulated (= horizonYears × 12). */
  steps: number;
  /** Wall time of the whole resim. */
  elapsedMs: number;
  /** performance.now() after each dispatch (init at index 0, then steps). */
  dispatchTimestampsMs: number[];
  /** Number of frame chunks used (1 = single-shot). */
  chunks: number;
}

/** Last bootstrap payload uploaded — skips redundant 48 kB re-uploads. */
let lastBootstrapPayload: unknown = null;

function abortError(): Error {
  const e = new Error('runSimulation aborted');
  e.name = 'AbortError';
  return e;
}

export async function runSimulation(options: RunSimulationOptions): Promise<RunSimulationResult> {
  const { renderer, params, bootstrapData = null, signal, onProgress } = options;
  const stepsPerChunk = options.stepsPerChunk ?? Infinity;

  const steps = Math.round(params.horizonYears * 12);
  if (!Number.isFinite(steps) || steps < 1) {
    throw new Error(`runSimulation: invalid horizonYears ${params.horizonYears}`);
  }
  const modelId = MODEL_IDS[params.model];

  // 1. uniform block
  uModel.value = modelId;
  uActiveN.value = params.pathCount;
  uSeed.value = params.seed >>> 0;
  uRetireStep.value = Math.round(params.retireYear * 12);
  uInitialWealth.value = params.initialWealth;
  uContribution.value = params.contribution;
  uWithdrawal.value = params.withdrawal;
  uMu.value = params.mu;
  uSigma.value = params.sigma;
  if (params.glidepath) {
    uGlideEnabled.value = 1;
    uGlideStart.value = params.glidepath.start;
    uGlideEnd.value = params.glidepath.end;
  } else {
    uGlideEnabled.value = 0;
  }
  // AMENDMENTS A1+A2 (docs/CONTRACTS.md §9): horizon-adaptive decimation —
  // yearly (stride 12) for horizons ≤ 31 years; ceil(steps/31) beyond, so
  // the snapshot count never exceeds SNAP_MAX=32 and the buffer (allocated
  // once, never resized) fits the default storage binding limit.
  const snapStride = snapStrideForSteps(steps);
  uSnapStride.value = snapStride;
  uSnapCount.value = snapCountForSteps(steps, snapStride);

  // 2. bootstrap data (Model B)
  if (modelId === MODEL_BOOTSTRAP) {
    if (bootstrapData == null) {
      throw new Error('runSimulation: model "bootstrap" requires bootstrapData');
    }
    // AMENDMENT A3: the bootstrap glidepath mixes equity with the
    // month-aligned bond sleeve — refuse to run silently without it.
    if (
      params.glidepath &&
      (bootstrapData instanceof Float32Array || bootstrapData.bondBlocks == null)
    ) {
      throw new Error(
        'runSimulation: bootstrap + glidepath requires bond block data (BootstrapBlocksData.bondBlocks)',
      );
    }
    if (bootstrapData !== lastBootstrapPayload) {
      setBootstrapBlocks(bootstrapData);
      lastBootstrapPayload = bootstrapData;
    }
  }

  if (signal?.aborted) throw abortError();

  const t0 = performance.now();
  const stamps: number[] = [];

  // 3. init pass
  await renderer.computeAsync(computeInit);
  stamps.push(performance.now());

  // 4. step passes — sync submits, await only the final dispatch
  let chunks = 1;
  for (let t = 0; t < steps; t++) {
    if (signal?.aborted) throw abortError();
    uStep.value = t;
    if (t === steps - 1) {
      await renderer.computeAsync(computeStep); // resolves ⇒ GPU state final
    } else {
      renderer.compute(computeStep);
    }
    stamps.push(performance.now());

    const done = t + 1;
    if (done % stepsPerChunk === 0 && done < steps) {
      chunks++;
      onProgress?.(done, steps);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (signal?.aborted) throw abortError();
    }
  }
  onProgress?.(steps, steps);

  return {
    paths: params.pathCount,
    steps,
    elapsedMs: performance.now() - t0,
    dispatchTimestampsMs: stamps,
    chunks,
  };
}

/** Test/telemetry hook: reset the bootstrap-upload cache (not for app use). */
export function _resetBootstrapUploadCache(): void {
  lastBootstrapPayload = null;
}
