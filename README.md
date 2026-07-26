# GPU Monte Carlo Lab

**A client-meeting tool for the hardest conversation in retirement planning.**

GPU Monte Carlo Lab turns retirement math into a conversation an advisor can
hold in the room. The client sees a mountain of possible futures and one plain
sentence. The advisor can then interrogate the same plan across model
assumptions, historical retirement dates, failure severity, and a tested
spending frontier.

> 🎥 **Live demo:** [gpu-monte-carlo-lab.netlify.app](https://gpu-monte-carlo-lab.netlify.app)

## The 60-second read

- **Two views, one calculation.** A calm client view translates solvency into
  natural frequency; the advisor view keeps the distributions, drawdowns,
  failure timing, and model assumptions visible.
- **Three primary models, not one house view.** GBM, historical bootstrap, and
  Student-t are selectable live. Multi-stat triangulation puts their success
  rate, P50 terminal wealth, and worst-decile drawdown side by side.
- **A fourth lens answers a different question.** Regime-t appears only in the
  Robustness Frontier. It tests persistent volatility regimes; it is not a
  selectable primary model and not shorthand for “more stressful.”
- **Decision output, not dashboard decoration.** The Frontier searches for each
  model's highest actually tested monthly spend at roughly 90% success, then
  reports the lowest result as the robust floor.
- **History remains inspectable.** A six-cohort Historical Gauntlet replays
  actual monthly returns from 1929, 1937, 1966, 1973, 2000, and 2008.
- **Failure has a magnitude.** The tool reports when money runs out, the median
  years left unfunded, and the corresponding real, undiscounted obligation.

### Fixed A6 validation fixture

These are measured CPU results, not illustrative copy: $1,000,000 initial
wealth, $5,000 monthly spending, 30 years, an 80%→60% equity glidepath, 10,000
paths, and seed 42.

| Lens | Current success | P50 terminal wealth | Tested 90% capacity |
| --- | ---: | ---: | ---: |
| GBM | 51.49% | $35,653.86 | $3,632.8125/mo |
| Historical bootstrap | 60.31% | $354,621.58 | $3,476.5625/mo |
| Student-t(5) | 51.58% | $38,734.97 | $3,632.8125/mo |
| Regime-t, latest-filtered | 64.91% | $413,119.59 | $3,984.3750/mo |

All four searches converged on evaluated curve points. Direct reruns reproduced
the same success counts, and the measured curves had zero upward reversal. The
current-plan success range is **51.49%–64.91%**; the robust spending floor is
**$3,476.5625/month**, set by the historical bootstrap.

Regime-t is the most optimistic result in this fixture. That is useful evidence,
not an anomaly to hide: persistence is an orthogonal assumption lens, not a
synonym for stress.

## What the product lets an advisor ask

1. **Does this plan work?** The selected primary model drives the client
   sentence, mountain, terminal-wealth distribution, drawdown, and failure
   statistics.
2. **Does the answer survive different assumptions?** Triangulation runs all
   three primary models on identical financial inputs, seed, and path count.
   “Where the models disagree, the assumptions live.”
3. **How much spending survives every lens?** An explicit Frontier action
   evaluates GBM → bootstrap → Student-t → Regime-t. It shows each 90% capacity,
   the evaluated spending curve, and the minimum robust floor.
4. **What happened to real retirees?** The Historical Gauntlet replays six named
   retirement months against the exact observed equity and bond sequence,
   including ending wealth and the maximum supported withdrawal rate.
5. **If it fails, how bad is it?** Median failure year is paired with median
   shortfall years and median unfunded real withdrawals. Probability alone does
   not get to tell the whole story.

## What you're looking at

**Client view.** Mt. Rainier is rendered from USGS elevation data (NED / SRTM
via Mapzen Terrarium). Simulated futures climb the mountain as wealth paths.
Futures that exhaust the portfolio ignite as embers and slide downhill; a gold
thread marks the median outcome. The language stays client-readable:
*“In 70 of 100 futures, your money outlives you.”*

**Advisor view.** The field terminal exposes success probability, terminal
wealth percentiles, worst-decile drawdown, 90% spending capacity, median
failure year, and failure magnitude. Separate Futures, Gauntlet, and Frontier
lenses keep model sensitivity, historical evidence, and capacity search from
collapsing into one overloaded score.

The primary simulation supports up to 1,000,000 paths on WebGPU. Non-WebGPU
browsers use the 10,000-path CPU fallback. Frontier candidates run sequentially
at 100,000 paths on GPU or 10,000 paths on CPU so results publish as one
complete, internally consistent set.

## Models: three primary, one frontier-only

| Model | Selectable primary model | Triangulation | Robustness Frontier | Question it asks |
| --- | :---: | :---: | :---: | --- |
| Historical bootstrap | Yes | Yes | Yes | What if whole years from observed US history recur? |
| GBM | Yes | Yes | Yes | What does the classic lognormal baseline imply? |
| Student-t(5) | Yes | Yes | Yes | What changes when extreme monthly returns are more common? |
| Regime-t | No | No | Yes | What changes when joint volatility persists in latent regimes? |

The first three remain the product's selectable return-model family. Regime-t
is deliberately narrower: a two-state bivariate Student-t scale HMM calibrated
offline to paired equity and bond returns. The states share a conditional mean
and correlation structure; only covariance scale persists and switches.
Regime-t therefore does **not** model changing stock–bond correlation,
state-dependent expected returns, or named bull/bear regimes. Its
latest-filtered initialization is conditional on data through 2026-06, not a
market call.

## Data and methodology

Every simulated future is drawn from, or calibrated against, Robert Shiller's
public *Irrational Exuberance* dataset. The shipped series contains **1,206
monthly real total returns from 1926-01 through 2026-06** for equities and
10-year Treasuries. It spans the Depression, stagflation, the dot-com bust, and
the Global Financial Crisis.

The data build is reproducible:

```bash
python3 src/data/build_historical.py
node src/data/validate_data.mjs
```

The pipeline re-derives Shiller's Real Total Return column to a maximum
difference of 5.6e-16. [docs/calibration.md](docs/calibration.md) defends each
assumption against the source data and documents the Regime-t fit, acceptance
criteria, and limitations.

## Validation

The validation story is executable rather than adjectival:

```bash
npm run test:sim
npm run test:stats
npm run test:triangulation
npm run test:gauntlet
npm run test:regime
npm run test:frontier
npm run test:frontier-validate
npm run test:validate
npm run test:compute-probe
```

- Same seed and parameters produce byte-identical results; the 10,000-path run
  is an exact subset of the 100,000-path run.
- `test:validate` currently passes its 56-check falsification matrix, including
  analytic GBM moments, path-count independence, bootstrap calibration,
  scenario presets, and 90% withdrawal searches.
- `test:frontier-validate` runs the production four-model CPU frontier twice
  from fresh copied buffers, requires exact deterministic equality, reruns each
  converged capacity directly, and then executes Regime-t calibration and
  initialization-sensitivity acceptance. Elapsed time is reported separately
  from deterministic evidence and is not treated as a product-performance claim.
- The production WebGPU shader graphs are compiled through Tint and retained as
  reviewable WGSL snapshots. A CPU reference engine provides an independent
  numerical path.

Physical-GPU regime/frontier timing remains unmeasured. The software-rendered CI
environment can compile the production graphs and exercise CPU fallback, but it
cannot support an honest real-device performance claim.

## Limitations

- **US exceptionalism.** The historical evidence is a single unusually
  successful national market. It cannot manufacture a Japan-1989 experience
  absent from the source data.
- **Model range is not a confidence interval.** The four lenses carry no model
  weights or probabilities. The robust floor is a tested simulation threshold,
  not individualized advice or a guarantee.
- **Persistence is modeled narrowly.** Twelve-month bootstrap blocks cannot
  force a multi-year Depression sequence. Regime-t adds persistent volatility
  scale, but not changing expected returns or stock–bond correlation.
- **Latest-filtered can be optimistic.** In the fixed fixture Regime-t produced
  the highest current success and capacity. Stationary initialization is kept
  as validation-only sensitivity; the application publishes latest-filtered
  results.
- **All dollars are real.** Failure means real purchasing power is exhausted,
  and the unfunded obligation is real and undiscounted. Translating that into a
  nominal client plan remains the advisor's job.
- **Physical-GPU performance is open evidence.** Real-device timing and parity
  protocols are defined, but no physical-GPU timing number is claimed here.

## Status and roadmap

The analysis layers previously listed as roadmap items now ship in the product:
multi-stat model triangulation, the six-cohort Historical Gauntlet,
magnitude-of-failure presentation, the Robustness Frontier, and its
frontier-only Regime-t lens.

Remaining work is evidence and delivery, not another hidden analysis promise:
publish the live demo/GIF, run the documented performance protocol on physical
GPU hardware, and broaden the historical lens beyond US-only data before
claiming geographic robustness.

## A note on process

This project was built through frozen interface contracts and independent
verification gates. Specialist work on the simulation kernel, data pipeline,
statistics, visualization, and UI converged through
[docs/CONTRACTS.md](docs/CONTRACTS.md); the QA gate in
[validation/REPORT.md](validation/REPORT.md) was allowed to block shipping.
The standard is simple: a claim is either tied to a command that re-derives it,
or it is labeled as unmeasured.

## Tech stack

TypeScript · React · three.js WebGPU (TSL compute) · Zustand · Vite · CPU
fallback engine.

## Run it

```bash
npm install
npm run dev
```

Open in a WebGPU-capable browser (Chrome/Edge or Safari 26+) for the full 3D
view. Other browsers fall back to the CPU engine automatically. Use
`npm run build` for a production bundle and the commands above for focused
verification.

## Repo map

- [DEMO.md](DEMO.md) — scripted client conversations backed by engine output.
- [docs/calibration.md](docs/calibration.md) — source data, primary-model
  assumptions, Regime-t calibration, and limitations.
- [docs/AMENDMENT_A6.md](docs/AMENDMENT_A6.md) — the four-model Frontier and
  Regime-t runtime/acceptance contract.
- [validation/REPORT.md](validation/REPORT.md) — independent QA findings and
  ship gate.
- `src/sim/frontier/` — four-model capacity search and CPU/GPU adapters;
  `src/sim/regime/` — calibration artifact, HMM, runtime, and acceptance gates;
  `src/sim/gauntlet/` — deterministic historical-cohort replay.
- `src/sim/` — primary GPU/CPU simulation and statistics; `src/data/` — Shiller
  pipeline and scenario presets; `src/validation/` — fixed-fixture validators.
- `src/scene/` — Mt. Rainier client visualization and GPU work coordination;
  `src/ui/` — client/advisor surfaces; `src/store/` — simulation, gauntlet, and
  frontier state.
- `probe/` — headless-Chromium harness for production shader compilation and
  reviewable WGSL snapshots.

## License

[MIT](LICENSE) © 2026 GPU Monte Carlo Lab contributors.
