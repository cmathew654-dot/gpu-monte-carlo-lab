import type { MagnitudeStats, SimParams, SimStats } from '../../store/simStore';
import type { ComputedStats } from '../stats/computeStats';

export type ShippedModelKey = SimParams['model'];

export interface ModelOutcome {
  model: ShippedModelKey;
  stats: Omit<SimStats, 'safeWithdrawalRate' | 'computedAt'>;
  magnitude: Omit<MagnitudeStats, 'computedAt'>;
}

export interface ModelComparison {
  models: readonly ModelOutcome[];
  pathCount: SimParams['pathCount'];
  seed: number;
  computedAt: number;
}

export type FrontierModelKey = ShippedModelKey | 'regime';

export interface RegimeOutcome {
  model: 'regime';
  stats: Omit<SimStats, 'safeWithdrawalRate' | 'computedAt'>;
  magnitude: Omit<MagnitudeStats, 'computedAt'>;
  initialization: 'latest-filtered';
  calibrationAsOf: string;
}

export type FrontierOutcome = ModelOutcome | RegimeOutcome;

export interface SpendingCurvePoint {
  monthlySpending: number;
  successRate: number;
}

export type CapacityStatus =
  | 'converged'
  | 'unbounded-high'
  | 'infeasible-at-zero'
  | 'budget-exhausted';

export interface SpendingCapacity90 {
  monthlySpending: number | null;
  successRate: number | null;
  target: 0.9;
  tolerance: 0.005;
  evaluations: number;
  status: CapacityStatus;
}

export interface FrontierModelResult {
  model: FrontierModelKey;
  outcome: FrontierOutcome;
  curve: readonly SpendingCurvePoint[];
  capacity90: SpendingCapacity90;
}

export interface RobustnessFrontier {
  basis: {
    params: SimParams;
    analysisPathCount: SimParams['pathCount'];
    engine: 'gpu' | 'cpu';
    seed: number;
  };
  models: readonly FrontierModelResult[];
  robustSpend: number | null;
  robustStatus: CapacityStatus;
  computedAt: number;
}

export function modelOutcome(
  model: ShippedModelKey,
  computed: ComputedStats,
): ModelOutcome {
  const {
    safeWithdrawalRate: _safeWithdrawalRate,
    computedAt: _statsComputedAt,
    ...stats
  } = computed.stats;
  const { computedAt: _magnitudeComputedAt, ...magnitude } = computed.magnitude;
  void _safeWithdrawalRate;
  void _statsComputedAt;
  void _magnitudeComputedAt;
  return { model, stats, magnitude };
}

const A5_MODELS = ['gbm', 'bootstrap', 'fattail'] as const;

export function orderedModelComparison(
  outcomes: ReadonlyMap<ShippedModelKey, ModelOutcome>,
  basis: Pick<SimParams, 'pathCount' | 'seed'>,
): Omit<ModelComparison, 'computedAt'> {
  const models = A5_MODELS.map((model) => outcomes.get(model));
  if (models.some((outcome) => outcome === undefined)) {
    throw new Error('orderedModelComparison: complete model set required');
  }
  return {
    models: models as readonly ModelOutcome[],
    pathCount: basis.pathCount,
    seed: basis.seed >>> 0,
  };
}
