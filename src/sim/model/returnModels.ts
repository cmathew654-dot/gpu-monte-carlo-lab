/**
 * returnModels.ts — return-model math shared by the GPU kernel and the CPU
 * fallback (spec §2.2). Pure TS, no DOM/three imports: safe for Node and
 * Web Workers. SINGLE OWNER: Agent 2 (spec §1.5 arbitration).
 *
 * The TSL kernel (src/sim/kernels/stepPaths.tsl.ts) mirrors these formulas
 * operation-for-operation; keep them in lockstep.
 */

/** Monthly time step (spec §2.2: Δt = 1/12). */
export const DT = 1 / 12;

/** sqrt(Δt) precomputed. */
export const SQRT_DT = Math.sqrt(DT);

/** Months per block-bootstrap block (spec §2.2: L = 12). */
export const BLOCK_LENGTH = 12;

/**
 * Model ids used by the `uModel` uint uniform and the CPU fallback.
 * FROZEN — do not reorder.
 */
export const MODEL_GBM = 0;
export const MODEL_BOOTSTRAP = 1;
export const MODEL_FATTAIL = 2;

export type SimModel = 'gbm' | 'bootstrap' | 'fattail';

export const MODEL_IDS: Record<SimModel, number> = {
  gbm: MODEL_GBM,
  bootstrap: MODEL_BOOTSTRAP,
  fattail: MODEL_FATTAIL,
};

/**
 * Model A/C monthly LOG-return (spec §2.2, verbatim):
 *   r_t = (μ − σ²/2)·Δt + σ·√Δt·Z
 * `innovation` is N(0,1) for Model A, unit-variance Student-t(5) for Model C.
 *
 * Application: wealth *= exp(r_t) — r_t is a log-return per §2.2, and only
 * exp() application reproduces the §2.6 closed-form lognormal moments
 * (applying (1+r) would silently subtract σ²T/2 from E[ln W_T] and fail
 * §2.6 by >2%). Model B returns are SIMPLE historical returns and apply as
 * (1+r). See docs/CONTRACTS.md §3.
 */
export function gbmMonthlyReturn(mu: number, sigma: number, innovation: number): number {
  return (mu - 0.5 * sigma * sigma) * DT + sigma * SQRT_DT * innovation;
}

/**
 * Real annual arithmetic return of the non-equity (bond) sleeve used by the
 * AMENDMENT A3 glidepath blend: 1.9 %, the measured 10-yr US Treasury real
 * arithmetic mean (1.89 %) on the shipped Shiller dataset 1926-01..2026-06
 * (docs/calibration.md §1). Used by Models A/C as
 * μ_blend = A·μ + (1−A)·BOND_MU_REAL with σ_blend = A·σ (bond volatility is
 * folded conservatively: the non-equity sleeve contributes no extra vol
 * term — see calibration.md §2 "Blend behavior").
 */
export const BOND_MU_REAL = 0.019;

/**
 * Optional glidepath (spec §2.3): equity allocation declines linearly from
 * `start` at t=0 to `end` at retirement, then stays constant at `end` for
 * the whole retirement phase (the time fraction clamps at 1).
 *
 * AMENDMENT A3 semantics (docs/CONTRACTS.md §10) — the non-equity fraction
 * is a BOND sleeve, not zero-return cash:
 *   - Models A/C: μ_eff = A·μ + (1−A)·BOND_MU_REAL, σ_eff = A·σ.
 *   - Model B: the month's gross is the month-aligned equity/bond mix of the
 *     SAME drawn block: g = 1 + A·r_equity + (1−A)·r_bond, with r_bond from
 *     the `bondBlocks` buffer (10-yr Treasury real TR, same month windows).
 * A(t) = 1 (glidepath null) reduces both to pure equity — unchanged legacy
 * behavior.
 *
 * @returns equity allocation A(t) ∈ [0, 1]-ish (unclamped inputs clamped
 * by callers' slider ranges; we clamp the TIME fraction only).
 */
export function glidepathMix(
  step: number,
  retireStep: number,
  start: number,
  end: number,
): number {
  const frac = Math.min(Math.max(step / Math.max(retireStep, 1), 0), 1);
  return start * (1 - frac) + end * frac;
}
