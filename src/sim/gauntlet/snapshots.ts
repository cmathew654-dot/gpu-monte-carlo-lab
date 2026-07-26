/**
 * snapshots.ts — pure W2-B adapter from monthly historical wealth paths to
 * the frozen horizon-adaptive SNAP_MAX grid. No DOM, three.js, or store
 * imports. The visual layer receives separate failure/exhaustion metadata so
 * running out of historical observations is never rendered as plan failure.
 */
import {
  SNAP_MAX,
  snapCountForSteps,
  snapStrideForSteps,
} from '../model/history';
import type { GauntletResult, ReplayResult } from './engine';

export const TRAIL_END_HORIZON = 0;
export const TRAIL_END_FAILED = 1;
export const TRAIL_END_EXHAUSTED = 2;

export type GauntletTrailEndState =
  | typeof TRAIL_END_HORIZON
  | typeof TRAIL_END_FAILED
  | typeof TRAIL_END_EXHAUSTED;

export interface SampledReplayTrail {
  /** SNAP_MAX-padded real wealth samples. */
  wealth: Float32Array;
  /** Number of meaningful points, including the initial point and endpoint. */
  validCount: number;
  /** Last meaningful point in wealth. */
  endSlot: number;
  /** Horizon completion, plan failure, or historical-data exhaustion. */
  endState: GauntletTrailEndState;
  /** Months between regular samples. */
  snapStrideMonths: number;
  /** Points rendered for a full-horizon cohort, including a partial terminal. */
  spritesPerCohort: number;
}

export interface GauntletTrailSamples {
  /** Cohort-major [cohort × SNAP_MAX] real wealth. */
  wealth: Float32Array;
  /** Per-cohort count of meaningful wealth points. */
  validCounts: Uint32Array;
  /** Per-cohort last meaningful slot. */
  endSlots: Uint32Array;
  /** Per-cohort GauntletTrailEndState. */
  endStates: Uint32Array;
  cohortCount: number;
  horizonMonths: number;
  snapStrideMonths: number;
  spritesPerCohort: number;
}

function endStateFor(replay: ReplayResult): GauntletTrailEndState {
  if (replay.failed) return TRAIL_END_FAILED;
  if (replay.exhaustedData) return TRAIL_END_EXHAUSTED;
  return TRAIL_END_HORIZON;
}

/**
 * Sample one replay. Regular slots land at month s × stride. A failure or
 * data-exhaustion inside a partial period receives one exact terminal slot.
 */
export function sampleReplayForTrail(
  replay: ReplayResult,
  horizonYears: number,
): SampledReplayTrail {
  const horizonMonths = Math.round(horizonYears * 12);
  const snapStrideMonths = snapStrideForSteps(horizonMonths);
  const gridCount = snapCountForSteps(horizonMonths, snapStrideMonths);
  const spritesPerCohort =
    gridCount + (horizonMonths % snapStrideMonths === 0 ? 0 : 1);
  const endState = endStateFor(replay);
  const endMonth =
    endState === TRAIL_END_HORIZON
      ? horizonMonths
      : Math.min(replay.monthsSimulated, horizonMonths);
  const endSlot = Math.min(
    Math.ceil(endMonth / snapStrideMonths),
    spritesPerCohort - 1,
  );
  const wealth = new Float32Array(SNAP_MAX);
  const lastPathMonth = replay.wealthPath.length - 1;

  for (let slot = 0; slot <= endSlot; slot++) {
    const regularMonth = slot * snapStrideMonths;
    const isEndpoint = slot === endSlot;
    const month =
      isEndpoint && endMonth % snapStrideMonths !== 0
        ? endMonth
        : Math.min(regularMonth, endMonth);
    wealth[slot] = replay.wealthPath[Math.min(month, lastPathMonth)] ?? 0;
  }

  return {
    wealth,
    validCount: endSlot + 1,
    endSlot,
    endState,
    snapStrideMonths,
    spritesPerCohort,
  };
}

/** Pack all six cohort samples into small GPU-ready typed arrays. */
export function sampleGauntletTrails(
  result: GauntletResult,
): GauntletTrailSamples {
  const cohortCount = result.cohorts.length;
  const wealth = new Float32Array(cohortCount * SNAP_MAX);
  const validCounts = new Uint32Array(cohortCount);
  const endSlots = new Uint32Array(cohortCount);
  const endStates = new Uint32Array(cohortCount);
  let snapStrideMonths = 12;
  let spritesPerCohort = 1;

  result.cohorts.forEach((cohort, index) => {
    const sampled = sampleReplayForTrail(cohort, result.params.horizonYears);
    wealth.set(sampled.wealth, index * SNAP_MAX);
    validCounts[index] = sampled.validCount;
    endSlots[index] = sampled.endSlot;
    endStates[index] = sampled.endState;
    snapStrideMonths = sampled.snapStrideMonths;
    spritesPerCohort = sampled.spritesPerCohort;
  });

  return {
    wealth,
    validCounts,
    endSlots,
    endStates,
    cohortCount,
    horizonMonths: Math.round(result.params.horizonYears * 12),
    snapStrideMonths,
    spritesPerCohort,
  };
}
