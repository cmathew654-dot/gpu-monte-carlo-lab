/**
 * cpuReference.ts — CPU-side quantile extraction from the GPU stats
 * histograms (spec §4.3 task 4, §2.5) + the pure CPU histogram builder used
 * for (a) Node tests and (b) the documented §2.5 fallback if atomic
 * histograms were ever unavailable. SINGLE OWNER: Agent 3.
 *
 * PURE TS: no DOM, no three imports — runs in Node for unit tests.
 *
 * Histogram design (shared with histogram.tsl.ts — the layout constants
 * below are the single source of truth for BOTH sides):
 *
 *   - Terminal wealth: WEALTH_BINS log-spaced bins over the DYNAMIC range
 *     [minWealth, maxWealth] observed on the current run (min/max reduced
 *     on GPU via atomicMin/atomicMax on the float bits — order-preserving
 *     for non-negative floats). Dynamic range keeps the 256-bin resolution
 *     tight around the actual distribution, which is what makes the §2.6
 *     tolerances (median ±1%, p5/p95 ±2% vs the exact CPU reference)
 *     achievable with only 256 bins.
 *   - Max drawdown: DD_BINS linear bins over [0, 1].
 *   - Failure step: FAIL_BINS = STEPS_MAX one-bin-per-month histogram over
 *     (pathFailed − 1); its sum is the failure count and the failed-counter
 *     slot cross-checks it.
 *
 * Quantile convention: within-bin interpolation — LOG-space for the wealth
 * histogram (locally linear CDF in log wealth; for a lognormal terminal
 * distribution this is nearly exact at 256 bins), LINEAR for drawdown and
 * failure-step bins. Bin 0 of the wealth histogram additionally contains
 * all wealth below the log floor WEALTH_LOG_FLOOR ($1) — including every
 * failed path clamped to 0 — so bin 0 interpolates linearly between the
 * TRUE observed minimum and the first log edge (documented in §2.5;
 * matters when p5 lands in a failure-heavy bin 0).
 */
import type { MagnitudeStats, SimStats } from '../../store/simStore';

// ---------------------------------------------------------------------------
// Layout constants — MUST match histogram.tsl.ts (single source of truth).
// ---------------------------------------------------------------------------

/** Terminal-wealth histogram resolution (spec §2.5: 256 log-spaced bins). */
export const WEALTH_BINS = 256;
/** Max-drawdown histogram resolution (linear bins over [0, 1]). */
export const DD_BINS = 256;
/** Max simulated months (spec §2.1: 40y × 12) — failure-step histogram size. */
export const STEPS_MAX = 480;
export const FAIL_BINS = STEPS_MAX;

/** Slot indices inside the single packed uint32 stats buffer. */
export const SLOT_MIN_WEALTH_BITS = 0;
export const SLOT_MAX_WEALTH_BITS = 1;
export const SLOT_FAILED_COUNT = 2;
export const SLOT_WEALTH_HIST = 3;
export const SLOT_DD_HIST = SLOT_WEALTH_HIST + WEALTH_BINS; // 259
export const SLOT_FAIL_HIST = SLOT_DD_HIST + DD_BINS; // 515
export const STATS_UINTS = SLOT_FAIL_HIST + FAIL_BINS; // 995 (≈ 3.9 kB readback)

/**
 * Log-space floor for the wealth histogram ($1). Wealth below the floor
 * (including failed paths clamped to $0) accumulates in bin 0; the CPU
 * extractor interpolates bin 0 linearly from the true observed minimum.
 */
export const WEALTH_LOG_FLOOR = 1.0;

/** Value the GPU clear pass writes into the min slot (atomicMin identity). */
export const MIN_SLOT_EMPTY = 0xffffffff;

// ---------------------------------------------------------------------------
// Decoded histogram payload
// ---------------------------------------------------------------------------

export interface StatsHistogramData {
  /** Number of active paths that built these histograms (= uActiveN). */
  totalPaths: number;
  /** True observed terminal-wealth range (min may be 0; max ≥ min). */
  minWealth: number;
  maxWealth: number;
  /** GPU atomic failure counter (== sum of failStepHist; cross-checked). */
  failedCount: number;
  wealthHist: Uint32Array; // WEALTH_BINS
  ddHist: Uint32Array; // DD_BINS
  failStepHist: Uint32Array; // FAIL_BINS (bin b = failure at month b)
}

const f32bits = new Float32Array(1);
const u32bits = new Uint32Array(f32bits.buffer);

function bitsToFloat(bits: number): number {
  u32bits[0] = bits >>> 0;
  return f32bits[0];
}

function floatToBits(value: number): number {
  f32bits[0] = Math.fround(value);
  return u32bits[0];
}

// ---------------------------------------------------------------------------
// Decode the packed stats readback (GPU → CPU)
// ---------------------------------------------------------------------------

/**
 * Decode the raw uint32 readback of the packed stats buffer.
 * Returns null when the buffer is empty/pristine (reduce pass never ran,
 * e.g. uActiveN = 0) — callers treat that as "stats unavailable".
 */
export function decodeStatsBuffer(raw: Uint32Array): StatsHistogramData | null {
  if (raw.length < STATS_UINTS) {
    throw new Error(`decodeStatsBuffer: expected ≥${STATS_UINTS} uints, got ${raw.length}`);
  }
  const minBits = raw[SLOT_MIN_WEALTH_BITS] >>> 0;
  if (minBits === MIN_SLOT_EMPTY) return null; // pristine — no paths reduced

  const wealthHist = raw.slice(SLOT_WEALTH_HIST, SLOT_WEALTH_HIST + WEALTH_BINS);
  const ddHist = raw.slice(SLOT_DD_HIST, SLOT_DD_HIST + DD_BINS);
  const failStepHist = raw.slice(SLOT_FAIL_HIST, SLOT_FAIL_HIST + FAIL_BINS);

  let totalPaths = 0;
  for (let b = 0; b < WEALTH_BINS; b++) totalPaths += wealthHist[b];

  return {
    totalPaths,
    minWealth: bitsToFloat(minBits),
    maxWealth: bitsToFloat(raw[SLOT_MAX_WEALTH_BITS] >>> 0),
    failedCount: raw[SLOT_FAILED_COUNT] >>> 0,
    wealthHist,
    ddHist,
    failStepHist,
  };
}

// ---------------------------------------------------------------------------
// Generic histogram quantile (pure — the Node-testable core)
// ---------------------------------------------------------------------------

/**
 * Extract a quantile from a histogram. `edgeLeft(b)` returns the LEFT edge
 * of bin b; `edgeRight(b)` the RIGHT edge; interpolation within the bin is
 * linear between those edges in whatever space the edges are expressed in
 * (callers pass log-space edges for the wealth histogram, see below).
 *
 * Convention: cumulative-count crossing at target = p·N (first bin whose
 * right-cumulative ≥ target), linear in-bin fraction. Close to the type-7
 * convention of the exact CPU reference within half a bin width — covered
 * by the §2.6 tolerances.
 */
export function quantileFromHistogram(
  hist: ArrayLike<number>,
  totalCount: number,
  p: number,
  edgeLeft: (bin: number) => number,
  edgeRight: (bin: number) => number,
): number {
  const bins = hist.length;
  if (totalCount <= 0) return NaN;
  const target = Math.min(Math.max(p, 0), 1) * totalCount;

  let cum = 0;
  for (let b = 0; b < bins; b++) {
    const count = hist[b];
    if (count > 0 && cum + count >= Math.max(target, 1e-9)) {
      const frac = Math.min(Math.max((target - cum) / count, 0), 1);
      return edgeLeft(b) + frac * (edgeRight(b) - edgeLeft(b));
    }
    cum += count;
  }
  // Numerical tail: return the right edge of the last non-empty bin.
  for (let b = bins - 1; b >= 0; b--) {
    if (hist[b] > 0) return edgeRight(b);
  }
  return NaN;
}

/** Sum a histogram (Uint32Array-safe, no overflow below 2^53). */
export function histogramSum(hist: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < hist.length; i++) s += hist[i];
  return s;
}

/**
 * AMENDMENT A3 (docs/CONTRACTS.md §10): `worstDecileMaxDD` is the
 * CONDITIONAL MEAN of the worst decile of per-path max drawdowns (mean of
 * the deepest 10 %), NOT the 10th percentile of the ascending sort. The
 * pre-A3 quantile(hist, 0.1) returned the SHALLOWEST decile boundary —
 * e.g. 41.5 % where the median path's max drawdown was 100 %.
 *
 * Histogram version of cpuSim's `worstDecileTailMean`: takes the same
 * decile mass (max(1, floor(N/10))) from the TOP of the DD histogram.
 * Full bins contribute their midpoint; the partially-taken boundary bin
 * contributes the mean of its TOP fraction (uniform-in-bin assumption:
 * the deepest values in that bin). Agrees with the exact tail mean within
 * half a bin width (1/512), inside the §2.6 tolerances.
 */
export function worstDecileMaxDdFromHistogram(
  ddHist: ArrayLike<number>,
  totalPaths: number,
): number {
  if (totalPaths <= 0) return NaN;
  const need = Math.max(1, Math.floor(totalPaths / 10));
  let taken = 0;
  let sum = 0;
  for (let b = ddHist.length - 1; b >= 0 && taken < need; b--) {
    const count = ddHist[b];
    if (count === 0) continue;
    const take = Math.min(count, need - taken);
    const frac = take / count;
    // Mean of the taken mass: top `frac` of the bin when partial
    // (frac = 1 → the bin midpoint).
    const meanInBin = (b + 1 - frac / 2) / ddHist.length;
    sum += take * meanInBin;
    taken += take;
  }
  return taken > 0 ? sum / taken : NaN;
}

/**
 * AMENDMENT A3 (docs/CONTRACTS_STATS.md §10): magnitude-of-failure
 * metrics from the decoded failure-step histogram — the GPU readback
 * twin of cpuSim's `magnitudeOfFailure`.
 *
 * Both stats are medians of a STRICTLY DECREASING linear transform of the
 * failure month (shortfall = H − f; obligation = w·(H − f)), and medians
 * commute with monotone transforms, so they are computed exactly from the
 * median failure month — no per-path readback needed.
 */
export function extractMagnitudeStats(
  data: Pick<StatsHistogramData, 'failStepHist'>,
  opts: { horizonMonths: number; monthlyWithdrawal: number; now?: () => number },
): MagnitudeStats {
  const now = opts.now ?? Date.now;
  const failTotal = histogramSum(data.failStepHist);
  if (failTotal === 0) {
    return {
      medianShortfallYears: null,
      medianUnfundedObligation: null,
      failedPaths: 0,
      computedAt: now(),
    };
  }
  // Median failure month (linear in-bin interpolation, one-month bins —
  // same convention as extractSimStats' medianFailureYear).
  const medianFailMonth = quantileFromHistogram(
    data.failStepHist,
    failTotal,
    0.5,
    (b) => b,
    (b) => b + 1,
  );
  const shortfallMonths = Math.max(opts.horizonMonths - medianFailMonth, 0);
  return {
    medianShortfallYears: shortfallMonths / 12,
    medianUnfundedObligation: shortfallMonths * opts.monthlyWithdrawal,
    failedPaths: failTotal,
    computedAt: now(),
  };
}

// ---------------------------------------------------------------------------
// Wealth-histogram edges (log space, dynamic range)
// ---------------------------------------------------------------------------

/**
 * Log-space bin edges for the wealth histogram, given the observed range.
 * Returns null for a degenerate range (maxWealth ≤ WEALTH_LOG_FLOOR —
 * every path is at/below the floor, e.g. 100% failure): all quantiles are
 * then the observed minimum.
 *
 * Bin 0 spans [max(minWealth, 0), edge(1)) in VALUE space: the GPU clamps
 * wealth to the floor before binning, so bin 0 gathers both the
 * below-floor mass (failures) and the [floor, edge1) mass. We therefore
 * interpolate bin 0 LINEARLY from the true observed minimum (see header).
 */
export function wealthQuantile(
  data: Pick<
    StatsHistogramData,
    'wealthHist' | 'minWealth' | 'maxWealth' | 'totalPaths' | 'failedCount'
  >,
  p: number,
): number {
  const { wealthHist, minWealth, maxWealth, totalPaths, failedCount } = data;
  if (totalPaths <= 0) return NaN;

  const target = Math.min(Math.max(p, 0), 1) * totalPaths;

  const lo = Math.max(minWealth, WEALTH_LOG_FLOOR);
  const hi = Math.max(maxWealth, WEALTH_LOG_FLOOR * (1 + 1e-6));
  if (!(hi > lo)) {
    // Degenerate: ALL mass at/below the log floor (e.g. near-total failure).
    // Interpolate linearly across [minWealth, maxWealth], honoring the
    // exact-zero mass first.
    const zeros = Math.min(failedCount, totalPaths);
    if (target <= zeros) return minWealth;
    const rest = totalPaths - zeros;
    const frac = rest > 0 ? Math.min(Math.max((target - zeros) / rest, 0), 1) : 0;
    return minWealth + frac * (maxWealth - minWealth);
  }
  const logLo = Math.log(lo);
  const logHi = Math.log(hi);
  const step = (logHi - logLo) / WEALTH_BINS;

  return interpolateWealthBin(wealthHist, totalPaths, p, minWealth, logLo, step, failedCount);
}

/**
 * Internal: wealth quantile with bin-0 special case (see header). Bin 0
 * contains `failedCount` EXACT zeros (failed paths are clamped to $0 by the
 * kernel) plus the sub-floor/lower-edge mass. When the quantile target
 * falls inside the zero mass the answer is exactly the observed minimum —
 * a uniform-in-bin smear would wrongly lift p5/p25 off $0 in failure-heavy
 * runs (this is what keeps parity with the exact CPU reference).
 */
function interpolateWealthBin(
  hist: ArrayLike<number>,
  totalCount: number,
  p: number,
  minWealth: number,
  logLo: number,
  step: number,
  failedCount: number,
): number {
  const bins = hist.length;
  const target = Math.min(Math.max(p, 0), 1) * totalCount;
  let cum = 0;
  for (let b = 0; b < bins; b++) {
    const count = hist[b];
    if (count > 0 && cum + count >= Math.max(target, 1e-9)) {
      if (b === 0 && minWealth < WEALTH_LOG_FLOOR) {
        const edge1 = Math.exp(logLo + step);
        const zeros = Math.min(failedCount, count);
        if (target <= zeros) return minWealth;
        const rest = count - zeros;
        const frac = rest > 0 ? Math.min(Math.max((target - zeros) / rest, 0), 1) : 0;
        return minWealth + frac * (edge1 - minWealth);
      }
      const frac = Math.min(Math.max((target - cum) / count, 0), 1);
      return Math.exp(logLo + (b + frac) * step);
    }
    cum += count;
  }
  for (let b = bins - 1; b >= 0; b--) {
    if (hist[b] > 0) return Math.exp(logLo + (b + 1) * step);
  }
  return NaN;
}

// ---------------------------------------------------------------------------
// SimStats assembly (spec §2.5 table)
// ---------------------------------------------------------------------------

export interface ExtractStatsOptions {
  /** Clock override for deterministic computedAt in tests. */
  now?: () => number;
}

/**
 * Turn decoded histograms into the frozen SimStats shape.
 * `safeWithdrawalRate` is set to 0 here — it is the binary-SEARCH layer's
 * output (safeWithdrawal.ts); recomputeStats fills it when requested.
 */
export function extractSimStats(
  data: StatsHistogramData,
  options: ExtractStatsOptions = {},
): SimStats {
  const { totalPaths, failedCount, ddHist, failStepHist } = data;
  const now = options.now ?? Date.now;

  if (totalPaths <= 0) {
    return {
      successRate: 0,
      percentiles: { p5: NaN, p25: NaN, p50: NaN, p75: NaN, p95: NaN },
      worstDecileMaxDD: NaN,
      safeWithdrawalRate: 0,
      medianFailureYear: null,
      computedAt: now(),
    };
  }

  const successRate = 1 - failedCount / totalPaths;

  const percentiles = {
    p5: wealthQuantile(data, 0.05),
    p25: wealthQuantile(data, 0.25),
    p50: wealthQuantile(data, 0.5),
    p75: wealthQuantile(data, 0.75),
    p95: wealthQuantile(data, 0.95),
  };

  // AMENDMENT A3: worst-decile max drawdown = CONDITIONAL MEAN of the
  // deepest decile over ALL active paths (matches runCpuSim's
  // worstDecileTailMean within half a bin; pre-A3 this was the 10th
  // percentile of the ascending sort — the SHALLOWEST decile boundary).
  const worstDecileMaxDD = worstDecileMaxDdFromHistogram(ddHist, totalPaths);

  // Median failure year over FAILED paths only (null when none failed).
  const failTotal = histogramSum(failStepHist);
  const medianFailureYear =
    failTotal === 0
      ? null
      : quantileFromHistogram(
          failStepHist,
          failTotal,
          0.5,
          (b) => b / 12,
          (b) => (b + 1) / 12,
        );

  return {
    successRate,
    percentiles,
    worstDecileMaxDD,
    safeWithdrawalRate: 0,
    medianFailureYear,
    computedAt: now(),
  };
}

// ---------------------------------------------------------------------------
// CPU histogram builder — §2.5 documented fallback + Node-test fixture.
// Mirrors the GPU passes in histogram.tsl.ts bin-for-bin so the same
// extractor can be validated against exact quantiles without a GPU.
// ---------------------------------------------------------------------------

/**
 * Build the packed histogram payload from per-path arrays (e.g. runCpuSim's
 * output). `failureStep` uses the cpuSim convention (−1 = never failed).
 * Binning is IDENTICAL to the GPU passes: dynamic log range over the
 * observed wealth, floor clamp at WEALTH_LOG_FLOOR, linear DD bins.
 */
export function buildHistogramsFromPaths(
  terminalWealth: ArrayLike<number>,
  maxDrawdown: ArrayLike<number>,
  failureStep: ArrayLike<number>,
): StatsHistogramData {
  const n = terminalWealth.length;

  let minWealth = Infinity;
  let maxWealth = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.max(terminalWealth[i], 0);
    if (w < minWealth) minWealth = w;
    if (w > maxWealth) maxWealth = w;
  }
  if (n === 0) minWealth = 0;

  const wealthHist = new Uint32Array(WEALTH_BINS);
  const lo = Math.max(minWealth, WEALTH_LOG_FLOOR);
  const hi = Math.max(maxWealth, WEALTH_LOG_FLOOR * (1 + 1e-6));
  const logLo = Math.log(lo);
  const logRange = Math.log(hi) - logLo;
  for (let i = 0; i < n; i++) {
    const w = Math.max(terminalWealth[i], 0);
    const lw = Math.log(Math.max(w, lo));
    let bin = Math.floor(((lw - logLo) / logRange) * WEALTH_BINS);
    if (bin < 0) bin = 0;
    if (bin > WEALTH_BINS - 1) bin = WEALTH_BINS - 1;
    wealthHist[bin]++;
  }

  const ddHist = new Uint32Array(DD_BINS);
  for (let i = 0; i < n; i++) {
    let bin = Math.floor(maxDrawdown[i] * DD_BINS);
    if (bin > DD_BINS - 1) bin = DD_BINS - 1;
    if (bin < 0) bin = 0;
    ddHist[bin]++;
  }

  const failStepHist = new Uint32Array(FAIL_BINS);
  let failedCount = 0;
  for (let i = 0; i < n; i++) {
    const s = failureStep[i];
    if (s >= 0) {
      failedCount++;
      failStepHist[Math.min(s, FAIL_BINS - 1)]++;
    }
  }

  return {
    totalPaths: n,
    minWealth,
    maxWealth,
    failedCount,
    wealthHist,
    ddHist,
    failStepHist,
  };
}

/** Re-export for tests that validate GPU-slot packing (float→bits round trip). */
export const _internals = { bitsToFloat, floatToBits };
