/**
 * probe.mjs — Agent 7 falsification probe: is the 10k↔100k p50/p95 gap in
 * validate.ts §3 sampling noise, or a systematic path-count bias?
 * Runs fattail + bootstrap at 10k and 100k across 6 seeds and looks at the
 * sign/magnitude distribution of the differences. If diffs scatter around 0
 * with magnitude consistent with the median-estimator se, it's noise.
 */
import { runCpuSim } from '../sim/fallback/cpuSim.ts';
import { parseBootstrapBlocksFile } from '../sim/model/bootstrap.ts';
import historicalReturnsJson from '../data/historicalReturns.json' with { type: 'json' };

const bootstrap = parseBootstrapBlocksFile(historicalReturnsJson);
const NOW = () => 1700000000000;
const BASE = {
  horizonYears: 30, retireYear: 0, initialWealth: 1_000_000,
  contribution: 0, withdrawal: 5_000, mu: 0.07, sigma: 0.15, glidepath: null,
};

for (const model of ['fattail', 'bootstrap', 'gbm']) {
  const diffs = [];
  for (const seed of [7, 42, 99, 1337, 5001, 31415]) {
    const lo = runCpuSim({ ...BASE, model, pathCount: 10_000, seed }, { bootstrapData: bootstrap, now: NOW }).stats;
    const hi = runCpuSim({ ...BASE, model, pathCount: 100_000, seed }, { bootstrapData: bootstrap, now: NOW }).stats;
    const d50 = ((lo.percentiles.p50 - hi.percentiles.p50) / hi.percentiles.p50) * 100;
    const d95 = ((lo.percentiles.p95 - hi.percentiles.p95) / hi.percentiles.p95) * 100;
    const dS = (lo.successRate - hi.successRate) * 100;
    diffs.push(d50);
    console.log(
      `${model.padEnd(9)} seed=${String(seed).padEnd(6)} Δp50=${d50.toFixed(2)}%  Δp95=${d95.toFixed(2)}%  Δsuccess=${dS.toFixed(2)}pp`,
    );
  }
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const sd = Math.sqrt(diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / (diffs.length - 1));
  console.log(`${model}: Δp50 mean=${mean.toFixed(2)}%  sd=${sd.toFixed(2)}%  (mean/sd = ${(mean / sd).toFixed(2)})\n`);
}
