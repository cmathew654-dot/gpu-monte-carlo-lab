/** Dedicated lifecycle state for a robustness-frontier computation. */
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { FrontierModelKey, RobustnessFrontier } from '../sim/frontier/types';

export type AdvisorLens = 'futures' | 'models' | 'frontier' | 'gauntlet';
export type FrontierStatus = 'idle' | 'running' | 'complete' | 'error';

export interface FrontierState {
  advisorLens: AdvisorLens;
  status: FrontierStatus;
  progress: {
    completed: number;
    total: number;
    model: FrontierModelKey | null;
  };
  result: RobustnessFrontier | null;
  error: string | null;
  setAdvisorLens: (advisorLens: AdvisorLens) => void;
  begin: (total: number) => void;
  setProgress: (progress: FrontierState['progress']) => void;
  complete: (result: RobustnessFrontier) => void;
  fail: (error: string) => void;
  clear: () => void;
}

export const useFrontierStore: UseBoundStore<StoreApi<FrontierState>> = create<FrontierState>()(
  (set) => ({
    advisorLens: 'futures',
    status: 'idle',
    progress: { completed: 0, total: 0, model: null },
    result: null,
    error: null,
    setAdvisorLens: (advisorLens) => set({ advisorLens }),
    begin: (total) =>
      set({
        status: 'running',
        progress: { completed: 0, total, model: null },
        result: null,
        error: null,
      }),
    setProgress: (progress) => set({ progress }),
    complete: (result) =>
      set({
        status: 'complete',
        result,
        error: null,
        progress: { completed: 0, total: 0, model: null },
      }),
    fail: (error) =>
      set({
        status: 'error',
        result: null,
        error,
        progress: { completed: 0, total: 0, model: null },
      }),
    clear: () =>
      set({
        status: 'idle',
        result: null,
        error: null,
        progress: { completed: 0, total: 0, model: null },
      }),
  }),
);
