import type { SimParams } from '../store/simStore';
import { RETURN_MODELS } from '../sim/model/triangulation';
import type {
  FrontierModelKey,
  ModelComparison,
  RobustnessFrontier,
  SpendingCapacity90,
} from '../sim/frontier/types';
import { fmtPct, fmtUSD, fmtUSDCompact } from './format';

export const FRONTIER_MODEL_LABELS: Record<FrontierModelKey, string> = {
  gbm: 'GBM',
  bootstrap: 'Historical bootstrap',
  fattail: 'Student-t(5)',
  regime: 'Regime model',
};

export interface ComparisonRange {
  success: { min: number; max: number };
  medianWealth: { min: number; max: number };
  worstDecileMaxDD: { min: number; max: number };
}

function orderedOutcomes(comparison: ModelComparison) {
  return RETURN_MODELS.map((model) => {
    const outcome = comparison.models.find((candidate) => candidate.model === model);
    if (!outcome) {
      throw new Error('comparisonRange requires the ' + model + ' outcome');
    }
    return outcome;
  });
}

function finiteRange(values: readonly number[]): { min: number; max: number } {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error('comparisonRange requires finite measured values');
  }
  const ordered = [...values].sort((left, right) => left - right);
  return { min: ordered[0], max: ordered[ordered.length - 1] };
}

export function comparisonRange(comparison: ModelComparison): ComparisonRange {
  const outcomes = orderedOutcomes(comparison);
  return {
    success: finiteRange(outcomes.map(({ stats }) => stats.successRate)),
    medianWealth: finiteRange(outcomes.map(({ stats }) => stats.percentiles.p50)),
    worstDecileMaxDD: finiteRange(outcomes.map(({ stats }) => stats.worstDecileMaxDD)),
  };
}

function sameParams(a: SimParams, b: SimParams): boolean {
  return (
    a.model === b.model
    && a.pathCount === b.pathCount
    && a.horizonYears === b.horizonYears
    && a.retireYear === b.retireYear
    && a.initialWealth === b.initialWealth
    && a.contribution === b.contribution
    && a.withdrawal === b.withdrawal
    && a.mu === b.mu
    && a.sigma === b.sigma
    && a.seed === b.seed
    && (a.glidepath === null
      ? b.glidepath === null
      : b.glidepath !== null
        && a.glidepath.start === b.glidepath.start
        && a.glidepath.end === b.glidepath.end)
  );
}

export function isFrontierCurrent(
  frontier: RobustnessFrontier | null,
  committed: SimParams,
  mode: 'gpu' | 'cpu',
): frontier is RobustnessFrontier {
  return (
    frontier !== null
    && frontier.basis.engine === mode
    && sameParams(frontier.basis.params, committed)
  );
}

export function advisorComparisonSentence(comparison: ModelComparison): string {
  const range = comparisonRange(comparison);
  const success = range.success.min === range.success.max
    ? 'Success agrees at ' + fmtPct(range.success.min) + '.'
    : 'Success ranges from '
      + fmtPct(range.success.min)
      + ' to '
      + fmtPct(range.success.max)
      + '.';
  return success
    + ' Median ending wealth ranges from '
    + fmtUSDCompact(range.medianWealth.min)
    + ' to '
    + fmtUSDCompact(range.medianWealth.max)
    + '. Worst-decile max drawdown ranges from '
    + fmtPct(range.worstDecileMaxDD.min)
    + ' to '
    + fmtPct(range.worstDecileMaxDD.max)
    + '.';
}

export function clientSaturationSentence(comparison: ModelComparison): string | null {
  const outcomes = orderedOutcomes(comparison);
  if (!outcomes.every(({ stats }) => stats.successRate === 1)) return null;
  return 'All included models reached 100.0% success: the ceiling of this measure, not a guarantee.';
}

export function clientRobustSpendSentence(frontier: RobustnessFrontier): string | null {
  if (!Number.isFinite(frontier.robustSpend) || frontier.robustSpend === null) {
    return null;
  }
  if (
    !frontier.models.every(
      ({ capacity90 }) => capacity90.monthlySpending !== null
        && Number.isFinite(capacity90.monthlySpending),
    )
  ) {
    return null;
  }
  return 'Across all included models, the highest tested real monthly spending at which every included model reached at least 90 in 100 simulated futures is '
    + fmtUSD(frontier.robustSpend)
    + '/mo real.';
}

export function capacityLabel(capacity: SpendingCapacity90): string {
  if (capacity.status === 'unbounded-high') return 'Above tested range';
  if (capacity.status === 'infeasible-at-zero') return 'Below 90% at $0/mo';
  if (
    capacity.monthlySpending === null
    || !Number.isFinite(capacity.monthlySpending)
  ) return 'No measured capacity';
  if (capacity.status === 'budget-exhausted') {
    return 'Best tested: ' + fmtUSD(capacity.monthlySpending) + '/mo real';
  }
  return fmtUSD(capacity.monthlySpending) + '/mo real';
}
