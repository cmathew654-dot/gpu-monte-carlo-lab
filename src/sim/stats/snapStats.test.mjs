/**
 * snapStats.test.mjs — Node unit tests for the viz2 per-snapshot stats
 * (pure TS half: src/sim/stats/snapStats.ts). Mirrors the style of
 * stats.test.mjs. Run via `npm run test:stats` (bundled with esbuild).
 */
import {
  SNAP_BINS,
  SNAP_HIST_UINTS,
  SNAP_LOG_LO,
  SNAP_LOG_SPAN,
  buildSnapHistCpu,
  extractSnapshotStats,
  snapBinCenterDollars,
  snapBinLogEdge,
} from './snapStats.ts';
import { SNAP_MAX } from '../model/history.ts';

let passed = 0;
let failed = 0;
function ok(cond, name) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL ${name}`);
  }
}
function near(a, b, relTol, name) {
  const rel = Math.abs(a - b) / Math.max(Math.abs(b), 1e-9);
  ok(rel <= relTol, `${name} (got ${a}, want ~${b}, rel ${rel.toFixed(4)})`);
}

// --- layout constants -------------------------------------------------------
ok(SNAP_HIST_UINTS === SNAP_MAX * SNAP_BINS, 'SNAP_HIST_UINTS layout');
near(snapBinLogEdge(SNAP_BINS), SNAP_LOG_LO + SNAP_LOG_SPAN, 1e-12, 'top edge');
ok(
  snapBinCenterDollars(0) > Math.pow(10, SNAP_LOG_LO) &&
    snapBinCenterDollars(SNAP_BINS - 1) < Math.pow(10, SNAP_LOG_LO + SNAP_LOG_SPAN),
  'bin centers inside range',
);

// --- synthetic run: 3 paths × 4 snapshots (SNAP_MAX-padded rows) ------------
// path 0: survives, doubles each snapshot
// path 1: dies after snapshot 1 (zero-filled onward — contract §9)
// path 2: survives flat at 1e6
const snaps = 4;
const history = new Float32Array(3 * SNAP_MAX);
const setH = (p, s, w) => {
  history[p * SNAP_MAX + s] = w;
};
setH(0, 0, 1e6);
setH(0, 1, 2e6);
setH(0, 2, 4e6);
setH(0, 3, 8e6);
setH(1, 0, 1e6);
setH(1, 1, 5e5);
// path 1 slots 2..3 stay 0 (dead)
setH(2, 0, 1e6);
setH(2, 1, 1e6);
setH(2, 2, 1e6);
setH(2, 3, 1e6);

const raw = buildSnapHistCpu(history, 3, snaps);
const stats = extractSnapshotStats({
  raw,
  snapCount: snaps,
  snapStrideMonths: 12,
  horizonMonths: 36,
  now: () => 1234567,
});

ok(stats !== null, 'extract returns stats');
ok(stats.totalPaths === 3, 'totalPaths = 3 (all alive at snapshot 0)');
ok(stats.computedAt === 1234567, 'now() override stamped');
ok(stats.snapCount === 4 && stats.snapStrideMonths === 12, 'grid metadata');

// cumulative failure: 0, 0, 1/3, 1/3
near(stats.cumFailure[0], 0, 1e-9, 'cumFailure s0');
near(stats.cumFailure[2], 1 / 3, 1e-6, 'cumFailure s2 (path 1 dead)');
near(stats.cumFailure[3], 1 / 3, 1e-6, 'cumFailure s3');

// median at s0: all three at 1e6 → p50 ≈ 1e6 (log-bin interpolation tol)
near(stats.quantiles[0 * 5 + 2], 1e6, 0.08, 'p50 at s0 ≈ $1M');
// s1: survivors {2e6, 5e5, 1e6} → p50 = 1e6
near(stats.quantiles[1 * 5 + 2], 1e6, 0.08, 'p50 at s1 ≈ $1M');
// s1 p5: lowest survivor 5e5
near(stats.quantiles[1 * 5 + 0], 5e5, 0.12, 'p5 at s1 ≈ $500K');
// s3: survivors {8e6, 1e6} → p50 between, p95 near 8e6
near(stats.quantiles[3 * 5 + 4], 8e6, 0.12, 'p95 at s3 ≈ $8M');

// --- empty buffer → null ----------------------------------------------------
ok(
  extractSnapshotStats({
    raw: new Uint32Array(SNAP_HIST_UINTS),
    snapCount: snaps,
    snapStrideMonths: 12,
    horizonMonths: 36,
  }) === null,
  'pristine buffer → null',
);

// --- snapCount cap at SNAP_MAX ----------------------------------------------
{
  const s2 = extractSnapshotStats({
    raw,
    snapCount: 99,
    snapStrideMonths: 12,
    horizonMonths: 36,
  });
  ok(s2.snapCount === SNAP_MAX, 'snapCount capped at SNAP_MAX');
}

// --- lognormal-ish distribution sanity: 10k paths, median drift -------------
{
  const n = 10_000;
  const s5 = 5;
  const hist2 = new Float32Array(n * SNAP_MAX);
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  const gauss = () => (rand() + rand() + rand() + rand() - 2) / 0.577; // ~N(0,1)
  for (let i = 0; i < n; i++) {
    let lw = 6; // log10(1e6)
    for (let s = 0; s < s5; s++) {
      lw += s === 0 ? 0 : 0.02 + 0.06 * gauss();
      hist2[i * SNAP_MAX + s] = Math.pow(10, lw);
    }
  }
  const raw2 = buildSnapHistCpu(hist2, n, s5);
  const st = extractSnapshotStats({
    raw: raw2,
    snapCount: s5,
    snapStrideMonths: 12,
    horizonMonths: 48,
  });
  ok(st.totalPaths === n, 'lognormal: all paths alive');
  // Expected median at s4: 10^(6 + 4×0.02) ≈ 1.202e6
  near(st.quantiles[4 * 5 + 2], Math.pow(10, 6.08), 0.05, 'lognormal p50 ≈ drifted median');
  // p95−p5 spread ≈ 2×1.645×σ, σ = 0.06×√4 = 0.12 decades → ≈ 0.395 decades
  const spread = Math.log10(st.quantiles[4 * 5 + 4] / st.quantiles[4 * 5 + 0]);
  ok(spread > 0.3 && spread < 0.55, `lognormal spread sane (got ${spread.toFixed(3)} decades)`);
}

console.log(`snapStats: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
