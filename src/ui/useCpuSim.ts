/**
 * useCpuSim.ts — CPU fallback driver hook (spec §4.6 task 4, R4).
 * SINGLE OWNER: Agent 6.
 *
 * Active only when store mode === 'cpu'. Subscribes to the store's
 * `committedParams` (150 ms debounced — sims once per slider release) and
 * runs Agent 2's runCpuSim inside a Web Worker (never the main thread).
 *
 * Each parameter commit runs:
 *   1. one base sim → setStats (all §2.5 stats except SWR, which runCpuSim
 *      deliberately leaves 0 — SWR is a search layer, CONTRACTS.md §6);
 *   2. a safe-withdrawal-rate binary search (§2.5: max W with success ≥ 90%,
 *      ≤ 8 bisection sims) layered on top of ordinary 'run' jobs, then a
 *      second setStats with safeWithdrawalRate filled in.
 *
 * Supersede discipline (CONTRACTS.md §6): every job carries a jobId and a
 * pipeline token; responses for stale tokens are discarded. Bootstrap block
 * bytes are re-copied per job (postMessage transfer detaches).
 */
import { useEffect, useRef, useState } from 'react';
import historicalReturnsJson from '../data/historicalReturns.json';
import {
  parseBootstrapBlocksFile,
  type BootstrapBlocksData,
  type BootstrapBlocksFile,
} from '../sim/model/bootstrap';
import { useSimStore, type SimParams } from '../store/simStore';
import type {
  CpuSimRequest,
  CpuSimResultMessage,
  CpuSimResponse,
} from './cpuSim.worker';

export interface CpuSimStatus {
  /** Wall time of the last completed base sim, ms. */
  elapsedMs: number | null;
  /** Last worker error (e.g. bootstrap data not yet shipped by Agent 5). */
  error: string | null;
}

const SWR_TARGET = 0.9;
const SWR_TOLERANCE = 0.005; // success ∈ [89.5%, 90.5%] converges early
const SWR_MAX_BISECTIONS = 8; // spec §2.5: ≤ 8 re-sims
const SWR_MAX_BRACKET = 100_000; // $/mo — beyond this SWR is unconstrained

export function useCpuSim(): CpuSimStatus {
  const mode = useSimStore((s) => s.mode);
  const [status, setStatus] = useState<CpuSimStatus>({ elapsedMs: null, error: null });

  const workerRef = useRef<Worker | null>(null);
  const jobCounterRef = useRef(0);
  const tokenRef = useRef(0);
  const pendingRef = useRef(
    new Map<
      number,
      { resolve: (m: CpuSimResultMessage) => void; reject: (e: Error) => void }
    >(),
  );
  const bootstrapRef = useRef<BootstrapBlocksData | null | undefined>(undefined);

  useEffect(() => {
    if (mode !== 'cpu') return;

    // Parse Agent 5's historical data once (placeholder → null until shipped).
    if (bootstrapRef.current === undefined) {
      try {
        bootstrapRef.current = parseBootstrapBlocksFile(
          historicalReturnsJson as unknown as BootstrapBlocksFile,
        );
      } catch (err) {
        bootstrapRef.current = null;
        setStatus({
          elapsedMs: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const pending = pendingRef.current;
    let disposed = false;

    const worker = new Worker(new URL('./cpuSim.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (ev: MessageEvent<CpuSimResponse>) => {
      const msg = ev.data;
      const job = pending.get(msg.jobId);
      if (!job) return; // stale jobId — discarded (contract §6)
      pending.delete(msg.jobId);
      if (msg.type === 'error') {
        job.reject(new Error(msg.message));
      } else {
        job.resolve(msg);
      }
    };
    worker.onerror = (ev) => {
      setStatus((s) => ({ ...s, error: ev.message || 'CPU worker failed' }));
    };

    const runJob = (params: SimParams): Promise<CpuSimResultMessage> => {
      const jobId = ++jobCounterRef.current;
      let bootstrapBlocks: ArrayBuffer | null = null;
      let bondBlocks: ArrayBuffer | null = null;
      if (params.model === 'bootstrap') {
        const data = bootstrapRef.current;
        if (!data) {
          return Promise.reject(
            new Error(
              'Bootstrap model needs historical return data ' +
                '(src/data/historicalReturns.json) — switch to GBM or Fat-tail.',
            ),
          );
        }
        // Copy per job: transfer detaches the buffer.
        bootstrapBlocks = data.blocks.slice().buffer as ArrayBuffer;
        // AMENDMENT A3: month-aligned bond sleeve for the glidepath mix.
        bondBlocks = data.bondBlocks ? (data.bondBlocks.slice().buffer as ArrayBuffer) : null;
      }
      const req: CpuSimRequest = {
        type: 'run',
        jobId,
        params,
        bootstrapBlocks,
        bondBlocks,
        includePaths: false,
      };
      const transfer: Transferable[] = [];
      if (bootstrapBlocks) transfer.push(bootstrapBlocks);
      if (bondBlocks) transfer.push(bondBlocks);
      return new Promise<CpuSimResultMessage>((resolve, reject) => {
        pending.set(jobId, { resolve, reject });
        worker.postMessage(req, transfer);
      });
    };

    /** §2.5 SWR: max withdrawal with success ≥ 90%, bisection on 'run' jobs. */
    const searchSafeWithdrawal = async (
      params: SimParams,
      token: number,
    ): Promise<number | null> => {
      if (params.retireYear >= params.horizonYears) return null; // no retirement phase
      // Bracket: raise hi until success < target (lo stays feasible).
      let lo = 0;
      let hi = Math.max(params.withdrawal * 2, 1_000);
      let bracketed = false;
      for (let i = 0; i < 8 && hi <= SWR_MAX_BRACKET; i++) {
        const r = await runJob({ ...params, withdrawal: hi });
        if (token !== tokenRef.current) return null;
        if (r.stats.successRate < SWR_TARGET) {
          bracketed = true;
          break;
        }
        lo = hi;
        hi *= 2;
      }
      if (!bracketed) return null; // even 100k/mo succeeds → unconstrained
      let best = 0;
      for (let i = 0; i < SWR_MAX_BISECTIONS; i++) {
        const mid = (lo + hi) / 2;
        const r = await runJob({ ...params, withdrawal: mid });
        if (token !== tokenRef.current) return null;
        const s = r.stats.successRate;
        if (s >= SWR_TARGET) {
          best = mid;
          lo = mid;
        } else {
          hi = mid;
        }
        if (Math.abs(s - SWR_TARGET) <= SWR_TOLERANCE) break;
      }
      return Math.round(best);
    };

    const runPipeline = async (params: SimParams): Promise<void> => {
      const token = ++tokenRef.current;
      const { markRecomputing, setStats, setMagnitudeStats } = useSimStore.getState();
      markRecomputing(true);
      setStatus((s) => ({ ...s, error: null }));
      try {
        const base = await runJob(params);
        if (disposed || token !== tokenRef.current) return;
        setStats(base.stats);
        // AMENDMENT A3: magnitude-of-failure metrics ride the same message.
        setMagnitudeStats(base.magnitude ?? null);
        setStatus({ elapsedMs: base.elapsedMs, error: null });

        const swr = await searchSafeWithdrawal(params, token);
        if (disposed || token !== tokenRef.current) return;
        if (swr !== null && swr > 0) {
          setStats({ ...base.stats, safeWithdrawalRate: swr });
        }
      } catch (err) {
        if (disposed || token !== tokenRef.current) return;
        setStatus({
          elapsedMs: null,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (!disposed && token === tokenRef.current) markRecomputing(false);
      }
    };

    // Initial run + subscribe to debounced commits.
    let lastCommitted = useSimStore.getState().committedParams;
    void runPipeline(lastCommitted);
    const unsubscribe = useSimStore.subscribe((state) => {
      if (state.committedParams !== lastCommitted) {
        lastCommitted = state.committedParams;
        void runPipeline(state.committedParams);
      }
    });

    return () => {
      disposed = true; // in-flight pipeline continuations no-op above
      unsubscribe();
      worker.terminate();
      workerRef.current = null;
      pending.clear();
    };
  }, [mode]);

  return status;
}
