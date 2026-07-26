/**
 * stepPaths.tsl.ts — one dispatch advances ALL active paths by ONE month
 * (spec §4.2 task 4). SINGLE OWNER: Agent 2.
 *
 * cpuSim counterpart: the per-path/per-step loop body of runCpuSim() in
 * src/sim/fallback/cpuSim.ts. The operation order below is FROZEN and
 * mirrored 1:1 by applyMonthlyStep() (src/sim/model/withdrawal.ts):
 *
 *   1. gate: instanceIndex ≥ uActiveN → Return (idle lanes, §3.8 trap 3)
 *   2. gate: pathFailed ≠ 0 → Return (absorbing failure state, §2.3)
 *   3. seedU = u32 path/step seed (rng.tsl.ts stepSeed ↔ hash.ts stepSeedU)
 *   4. effective μ/σ + equity allocation mix A(t) (optional glidepath, §2.3 —
 *      allocation lerp start→end over [0, uRetireStep], constant `end` after
 *      retirement; AMENDMENT A3: non-equity fraction is a BOND sleeve —
 *      μ_blend = A·μ + (1−A)·0.019, σ_blend = A·σ for Models A/C)
 *   5. cashFlow = step < uRetireStep ? +uContribution : −uWithdrawal
 *      (month-END convention: applied after growth, §2.3)
 *   6. monthly GROSS multiplier g, uniform model switch via TSL If chains:
 *        gbm       → g = exp((μ−σ²/2)·Δt + σ·√Δt·Z),  Z = Box–Muller pair 0
 *                    (§2.2 r_t is a LOG-return; exp() application is what
 *                    makes §2.6's analytic lognormal moments hold — a (1+r)
 *                    application would bias E[ln W_T] by −σ²T/2 ≈ −2.2%)
 *        bootstrap → step%12==0 draws block index (hash → pathBlockBase),
 *                    g = 1 + bootstrapBlocks[base + step%12] (simple return;
 *                    per §4.2: index the block buffer monthly, do NOT
 *                    cache 12 floats per path). AMENDMENT A3 glidepath:
 *                    g = 1 + A·r_equity + (1−A)·r_bond from the SAME drawn
 *                    block (bond region of bootstrapBlocks at
 *                    BOND_BLOCKS_OFFSET — month-aligned)
 *        fattail   → same as gbm with Student-t(5) unit-variance innovation
 *   7. wealth := wealth·g + cashFlow
 *   8. retirement only: peak := max(peak, wealth);
 *      maxDD := max(maxDD, clamp((peak−wealth)/max(peak,ε), 0, 1));
 *      wealth < 0 → wealth := 0, pathFailed := step+1 (absorbing; the flag
 *      doubles as the failure-step record for Agent 3's §2.5 histogram)
 *
 * All values accumulated/updated across the dispatch are `.toVar()`-bound
 * per §3.8 trap 2.
 */
import { Fn, If, Return, float, instanceIndex, uint } from 'three/tsl';
import {
  PATHS_MAX,
  pathWealth,
  pathPeak,
  pathMaxDD,
  pathFailed,
  pathBlockBase,
  pathBlockRet,
  bootstrapBlocks,
  BOND_BLOCKS_OFFSET,
  uModel,
  uActiveN,
  uSeed,
  uStep,
  uRetireStep,
  uContribution,
  uWithdrawal,
  uMu,
  uSigma,
  uGlideEnabled,
  uGlideStart,
  uGlideEnd,
  uBlockCount,
  SNAP_MAX,
  pathHistory,
  uSnapStride,
  uSnapCount,
} from '../buffers';
import {
  BLOCK_LENGTH,
  BOND_MU_REAL,
  DT,
  SQRT_DT,
  MODEL_GBM,
  MODEL_BOOTSTRAP,
} from '../model/returnModels';
import { PEAK_EPSILON } from '../model/withdrawal';
import { stepSeed, streamNormalTsl, studentT5, drawBlockIndexTsl } from './rng.tsl';

export const computeStep = /*#__PURE__*/ Fn(() => {
  // 1–2. gates
  If(instanceIndex.greaterThanEqual(uActiveN), () => {
    Return();
  });
  If(pathFailed.element(instanceIndex).notEqual(uint(0)), () => {
    Return();
  });

  // 3. per-(path, step) u32 seed (hash.ts stepSeedU)
  const seedU = stepSeed(instanceIndex, uStep, uSeed).toVar();

  const isRetired = uStep.greaterThanEqual(uRetireStep);

  // 4. effective μ/σ + equity allocation mix with optional glidepath
  // (returnModels.glidepathMix; AMENDMENT A3 bond-sleeve blend — the mix
  // defaults to A=1 pure equity, exactly the pre-A3 behavior)
  const mix = float(1).toVar();
  const muEff = float(uMu).toVar();
  const sigmaEff = float(uSigma).toVar();
  If(uGlideEnabled.equal(uint(1)), () => {
    const frac = float(uStep).div(float(uRetireStep).max(1)).clamp(0, 1);
    mix.assign(uGlideStart.mul(frac.oneMinus()).add(uGlideEnd.mul(frac)));
    muEff.assign(uMu.mul(mix).add(mix.oneMinus().mul(float(BOND_MU_REAL))));
    sigmaEff.assign(uSigma.mul(mix));
  });

  // 5. cash flow (month-end convention)
  const cashFlow = float(uContribution).toVar();
  If(isRetired, () => {
    cashFlow.assign(uWithdrawal.negate());
  });

  // 6. monthly gross multiplier (uniform model switch — TSL If chains)
  const gross = float(0).toVar();
  If(uModel.equal(uint(MODEL_GBM)), () => {
    // Model A — GBM: g = exp(§2.2 log-return) (returnModels.gbmMonthlyReturn)
    const z = streamNormalTsl(seedU, 0);
    gross.assign(
      muEff
        .sub(sigmaEff.mul(sigmaEff).mul(0.5))
        .mul(DT)
        .add(sigmaEff.mul(SQRT_DT).mul(z))
        .exp(),
    );
  })
    .ElseIf(uModel.equal(uint(MODEL_BOOTSTRAP)), () => {
      // Model B — block bootstrap: new block draw at 12-month boundaries,
      // then index the block buffer directly (§4.2 — no 12-float caching).
      If(uStep.mod(uint(BLOCK_LENGTH)).equal(uint(0)), () => {
        const block = drawBlockIndexTsl(seedU, uBlockCount);
        pathBlockBase.element(instanceIndex).assign(block.mul(uint(BLOCK_LENGTH)));
      });
      const base = pathBlockBase.element(instanceIndex);
      const rEquity = bootstrapBlocks.element(base.add(uStep.mod(uint(BLOCK_LENGTH))));
      If(uGlideEnabled.equal(uint(1)), () => {
        // AMENDMENT A3: month-aligned equity/bond mix of the SAME drawn
        // block — gross = 1 + A·r_equity + (1−A)·r_bond (cpuSim lockstep).
        // The bond sleeve lives in the SAME buffer at BOND_BLOCKS_OFFSET
        // (a 9th storage binding would exceed the default per-stage limit
        // of 8 — see buffers.ts).
        const rBond = bootstrapBlocks.element(
          base.add(uStep.mod(uint(BLOCK_LENGTH))).add(uint(BOND_BLOCKS_OFFSET)),
        );
        gross.assign(mix.mul(rEquity).add(mix.oneMinus().mul(rBond)).add(1));
      }).Else(() => {
        gross.assign(rEquity.add(1));
      });
    })
    .Else(() => {
      // Model C — fat-tailed GBM (Student-t ν=5, unit variance)
      const t = studentT5(seedU);
      gross.assign(
        muEff
          .sub(sigmaEff.mul(sigmaEff).mul(0.5))
          .mul(DT)
          .add(sigmaEff.mul(SQRT_DT).mul(t))
          .exp(),
      );
    });

  // 7. wealth update (frozen order — withdrawal.ts applyMonthlyStep)
  const wNew = pathWealth.element(instanceIndex).mul(gross).add(cashFlow).toVar();
  pathWealth.element(instanceIndex).assign(wNew);
  pathBlockRet.element(instanceIndex).assign(gross.sub(1)); // applied simple return (debug/viz)

  // 8. retirement-phase bookkeeping: peak, max drawdown, absorbing failure
  const failedNow = uint(0).toVar(); // 1 ⇔ this lane failed on THIS step (A1)
  If(isRetired, () => {
    const peak = pathPeak.element(instanceIndex);
    peak.assign(peak.max(wNew));
    const dd = peak.sub(wNew).div(peak.max(PEAK_EPSILON)).clamp(0, 1);
    const mdd = pathMaxDD.element(instanceIndex);
    mdd.assign(mdd.max(dd));
    If(wNew.lessThan(0), () => {
      pathWealth.element(instanceIndex).assign(float(0)); // clamp
      pathFailed.element(instanceIndex).assign(uStep.add(uint(1))); // step+1 record
      failedNow.assign(uint(1));
    });
  });

  // 9. decimated trajectory history (AMENDMENTS A1+A2, docs/CONTRACTS.md §9).
  // Written AFTER the failure clamp so a failure landing on a snapshot step
  // records the post-clamp wealth (0). Regular snapshot at every step where
  // (step+1) % uSnapStride == 0 → slot (step+1)/stride; a mid-period failure
  // additionally writes the failure slot floor(step/stride)+1. Both writes
  // are guarded by uSnapCount (when the snapshot grid doesn't land exactly
  // on the horizon, the terminal value lives in pathWealth instead — §9).
  const histBase = instanceIndex.mul(uint(SNAP_MAX)).toVar();
  const stepsDone = uStep.add(uint(1));
  const snapIdx = stepsDone.div(uSnapStride).toVar();
  If(stepsDone.mod(uSnapStride).equal(uint(0)), () => {
    If(snapIdx.lessThan(uSnapCount), () => {
      pathHistory.element(histBase.add(snapIdx)).assign(pathWealth.element(instanceIndex));
    });
  })
    .ElseIf(failedNow.equal(uint(1)), () => {
      const failSlot = uStep.div(uSnapStride).add(uint(1));
      If(failSlot.lessThan(uSnapCount), () => {
        pathHistory.element(histBase.add(failSlot)).assign(pathWealth.element(instanceIndex));
      });
    });
})().compute(PATHS_MAX);
