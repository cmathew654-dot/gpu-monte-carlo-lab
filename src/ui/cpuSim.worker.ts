/**
 * cpuSim.worker.ts — Web Worker wrapper around Agent 2's runCpuSim
 * (spec §4.6 task 4, R4). SINGLE OWNER: Agent 6.
 *
 * Implements the frozen worker message protocol from docs/CONTRACTS.md §6.
 * `runCpuSim` is the ONLY entry point this worker calls (contract rule).
 * All ArrayBuffers are transferred zero-copy; callers discard stale jobIds
 * (debounced supersede). Instantiated via Vite worker syntax:
 *   new Worker(new URL('./cpuSim.worker.ts', import.meta.url), { type: 'module' })
 */
import { runCpuSim } from '../sim/fallback/cpuSim';
import type { MagnitudeStats, SimParams, SimStats } from '../store/simStore';

// ---------------------------------------------------------------------------
// Protocol (docs/CONTRACTS.md §6 — frozen; AMENDMENT A3 additions marked).
// ---------------------------------------------------------------------------

/** Main → Worker. */
export interface CpuSimRequest {
  type: 'run';
  jobId: number;
  params: SimParams;
  /** Float32Array bytes, blockCount×12, block-major. Required for bootstrap. */
  bootstrapBlocks?: ArrayBuffer | null;
  /** AMENDMENT A3 (additive): bond block bytes, blockCount×12, block-major,
   * month-aligned with bootstrapBlocks. Required for bootstrap + glidepath. */
  bondBlocks?: ArrayBuffer | null;
  includePaths?: boolean; // default false
}

/** Worker → Main, success. */
export interface CpuSimResultMessage {
  type: 'result';
  jobId: number;
  stats: SimStats;
  /** AMENDMENT A3 (additive): magnitude-of-failure metrics. */
  magnitude?: MagnitudeStats;
  elapsedMs: number;
  paths?: {
    terminalWealth: ArrayBuffer;
    maxDrawdown: ArrayBuffer;
    failureStep: ArrayBuffer;
  };
}

/** Worker → Main, failure. */
export interface CpuSimErrorMessage {
  type: 'error';
  jobId: number;
  message: string;
}

export type CpuSimResponse = CpuSimResultMessage | CpuSimErrorMessage;

// ---------------------------------------------------------------------------
// Worker scope (typed without pulling in the WebWorker lib).
// ---------------------------------------------------------------------------

interface WorkerScope {
  onmessage: ((ev: MessageEvent<CpuSimRequest>) => void) | null;
  postMessage(message: CpuSimResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (ev) => {
  const req = ev.data;
  if (!req || req.type !== 'run') return;
  try {
    const bootstrapData = req.bootstrapBlocks ? new Float32Array(req.bootstrapBlocks) : null;
    const bondBlocks = req.bondBlocks ? new Float32Array(req.bondBlocks) : null;
    const result = runCpuSim(req.params, { bootstrapData, bondBlocks });

    const res: CpuSimResultMessage = {
      type: 'result',
      jobId: req.jobId,
      stats: result.stats,
      magnitude: result.magnitude,
      elapsedMs: result.elapsedMs,
    };
    const transfer: Transferable[] = [];
    if (req.includePaths) {
      res.paths = {
        terminalWealth: result.terminalWealth.buffer as ArrayBuffer,
        maxDrawdown: result.maxDrawdown.buffer as ArrayBuffer,
        failureStep: result.failureStep.buffer as ArrayBuffer,
      };
      transfer.push(res.paths.terminalWealth, res.paths.maxDrawdown, res.paths.failureStep);
    }
    scope.postMessage(res, transfer);
  } catch (err) {
    const res: CpuSimErrorMessage = {
      type: 'error',
      jobId: req.jobId,
      message: err instanceof Error ? err.message : String(err),
    };
    scope.postMessage(res);
  }
};
