import type { RegimeCalibrationArtifact } from './types.ts';

const MINIMUM_OCCUPANCY = 0.10;
const MINIMUM_VOLATILITY_RATIO = 1.5;
const MINIMUM_TRANSITION_PROBABILITY = 0.0001;
const MAXIMUM_TRANSITION_PROBABILITY = 0.9999;
const MINIMUM_PERSISTENCE = 0.5;
const SAME_SOLUTION_PER_OBSERVATION_TOLERANCE = 1e-4;

function assertCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Regime acceptance failed: ${message}`);
}

/**
 * Enforces the unchanged calibration gates for the parsimonious two-state
 * bivariate Student-t(5) scale HMM.
 */
export function assertRegimeAcceptance(
  artifact: RegimeCalibrationArtifact,
  orderedStartLogLikelihoods: readonly number[],
): void {
  assertCondition(
    artifact.fit.converged,
    'winning fit must have converged',
  );

  for (const [index, state] of artifact.states.entries()) {
    const determinant =
      state.covariance[0] * state.covariance[3]
      - state.covariance[1] * state.covariance[2];
    assertCondition(
      Number.isFinite(determinant) && determinant > 0,
      `state ${index} covariance determinant must be finite and positive`,
    );
    assertCondition(
      Number.isFinite(state.cholesky[0])
        && Number.isFinite(state.cholesky[2])
        && state.cholesky[0] > 0
        && state.cholesky[2] > 0,
      `state ${index} Cholesky diagonal must be finite and positive`,
    );
  }

  assertCondition(
    artifact.filteredOccupancy.every(
      (occupancy) =>
        Number.isFinite(occupancy) && occupancy >= MINIMUM_OCCUPANCY,
    ),
    'each filtered occupancy must be at least 0.10',
  );
  assertCondition(
    Number.isFinite(artifact.states[0].equityVolMonthly)
      && Number.isFinite(artifact.states[1].equityVolMonthly)
      && artifact.states[1].equityVolMonthly
        >= MINIMUM_VOLATILITY_RATIO * artifact.states[0].equityVolMonthly,
    'stress/calm equity volatility separation must be at least 1.5',
  );

  assertCondition(
    artifact.transition.every(
      (probability) =>
        Number.isFinite(probability)
        && probability >= MINIMUM_TRANSITION_PROBABILITY
        && probability <= MAXIMUM_TRANSITION_PROBABILITY,
    ),
    'every transition probability must lie in [0.0001, 0.9999]',
  );
  assertCondition(
    Math.abs(artifact.transition[0] + artifact.transition[1] - 1) <= 1e-12
      && Math.abs(artifact.transition[2] + artifact.transition[3] - 1) <= 1e-12,
    'transition matrix must be row-stochastic',
  );
  assertCondition(
    artifact.transition[0] >= MINIMUM_PERSISTENCE
      && artifact.transition[0] <= MAXIMUM_TRANSITION_PROBABILITY
      && artifact.transition[3] >= MINIMUM_PERSISTENCE
      && artifact.transition[3] <= MAXIMUM_TRANSITION_PROBABILITY,
    'calm and stress diagonal persistence must lie in [0.5, 0.9999]',
  );
  assertCondition(
    artifact.transition[1] > 0
      && artifact.transition[1] <= 0.5
      && artifact.transition[2] > 0
      && artifact.transition[2] <= 0.5,
    'off-diagonal transition complements must lie in (0, 0.5]',
  );

  assertCondition(
    orderedStartLogLikelihoods.length === 4
      && orderedStartLogLikelihoods.every(Number.isFinite),
    'four deterministic starts must produce finite ordered log likelihoods',
  );
  assertCondition(
    Number.isInteger(artifact.data.observations)
      && artifact.data.observations > 0,
    'artifact observation count must be a positive integer',
  );
  const agreeingStarts = orderedStartLogLikelihoods.filter(
    (logLikelihood) =>
      Math.abs(logLikelihood - artifact.fit.logLikelihood)
        / artifact.data.observations
      <= SAME_SOLUTION_PER_OBSERVATION_TOLERANCE,
  ).length;
  assertCondition(
    agreeingStarts >= 2 && artifact.fit.convergedOrderedStarts >= 2,
    'at least two converged starts must agree with the same solution',
  );

  assertCondition(
    Number.isFinite(artifact.rollingOrigin.twoStateMeanLogScore)
      && Number.isFinite(artifact.rollingOrigin.oneStateMeanLogScore),
    'rolling-origin mean log scores must be finite',
  );
  assertCondition(
    artifact.rollingOrigin.twoStateMeanLogScore
      >= artifact.rollingOrigin.oneStateMeanLogScore,
    'two-state rolling-origin score must not be below one-state',
  );
}
