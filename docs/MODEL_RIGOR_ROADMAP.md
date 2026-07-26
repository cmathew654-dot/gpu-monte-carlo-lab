# Model rigor roadmap

**Status:** research and product-design note, not an authorized contract
amendment. It records the next defensible extensions after Amendment A6.

## 1. Current accounting truth

The shipped engine is already a **real-dollar** engine:

- Historical equity and 10-year Treasury inputs are monthly real total returns,
  rebuilt from the Shiller source including CPI.
- GBM and Student-t use real expected-return inputs; the non-equity sleeve uses
  a documented real bond return assumption.
- Withdrawals are level real spending. Terminal wealth, shortfall, and unfunded
  obligation are real purchasing-power amounts.

This means general dollar devaluation is already removed from both assets and
liabilities. It does **not** mean inflation is explicitly simulated. The engine
cannot yet represent pathwise CPI shocks, nominal yields, TIPS breakevens,
tax-bracket drift, Social Security COLA timing, category-specific medical
inflation, or FX exposure. Those require a joint nominal/CPI state vector.

## 2. Advisor regime-filter surface

The first addition should make the existing Regime-t state transparent before
making it more complex. Add a read-only **Market filter** block to the Advisor
Robustness Frontier:

| Readout | Shipped evidence |
| --- | ---: |
| Calibration window | 1926-01 through 2026-06 |
| Latest filtered state | 94.63% calm / 5.37% stress |
| Stationary state | 66.28% calm / 33.72% stress |
| Expected state duration | 43.0 calm / 21.9 stress months |
| Calm persistence | 97.67% |
| Stress persistence | 95.43% |

The filter is an inference, not a market label or forecast. State names remain
`calm` and `stress`, and the UI must say the production states differ only in
joint covariance scale.

Add an **initialization sensitivity** control with three explicit cases:

1. `Latest filtered` — production default, conditioned on the data end date.
2. `Stationary mix` — unconditional long-run sensitivity.
3. `Forced stress` — clearly labeled counterfactual, never “current market.”

Only the explicit **Run robustness frontier** action may execute these cases.
Draft controls, tabs, and frame updates remain non-triggers. Every result must
carry initialization, calibration date, input digest, and engine in its basis.

## 3. The accuracy ladder

### Priority 1 — joint nominal returns, CPI, and liabilities

Simulate a monthly vector containing equity total return, nominal Treasury
return or yield, TIPS/real yield, cash, and CPI. Convert each cash flow at the
point of use instead of pre-deflating the entire problem. This unlocks:

- separate essential and discretionary spending inflation;
- Social Security/pension COLA rules and lags;
- nominal taxes, fees, and account location;
- nominal bonds versus TIPS and cash;
- medical-cost shocks that can exceed CPI.

Keep the existing all-real engine as a control model. The nominal/CPI model is
an additional lens, not a silent semantic rewrite.

### Priority 2 — parameter and data uncertainty

The current range varies process form while treating fitted parameters as
known. A Bayesian posterior-predictive layer should draw uncertain long-run
means, covariance, persistence, and transition probabilities. This is likely
to widen long-horizon ranges more honestly than simply lowering Student-t
degrees of freedom. Estimation risk matters precisely because retirement is a
long-horizon decision.

Add international historical panels or country-block stress libraries. The
current US-only sample cannot generate a Japan-style lost era that the US did
not experience. Global evidence should be reported as structural sensitivity,
not pooled as though every country were exchangeable.

### Priority 3 — richer regimes

The next regime model should be a parsimonious Markov-switching VAR-t or
Bayesian VAR with a joint state vector. Candidate states should be selected by
out-of-sample log score and decision impact, not by dramatic labels. The model
may allow state-dependent:

- expected real equity and bond returns;
- equity/bond correlation and covariance shape;
- inflation level and persistence;
- yield-curve or valuation conditioning.

Three economically distinct states—growth/disinflation, inflation stress, and
deflation/crash—are more useful than adding many volatility buckets, but only
if rolling-origin evidence supports them. State count, priors, and transition
regularization must be frozen before validation.

### Priority 4 — stochastic volatility and discontinuities

Compare the selected regime model with stochastic volatility plus leverage and
jumps, or a DCC-GARCH-t benchmark for time-varying cross-asset covariance.
These models can materially change drawdown and early-sequence tails. They do
not automatically improve retirement decisions; reject them if predictive
score, calibration stability, or the capacity frontier does not improve.

### Priority 5 — household risk

Market rigor alone cannot make a client plan accurate. Add separate, optional
modules for:

- SSA cohort mortality and joint-survivor longevity;
- stochastic medical and long-term-care spending;
- labor-income loss before retirement;
- Social Security, pension, and annuity income;
- fees, taxes, and account-order rules;
- dynamic spending guardrails and essential-spend floors.

These belong in cash-flow modules with explicit provenance. Do not hide them in
the return process.

## 4. Which additions should widen the range?

Likely material:

1. international histories and US-exceptionalism sensitivity;
2. posterior parameter uncertainty, especially the uncertain long-run mean;
3. state-dependent means and stock–bond correlations;
4. explicit inflation/nominal-liability paths;
5. stochastic longevity and medical-cost tails.

Usually smaller on success rate, though still valuable for drawdown shape:

- changing only normal innovations to a fixed Student-t;
- swapping one short block-bootstrap rule for another without varying block
  length or source markets;
- adding more paths after Monte Carlo error is already small.

The displayed spread must never be enlarged for theatre. A model earns a place
only when it adds a distinct uncertainty, passes rolling-origin or historical
falsification, and can change an advisor action.

## 5. The question the product should answer

The next question is not “Which return model is true?” It is:

> Which client decision remains acceptable after market-process uncertainty,
> parameter uncertainty, inflation, and household liabilities are all allowed
> to disagree?

That points to a **decision robustness map**: for spending, retirement date,
and allocation, show the region that meets the target across every accepted
model and the single assumption that breaks first outside it.

## 6. Acceptance gates

Any new model must ship with:

- additive contract documentation and explicit real/nominal units;
- deterministic seed/subset behavior where applicable;
- CPU/GPU mirrored operation order or a documented CPU-only boundary;
- rolling-origin predictive comparison against the simpler accepted model;
- calibration stability across starts/priors and a fixed input digest;
- decision-level validation: success range, capacity, failure magnitude, and
  worst-decile drawdown;
- stale-result suppression and explicit run-only triggers;
- client copy that distinguishes an analysis range from a confidence interval.

## 7. Research anchors

- Campbell & Viceira-style inflation hedging begins with the covariance between
  inflation and nominal asset returns: [Bodie, *Inflation Risk and Capital
  Market Equilibrium*](https://www.nber.org/papers/w0373).
- Parameter uncertainty can raise long-horizon predictive variance:
  [Pastor & Stambaugh, *Are Stocks Really Less Volatile in the Long Run?*](https://www.nber.org/papers/w14757).
- Conditioning on valuation/yield variables can matter even with skeptical
  priors, but small-sample bias is a first-class risk:
  [Wachter & Warusawitharana](https://www.nber.org/papers/w13165) and
  [Nelson & Kim](https://www.nber.org/papers/w3297).
- Cross-country asset histories expose risks a US-only sample cannot:
  [Jordà et al., *The Rate of Return on Everything*](https://www.nber.org/papers/w24112).
- SSA publishes cohort mortality inputs suitable for stochastic longevity:
  [SSA downloadable actuarial data](https://www.ssa.gov/OACT/Downloadables/CY/index.html).
- Retiree medical spending has a large, persistent upper tail:
  [Jones et al., *The Lifetime Medical Spending of Retirees*](https://www.nber.org/papers/w24599).
