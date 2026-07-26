/**
 * withdrawal.ts — cash-flow, failure, and drawdown rules (spec §2.3).
 * Pure TS, no DOM/three imports. SINGLE OWNER: Agent 2.
 *
 * The TSL kernel mirrors `applyMonthlyStep` operation-for-operation; the
 * order below is FROZEN (CPU↔GPU agreement depends on it):
 *
 *   1. draw the month's GROSS wealth multiplier `gross` (model-specific,
 *      see returnModels.ts): exp(r_log) for Models A/C, (1 + r_simple) for
 *      Model B bootstrap
 *   2. wealth := wealth * gross + cashFlow,   cashFlow = +contribution
 *      in accumulation (step < retireStep), −withdrawal in retirement
 *      (contributions/withdrawals land at MONTH END, after growth)
 *   3. retirement phase only: peak := max(peak, wealth);
 *      maxDD := max(maxDD, clamp((peak − wealth)/max(peak, ε), 0, 1))
 *   4. retirement phase only: if wealth < 0 → wealth := 0 (clamp),
 *      failed := step + 1 (absorbing; 0 means "never failed", so the flag
 *      doubles as the failure-step record for the §2.5 histogram)
 *
 * Failed paths are skipped entirely by the kernel's absorbing gate, so
 * their buffers freeze at the clamped state.
 */

/** Drawdown denominator guard (peak is ≥ 0 in practice; avoids div-by-0). */
export const PEAK_EPSILON = 1e-9;

export interface MonthlyStepState {
  wealth: number;
  peak: number;
  maxDD: number;
  /** 0 = active; > 0 = failed at step (value − 1). */
  failed: number;
}

/**
 * Advance one path by one month given the month's GROSS wealth multiplier
 * `gross` (exp(r_log) for Models A/C, 1+r_simple for Model B).
 * Mirrors stepPaths.tsl.ts lines in the kernel's "bookkeeping" section.
 */
export function applyMonthlyStep(
  state: MonthlyStepState,
  gross: number,
  step: number,
  retireStep: number,
  contribution: number,
  withdrawal: number,
): void {
  const retired = step >= retireStep;
  const cashFlow = retired ? -withdrawal : contribution;

  state.wealth = state.wealth * gross + cashFlow;

  if (retired) {
    state.peak = Math.max(state.peak, state.wealth);
    const dd = (state.peak - state.wealth) / Math.max(state.peak, PEAK_EPSILON);
    state.maxDD = Math.max(state.maxDD, Math.min(Math.max(dd, 0), 1));
    if (state.wealth < 0) {
      state.wealth = 0;
      state.failed = step + 1;
    }
  }
}
