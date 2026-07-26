/**
 * probe3.mjs — spatial structure of the low-index median bias found in probe2.
 * For pure GBM (no cash flows), split the 100k paths into 20 contiguous 5k
 * blocks and measure each block's mean Z-equivalent (mean ln(W/W0) minus
 * analytic drift, in units of per-month Z bias). Also check the raw normal
 * stream directly: E[Z] for seedU ranges, bypassing the sim entirely.
 */
import { runCpuSim } from '../sim/fallback/cpuSim.ts';
import { streamNormal, streamUniform, stepSeedU } from '../sim/model/hash.ts';

const NOW = () => 1700000000000;
const r = runCpuSim({
  model: 'gbm', pathCount: 100_000, horizonYears: 30, retireYear: 0,
  initialWealth: 1_000_000, contribution: 0, withdrawal: 0,
  mu: 0.07, sigma: 0.15, glidepath: null, seed: 42,
}, { now: NOW });

// per-path mean monthly Z recovered from terminal wealth:
// ln(W/W0) = (μ−σ²/2)T + σ√Δt Σ Z_t  →  meanZ = (ln(W/W0) − (μ−σ²/2)·30) / (σ·√(1/12)·360)
const drift = (0.07 - 0.15 ** 2 / 2) * 30;
const scale = 0.15 * Math.sqrt(1 / 12) * 360;
console.log('mean per-month Z bias by 5k-path block (GBM sim, seed 42):');
for (let b = 0; b < 20; b++) {
  let acc = 0;
  for (let i = b * 5000; i < (b + 1) * 5000; i++) acc += (Math.log(r.terminalWealth[i] / 1e6) - drift) / scale;
  console.log(`  paths [${String(b * 5000).padStart(6)},${String((b + 1) * 5000).padStart(6)}): E[Z] bias = ${(acc / 5000).toFixed(5)}`);
}

// raw stream check: E[Z] over seedU in the same ranges, single (path,step) style
console.log('\nraw streamNormal E[Z] over seedU arithmetic ranges (seed=42, t=0 only):');
for (let b = 0; b < 20; b++) {
  let acc = 0;
  for (let i = b * 5000; i < (b + 1) * 5000; i++) acc += streamNormal(stepSeedU(i, 0, 42), 0);
  console.log(`  i [${String(b * 5000).padStart(6)},${String((b + 1) * 5000).padStart(6)}): E[Z] = ${(acc / 5000).toFixed(5)}`);
}

// component check: E[sqrt(-2 ln u1)] and E[cos(2π u2)] and their product correlation
console.log('\ncomponent decomposition over i ∈ [0,5000) vs [50000,55000), t=0:');
for (const [lo, hi] of [[0, 5000], [50000, 55000]]) {
  let mR = 0, mC = 0, mZ = 0, mU2 = 0;
  for (let i = lo; i < hi; i++) {
    const s = stepSeedU(i, 0, 42);
    const u1 = Math.max(streamUniform(s, 0), 1e-7);
    const u2 = streamUniform(s, 1);
    mR += Math.sqrt(-2 * Math.log(u1));
    mC += Math.cos(2 * Math.PI * u2);
    mU2 += u2;
    mZ += Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  const n = hi - lo;
  console.log(`  [${lo},${hi}): E[R]=${(mR / n).toFixed(5)} E[cos]=${(mC / n).toFixed(5)} E[u2]=${(mU2 / n).toFixed(5)} E[Z]=${(mZ / n).toFixed(5)}`);
}
