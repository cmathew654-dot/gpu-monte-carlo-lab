# GPU Monte Carlo Lab

**A client-meeting tool for the hardest conversation in retirement planning.**
One million simulated futures of a client's money run live on the GPU, and the
screen translates the statistics into a single sentence a client actually
understands: *"In 70 of 100 futures, your money outlives you."* (That's the
real opening number: $1M, $5,000/month, 30 years, replayed against every US
market regime since 1926 — 100,000-path reference run, seed 42, success rate
69.8%.) Drag the spending slider and the sentence, the mountain, and every
failing future update in about a frame.

> 🎥 Live demo + GIF: link added on publish

## Why this matters for wealth management

- **It makes sequence-of-returns risk a conversation, not a lecture.** Clients
  see that the danger isn't one bad month — it's bad years arriving in clusters
  right around retirement, while withdrawals are flowing. That is the point the
  4%-rule soundbite can't carry.
- **It goes beyond the soundbite honestly.** The default plan is a deliberate
  6% initial withdrawal rate — which fails about a third of the time even in
  the best-documented market in history. The opening screen starts the most
  important spending conversation an advisor has.
- **One engine, two audiences.** The same simulation drives a calm client view
  (a mountain, a sentence, two sliders) and a full advisor terminal (five
  statistics, three return models, scenario presets). No numbers are hidden;
  they're just translated.

## What you're looking at

**Client view.** Mt. Rainier, rendered from real USGS elevation data (NED /
SRTM via Mapzen Terrarium). Each simulated future is an ascent trail climbing
the mountain — altitude is wealth. Futures where the money runs out ignite as
embers and slide downhill. A single gold thread up the middle is the median
outcome. The only text on screen is the sentence and, when it matters, a
second line: *"When it fails, it fails around year 19."*

**Advisor view.** Five statistics in plain English, all read back from the
same simulated paths: probability of success, terminal-wealth percentiles
(P5 / P50 / P95), worst-decile drawdown, the safe withdrawal rate that history
would have supported 90% of the time, and the median failure year. Presets
load five real client archetypes (early retiree, pre-retiree glidepath,
fat-tail skeptic, overspender, young saver) — each scripted as a meeting in
[DEMO.md](DEMO.md).

## Data & methodology

Every simulated future is drawn from, or calibrated against, Robert Shiller's
public *Irrational Exuberance* dataset — the standard academic long-horizon US
series, spanning the Depression, the 1970s, and 2008. The shipped series is
**1,206 monthly real total returns, 1926-01 → 2026-06**, for equities and
10-year Treasuries; the build pipeline re-derives Shiller's own Real Total
Return column to a max difference of 5.6e-16 and is fully reproducible
(`python3 src/data/build_historical.py` re-downloads the workbook).

Three return models, switchable live under the same plan:

- **Bootstrap (default)** — whole 12-month blocks of real history, replayed,
  so volatility regimes stay intact.
- **GBM** — classic lognormal market, μ = 7% / σ = 15% real (deliberately
  haircut below the realized 8.2% historical mean).
- **Fat-tail** — Student-t (ν = 5) innovations, so crash-prone months occur
  roughly an order of magnitude more often than a bell curve says.

Every default is defended number-by-number against the dataset in
[docs/calibration.md](docs/calibration.md) — the page to open when a client
or compliance asks *"why these assumptions?"*

## How it's validated

- **260 automated checks, all green** — simulation kernel, statistics, data
  pipeline, and a falsification-driven validation matrix
  (`npm run test:sim` / `test:stats` / `test:validate`).
- **Bit-exact determinism:** same seed and parameters produce byte-identical
  results — the 10k-path run is an exact subset of the 100k run.
- **A CPU reference engine cross-validates the GPU** against analytic
  lognormal moments and fixed tolerances; GPU↔CPU parity gates are defined
  and measured.
- **Exceptions are disclosed, not buried.** The full QA report —
  [validation/REPORT.md](validation/REPORT.md) — ships with a SHIP verdict
  *and* its honest caveat: real-hardware frame-rate and GPU-parity checks are
  specified as a protocol and pending first access to a physical GPU (the CI
  container's software renderer can't measure them). Known model behaviors
  (e.g. monthly fat tails barely moving 30-year ruin probability) are
  documented as findings and built into the demo script.

## Limitations

Volunteered, because a tool shown in client meetings should say what it can't
do (details in calibration.md §7 and §3):

- **US exceptionalism.** 1926–2026 US equities are the best-performing large
  market in history; the bootstrap can only replay that history and cannot
  produce a Japan-1989 scenario the data doesn't contain.
- **Stationarity.** The bootstrap assumes the future resembles the pooled
  past — a modeling choice, which is exactly why the GBM and fat-tail models
  exist as alternative lenses on the same plan.
- **12-month blocks can't chain a depression.** A 1929–32 sequence can appear
  only as luckily-chained bad years, never as one guaranteed four-year
  collapse — the tool understates multi-year regime persistence.
- **All-real-dollars convention.** Everything is inflation-adjusted; "failure"
  means real purchasing power exhausted. That's the honest convention, but
  clients think in nominal dollars and the translation is the advisor's job.

## A note on process

This project was built with an orchestrated multi-agent workflow, and the git
history says so — specialist agents for the simulation kernel, data pipeline,
statistics, visualization, and UI, each working against frozen interface
contracts ([docs/CONTRACTS.md](docs/CONTRACTS.md)) with a single independent
QA gate ([validation/REPORT.md](validation/REPORT.md)) empowered to block
shipping. The gate did block it, twice; the findings were routed, fixed, and
re-verified before the SHIP verdict. The process is the point: spec-first
contracts, reproducible data, every claim tied to a command that re-derives
it. The same discipline applies whether the contributor is a person or an
agent — the contracts and the gate don't care who typed the code.

## Roadmap

Three analysis layers are in progress:

- **Model triangulation** — report success as a range across all three return
  models instead of a single number, so assumption sensitivity is visible at
  a glance.
- **Historical gauntlet** — score the plan against the worst actual cohorts
  since 1926 (retire 1929, 1966, 1973, 2000) as named, dated stress cases.
- **Magnitude-of-failure metrics** — failure has a size: how much is missing,
  and for how long, when the money runs out — not just whether it does.

## Tech stack

TypeScript · React · three.js WebGPU (TSL compute, 1M paths) · zustand · Vite · CPU fallback engine for non-WebGPU browsers.

## Run it

```bash
npm install
npm run dev
```

Open in a WebGPU-capable browser (Chrome/Edge, Safari 26+) for the full 3D
view at up to 1,000,000 paths. Any other browser automatically falls back to
the CPU engine at 10,000 paths — every statistic and demo scenario still
works. `npm run build` for production; see package.json for the test suites.

## Repo map

- [DEMO.md](DEMO.md) — five scripted client conversations, every number
  produced by the real engine.
- [docs/calibration.md](docs/calibration.md) — the assumption-defense doc;
  [docs/](docs) also holds the frozen contracts, TSL audit, and integration
  notes. [validation/REPORT.md](validation/REPORT.md) — the QA gate report.
- `src/sim/` — GPU compute kernels, the three return models, statistics,
  and the CPU reference engine. `src/data/` — the Shiller pipeline and
  scenario presets. `src/validation/` — the validation matrix and probes.
- `src/scene/` — the 3D visualization (mountain client view, cone advisor
  view); `src/ui/` — HUD, controls, advisor stat rail; `src/store/` — the
  single zustand store wiring it together.
- `probe/` — a headless-Chromium harness that compiles the real production
  shader graphs through Tint and commits the emitted WGSL as reviewable
  snapshots (see `probe/README.md`).

## License

[MIT](LICENSE) © 2026 GPU Monte Carlo Lab contributors.
