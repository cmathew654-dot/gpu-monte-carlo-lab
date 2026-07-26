export type Vec2 = readonly [number, number];
export type Mat2 = readonly [number, number, number, number];
export type StatePair<T> = readonly [T, T];

export interface PairedLogReturnSeries {
  dates: readonly string[];
  values: readonly Vec2[];
  inputSha256: string;
}

export interface RegimeCalibrationArtifact {
  schemaVersion: 1;
  model: 'two-state-bivariate-student-t';
  degreesOfFreedom: 5;
  stateOrder: readonly ['calm', 'stress'];
  data: {
    start: string;
    end: string;
    observations: number;
    inputSha256: string;
  };
  states: StatePair<{
    mean: Vec2;
    covariance: Mat2;
    cholesky: readonly [number, number, number];
    equityVolMonthly: number;
  }>;
  transition: Mat2;
  stationary: Vec2;
  latestFiltered: Vec2;
  filteredOccupancy: Vec2;
  expectedDurationMonths: Vec2;
  fit: {
    logLikelihood: number;
    iterations: number;
    converged: boolean;
    convergedOrderedStarts: number;
  };
  rollingOrigin: {
    firstOrigin: 600;
    refitEveryMonths: 12;
    observationsScored: number;
    twoStateMeanLogScore: number;
    oneStateMeanLogScore: number;
  };
}
