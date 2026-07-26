import type { CpuSimResult } from '../fallback/cpuSim';
import { SHIPPED_REGIME_CALIBRATION } from '../regime/artifact';
import type { FrontierModelKey, RegimeOutcome } from './types';

/** Ordered, sequential frontier candidates. This does not alter SimParams. */
export const FRONTIER_MODEL_ORDER = [
  'gbm',
  'bootstrap',
  'fattail',
  'regime',
] as const satisfies readonly FrontierModelKey[];

/** Convert the regime lens's full simulation result to a frontier outcome. */
export function toRegimeOutcome(
  result: Pick<CpuSimResult, 'stats' | 'magnitude'>,
): RegimeOutcome {
  const {
    safeWithdrawalRate: _safeWithdrawalRate,
    computedAt: _statsComputedAt,
    ...stats
  } = result.stats;
  const { computedAt: _magnitudeComputedAt, ...magnitude } = result.magnitude;
  void _safeWithdrawalRate;
  void _statsComputedAt;
  void _magnitudeComputedAt;

  return {
    model: 'regime',
    stats,
    magnitude,
    initialization: 'latest-filtered',
    calibrationAsOf: SHIPPED_REGIME_CALIBRATION.data.end,
  };
}
