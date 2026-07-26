import { runCpuRegimeSim } from '../fallback/cpuRegimeSim.ts';
import { stepSeedU, streamNormal, streamUniform } from '../model/hash.ts';
import { snapCountForSteps } from '../model/history.ts';
import {
  REGIME_CALIBRATION_F32,
  SHIPPED_REGIME_CALIBRATION,
  validateRegimeCalibrationArtifact,
} from './artifact.ts';
import { drawRegimeMonth, nextRegimeState } from './math.ts';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS ${name}`);
    return;
  }
  failed++;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

function checkThrows(name, action, expected) {
  try {
    action();
    check(name, false, 'did not throw');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    check(name, expected.test(detail), detail);
  }
}

function approx(actual, expected, tolerance) {
  return Math.abs(actual - expected) <= tolerance;
}

function relativeApprox(actual, expected, relativeTolerance) {
  return (
    Math.abs(actual - expected) <=
    relativeTolerance * Math.max(Math.abs(expected), Number.EPSILON)
  );
}

const CALIBRATION = {
  schemaVersion: 1,
  model: 'two-state-bivariate-student-t',
  degreesOfFreedom: 5,
  stateOrder: ['calm', 'stress'],
  data: {
    start: '2000-01',
    end: '2009-12',
    observations: 120,
    inputSha256: '0'.repeat(64),
  },
  states: [
    {
      mean: [0.004, 0.001],
      covariance: [0.0004, 0.00006, 0.00006, 0.000109],
      cholesky: [0.02, 0.003, 0.01],
      equityVolMonthly: 0.02,
    },
    {
      mean: [-0.012, 0.002],
      covariance: [0.0049, -0.00056, -0.00056, 0.000689],
      cholesky: [0.07, -0.008, 0.025],
      equityVolMonthly: 0.07,
    },
  ],
  transition: [0.92, 0.08, 0.25, 0.75],
  stationary: [25 / 33, 8 / 33],
  latestFiltered: [0.3, 0.7],
  filteredOccupancy: [0.72, 0.28],
  expectedDurationMonths: [12.5, 4],
  fit: {
    logLikelihood: 500,
    iterations: 20,
    converged: true,
    convergedOrderedStarts: 4,
  },
  rollingOrigin: {
    firstOrigin: 600,
    refitEveryMonths: 12,
    observationsScored: 60,
    twoStateMeanLogScore: 4,
    oneStateMeanLogScore: 3.8,
  },
};

const CALM_ONLY = {
  ...CALIBRATION,
  transition: [1, 0, 1, 0],
  latestFiltered: [1, 0],
};
const STRESS_ONLY = {
  ...CALIBRATION,
  transition: [0, 1, 0, 1],
  latestFiltered: [0, 1],
};

console.log('\n[regime runtime] shipped artifact contract');
{
  check(
    'shipped artifact pins the complete historical window and digest',
    SHIPPED_REGIME_CALIBRATION.data.start === '1926-01'
      && SHIPPED_REGIME_CALIBRATION.data.end === '2026-06'
      && SHIPPED_REGIME_CALIBRATION.data.observations === 1_206
      && SHIPPED_REGIME_CALIBRATION.data.inputSha256
        === '22cce814073cdf5fba6288afbdf7d4c78d000a7f62110c757905eb3076cc49e4',
  );
  check(
    'shipped artifact and nested runtime tuples are deeply frozen',
    Object.isFrozen(SHIPPED_REGIME_CALIBRATION)
      && Object.isFrozen(SHIPPED_REGIME_CALIBRATION.states)
      && Object.isFrozen(SHIPPED_REGIME_CALIBRATION.states[0])
      && Object.isFrozen(SHIPPED_REGIME_CALIBRATION.states[0].mean)
      && Object.isFrozen(REGIME_CALIBRATION_F32.transition),
  );

  const shippedRuntimeScalars = [
    ...SHIPPED_REGIME_CALIBRATION.states.flatMap((state) => [
      ...state.mean,
      ...state.cholesky,
    ]),
    ...SHIPPED_REGIME_CALIBRATION.transition,
    ...SHIPPED_REGIME_CALIBRATION.latestFiltered,
  ];
  const f32RuntimeScalars = [
    ...REGIME_CALIBRATION_F32.states.flatMap((state) => [
      ...state.mean,
      ...state.cholesky,
    ]),
    ...REGIME_CALIBRATION_F32.transition,
    ...REGIME_CALIBRATION_F32.latestFiltered,
  ];
  check(
    'every runtime calibration scalar is explicitly rounded to f32',
    f32RuntimeScalars.every(
      (value, index) => Object.is(value, Math.fround(shippedRuntimeScalars[index])),
    ),
  );

  checkThrows(
    'runtime validation rejects a non-stochastic transition row',
    () => {
      const broken = structuredClone(SHIPPED_REGIME_CALIBRATION);
      broken.transition[1] += 0.01;
      validateRegimeCalibrationArtifact(broken);
    },
    /transition.*row/i,
  );
  checkThrows(
    'runtime validation rejects a covariance inconsistent with its Cholesky factor',
    () => {
      const broken = structuredClone(SHIPPED_REGIME_CALIBRATION);
      broken.states[0].covariance[0] *= 2;
      validateRegimeCalibrationArtifact(broken);
    },
    /covariance.*cholesky/i,
  );
  checkThrows(
    'runtime validation rejects state-specific means in the scale HMM artifact',
    () => {
      const broken = structuredClone(SHIPPED_REGIME_CALIBRATION);
      broken.states[1].mean[0] += 0.001;
      validateRegimeCalibrationArtifact(broken);
    },
    /shared mean/i,
  );
  checkThrows(
    'runtime validation rejects covariances outside the shared scale shape',
    () => {
      const broken = structuredClone(SHIPPED_REGIME_CALIBRATION);
      const [l00, l10, l11] = broken.states[1].cholesky;
      const changedL10 = l10 + 0.001;
      broken.states[1].cholesky[1] = changedL10;
      broken.states[1].covariance = [
        l00 * l00,
        l00 * changedL10,
        l00 * changedL10,
        changedL10 * changedL10 + l11 * l11,
      ];
      validateRegimeCalibrationArtifact(broken);
    },
    /shared covariance shape/i,
  );
  checkThrows(
    'runtime validation rejects malformed calibration provenance',
    () => {
      const broken = structuredClone(SHIPPED_REGIME_CALIBRATION);
      broken.data.inputSha256 = 'not-a-digest';
      validateRegimeCalibrationArtifact(broken);
    },
    /sha-256/i,
  );
}

const PINNED_PATH_ZERO_SEED_42 = [
  {
    state: 0,
    equityLogReturn: -0.004460372442246913,
    bondLogReturn: 0.002406161409209978,
  },
  {
    state: 1,
    equityLogReturn: -0.003021520727015557,
    bondLogReturn: 0.0044870239280780325,
  },
  {
    state: 1,
    equityLogReturn: -0.07102862941310235,
    bondLogReturn: 0.010501646613749437,
  },
  {
    state: 0,
    equityLogReturn: 0.008833346389790898,
    bondLogReturn: 0.017449400161419493,
  },
  {
    state: 0,
    equityLogReturn: 0.007655864030539458,
    bondLogReturn: -0.009989943274246437,
  },
  {
    state: 0,
    equityLogReturn: 0.0006155853392739857,
    bondLogReturn: -0.010187267859876973,
  },
  {
    state: 0,
    equityLogReturn: 0.00669515894648646,
    bondLogReturn: 0.009706484063784365,
  },
  {
    state: 0,
    equityLogReturn: 0.01644026567156782,
    bondLogReturn: 0.003300396780338606,
  },
  {
    state: 0,
    equityLogReturn: 0.017609488168335373,
    bondLogReturn: -0.0036137923264162003,
  },
  {
    state: 0,
    equityLogReturn: -0.019475035879977617,
    bondLogReturn: -0.007582716737772445,
  },
  {
    state: 0,
    equityLogReturn: -0.013010171630448323,
    bondLogReturn: 0.005807657461706575,
  },
  {
    state: 0,
    equityLogReturn: -0.0007233955718068952,
    bondLogReturn: -0.008379201623138554,
  },
];

function shadowDraw(path, month, seed, previous, calibration) {
  const seedU = stepSeedU(path, month, seed);
  const stateUniform = streamUniform(seedU, 0);
  const stressProbability =
    previous === null
      ? calibration.latestFiltered[1]
      : previous === 0
        ? calibration.transition[1]
        : calibration.transition[3];
  const state = stateUniform < stressProbability ? 1 : 0;
  const z0 = streamNormal(seedU, 1);
  const z1 = streamNormal(seedU, 2);
  let chiSquareFive = 0;
  for (let stream = 3; stream <= 7; stream++) {
    const coordinate = streamNormal(seedU, stream);
    chiSquareFive += coordinate * coordinate;
  }
  const radial = Math.sqrt(3 / Math.max(chiSquareFive, 1e-12));
  const t0 = z0 * radial;
  const t1 = z1 * radial;
  const stateCalibration = calibration.states[state];
  return {
    state,
    equityLogReturn:
      stateCalibration.mean[0] + stateCalibration.cholesky[0] * t0,
    bondLogReturn:
      stateCalibration.mean[1] +
      stateCalibration.cholesky[1] * t0 +
      stateCalibration.cholesky[2] * t1,
  };
}

function sampleConditionalMoments(state, sampleCount) {
  const calibration = state === 0 ? CALM_ONLY : STRESS_ONLY;
  let meanEquity = 0;
  let meanBond = 0;
  let equitySquareSum = 0;
  let bondSquareSum = 0;
  let crossSum = 0;
  let allStatesMatch = true;

  for (let path = 0; path < sampleCount; path++) {
    const draw = drawRegimeMonth(path, 19, 20260726, null, calibration);
    allStatesMatch &&= draw.state === state;
    const count = path + 1;
    const equityDelta = draw.equityLogReturn - meanEquity;
    const bondDelta = draw.bondLogReturn - meanBond;
    meanEquity += equityDelta / count;
    meanBond += bondDelta / count;
    equitySquareSum += equityDelta * (draw.equityLogReturn - meanEquity);
    bondSquareSum += bondDelta * (draw.bondLogReturn - meanBond);
    crossSum += equityDelta * (draw.bondLogReturn - meanBond);
  }

  return {
    allStatesMatch,
    mean: [meanEquity, meanBond],
    covariance: [
      equitySquareSum / (sampleCount - 1),
      crossSum / (sampleCount - 1),
      crossSum / (sampleCount - 1),
      bondSquareSum / (sampleCount - 1),
    ],
  };
}

function byteString(result) {
  const bytes = (array) =>
    Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString('hex');
  return [
    JSON.stringify({
      stats: result.stats,
      magnitude: result.magnitude,
      elapsedMs: result.elapsedMs,
      hasHistory: result.history !== undefined,
    }),
    bytes(result.terminalWealth),
    bytes(result.maxDrawdown),
    bytes(result.failureStep),
    result.history === undefined ? '' : bytes(result.history),
  ].join('|');
}

const FIXED_NOW = () => 1_700_000_000_000;
const BASE_PARAMS = {
  model: 'gbm',
  pathCount: 512,
  horizonYears: 1,
  retireYear: 0.5,
  initialWealth: 100_000,
  contribution: 500,
  withdrawal: 200,
  mu: 0.07,
  sigma: 0.15,
  glidepath: null,
  seed: 42,
};

console.log('\n[regime runtime] state thresholds and fixed streams');
{
  check(
    'initial stress comparison is strict below latestFiltered[1]',
    nextRegimeState(null, 0.699999999, CALIBRATION) === 1 &&
      nextRegimeState(null, 0.7, CALIBRATION) === 0,
  );
  check(
    'calm transition uses transition[1] with a strict comparison',
    nextRegimeState(0, 0.079999999, CALIBRATION) === 1 &&
      nextRegimeState(0, 0.08, CALIBRATION) === 0,
  );
  check(
    'stress transition uses transition[3] with a strict comparison',
    nextRegimeState(1, 0.749999999, CALIBRATION) === 1 &&
      nextRegimeState(1, 0.75, CALIBRATION) === 0,
  );
  check(
    'state threshold extremes remain in range',
    nextRegimeState(null, 0, CALIBRATION) === 1 &&
      nextRegimeState(null, 1 - Number.EPSILON, CALIBRATION) === 0,
  );

  let previous = null;
  const actual = [];
  for (let month = 0; month < PINNED_PATH_ZERO_SEED_42.length; month++) {
    const draw = drawRegimeMonth(0, month, 42, previous, CALIBRATION);
    actual.push(draw);
    previous = draw.state;
  }
  check(
    'seed 42 path 0 first twelve chained draws are pinned',
    JSON.stringify(actual) === JSON.stringify(PINNED_PATH_ZERO_SEED_42),
  );

  let shadowsMatch = true;
  for (let path = 0; path < 9 && shadowsMatch; path++) {
    for (let month = 0; month < 7 && shadowsMatch; month++) {
      const prior = [null, 0, 1][(path + month) % 3];
      const got = drawRegimeMonth(path, month, 0xdecafbad, prior, CALIBRATION);
      const want = shadowDraw(path, month, 0xdecafbad, prior, CALIBRATION);
      shadowsMatch =
        got.state === want.state &&
        got.equityLogReturn === want.equityLogReturn &&
        got.bondLogReturn === want.bondLogReturn;
    }
  }
  check(
    'draws match an independent fixed-stream shadow for every state branch',
    shadowsMatch,
  );
  check(
    'frozen stepSeedU golden feeding the runtime remains unchanged',
    stepSeedU(0, 0, 42) === 1223963391 &&
      stepSeedU(999999, 479, 42) === 1703963390,
  );
}

console.log('\n[regime runtime] conditional moments and persistence');
{
  const sampleCount = 30_000;
  for (const state of [0, 1]) {
    const sample = sampleConditionalMoments(state, sampleCount);
    const expected = CALIBRATION.states[state];
    const meanTolerance = state === 0 ? 0.001 : 0.003;
    check(`state ${state} conditioning is exact`, sample.allStatesMatch);
    check(
      `state ${state} equity mean matches calibration`,
      approx(sample.mean[0], expected.mean[0], meanTolerance),
      `got ${sample.mean[0]}, want ${expected.mean[0]}`,
    );
    check(
      `state ${state} bond mean matches calibration`,
      approx(sample.mean[1], expected.mean[1], meanTolerance),
      `got ${sample.mean[1]}, want ${expected.mean[1]}`,
    );
    check(
      `state ${state} equity variance matches L L'`,
      relativeApprox(sample.covariance[0], expected.covariance[0], 0.12),
      `got ${sample.covariance[0]}, want ${expected.covariance[0]}`,
    );
    check(
      `state ${state} equity-bond covariance matches L L'`,
      relativeApprox(sample.covariance[1], expected.covariance[1], 0.16),
      `got ${sample.covariance[1]}, want ${expected.covariance[1]}`,
    );
    check(
      `state ${state} bond variance matches L L'`,
      relativeApprox(sample.covariance[3], expected.covariance[3], 0.12),
      `got ${sample.covariance[3]}, want ${expected.covariance[3]}`,
    );
  }

  const transitionSamples = 20_000;
  const stressFrequency = (previous) => {
    let stresses = 0;
    for (let path = 0; path < transitionSamples; path++) {
      stresses += drawRegimeMonth(path, 31, 7357, previous, CALIBRATION).state;
    }
    return stresses / transitionSamples;
  };
  const initialStress = stressFrequency(null);
  const calmToStress = stressFrequency(0);
  const stressPersistence = stressFrequency(1);
  check(
    'initial-state frequency follows latest-filtered stress probability',
    approx(initialStress, 0.7, 0.012),
    `got ${initialStress}`,
  );
  check(
    'calm-to-stress frequency follows transition[1]',
    approx(calmToStress, 0.08, 0.008),
    `got ${calmToStress}`,
  );
  check(
    'stress persistence follows transition[3]',
    approx(stressPersistence, 0.75, 0.012),
    `got ${stressPersistence}`,
  );
  check(
    'stationary probabilities solve the two-state transition identity',
    approx(
      CALIBRATION.stationary[1],
      CALIBRATION.transition[1] /
        (CALIBRATION.transition[1] + CALIBRATION.transition[2]),
      1e-15,
    ) &&
      approx(CALIBRATION.stationary[0] + CALIBRATION.stationary[1], 1, 1e-15),
  );
  check(
    'expected durations are reciprocal exit probabilities',
    approx(
      CALIBRATION.expectedDurationMonths[0],
      1 / (1 - CALIBRATION.transition[0]),
      1e-12,
    ) &&
      approx(
        CALIBRATION.expectedDurationMonths[1],
        1 / (1 - CALIBRATION.transition[3]),
        1e-12,
      ),
  );
}

console.log('\n[regime runtime] separate CPU runner');
{
  const deterministicA = runCpuRegimeSim(BASE_PARAMS, CALIBRATION, {
    now: FIXED_NOW,
    includeHistory: true,
  });
  const deterministicB = runCpuRegimeSim(BASE_PARAMS, CALIBRATION, {
    now: FIXED_NOW,
    includeHistory: true,
  });
  check(
    'same inputs produce byte-identical complete CPU results',
    byteString(deterministicA) === byteString(deterministicB),
  );

  const changedSliders = runCpuRegimeSim(
    { ...BASE_PARAMS, mu: -2.5, sigma: 9 },
    CALIBRATION,
    { now: FIXED_NOW, includeHistory: true },
  );
  check(
    'regime CPU results ignore the mu and sigma sliders byte-for-byte',
    byteString(deterministicA) === byteString(changedSliders),
  );

  const changedFrozenModel = runCpuRegimeSim(
    { ...BASE_PARAMS, model: 'bootstrap' },
    CALIBRATION,
    { now: FIXED_NOW, includeHistory: true },
  );
  check(
    'regime CPU runner does not branch on the frozen primary model field',
    byteString(deterministicA) === byteString(changedFrozenModel),
  );

  const oneStepParams = {
    ...BASE_PARAMS,
    pathCount: 16,
    horizonYears: 1 / 12,
    retireYear: 1 / 12,
    initialWealth: 12_345,
    contribution: 0,
    withdrawal: 0,
    glidepath: { start: 0.25, end: 0.25 },
    seed: 314159,
  };
  const oneStepDraw = drawRegimeMonth(0, 0, oneStepParams.seed, null, CALIBRATION);
  const expectedMixedGross =
    0.25 * Math.exp(oneStepDraw.equityLogReturn) +
    0.75 * Math.exp(oneStepDraw.bondLogReturn);
  const mixed = runCpuRegimeSim(oneStepParams, CALIBRATION, { now: FIXED_NOW });
  check(
    'one-step glidepath wealth uses A·equityGross + (1-A)·bondGross',
    mixed.terminalWealth[0] ===
      Math.fround(oneStepParams.initialWealth * expectedMixedGross),
    `got ${mixed.terminalWealth[0]}`,
  );

  const pureEquity = runCpuRegimeSim(
    { ...oneStepParams, glidepath: null },
    CALIBRATION,
    { now: FIXED_NOW },
  );
  check(
    'null glidepath is exactly pure equity gross',
    pureEquity.terminalWealth[0] ===
      Math.fround(
        oneStepParams.initialWealth * Math.exp(oneStepDraw.equityLogReturn),
      ) &&
      pureEquity.terminalWealth[0] !== mixed.terminalWealth[0],
  );

  const ruinParams = {
    ...BASE_PARAMS,
    pathCount: 64,
    horizonYears: 1,
    retireYear: 0,
    initialWealth: 1_000,
    contribution: 0,
    withdrawal: 1_000_000_000_000,
    glidepath: null,
  };
  const ruin = runCpuRegimeSim(ruinParams, CALIBRATION, {
    now: FIXED_NOW,
    includeHistory: true,
  });
  check(
    'failure is post-clamp, absorbing, and recorded at zero-based step zero',
    ruin.failureStep.every((step) => step === 0) &&
      ruin.terminalWealth.every((wealth) => wealth === 0) &&
      ruin.maxDrawdown.every((drawdown) => drawdown === 1),
  );
  check(
    'all-path failure stats and magnitude use the frozen null/step semantics',
    ruin.stats.successRate === 0 &&
      ruin.stats.medianFailureYear === 0 &&
      ruin.magnitude.failedPaths === ruinParams.pathCount &&
      ruin.magnitude.medianShortfallYears === 1 &&
      ruin.magnitude.medianUnfundedObligation ===
        12 * ruinParams.withdrawal,
  );

  const survivorParams = {
    ...BASE_PARAMS,
    pathCount: 64,
    horizonYears: 1,
    retireYear: 0,
    initialWealth: 10_000,
    contribution: 0,
    withdrawal: 0,
    glidepath: null,
  };
  const survivors = runCpuRegimeSim(survivorParams, CALIBRATION, {
    now: FIXED_NOW,
    includeHistory: true,
  });
  check(
    'never-failed paths use -1 and null failure summaries',
    survivors.failureStep.every((step) => step === -1) &&
      survivors.stats.successRate === 1 &&
      survivors.stats.medianFailureYear === null &&
      survivors.magnitude.failedPaths === 0 &&
      survivors.magnitude.medianShortfallYears === null &&
      survivors.magnitude.medianUnfundedObligation === null,
  );

  const snapCount = snapCountForSteps(12);
  let survivorHistoryMatches = survivors.history?.length ===
    survivorParams.pathCount * snapCount;
  for (
    let path = 0;
    path < survivorParams.pathCount && survivorHistoryMatches;
    path++
  ) {
    survivorHistoryMatches =
      survivors.history[path * snapCount] === survivorParams.initialWealth &&
      survivors.history[path * snapCount + 1] === survivors.terminalWealth[path];
  }
  check(
    'history is run-sized with initial and terminal yearly snapshots',
    survivorHistoryMatches,
  );

  let ruinHistoryMatches =
    ruin.history?.length === ruinParams.pathCount * snapCount;
  for (let path = 0; path < ruinParams.pathCount && ruinHistoryMatches; path++) {
    ruinHistoryMatches =
      ruin.history[path * snapCount] === ruinParams.initialWealth &&
      ruin.history[path * snapCount + 1] === 0;
  }
  check(
    'mid-period failure writes the post-clamp zero into its history slot',
    ruinHistoryMatches,
  );
  check(
    'history is absent unless explicitly requested',
    runCpuRegimeSim(survivorParams, CALIBRATION, { now: FIXED_NOW }).history ===
      undefined,
  );
  check(
    'safe withdrawal rate remains the not-computed sentinel',
    deterministicA.stats.safeWithdrawalRate === 0,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
