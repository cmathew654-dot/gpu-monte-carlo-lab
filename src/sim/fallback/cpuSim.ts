/**
 * cpuSim.ts — CPU fallback simulation (spec §4.2 task 6, R4) and the §2.6
 * CPU REFERENCE implementation for Agent 7. SINGLE OWNER: Agent 2.
 *
 * Pure TS: NO DOM, NO three imports — runs in Node and in a Web Worker.
 * The math mirrors stepPaths.tsl.ts operation-for-operation (see the frozen
 * order in that file's header and in model/withdrawal.ts), over the SAME
 * bit-exact hash (model/hash.ts). Integer RNG behavior is identical to the
 * GPU; floating-point differs by f32-vs-f64 rounding only (§2.6 tolerances).
 *
 * Worker protocol (Agent 6): see docs/CONTRACTS.md §6.
 */
import type { MagnitudeStats, SimParams, SimStats } from '../../store/simStore';
import {
  stepSeedU,
  streamNormal,
  streamStudentT5,
  drawBlockIndex,
} from '../model/hash';
import {
  BLOCK_LENGTH,
  BOND_MU_REAL,
  MODEL_BOOTSTRAP,
  MODEL_FATTAIL,
  MODEL_GBM,
  MODEL_IDS,
  gbmMonthlyReturn,
  glidepathMix,
} from '../model/returnModels';
import { applyMonthlyStep, type MonthlyStepState } from '../model/withdrawal';
import { packBootstrapBlocks, type BootstrapBlocksData } from '../model/bootstrap';
import { snapCountForSteps, snapStrideForSteps } from '../model/history';

/** Quantile convention: linear interpolation on the sorted sample
 * (type-7, same as numpy default). Agent 3's GPU-histogram quantiles are
 * compared against this within §2.6 tolerances. */
export function quantile(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const idx = Math.min(Math.max(p, 0), 1) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, n - 1);
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * AMENDMENT A3 (docs/CONTRACTS.md §10) — `worstDecileMaxDD` semantics:
 * the CONDITIONAL MEAN of the worst decile of per-path max drawdowns (the
 * mean of the deepest 10 %), NOT the 10th percentile of the ascending
 * sort. The pre-A3 `quantile(ddSorted, 0.1)` returned the SHALLOWEST
 * decile boundary (e.g. 41.5 % where the median path's max drawdown was
 * 100 % — the card materially understated the tail). `ddSorted` must be
 * ASCENDING; the decile count is max(1, floor(n/10)), matching the
 * histogram extractor in stats/cpuReference.ts.
 */
export function worstDecileTailMean(ddSorted: ArrayLike<number>): number {
  const n = ddSorted.length;
  if (n === 0) return NaN;
  const k = Math.max(1, Math.floor(n / 10));
  let sum = 0;
  for (let i = n - k; i < n; i++) sum += ddSorted[i];
  return sum / k;
}

/**
 * AMENDMENT A3 — magnitude-of-failure metrics over the FAILED paths.
 * `failureStep` uses the cpuSim convention (−1 = never failed).
 * Conventions (documented in docs/CONTRACTS_STATS.md §10):
 *   - shortfallMonths = horizonMonths − failureMonth (months of unpaid
 *     withdrawals after ruin);
 *   - unfundedObligation = shortfallMonths × monthlyWithdrawal — a real,
 *     UNDISCOUNTED sum of the unpaid withdrawals (simple, explainable;
 *     no discount-rate assumption is smuggled in).
 * Both fields are medians over failed paths only, null when nothing failed.
 */
export function magnitudeOfFailure(
  failureStep: ArrayLike<number>,
  horizonMonths: number,
  monthlyWithdrawal: number,
  computedAt: number,
): MagnitudeStats {
  const shortfalls: number[] = [];
  for (let i = 0; i < failureStep.length; i++) {
    const f = failureStep[i];
    if (f >= 0) shortfalls.push(Math.max(horizonMonths - f, 0));
  }
  if (shortfalls.length === 0) {
    return {
      medianShortfallYears: null,
      medianUnfundedObligation: null,
      failedPaths: 0,
      computedAt,
    };
  }
  shortfalls.sort((a, b) => a - b);
  const medianShortfallMonths = quantile(shortfalls, 0.5);
  return {
    medianShortfallYears: medianShortfallMonths / 12,
    medianUnfundedObligation: medianShortfallMonths * monthlyWithdrawal,
    failedPaths: shortfalls.length,
    computedAt,
  };
}

export interface CpuSimResult {
  /** Full SimStats (safeWithdrawalRate is 0 — SWR is a search layered on
   * top of repeated sims, owned by Agent 3's stats module). */
  stats: SimStats;
  /** Terminal wealth per path (post-clamp: failed paths are 0). */
  terminalWealth: Float32Array;
  /** Per-path max drawdown during retirement ∈ [0, 1]. */
  maxDrawdown: Float32Array;
  /** Per-path failure step, −1 = never failed (pathFailed−1 on GPU). */
  failureStep: Int32Array;
  /**
   * AMENDMENT A1 (docs/CONTRACTS.md §9): decimated trajectory history,
   * present only when `options.includeHistory` is true. Run-sized layout
   * (no SNAP_MAX padding): `history[i*snapCount + s]` with
   * `snapCount = snapCountForSteps(steps)`. Snapshot semantics, stride and
   * slot math mirror the GPU pathHistory buffer exactly — element (i, s)
   * must equal GPU `pathHistory[i*SNAP_MAX + s]` within f32 rounding.
   */
  history?: Float32Array;
  /**
   * AMENDMENT A3 (docs/CONTRACTS_STATS.md §10): magnitude-of-failure
   * metrics over failed paths (median shortfall years / median unfunded
   * obligation; null when nothing failed). Always computed — cheap.
   */
  magnitude: MagnitudeStats;
  elapsedMs: number;
}

export interface RunCpuSimOptions {
  /** Required when params.model === 'bootstrap'. May carry A3 `bondBlocks`
   * (BootstrapBlocksData) — required for bootstrap + glidepath. */
  bootstrapData?: BootstrapBlocksData | Float32Array | null;
  /** AMENDMENT A3: bond blocks as raw Float32Array (blockCount×12,
   * block-major, month-aligned) for callers that ship equity/bond data as
   * separate byte arrays (the §6 worker protocol). Ignored when
   * `bootstrapData` is a BootstrapBlocksData that already carries bonds. */
  bondBlocks?: Float32Array | null;
  /** Clock override for deterministic computedAt in tests. */
  now?: () => number;
  /** AMENDMENT A1: also record the decimated trajectory history (default
   * false — the n×snapCount Float32Array can be large). */
  includeHistory?: boolean;
}

export function runCpuSim(params: SimParams, options: RunCpuSimOptions = {}): CpuSimResult {
  const t0 = (options.now ?? Date.now)();

  const n = params.pathCount;
  const steps = Math.round(params.horizonYears * 12);
  const retireStep = Math.round(params.retireYear * 12);
  const modelId = MODEL_IDS[params.model];
  const seed = params.seed >>> 0;

  let blocks: Float32Array | null = null;
  let bondBlocks: Float32Array | null = null;
  let blockCount = 0;
  if (modelId === MODEL_BOOTSTRAP) {
    const data = options.bootstrapData;
    if (data == null) {
      throw new Error('runCpuSim: model "bootstrap" requires bootstrapData');
    }
    const packed =
      data instanceof Float32Array
        ? packBootstrapBlocks(data, data.length / BLOCK_LENGTH)
        : data;
    blocks = packed.blocks;
    blockCount = packed.blockCount;
    bondBlocks = packed.bondBlocks ?? options.bondBlocks ?? null;
    // AMENDMENT A3: the bootstrap glidepath mixes equity with the
    // month-aligned bond sleeve — refuse to run silently without it.
    if (params.glidepath && bondBlocks == null) {
      throw new Error(
        'runCpuSim: bootstrap + glidepath requires bond block data (bondBlocks)',
      );
    }
  }

  const terminalWealth = new Float32Array(n);
  const maxDrawdown = new Float32Array(n);
  const failureStep = new Int32Array(n);

  // AMENDMENT A1+A2 history recording (mirrors the kernel's section 9; the
  // stride is the same horizon-adaptive value the driver writes into
  // uSnapStride — yearly ≤ 31y, ceil(steps/31) beyond).
  const snapStride = snapStrideForSteps(steps);
  const snapCount = snapCountForSteps(steps, snapStride);
  const history = options.includeHistory ? new Float32Array(n * snapCount) : undefined;

  let failedCount = 0;
  const failureYears: number[] = [];

  for (let i = 0; i < n; i++) {
    // init (mirrors initPaths.tsl.ts)
    const state: MonthlyStepState = {
      wealth: params.initialWealth,
      peak: params.initialWealth,
      maxDD: 0,
      failed: 0,
    };
    let blockBase = 0;
    if (history) history[i * snapCount] = params.initialWealth; // snapshot 0

    for (let t = 0; t < steps; t++) {
      if (state.failed !== 0) break; // absorbing failure (kernel gate 2)

      // per-(path, step) u32 seed (rng.tsl.ts stepSeed)
      const seedU = stepSeedU(i, t, seed);

      // effective μ/σ + equity allocation mix with optional glidepath
      // (kernel section 4; AMENDMENT A3 bond-sleeve blend — mix defaults
      // to A=1 pure equity, exactly the pre-A3 behavior)
      let mix = 1;
      let muEff = params.mu;
      let sigmaEff = params.sigma;
      if (params.glidepath) {
        mix = glidepathMix(t, retireStep, params.glidepath.start, params.glidepath.end);
        muEff = params.mu * mix + (1 - mix) * BOND_MU_REAL;
        sigmaEff = params.sigma * mix;
      }

      // monthly gross multiplier (kernel section 6, same If-chain order):
      //   A/C: exp(§2.2 log-return)   B: 1 + simple block return (A3:
      //   month-aligned equity/bond mix of the SAME block under glidepath)
      let gross: number;
      if (modelId === MODEL_GBM) {
        gross = Math.exp(gbmMonthlyReturn(muEff, sigmaEff, streamNormal(seedU, 0)));
      } else if (modelId === MODEL_BOOTSTRAP) {
        if (t % BLOCK_LENGTH === 0) {
          blockBase = drawBlockIndex(seedU, blockCount) * BLOCK_LENGTH;
        }
        const idx = blockBase + (t % BLOCK_LENGTH);
        gross = params.glidepath
          ? mix * (blocks as Float32Array)[idx] + (1 - mix) * (bondBlocks as Float32Array)[idx] + 1
          : 1 + (blocks as Float32Array)[idx];
      } else if (modelId === MODEL_FATTAIL) {
        gross = Math.exp(gbmMonthlyReturn(muEff, sigmaEff, streamStudentT5(seedU)));
      } else {
        throw new Error(`runCpuSim: unknown model id ${modelId}`);
      }

      // wealth update + retirement bookkeeping (kernel sections 7–8)
      applyMonthlyStep(state, gross, t, retireStep, params.contribution, params.withdrawal);

      // history write (kernel section 9): regular snapshot at stride
      // boundaries; a mid-period failure writes the failure slot. state is
      // post-clamp here, so a failure on a snapshot step records 0.
      if (history) {
        const done = t + 1;
        if (done % snapStride === 0) {
          const s = done / snapStride;
          if (s < snapCount) history[i * snapCount + s] = state.wealth;
        } else if (state.failed !== 0) {
          const s = Math.floor(t / snapStride) + 1;
          if (s < snapCount) history[i * snapCount + s] = state.wealth;
        }
      }
    }

    terminalWealth[i] = state.wealth;
    maxDrawdown[i] = state.maxDD;
    failureStep[i] = state.failed === 0 ? -1 : state.failed - 1;
    if (state.failed !== 0) {
      failedCount++;
      failureYears.push((state.failed - 1) / 12);
    }
  }

  // ---- SimStats from the SAME simulated paths (R2) ----
  const wealthSorted = Float64Array.from(terminalWealth).sort();
  const ddSorted = Float64Array.from(maxDrawdown).sort();
  failureYears.sort((a, b) => a - b);

  const successRate = 1 - failedCount / n;
  const stats: SimStats = {
    successRate,
    percentiles: {
      p5: quantile(wealthSorted, 0.05),
      p25: quantile(wealthSorted, 0.25),
      p50: quantile(wealthSorted, 0.5),
      p75: quantile(wealthSorted, 0.75),
      p95: quantile(wealthSorted, 0.95),
    },
    // AMENDMENT A3: conditional mean of the worst (deepest) decile of
    // per-path max drawdown — see worstDecileTailMean.
    worstDecileMaxDD: worstDecileTailMean(ddSorted),
    // 0 = "not computed": safe withdrawal rate is a binary SEARCH over
    // repeated sims (spec §2.5), owned by Agent 3, not by the core sim.
    safeWithdrawalRate: 0,
    medianFailureYear: failureYears.length === 0 ? null : quantile(failureYears, 0.5),
    computedAt: (options.now ?? Date.now)(),
  };

  // AMENDMENT A3: magnitude-of-failure metrics from the same failure steps.
  const magnitude = magnitudeOfFailure(
    failureStep,
    steps,
    params.withdrawal,
    (options.now ?? Date.now)(),
  );

  return {
    stats,
    terminalWealth,
    maxDrawdown,
    failureStep,
    ...(history ? { history } : null),
    magnitude,
    elapsedMs: (options.now ?? Date.now)() - t0,
  };
}
