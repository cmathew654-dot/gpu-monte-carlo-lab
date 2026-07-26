import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import historicalReturns from '../src/data/historicalReturns.json';
import { assertRegimeAcceptance } from '../src/sim/regime/acceptance';
import { buildRegimeCalibration } from '../src/sim/regime/hmm';
import { recoverPairedLogReturns } from '../src/sim/regime/series';

const outputPath = resolve(process.cwd(), 'src', 'data', 'regimeCalibration.json');
const series = recoverPairedLogReturns(historicalReturns);
const build = buildRegimeCalibration(series);

const artifact = build.artifact;
console.log('\nRegime-t calibration acceptance');
console.table({
  data: {
    observations: artifact.data.observations,
    start: artifact.data.start,
    end: artifact.data.end,
    sha256: artifact.data.inputSha256,
  },
  fit: {
    logLikelihood: artifact.fit.logLikelihood,
    iterations: artifact.fit.iterations,
    converged: artifact.fit.converged,
    agreeingStarts: artifact.fit.convergedOrderedStarts,
  },
  rolling: {
    observations: artifact.rollingOrigin.observationsScored,
    twoState: artifact.rollingOrigin.twoStateMeanLogScore,
    oneState: artifact.rollingOrigin.oneStateMeanLogScore,
  },
});
console.table({
  calm: {
    equityVolMonthly: artifact.states[0].equityVolMonthly,
    occupancy: artifact.filteredOccupancy[0],
    persistence: artifact.transition[0],
    expectedMonths: artifact.expectedDurationMonths[0],
    latestProbability: artifact.latestFiltered[0],
  },
  stress: {
    equityVolMonthly: artifact.states[1].equityVolMonthly,
    occupancy: artifact.filteredOccupancy[1],
    persistence: artifact.transition[3],
    expectedMonths: artifact.expectedDurationMonths[1],
    latestProbability: artifact.latestFiltered[1],
  },
});
console.dir({ states: artifact.states, transition: artifact.transition }, { depth: null });
console.log('Ordered start log likelihoods:', build.orderedStartLogLikelihoods);
assertRegimeAcceptance(build.artifact, build.orderedStartLogLikelihoods);

const serialized = `${JSON.stringify(build.artifact, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const committed = readFileSync(outputPath, 'utf8');
  // Git may materialize JSON as CRLF on Windows. Preserve byte-for-byte
  // content checking after normalizing only the platform line separator.
  const normalizedCommitted = committed.replace(/\r\n/g, '\n');
  if (normalizedCommitted !== serialized) {
    throw new Error(
      'Committed regimeCalibration.json differs from deterministic calibration output',
    );
  }
} else {
  writeFileSync(outputPath, serialized, 'utf8');
}
console.log(process.argv.includes('--check')
  ? '\nCommitted calibration artifact is reproducible.'
  : `\nWrote ${outputPath}`);
