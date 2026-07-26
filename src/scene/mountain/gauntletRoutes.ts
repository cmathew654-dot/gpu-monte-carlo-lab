/**
 * Fixed W2-B route assignment. Cohort zero starts on the +Z central face;
 * subsequent cohorts target golden-angle azimuths. The nearest distinct
 * baked Rainier route is selected once when terrain data lands.
 */
import { ROUTE_POINTS } from './routes';

const GOLDEN_ANGLE = 2.399963229728653;

export interface GauntletRouteSource {
  count: number;
  points: Float32Array;
}

function angularDistance(a: number, b: number): number {
  const raw = Math.abs(a - b) % (Math.PI * 2);
  return raw > Math.PI ? Math.PI * 2 - raw : raw;
}

export function selectGauntletRoutes(
  routes: GauntletRouteSource,
  cohortCount: number,
): Uint32Array {
  if (routes.count <= 0 || cohortCount <= 0) return new Uint32Array();
  if (routes.count < cohortCount) {
    throw new Error(
      'selectGauntletRoutes: route count must cover every cohort',
    );
  }

  const selected = new Uint32Array(cohortCount);
  const used = new Set<number>();
  for (let cohort = 0; cohort < cohortCount; cohort++) {
    const target = cohort * GOLDEN_ANGLE;
    let bestRoute = -1;
    let bestDistance = Infinity;
    for (let route = 0; route < routes.count; route++) {
      if (used.has(route)) continue;
      const offset = route * ROUTE_POINTS * 3;
      const x = routes.points[offset];
      const z = routes.points[offset + 2];
      const angle = Math.atan2(x, z); // +Z is the central route at angle 0
      const distance = angularDistance(angle, target);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestRoute = route;
      }
    }
    if (bestRoute < 0) {
      throw new Error('selectGauntletRoutes: no distinct route available');
    }
    selected[cohort] = bestRoute;
    used.add(bestRoute);
  }
  return selected;
}
