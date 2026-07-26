import rawCalibration from '../../data/regimeCalibration.json';
import type {
  Mat2,
  RegimeCalibrationArtifact,
  StatePair,
  Vec2,
} from './types';

const EXPECTED_INPUT_SHA256 =
  '22cce814073cdf5fba6288afbdf7d4c78d000a7f62110c757905eb3076cc49e4';
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function reject(label: string, detail: string): never {
  throw new Error(`Invalid regime calibration ${label}: ${detail}`);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    reject(label, 'expected an object');
  }
  return value as Record<string, unknown>;
}

function asFiniteTuple(
  value: unknown,
  length: number,
  label: string,
): readonly number[] {
  if (!Array.isArray(value) || value.length !== length) {
    reject(label, `expected ${length} entries`);
  }
  for (const entry of value) {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) {
      reject(label, 'entries must be finite numbers');
    }
  }
  return value as readonly number[];
}

function requireFinite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    reject(label, 'expected a finite number');
  }
  return value;
}

function requireInteger(value: unknown, label: string): number {
  const number = requireFinite(value, label);
  if (!Number.isInteger(number)) reject(label, 'expected an integer');
  return number;
}

function closeEnough(first: number, second: number, tolerance = 1e-10): boolean {
  return (
    Math.abs(first - second)
    <= tolerance * Math.max(Math.abs(first), Math.abs(second), 1e-12)
  );
}

function validateProbabilityPair(value: unknown, label: string): Vec2 {
  const pair = asFiniteTuple(value, 2, label) as Vec2;
  if (pair.some((entry) => entry < 0 || entry > 1)) {
    reject(label, 'probabilities must lie in [0,1]');
  }
  if (!closeEnough(pair[0] + pair[1], 1, 1e-8)) {
    reject(label, 'probabilities must sum to one');
  }
  return pair;
}

function validateState(
  value: unknown,
  index: number,
): RegimeCalibrationArtifact['states'][number] {
  const label = `states[${index}]`;
  const state = asRecord(value, label);
  const mean = asFiniteTuple(state.mean, 2, `${label}.mean`) as Vec2;
  const covariance = asFiniteTuple(
    state.covariance,
    4,
    `${label}.covariance`,
  ) as Mat2;
  const cholesky = asFiniteTuple(
    state.cholesky,
    3,
    `${label}.cholesky`,
  ) as readonly [number, number, number];
  const equityVolMonthly = requireFinite(
    state.equityVolMonthly,
    `${label}.equityVolMonthly`,
  );

  if (cholesky[0] <= 0 || cholesky[2] <= 0) {
    reject(`${label}.cholesky`, 'diagonal entries must be positive');
  }
  const reconstructed: Mat2 = [
    cholesky[0] * cholesky[0],
    cholesky[0] * cholesky[1],
    cholesky[0] * cholesky[1],
    cholesky[1] * cholesky[1] + cholesky[2] * cholesky[2],
  ];
  if (
    covariance.some(
      (entry, entryIndex) =>
        !closeEnough(entry, reconstructed[entryIndex], 1e-6),
    )
  ) {
    reject(`${label}.covariance`, 'does not reconstruct from its Cholesky factor');
  }
  if (!closeEnough(equityVolMonthly, Math.sqrt(covariance[0]), 1e-8)) {
    reject(`${label}.equityVolMonthly`, 'does not match covariance[0]');
  }

  return {
    mean,
    covariance,
    cholesky,
    equityVolMonthly,
  };
}

export function validateRegimeCalibrationArtifact(
  value: unknown,
): RegimeCalibrationArtifact {
  const artifact = asRecord(value, 'root');
  if (artifact.schemaVersion !== 1) reject('schemaVersion', 'expected 1');
  if (artifact.model !== 'two-state-bivariate-student-t') {
    reject('model', 'unexpected model identifier');
  }
  if (artifact.degreesOfFreedom !== 5) {
    reject('degreesOfFreedom', 'expected Student-t(5)');
  }
  if (
    !Array.isArray(artifact.stateOrder)
    || artifact.stateOrder.length !== 2
    || artifact.stateOrder[0] !== 'calm'
    || artifact.stateOrder[1] !== 'stress'
  ) {
    reject('stateOrder', 'expected [calm, stress]');
  }

  const data = asRecord(artifact.data, 'data');
  if (
    typeof data.start !== 'string'
    || typeof data.end !== 'string'
    || !MONTH_PATTERN.test(data.start)
    || !MONTH_PATTERN.test(data.end)
    || data.start > data.end
  ) {
    reject('data dates', 'expected an ordered YYYY-MM window');
  }
  if (requireInteger(data.observations, 'data.observations') <= 0) {
    reject('data.observations', 'must be positive');
  }
  if (data.inputSha256 !== EXPECTED_INPUT_SHA256) {
    reject('data SHA-256', 'does not match the committed historical series');
  }

  if (!Array.isArray(artifact.states) || artifact.states.length !== 2) {
    reject('states', 'expected calm and stress entries');
  }
  const states: StatePair<RegimeCalibrationArtifact['states'][number]> = [
    validateState(artifact.states[0], 0),
    validateState(artifact.states[1], 1),
  ];
  if (
    !closeEnough(states[0].mean[0], states[1].mean[0], 1e-12)
    || !closeEnough(states[0].mean[1], states[1].mean[1], 1e-12)
  ) {
    reject('shared mean', 'scale HMM states must use one common mean');
  }
  const covarianceScale = states[1].covariance[0] / states[0].covariance[0];
  if (
    !Number.isFinite(covarianceScale)
    || covarianceScale <= 1
    || states[0].covariance.some(
      (entry, index) =>
        !closeEnough(states[1].covariance[index], entry * covarianceScale, 1e-10),
    )
  ) {
    reject(
      'shared covariance shape',
      'stress covariance must be a larger scalar multiple of calm covariance',
    );
  }

  const transition = asFiniteTuple(
    artifact.transition,
    4,
    'transition',
  ) as Mat2;
  if (transition.some((entry) => entry < 0 || entry > 1)) {
    reject('transition', 'probabilities must lie in [0,1]');
  }
  if (
    !closeEnough(transition[0] + transition[1], 1, 1e-8)
    || !closeEnough(transition[2] + transition[3], 1, 1e-8)
  ) {
    reject('transition row', 'each row must sum to one');
  }

  validateProbabilityPair(artifact.stationary, 'stationary');
  validateProbabilityPair(artifact.latestFiltered, 'latestFiltered');
  validateProbabilityPair(artifact.filteredOccupancy, 'filteredOccupancy');
  const durations = asFiniteTuple(
    artifact.expectedDurationMonths,
    2,
    'expectedDurationMonths',
  );
  if (durations.some((duration) => duration <= 0)) {
    reject('expectedDurationMonths', 'entries must be positive');
  }

  const fit = asRecord(artifact.fit, 'fit');
  requireFinite(fit.logLikelihood, 'fit.logLikelihood');
  if (requireInteger(fit.iterations, 'fit.iterations') <= 0) {
    reject('fit.iterations', 'must be positive');
  }
  if (fit.converged !== true) reject('fit.converged', 'expected true');
  if (requireInteger(fit.convergedOrderedStarts, 'fit.convergedOrderedStarts') < 2) {
    reject('fit.convergedOrderedStarts', 'expected at least two agreeing starts');
  }

  const rolling = asRecord(artifact.rollingOrigin, 'rollingOrigin');
  if (rolling.firstOrigin !== 600 || rolling.refitEveryMonths !== 12) {
    reject('rollingOrigin', 'unexpected scoring schedule');
  }
  if (requireInteger(rolling.observationsScored, 'rollingOrigin.observationsScored') <= 0) {
    reject('rollingOrigin.observationsScored', 'must be positive');
  }
  requireFinite(rolling.twoStateMeanLogScore, 'rollingOrigin.twoStateMeanLogScore');
  requireFinite(rolling.oneStateMeanLogScore, 'rollingOrigin.oneStateMeanLogScore');

  return value as RegimeCalibrationArtifact;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

const validatedCalibration = validateRegimeCalibrationArtifact(
  structuredClone(rawCalibration),
);

export const SHIPPED_REGIME_CALIBRATION = deepFreeze(validatedCalibration);

const f32Calibration: RegimeCalibrationArtifact = {
  ...validatedCalibration,
  states: validatedCalibration.states.map((state) => ({
    ...state,
    mean: state.mean.map(Math.fround) as unknown as Vec2,
    cholesky: state.cholesky.map(Math.fround) as unknown as readonly [
      number,
      number,
      number,
    ],
  })) as unknown as RegimeCalibrationArtifact['states'],
  transition: validatedCalibration.transition.map(Math.fround) as unknown as Mat2,
  latestFiltered: validatedCalibration.latestFiltered.map(
    Math.fround,
  ) as unknown as Vec2,
};

export const REGIME_CALIBRATION_F32 = deepFreeze(f32Calibration);
