/**
 * simStore.ts — Zustand store for the GPU Monte Carlo Lab.
 *
 * FROZEN CONTRACT (spec §4.1 task 6 / §5 conflict rules):
 * The `SimParams` and `SimStats` interfaces below are FROZEN. Other agents
 * (2, 3, 5, 6, 7) build against this exact shape. Do not rename, retype, or
 * reorder fields. Agent 6 EXTENDS the store with actions but must not change
 * these interfaces or the defaults' semantics.
 *
 * Agent 6 extension (spec §4.6 task 3): action surface + a 150 ms debounced
 * param-commit. UI writes `params` live (slider drags stay 60 fps responsive)
 * and marks stats stale immediately; `committedParams` only advances 150 ms
 * after the last change (or immediately for discrete actions), so the sim
 * driver — GPU (integrator wires recomputeStats → setStats) or CPU worker
 * (src/ui/useCpuSim.ts) — re-sims once on release, not 60 times per drag.
 * Sim drivers MUST subscribe to `committedParams`, never to `params`.
 *
 * TypeScript strict, zero `any` (R6).
 */
import { create } from 'zustand';
import type { ModelComparison } from '../sim/frontier/types';

// ---------------------------------------------------------------------------
// Frozen contract — SimParams (spec §4.1)
// ---------------------------------------------------------------------------
export interface SimParams {
  model: 'gbm' | 'bootstrap' | 'fattail';
  pathCount: 10_000 | 100_000 | 1_000_000;
  horizonYears: number; // 10..40
  retireYear: number; // 0..horizonYears
  initialWealth: number; // real $
  contribution: number; // real $/mo, accumulation
  withdrawal: number; // real $/mo, retirement
  mu: number;
  sigma: number; // Model A/C
  glidepath: { start: number; end: number } | null;
  seed: number;
}

// ---------------------------------------------------------------------------
// Frozen contract — SimStats (spec §4.1)
// ---------------------------------------------------------------------------
export interface SimStats {
  successRate: number;
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  /** AMENDMENT A3 semantics: conditional MEAN of the worst (deepest) decile
   * of per-path max drawdowns ∈ [0,1] — NOT the 10th percentile (the pre-A3
   * definition materially understated the tail). */
  worstDecileMaxDD: number;
  safeWithdrawalRate: number;
  medianFailureYear: number | null;
  computedAt: number; // timestamp of last valid readback
}

// ---------------------------------------------------------------------------
// AMENDMENT A3 ADDITION — magnitude-of-failure metrics ("failure has a
// size"). ADDITIVE ONLY: the frozen SimParams/SimStats shapes above are
// untouched; this rides in its own store field, populated in the same
// readback/recompute flow as SimStats (GPU: recomputeStats; CPU: the
// fallback worker). Conventions in docs/CONTRACTS_STATS.md §10.
// ---------------------------------------------------------------------------
export interface MagnitudeStats {
  /** Among FAILED paths: median of (horizonMonths − failureMonth)/12 —
   * how many years of the plan the median failure leaves unfunded.
   * null when no path failed. */
  medianShortfallYears: number | null;
  /** Among FAILED paths: median real-dollar unpaid withdrawals after
   * failure = (horizonMonths − failureMonth) × monthly withdrawal, real and
   * UNDISCOUNTED (documented convention — no discount-rate assumption).
   * null when no path failed. */
  medianUnfundedObligation: number | null;
  /** Number of failed paths the medians are taken over. */
  failedPaths: number;
  computedAt: number;
}

export interface TriStats {
  successRates: {
    gbm: number;
    bootstrap: number;
    fattail: number;
  };
  computedAt: number;
}

// ---------------------------------------------------------------------------
// viz2 ADDITION — per-snapshot distribution readback (extended stats).
// ADDITIVE ONLY: the frozen SimParams/SimStats shapes above are untouched.
// Produced by src/sim/stats/snapReadback.ts (GPU) after each completed re-sim
// — same param-change-only trigger as SimStats, NEVER per frame.
// ---------------------------------------------------------------------------
export interface SnapshotStats {
  /** Valid snapshots per path this run (≤ SNAP_MAX). */
  snapCount: number;
  /** Months between snapshots (horizon-adaptive, mirrors uSnapStride). */
  snapStrideMonths: number;
  /** Total simulated months (horizonYears × 12). */
  horizonMonths: number;
  /** Active paths that built the histograms (== paths alive at snapshot 0). */
  totalPaths: number;
  /**
   * Per-snapshot survivor wealth histograms, row-major
   * [snapCount × SNAP_BINS]: row s bins the wealth of paths alive at
   * snapshot s over the FIXED log10 range [SNAP_LOG_LO, SNAP_LOG_LO+SNAP_LOG_SPAN]
   * (constants in src/sim/stats/snapStats.ts). Dead paths (wealth 0) are
   * excluded, so row sums shrink as paths fail.
   */
  hist: Uint32Array;
  /**
   * Per-snapshot SURVIVOR quantiles, row-major [snapCount × 5] absolute $
   * (p5, p25, p50, p75, p95), log-space in-bin interpolated. 0 when a
   * snapshot has no survivors.
   */
  quantiles: Float32Array;
  /** Cumulative failure fraction at each snapshot (dead so far / total). */
  cumFailure: Float32Array;
  computedAt: number;
}

// ---------------------------------------------------------------------------
// Capability detection (spec §3.7). Single source for the GPU/CPU branch.
// ---------------------------------------------------------------------------
export type SimMode = 'gpu' | 'cpu';

/**
 * viz4 audience split: 'client' is the default calm view (percentile band
 * surfaces + narrative HUD); 'advisor' is the full v3 terminal. VIEW-ONLY —
 * both modes share the same sim, buffers, and stats paths; nothing about
 * the simulation changes with the audience. Not persisted.
 */
export type ViewMode = 'client' | 'advisor';

export const hasWebGPU = (): boolean =>
  typeof navigator !== 'undefined' && 'gpu' in navigator;

/**
 * Initial store mode. Mirrors hasWebGPU(), plus a demo/test override:
 * `?cpu=1` forces CPU fallback on WebGPU-capable machines so the R4 path
 * (worker, badge, capped path count) can be exercised without a second
 * browser. Note: CanvasRoot branches on hasWebGPU() itself, so the override
 * keeps the canvas mounted — it exercises the CPU pipeline, not the DOM
 * fallback container.
 */
const detectInitialMode = (): SimMode => {
  if (!hasWebGPU()) return 'cpu';
  if (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('cpu')
  ) {
    return 'cpu';
  }
  return 'gpu';
};

// ---------------------------------------------------------------------------
// Defaults (spec §2.1/§2.2: model B bootstrap, 100k paths, 30y horizon; §2.4
// seed 42; §2.2 mu 7% / sigma 15% real equity).
// retireYear 0 = fully retired at t0 (flagship "probability of success" view;
// Agent 5's presets cover accumulation-phase scenarios).
// ---------------------------------------------------------------------------
export const DEFAULT_SIM_PARAMS: SimParams = {
  model: 'bootstrap',
  pathCount: 100_000,
  horizonYears: 30,
  retireYear: 0,
  initialWealth: 1_000_000,
  contribution: 2_000,
  withdrawal: 5_000,
  mu: 0.07,
  sigma: 0.15,
  glidepath: null,
  seed: 42,
};

// ---------------------------------------------------------------------------
// Agent 6 additions — UI constants.
// ---------------------------------------------------------------------------

/** Slider → sim-driver debounce (spec §4.6 task 3). */
export const PARAM_COMMIT_DEBOUNCE_MS = 150;

/** R4: CPU fallback mode never runs more than 10k paths. */
export const CPU_PATH_CAP = 10_000 as const;

/** viz2: live-drag preview sims run at this capped path count (cheap enough
 * to re-sim mid-drag); full-count sims run on commit. */
export const PREVIEW_PATH_COUNT = 10_000 as const;

/** Valid path-count options for the segmented control. */
export const PATH_COUNT_OPTIONS = [10_000, 100_000, 1_000_000] as const;

/** Preset payload accepted by applyPreset (Agent 5 scenarios.json schema). */
export interface SimPreset {
  name?: string;
  description?: string;
  params: Partial<SimParams>;
}

// ---------------------------------------------------------------------------
// Store shape. The state keys `params`, `stats`, `mode` and the actions
// `setParams`, `setStats`, `setMode` are frozen (Agent 1). Everything below
// them is Agent 6's extension surface.
// ---------------------------------------------------------------------------
export interface SimState {
  /** Current simulation parameters (drives GPU uniform block). */
  params: SimParams;
  /** Last computed statistics; null until first readback completes. */
  stats: SimStats | null;
  /** 'gpu' when WebGPU is available, 'cpu' fallback otherwise (R4). */
  mode: SimMode;

  /** Merge a partial parameter update. Callers debounce (Agent 6, 150 ms). */
  setParams: (partial: Partial<SimParams>) => void;
  /** Replace the stats object after a stats readback (Agent 3). */
  setStats: (stats: SimStats) => void;
  /** Set the capability mode (determined once at startup). */
  setMode: (mode: SimMode) => void;

  // --- Agent 6 extension surface -------------------------------------------

  /**
   * Debounced mirror of `params`. Sim drivers (GPU resim driver, CPU worker
   * hook) subscribe to THIS, not `params`: it only advances 150 ms after the
   * last `setParams` call, or immediately for discrete actions.
   */
  committedParams: SimParams;
  /** True when `params`/`committedParams` have changed since the last
   * `setStats` — drives the "recomputing…" shimmer. Never blocks input. */
  isStale: boolean;
  /** True while a sim/stats computation is in flight (markRecomputing). */
  isRecomputing: boolean;
  /** Presentation mode: hides rails, enlarges key stats (spec §4.6 task 5). */
  presentation: boolean;

  // --- viz2 extension surface (additive; nothing above changes) ------------

  /**
   * Per-snapshot distribution readback (histograms, survivor quantiles,
   * cumulative failure) powering the year cursor cross-section and the
   * percentile guide lines. null until the first GPU snap-stats readback
   * lands; stays null in CPU fallback mode (the frozen §6 worker protocol
   * carries no history — documented viz2 limitation, not a regression).
   */
  snapshotStats: SnapshotStats | null;
  /**
   * True while the scene shows a live-drag PREVIEW sim (10k paths, run on
   * `params` mid-drag before the 150 ms commit). The badge reads this to
   * show "LIVE · 10k preview" vs the full count.
   */
  previewMode: boolean;
  /** Replace the snapshot stats after a snap readback (viz2). */
  setSnapshotStats: (stats: SnapshotStats | null) => void;
  /** Enter/leave live-drag preview mode (viz2, GPU driver only). */
  setPreviewMode: (preview: boolean) => void;

  // --- A3 extension surface (additive; nothing above changes) -------------

  /**
   * AMENDMENT A3: magnitude-of-failure metrics ("failure has a size") —
   * median shortfall years and median unfunded obligation over failed
   * paths. null until the first stats readback lands. Populated in the
   * same flow as `stats` (GPU: recomputeStats; CPU: fallback worker).
   */
  magnitudeStats: MagnitudeStats | null;
  /** Replace the magnitude-of-failure stats after a stats readback (A3). */
  setMagnitudeStats: (stats: MagnitudeStats | null) => void;

  /** A4: success-rate triangulation across all three return models. */
  triStats: TriStats | null;
  /** A5: complete outcomes across all three return models. */
  modelComparison: ModelComparison | null;
  setModelComparison: (
    comparison: Omit<ModelComparison, 'computedAt'> | null,
  ) => void;
  setTriStats: (stats: TriStats | null) => void;

  // --- viz3 extension surface (additive; nothing above changes) ------------

  /**
   * viz3 hero thread: index of the rendered path whose TERMINAL wealth is
   * closest to the run's median, picked CPU-side from the param-change-only
   * pathWealth readback (src/sim/stats/heroPath.ts). -1 = no hero (before
   * the first readback). Valid only for the sim class currently resident on
   * the GPU — SimDriver re-picks after EVERY landed run, previews included,
   * so the hero always exists in the displayed sim.
   */
  heroPathIndex: number;
  /** Replace the hero path index after a hero readback (viz3). */
  setHeroPathIndex: (index: number) => void;

  // --- viz4 extension surface (additive; nothing above changes) ------------

  /**
   * Audience view: 'client' (default — calm percentile bands + narrative
   * HUD) or 'advisor' (the full v3 terminal). Pure view state: sim drivers,
   * readbacks, and stats never branch on it. Keyboard 'a' toggles.
   */
  viewMode: ViewMode;
  /** Set the audience view explicitly. */
  setViewMode: (viewMode: ViewMode) => void;
  /** Toggle client ↔ advisor ('a' keyboard shortcut). */
  toggleViewMode: () => void;

  /** Flush the pending debounced commit immediately (discrete actions). */
  commitParams: () => void;
  /** Switch return model; commits immediately. */
  setModel: (model: SimParams['model']) => void;
  /** Switch path count; commits immediately. CPU mode clamps to 10k (R4). */
  setPathCount: (pathCount: SimParams['pathCount']) => void;
  /** New random u32 seed; commits immediately (R3 reproducibility handle). */
  rerollSeed: () => void;
  /** Apply a scenario preset (Agent 5's scenarios.json); commits immediately. */
  applyPreset: (preset: SimPreset) => void;
  /** Sim driver marks computation start/end; drives the shimmer. */
  markRecomputing: (recomputing: boolean) => void;
  /** Presentation-mode toggle (button + 'p' keyboard shortcut). */
  setPresentation: (presentation: boolean) => void;
  togglePresentation: () => void;
}

// ---------------------------------------------------------------------------
// Internal helpers.
// ---------------------------------------------------------------------------

/** Clamp/normalize invariants after any merge: retireYear ≤ horizonYears;
 * CPU mode caps pathCount at 10k. Keeps SimParams fields otherwise untouched. */
function normalizeParams(params: SimParams, mode: SimMode): SimParams {
  const retireYear = Math.min(Math.max(0, params.retireYear), params.horizonYears);
  const pathCount =
    mode === 'cpu' && params.pathCount > CPU_PATH_CAP
      ? CPU_PATH_CAP
      : params.pathCount;
  if (retireYear === params.retireYear && pathCount === params.pathCount) {
    return params;
  }
  return { ...params, retireYear, pathCount };
}

let commitTimer: ReturnType<typeof setTimeout> | null = null;

function clearCommitTimer(): void {
  if (commitTimer !== null) {
    clearTimeout(commitTimer);
    commitTimer = null;
  }
}

export const useSimStore = create<SimState>()((set, get) => {
  // Resolve the initial mode once so BOTH `mode` and the initial
  // `committedParams` go through the same normalization path as commits
  // (CPU mode caps pathCount at 10k — previously the init bypassed
  // normalizeParams and the first CPU load ran uncapped).
  const initialMode = detectInitialMode();

  /** Debounced commit: committedParams catches up with params 150 ms after
   * the last write. Sim drivers subscribe to committedParams only. */
  const scheduleCommit = () => {
    clearCommitTimer();
    commitTimer = setTimeout(() => {
      commitTimer = null;
      const { params, committedParams, mode } = get();
      if (params === committedParams) return;
      set({ committedParams: normalizeParams(params, mode) });
    }, PARAM_COMMIT_DEBOUNCE_MS);
  };

  /** Shared path for discrete actions: merge + normalize + stale + commit now. */
  const applyNow = (partial: Partial<SimParams>) => {
    clearCommitTimer();
    set((state) => {
      const params = normalizeParams({ ...state.params, ...partial }, state.mode);
      return {
        params,
        committedParams: params,
        isStale: true,
        triStats: null,
        modelComparison: null,
      };
    });
  };

  return {
    params: DEFAULT_SIM_PARAMS,
    stats: null,
    mode: initialMode,

    setParams: (partial) => {
      set((state) => ({
        params: normalizeParams({ ...state.params, ...partial }, state.mode),
        isStale: true,
        triStats: null,
        modelComparison: null,
      }));
      scheduleCommit();
    },
    setStats: (stats) =>
      // Stamp computedAt at the store boundary so "last valid readback" is
      // defined identically for GPU readback and the CPU worker.
      set({ stats: { ...stats, computedAt: Date.now() }, isStale: false }),
    setMode: (mode) =>
      set((state) => {
        const params = normalizeParams(state.params, mode);
        return {
          mode,
          params,
          committedParams: params,
          isStale: params !== state.params ? true : state.isStale,
          triStats: null,
          modelComparison: null,
        };
      }),

    // Normalized like every commit (CPU 10k cap, retireYear ≤ horizonYears)
    // so the first load — not just the first commit — respects the cap.
    committedParams: normalizeParams(DEFAULT_SIM_PARAMS, initialMode),
    isStale: true, // no stats computed yet for the default params
    isRecomputing: false,
    presentation: false,
    snapshotStats: null, // viz2: no snap readback yet
    previewMode: false, // viz2: full-count sim until a drag preview runs

    commitParams: () => {
      clearCommitTimer();
      const { params, committedParams, mode } = get();
      if (params === committedParams) return;
      set({ committedParams: normalizeParams(params, mode) });
    },
    setModel: (model) => applyNow({ model }),
    setPathCount: (pathCount) => applyNow({ pathCount }),
    rerollSeed: () => applyNow({ seed: Math.floor(Math.random() * 0x1_0000_0000) }),
    applyPreset: (preset) => applyNow(preset.params),
    markRecomputing: (recomputing) => set({ isRecomputing: recomputing }),
    setPresentation: (presentation) => set({ presentation }),
    togglePresentation: () => set((state) => ({ presentation: !state.presentation })),
    setSnapshotStats: (snapshotStats) =>
      // Stamp computedAt at the store boundary, mirroring setStats.
      set({
        snapshotStats: snapshotStats
          ? { ...snapshotStats, computedAt: Date.now() }
          : null,
      }),
    magnitudeStats: null, // A3: no stats readback yet
    setMagnitudeStats: (magnitudeStats) =>
      // Stamp computedAt at the store boundary, mirroring setStats.
      set({
        magnitudeStats: magnitudeStats
          ? { ...magnitudeStats, computedAt: Date.now() }
          : null,
      }),
    triStats: null,
    modelComparison: null,
    setTriStats: (triStats) =>
      set({
        triStats: triStats
          ? { ...triStats, computedAt: Date.now() }
          : null,
      }),
    setModelComparison: (modelComparison) =>
      set({
        modelComparison: modelComparison
          ? { ...modelComparison, computedAt: Date.now() }
          : null,
      }),
    setPreviewMode: (previewMode) =>
      // Cheap guard: drags fire this repeatedly — skip no-op updates.
      get().previewMode === previewMode ? undefined : set({ previewMode }),
    heroPathIndex: -1, // viz3: no hero until the first readback lands
    setHeroPathIndex: (heroPathIndex) =>
      // Cheap guard like setPreviewMode: consecutive runs can re-pick the
      // same path — skip no-op updates.
      get().heroPathIndex === heroPathIndex ? undefined : set({ heroPathIndex }),
    viewMode: 'client', // viz4: the client view is the default audience
    setViewMode: (viewMode) => set({ viewMode }),
    toggleViewMode: () =>
      set((state) => ({
        viewMode: state.viewMode === 'client' ? 'advisor' : 'client',
      })),
  };
});
