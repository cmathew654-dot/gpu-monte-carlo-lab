/**
 * probe2.mjs — isolate the Δp50 sign bias seen in probe.mjs.
 * Pure GBM, NO cash flows (lognormal): compare median(first 10k paths of the
 * 100k run) vs median(full 100k). Because per-(path,step) seeds are
 * n-independent, the 10k run's paths are EXACTLY the first 10k of the 100k
 * run — so any systematic sign means path quality depends on index range.
 */
import { runCpuSim, quantile } from '../sim/fallback/cpuSim.ts';

const NOW = () => 1700000000000;
const BASE = {
  model: 'gbm', horizonYears: 30, retireYear: 0, initialWealth: 1_000_000,
  contribution: 0, withdrawal: 0, mu: 0.07, sigma: 0.15, glidepath: null,
};

const diffs = [];
for (const seed of [7, 42, 99, 1337, 5001, 31415, 2718, 161, 777, 90210, 123, 55555]) {
  const full = runCpuSim({ ...BASE, pathCount: 100_000, seed }, { now: NOW });
  const w = full.terminalWealth;
  const first10k = Float64Array.from(w.subarray(0, 10_000)).sort();
  const rest = Float64Array.from(w.subarray(10_000)).sort();
  const all = Float64Array.from(w).sort();
  const mFirst = quantile(first10k, 0.5);
  const mRest = quantile(rest, 0.5);
  const mAll = quantile(all, 0.5);
  const d = ((mFirst - mAll) / mAll) * 100;
  const dRest = ((mRest - mAll) / mAll) * 100;
  diffs.push(d);
  console.log(`seed=${String(seed).padEnd(6)} Δ(first10k−all)=${d.toFixed(2)}%  Δ(rest90k−all)=${dRest.toFixed(2)}%`);
}
const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
const sd = Math.sqrt(diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / (diffs.length - 1));
console.log(`\nΔ(first10k−all): mean=${mean.toFixed(3)}% sd=${sd.toFixed(3)}% t=${((mean / sd) * Math.sqrt(diffs.length)).toFixed(2)}`);
// sanity: verify the 10k run is EXACTLY the first 10k paths of the 100k run
const a = runCpuSim({ ...BASE, pathCount: 10_000, seed: 42 }, { now: NOW }).terminalWealth;
const b = runCpuSim({ ...BASE, pathCount: 100_000, seed: 42 }, { now: NOW }).terminalWealth;
let identical = true;
for (let i = 0; i < 10_000; i++) if (a[i] !== b[i]) { identical = false; break; }
console.log(`10k run === first 10k of 100k run (bit-exact): ${identical}`);
