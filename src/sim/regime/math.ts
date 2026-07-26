/** Deterministic runtime draws for the frontier-only two-state Regime-t lens. */
import { stepSeedU, streamNormal, streamUniform } from '../model/hash';
import type { RegimeCalibrationArtifact } from './types';

export type RegimeState = 0 | 1;

export function nextRegimeState(
  previous: RegimeState | null,
  stateUniform: number,
  calibration: RegimeCalibrationArtifact,
): RegimeState {
  const stressProbability = previous === null
    ? calibration.latestFiltered[1]
    : previous === 0
      ? calibration.transition[1]
      : calibration.transition[3];
  return stateUniform < stressProbability ? 1 : 0;
}

export function drawRegimeMonth(
  path: number,
  month: number,
  seed: number,
  previous: RegimeState | null,
  calibration: RegimeCalibrationArtifact,
): {
  state: RegimeState;
  equityLogReturn: number;
  bondLogReturn: number;
} {
  const seedU = stepSeedU(path, month, seed);
  const state = nextRegimeState(
    previous,
    streamUniform(seedU, 0),
    calibration,
  );

  // Branch-independent fixed stream reservation: 1/2 are the correlated
  // Gaussian coordinates and 3..7 form the five-degree chi-square draw.
  const z0 = streamNormal(seedU, 1);
  const z1 = streamNormal(seedU, 2);
  let chi2 = 0;
  for (let stream = 3; stream <= 7; stream++) {
    const normal = streamNormal(seedU, stream);
    chi2 += normal * normal;
  }
  const radial = Math.sqrt(3 / Math.max(chi2, 1e-12));
  const t0 = z0 * radial;
  const t1 = z1 * radial;
  const stateCalibration = calibration.states[state];

  return {
    state,
    equityLogReturn:
      stateCalibration.mean[0] + stateCalibration.cholesky[0] * t0,
    bondLogReturn:
      stateCalibration.mean[1]
      + stateCalibration.cholesky[1] * t0
      + stateCalibration.cholesky[2] * t1,
  };
}
