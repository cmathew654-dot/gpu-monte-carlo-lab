/**
 * recomputeStats.ts — orchestrator-facing stats API (spec §4.3 task 6).
 * SINGLE OWNER: Agent 3.
 *
 * The integrator (Agent 6 / App wiring) calls:
 *
 *   useSimStore.getState().setStats(await recomputeStats(renderer, { params, ... }))
 *
 * This module does NOT write into the Zustand store itself — ONE
 * AMENDMENT A3 exception: when no `onMagnitudeStats` callback is supplied
 * it populates the additive `magnitudeStats` store field directly
 * (docs/CONTRACTS_STATS.md §10), because the frozen SimDriver integrator
 * wiring is outside A3's scope. The frozen SimStats path remains
 * store-free.
 *
 * TRIGGER CONTRACT (see docs/CONTRACTS_STATS.md):
 *   - Call ONLY on parameter-change completion, AFTER the corresponding
 *     runSimulation() promise has resolved (GPU state final — CONTRACTS.md
 *     §5). NEVER per frame (§1.4). One recompute = 3 small dispatches +
 *     ONE getArrayBufferAsync of the 995-uint packed stats buffer.
 *   - CANCELLATION: pass an AbortSignal; a new parameter change should
 *     abort the previous in-flight recompute (integrator keeps one
 *     AbortController per change). Aborts reject with an AbortError-named
 *     error — catch and swallow at the call site.
 *   - DEBOUNCE: Agent 6's store debounces slider→setParams at 150 ms
 *     (spec §4.6 task 3). To avoid double-debounce, call recomputeStats on
 *     COMMITTED param changes. A generic debounce() helper is exported
 *     here only for non-store callers.
 *
 * SAFE-WITHDRAWAL SIDE EFFECT (documented in CONTRACTS_STATS.md):
 *   withSafeWithdrawal: true re-runs runSimulation() up to 10 times at
 *   100k paths with candidate withdrawals (spec §2.5 search). This
 *   OVERWRITES the shared per-path GPU buffers, so after the search this
 *   module RE-RUNS runSimulation() with the caller's original params to
 *   restore the visualization state before returning. If the signal
 *   aborts mid-search, the restore is skipped and the caller MUST re-run
 *   the sim for the current params (its normal parameter-change flow does
 *   exactly that).
 */
import type { WebGPURenderer } from 'three/webgpu';
import type { MagnitudeStats, SimParams, SimStats } from '../../store/simStore';
import { useSimStore } from '../../store/simStore';
import { runSimulation } from '../runSimulation';
import type { BootstrapBlocksData } from '../model/bootstrap';
import { readSuccessRate } from './readback';
import { computeStats } from './computeStats';
import {
  SWR_MAX_ITERATIONS,
  SWR_PATH_COUNT,
  findSafeWithdrawal,
  upperBoundForParams,
} from './safeWithdrawal';

export type StatsStage = 'readback' | 'safe-withdrawal' | 'restore';

export interface RecomputeStatsOptions {
  /** Params whose sim state is CURRENTLY resident on the GPU. */
  params: SimParams;
  /** Model B block data — required iff params.model === 'bootstrap'. */
  bootstrapData?: BootstrapBlocksData | Float32Array | null;
  /**
   * Also run the §2.5 safe-withdrawal binary search (≤ 8 sims + 2 bracket
   * probes at 100k paths, then one restore re-sim). Default false — wire
   * this to an explicit user action, not every slider tick.
   */
  withSafeWithdrawal?: boolean;
  /** Abort in-flight readback/search (new parameter change supersedes). */
  signal?: AbortSignal;
  /** Progress: (stage, completedUnits, totalUnits). */
  onProgress?: (stage: StatsStage, completed: number, total: number) => void;
  /**
   * Called with freshly extracted stats after the readback (with
   * safeWithdrawalRate still 0 when the search is pending), and again with
   * the final object when the search completes. Lets the UI show
   * percentiles immediately while SWR spins.
   */
  onStats?: (stats: SimStats) => void;
  /**
   * AMENDMENT A3: called once with the magnitude-of-failure metrics
   * extracted from the same readback. When omitted, recomputeStats
   * populates the store's additive `magnitudeStats` field directly (the
   * module's ONE sanctioned store write — documented in
   * docs/CONTRACTS_STATS.md §10; the frozen integrator wiring in
   * SimDriver cannot be modified under A3's scope).
   */
  onMagnitudeStats?: (stats: MagnitudeStats) => void;
  /** Clock override for deterministic computedAt in tests. */
  now?: () => number;
}

function abortError(): Error {
  const e = new Error('recomputeStats aborted');
  e.name = 'AbortError';
  return e;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

/**
 * Extract SimStats from the GPU state produced by the last completed
 * runSimulation() for `opts.params`. Resolves with the frozen SimStats
 * shape; `safeWithdrawalRate` is 0 unless `withSafeWithdrawal` was set.
 */
export async function recomputeStats(
  renderer: WebGPURenderer,
  opts: RecomputeStatsOptions,
): Promise<SimStats> {
  const { params, bootstrapData = null, signal, onProgress, onStats } = opts;
  const now = opts.now ?? Date.now;

  throwIfAborted(signal);
  onProgress?.('readback', 0, 1);

  const { stats, magnitude } = await computeStats(renderer, {
    params,
    signal,
    now,
  });
  onProgress?.('readback', 1, 1);

  if (opts.onMagnitudeStats) {
    opts.onMagnitudeStats(magnitude);
  } else {
    useSimStore.getState().setMagnitudeStats(magnitude);
  }

  if (!opts.withSafeWithdrawal) {
    onStats?.(stats);
    return stats;
  }

  // Emit the readback stats immediately (SWR pending, 0 = "not computed").
  onStats?.(stats);

  // §2.5 binary search at 100k paths. Each iteration re-sims with a
  // candidate withdrawal, then reads the success rate back.
  onProgress?.('safe-withdrawal', 0, SWR_MAX_ITERATIONS);
  const result = await findSafeWithdrawal(
    async (withdrawal, sig) => {
      await runSimulation({
        renderer,
        params: { ...params, withdrawal, pathCount: SWR_PATH_COUNT },
        bootstrapData,
        signal: sig,
      });
      return readSuccessRate(renderer);
    },
    {
      signal,
      upperBound: upperBoundForParams(params),
      onIteration: (info) => onProgress?.('safe-withdrawal', info.iteration, SWR_MAX_ITERATIONS),
    },
    params,
  );

  // Restore the visualization state for the caller's actual params (the
  // search overwrote the shared per-path buffers at 100k paths).
  onProgress?.('restore', 0, 1);
  await runSimulation({ renderer, params, bootstrapData });
  onProgress?.('restore', 1, 1);

  const finalStats: SimStats = {
    ...stats,
    safeWithdrawalRate: result.withdrawal,
    computedAt: now(),
  };
  onStats?.(finalStats);
  return finalStats;
}

// ---------------------------------------------------------------------------
// Debounce helper (for non-store callers — see trigger contract above;
// Agent 6's store already debounces slider input at 150 ms, spec §4.6).
// ---------------------------------------------------------------------------

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
  /** True while an invocation is pending. */
  pending(): boolean;
}

/** Trailing-edge debounce, default 150 ms (spec §4.3 task 6 / §4.6). */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs = 150,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = ((...args: A) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  }) as Debounced<A>;
  debounced.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  debounced.pending = () => timer !== null;
  return debounced;
}
