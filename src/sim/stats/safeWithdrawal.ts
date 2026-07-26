/**
 * safeWithdrawal.ts — safe-withdrawal-rate binary search (spec §2.5 row 5,
 * §4.3 task 5). SINGLE OWNER: Agent 3.
 *
 * PURE TS: no DOM, no three imports — Node-testable with an injected
 * runner (e.g. wrapping runCpuSim). The GPU wiring lives in
 * recomputeStats.ts.
 *
 * Definition: the maximum monthly withdrawal W (real $) whose simulated
 * success rate is ≥ 90%. Success rate is monotonically non-increasing in
 * W, so binary search converges. Spec guardrails:
 *   - drive runSimulation() at 100k paths (caller's runner does this)
 *   - stop when successRate ∈ [89.5%, 90.5%] (target ± 0.5pp)
 *   - max 8 iterations
 *   - CANCELLABLE: a new parameter change aborts the in-flight search via
 *     AbortSignal; the signal is checked before every iteration AND
 *     forwarded to the runner (runSimulation honors it between dispatches).
 */
import type { SimParams } from '../../store/simStore';

/** Target band from spec §4.3 task 5. */
export const SWR_TARGET = 0.9;
export const SWR_TOLERANCE = 0.005; // accept [89.5%, 90.5%]
export const SWR_MAX_ITERATIONS = 8;
/** Search runs at 100k paths regardless of the display path count (§2.5). */
export const SWR_PATH_COUNT = 100_000;

/**
 * Evaluates the success rate for one candidate monthly withdrawal.
 * Implementations: re-run the sim with `withdrawal` (at SWR_PATH_COUNT
 * paths) and return successRate. MUST reject with an AbortError-named
 * error when `signal` aborts mid-run.
 */
export type SuccessRateRunner = (
  withdrawal: number,
  signal?: AbortSignal,
) => Promise<number>;

export interface SafeWithdrawalOptions {
  signal?: AbortSignal;
  maxIterations?: number; // default SWR_MAX_ITERATIONS (8)
  target?: number; // default 0.90
  tolerance?: number; // default 0.005
  /** Search upper bound ($/mo). Default: upperBoundForParams(params). */
  upperBound?: number;
  /** Called after every evaluated iteration (for progress UI). */
  onIteration?: (info: SafeWithdrawalIteration) => void;
}

export interface SafeWithdrawalIteration {
  iteration: number; // 1-based
  withdrawal: number;
  successRate: number;
  /** Bracket after this iteration. */
  lo: number;
  hi: number;
}

export interface SafeWithdrawalResult {
  /** Monthly withdrawal (real $/mo) achieving ~90% success. */
  withdrawal: number;
  /** Success rate measured at `withdrawal` on the final evaluation. */
  successRate: number;
  iterations: number;
  /** True when the success rate landed inside the target band. */
  converged: boolean;
  /**
   * True when the band could not be bracketed: success rate stayed above
   * the target band even at the upper bound (returned withdrawal is the
   * upper bound — i.e. "≥ this is safe"), or below it at $0 (returned 0).
   */
  unbounded: boolean;
}

function abortError(): Error {
  const e = new Error('safe withdrawal search aborted');
  e.name = 'AbortError';
  return e;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

/**
 * Heuristic upper bound for the search ($/mo): twice the withdrawal that
 * would exactly exhaust the at-retirement nest egg linearly over the
 * retirement phase with zero growth. Always strictly positive.
 */
export function upperBoundForParams(params: SimParams): number {
  const retireMonths = Math.max(1, Math.round((params.horizonYears - params.retireYear) * 12));
  const accumMonths = Math.max(0, Math.round(params.retireYear * 12));
  const nestEgg = Math.max(0, params.initialWealth + params.contribution * accumMonths);
  return Math.max((2 * nestEgg) / retireMonths, 1);
}

/**
 * Binary-search the safe withdrawal rate. Throws AbortError when the
 * signal aborts (checked before every evaluation and forwarded to `run`).
 */
export async function findSafeWithdrawal(
  run: SuccessRateRunner,
  options: SafeWithdrawalOptions = {},
  paramsForBound?: SimParams,
): Promise<SafeWithdrawalResult> {
  const maxIterations = options.maxIterations ?? SWR_MAX_ITERATIONS;
  const target = options.target ?? SWR_TARGET;
  const tolerance = options.tolerance ?? SWR_TOLERANCE;
  const hi0 =
    options.upperBound ??
    (paramsForBound ? upperBoundForParams(paramsForBound) : undefined);
  if (hi0 == null || !(hi0 > 0)) {
    throw new Error('findSafeWithdrawal: provide upperBound or paramsForBound');
  }
  const signal = options.signal;

  let lo = 0;
  let hi = hi0;
  let last: SafeWithdrawalIteration | null = null;

  throwIfAborted(signal);

  // Bracket check: if even the upper bound succeeds above the band, the
  // safe rate is ≥ hi (unbounded on the high side).
  const srHi = await run(hi, signal);
  if (srHi > target + tolerance) {
    return {
      withdrawal: hi,
      successRate: srHi,
      iterations: 0,
      converged: false,
      unbounded: true,
    };
  }
  throwIfAborted(signal);

  // If $0/month already fails the band (pathological params), answer 0.
  const srLo = await run(lo, signal);
  if (srLo < target - tolerance) {
    return {
      withdrawal: 0,
      successRate: srLo,
      iterations: 0,
      converged: false,
      unbounded: true,
    };
  }
  throwIfAborted(signal);

  for (let iter = 1; iter <= maxIterations; iter++) {
    const mid = (lo + hi) / 2;
    const sr = await run(mid, signal);
    last = { iteration: iter, withdrawal: mid, successRate: sr, lo, hi };
    options.onIteration?.(last);

    if (sr >= target - tolerance && sr <= target + tolerance) {
      return {
        withdrawal: mid,
        successRate: sr,
        iterations: iter,
        converged: true,
        unbounded: false,
      };
    }
    if (sr > target) lo = mid; // too safe → can withdraw more
    else hi = mid; // too risky → withdraw less

    throwIfAborted(signal);
  }

  // Budget exhausted: return the bracket midpoint with the last reading.
  return {
    withdrawal: (lo + hi) / 2,
    successRate: last?.successRate ?? NaN,
    iterations: maxIterations,
    converged: false,
    unbounded: false,
  };
}
