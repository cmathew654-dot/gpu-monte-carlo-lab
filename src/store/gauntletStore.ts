/**
 * gauntletStore.ts — dedicated W2-B state. This intentionally does not
 * extend simStore: stochastic simulation state and deterministic historical
 * replay remain separate merge surfaces.
 */
import { create } from 'zustand';
import {
  ALL_EQUITY,
  runGauntlet,
  type AllocationSchedule,
  type GauntletResult,
} from '../sim/gauntlet/engine';
import {
  sampleGauntletTrails,
  type GauntletTrailSamples,
} from '../sim/gauntlet/snapshots';
import { glidepathMix } from '../sim/model/returnModels';
import type { SimParams } from './simStore';

export interface GauntletSnapshot {
  result: GauntletResult;
  trails: GauntletTrailSamples;
  /** Timestamp of the committed-parameter computation. */
  computedAt: number;
}

export interface GauntletState {
  snapshot: GauntletSnapshot | null;
  setSnapshot: (snapshot: GauntletSnapshot | null) => void;
}

/** Historical bootstrap semantics: a real equity/bond mix only when the
 * plan explicitly enables a glidepath; otherwise the gauntlet is all equity. */
export function allocationScheduleForParams(
  params: SimParams,
): AllocationSchedule {
  if (params.glidepath === null) return ALL_EQUITY;
  const retireStep = Math.round(params.retireYear * 12);
  const { start, end } = params.glidepath;
  return (step) => glidepathMix(step, retireStep, start, end);
}

/** Pure computation owned by the committed-parameter driver. */
export function computeGauntletSnapshot(
  params: SimParams,
  now: () => number = Date.now,
): GauntletSnapshot {
  const result = runGauntlet(params, {
    allocationAt: allocationScheduleForParams(params),
  });
  return {
    result,
    trails: sampleGauntletTrails(result),
    computedAt: now(),
  };
}

export const useGauntletStore = create<GauntletState>()((set) => ({
  snapshot: null,
  setSnapshot: (snapshot) => set({ snapshot }),
}));
