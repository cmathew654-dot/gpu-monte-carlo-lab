/**
 * Separate CPU runner for the frontier-only Regime-t lens (Amendment A6).
 *
 * This file deliberately does not call or modify the frozen `runCpuSim`.
 * Financial bookkeeping, history writes, and summary conventions mirror it
 * in the same operation order; only the monthly return draw is additive.
 */
import type { MagnitudeStats, SimParams, SimStats } from '../../store/simStore';
import { glidepathMix } from '../model/returnModels';
import { snapCountForSteps, snapStrideForSteps } from '../model/history';
import { applyMonthlyStep, type MonthlyStepState } from '../model/withdrawal';
import type { RegimeCalibrationArtifact } from '../regime/types';
import { drawRegimeMonth } from '../regime/math';
import {
  magnitudeOfFailure,
  quantile,
  worstDecileTailMean,
  type CpuSimResult,
} from './cpuSim';

export interface RunCpuRegimeSimOptions {
  /** Clock override for deterministic computedAt/elapsed values in tests. */
  now?: () => number;
  /** Record run-sized decimated history using the frozen CPU convention. */
  includeHistory?: boolean;
}

export function runCpuRegimeSim(
  baseParams: SimParams,
  calibration: RegimeCalibrationArtifact,
  options: RunCpuRegimeSimOptions = {},
): CpuSimResult {
  const now = options.now ?? Date.now;
  const t0 = now();
  const n = baseParams.pathCount;
  const steps = Math.round(baseParams.horizonYears * 12);
  const retireStep = Math.round(baseParams.retireYear * 12);
  const seed = baseParams.seed >>> 0;

  const terminalWealth = new Float32Array(n);
  const maxDrawdown = new Float32Array(n);
  const failureStep = new Int32Array(n);
  const snapStride = snapStrideForSteps(steps);
  const snapCount = snapCountForSteps(steps, snapStride);
  const history = options.includeHistory
    ? new Float32Array(n * snapCount)
    : undefined;

  let failedCount = 0;
  const failureYears: number[] = [];

  for (let path = 0; path < n; path++) {
    const state: MonthlyStepState = {
      wealth: baseParams.initialWealth,
      peak: baseParams.initialWealth,
      maxDD: 0,
      failed: 0,
    };
    let regimeState: 0 | 1 | null = null;
    if (history) history[path * snapCount] = baseParams.initialWealth;

    for (let step = 0; step < steps; step++) {
      if (state.failed !== 0) break;

      const draw = drawRegimeMonth(
        path,
        step,
        seed,
        regimeState,
        calibration,
      );
      regimeState = draw.state;

      const allocation = baseParams.glidepath
        ? glidepathMix(
            step,
            retireStep,
            baseParams.glidepath.start,
            baseParams.glidepath.end,
          )
        : 1;
      const gross =
        allocation * Math.exp(draw.equityLogReturn)
        + (1 - allocation) * Math.exp(draw.bondLogReturn);

      applyMonthlyStep(
        state,
        gross,
        step,
        retireStep,
        baseParams.contribution,
        baseParams.withdrawal,
      );

      if (history) {
        const done = step + 1;
        if (done % snapStride === 0) {
          const snap = done / snapStride;
          if (snap < snapCount) {
            history[path * snapCount + snap] = state.wealth;
          }
        } else if (state.failed !== 0) {
          const snap = Math.floor(step / snapStride) + 1;
          if (snap < snapCount) {
            history[path * snapCount + snap] = state.wealth;
          }
        }
      }
    }

    terminalWealth[path] = state.wealth;
    maxDrawdown[path] = state.maxDD;
    failureStep[path] = state.failed === 0 ? -1 : state.failed - 1;
    if (state.failed !== 0) {
      failedCount++;
      failureYears.push((state.failed - 1) / 12);
    }
  }

  const wealthSorted = Float64Array.from(terminalWealth).sort();
  const ddSorted = Float64Array.from(maxDrawdown).sort();
  failureYears.sort((left, right) => left - right);

  const statsComputedAt = now();
  const stats: SimStats = {
    successRate: 1 - failedCount / n,
    percentiles: {
      p5: quantile(wealthSorted, 0.05),
      p25: quantile(wealthSorted, 0.25),
      p50: quantile(wealthSorted, 0.5),
      p75: quantile(wealthSorted, 0.75),
      p95: quantile(wealthSorted, 0.95),
    },
    worstDecileMaxDD: worstDecileTailMean(ddSorted),
    safeWithdrawalRate: 0,
    medianFailureYear:
      failureYears.length === 0 ? null : quantile(failureYears, 0.5),
    computedAt: statsComputedAt,
  };

  const magnitudeComputedAt = now();
  const magnitude: MagnitudeStats = magnitudeOfFailure(
    failureStep,
    steps,
    baseParams.withdrawal,
    magnitudeComputedAt,
  );

  return {
    stats,
    terminalWealth,
    maxDrawdown,
    failureStep,
    ...(history ? { history } : null),
    magnitude,
    elapsedMs: now() - t0,
  };
}
