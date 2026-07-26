---
document: product_contract
status: active
owner: Cyril
last_reviewed: 2026-07-26
review_trigger: product-thesis, audience, methodology, or ship-bar change
---

# GPU Monte Carlo Lab — Product Contract

`PRODUCT.md` is this repository's local product contract. The filename has no
special Codex behavior; `AGENTS.md` points to it deliberately.

## Register

product

## One-line product

A WebGPU retirement simulator that turns up to one million possible futures
into an honest client conversation about sequence risk, model uncertainty, and
the size—not merely the existence—of failure.

## Why it exists

Vanilla Monte Carlo compresses a plan into one seductive number: probability of
success. That number hides the assumptions that produced it, the historical
retirements that challenge it, and how severe failure would be.

GPU Monte Carlo Lab makes those missing layers inspectable:

1. **Model triangulation** reports the range across GBM, historical block
   bootstrap, and Student-t(5) returns.
2. **Historical gauntlet** replays six named retirement cohorts, including
   1929 and 1966, rather than blending them into anonymous random paths.
3. **Magnitude of failure** shows how many years and real dollars are typically
   unfunded when a plan fails.

The honest answer is often a range, not a point estimate.

## Users and jobs

### Financial advisor

- Stress-test a plan in a live meeting without turning the meeting into a
  statistics lecture.
- Explain which conclusion comes from the client's plan and which comes from
  the model.
- Compare spending, saving, and allocation decisions with defensible evidence.

### Retirement client

- Understand the plan in one calm sentence.
- See sequence-of-returns risk as an unfolding journey rather than a warning
  paragraph.
- Understand what failure would mean without alarmist language.

### Portfolio reviewer

- Understand the product thesis within 60 seconds.
- See evidence of financial-domain judgment, GPU engineering, contract design,
  deterministic testing, and honest limitation disclosure.

## Experience contract

### Client view

Mt. Rainier is the decision landscape. Simulated futures climb as blue trails;
failed futures become embers moving downhill; one gold path represents the
median. Copy leads with a natural frequency:

> In 70 of 100 futures, your money outlives you.

When all models have completed, the sentence becomes a range. When failures
exist, the second line states timing and typical magnitude in plain language.
Six historical cohort chips make named retirements tangible.

### Advisor view

The advisor sees the same simulation as statistical machinery: outcome
distribution, percentiles, safe withdrawal rate, worst-decile drawdown,
failure timing and magnitude, three-model triangulation, and a six-cohort
historical table.

No client and advisor number may disagree merely because it was computed in a
different presentation layer.

## Product principles

1. **Assumptions are visible.** Disagreement between models is information.
2. **History stays named.** “1966” is more useful than an anonymous bad path.
3. **Failure has magnitude.** Binary ruin statistics are not enough.
4. **Calm beats dramatic.** The visual metaphor may be cinematic; the copy is
   never theatrical.
5. **Measured beats impressive.** Claims cite reproducible commands or data.
6. **One engine, two altitudes.** Client simplicity must not erase advisor
   precision.
7. **Limitations ship with the feature.** US exceptionalism, stationarity,
   block-length limits, and all-real-dollar conventions remain disclosed.

## Visual direction

The interface is an alpine field instrument: Rainier-scale atmosphere,
glacial blue paths, ember-red failures, a restrained gold median, and
high-contrast typographic readouts. It should feel authored for retirement
risk—not like a generic KPI dashboard, a purple SaaS landing page, or a trading
terminal.

Motion communicates time, reveal, and failure state. It must never obscure a
number, delay core controls, or ignore reduced-motion preferences.

## Writing system

- Client: “In 70–74 of 100 futures…” and “When it fails…”
- Advisor: name the statistic, unit, population, and convention.
- Say “simulation,” “model,” or “historical cohort,” not “prediction.”
- Say “real dollars” where nominal/real ambiguity could matter.
- Avoid “guaranteed,” “safe” without its threshold definition, “AI-powered,”
  “revolutionary,” and false precision.
- Preserve: “Where the models disagree, the assumptions live.”

## Quantitative contract

- Up to 1,000,000 GPU paths; CPU fallback remains functional.
- Models: GBM, 12-month historical block bootstrap, Student-t(5).
- Historical data: 1,206 monthly real total returns, 1926-01 through 2026-06,
  including month-aligned equity and 10-year Treasury blocks.
- Deterministic seeding and CPU↔GPU lockstep are requirements, not amenities.
- Glidepath semantics and worst-decile drawdown follow Amendment A3.
- Frozen contracts live in `docs/CONTRACTS.md` and
  `docs/CONTRACTS_STATS.md`; calibration lives in `docs/calibration.md`.

## Accessibility and trust

- Target WCAG 2.2 AA for DOM UI, including keyboard access, visible focus,
  contrast, reduced motion, and non-color status cues.
- A checkmark, cross, label, or table value accompanies every success/failure
  color.
- The 3D scene enhances comprehension; all decision-critical values remain
  available in DOM text.
- CPU mode must remain a useful decision tool, not an error page.

## Non-goals

- Personalized financial advice, tax modeling, Social Security optimization,
  annuity quotes, or a comprehensive planning suite.
- Forecasting a single “most likely” market future.
- Hiding uncertainty to make a demo feel decisive.
- Changing frozen simulation interfaces for presentation convenience.
- Claiming real-hardware performance before it is measured.

## Success criteria

- A client can restate the primary result and the failure consequence.
- An advisor can explain why models disagree and identify the worst historical
  cohort.
- Every displayed statistic traces to one simulation or deterministic replay
  result.
- A technical reviewer can reproduce the documented baseline.
- A recruiter can understand the product, differentiator, and engineering depth
  in a 60-second skim.

## Ship bar

All commands in the root `AGENTS.md` pass. Any unavailable hardware validation
is disclosed with a reproducible protocol. README and demo numbers come from
current validation output, never memory or estimation. A static deployment,
live URL, and visual artifact complete the portfolio handoff.

## Open product questions

- Which triangulation range warrants explicit advisor attention beyond simple
  min–max highlighting?
- Should client copy name the most conservative model, or keep model identity
  in advisor view?
- What historical-data exhaustion language is clearest without implying a
  simulated failure?
- What physical-GPU device set is sufficient for a credible performance claim?
