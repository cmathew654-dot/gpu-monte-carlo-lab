/**
 * probe4.mjs — where does Model C (fat tail) actually bite? Full-stat twin
 * comparison at the preset params (4.0% WR, 30y) and at two higher-stress
 * variants, GBM vs fattail, 100k paths, seed 42. Grounds DEMO.md in what
 * the sim really shows.
 */
import { runCpuSim } from '../sim/fallback/cpuSim.ts';

const NOW = () => 1700000000000;
const BASE = {
  horizonYears: 30, retireYear: 0, initialWealth: 1_250_000,
  contribution: 0, withdrawal: 4_200, mu: 0.07, sigma: 0.15,
  glidepath: null, pathCount: 100_000, seed: 42,
};
const variants = [
  ['preset 4.0% WR ($1.25M/$4200)', BASE],
  ['6% WR ($1M/$5000)', { ...BASE, initialWealth: 1_000_000, withdrawal: 5_000 }],
  ['8% WR ($1.2M/$8000)', { ...BASE, initialWealth: 1_200_000, withdrawal: 8_000 }],
  ['10-yr horizon, 6% WR', { ...BASE, initialWealth: 1_000_000, withdrawal: 5_000, horizonYears: 10 }],
];
for (const [label, p] of variants) {
  const a = runCpuSim({ ...p, model: 'gbm' }, { now: NOW }).stats;
  const c = runCpuSim({ ...p, model: 'fattail' }, { now: NOW }).stats;
  console.log(`\n${label}`);
  const row = (k, fa, fc, unit = '') =>
    console.log(`  ${k.padEnd(18)} GBM ${fa}${unit}   vs   t5 ${fc}${unit}   (Δ ${(fc - fa).toFixed(2)}${unit})`);
  row('successRate %', (a.successRate * 100).toFixed(2), (c.successRate * 100).toFixed(2), 'pp');
  row('p5 $', a.percentiles.p5.toFixed(0), c.percentiles.p5.toFixed(0));
  row('p50 $', a.percentiles.p50.toFixed(0), c.percentiles.p50.toFixed(0));
  row('p95 $', a.percentiles.p95.toFixed(0), c.percentiles.p95.toFixed(0));
  row('worstDecileDD %', (a.worstDecileMaxDD * 100).toFixed(1), (c.worstDecileMaxDD * 100).toFixed(1), 'pp');
  row('medianFailYr', a.medianFailureYear?.toFixed(1) ?? '—', c.medianFailureYear?.toFixed(1) ?? '—');
}
