# Calibration — defending every default

**Owner:** Agent 5 (Data & Calibration), spec §4.5.
**Purpose:** every default in the simulator must be defensible in a client meeting.
This document is that defense. All statistics below are computed from the shipped
dataset (`src/data/historicalReturns.json`), reproducible via
`python3 src/data/build_historical.py`.

---

## 1. The dataset (what the numbers actually are)

| Item | Value |
|---|---|
| Source | Robert J. Shiller, *Irrational Exuberance* dataset (`ie_data.xls`, sheet "Data") |
| URL | `http://www.econ.yale.edu/~shiller/data/ie_data.xls` (maintained mirror: `https://shillerdata.com/`) |
| Downloaded / as-of | 2026-07-21; workbook last saved 2026-07-13; data through **2026-06** (equities) |
| Series used | S&P Composite price (P), dividend annual rate (D), CPI, GS10, Shiller's "Monthly Total Bond Returns" |
| Window | **1926-01 → 2026-06** (1,206 monthly real total returns) |
| Equity method | nominal TR = (Pₜ + Dₜ/12)/Pₜ₋₁ − 1; real TR = (1+nominal)/(CPIₜ/CPIₜ₋₁) − 1 |
| Cross-check | Reproduces Shiller's own "Real Total Return Price" column to max |diff| = 5.6e-16 |
| Bond method | Shiller's monthly 10-yr Treasury total return (computed by Shiller from GS10), deflated by CPI identically |
| Bootstrap form | 1,195 overlapping 12-month blocks (stride 1), flat Float32Array — see `historicalReturns.json` `_meta` |

Why Shiller: it is public, citable, continuously maintained since 2000, spans the
Depression/1970s/2008 regimes, and is the standard academic long-horizon US series
(CRSP/Ibbotson-class; the S&P Composite is the S&P 500's predecessor back to 1926).
The raw workbook is not committed (third-party file); the build script re-downloads it.

### Computed series statistics (the ground truth everything below references)

| Statistic (real, 1926-01..2026-06) | US equities | 10-yr Treasuries |
|---|---|---|
| Arithmetic mean | **8.24 %/yr** | 1.89 %/yr |
| Geometric mean (CAGR) | **7.31 %/yr** | 1.74 %/yr |
| Volatility (annualized) | **15.35 %** | 5.88 % |
| Worst month | −26.2 % (1929-11) | −9.6 % |
| Best month | +52.4 % | +12.2 % |
| Excess kurtosis (monthly) | 19.5 | 6.0 |
| Worst real drawdown | **−76.8 %** (trough 1932-06) | — |

Regime visibility (hard-asserted in the build script): 1929-09→1932-06 cumulative
real return **−75.8 %**; 2008-10 = **−19.4 %** in a single month; 1973-01→1974-12
= **−49.7 %**. A bootstrap over these blocks *cannot* hide the bad regimes.

---

## 2. μ = 7 %, σ = 15 % real equity (Model A/C defaults)

**What the data says:** arithmetic mean 8.24 %/yr, geometric 7.31 %/yr, vol 15.35 %
(full sample 1926–2026). Postwar (1946+): arithmetic 7.87 %, geometric 7.34 %, vol 12.26 %.

**σ = 15 %:** matches the full-sample historical volatility (15.35 %) almost exactly.
We deliberately anchor to the full sample, not the postwar 12.3 % — the Depression
and 2008 volatility regimes are exactly what a Monte Carlo retirement tool must keep
in play. An advisor can say: *"15 % is literally the measured volatility of the US
stock market over the last century."*

**μ = 7 %:** in Model A's parameterization (r = (μ − σ²/2)Δt + σ√Δt·Z on log returns),
μ is the expected *simple* annual growth rate and the median compound outcome is
μ − σ²/2 ≈ 5.9 %. Both are below the historical realizations (8.24 % arithmetic /
7.31 % geometric). The ~1.2 pp haircut is deliberate and defensible:

1. **Valuation.** Shiller CAPE is ≈ 41 as of 2026-06 vs a 1926–present mean of 19.2.
   Starting valuations this high have historically been followed by below-average
   long-horizon real returns (Shiller, *Irrational Exuberance*; the CAPE-return
   relationship is the dataset's own flagship result).
2. **Advisory convention.** Professional capital-market assumptions (e.g. the major
   actuarial/consulting surveys) have sat below the realized 20th-century US mean
   for two decades; 6–7 % nominal ≈ 4–5 % real is common. 7 % real as an *expected*
   assumption is, if anything, still generous against that backdrop.
3. **Symmetric honesty.** If a client wants the full historical 8.2 %, the slider
   goes there in one move — the default just shouldn't promise it.

**Blend behavior (implemented, AMENDMENT A3):** allocation mixing uses
μ_blend = A·μ + (1−A)·1.9 % (bond real arithmetic from the same dataset) and
σ_blend = A·σ — bond volatility is folded conservatively: the non-equity sleeve
contributes its 1.9 % real mean but no additional vol term, so the blend's vol is
the equity vol scaled by the equity allocation (a slight OVERestimate of 60/40
volatility, which is the safe direction for a planning tool). A 60/40 default
lands at ≈ 4.9 % expected real arithmetic, again below its realized ≈ 5.9 %
(0.6·8.24 + 0.4·1.89), same conservatism.
Under Model B (bootstrap) the mix is not parametric at all: each simulated month
applies g = 1 + A·r_equity + (1−A)·r_bond from the SAME drawn 12-month block —
`bondBlocks[i]` is month-aligned with `blocks[i]` (both from the Shiller series),
so the equity/bond correlation inside every historical month is preserved
exactly (see §5).

---

## 3. Why block length L = 12 (Model B)

The point of the block bootstrap is to preserve what i.i.d. sampling destroys:
**volatility clustering and within-year serial structure**.

Evidence from the shipped series:

- Lag-1 autocorrelation of |monthly return| = **0.203**, still **0.138 at lag 12**
  — volatility regimes persist for about a year. i.i.d. monthly sampling would draw
  a 1932-volatility month next to a 1964-calm month and produce unrealistically
  smooth paths; 12-month blocks keep a Depression year (or a 2008 year) intact as a
  unit.
- 12-month rolling real total returns span **−58.1 % to +151.3 %** with lag-1
  autocorrelation 0.94 — the annual draw is the economically meaningful unit a
  retiree actually experiences ("a bad year", not "a bad month").
- Serial correlation in raw returns is weak (lag-1 = 0.27, dominated by the
  1929–39 regime), but the *level* effects that matter for ruin risk — sequence of
  returns — are preserved exactly inside each block.

Why not longer? L = 24 would halve the effective number of distinct annual mixtures
and over-weight the few very long regimes; L = 12 also matches the annual horizon of
rebalancing, tax, and spending reviews, and is the standard choice in the financial
planning bootstrap literature (annual block resampling). 1,195 blocks at L = 12 fit
comfortably under the frozen `BOOTSTRAP_BLOCKS_MAX = 4096`.

**Known limitation (disclose if asked):** any stationary bootstrap understates
multi-year persistence of extreme regimes — the 1929–32 sequence can appear in a
path only as three (luckily chained) bad years, not as one guaranteed 4-year
depression. This cuts *against* optimism; Model C exists to compensate at the tail.

---

## 4. Why ν = 5 (Model C, Student-t innovations)

Student-t with ν degrees of freedom has excess kurtosis 6/(ν−4), so ν = 5 ⇒ excess
kurtosis 6 (vs 0 for Gaussian).

Evidence:

- Fitting a Student-t by MLE to the shipped monthly series yields **ν̂ ≈ 3.5**
  (full sample) and **ν̂ ≈ 5.5** (post-1945). ν = 5 sits squarely in the defensible
  middle: heavy enough to demonstrate the Gaussian understatement of tail risk
  (the client-education point of Model C), not so extreme that it becomes the
  worst-case-scenario generator rather than a stress lens.
- Measured monthly excess kurtosis is 19.5 on the full sample but only **3.0**
  postwar — the full-sample figure is regime-mixture inflation (Depression
  volatility), which is *already* captured correctly by Model B's blocks. Model C
  is for i.i.d.-innovation models (A) that lack that structure; ν = 5 gives it
  realistic month-level tails.
- Literature: estimates of the tail index / t-df for equity returns consistently
  land in the 3–6 range (e.g. classic fat-tails results going back to Mandelbrot
  1963 and Fama 1965; modern GARCH-t fits on S&P 500 returns typically estimate
  ν between 4 and 8). ν = 5 is the conventional "heavy but finite-variance and
  finite-kurtosis" choice: variance exists (required for a σ slider to mean
  anything) and kurtosis exists (so the tail comparison is well-defined).

**Client-meeting line:** *"ν = 5 means months three sigma below the mean happen
roughly an order of magnitude more often than a bell curve says. That's what a
century of actual market data looks like."*

---

## 5. Glidepath rationale

The optional glidepath linearly de-risks equity allocation from A₀ (today) to A₁
(retirement, then constant at A₁). The de-risked sleeve is a **bond allocation**,
not cash: Models A/C blend μ and σ as in §2, and Model B mixes each month's
equity and 10-yr Treasury returns from the same historical block (AMENDMENT A3 —
before A3 the sleeve was a zero-real-return cash proxy and Model B ignored the
glidepath entirely). It exists because **sequence-of-returns risk is concentrated in the
decade around retirement**: a −30 % year at age 64 with contributions ending is
far more damaging than the same year at 40. This is the design principle of every
target-date fund (Vanguard/T. Rowe Price/Fidelity glidepaths all move roughly
90 % → 50–60 % equity across the working years) and the motivation for the
"Pre-retiree 10-yr glidepath" preset (0.90 → 0.60 over 10 years).

Honest caveat for the meeting: the research is split on the *optimal* shape —
Kitces & Pfau (2014) argue for a rising equity glidepath *after* retirement. The
simulator takes no side: it makes the trade-off visible instead of prescribing it.

---

## 6. Withdrawal defaults vs the 4 %-rule literature

The frozen store default is **$1,000,000 initial wealth, $5,000/month withdrawal
= 6.0 % initial withdrawal rate**, 30-year horizon, 100 % equity bootstrap.

**That is deliberately above the 4 % rule** — and here's the defense:

| Initial WR | Historical 30-yr success, recomputed on THIS dataset (rolling windows, monthly rebalancing) |
|---|---|
| 4 % | 96.3 % (100 % eq) · 95.9 % (60/40) |
| 5 % | 81.5 % (100 % eq) · 74.4 % (60/40) |
| 6 % (the default) | 70.1 % (100 % eq) · 57.3 % (60/40) |

References: Bengen (1994, *Journal of Financial Planning*) found ~4 % survived
every historical US 30-yr window; the Trinity study (Cooley, Hubbard & Walz 1998,
*AAII Journal*) found 4 % succeeded ~95–100 % and 6 % only ~50–60 % at 30 years.
Our recomputation on the shipped series reproduces those figures within a few
points — so the simulator's default view opens on the most important conversation
in retirement planning: **a 6 % spend fails about a third of the time even in the
best market in history.** If the default were a "safe" 3.5 %, the flagship screen
would show ~100 % success and teach nothing. The presets cover the prudent cases;
the safe-withdrawal-rate stat (§2.5) computes the withdrawal that *would* have
been safe 90 % of the time.

The five presets (`src/data/scenarios.json`) anchor the other conversations:
4.4 % early-retiree (35-yr), 4.0 % fat-tail stress case, 8 % cautionary case
(fails visibly fast — use it to *start* the withdrawal conversation), and the
pure-accumulation saver.

---

## 7. Caveats worth volunteering in a client meeting

1. **US exceptionalism.** 1926–2026 US equities are the best-documented — and
   best-performing — large market in history (Dimson, Marsh & Staunton, *Triumph
   of the Optimists*). The bootstrap can only replay this history; it cannot
   produce a Japan-1989 scenario that US data doesn't contain. This is one more
   reason the μ default is haircut below the historical mean.
2. **Data construction.** Shiller's monthly dividends are annual rates smoothed
   across the year (dividend seasonality is not modeled — immaterial at monthly
   return scale); the S&P Composite is the 90-stock predecessor of the S&P 500
   before 1957; the final month(s) use estimated CPI. Bond returns are Shiller's
   GS10-derived total return approximation, not a traded index.
3. **Real dollars.** Everything is inflation-adjusted; "failure" means real
   purchasing power exhausted. Nominal illusions (1970s) are handled correctly
   by construction.
4. **Stationarity.** The bootstrap assumes the future resembles the pooled past.
   That is a modeling choice, disclosed here — which is exactly why Models A and C
   exist as alternative lenses on the same plan.

---

## 8. Regime-t scale HMM (frontier-only)

Amendment A6 adds a separate two-state bivariate Student-t(5) scale HMM to the
Robustness Frontier. It is calibrated offline to the paired 1,206-month equity
and bond log-return series from 1926-01 through 2026-06. The committed input
digest is
`22cce814073cdf5fba6288afbdf7d4c78d000a7f62110c757905eb3076cc49e4`.

Both states share one full-sample mean and covariance shape. Their covariance
scales differ, and transitions make those scales persist. The measured monthly
equity volatilities are 3.3075% and 6.1742%; persistence is 0.9767 and 0.9543.
The rolling-origin mean joint log score is 4.3010 versus 4.2562 for the
one-state Student-t(5) benchmark.

This is intentionally narrower than a story-driven “bull/bear” model. The
states are latent scale classes, not labels for historical events; conditional
means and stock–bond correlation do not switch. The model tests persistent
joint volatility, not a forecast of returns or diversification. Runtime paths
ignore the ordinary μ/σ sliders and initialize from the latest filtered state
probability; stationary initialization is reported only as validation
sensitivity.

Exact equations, acceptance gates, fitted parameters, RNG streams, runtime
contracts, and limitations are in [AMENDMENT_A6.md](AMENDMENT_A6.md). Reproduce
them with `npm run check:regime-calibration` and `npm run test:regime`.

---

*Generated by Agent 5. All statistics reproducible: `python3 src/data/build_historical.py`
(re-downloads the Shiller workbook), `node src/data/validate_data.mjs` (contract check).*
