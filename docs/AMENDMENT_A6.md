# Amendment A6 — Regime-t robustness lens

**Authorization:** Robustness Frontier extension approved 2026-07-26.

This amendment adds one frontier-only return process: a deterministic,
offline-calibrated, two-state bivariate Student-t(5) **scale HMM**. It is an
orthogonal test of persistent volatility clustering. It is not a fourth
selectable primary model, a forecast of the next market state, or a confidence
interval around the other models.

## 1. Frozen compatibility boundary

The extension is additive:

| Frozen surface | A6 compatibility |
| --- | --- |
| `SimParams`, `SimStats`, and `TriStats` | Unchanged. `'regime'` is not a `SimParams['model']` value. |
| Shipped model IDs | `gbm = 0`, `bootstrap = 1`, and `fattail = 2` remain unchanged; there is no model ID 3. |
| Existing buffers and bindings | Unchanged. A regime run temporarily uses existing `pathBlockBase` for state 0/1. |
| `runSimulation()` and `runCpuSim()` | Unchanged. Regime uses separate GPU and CPU runners. |
| `computeStep` and CPU worker protocol | Unchanged. The dedicated frontier worker remains the transport. |
| Cash-flow, drawdown, failure, and history order | Mirrored operation-for-operation in the separate runners. |

## 2. Historical input and reproducible artifact

Calibration reconstructs the paired monthly equity and 10-year Treasury real
total-return series from the overlapping blocks in
`src/data/historicalReturns.json`. Exact repeated decimals must agree across
every overlap before the series is accepted.

| Field | Committed value |
| --- | ---: |
| Window | 1926-01 through 2026-06 |
| Paired observations | 1,206 |
| Canonical input SHA-256 | `22cce814073cdf5fba6288afbdf7d4c78d000a7f62110c757905eb3076cc49e4` |
| Artifact | `src/data/regimeCalibration.json` |
| Schema/model/df | `1` / `two-state-bivariate-student-t` / `5` |

`npm run build:regime-calibration` fits and writes the artifact.
`npm run check:regime-calibration` refits from the committed source and rejects
any byte difference. The browser never fits the HMM. Runtime code validates
schema, provenance, dates, finite tuples, probability rows, state ordering,
positive Cholesky diagonals, covariance reconstruction, the shared mean, and
the shared covariance shape before deep-freezing the artifact.

Every runtime mean, Cholesky entry, transition probability, and latest-filtered
probability is explicitly rounded with `Math.fround` before CPU/GPU use.

## 3. Model definition

Let `S_t ∈ {calm, stress}` follow a two-state Markov chain with transition
matrix `P`. Conditional paired log returns are

```text
x_t = μ + L_S z_t
z_t ~ standardized bivariate Student-t(ν = 5)
C_S = L_S L_S' = q_S C_shape
```

`C_S` is the **actual covariance**. The Student-t density therefore uses scale
matrix `Σ_S = C_S × (ν - 2) / ν = C_S × 3/5`. Both states share one
full-sample mean `μ` and one covariance shape `C_shape`; only the positive
scale `q_S` differs. State order is fixed by
`equityVolCalm < equityVolStress`.

This constraint is deliberate. The initially planned unconstrained HMM was
implemented and rejected by the unchanged acceptance gate: it separated
persistent eras and mean levels but remained below the required 1.5×
stress/calm equity-volatility ratio. Increasing mean shrinkage through an
effectively common mean still failed that gate. The threshold was not weakened.
The accepted scale parameterization asks the narrower question the product
needs: does persistent joint return scale change the spending decision?

The constraint also defines an honest limitation: conditional stock–bond
correlation is common across the two fitted states. A6 tests volatility
clustering and persistence with paired stock/bond shocks; it does **not** claim
to estimate state-varying diversification or a distinct crisis correlation.

## 4. Deterministic fitting and acceptance

The pure-TypeScript fitter uses scaled forward/backward recursion and
Student-t mixture weights

```text
w_tS = (ν + d) / (ν + δ_tS),  ν = 5, d = 2
```

where `δ_tS` is the Mahalanobis distance under the density scale matrix. The
M-step keeps the common full-sample mean and covariance shape fixed, estimates
one state scale from `gamma × w`, converts density scale back to actual
covariance by `5/3`, floors the smaller covariance eigenvalue at `1e-8`, and
updates transition rows with one pseudocount per cell (Beta(2,2)-equivalent).
The one-state rolling comparator uses 12 observation-equivalents of mean
shrinkage toward its expanding-window sample mean.

Four deterministic starts are evaluated: an equity absolute-deviation median
split, an equity bottom/top-quartile split, first-half/last-half moments, and
full-sample covariance scaled 0.5×/2×. Their transition starts use the common
`[[0.95,0.05],[0.10,0.90]]` base with deterministic perturbations no larger
than 0.02. A run stops after at most 250 iterations or when absolute
log-likelihood improvement per observation is below `1e-7`. The
highest-likelihood converged ordered run wins. At least two starts must agree
with the winner within `1e-4` log likelihood per observation.

Measured committed fit:

| Quantity | Calm | Stress |
| --- | ---: | ---: |
| Monthly equity volatility | 0.0330749726 | 0.0617423330 |
| Filtered occupancy | 0.6608096493 | 0.3391903507 |
| Persistence | 0.9767339270 | 0.9542764748 |
| Expected duration, months | 42.98103947 | 21.87057963 |
| Latest filtered probability (2026-06) | 0.9462876301 | 0.0537123699 |

Additional fit evidence:

| Gate/evidence | Measured result |
| --- | ---: |
| Stress/calm equity-volatility ratio | 1.8667387504 |
| Log likelihood | 5567.2778149120 |
| Iterations | 31 |
| Agreeing ordered starts | 4 of 4 |
| Rolling-origin scored months | 606 |
| Two-state mean joint log score | 4.3010423089 |
| One-state Student-t(5) mean joint log score | 4.2562176532 |

Acceptance rejects unless both covariance determinants and all Cholesky
diagonals are positive; both occupancies are at least 10%; stress equity
volatility is at least 1.5× calm; all transition cells are in
`[0.0001, 0.9999]`; both persistence probabilities are in `[0.5, 0.9999]`;
the winning fit converges; at least two of four starts agree; and the expanding
rolling-origin score is not worse than the one-state benchmark. Rolling
origins begin at month 600, refit every 12 months, and score every subsequent
month rather than averaging origin-level summaries.

## 5. Fixed runtime draws

Every `(path, month, seed)` uses the existing `stepSeedU` and reserves all
eight streams regardless of the realized state:

| Stream | Use |
| ---: | --- |
| 0 | initial or transition state uniform |
| 1, 2 | correlated Gaussian coordinates |
| 3–7 | five squared Gaussian coordinates for `χ²₅` |

The standardized t radial factor is

```text
radial = sqrt(3 / max(χ²₅, 1e-12))
```

so the innovation has unit covariance before multiplication by the stored
actual-covariance Cholesky factor. Month zero uses the artifact's 2026-06
latest-filtered probability. Later months use `p01` after calm and `p11` after
stress. Comparisons are strict `<` in both CPU and GPU implementations.

For allocation `A_t`, the monthly portfolio gross return is

```text
gross_t = A_t × exp(equityLogReturn_t)
        + (1 - A_t) × exp(bondLogReturn_t)
```

`A_t` uses the existing `glidepathMix` convention when enabled and is 1.0
otherwise. The regime lens ignores the user's `mu` and `sigma`; byte-level CPU
tests prove that changing only those sliders changes no regime result.

## 6. Separate CPU/GPU execution

`runCpuRegimeSim` does not call or change the frozen CPU simulator. It mirrors
initialization, month-end cash flow, retirement drawdown, post-drawdown failure
clamp, failure index, snapshot writes, sorting, percentiles, worst-decile tail
mean, and magnitude-of-failure semantics.

`computeRegimeStep` is a separate r185 TSL graph. It reuses all existing
financial buffers and writes state to `pathBlockBase` only during a regime
run. No buffer, uniform, storage binding, or model switch is added. State and
indices remain uint-typed; separate float variables feed return arithmetic, so
no `select()` result crosses the r185 uint/float typing boundary.

The production SwiftShader probe Tint-compiles the graph and reads back the
first 16 month-zero states. The measured GPU sequence
`0,0,1,0,0,0,0,1,0,0,0,1,0,0,1,0` exactly matches the CPU mirror. This is
graph/binding/parity evidence, not a physical-GPU performance measurement.

## 7. Four-model frontier semantics

A complete frontier evaluates candidates sequentially in this exact order:

```text
gbm → bootstrap → fattail → regime
```

The first three remain the frozen primary model family. Regime is
frontier-only. Every candidate receives identical committed financial inputs,
seed, spending point, and analysis count: 100,000 paths on GPU or 10,000 paths
on CPU. Results publish once, only after all four capacities exist. Robust
spending is the minimum measured non-null 90% capacity across the complete
included set.

The deterministic CPU validator fixes seed 42, 10,000 paths, a 30-year
retirement beginning immediately, $1,000,000 initial wealth, $2,000 monthly
contribution, $5,000 monthly withdrawal, and an 80% to 60% equity glidepath.
Measured output:

| Model | Current success | P50 terminal wealth | Worst-decile DD | Tested 90% capacity | Capacity success | Evaluations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GBM | 51.49% | $35,653.86 | 100.0% | $3,632.8125/mo | 90.26% | 10 |
| Historical bootstrap | 60.31% | $354,621.58 | 100.0% | $3,476.5625/mo | 90.44% | 10 |
| Student-t(5) | 51.58% | $38,734.97 | 100.0% | $3,632.8125/mo | 90.49% | 10 |
| Regime-t, latest-filtered | 64.91% | $413,119.59 | 100.0% | $3,984.3750/mo | 90.46% | 9 |

All four searches converged on actually evaluated points; direct capacity
reruns reproduced the same success counts, and every measured curve had zero
upward reversal. The current-plan structural range is 51.49%-64.91%, or 13.42
percentage points. Robust spending remains $3,476.5625/month because historical
bootstrap is the limiting model. Regime-t is materially different but is not
automatically the most pessimistic model--a useful reminder that persistence is
an assumption lens, not a synonym for stress.

The explicit **Run robustness frontier** action remains the only trigger.
Draft controls and lens visibility do not run it. Supersession aborts the
owned job and suppresses stale publication. GPU candidates reuse shared
buffers sequentially; the selected primary simulation is restored before the
complete result is committed. A non-abort error attempts restoration and
publishes no frontier if either analysis or restoration fails.

## 8. Interpretation and limitations

- The calibration data are US-only and may embed US exceptionalism.
- The two states are parsimonious latent statistical classes, not two literal
  market conditions and not labels for known future events.
- Latest-filtered initialization is conditional on data through 2026-06. It is
  not a market call. Stationary initialization appears only as validation
  sensitivity.
- The scale HMM has a common conditional mean and covariance shape. It models
  persistent scale, not state-dependent expected returns or correlations.
- Parameter uncertainty is not mixed into displayed paths.
- The structural range is not a confidence interval and carries no model
  probabilities or model weights.
- Robust spending is a tested 90% simulation threshold, not individualized
  advice, a guarantee, or an inferred result between evaluated points.
- Regime-t ignores the `mu` and `sigma` sliders by design.
- Physical-GPU regime/frontier performance remains unmeasured.

For the same 10,000 paths and seed, stationary initialization produced 64.68%
current success, $421,326.63 P50 terminal wealth, and median failure year 23.25,
versus 64.91%, $413,119.59, and year 23.33 under latest-filtered
initialization. The application publishes latest-filtered only. The small
0.23-point success difference is disclosed as sensitivity, not presented as a
second model.

## 9. Reproducible gates

```text
npm run check:regime-calibration
npm run test:regime
npm run test:frontier
npm run test:frontier-validate
npm run test:compute-probe
```

The mandatory full-project baseline remains the final integration gate. Exact
four-model capacity and initialization-sensitivity outputs belong in
`validation/REPORT.md` and `DEMO.md`; they must be copied only from the live
validation command, never estimated here.
