/**
 * Separate monthly graph for the frontier-only two-state Regime-t lens.
 * Reuses the frozen financial buffers and bookkeeping order; pathBlockBase
 * temporarily stores regime state 0/1 for this run.
 */
import { Fn, If, Return, float, instanceIndex, uint } from 'three/tsl';
import {
  PATHS_MAX,
  SNAP_MAX,
  pathBlockBase,
  pathBlockRet,
  pathFailed,
  pathHistory,
  pathMaxDD,
  pathPeak,
  pathWealth,
  uActiveN,
  uContribution,
  uGlideEnabled,
  uGlideEnd,
  uGlideStart,
  uRetireStep,
  uSeed,
  uSnapCount,
  uSnapStride,
  uStep,
  uWithdrawal,
} from '../buffers';
import { PEAK_EPSILON } from '../model/withdrawal';
import { REGIME_CALIBRATION_F32 } from '../regime/artifact';
import { stepSeed, streamNormalTsl, streamUniformTsl } from './rng.tsl';

const CALM = REGIME_CALIBRATION_F32.states[0];
const STRESS = REGIME_CALIBRATION_F32.states[1];

export const computeRegimeStep = /*#__PURE__*/ Fn(() => {
  // 1–2. Frozen active-lane and absorbing-failure gates.
  If(instanceIndex.greaterThanEqual(uActiveN), () => {
    Return();
  });
  If(pathFailed.element(instanceIndex).notEqual(uint(0)), () => {
    Return();
  });

  // 3. Same per-(path, month) seed as the CPU runtime.
  const seedU = stepSeed(instanceIndex, uStep, uSeed).toVar();
  const isRetired = uStep.greaterThanEqual(uRetireStep);

  // 4. Regime transition. Keep state/index nodes uint-typed.
  const state = uint(0).toVar();
  const stressProbability = float(
    REGIME_CALIBRATION_F32.latestFiltered[1],
  ).toVar();
  If(uStep.greaterThan(uint(0)), () => {
    If(pathBlockBase.element(instanceIndex).equal(uint(0)), () => {
      stressProbability.assign(float(REGIME_CALIBRATION_F32.transition[1]));
    }).Else(() => {
      stressProbability.assign(float(REGIME_CALIBRATION_F32.transition[3]));
    });
  });
  If(streamUniformTsl(seedU, 0).lessThan(stressProbability), () => {
    state.assign(uint(1));
  });
  pathBlockBase.element(instanceIndex).assign(state);

  // Float twins for distribution parameters: never reuse a select result
  // across the uint state domain and the float return domain.
  const meanEquity = float(CALM.mean[0]).toVar();
  const meanBond = float(CALM.mean[1]).toVar();
  const l00 = float(CALM.cholesky[0]).toVar();
  const l10 = float(CALM.cholesky[1]).toVar();
  const l11 = float(CALM.cholesky[2]).toVar();
  If(state.equal(uint(1)), () => {
    meanEquity.assign(float(STRESS.mean[0]));
    meanBond.assign(float(STRESS.mean[1]));
    l00.assign(float(STRESS.cholesky[0]));
    l10.assign(float(STRESS.cholesky[1]));
    l11.assign(float(STRESS.cholesky[2]));
  });

  // 5. Optional equity/bond allocation and month-end cash flow.
  const mix = float(1).toVar();
  If(uGlideEnabled.equal(uint(1)), () => {
    const fraction = float(uStep).div(float(uRetireStep).max(1)).clamp(0, 1);
    mix.assign(
      uGlideStart
        .mul(fraction.oneMinus())
        .add(uGlideEnd.mul(fraction)),
    );
  });
  const cashFlow = float(uContribution).toVar();
  If(isRetired, () => {
    cashFlow.assign(uWithdrawal.negate());
  });

  // 6. Branch-independent streams: state 0, Gaussian coordinates 1/2,
  // and all five chi-square coordinates 3..7 every path-month.
  const z0 = streamNormalTsl(seedU, 1);
  const z1 = streamNormalTsl(seedU, 2);
  const chi2 = float(0).toVar();
  for (let stream = 3; stream <= 7; stream++) {
    const normal = streamNormalTsl(seedU, stream);
    chi2.addAssign(normal.mul(normal));
  }
  const radial = float(3).div(chi2.max(1e-12)).sqrt();
  const equityGross = meanEquity
    .add(l00.mul(z0.mul(radial)))
    .exp();
  const bondGross = meanBond
    .add(l10.mul(z0.mul(radial)))
    .add(l11.mul(z1.mul(radial)))
    .exp();
  const gross = float(0).toVar();
  gross.assign(
    mix.mul(equityGross).add(mix.oneMinus().mul(bondGross)),
  );

  // 7. Frozen wealth update order.
  const wNew = pathWealth
    .element(instanceIndex)
    .mul(gross)
    .add(cashFlow)
    .toVar();
  pathWealth.element(instanceIndex).assign(wNew);
  pathBlockRet.element(instanceIndex).assign(gross.sub(1));

  // 8. Frozen retirement drawdown/failure bookkeeping.
  const failedNow = uint(0).toVar();
  If(isRetired, () => {
    const peak = pathPeak.element(instanceIndex);
    peak.assign(peak.max(wNew));
    const drawdown = peak
      .sub(wNew)
      .div(peak.max(PEAK_EPSILON))
      .clamp(0, 1);
    const maxDrawdown = pathMaxDD.element(instanceIndex);
    maxDrawdown.assign(maxDrawdown.max(drawdown));
    If(wNew.lessThan(0), () => {
      pathWealth.element(instanceIndex).assign(float(0));
      pathFailed.element(instanceIndex).assign(uStep.add(uint(1)));
      failedNow.assign(uint(1));
    });
  });

  // 9. Frozen history write order, after the failure clamp.
  const historyBase = instanceIndex.mul(uint(SNAP_MAX)).toVar();
  const stepsDone = uStep.add(uint(1));
  const snapshotIndex = stepsDone.div(uSnapStride).toVar();
  If(stepsDone.mod(uSnapStride).equal(uint(0)), () => {
    If(snapshotIndex.lessThan(uSnapCount), () => {
      pathHistory
        .element(historyBase.add(snapshotIndex))
        .assign(pathWealth.element(instanceIndex));
    });
  })
    .ElseIf(failedNow.equal(uint(1)), () => {
      const failureSlot = uStep.div(uSnapStride).add(uint(1));
      If(failureSlot.lessThan(uSnapCount), () => {
        pathHistory
          .element(historyBase.add(failureSlot))
          .assign(pathWealth.element(instanceIndex));
      });
    });
})().compute(PATHS_MAX);
