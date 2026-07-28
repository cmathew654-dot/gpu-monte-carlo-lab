---
status: approved
owner: Cyril
approved_at: 2026-07-27
scope: physical-GPU engineering evidence and advisor decision-proof pilot
---

# Portfolio-grade pilot evidence

## Problem

GPU Monte Carlo Lab is a technically credible portfolio product with a coherent
client/advisor experience, deterministic quantitative validation, a production
deployment, and a complete four-model Robustness Frontier. Its strongest
engineering and product claims still stop one step short of direct evidence:

- physical-GPU performance has not been measured under a reproducible protocol;
- CPU/GPU parity, cancellation, and device-loss recovery are tested in pieces
  but are not packaged as one reviewer-facing system record;
- no structured advisor study shows that domain professionals can use the
  product without coaching and interpret its limits correctly;
- the current public portfolio can demonstrate the interface, but cannot yet
  show how observed professional failures changed the product.

The next two-to-three-week effort must deepen proof rather than add breadth.
The target is a portfolio-grade pilot package that keeps both a senior
engineering portfolio and a small advisor pilot viable without pretending the
product is a regulated financial-planning platform.

## Approved strategy

Use a sequential proof ladder:

1. **Engineering evidence:** prove the existing engine on physical hardware.
2. **Decision evidence:** prove that professionals can use the existing engine
   to make and explain one bounded retirement-planning decision.

Milestone 2 begins only after Milestone 1's correctness and recovery gates pass.
Performance findings may improve implementation, but they do not authorize
changes to frozen simulation contracts. Any required quantitative-contract
change becomes a separate explicit amendment.

The RTX 3080 Ti on the primary Windows machine is the controlled performance
reference. A rented cloud GPU or second physical device is portability evidence,
not a consumer-device comparison and not a reason to publish hardware rankings.
Advisor laptops observed during Milestone 2 count as compatibility observations,
not controlled benchmarks.

## Milestone 1 — Engineering evidence system

### Outcome

Move from “technically credible” to “technically demonstrated.” One command
runs a versioned scenario manifest and produces sanitized raw JSON plus a
generated report. A reviewer can identify the exact source commit, inputs,
device, browser, run class, repetitions, results, and limitations without
trusting manually transcribed timings.

### Repository boundaries

The implementation plan must keep the new evidence system isolated:

- `validation/performance/` owns the benchmark page, scenario manifest, browser
  runner, result schema, report generator, and their tests.
- `validation/performance/results/` owns committed sanitized evidence records.
- `docs/performance/PHYSICAL_GPU_REPORT.md` is generated from committed results.
- Existing browser discovery and process cleanup should reuse `probe/` launcher
  utilities rather than introducing a second browser-location strategy.
- Production simulation, Frontier, GPU coordination, and recovery code remain
  the source under test. The harness may add test seams but must not fork or
  reproduce those implementations.

No raw environment dump, user path, account name, token, signed URL, or cloud
credential may enter an evidence artifact.

### Scenario manifest

The manifest freezes:

- Git commit and evidence schema version.
- Model, path count, horizon, retirement year, cash flows, allocation/glidepath,
  seed, and committed-run trigger.
- Browser channel/version, operating system version, adapter name, vendor/device
  identifiers when exposed, driver description when exposed, and WebGPU limits.
- Run class: cold, warm, CPU fallback, Frontier, visual, cancellation, or
  device-loss.
- Expected correctness source and the canonical parity contract.

Interactive GPU cells cover GBM, historical block bootstrap, and Student-t(5)
at 10,000, 100,000, and 1,000,000 paths. The complete four-model Frontier uses
the product's supported 10,000-path analysis count. CPU fallback covers its
product-capped 10,000-path cells; higher CPU path counts are excluded explicitly
rather than silently mixed into GPU evidence.

### Measurement protocol

On the primary RTX 3080 Ti:

- Each interactive GPU cell receives 10 cold repetitions and 30 warm
  repetitions.
- The complete Frontier receives 10 cold and 30 warm repetitions.
- CPU fallback receives 10 warm repetitions per supported model/path-count
  cell.
- Client and Advisor settled rendering each receive three 60-second frame-time
  captures at 982×800 after computation and reveal animation have completed.
- Cancellation and supersession receive 30 deterministic workflow repetitions.
- Device-loss recovery receives 10 repetitions through a test-only injection
  seam that enters the real production recovery path.

A cloud or second-device portability run uses three warm repetitions per
interactive GPU cell plus one complete Frontier. It is labeled a smoke run;
the report does not calculate or compare its p95 as though it were a controlled
performance sample.

Cold and warm observations are never pooled. Each controlled cell reports run
count, median, empirical p95, minimum, maximum, and every raw observation.
Arithmetic mean may be included but never appears alone. Timing boundaries are
named: compute dispatch/readback time, result-ready time, and full
interaction-to-stable-UI time remain separate.

Browser APIs do not provide a trustworthy portable GPU-memory measurement.
The report therefore separates:

- measured JavaScript/browser memory when a supported API is available;
- calculated GPU buffer allocation from production layouts;
- adapter-exposed limits;
- unavailable GPU-residency data.

Calculated allocation must never be labeled measured memory.

### Correctness and resilience gates

Milestone 1 passes only when:

- Fixed inputs reproduce the expected deterministic result after timestamps and
  other explicitly runtime-only fields are removed.
- CPU/GPU comparison satisfies the existing canonical contracts and validation
  tolerances; this spec introduces no looser benchmark-only tolerance.
- All cancellation and supersession repetitions prevent stale publication.
- All injected device-loss repetitions reach the existing functional CPU state
  without a page reload and without publishing a stale GPU result.
- Thirty consecutive end-to-end workflows complete with no uncaught exception,
  contradictory client/advisor claim, or orphaned browser process.
- Settled rendering reports frame-time distributions separately from compute
  latency. A p95 frame time above 20 ms at 982×800 triggers investigation and
  an explicit limitation or repair before the milestone is called complete.
- A controlled warm cell with p95 greater than twice its median is rerun once
  after environmental noise checks. If still unstable, the report marks it
  unstable and the milestone cannot make a stable-latency claim for that cell.
- The production build, repository release gate, compute probe, and Viz5 Tint
  probe remain green after any benchmark-driven repair.

The milestone does not require a preselected “impressive” latency. Honest
measurement, stability classification, correctness, and recovery are the
acceptance criteria. Optimization occurs only for a measured bottleneck.

### Engineering deliverables

- Versioned benchmark command and tested result schema.
- Primary RTX 3080 Ti raw evidence.
- One secondary portability record when a compatible WebGPU environment is
  available.
- Generated physical-GPU report and concise architecture narrative.
- Recorded cancellation/device-loss recovery demonstration.
- README/portfolio claims updated only from committed evidence.

If the cloud environment cannot expose a stable browser WebGPU adapter, replace
it with a second physical device or label secondary portability evidence
blocked. Do not substitute CUDA timing for browser WebGPU timing.

## Milestone 2 — Decision-proof pilot package

### Outcome

Move from “demonstrated engine” to “credible pilot instrument.” The product
must show that retirement-planning professionals can independently:

1. understand the committed plan and primary result;
2. identify the all-model robust tested spending level;
3. explain why accepted models disagree;
4. connect a named historical cohort to sequence risk;
5. choose a plan lever to investigate;
6. state what the analysis does not prove.

This is directional professional evidence from three-to-five sessions, not a
statistically representative usability study or evidence of commercial demand.

### Canonical synthetic case

One synthetic household case is frozen before formal sessions. It contains no
real client data. Its manifest records every engine input and measured output.
The selected case must satisfy all of the following under the current validated
engine:

- proposed spending is 10–25% above the complete all-model robust tested level;
- at least two accepted models differ by at least five percentage points of
  current-plan success;
- at least one named historical cohort fails or exhausts available history in a
  way the participant must interpret correctly;
- at least one plausible change to spending, retirement timing, or allocation
  changes the robust tested monthly spending by at least 5%, or moves proposed
  spending from above the robust level to at or below it;
- no outcome is chosen merely because it makes the product look favorable.

The case brief states the all-real-dollar convention and all material omitted
household inputs. Exact case numbers enter documentation only after the frozen
case is run through current validation.

### Session sequence

The first available advisor is the design partner. Their session may expose
obvious workflow or language failures before the formal protocol is frozen.
At least two of the final participants must not have helped design the product.

Each formal session lasts approximately 30 minutes:

- 5 minutes: neutral context and think-aloud instructions;
- 15 minutes: uncoached case tasks;
- 5 minutes: limitation and client-explanation exercise;
- 5 minutes: debrief and concrete-use questions.

The facilitator may clarify task wording but may not teach navigation, define a
model, or point to the correct result during an uncoached task. Coaching is
recorded as a failed independent attempt even if the participant later succeeds.
The six tasks listed under this milestone's outcome are the critical tasks used
in the acceptance calculation.

### Evidence capture and privacy

Use a fixed observer rubric to record:

- task correctness without coaching;
- time to first accurate client explanation;
- hesitation, navigation reversal, and abandoned-path notes;
- incorrect certainty, guarantee, prediction, or advice language;
- participant-native terminology;
- concrete client-conversation use cases;
- willingness to test an anonymized scenario or introduce another evaluator.

Participants receive a plain consent statement. Screen/audio recording is
optional and requires explicit consent. Raw recordings, names, firms, contact
details, and identifiable notes are not committed. The repository contains only
participant codes, anonymized task results, aggregate findings, and approved
short paraphrases.

No authentication, analytics service, server-side telemetry, or client-data
storage is added for this milestone.

### Decision-proof gates

Milestone 2 passes only when:

- At least three retirement-planning professionals complete the protocol, with
  at least two new to the product design.
- At least 75% of all critical task attempts are correct without coaching, and
  every individual critical task is completed independently by at least two
  participants.
- After the limitation exercise, every participant can state that the output is
  a tested model comparison rather than a guarantee, prediction, confidence
  interval, or personalized recommendation.
- Up to the three highest-severity observed workflow failures are repaired or
  explicitly rejected with documented rationale. If fewer than three distinct
  evidence-backed failures are observed, disposition every observed failure
  and do not invent additional issues to fill a quota.
- At least one post-repair session verifies that a targeted failure does not
  recur. This session may count among the three required participants only if
  that participant did not see the unrepaired workflow.
- At least two participants identify a specific client-conversation use case;
  generic praise does not satisfy this gate.
- Findings produce a severity-ranked backlog tied to observed evidence.

If fewer than three professionals are available by the end of the scheduled
window, complete the self-contained case and evaluation kit but label decision
proof incomplete. Do not replace missing professional evidence with friends,
synthetic personas, or model-generated feedback.

### Pilot deliverables

- Current responsive release deployed only after explicit deployment
  authorization and a green release gate.
- One-page canonical case brief and facilitator protocol.
- Observer rubric and anonymized findings report.
- Before/after record for every selected repair, up to the three
  highest-severity observed failures.
- One post-repair verification record.
- Five-minute narrated product demonstration.
- Commercial-readiness gap analysis covering advice boundary, privacy,
  compliance, data/licensing, household cash-flow scope, and support.
- Portfolio narrative connecting product judgment, quantitative rigor, GPU
  engineering, observed professional failures, and resulting decisions.

## Sequencing and schedule

The work is two sequential implementation plans under this design:

### Week 1

- Build and test the evidence schema, manifest, runner, and report generator.
- Add cancellation and device-loss drills through production paths.
- Run the controlled RTX 3080 Ti protocol.
- Attempt the secondary portability smoke run; if browser WebGPU is unavailable,
  record the environment as blocked under the documented fallback rule.
- Repair only measured engineering failures and rerun affected cells.

### Week 2

- Freeze the canonical case and observer rubric.
- Obtain explicit authorization to deploy the already-verified responsive
  release.
- Run the design-partner session.
- Repair obvious comprehension or workflow failures.
- Freeze the formal protocol and begin professional sessions.

### Week 3, if needed

- Complete three-to-five sessions and one post-repair verification.
- Finalize evidence, demo, gap analysis, and portfolio narrative.
- Re-run the full release gate and publish only substantiated claims.

Milestone 2 pauses if Milestone 1 finds an unresolved correctness, stale-result,
or recovery failure. Recruiting delay may extend the decision-evidence calendar
but does not justify expanding engineering scope.

## Contract and architecture impact

The approved work is evidence infrastructure, test seams, documentation, and
observed usability repair. It does not authorize:

- a new return model or a change to an accepted model;
- changes to `SimParams`, `SimStats`, worker protocols, buffer layouts, seed
  streams, or financial operation order;
- nominal/CPI modeling, taxes, Social Security, pensions, mortality, medical
  costs, account location, or international histories;
- authentication, persistence, billing, advisor/client accounts, or production
  storage of personal data;
- a performance claim derived from SwiftShader, CUDA, an uncontrolled cloud
  tenancy, or a single best run.

Any observed need that crosses these boundaries becomes a separately approved
design and contract amendment.

## Verification

Implementation plans must include:

- schema and report-generator unit tests;
- manifest validation and malformed-result rejection;
- launcher cleanup tests for success, timeout, abort, and browser crash;
- deterministic benchmark smoke tests that do not claim physical performance;
- physical RTX 3080 Ti protocol execution with committed sanitized output;
- real cancellation and injected device-loss workflow checks;
- full repository release gate, compute probe, and Viz5 probe;
- canonical-case output verification before any case number is published;
- observer-rubric consistency review before formal sessions;
- a final claim audit mapping every portfolio statement to code, committed
  evidence, or anonymized professional findings.

## Non-goals

- Adding quantitative breadth before the existing decision is understood.
- Producing statistically generalizable market research from three-to-five
  participants.
- Treating stated enthusiasm as purchase intent.
- Benchmarking expensive hardware for spectacle.
- Building a regulated SaaS platform.
- Optimizing before measurement identifies a bottleneck.
