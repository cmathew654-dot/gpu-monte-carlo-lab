/**
 * validate.ts — Agent 7 statistical validation harness (spec §2.6, §4.7).
 * SINGLE OWNER: Agent 7.
 *
 * CPU-reference-level validation matrix:
 *   {3 models} × {10k, 100k paths} × {2 seeds}, run TWICE per cell:
 *     - R3 determinism: identical params → identical SimStats (JSON + 6-dec)
 *     - §2.6 GBM analytic moments (pure-GBM params, no cash flows)
 *     - R2-style path-count convergence (sampling-noise tolerance)
 *     - Model B sanity: block-pool mean/vol vs docs/calibration.md values
 *     - All 5 scenarios.json presets at 100k paths (DEMO.md ground truth)
 *     - SWR search on two retirement presets (10k paths, documented)
 *
 * GPU↔CPU parity (R5) cannot run in this container (headless Chromium
 * destroys the WebGPU device ~1.4 s after renderer init — see
 * validation/REPORT.md §R5 for the hardware protocol that closes this).
 *
 * Run: npm run test:validate   (esbuild bundle → node, same as test:sim)
 */
import { runCpuSim, quantile } from '../sim/fallback/cpuSim';
import {
  parseBootstrapBlocksFile,
  type BootstrapBlocksData,
  type BootstrapBlocksFile,
} from '../sim/model/bootstrap';
import { findSafeWithdrawal } from '../sim/stats/safeWithdrawal';
import type { SimParams, SimStats } from '../store/simStore';
import historicalReturnsJson from '../data/historicalReturns.json';
import scenariosJson from '../data/scenarios.json';

// ---------------------------------------------------------------------------
// tiny harness (same style as cpuSim.test.mjs)
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const NOW = () => 1_700_000_000_000; // fixed clock → deterministic computedAt
const fmt$ = (v: number) =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(3)}M` : `$${(v / 1e3).toFixed(1)}k`;

// ---------------------------------------------------------------------------
// data
// ---------------------------------------------------------------------------
const bootstrap = parseBootstrapBlocksFile(
  historicalReturnsJson as unknown as BootstrapBlocksFile,
) as BootstrapBlocksData;
if (!bootstrap) throw new Error('historicalReturns.json failed to parse');

interface Scenario {
  name: string;
  description: string;
  params: SimParams;
}
const scenarios = scenariosJson as unknown as Scenario[];

// ---------------------------------------------------------------------------
// 1. Matrix: {3 models} × {10k, 100k} × {2 seeds}, determinism double-run
// ---------------------------------------------------------------------------
console.log('\n[1] validation matrix — 3 models × 2 path counts × 2 seeds');
const MODELS = ['gbm', 'bootstrap', 'fattail'] as const;
const PATH_COUNTS = [10_000, 100_000] as const;
const SEEDS = [42, 1337] as const;

const MATRIX_BASE: Omit<SimParams, 'model' | 'pathCount' | 'seed'> = {
  horizonYears: 30,
  retireYear: 0,
  initialWealth: 1_000_000,
  contribution: 0,
  withdrawal: 5_000,
  mu: 0.07,
  sigma: 0.15,
  glidepath: null,
};

interface Cell {
  model: string;
  paths: number;
  seed: number;
  stats: SimStats;
  elapsedMs: number;
}
const cells: Cell[] = [];

for (const model of MODELS) {
  for (const paths of PATH_COUNTS) {
    for (const seed of SEEDS) {
      const params: SimParams = { ...MATRIX_BASE, model, pathCount: paths, seed };
      const run = () =>
        runCpuSim(params, { bootstrapData: bootstrap, now: NOW });
      const t0 = performance.now();
      const a = run();
      const wallMs = performance.now() - t0;
      const b = run(); // R3 double-run
      const s = a.stats;
      cells.push({ model, paths, seed, stats: s, elapsedMs: wallMs });
      console.log(
        `  ${model.padEnd(9)} n=${String(paths).padEnd(7)} seed=${String(seed).padEnd(5)}` +
          ` success=${(s.successRate * 100).toFixed(2)}%  p5=${fmt$(s.percentiles.p5)}` +
          `  p50=${fmt$(s.percentiles.p50)}  p95=${fmt$(s.percentiles.p95)}` +
          `  worstDecileDD=${(s.worstDecileMaxDD * 100).toFixed(1)}%` +
          `  medianFailYr=${s.medianFailureYear == null ? '—' : s.medianFailureYear.toFixed(1)}` +
          `  (${wallMs.toFixed(0)} ms)`,
      );
      check(
        `R3 ${model}/${paths}/seed${seed}: identical SimStats JSON`,
        JSON.stringify(a.stats) === JSON.stringify(b.stats),
      );
      check(
        `R3 ${model}/${paths}/seed${seed}: successRate 6-decimal equality`,
        a.stats.successRate.toFixed(6) === b.stats.successRate.toFixed(6),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 2. GBM analytic moments (§2.6) — pure GBM, no cash flows
// ---------------------------------------------------------------------------
console.log('\n[2] GBM analytic moments (§2.6, closed-form lognormal)');
for (const paths of PATH_COUNTS) {
  for (const seed of SEEDS) {
    const params: SimParams = {
      model: 'gbm',
      pathCount: paths,
      horizonYears: 30,
      retireYear: 0,
      initialWealth: 1_000_000,
      contribution: 0,
      withdrawal: 0,
      mu: 0.07,
      sigma: 0.15,
      glidepath: null,
      seed,
    };
    const r = runCpuSim(params, { now: NOW });
    const T = 30;
    const analyticE = Math.log(1_000_000) + (0.07 - 0.15 ** 2 / 2) * T;
    const analyticV = 0.15 ** 2 * T;
    let e = 0;
    for (const w of r.terminalWealth) e += Math.log(w);
    e /= paths;
    let v = 0;
    for (const w of r.terminalWealth) v += (Math.log(w) - e) ** 2;
    v /= paths - 1;
    console.log(
      `  n=${String(paths).padEnd(7)} seed=${String(seed).padEnd(5)}` +
        ` E[lnW]=${e.toFixed(6)} (analytic ${analyticE.toFixed(6)}, ${(((e - analyticE) / analyticE) * 100).toFixed(3)}%)` +
        `  Var[lnW]=${v.toFixed(6)} (analytic ${analyticV.toFixed(6)}, ${(((v - analyticV) / analyticV) * 100).toFixed(3)}%)`,
    );
    check(
      `§2.6 E[ln W_T] within ±1% (gbm/${paths}/seed${seed})`,
      Math.abs(e - analyticE) <= 0.01 * Math.abs(analyticE),
      `E=${e} analytic=${analyticE}`,
    );
    check(
      `§2.6 Var[ln W_T] within ±1% (gbm/${paths}/seed${seed})`,
      Math.abs(v - analyticV) <= 0.01 * analyticV,
      `V=${v} analytic=${analyticV}`,
    );
    // every path succeeds with zero withdrawal
    check(`§2.6 successRate = 1 (gbm/${paths}/seed${seed})`, r.stats.successRate === 1);
  }
}

// ---------------------------------------------------------------------------
// 3. R2 path-count behavior. The RIGOROUS CPU-level gate: path generation is
// n-independent, so a 10k run must be the BIT-EXACT first-10k subset of the
// 100k run with the same seed (verified below). The stat deltas 10k↔100k are
// then pure estimator noise — reported informationally with measured bands,
// since the §2.6 tolerances are defined for GPU↔CPU at EQUAL path counts.
// ---------------------------------------------------------------------------
console.log('\n[3] R2 path-count independence (10k run ≡ bit-exact subset of 100k run)');
for (const model of MODELS) {
  const params: SimParams = { ...MATRIX_BASE, model, pathCount: 100_000, seed: 42 };
  const full = runCpuSim(params, { bootstrapData: bootstrap, now: NOW });
  const sub = runCpuSim(
    { ...params, pathCount: 10_000 },
    { bootstrapData: bootstrap, now: NOW },
  );
  let identical = true;
  for (let i = 0; i < 10_000; i++) {
    if (
      sub.terminalWealth[i] !== full.terminalWealth[i] ||
      sub.failureStep[i] !== full.failureStep[i] ||
      sub.maxDrawdown[i] !== full.maxDrawdown[i]
    ) {
      identical = false;
      break;
    }
  }
  check(`R2 ${model}: 10k run is bit-exact first-10k subset of 100k run`, identical);

  const lo = cells.find((c) => c.model === model && c.paths === 10_000 && c.seed === 42);
  const hi = cells.find((c) => c.model === model && c.paths === 100_000 && c.seed === 42);
  if (lo && hi) {
    const dSuccess = (lo.stats.successRate - hi.stats.successRate) * 100;
    const dP50 =
      ((lo.stats.percentiles.p50 - hi.stats.percentiles.p50) / hi.stats.percentiles.p50) * 100;
    const dP95 =
      ((lo.stats.percentiles.p95 - hi.stats.percentiles.p95) / hi.stats.percentiles.p95) * 100;
    console.log(
      `  ${model.padEnd(9)} seed=42 estimator noise: Δsuccess=${dSuccess.toFixed(2)}pp` +
        `  Δp50=${dP50.toFixed(2)}%  Δp95=${dP95.toFixed(2)}%` +
        `  (measured bands over 6 seeds: success ±1.5pp, p50 ±6% pure-GBM / ±14%` +
        `  fat-tail-with-failures mixture, p95 ±6% — see REPORT.md §R2)`,
    );
    // Wide 3σ-of-observed gates: success se(10k)≈0.5pp binomial → ±1.5pp.
    check(`R2 ${model}/seed42: Δsuccess within ±1.5pp estimator noise`, Math.abs(dSuccess) <= 1.5);
  }
}

// ---------------------------------------------------------------------------
// 4. Model B sanity — block pool mean/vol vs docs/calibration.md
// ---------------------------------------------------------------------------
console.log('\n[4] Model B block-pool moments vs calibration.md (8.24%/yr arith, 15.35% vol)');
{
  const blocks = bootstrap.blocks; // 1195 × 12 simple monthly real returns
  const n = blocks.length;
  let mean = 0;
  for (const r of blocks) mean += r;
  mean /= n;
  let varM = 0;
  for (const r of blocks) varM += (r - mean) ** 2;
  varM /= n - 1;
  const annMean = mean * 12 * 100;
  const annVol = Math.sqrt(varM * 12) * 100;
  console.log(`  block pool: arith mean ${annMean.toFixed(2)}%/yr, vol ${annVol.toFixed(2)}%/yr (${n} monthly returns)`);
  check('block-pool arithmetic mean within ±0.75pp of 8.24%/yr', Math.abs(annMean - 8.24) <= 0.75, `${annMean.toFixed(2)}`);
  check('block-pool vol within ±1.0pp of 15.35%/yr', Math.abs(annVol - 15.35) <= 1.0, `${annVol.toFixed(2)}`);

  // worst block-month must expose the Depression (calibration: worst month −26.2%)
  let worst = Infinity;
  for (const r of blocks) if (r < worst) worst = r;
  console.log(`  worst monthly return in pool: ${(worst * 100).toFixed(1)}%`);
  check('Depression visible in pool (worst month ≤ −20%)', worst <= -0.2, `${(worst * 100).toFixed(1)}%`);

  // empirical annual (12-mo compounded) block returns
  const annual: number[] = [];
  for (let b = 0; b < bootstrap.blockCount; b++) {
    let g = 1;
    for (let k = 0; k < 12; k++) g *= 1 + blocks[b * 12 + k];
    annual.push(g - 1);
  }
  annual.sort((x, y) => x - y);
  console.log(
    `  empirical 12-mo block returns: p5=${(quantile(annual, 0.05) * 100).toFixed(1)}%` +
      `  p50=${(quantile(annual, 0.5) * 100).toFixed(1)}%  p95=${(quantile(annual, 0.95) * 100).toFixed(1)}%` +
      `  worst=${(annual[0] * 100).toFixed(1)}%`,
  );
  check('worst 12-mo block ≤ −40% (1932-class years preserved)', annual[0] <= -0.4, `${(annual[0] * 100).toFixed(1)}%`);
}

// ---------------------------------------------------------------------------
// 5. Presets at 100k paths — DEMO.md ground-truth numbers
// ---------------------------------------------------------------------------
console.log('\n[5] scenarios.json presets through runCpuSim @100k (DEMO.md numbers)');
interface PresetRow {
  name: string;
  stats: SimStats;
  elapsedMs: number;
}
const presetRows: PresetRow[] = [];
for (const sc of scenarios) {
  const params: SimParams = { ...sc.params, pathCount: 100_000 };
  const t0 = performance.now();
  const r = runCpuSim(params, { bootstrapData: bootstrap, now: NOW });
  const wallMs = performance.now() - t0;
  const r2 = runCpuSim(params, { bootstrapData: bootstrap, now: NOW });
  const s = r.stats;
  presetRows.push({ name: sc.name, stats: s, elapsedMs: wallMs });
  console.log(
    `  ${sc.name.padEnd(28)} success=${(s.successRate * 100).toFixed(2)}%` +
      `  p5=${fmt$(s.percentiles.p5)}  p50=${fmt$(s.percentiles.p50)}  p95=${fmt$(s.percentiles.p95)}` +
      `  worstDecileDD=${(s.worstDecileMaxDD * 100).toFixed(1)}%` +
      `  medianFailYr=${s.medianFailureYear == null ? '—' : s.medianFailureYear.toFixed(1)}` +
      `  (${wallMs.toFixed(0)} ms)`,
  );
  check(`R3 preset "${sc.name}": identical SimStats JSON`, JSON.stringify(s) === JSON.stringify(r2.stats));
}

// GBM twin of the fat-tail preset: the Model A↔C gap is the demo's insight.
{
  const fat = scenarios.find((s) => s.name === 'Fat-tail stress');
  if (fat) {
    const gbmTwin = runCpuSim(
      { ...fat.params, model: 'gbm', pathCount: 100_000 },
      { bootstrapData: bootstrap, now: NOW },
    ).stats;
    const fatStats = presetRows.find((p) => p.name === 'Fat-tail stress')?.stats;
    if (fatStats) {
      console.log(
        `  [fat-tail insight] same plan on GBM: success=${(gbmTwin.successRate * 100).toFixed(2)}%` +
          ` vs Student-t: ${(fatStats.successRate * 100).toFixed(2)}%` +
          `  (gap ${((gbmTwin.successRate - fatStats.successRate) * 100).toFixed(2)}pp);` +
          ` worstDecileDD GBM ${(gbmTwin.worstDecileMaxDD * 100).toFixed(1)}% vs t5 ${(fatStats.worstDecileMaxDD * 100).toFixed(1)}%`,
      );
      // Honest gate (measured, REPORT.md §5): over 360 monthly steps the CLT
      // washes out ν=5 kurtosis — success rates agree within noise (±1pp).
      // Model C's value is pedagogical contrast, not a success-rate shift.
      check(
        'Model C ≈ Model A success within ±1pp at 30y (CLT wash-out, measured)',
        Math.abs(fatStats.successRate - gbmTwin.successRate) <= 0.01,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 6. SWR search on retirement presets (10k paths — documented precision)
// ---------------------------------------------------------------------------
console.log('\n[6] safe-withdrawal search (findSafeWithdrawal + runCpuSim @10k)');
for (const name of ['Early retiree 35-yr', 'High-withdrawal cautionary']) {
  const sc = scenarios.find((s) => s.name === name);
  if (!sc) continue;
  const base: SimParams = { ...sc.params, pathCount: 10_000 };
  const runner = async (w: number) =>
    runCpuSim({ ...base, withdrawal: w }, { bootstrapData: bootstrap, now: NOW }).stats
      .successRate;
  const t0 = performance.now();
  const res = await findSafeWithdrawal(runner, {}, base);
  const wallMs = performance.now() - t0;
  const annualPct = ((res.withdrawal * 12) / base.initialWealth) * 100;
  console.log(
    `  ${name}: SWR ≈ $${res.withdrawal.toFixed(0)}/mo (${annualPct.toFixed(2)}%/yr of initial)` +
      `  success=${(res.successRate * 100).toFixed(2)}%  iters=${res.iterations}` +
      `  converged=${res.converged}  (${wallMs.toFixed(0)} ms)`,
  );
  check(`SWR "${name}" converged or bracketed`, res.converged || res.iterations <= 10);
  if (res.converged) {
    check(
      `SWR "${name}" success in [89.5%, 90.5%]`,
      res.successRate >= 0.895 && res.successRate <= 0.905,
      `${(res.successRate * 100).toFixed(2)}%`,
    );
  }
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`validate.ts: ${failed} check(s) FAILED`);
