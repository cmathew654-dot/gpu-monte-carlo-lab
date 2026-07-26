/**
 * spritePlan.ts — the sprite budget policy (spec §4.4 / ConeParticles
 * header table), extracted verbatim from ConeParticles.tsx so BOTH the
 * sprite pool and TrajectoryLines plan against the same numbers
 * (react-refresh: no non-component exports from component files).
 */
import { snapCountForSteps, snapStrideForSteps } from '../sim/model/history';

// ---------------------------------------------------------------------------
// Sprite budget (see header table)
// ---------------------------------------------------------------------------
/** Hard sprite ceiling (~2M, lead directive). */
const SPRITE_BUDGET = 2_000_000;
/** Minimum points per rendered thread before we subsample PATHS instead. */
const MIN_TRAJ_POINTS = 8;

export interface SpritePlan {
  /** Snapshot decimation: render every d-th snapshot (terminal always kept). */
  decimate: number;
  /** Path subsample stride: render every subset-th path (1 = all paths). */
  subset: number;
  /** Sprites rendered per (kept) path. */
  perPath: number;
  /** Paths rendered. */
  paths: number;
  /** Total live sprites = instanced draw count. */
  total: number;
  /** Points available per path: uSnapCount + terminal slot when capped. */
  snapsTotal: number;
}

/**
 * Budget policy (documented in the header): full trajectories for all paths;
 * if over budget, decimate snapshots but keep ≥ MIN_TRAJ_POINTS per thread;
 * if still over, subsample paths with FULL trajectories.
 *
 * EXPORTED (viz2): TrajectoryLines reuses the exact same plan so its line
 * budget tracks the sprite budget 1:1 (never more total GPU work than ~2×
 * the sprite budget — viz2 mission rule).
 */
// ---------------------------------------------------------------------------
// viz3 alpha normalization (kills the additive white-out)
// ---------------------------------------------------------------------------
/**
 * Sprite count at which the v2.3 per-sprite alphas were tuned (≈ the 10k-path
 * full-trajectory plan). Above it the additive interior saturates into a
 * white mass; below it the cone starves.
 */
export const SPRITE_ALPHA_REFERENCE = 300_000;

/**
 * Density-normalized alpha multiplier:
 *   alphaScale = (SPRITE_ALPHA_REFERENCE / renderedCount)^0.55, clamped
 *   [0.25, 2.0]. Shared by the cone sprites (count = plan.total) and the
 *   trajectory threads (count = linePaths × perPath, the sprite-equivalent
 *   of the rendered line subset) so dots and threads dim/brighten together.
 * EMBERS ARE EXEMPT — they stay loud by design.
 *
 *   10k/30y (310k sprites)  → ≈0.98×  (unchanged, the tuning reference)
 *   10k/10y (110k)          → ≈1.74×  (sparser cone gets BRIGHTER)
 *   100k/30y (1.60M)        → ≈0.40×  (median region stays BLUE)
 *   1M/30y (1.94M)          → ≈0.36×
 */
export function alphaScaleForCount(renderedCount: number): number {
  if (renderedCount <= 0) return 1;
  const s = Math.pow(SPRITE_ALPHA_REFERENCE / renderedCount, 0.55);
  return Math.min(2.0, Math.max(0.25, s));
}

/**
 * viz3: line-vertex budget helpers, shared by TrajectoryLines (pool sizing)
 * and the hero-thread picker (heroPath.ts must pick a path the THREADS
 * actually render — the cone subset multiplied by this stride).
 *
 * three uploads the count-carrier position array with mappedAtCreation, so
 * the line pool is capped by the adapter's maxBufferSize (the v2.1 black
 * screen); line threads sparsify path-wise to fit.
 */
export const LINE_VERT_BUDGET_BYTES = 12_000_000; // 1M verts × 3 × f32
const MAX_BUFFER_FRACTION = 0.25;

/** Max line vertices for an adapter (undefined limit → the safe budget). */
export function maxLineVerts(maxBufferSize?: number): number {
  const limit = maxBufferSize ?? LINE_VERT_BUDGET_BYTES;
  const budget = Math.min(
    LINE_VERT_BUDGET_BYTES,
    Math.floor(limit * MAX_BUFFER_FRACTION),
  );
  return Math.floor(budget / 12); // 3 floats × 4 B per vertex
}

/**
 * v5.3: the mountain client view renders a FRACTION of the budgeted
 * threads — "it doesn't need every single strand". One ascent per route
 * reads as a clean braid; the full 100k reads as noise. Applied ON TOP of
 * the budget stride by MountainTrails/MountainEmbers, and folded into the
 * hero-scan stride (heroPath.ts) so the highlighted thread always exists
 * in the rendered subset.
 */
export const MOUNTAIN_LINE_DENSITY = 3;

/** Whole-thread drop stride that fits `plan`'s line pool into maxVerts. */
export function lineStrideForBudget(plan: SpritePlan, maxVerts: number): number {
  const segsPerPath = Math.max(0, plan.perPath - 1);
  const wantedVerts = plan.paths * segsPerPath * 2;
  return wantedVerts > maxVerts && wantedVerts > 0
    ? Math.ceil(wantedVerts / maxVerts)
    : 1;
}

export function planSprites(pathCount: number, horizonYears: number): SpritePlan {
  const steps = horizonYears * 12;
  // AMENDMENT A2: the decimation stride is horizon-adaptive (12 for
  // horizons ≤ 31y, ceil(steps/31) beyond) — mirror the driver exactly.
  const stride = snapStrideForSteps(steps);
  const snapCount = snapCountForSteps(steps, stride);
  // When the snapshot grid doesn't land exactly on the horizon the terminal
  // value comes from pathWealth (contract §9), adding one terminal slot.
  const snapsTotal = snapCount + (steps % stride !== 0 ? 1 : 0);

  let decimate = 1;
  let subset = 1;
  if (pathCount * snapsTotal > SPRITE_BUDGET) {
    decimate = Math.ceil(
      snapsTotal /
        Math.max(MIN_TRAJ_POINTS, Math.floor(SPRITE_BUDGET / pathCount)),
    );
    decimate = Math.min(decimate, Math.ceil(snapsTotal / MIN_TRAJ_POINTS));
    const perPath = Math.ceil(snapsTotal / decimate);
    if (pathCount * perPath > SPRITE_BUDGET) {
      // Path subsampling: full trajectories of an evenly-strided subset.
      decimate = 1;
      subset = Math.ceil(pathCount / Math.floor(SPRITE_BUDGET / snapsTotal));
    }
  }
  const perPath = Math.ceil(snapsTotal / decimate);
  const paths = subset > 1 ? Math.floor(pathCount / subset) : pathCount;
  return {
    decimate,
    subset,
    perPath,
    paths,
    total: Math.min(paths * perPath, SPRITE_BUDGET),
    snapsTotal,
  };
}
