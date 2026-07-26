import { assertRegimeAcceptance } from './acceptance.ts';
import historical from '../../data/historicalReturns.json';
import {
  buildRegimeCalibration,
  fitRegimeHmm,
  rollingOriginScores,
} from './hmm.ts';
import { recoverPairedLogReturns } from './series.ts';

let failures = 0;

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`PASS ${name}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ''}`);
}

function checkThrows(name, action, expected) {
  try {
    action();
    check(name, false, 'did not throw');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(name, expected.test(message), message);
  }
}

function makeLcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return (state + 0.5) / 4_294_967_296;
  };
}

function makeNormal(nextUniform) {
  return () => {
    const radius = Math.sqrt(-2 * Math.log(nextUniform()));
    return radius * Math.cos(2 * Math.PI * nextUniform());
  };
}

function generateSynthetic(count) {
  const nextUniform = makeLcg(0x6d2b79f5);
  const nextNormal = makeNormal(nextUniform);
  const transition = [
    [0.96, 0.04],
    [0.14, 0.86],
  ];
  const stateParameters = [
    {
      mean: [0.006, 0.002],
      cholesky: [0.025, 0.0018, 0.011864203],
    },
    {
      mean: [-0.018, 0.001],
      cholesky: [0.075, -0.007, 0.027110883],
    },
  ];
  const values = [];
  let state = 0;

  for (let index = 0; index < count; index += 1) {
    if (index > 0) {
      state = nextUniform() < transition[state][0] ? 0 : 1;
    }
    const z0 = nextNormal();
    const z1 = nextNormal();
    let chiSquared = 0;
    for (let coordinate = 0; coordinate < 5; coordinate += 1) {
      const z = nextNormal();
      chiSquared += z * z;
    }
    const radial = Math.sqrt(3 / chiSquared);
    const parameters = stateParameters[state];
    values.push([
      parameters.mean[0] + parameters.cholesky[0] * z0 * radial,
      parameters.mean[1]
        + parameters.cholesky[1] * z0 * radial
        + parameters.cholesky[2] * z1 * radial,
    ]);
  }

  return values;
}

function acceptedArtifactFrom(fit, rollingOrigin) {
  return {
    schemaVersion: 1,
    model: 'two-state-bivariate-student-t',
    degreesOfFreedom: 5,
    stateOrder: ['calm', 'stress'],
    data: {
      start: '1926-01',
      end: '2026-06',
      observations: 2_400,
      inputSha256: '0'.repeat(64),
    },
    states: fit.states,
    transition: fit.transition,
    stationary: fit.stationary,
    latestFiltered: fit.latestFiltered,
    filteredOccupancy: fit.filteredOccupancy,
    expectedDurationMonths: fit.expectedDurationMonths,
    fit: fit.fit,
    rollingOrigin,
  };
}

function withMutation(value, mutate) {
  const copy = structuredClone(value);
  mutate(copy);
  return copy;
}

function hasCommonCovarianceShape(first, second) {
  const scale = second[0] / first[0];
  return first.every((entry, index) => {
    const expected = entry * scale;
    return Math.abs(second[index] - expected)
      <= 1e-12 * Math.max(Math.abs(second[index]), Math.abs(expected), 1e-15);
  });
}

const SYNTHETIC = generateSynthetic(2_400);
const fit1 = fitRegimeHmm(SYNTHETIC);
const fit2 = fitRegimeHmm(SYNTHETIC);

check('fit converges', fit1.fit.converged, JSON.stringify(fit1.fit));
check(
  'deterministic fit',
  JSON.stringify(fit1) === JSON.stringify(fit2),
);
check(
  'states are ordered by equity volatility',
  fit1.states[0].equityVolMonthly < fit1.states[1].equityVolMonthly,
);
check(
  'scale HMM uses one shared state mean',
  fit1.states[0].mean[0] === fit1.states[1].mean[0]
    && fit1.states[0].mean[1] === fit1.states[1].mean[1],
  JSON.stringify(fit1.states.map((state) => state.mean)),
);
check(
  'scale HMM state covariances are scalar multiples of one shared shape',
  hasCommonCovarianceShape(
    fit1.states[0].covariance,
    fit1.states[1].covariance,
  ),
  JSON.stringify(fit1.states.map((state) => state.covariance)),
);
check(
  'calm transition persistence is recovered',
  Math.abs(fit1.transition[0] - 0.96) < 0.05,
  String(fit1.transition[0]),
);
check(
  'stress transition persistence is recovered',
  Math.abs(fit1.transition[3] - 0.86) < 0.05,
  String(fit1.transition[3]),
);
check(
  'both fitted states have material occupancy',
  fit1.filteredOccupancy[0] > 0.10 && fit1.filteredOccupancy[1] > 0.10,
  JSON.stringify(fit1.filteredOccupancy),
);
check(
  'state Cholesky diagonals are positive',
  fit1.states.every((state) => state.cholesky[0] > 0 && state.cholesky[2] > 0),
);
check(
  'four deterministic starts are exposed in order',
  fit1.orderedStartLogLikelihoods.length === 4
    && fit1.orderedStartLogLikelihoods.every(Number.isFinite),
  JSON.stringify(fit1.orderedStartLogLikelihoods),
);

const rolling1 = rollingOriginScores(SYNTHETIC.slice(0, 720));
const rolling2 = rollingOriginScores(SYNTHETIC.slice(0, 720));
check(
  'rolling-origin scores every month after the first origin',
  rolling1.firstOrigin === 600
    && rolling1.refitEveryMonths === 12
    && rolling1.observationsScored === 120,
  JSON.stringify(rolling1),
);
check(
  'rolling-origin scoring is deterministic and finite',
  JSON.stringify(rolling1) === JSON.stringify(rolling2)
    && Number.isFinite(rolling1.twoStateMeanLogScore)
    && Number.isFinite(rolling1.oneStateMeanLogScore),
  JSON.stringify(rolling1),
);
check(
  'two-state synthetic rolling score beats one-state',
  rolling1.twoStateMeanLogScore >= rolling1.oneStateMeanLogScore,
  JSON.stringify(rolling1),
);

const accepted = acceptedArtifactFrom(fit1, rolling1);
assertRegimeAcceptance(accepted, fit1.orderedStartLogLikelihoods);
check('accepted fixture clears every gate', true);

checkThrows(
  'rejects a non-positive covariance determinant',
  () => assertRegimeAcceptance(
    withMutation(accepted, (artifact) => {
      artifact.states[0].covariance = [1, 2, 2, 1];
    }),
    fit1.orderedStartLogLikelihoods,
  ),
  /covariance determinant/i,
);
checkThrows(
  'rejects a non-positive Cholesky diagonal',
  () => assertRegimeAcceptance(
    withMutation(accepted, (artifact) => {
      artifact.states[0].cholesky[0] = 0;
    }),
    fit1.orderedStartLogLikelihoods,
  ),
  /Cholesky diagonal/i,
);
checkThrows(
  'rejects a state occupancy below ten percent',
  () => assertRegimeAcceptance(
    withMutation(accepted, (artifact) => {
      artifact.filteredOccupancy = [0.0999, 0.9001];
    }),
    fit1.orderedStartLogLikelihoods,
  ),
  /occupancy/i,
);
checkThrows(
  'rejects insufficient stress volatility separation',
  () => assertRegimeAcceptance(
    withMutation(accepted, (artifact) => {
      artifact.states[1].equityVolMonthly =
        artifact.states[0].equityVolMonthly * 1.49;
    }),
    fit1.orderedStartLogLikelihoods,
  ),
  /volatility separation/i,
);
checkThrows(
  'rejects a transition cell outside the strict calibrated range',
  () => assertRegimeAcceptance(
    withMutation(accepted, (artifact) => {
      artifact.transition = [0.99999, 0.00001, 0.14, 0.86];
    }),
    fit1.orderedStartLogLikelihoods,
  ),
  /transition probability/i,
);
checkThrows(
  'rejects a non-persistent diagonal transition',
  () => assertRegimeAcceptance(
    withMutation(accepted, (artifact) => {
      artifact.transition = [0.49, 0.51, 0.14, 0.86];
    }),
    fit1.orderedStartLogLikelihoods,
  ),
  /persistence/i,
);
checkThrows(
  'rejects transition rows that do not sum to one',
  () => assertRegimeAcceptance(
    withMutation(accepted, (artifact) => {
      artifact.transition = [0.95, 0.10, 0.14, 0.86];
    }),
    fit1.orderedStartLogLikelihoods,
  ),
  /row-stochastic/i,
);
checkThrows(
  'rejects a non-converged winning fit',
  () => assertRegimeAcceptance(
    withMutation(accepted, (artifact) => {
      artifact.fit.converged = false;
    }),
    fit1.orderedStartLogLikelihoods,
  ),
  /converged/i,
);
checkThrows(
  'rejects fewer than four deterministic starts',
  () => assertRegimeAcceptance(accepted, fit1.orderedStartLogLikelihoods.slice(0, 3)),
  /four deterministic starts/i,
);
checkThrows(
  'same-solution count gate is binding',
  () => assertRegimeAcceptance(
    accepted,
    [
      fit1.fit.logLikelihood,
      fit1.fit.logLikelihood - 1,
      fit1.fit.logLikelihood - 2,
      fit1.fit.logLikelihood - 3,
    ],
  ),
  /same solution/i,
);
checkThrows(
  'rolling score gate is binding',
  () => assertRegimeAcceptance(
    withMutation(accepted, (artifact) => {
      artifact.rollingOrigin.twoStateMeanLogScore = -9;
      artifact.rollingOrigin.oneStateMeanLogScore = -8;
    }),
    fit1.orderedStartLogLikelihoods,
  ),
  /rolling-origin/i,
);

const historicalBuild = buildRegimeCalibration(
  recoverPairedLogReturns(historical),
);
check(
  'historical stress equity volatility exceeds calm by at least 1.5x',
  historicalBuild.artifact.states[1].equityVolMonthly
    / historicalBuild.artifact.states[0].equityVolMonthly > 1.5,
  JSON.stringify(
    historicalBuild.artifact.states.map((state) => state.equityVolMonthly),
  ),
);
try {
  assertRegimeAcceptance(
    historicalBuild.artifact,
    historicalBuild.orderedStartLogLikelihoods,
  );
  check('shipped historical calibration clears every acceptance gate', true);
} catch (error) {
  check(
    'shipped historical calibration clears every acceptance gate',
    false,
    error instanceof Error ? error.message : String(error),
  );
}

if (failures > 0) {
  process.exitCode = 1;
}
