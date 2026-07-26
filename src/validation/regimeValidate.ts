import historicalReturns from '../data/historicalReturns.json';
import { runCpuRegimeSim } from '../sim/fallback/cpuRegimeSim';
import { assertRegimeAcceptance } from '../sim/regime/acceptance';
import {
  REGIME_CALIBRATION_F32,
  SHIPPED_REGIME_CALIBRATION,
} from '../sim/regime/artifact';
import { buildRegimeCalibration } from '../sim/regime/hmm';
import { recoverPairedLogReturns } from '../sim/regime/series';
import type { RegimeCalibrationArtifact, Vec2 } from '../sim/regime/types';
import { DEFAULT_SIM_PARAMS, type SimParams } from '../store/simStore';

const NOW = () => 1_722_000_000_000;
const VALIDATION_PATH_COUNT = 10_000 as const;
const FIXED_PARAMS: SimParams = {
  ...DEFAULT_SIM_PARAMS,
  model: 'bootstrap',
  pathCount: VALIDATION_PATH_COUNT,
  seed: 42,
  glidepath: { start: 0.8, end: 0.6 },
};

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const recovered = recoverPairedLogReturns(historicalReturns);
const rebuilt = buildRegimeCalibration(recovered);
expect(
  JSON.stringify(rebuilt.artifact) ===
    JSON.stringify(SHIPPED_REGIME_CALIBRATION),
  'committed regime artifact differs from the deterministic production rebuild',
);
assertRegimeAcceptance(
  SHIPPED_REGIME_CALIBRATION,
  rebuilt.orderedStartLogLikelihoods,
);

const artifactEvidence = {
  observations: SHIPPED_REGIME_CALIBRATION.data.observations,
  start: SHIPPED_REGIME_CALIBRATION.data.start,
  end: SHIPPED_REGIME_CALIBRATION.data.end,
  inputSha256: SHIPPED_REGIME_CALIBRATION.data.inputSha256,
  logLikelihood: SHIPPED_REGIME_CALIBRATION.fit.logLikelihood,
  iterations: SHIPPED_REGIME_CALIBRATION.fit.iterations,
  converged: SHIPPED_REGIME_CALIBRATION.fit.converged,
  agreeingStarts:
    SHIPPED_REGIME_CALIBRATION.fit.convergedOrderedStarts,
  orderedStartLogLikelihoods: rebuilt.orderedStartLogLikelihoods,
  rollingObservations:
    SHIPPED_REGIME_CALIBRATION.rollingOrigin.observationsScored,
  twoStateMeanLogScore:
    SHIPPED_REGIME_CALIBRATION.rollingOrigin.twoStateMeanLogScore,
  oneStateMeanLogScore:
    SHIPPED_REGIME_CALIBRATION.rollingOrigin.oneStateMeanLogScore,
};
console.table({
  fit: {
    logLikelihood: artifactEvidence.logLikelihood,
    iterations: artifactEvidence.iterations,
    converged: artifactEvidence.converged,
    agreeingStarts: artifactEvidence.agreeingStarts,
  },
  rolling: {
    observations: artifactEvidence.rollingObservations,
    twoState: artifactEvidence.twoStateMeanLogScore,
    oneState: artifactEvidence.oneStateMeanLogScore,
  },
});
console.table({
  calm: {
    equityVolMonthly:
      SHIPPED_REGIME_CALIBRATION.states[0].equityVolMonthly,
    occupancy: SHIPPED_REGIME_CALIBRATION.filteredOccupancy[0],
    persistence: SHIPPED_REGIME_CALIBRATION.transition[0],
    expectedMonths:
      SHIPPED_REGIME_CALIBRATION.expectedDurationMonths[0],
    latestProbability: SHIPPED_REGIME_CALIBRATION.latestFiltered[0],
  },
  stress: {
    equityVolMonthly:
      SHIPPED_REGIME_CALIBRATION.states[1].equityVolMonthly,
    occupancy: SHIPPED_REGIME_CALIBRATION.filteredOccupancy[1],
    persistence: SHIPPED_REGIME_CALIBRATION.transition[3],
    expectedMonths:
      SHIPPED_REGIME_CALIBRATION.expectedDurationMonths[1],
    latestProbability: SHIPPED_REGIME_CALIBRATION.latestFiltered[1],
  },
});

const stationaryCalibration: RegimeCalibrationArtifact = structuredClone(
  REGIME_CALIBRATION_F32,
);
stationaryCalibration.latestFiltered = [
  stationaryCalibration.stationary[0],
  stationaryCalibration.stationary[1],
] as Vec2;
expect(
  stationaryCalibration.latestFiltered[0] ===
      stationaryCalibration.stationary[0] &&
    stationaryCalibration.latestFiltered[1] ===
      stationaryCalibration.stationary[1],
  'stationary sensitivity must replace only latestFiltered initialization',
);
expect(
  REGIME_CALIBRATION_F32.latestFiltered[0] !==
      stationaryCalibration.latestFiltered[0] ||
    REGIME_CALIBRATION_F32.latestFiltered[1] !==
      stationaryCalibration.latestFiltered[1],
  'stationary sensitivity must differ from latest-filtered initialization',
);

function runSensitivity(
  initialization: 'latest-filtered' | 'stationary-validation',
  calibration: RegimeCalibrationArtifact,
) {
  const startedAt = performance.now();
  const result = runCpuRegimeSim(FIXED_PARAMS, calibration, { now: NOW });
  const elapsedCpuMs = performance.now() - startedAt;
  expect(
    result.terminalWealth.length === VALIDATION_PATH_COUNT,
    `${initialization} sensitivity did not use 10,000 paths`,
  );
  return {
    initialization,
    currentSuccess: result.stats.successRate,
    p50: result.stats.percentiles.p50,
    worstDecileDrawdown: result.stats.worstDecileMaxDD,
    medianFailureYear: result.stats.medianFailureYear,
    calibrationAsOf: SHIPPED_REGIME_CALIBRATION.data.end,
    pathCount: VALIDATION_PATH_COUNT,
    seed: FIXED_PARAMS.seed,
    elapsedCpuMs,
  };
}

const latestFiltered = runSensitivity(
  'latest-filtered',
  REGIME_CALIBRATION_F32,
);
const stationary = runSensitivity(
  'stationary-validation',
  stationaryCalibration,
);
const sensitivityTable = [latestFiltered, stationary];
console.table(sensitivityTable);

const stableSensitivity = sensitivityTable.map(
  ({ elapsedCpuMs, ...evidence }) => {
    void elapsedCpuMs;
    return evidence;
  },
);
console.log(
  `REGIME_ACCEPTANCE_STABLE ${JSON.stringify(artifactEvidence)}`,
);
console.log(
  `REGIME_SENSITIVITY_STABLE ${JSON.stringify(stableSensitivity)}`,
);
console.log(
  `REGIME_SENSITIVITY_TIMING ${JSON.stringify({
    latestFilteredElapsedCpuMs: latestFiltered.elapsedCpuMs,
    stationaryElapsedCpuMs: stationary.elapsedCpuMs,
  })}`,
);
console.log(
  'Application initialization remains latest-filtered; stationary is validation-only sensitivity.',
);
