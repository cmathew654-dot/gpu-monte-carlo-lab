/**
 * SimDriver.tsx — GPU-mode sim driver (integrator wiring, spec §1.4).
 *
 * Mounted INSIDE the R3F Canvas (CanvasRoot's WebGPU branch), so
 * `useThree((s) => s.gl)` yields the initialized WebGPURenderer (async `gl`
 * factory — children render only after `renderer.init()` resolved).
 *
 * Data flow (Agent 6's wiring contract, src/store/simStore.ts):
 *
 *   committedParams change (150 ms debounced)
 *     → abort in-flight run (one AbortController per change)
 *     → markRecomputing(true)
 *     → runSimulation({ renderer, params, bootstrapData, signal })
 *         (uniform block → bootstrap upload → computeInit → computeStep×N;
 *          resolves when GPU state is final, CONTRACTS.md §5)
 *     → recomputeStats(renderer, { params, bootstrapData, signal })
 *         (withSafeWithdrawal: false — SWR is on-demand, CONTRACTS_STATS §5)
 *     → setStats(stats)  (stamps computedAt → ConeParticles' reveal
 *          restarts via its stats.computedAt subscription; StatCards update)
 *     → markRecomputing(false)
 *
 * Bootstrap data: src/data/historicalReturns.json is parsed ONCE through
 * parseBootstrapBlocksFile() (CONTRACTS.md §7 — no transformation) and
 * passed to every run; runSimulation skips the re-upload while the payload
 * reference is unchanged.
 *
 * Safe withdrawal on demand: the SWR binary search overwrites the shared
 * per-path GPU buffers (CONTRACTS_STATS.md §5), so it is wired to an
 * explicit user action — src/ui/SwrButton.tsx calls
 * `simRuntime.requestSafeWithdrawal()`, which re-enters the SAME pipeline
 * below with withSafeWithdrawal: true (abort → handshake → setStats).
 * recomputeStats restores the visualization state afterwards.
 *
 * CPU fallback (?cpu=1 keeps the canvas mounted): this driver only runs
 * when store mode === 'gpu'; Agent 6's useCpuSim owns the 'cpu' pipeline.
 *
 * Error handling: AbortError = superseded work, swallowed (CONTRACTS_STATS
 * §4). Anything else (WGSL compile failure, missing bootstrap data, …) is
 * logged and surfaced only through existing store actions
 * (markRecomputing(false)); the stale shimmer stays on until a later
 * commit succeeds. No new store fields.
 */
import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import type { WebGPURenderer } from 'three/webgpu';
import historicalReturnsJson from '../data/historicalReturns.json';
import {
  parseBootstrapBlocksFile,
  type BootstrapBlocksData,
  type BootstrapBlocksFile,
} from '../sim/model/bootstrap';
import { runSimulation } from '../sim/runSimulation';
import { recomputeStats } from '../sim/stats/recomputeStats';
import {
  computeStats,
  type ComputedStats,
} from '../sim/stats/computeStats';
import { secondaryModels } from '../sim/model/triangulation';
import {
  modelOutcome,
  orderedModelComparison,
  type ModelOutcome,
  type ShippedModelKey,
} from '../sim/frontier/modelComparison';
import { runSnapHistPassesAndRead } from '../sim/stats/snapReadback';
import { readHeroPathIndex } from '../sim/stats/heroPath';
import {
  PREVIEW_PATH_COUNT,
  useSimStore,
  type SimParams,
  type TriStats,
} from '../store/simStore';
import { simRuntime } from './simRuntime';

/**
 * viz2 live-drag morph: mid-drag (`params` ahead of the 150 ms
 * `committedParams`) a capped 10k-path sim (PREVIEW_PATH_COUNT) is
 * dispatched debounced at this interval, so the cone visibly morphs while
 * the slider moves. The run goes through the SAME abort/token pipeline as
 * full sims: a newer preview or the commit's full-count sim aborts it.
 * `previewMode` flips true only when a preview actually LANDS (setStats),
 * so the sprite plan (ConeParticles) and the badge always describe the sim
 * currently resident on the GPU.
 */
const PREVIEW_DEBOUNCE_MS = 200;

export function SimDriver() {
  const renderer = useThree((s) => s.gl) as unknown as WebGPURenderer;
  const mode = useSimStore((s) => s.mode);

  // Parse Agent 5's historical series once (CONTRACTS.md §7). The data is
  // FINAL (1195 blocks × 12); null would mean the placeholder is still in
  // place, in which case Model B runs throw and are caught below.
  const bootstrapData = useMemo<BootstrapBlocksData | null>(() => {
    try {
      return parseBootstrapBlocksFile(
        historicalReturnsJson as unknown as BootstrapBlocksFile,
      );
    } catch (err) {
      console.error('[SimDriver] failed to parse historicalReturns.json:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    if (mode !== 'gpu') {
      simRuntime.requestSafeWithdrawal = null;
      return;
    }

    let disposed = false;
    let controller: AbortController | null = null;
    let token = 0;
    const isCurrent = (t: number) => !disposed && t === token;

    const runPipeline = async (
      params: SimParams,
      withSafeWithdrawal: boolean,
      preview = false,
    ): Promise<void> => {
      // Abort any in-flight run — one fresh AbortController per change
      // (CONTRACTS_STATS.md §4/§6). Also covers preview runs: the commit's
      // full-count sim (or a newer preview) aborts a stale preview.
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const myToken = ++token;

      const {
        markRecomputing,
        setStats,
        setSnapshotStats,
        setPreviewMode,
        setHeroPathIndex,
        setMagnitudeStats,
        setTriStats,
        setModelComparison,
      } = useSimStore.getState();
      markRecomputing(true);
      try {
        await runSimulation({ renderer, params, bootstrapData, signal });
        if (!isCurrent(myToken)) return;
        let primaryComputed: ComputedStats | null = null;
        let stats;
        if (withSafeWithdrawal) {
          stats = await recomputeStats(renderer, {
              params,
              bootstrapData,
              signal,
              withSafeWithdrawal: true,
              onMagnitudeStats: setMagnitudeStats,
            });
        } else {
          primaryComputed = await computeStats(renderer, { params, signal });
          setMagnitudeStats(primaryComputed.magnitude);
          stats = primaryComputed.stats;
        }
        if (!isCurrent(myToken)) return;
        setStats(stats);
        // viz2: per-snapshot distribution readback (12,288 B — histograms,
        // survivor quantiles, cumulative failure). Same param-change-only
        // trigger as the stats readback above; after recomputeStats the GPU
        // state matches `params` even when an SWR search ran (it restores).
        const snap = await runSnapHistPassesAndRead(renderer, params);
        if (!isCurrent(myToken)) return;
        setSnapshotStats(snap);
        // Preview mode flips exactly when the displayed sim changes class:
        // a landed preview shows "LIVE · 10k preview"; the next landed full
        // sim restores the full-count badge.
        setPreviewMode(preview);
        // viz3 hero thread: ONE extra param-change readback of pathWealth
        // (400 kB at 100k — docs/CONTRACTS_STATS.md §9) picks the rendered
        // path whose terminal wealth is closest to THIS run's median.
        // Previews re-pick too: the hero must exist in the sim class
        // currently resident on the GPU. Guarded separately — a hero
        // readback failure must not invalidate the stats that just landed.
        try {
          const hero = await readHeroPathIndex(
            renderer,
            params,
            stats.percentiles.p50,
          );
          if (!isCurrent(myToken)) return;
          setHeroPathIndex(hero);
        } catch (heroErr) {
          if (signal.aborted) return;
          console.error('[SimDriver] hero-path readback failed:', heroErr);
        }

        if (!preview && !withSafeWithdrawal) {
          if (!primaryComputed) {
            throw new Error('SimDriver: primary statistics missing');
          }
          const successRates: TriStats['successRates'] = {
            gbm: 0,
            bootstrap: 0,
            fattail: 0,
          };
          const outcomes = new Map<ShippedModelKey, ModelOutcome>();
          successRates[params.model] = stats.successRate;
          outcomes.set(
            params.model,
            modelOutcome(params.model, primaryComputed),
          );
          for (const model of secondaryModels(params.model)) {
            const secondaryParams = { ...params, model };
            await runSimulation({
              renderer,
              params: secondaryParams,
              bootstrapData,
              signal,
            });
            const secondary = await computeStats(renderer, {
              params: secondaryParams,
              signal,
            });
            if (!isCurrent(myToken)) return;
            successRates[model] = secondary.stats.successRate;
            outcomes.set(model, modelOutcome(model, secondary));
          }

          // Secondary runs overwrite shared GPU buffers. Restore the selected
          // model before publishing the range so the scene remains primary.
          await runSimulation({
            renderer,
            params,
            bootstrapData,
            signal,
          });
          if (!isCurrent(myToken)) return;
          const comparison = orderedModelComparison(outcomes, params);
          setTriStats({ successRates, computedAt: 0 });
          setModelComparison(comparison);
        }
      } catch (err) {
        // Superseded work is not an error — the newer run owns the store.
        // Swallow ONLY rejections caused by our own AbortController: a
        // failing WebGPU device also rejects with an 'AbortError'-named
        // DOMException (e.g. mapAsync on a destroyed device), and that one
        // is real and must surface in the console.
        if (signal.aborted) return;
        console.error('[SimDriver] GPU simulation failed:', err);
      } finally {
        if (isCurrent(myToken)) markRecomputing(false);
      }
    };

    // On-demand SWR entry point for SwrButton: re-enters this pipeline for
    // the CURRENT committed params (aborts whatever is in flight first).
    const requestSafeWithdrawal = () => {
      void runPipeline(useSimStore.getState().committedParams, true);
    };
    simRuntime.requestSafeWithdrawal = requestSafeWithdrawal;

    // Seed the first run so the scene isn't empty, then re-sim on each
    // debounced commit. Full sims subscribe to committedParams, NEVER
    // params (Agent 6's wiring contract) — with ONE viz2 exception below:
    // the capped 10k live-drag preview watches `params` directly.
    let lastCommitted = useSimStore.getState().committedParams;
    let lastPreviewParams = useSimStore.getState().params;
    let previewTimer: ReturnType<typeof setTimeout> | null = null;
    const clearPreviewTimer = () => {
      if (previewTimer !== null) {
        clearTimeout(previewTimer);
        previewTimer = null;
      }
    };
    void runPipeline(lastCommitted, false);
    const unsubscribe = useSimStore.subscribe((state) => {
      if (state.committedParams !== lastCommitted) {
        lastCommitted = state.committedParams;
        lastPreviewParams = state.committedParams;
        // A commit supersedes any pending preview — otherwise a stale
        // preview timer could fire after the full sim started and abort it.
        clearPreviewTimer();
        void runPipeline(state.committedParams, false);
        return;
      }
      // viz2 live-drag morph: params moved while uncommitted → schedule a
      // capped preview (abortable through the same pipeline). The 200 ms
      // debounce deliberately trails Agent 6's 150 ms commit debounce; the
      // timer is re-armed on every params change, so a settled drag commits
      // first and cancels the preview above.
      if (
        state.params !== lastPreviewParams &&
        state.params !== state.committedParams
      ) {
        lastPreviewParams = state.params;
        clearPreviewTimer();
        const previewParams = state.params;
        previewTimer = setTimeout(() => {
          previewTimer = null;
          const s = useSimStore.getState();
          if (disposed || s.committedParams === previewParams) return;
          void runPipeline(
            { ...previewParams, pathCount: PREVIEW_PATH_COUNT },
            false,
            true,
          );
        }, PREVIEW_DEBOUNCE_MS);
      }
    });

    return () => {
      disposed = true;
      clearPreviewTimer();
      controller?.abort();
      useSimStore.getState().setPreviewMode(false);
      unsubscribe();
      if (simRuntime.requestSafeWithdrawal === requestSafeWithdrawal) {
        simRuntime.requestSafeWithdrawal = null;
      }
    };
  }, [mode, renderer, bootstrapData]);

  return null;
}
