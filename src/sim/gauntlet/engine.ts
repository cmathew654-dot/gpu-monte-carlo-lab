/**
 * engine.ts — the Historical Gauntlet: deterministic replay of a retirement
 * plan against the six worst actual cohorts in US market history, plus the
 * literature's "safemax" per-cohort max sustainable withdrawal rate.
 * Pure TS, no DOM/three/store imports — Node-testable.
 *
 * Conventions mirror the Monte Carlo engine EXACTLY:
 *   - per-month update is `applyMonthlyStep` from ../model/withdrawal.ts
 *     (growth multiplier first, then month-end contribution/withdrawal;
 *     failure = wealth < 0 after the debit, clamped to 0, absorbing,
 *     failure recorded at step+1 — we report it as the 0-indexed
 *     `failureMonth`, matching cpuSim's `failureStep`).
 *   - `retireYear` is honored: pre-retirement months add `contribution`,
 *     post-retirement months subtract `withdrawal` (mirrors cpuSim's
 *     retireStep = retireYear × 12).
 *   - returns are SIMPLE monthly real total returns applied as (1 + r),
 *     same as Model B bootstrap in cpuSim.
 *
 * Data: historicalReturns.json ships 1,195 overlapping 12-month blocks
 * (block i covers months [i, i+11]) of equity and 10y-Treasury REAL total
 * returns, 1926-01 → 2026-06 (1,206 months). `recoverMonthlySeries`
 * reconstructs the raw series; the source data is verified to be perfectly
 * overlap-consistent (see gauntlet.test.mjs), so the recovery convention is
 * unambiguous: month k = blocks[k*12] for k < blockCount, tail months from
 * the last block's offsets 1..11.
 *
 * History is NEVER wrapped or fabricated: when a cohort's available data
 * runs out before `horizonYears`, the replay stops at the last real month
 * and reports `exhaustedData: true` with `monthsSimulated` < horizon.
 */

import historicalReturnsJson from '../../data/historicalReturns.json';
import { applyMonthlyStep, type MonthlyStepState } from '../model/withdrawal';
import { BLOCK_LENGTH } from '../model/returnModels';
import { GAUNTLET_COHORTS, type GauntletCohort } from './cohorts';

// ---------------------------------------------------------------------------
// Series recovery
// ---------------------------------------------------------------------------

/**
 * Reconstruct the raw monthly series from overlapping 12-month blocks.
 * Block i covers months [i, i+11], so month k = blocks[k*12] for
 * k in 0..blockCount−1 and the final 11 months come from the last block's
 * offsets 1..11. Total length = blockCount + 11.
 *
 * This is the earliest-starting-block convention; the shipped float32 data
 * is verified perfectly overlap-consistent in gauntlet.test.mjs, so any
 * covering block would give identical values.
 */
export function recoverMonthlySeries(blocks: ArrayLike<number>): Float64Array {
  if (blocks.length % BLOCK_LENGTH !== 0 || blocks.length === 0) {
    throw new Error(
      `recoverMonthlySeries: blocks length must be a positive multiple of ${BLOCK_LENGTH}, got ${blocks.length}`,
    );
  }
  const blockCount = blocks.length / BLOCK_LENGTH;
  const monthCount = blockCount + BLOCK_LENGTH - 1;
  const out = new Float64Array(monthCount);
  for (let k = 0; k < blockCount; k++) out[k] = blocks[k * BLOCK_LENGTH];
  for (let j = 1; j < BLOCK_LENGTH; j++) {
    out[blockCount - 1 + j] = blocks[(blockCount - 1) * BLOCK_LENGTH + j];
  }
  return out;
}

/** Recovered equity + bond monthly series with calendar metadata. */
export interface HistoricalSeries {
  /** Equity (S&P Composite) REAL simple monthly total returns. */
  equity: Float64Array;
  /** 10-year Treasury REAL simple monthly total returns (month-aligned). */
  bonds: Float64Array;
  monthCount: number;
  startDate: string;
  endDate: string;
}

let cachedSeries: HistoricalSeries | null = null;

/** Load + recover the shipped historical series (cached; deterministic). */
export function loadHistoricalSeries(): HistoricalSeries {
  if (cachedSeries) return cachedSeries;
  const json = historicalReturnsJson as unknown as {
    _meta: { startDate: string; endDate: string };
    blocks: number[];
    bondBlocks: number[];
  };
  const equity = recoverMonthlySeries(json.blocks);
  const bonds = recoverMonthlySeries(json.bondBlocks);
  if (bonds.length !== equity.length) {
    throw new Error('historical series: equity and bond month counts differ');
  }
  cachedSeries = {
    equity,
    bonds,
    monthCount: equity.length,
    startDate: json._meta.startDate,
    endDate: json._meta.endDate,
  };
  return cachedSeries;
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

/**
 * Plan parameters for the gauntlet. Structurally compatible with the
 * cash-flow fields of the frozen SimParams — pass `store.params` directly;
 * this module never imports the store.
 */
export interface GauntletParams {
  initialWealth: number; // real $
  contribution: number; // real $/mo, accumulation
  withdrawal: number; // real $/mo, retirement
  retireYear: number; // 0..horizonYears
  horizonYears: number;
}

/**
 * Equity allocation at a given 0-indexed month of the replay (1.0 = all
 * equity, 0.0 = all bonds). The non-equity fraction earns the 10y Treasury
 * real total return; the portfolio rebalances monthly:
 *   gross = a·(1+rEquity) + (1−a)·(1+rBond)
 * Wave-2 wiring passes glidepathMix-based schedules here. Default: 1.0.
 */
export type AllocationSchedule = (step: number) => number;

export const ALL_EQUITY: AllocationSchedule = () => 1;

/** Internal: one deterministic replay over a series window. */
export interface ReplayResult {
  /** True iff wealth went negative after a retirement debit. */
  failed: boolean;
  /** 0-indexed replay month of failure (mirrors cpuSim failureStep), else null. */
  failureMonth: number | null;
  /** failureMonth / 12, else null. */
  failureYear: number | null;
  /** Wealth after the last simulated month (0 when failed, post-clamp). */
  endingWealth: number;
  /** Minimum month-end wealth observed (post-clamp, all months). */
  minWealth: number;
  /** Months actually simulated (≤ requested steps). */
  monthsSimulated: number;
  /** True when the series ran out before the requested horizon. */
  exhaustedData: boolean;
}

/**
 * Replay `params` month-by-month over `series` starting at `startMonth`,
 * using the EXACT cpuSim/withdrawal.ts per-step conventions. Stops early on
 * failure (absorbing) or when history is exhausted — never wraps.
 */
export function replayCohort(
  params: GauntletParams,
  series: Pick<HistoricalSeries, 'equity' | 'bonds' | 'monthCount'>,
  startMonth: number,
  allocationAt: AllocationSchedule = ALL_EQUITY,
  withdrawalOverride?: number,
): ReplayResult {
  const steps = Math.round(params.horizonYears * 12);
  const retireStep = Math.round(params.retireYear * 12);
  const withdrawal = withdrawalOverride ?? params.withdrawal;

  const state: MonthlyStepState = {
    wealth: params.initialWealth,
    peak: params.initialWealth,
    maxDD: 0,
    failed: 0,
  };
  let minWealth = params.initialWealth;
  let monthsSimulated = 0;

  for (let t = 0; t < steps; t++) {
    const m = startMonth + t;
    if (m >= series.monthCount) break; // history exhausted — honest stop

    const a = allocationAt(t);
    const gross =
      a * (1 + series.equity[m]) + (1 - a) * (1 + series.bonds[m]);

    applyMonthlyStep(state, gross, t, retireStep, params.contribution, withdrawal);
    if (state.wealth < minWealth) minWealth = state.wealth;
    monthsSimulated = t + 1;
    if (state.failed !== 0) break; // absorbing failure (cpuSim gate)
  }

  const failed = state.failed !== 0;
  const failureMonth = failed ? state.failed - 1 : null;
  return {
    failed,
    failureMonth,
    failureYear: failureMonth === null ? null : failureMonth / 12,
    endingWealth: state.wealth,
    minWealth,
    monthsSimulated,
    exhaustedData: !failed && monthsSimulated < steps,
  };
}

// ---------------------------------------------------------------------------
// maxSWR (the literature's "safemax")
// ---------------------------------------------------------------------------

export interface MaxSWRResult {
  /** Largest surviving ANNUAL withdrawal rate as a fraction of initial
   * wealth (e.g. 0.039 = 3.9%/yr), ±0.05%/yr. */
  annualRate: number;
  /** The level real monthly withdrawal at annualRate. */
  monthlyWithdrawal: number;
  /** Months of history actually used (min of requested horizon, available). */
  monthsUsed: number;
  /** True when monthsUsed < requested horizon (data-limited). */
  dataLimited: boolean;
  /** True when even the 50%/yr bracket ceiling survived (rate is a floor). */
  capped: boolean;
}

/** Binary-search precision on the annualized rate: 0.05%/yr (finer than
 * the 0.1%/yr the literature quotes). */
export const MAX_SWR_PRECISION = 0.0005;
/** Bracket ceiling: 50%/yr of initial wealth. */
export const MAX_SWR_BRACKET_HI = 0.5;

/**
 * The largest LEVEL REAL monthly withdrawal (constant fraction of
 * `initialWealth` per year, debited monthly at month-end) that survives
 * `horizonYears` of the cohort's history without failure, starting
 * retirement immediately (retireStep = 0, no contributions). This is
 * Pfau/Bengen's "safemax" cohort metric — the number that made 1966 famous.
 */
export function computeMaxSWR(
  series: Pick<HistoricalSeries, 'equity' | 'bonds' | 'monthCount'>,
  startMonth: number,
  initialWealth: number,
  horizonYears: number,
  allocationAt: AllocationSchedule = ALL_EQUITY,
): MaxSWRResult {
  const availableMonths = series.monthCount - startMonth;
  const monthsUsed = Math.min(Math.round(horizonYears * 12), availableMonths);
  if (monthsUsed <= 0 || initialWealth <= 0) {
    return {
      annualRate: 0,
      monthlyWithdrawal: 0,
      monthsUsed: Math.max(monthsUsed, 0),
      dataLimited: monthsUsed < Math.round(horizonYears * 12),
      capped: false,
    };
  }

  const base: GauntletParams = {
    initialWealth,
    contribution: 0,
    withdrawal: 0, // overridden per probe
    retireYear: 0,
    horizonYears: monthsUsed / 12,
  };
  const survives = (annualRate: number): boolean =>
    !replayCohort(
      base,
      series,
      startMonth,
      allocationAt,
      (annualRate * initialWealth) / 12,
    ).failed;

  if (survives(MAX_SWR_BRACKET_HI)) {
    return {
      annualRate: MAX_SWR_BRACKET_HI,
      monthlyWithdrawal: (MAX_SWR_BRACKET_HI * initialWealth) / 12,
      monthsUsed,
      dataLimited: monthsUsed < Math.round(horizonYears * 12),
      capped: true,
    };
  }

  let lo = 0;
  let hi = MAX_SWR_BRACKET_HI;
  while (hi - lo > MAX_SWR_PRECISION) {
    const mid = (lo + hi) / 2;
    if (survives(mid)) lo = mid;
    else hi = mid;
  }
  return {
    annualRate: lo,
    monthlyWithdrawal: (lo * initialWealth) / 12,
    monthsUsed,
    dataLimited: monthsUsed < Math.round(horizonYears * 12),
    capped: false,
  };
}

// ---------------------------------------------------------------------------
// runGauntlet
// ---------------------------------------------------------------------------

export interface GauntletOptions {
  /** Equity allocation schedule (default: ALL_EQUITY). */
  allocationAt?: AllocationSchedule;
  /** Horizon for the per-cohort maxSWR search, years (default 30). When a
   * cohort has less history, the search uses what's available and flags
   * `dataLimited`. */
  swrHorizonYears?: number;
}

export interface CohortGauntletResult extends ReplayResult {
  cohortId: string;
  cohort: GauntletCohort;
  /** Years of history available from this cohort's start through 2026-06. */
  availableYears: number;
  maxSWR: MaxSWRResult;
}

export interface GauntletResult {
  params: GauntletParams;
  seriesStartDate: string;
  seriesEndDate: string;
  seriesMonths: number;
  cohorts: CohortGauntletResult[];
}

/**
 * Replay the plan against all six worst cohorts and compute each cohort's
 * maxSWR. Fully deterministic: same params ⇒ identical results.
 */
export function runGauntlet(
  params: GauntletParams,
  options: GauntletOptions = {},
): GauntletResult {
  const series = loadHistoricalSeries();
  const allocationAt = options.allocationAt ?? ALL_EQUITY;
  const swrHorizonYears = options.swrHorizonYears ?? 30;

  const cohorts = GAUNTLET_COHORTS.map((cohort) => {
    const replay = replayCohort(params, series, cohort.startMonth, allocationAt);
    const maxSWR = computeMaxSWR(
      series,
      cohort.startMonth,
      params.initialWealth,
      swrHorizonYears,
      allocationAt,
    );
    return {
      cohortId: cohort.id,
      cohort,
      availableYears: (series.monthCount - cohort.startMonth) / 12,
      ...replay,
      maxSWR,
    };
  });

  return {
    params,
    seriesStartDate: series.startDate,
    seriesEndDate: series.endDate,
    seriesMonths: series.monthCount,
    cohorts,
  };
}
