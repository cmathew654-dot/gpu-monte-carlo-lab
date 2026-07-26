import type { SimParams, TriStats } from '../../store/simStore';

export const RETURN_MODELS = ['gbm', 'bootstrap', 'fattail'] as const;

export function secondaryModels(
  primary: SimParams['model'],
): SimParams['model'][] {
  return RETURN_MODELS.filter((model) => model !== primary);
}

export function successRateRange(triStats: TriStats): {
  min: number;
  max: number;
} {
  const values = RETURN_MODELS.map(
    (model) => triStats.successRates[model],
  );
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}
