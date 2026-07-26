/**
 * initPaths.tsl.ts — seed all sim buffers (spec §4.2 task 3).
 * SINGLE OWNER: Agent 2.
 *
 * Dispatched ONCE per parameter change by runSimulation() (src/sim/
 * runSimulation.ts) before any computeStep dispatch. NOT per frame.
 *
 * Deliberately initializes ALL PATHS_MAX slots (no uActiveN gate): one-time
 * cost, and it guarantees every buffer slot is in a known state even when a
 * later run raises the active count (§3.8 trap 3 — buffers never resize).
 *
 * cpuSim counterpart: the state initializer at the top of runCpuSim()
 * (src/sim/fallback/cpuSim.ts): wealth = peak = initialWealth, maxDD = 0,
 * failed = 0 (active), blockBase = 0.
 */
import { Fn, Loop, float, instanceIndex, uint } from 'three/tsl';
import {
  PATHS_MAX,
  SNAP_MAX,
  pathWealth,
  pathPeak,
  pathMaxDD,
  pathFailed,
  pathBlockBase,
  pathBlockRet,
  pathHistory,
  uInitialWealth,
} from '../buffers';

export const computeInit = /*#__PURE__*/ Fn(() => {
  pathWealth.element(instanceIndex).assign(uInitialWealth);
  pathPeak.element(instanceIndex).assign(uInitialWealth);
  pathMaxDD.element(instanceIndex).assign(float(0));
  pathFailed.element(instanceIndex).assign(uint(0)); // 0 = active
  pathBlockBase.element(instanceIndex).assign(uint(0));
  pathBlockRet.element(instanceIndex).assign(float(0));

  // AMENDMENT A1 (docs/CONTRACTS.md §9): zero ALL history slots so trailing
  // slots of failed paths read as the clamped absorbing state (0), then
  // write snapshot 0 = initial wealth. One-time cost per resim.
  const histBase = instanceIndex.mul(uint(SNAP_MAX)).toVar();
  Loop(SNAP_MAX, ({ i }) => {
    pathHistory.element(histBase.add(uint(i))).assign(float(0));
  });
  pathHistory.element(histBase).assign(uInitialWealth);
})().compute(PATHS_MAX);
