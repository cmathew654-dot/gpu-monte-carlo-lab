/**
 * snapStats.ts — per-snapshot distribution extraction (viz2: year-cursor
 * cross-section + percentile guide lines). Mirrors the split in
 * histogram.tsl.ts / cpuReference.ts: THIS file is the pure TS half
 * (no DOM, no three imports — runs in Node for unit tests);
 * snapHistogram.tsl.ts is the GPU half and shares the layout constants
 * below (single source of truth for BOTH sides).
 *
 * DESIGN (vs Agent 3's terminal stats):
 *   - One histogram PER pathHistory SNAPSHOT (not just terminal wealth), so
 *     the cone's time axis carries a distribution at every year.
 *   - FIXED log10 range [SNAP_LOG_LO, SNAP_LOG_LO + SNAP_LOG_SPAN] instead
 *     of the terminal pass's dynamic [min,max]: the cross-section bars and
 *     the guide lines must be temporally COMPARABLE (a fixed world-Y maps
 *     to a fixed $ at every year), and the world-Y mapping is absolute
 *     (log10(w) − log10(initialWealth)) × Y_SCALE. A per-snapshot dynamic
 *     range would make the same bar mean different dollars at different
 *     years. 96 bins over 5.5 decades ≈ 14 % relative per bin; guide
 *     quantiles use log-space in-bin interpolation (≈ ±2 % — ample for
 *     visual threads; the gated ±1/±2 % SimStats tolerances still come
 *     from Agent 3's 256-bin dynamic-range terminal pass, untouched).
 *   - SURVIVOR semantics: paths with wealth ≤ 0 at a snapshot (dead —
 *     history is zero-filled from the failure slot onward, contract §9)
 *     are EXCLUDED from the histogram row. Quantiles are therefore
 *     conditional on survival (the cone an advisor points at), and the
 *     ruin story is told by the shrinking row sum → cumFailure and by the
 *     ember field. Documented viz2 choice.
 *
 * Readback cost (param-change-only, §1.4/§2.5 compliant): SNAP_MAX ×
 * SNAP_BINS uints = 32 × 96 × 4 B = 12,288 B — one tiny buffer alongside
 * Agent 3's 3.9 kB stats readback, triggered by the same completion.
 */
import type { SnapshotStats } from '../../store/simStore';
import { SNAP_MAX } from '../model/history';

// ---------------------------------------------------------------------------
// Layout constants — MUST match snapHistogram.tsl.ts (single source of truth).
// ---------------------------------------------------------------------------

/** Per-snapshot wealth histogram resolution. */
export const SNAP_BINS = 96;
/** Fixed log10($) range: $1,000 → ~$316M (covers every plausible run). */
export const SNAP_LOG_LO = 3.0;
export const SNAP_LOG_SPAN = 5.5;
/** Wealth strictly above this counts as alive ($1 — dead paths read 0). */
export const SNAP_ALIVE_FLOOR = 1.0;
/** Packed buffer size in uints: SNAP_MAX rows × SNAP_BINS. */
export const SNAP_HIST_UINTS = SNAP_MAX * SNAP_BINS; // 3072 (12,288 B)

/** The five guide-line/cross-section quantile levels (frozen order). */
export const SNAP_QUANTILE_LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95] as const;

/** Bin b's log10($) lower edge; bin width is uniform in log space. */
export function snapBinLogEdge(b: number): number {
  return SNAP_LOG_LO + (b / SNAP_BINS) * SNAP_LOG_SPAN;
}

/** Bin b's geometric-mean center in absolute $ (cross-section bar Y). */
export function snapBinCenterDollars(b: number): number {
  return Math.pow(10, snapBinLogEdge(b) + SNAP_LOG_SPAN / SNAP_BINS / 2);
}

// ---------------------------------------------------------------------------
// Decode + extract
// ---------------------------------------------------------------------------

export interface SnapExtractInput {
  /** Raw uint32 readback of snapHistBuffer (≥ SNAP_HIST_UINTS). */
  raw: Uint32Array;
  /** uSnapCount for the run these histograms were built from. */
  snapCount: number;
  /** uSnapStride for the run (months between snapshots). */
  snapStrideMonths: number;
  /** horizonYears × 12 for the run. */
  horizonMonths: number;
  /** Clock override for deterministic computedAt in tests. */
  now?: () => number;
}

/**
 * Extract survivor quantiles + cumulative failure from the raw per-snapshot
 * histogram readback. Returns null for a pristine/empty buffer (no active
 * paths — callers treat as "snapshot stats unavailable").
 *
 * Quantile convention: log-space in-bin interpolation (same as Agent 3's
 * wealth histogram; locally linear CDF in log wealth). A bin's quantile
 * position is linearly interpolated across the bin's log width.
 */
export function extractSnapshotStats(input: SnapExtractInput): SnapshotStats | null {
  const { raw, snapCount, snapStrideMonths, horizonMonths } = input;
  if (raw.length < SNAP_HIST_UINTS) {
    throw new Error(
      `extractSnapshotStats: expected ≥${SNAP_HIST_UINTS} uints, got ${raw.length}`,
    );
  }
  const snaps = Math.min(Math.max(1, snapCount), SNAP_MAX);
  const hist = raw.slice(0, snaps * SNAP_BINS);

  const quantiles = new Float32Array(snaps * SNAP_QUANTILE_LEVELS.length);
  const cumFailure = new Float32Array(snaps);

  const rowSum = (s: number): number => {
    let n = 0;
    const base = s * SNAP_BINS;
    for (let b = 0; b < SNAP_BINS; b++) n += hist[base + b];
    return n;
  };

  const totalPaths = rowSum(0);
  if (totalPaths <= 0) return null; // pristine — reduce never ran

  const binWidth = SNAP_LOG_SPAN / SNAP_BINS;
  for (let s = 0; s < snaps; s++) {
    const base = s * SNAP_BINS;
    const n = rowSum(s);
    cumFailure[s] = 1 - n / totalPaths;
    if (n <= 0) continue; // quantiles stay 0 — renderers skip the snapshot

    for (let q = 0; q < SNAP_QUANTILE_LEVELS.length; q++) {
      const target = SNAP_QUANTILE_LEVELS[q] * n;
      let acc = 0;
      let logPos = SNAP_LOG_LO; // fallback: range floor
      for (let b = 0; b < SNAP_BINS; b++) {
        const c = hist[base + b];
        if (acc + c > target) {
          const frac = c > 0 ? (target - acc) / c : 0;
          logPos = snapBinLogEdge(b) + frac * binWidth;
          break;
        }
        acc += c;
        if (b === SNAP_BINS - 1) logPos = SNAP_LOG_LO + SNAP_LOG_SPAN;
      }
      quantiles[s * SNAP_QUANTILE_LEVELS.length + q] = Math.pow(10, logPos);
    }
  }

  return {
    snapCount: snaps,
    snapStrideMonths,
    horizonMonths,
    totalPaths,
    hist,
    quantiles,
    cumFailure,
    computedAt: input.now ? input.now() : Date.now(),
  };
}

// ---------------------------------------------------------------------------
// CPU-side builder (Node tests + standing reference; mirrors the GPU pass —
// same contract §9 history semantics: dead paths read 0 and are excluded).
// ---------------------------------------------------------------------------

/**
 * Build the packed per-snapshot histogram on the CPU from a padded
 * pathHistory array (path-major, SNAP_MAX slots per path — the GPU layout).
 * `pathCount` is the ACTIVE count; slots ≥ snapCount are ignored.
 */
export function buildSnapHistCpu(
  history: Float32Array,
  pathCount: number,
  snapCount: number,
): Uint32Array {
  const out = new Uint32Array(SNAP_HIST_UINTS);
  const snaps = Math.min(snapCount, SNAP_MAX);
  for (let i = 0; i < pathCount; i++) {
    const rowBase = i * SNAP_MAX;
    for (let s = 0; s < snaps; s++) {
      const w = history[rowBase + s];
      if (!(w > SNAP_ALIVE_FLOOR)) continue; // dead / empty slot
      const t = (Math.log10(w) - SNAP_LOG_LO) / SNAP_LOG_SPAN;
      const b = Math.min(SNAP_BINS - 1, Math.max(0, Math.floor(t * SNAP_BINS)));
      out[s * SNAP_BINS + b]++;
    }
  }
  return out;
}
