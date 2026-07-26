import type {
  Mat2,
  PairedLogReturnSeries,
  RegimeCalibrationArtifact,
  Vec2,
} from './types.ts';

const DEGREES_OF_FREEDOM = 5;
const DIMENSIONS = 2;
const T_SCALE_FROM_COVARIANCE = (DEGREES_OF_FREEDOM - 2) / DEGREES_OF_FREEDOM;
const COVARIANCE_FROM_T_SCALE = 1 / T_SCALE_FROM_COVARIANCE;
const LOG_T_NORMALIZER =
  Math.log(2.5) - Math.log(DEGREES_OF_FREEDOM * Math.PI);
const FIRST_ROLLING_ORIGIN = 600;
const ROLLING_REFIT_MONTHS = 12;

export interface HmmFitOptions {
  maxIterations: 250;
  perObservationTolerance: 1e-7;
  /** One-state rolling comparator only; the scale HMM fixes one common mean. */
  meanShrinkageObservations: 12;
  covarianceEigenFloor: 1e-8;
  transitionPseudoCount: 1;
}

/**
 * Deterministic fit of the parsimonious two-state bivariate Student-t(5)
 * scale HMM: one full-sample mean and covariance shape, two latent scales.
 */
export interface HmmFit {
  states: RegimeCalibrationArtifact['states'];
  transition: Mat2;
  stationary: Vec2;
  latestFiltered: Vec2;
  filteredOccupancy: Vec2;
  expectedDurationMonths: Vec2;
  fit: RegimeCalibrationArtifact['fit'];
  filtered: readonly Vec2[];
  orderedStartLogLikelihoods: readonly number[];
}

export interface RegimeCalibrationBuild {
  artifact: RegimeCalibrationArtifact;
  orderedStartLogLikelihoods: readonly number[];
}

type MutableVec2 = [number, number];
type MutableMat2 = [number, number, number, number];
type MutableStatePair<T> = [T, T];

interface ResolvedHmmFitOptions {
  maxIterations: number;
  perObservationTolerance: number;
  meanShrinkageObservations: number;
  covarianceEigenFloor: number;
  transitionPseudoCount: number;
}

interface HmmParameters {
  means: MutableStatePair<MutableVec2>;
  covariances: MutableStatePair<MutableMat2>;
  transition: MutableMat2;
}

interface InferenceResult {
  logLikelihood: number;
  filtered: MutableVec2[];
  gamma: MutableVec2[];
  xiTotals: MutableMat2;
  mixtureWeights: MutableVec2[];
}

interface FitRun {
  parameters: HmmParameters;
  inference: InferenceResult;
  iterations: number;
  converged: boolean;
}

interface OneStateFit {
  mean: MutableVec2;
  covariance: MutableMat2;
}

const DEFAULT_OPTIONS: ResolvedHmmFitOptions = {
  maxIterations: 250,
  perObservationTolerance: 1e-7,
  meanShrinkageObservations: 12,
  covarianceEigenFloor: 1e-8,
  transitionPseudoCount: 1,
};

function resolveOptions(options?: Partial<HmmFitOptions>): ResolvedHmmFitOptions {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  if (!Number.isInteger(resolved.maxIterations) || resolved.maxIterations <= 0) {
    throw new Error('HMM maxIterations must be a positive integer');
  }
  for (const [name, value] of Object.entries(resolved)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`HMM option ${name} must be finite and non-negative`);
    }
  }
  if (
    resolved.perObservationTolerance === 0
    || resolved.covarianceEigenFloor === 0
  ) {
    throw new Error('HMM tolerances and covariance floor must be positive');
  }
  return resolved;
}

function validateValues(values: readonly Vec2[]): void {
  if (values.length < 8) {
    throw new Error('HMM fitting requires at least eight paired observations');
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (
      !Array.isArray(value)
      || value.length !== DIMENSIONS
      || !Number.isFinite(value[0])
      || !Number.isFinite(value[1])
    ) {
      throw new Error(`HMM observation ${index} must be a finite pair`);
    }
  }
}

function sampleMean(
  values: readonly Vec2[],
  indices?: readonly number[],
): MutableVec2 {
  const selected = indices ?? values.map((_value, index) => index);
  let sum0 = 0;
  let sum1 = 0;
  for (const index of selected) {
    sum0 += values[index][0];
    sum1 += values[index][1];
  }
  return [sum0 / selected.length, sum1 / selected.length];
}

function floorCovariance(
  covariance: readonly number[],
  eigenFloor: number,
): MutableMat2 {
  let a = covariance[0];
  const b = 0.5 * (covariance[1] + covariance[2]);
  let c = covariance[3];
  const radius = Math.hypot(a - c, 2 * b);
  const smallerEigenvalue = 0.5 * (a + c - radius);
  if (smallerEigenvalue < eigenFloor) {
    const lift = eigenFloor - smallerEigenvalue;
    a += lift;
    c += lift;
  }
  return [a, b, b, c];
}

function sampleCovariance(
  values: readonly Vec2[],
  mean: Vec2,
  eigenFloor: number,
  indices?: readonly number[],
): MutableMat2 {
  const selected = indices ?? values.map((_value, index) => index);
  let sum00 = 0;
  let sum01 = 0;
  let sum11 = 0;
  for (const index of selected) {
    const delta0 = values[index][0] - mean[0];
    const delta1 = values[index][1] - mean[1];
    sum00 += delta0 * delta0;
    sum01 += delta0 * delta1;
    sum11 += delta1 * delta1;
  }
  const denominator = Math.max(selected.length, 1);
  return floorCovariance(
    [
      sum00 / denominator,
      sum01 / denominator,
      sum01 / denominator,
      sum11 / denominator,
    ],
    eigenFloor,
  );
}

function momentsForIndices(
  values: readonly Vec2[],
  indices: readonly number[],
  fallbackMean: Vec2,
  fallbackCovariance: Mat2,
  eigenFloor: number,
): { mean: MutableVec2; covariance: MutableMat2 } {
  if (indices.length < 3) {
    return {
      mean: [fallbackMean[0], fallbackMean[1]],
      covariance: [...fallbackCovariance],
    };
  }
  const mean = sampleMean(values, indices);
  return {
    mean,
    covariance: sampleCovariance(values, mean, eigenFloor, indices),
  };
}

function quantile(sorted: readonly number[], probability: number): number {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  const upperValue = sorted[Math.min(lower + 1, sorted.length - 1)];
  return sorted[lower] + fraction * (upperValue - sorted[lower]);
}

function scaleCovariance(covariance: Mat2, factor: number): MutableMat2 {
  return [
    covariance[0] * factor,
    covariance[1] * factor,
    covariance[2] * factor,
    covariance[3] * factor,
  ];
}

function minimumEigenvalue(covariance: Mat2): number {
  const radius = Math.hypot(
    covariance[0] - covariance[3],
    2 * covariance[1],
  );
  return 0.5 * (covariance[0] + covariance[3] - radius);
}

function covarianceScaleMultiplier(shape: Mat2, covariance: Mat2): number {
  const determinant = shape[0] * shape[3] - shape[1] * shape[2];
  if (!(determinant > 0) || !Number.isFinite(determinant)) {
    throw new Error('HMM shared covariance shape must be positive definite');
  }
  const inverse: MutableMat2 = [
    shape[3] / determinant,
    -shape[1] / determinant,
    -shape[2] / determinant,
    shape[0] / determinant,
  ];
  return 0.5 * (
    inverse[0] * covariance[0]
    + inverse[1] * covariance[2]
    + inverse[2] * covariance[1]
    + inverse[3] * covariance[3]
  );
}

function projectCovarianceToShape(
  shape: Mat2,
  covariance: Mat2,
  eigenFloor: number,
): MutableMat2 {
  const minimumScale = eigenFloor / minimumEigenvalue(shape);
  const scale = Math.max(
    covarianceScaleMultiplier(shape, covariance),
    minimumScale,
  );
  return scaleCovariance(shape, scale);
}

function swapStateOrder(parameters: HmmParameters): HmmParameters {
  const transition = parameters.transition;
  return {
    means: [parameters.means[1], parameters.means[0]],
    covariances: [parameters.covariances[1], parameters.covariances[0]],
    transition: [
      transition[3],
      transition[2],
      transition[1],
      transition[0],
    ],
  };
}

function orderParameters(parameters: HmmParameters): HmmParameters {
  return parameters.covariances[0][0] <= parameters.covariances[1][0]
    ? parameters
    : swapStateOrder(parameters);
}

function makeStarts(
  values: readonly Vec2[],
  options: ResolvedHmmFitOptions,
): HmmParameters[] {
  const fullMean = sampleMean(values);
  const fullCovariance = sampleCovariance(
    values,
    fullMean,
    options.covarianceEigenFloor,
  );
  const sortedEquity = values.map((value) => value[0]).sort((a, b) => a - b);
  const medianAbsoluteDeviation = values
    .map((value) => Math.abs(value[0] - fullMean[0]))
    .sort((a, b) => a - b);
  const deviationCutoff = quantile(medianAbsoluteDeviation, 0.5);
  const lowerQuartile = quantile(sortedEquity, 0.25);
  const upperQuartile = quantile(sortedEquity, 0.75);

  const lowDeviation: number[] = [];
  const highDeviation: number[] = [];
  const bottomQuartile: number[] = [];
  const topQuartile: number[] = [];
  const firstHalf: number[] = [];
  const lastHalf: number[] = [];
  const midpoint = Math.floor(values.length / 2);

  for (let index = 0; index < values.length; index += 1) {
    const equity = values[index][0];
    (Math.abs(equity - fullMean[0]) <= deviationCutoff
      ? lowDeviation
      : highDeviation).push(index);
    if (equity <= lowerQuartile) bottomQuartile.push(index);
    if (equity >= upperQuartile) topQuartile.push(index);
    (index < midpoint ? firstHalf : lastHalf).push(index);
  }

  const deviationMoments = [
    momentsForIndices(
      values,
      lowDeviation,
      fullMean,
      fullCovariance,
      options.covarianceEigenFloor,
    ),
    momentsForIndices(
      values,
      highDeviation,
      fullMean,
      fullCovariance,
      options.covarianceEigenFloor,
    ),
  ] as const;
  const quartileMoments = [
    momentsForIndices(
      values,
      topQuartile,
      fullMean,
      fullCovariance,
      options.covarianceEigenFloor,
    ),
    momentsForIndices(
      values,
      bottomQuartile,
      fullMean,
      fullCovariance,
      options.covarianceEigenFloor,
    ),
  ] as const;
  const halfMoments = [
    momentsForIndices(
      values,
      firstHalf,
      fullMean,
      fullCovariance,
      options.covarianceEigenFloor,
    ),
    momentsForIndices(
      values,
      lastHalf,
      fullMean,
      fullCovariance,
      options.covarianceEigenFloor,
    ),
  ] as const;
  const stateMoments = [
    deviationMoments,
    quartileMoments,
    halfMoments,
    [
      {
        mean: [fullMean[0], fullMean[1]] as MutableVec2,
        covariance: scaleCovariance(fullCovariance, 0.5),
      },
      {
        mean: [fullMean[0], fullMean[1]] as MutableVec2,
        covariance: scaleCovariance(fullCovariance, 2),
      },
    ] as const,
  ] as const;
  const perturbations = [
    [0, 0],
    [0.01, -0.01],
    [-0.02, 0.02],
    [0.02, -0.02],
  ] as const;

  return stateMoments.map((moments, index) => {
    const p00 = 0.95 + perturbations[index][0];
    const p11 = 0.90 + perturbations[index][1];
    return orderParameters({
      means: [
        [fullMean[0], fullMean[1]],
        [fullMean[0], fullMean[1]],
      ],
      covariances: [
        projectCovarianceToShape(
          fullCovariance, moments[0].covariance, options.covarianceEigenFloor,
        ),
        projectCovarianceToShape(
          fullCovariance, moments[1].covariance, options.covarianceEigenFloor,
        ),
      ],
      transition: [p00, 1 - p00, 1 - p11, p11],
    });
  });
}

function stationaryDistribution(transition: Mat2): MutableVec2 {
  const denominator = transition[1] + transition[2];
  if (!(denominator > 0)) return [0.5, 0.5];
  return [transition[2] / denominator, transition[1] / denominator];
}

function densityTerms(
  covariance: Mat2,
): { inverse: MutableMat2; logDeterminant: number } {
  const a = covariance[0] * T_SCALE_FROM_COVARIANCE;
  const b = covariance[1] * T_SCALE_FROM_COVARIANCE;
  const c = covariance[3] * T_SCALE_FROM_COVARIANCE;
  const determinant = a * c - b * b;
  if (!(determinant > 0) || !Number.isFinite(determinant)) {
    throw new Error('HMM covariance scale must be positive definite');
  }
  return {
    inverse: [c / determinant, -b / determinant, -b / determinant, a / determinant],
    logDeterminant: Math.log(determinant),
  };
}

function mahalanobis(value: Vec2, mean: Vec2, inverse: Mat2): number {
  const delta0 = value[0] - mean[0];
  const delta1 = value[1] - mean[1];
  return Math.max(
    0,
    delta0 * (inverse[0] * delta0 + inverse[1] * delta1)
      + delta1 * (inverse[2] * delta0 + inverse[3] * delta1),
  );
}

function studentLogDensity(
  value: Vec2,
  mean: Vec2,
  terms: { inverse: Mat2; logDeterminant: number },
): { logDensity: number; mixtureWeight: number } {
  const distance = mahalanobis(value, mean, terms.inverse);
  return {
    logDensity:
      LOG_T_NORMALIZER
      - 0.5 * terms.logDeterminant
      - 3.5 * Math.log1p(distance / DEGREES_OF_FREEDOM),
    mixtureWeight:
      (DEGREES_OF_FREEDOM + DIMENSIONS)
      / (DEGREES_OF_FREEDOM + distance),
  };
}

function infer(
  values: readonly Vec2[],
  parameters: HmmParameters,
): InferenceResult {
  const count = values.length;
  const terms = [
    densityTerms(parameters.covariances[0]),
    densityTerms(parameters.covariances[1]),
  ] as const;
  const emissions = new Float64Array(count * 2);
  const mixtureWeights: MutableVec2[] = new Array(count);

  for (let index = 0; index < count; index += 1) {
    const calm = studentLogDensity(values[index], parameters.means[0], terms[0]);
    const stress = studentLogDensity(values[index], parameters.means[1], terms[1]);
    const largestLogDensity = Math.max(calm.logDensity, stress.logDensity);
    const commonScale = Math.exp(largestLogDensity);
    emissions[index * 2] =
      Math.exp(calm.logDensity - largestLogDensity) * commonScale;
    emissions[index * 2 + 1] =
      Math.exp(stress.logDensity - largestLogDensity) * commonScale;
    mixtureWeights[index] = [calm.mixtureWeight, stress.mixtureWeight];
  }

  const alpha: MutableVec2[] = new Array(count);
  const initial = stationaryDistribution(parameters.transition);
  let calmForward = initial[0] * emissions[0];
  let stressForward = initial[1] * emissions[1];
  let scale = calmForward + stressForward;
  if (!(scale > 0) || !Number.isFinite(scale)) {
    throw new Error('HMM forward scale is not finite and positive');
  }
  alpha[0] = [calmForward / scale, stressForward / scale];
  let logLikelihood = Math.log(scale);

  for (let index = 1; index < count; index += 1) {
    const previous = alpha[index - 1];
    calmForward =
      (previous[0] * parameters.transition[0]
        + previous[1] * parameters.transition[2])
      * emissions[index * 2];
    stressForward =
      (previous[0] * parameters.transition[1]
        + previous[1] * parameters.transition[3])
      * emissions[index * 2 + 1];
    scale = calmForward + stressForward;
    if (!(scale > 0) || !Number.isFinite(scale)) {
      throw new Error(`HMM forward scale ${index} is not finite and positive`);
    }
    alpha[index] = [calmForward / scale, stressForward / scale];
    logLikelihood += Math.log(scale);
  }

  const beta: MutableVec2[] = new Array(count);
  beta[count - 1] = [0.5, 0.5];
  for (let index = count - 2; index >= 0; index -= 1) {
    const next = beta[index + 1];
    const emission0 = emissions[(index + 1) * 2];
    const emission1 = emissions[(index + 1) * 2 + 1];
    const calmBackward =
      parameters.transition[0] * emission0 * next[0]
      + parameters.transition[1] * emission1 * next[1];
    const stressBackward =
      parameters.transition[2] * emission0 * next[0]
      + parameters.transition[3] * emission1 * next[1];
    const backwardScale = calmBackward + stressBackward;
    beta[index] = backwardScale > 0
      ? [calmBackward / backwardScale, stressBackward / backwardScale]
      : [0.5, 0.5];
  }

  const gamma: MutableVec2[] = new Array(count);
  const xiTotals: MutableMat2 = [0, 0, 0, 0];
  for (let index = 0; index < count; index += 1) {
    const unscaled0 = alpha[index][0] * beta[index][0];
    const unscaled1 = alpha[index][1] * beta[index][1];
    const gammaScale = unscaled0 + unscaled1;
    gamma[index] = [unscaled0 / gammaScale, unscaled1 / gammaScale];

    if (index + 1 < count) {
      const next = beta[index + 1];
      const emission0 = emissions[(index + 1) * 2];
      const emission1 = emissions[(index + 1) * 2 + 1];
      const xi00 =
        alpha[index][0] * parameters.transition[0] * emission0 * next[0];
      const xi01 =
        alpha[index][0] * parameters.transition[1] * emission1 * next[1];
      const xi10 =
        alpha[index][1] * parameters.transition[2] * emission0 * next[0];
      const xi11 =
        alpha[index][1] * parameters.transition[3] * emission1 * next[1];
      const xiScale = xi00 + xi01 + xi10 + xi11;
      xiTotals[0] += xi00 / xiScale;
      xiTotals[1] += xi01 / xiScale;
      xiTotals[2] += xi10 / xiScale;
      xiTotals[3] += xi11 / xiScale;
    }
  }

  return {
    logLikelihood,
    filtered: alpha,
    gamma,
    xiTotals,
    mixtureWeights,
  };
}

function maximize(
  values: readonly Vec2[],
  inference: InferenceResult,
  fullMean: Vec2,
  commonShape: Mat2,
  options: ResolvedHmmFitOptions,
): HmmParameters {
  const means: MutableStatePair<MutableVec2> = [
    [fullMean[0], fullMean[1]],
    [fullMean[0], fullMean[1]],
  ];
  const covariances: MutableStatePair<MutableMat2> = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  for (let state = 0; state < 2; state += 1) {
    let occupancy = 0;
    let scale00 = 0;
    let scale01 = 0;
    let scale11 = 0;
    for (let index = 0; index < values.length; index += 1) {
      const gamma = inference.gamma[index][state];
      const weight = gamma * inference.mixtureWeights[index][state];
      const delta0 = values[index][0] - fullMean[0];
      const delta1 = values[index][1] - fullMean[1];
      occupancy += gamma;
      scale00 += weight * delta0 * delta0;
      scale01 += weight * delta0 * delta1;
      scale11 += weight * delta1 * delta1;
    }
    const actualCovarianceFactor =
      COVARIANCE_FROM_T_SCALE / Math.max(occupancy, Number.EPSILON);
    covariances[state] = floorCovariance(
      [
        scale00 * actualCovarianceFactor,
        scale01 * actualCovarianceFactor,
        scale01 * actualCovarianceFactor,
        scale11 * actualCovarianceFactor,
      ],
      options.covarianceEigenFloor,
    );
    covariances[state] = projectCovarianceToShape(
      commonShape,
      covariances[state],
      options.covarianceEigenFloor,
    );
  }

  const pseudoCount = options.transitionPseudoCount;
  const p00 =
    (inference.xiTotals[0] + pseudoCount)
    / (inference.xiTotals[0] + inference.xiTotals[1] + 2 * pseudoCount);
  const p11 =
    (inference.xiTotals[3] + pseudoCount)
    / (inference.xiTotals[2] + inference.xiTotals[3] + 2 * pseudoCount);
  return orderParameters({
    means,
    covariances,
    transition: [p00, 1 - p00, 1 - p11, p11],
  });
}

function fitStart(
  values: readonly Vec2[],
  start: HmmParameters,
  fullMean: Vec2,
  commonShape: Mat2,
  options: ResolvedHmmFitOptions,
): FitRun {
  let parameters = start;
  let previousLogLikelihood = Number.NEGATIVE_INFINITY;
  let inference = infer(values, parameters);

  for (let iteration = 1; iteration <= options.maxIterations; iteration += 1) {
    inference = infer(values, parameters);
    if (
      Number.isFinite(previousLogLikelihood)
      && Math.abs(inference.logLikelihood - previousLogLikelihood) / values.length
        < options.perObservationTolerance
    ) {
      return { parameters, inference, iterations: iteration, converged: true };
    }
    if (iteration === options.maxIterations) {
      return { parameters, inference, iterations: iteration, converged: false };
    }
    previousLogLikelihood = inference.logLikelihood;
    parameters = maximize(values, inference, fullMean, commonShape, options);
  }

  return {
    parameters,
    inference,
    iterations: options.maxIterations,
    converged: false,
  };
}

function cholesky(covariance: Mat2): readonly [number, number, number] {
  const l00 = Math.sqrt(covariance[0]);
  const l10 = covariance[1] / l00;
  const l11 = Math.sqrt(Math.max(covariance[3] - l10 * l10, 0));
  return [l00, l10, l11];
}

function artifactStates(parameters: HmmParameters): RegimeCalibrationArtifact['states'] {
  return parameters.covariances.map((covariance, index) => ({
    mean: parameters.means[index] as Vec2,
    covariance: covariance as Mat2,
    cholesky: cholesky(covariance),
    equityVolMonthly: Math.sqrt(covariance[0]),
  })) as unknown as RegimeCalibrationArtifact['states'];
}

/**
 * Fits the deterministic parsimonious two-state bivariate Student-t(5)
 * scale HMM with a common full-sample mean and covariance shape.
 */
export function fitRegimeHmm(
  values: readonly Vec2[],
  options?: Partial<HmmFitOptions>,
): HmmFit {
  validateValues(values);
  const resolved = resolveOptions(options);
  const fullMean = sampleMean(values);
  const commonShape = sampleCovariance(
    values,
    fullMean,
    resolved.covarianceEigenFloor,
  );
  const runs = makeStarts(values, resolved).map((start) =>
    fitStart(values, start, fullMean, commonShape, resolved));
  const convergedRuns = runs.filter((run) => run.converged);
  const candidates = convergedRuns.length > 0 ? convergedRuns : runs;
  const winner = candidates.reduce((best, run) =>
    run.inference.logLikelihood > best.inference.logLikelihood ? run : best);
  const orderedStartLogLikelihoods = runs.map(
    (run) => run.inference.logLikelihood,
  );
  const agreementTolerance =
    resolved.perObservationTolerance * 1_000 * values.length;
  const convergedOrderedStarts = runs.filter(
    (run) =>
      run.converged
      && winner.inference.logLikelihood - run.inference.logLikelihood
        <= agreementTolerance,
  ).length;
  const stationary = stationaryDistribution(winner.parameters.transition);
  const filteredOccupancy: MutableVec2 = [0, 0];
  for (const probability of winner.inference.filtered) {
    filteredOccupancy[0] += probability[0] / values.length;
    filteredOccupancy[1] += probability[1] / values.length;
  }
  const latestFiltered =
    winner.inference.filtered[winner.inference.filtered.length - 1];

  return {
    states: artifactStates(winner.parameters),
    transition: winner.parameters.transition,
    stationary,
    latestFiltered,
    filteredOccupancy,
    expectedDurationMonths: [
      1 / winner.parameters.transition[1],
      1 / winner.parameters.transition[2],
    ],
    fit: {
      logLikelihood: winner.inference.logLikelihood,
      iterations: winner.iterations,
      converged: winner.converged,
      convergedOrderedStarts,
    },
    filtered: winner.inference.filtered,
    orderedStartLogLikelihoods,
  };
}

function fitOneState(
  values: readonly Vec2[],
  options: ResolvedHmmFitOptions,
): OneStateFit {
  const shrinkageTarget = sampleMean(values);
  let mean: MutableVec2 = [...shrinkageTarget];
  let covariance = sampleCovariance(
    values,
    mean,
    options.covarianceEigenFloor,
  );
  let previousLogLikelihood = Number.NEGATIVE_INFINITY;

  for (let iteration = 0; iteration < options.maxIterations; iteration += 1) {
    const terms = densityTerms(covariance);
    const weights = new Float64Array(values.length);
    let logLikelihood = 0;
    let weightSum = 0;
    let mean0 =
      options.meanShrinkageObservations * shrinkageTarget[0];
    let mean1 =
      options.meanShrinkageObservations * shrinkageTarget[1];
    for (let index = 0; index < values.length; index += 1) {
      const density = studentLogDensity(values[index], mean, terms);
      weights[index] = density.mixtureWeight;
      logLikelihood += density.logDensity;
      weightSum += density.mixtureWeight;
      mean0 += density.mixtureWeight * values[index][0];
      mean1 += density.mixtureWeight * values[index][1];
    }
    if (
      Number.isFinite(previousLogLikelihood)
      && Math.abs(logLikelihood - previousLogLikelihood) / values.length
        < options.perObservationTolerance
    ) {
      break;
    }
    previousLogLikelihood = logLikelihood;
    const denominator = weightSum + options.meanShrinkageObservations;
    mean = [mean0 / denominator, mean1 / denominator];

    let scale00 = 0;
    let scale01 = 0;
    let scale11 = 0;
    for (let index = 0; index < values.length; index += 1) {
      const delta0 = values[index][0] - mean[0];
      const delta1 = values[index][1] - mean[1];
      scale00 += weights[index] * delta0 * delta0;
      scale01 += weights[index] * delta0 * delta1;
      scale11 += weights[index] * delta1 * delta1;
    }
    const factor = COVARIANCE_FROM_T_SCALE / values.length;
    covariance = floorCovariance(
      [
        scale00 * factor,
        scale01 * factor,
        scale01 * factor,
        scale11 * factor,
      ],
      options.covarianceEigenFloor,
    );
  }

  return { mean, covariance };
}

function logSumExp2(first: number, second: number): number {
  const maximum = Math.max(first, second);
  return maximum + Math.log(Math.exp(first - maximum) + Math.exp(second - maximum));
}

export function rollingOriginScores(
  values: readonly Vec2[],
): RegimeCalibrationArtifact['rollingOrigin'] {
  validateValues(values);
  if (values.length <= FIRST_ROLLING_ORIGIN) {
    throw new Error(
      `rolling-origin scoring requires more than ${FIRST_ROLLING_ORIGIN} observations`,
    );
  }
  const options = resolveOptions();
  let twoStateScore = 0;
  let oneStateScore = 0;
  let observationsScored = 0;

  for (
    let origin = FIRST_ROLLING_ORIGIN;
    origin < values.length;
    origin += ROLLING_REFIT_MONTHS
  ) {
    const training = values.slice(0, origin);
    const twoState = fitRegimeHmm(training);
    const oneState = fitOneState(training, options);
    const oneStateTerms = densityTerms(oneState.covariance);
    const stateTerms = [
      densityTerms(twoState.states[0].covariance),
      densityTerms(twoState.states[1].covariance),
    ] as const;
    let filtered: MutableVec2 = [
      twoState.latestFiltered[0],
      twoState.latestFiltered[1],
    ];
    const end = Math.min(origin + ROLLING_REFIT_MONTHS, values.length);

    for (let index = origin; index < end; index += 1) {
      const predicted: MutableVec2 = [
        filtered[0] * twoState.transition[0]
          + filtered[1] * twoState.transition[2],
        filtered[0] * twoState.transition[1]
          + filtered[1] * twoState.transition[3],
      ];
      const calmLogDensity = studentLogDensity(
        values[index],
        twoState.states[0].mean,
        stateTerms[0],
      ).logDensity;
      const stressLogDensity = studentLogDensity(
        values[index],
        twoState.states[1].mean,
        stateTerms[1],
      ).logDensity;
      const calmJoint = Math.log(predicted[0]) + calmLogDensity;
      const stressJoint = Math.log(predicted[1]) + stressLogDensity;
      const predictiveLogDensity = logSumExp2(calmJoint, stressJoint);
      twoStateScore += predictiveLogDensity;
      filtered = [
        Math.exp(calmJoint - predictiveLogDensity),
        Math.exp(stressJoint - predictiveLogDensity),
      ];
      oneStateScore += studentLogDensity(
        values[index],
        oneState.mean,
        oneStateTerms,
      ).logDensity;
      observationsScored += 1;
    }
  }

  return {
    firstOrigin: FIRST_ROLLING_ORIGIN,
    refitEveryMonths: ROLLING_REFIT_MONTHS,
    observationsScored,
    twoStateMeanLogScore: twoStateScore / observationsScored,
    oneStateMeanLogScore: oneStateScore / observationsScored,
  };
}

export function buildRegimeCalibration(
  series: PairedLogReturnSeries,
): RegimeCalibrationBuild {
  if (
    series.dates.length !== series.values.length
    || series.dates.length === 0
  ) {
    throw new Error('regime calibration dates and values must be non-empty and paired');
  }
  const fitted = fitRegimeHmm(series.values);
  const artifact: RegimeCalibrationArtifact = {
    schemaVersion: 1,
    model: 'two-state-bivariate-student-t',
    degreesOfFreedom: 5,
    stateOrder: ['calm', 'stress'],
    data: {
      start: series.dates[0],
      end: series.dates[series.dates.length - 1],
      observations: series.values.length,
      inputSha256: series.inputSha256,
    },
    states: fitted.states,
    transition: fitted.transition,
    stationary: fitted.stationary,
    latestFiltered: fitted.latestFiltered,
    filteredOccupancy: fitted.filteredOccupancy,
    expectedDurationMonths: fitted.expectedDurationMonths,
    fit: fitted.fit,
    rollingOrigin: rollingOriginScores(series.values),
  };
  return {
    artifact,
    orderedStartLogLikelihoods: fitted.orderedStartLogLikelihoods,
  };
}
