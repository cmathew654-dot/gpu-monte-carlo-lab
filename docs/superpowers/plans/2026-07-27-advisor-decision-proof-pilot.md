# Advisor Decision-Proof Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a frozen synthetic retirement case, a privacy-safe professional evaluation protocol, evidence-backed usability repairs, and a portfolio package showing that advisors can use and explain the product correctly.

**Architecture:** Deterministic Node builders generate and validate the case and session evidence from current production engines. Human sessions create small anonymized JSON records consumed by a pure gate/triage reporter. Because observed failures cannot be known in advance, this plan deliberately pauses after severity ranking for one focused repair spec and implementation plan, then resumes for post-repair verification and packaging.

**Tech Stack:** TypeScript 5.9, Node ESM, existing CPU Frontier/Gauntlet engines, JSON evidence contracts, Markdown documentation, existing React UI tests and full repository release gate.

## Global Constraints

- Begin only after the Physical GPU Evidence milestone passes correctness, stale-result, device-loss recovery, browser cleanup, sanitization, and full-release gates.
- Use only synthetic household inputs; never collect or commit real client data.
- Minimum evidence is three formal professionals on protocol v1, with at least two new to product design. The design-partner session is protocol v0 and does not count.
- Six critical tasks: plan/result, robust spending, model disagreement, named history, next plan lever, and limitations.
- At least 75% of all formal critical-task attempts must be correct without coaching; every task must be completed independently by at least two formal participants.
- Every formal participant must finish able to distinguish tested comparison from guarantee, prediction, confidence interval, and personalized recommendation.
- At least two formal participants must identify a specific client-conversation use case.
- Select up to the three highest-severity observed failures. Every selected failure must be repaired or rejected with documented rationale; if fewer than three distinct evidence-backed failures exist, disposition all observed failures and do not invent more.
- At least one protocol-v1 participant who never saw the unrepaired workflow must verify a targeted repair.
- Do not add authentication, analytics, telemetry services, client-data storage, billing, accounts, or commercial compliance infrastructure.
- Do not add or change a return model, frozen simulation contract, worker protocol, buffer layout, seed stream, or financial operation order.
- Do not claim statistical generalizability, market demand, purchase intent, or commercial readiness from three-to-five sessions.
- Production deployment requires explicit authorization immediately before deployment and a green release gate.

---

### Task 1: Pilot evidence and privacy contract

**Files:**
- Create: `validation/pilot/types.ts`
- Create: `validation/pilot/sessionContract.ts`
- Create: `validation/pilot/sessionContract.test.mjs`
- Create: `validation/pilot/validate-session.mjs`
- Create: `validation/pilot/fixtures/session-valid.json`
- Modify: `package.json`

**Interfaces:**
- Produces: `PILOT_SCHEMA_VERSION`, `CRITICAL_TASK_IDS`, `PilotSessionRecord`, `validatePilotSession(value)`, and CLI `node validation/pilot/validate-session.mjs validation/pilot/sessions/P02-formal.json`.
- Consumed later by: aggregation, triage, and final report builders.

- [ ] **Step 1: Write the failing privacy and shape tests**

```js
import assert from 'node:assert/strict';
import valid from './fixtures/session-valid.json' with { type: 'json' };
import {
  CRITICAL_TASK_IDS,
  PILOT_SCHEMA_VERSION,
  validatePilotSession,
} from './sessionContract.ts';

assert.equal(PILOT_SCHEMA_VERSION, 1);
assert.deepEqual(CRITICAL_TASK_IDS, [
  'plan-result',
  'robust-spending',
  'model-disagreement',
  'named-history',
  'next-lever',
  'limitations',
]);
assert.deepEqual(validatePilotSession(valid), valid);
for (const forbidden of ['name', 'email', 'firm', 'phone', 'recordingPath']) {
  assert.throws(
    () => validatePilotSession({ ...valid, [forbidden]: 'identifying value' }),
    /forbidden participant field/,
  );
}
assert.throws(
  () => validatePilotSession({ ...valid, participantCode: 'Cyril' }),
  /participantCode/,
);
assert.throws(
  () => validatePilotSession({ ...valid, tasks: valid.tasks.slice(0, 5) }),
  /exactly six critical tasks/,
);
```

- [ ] **Step 2: Add the pilot test command and verify RED**

Add:

```json
"test:pilot": "esbuild validation/pilot/sessionContract.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/pilot-session-contract.test.mjs && node node_modules/.tmp/pilot-session-contract.test.mjs"
```

Run `npm run test:pilot`.

Expected: FAIL because the contract does not exist.

- [ ] **Step 3: Define exact record types**

```ts
export const CRITICAL_TASK_IDS = [
  'plan-result',
  'robust-spending',
  'model-disagreement',
  'named-history',
  'next-lever',
  'limitations',
] as const;

export type CriticalTaskId = typeof CRITICAL_TASK_IDS[number];

export interface PilotTaskAttempt {
  taskId: CriticalTaskId;
  correct: boolean;
  coached: boolean;
  elapsedMs: number;
  issueIds: string[];
  observerNote: string;
}

export interface PilotSessionRecord {
  schemaVersion: 1;
  participantCode: 'P01' | 'P02' | 'P03' | 'P04' | 'P05';
  role: 'design-partner' | 'formal';
  protocolVersion: 0 | 1;
  phase: 'pre-repair' | 'post-repair';
  sessionDate: string;
  consent: { notes: true; recording: boolean };
  priorProductInvolvement: boolean;
  tasks: PilotTaskAttempt[];
  finalInterpretation: {
    notGuarantee: boolean;
    notPrediction: boolean;
    notConfidenceInterval: boolean;
    notPersonalizedRecommendation: boolean;
  };
  useCase: { specific: boolean; anonymizedSummary: string };
}
```

The validator rejects extra root fields, duplicate/missing task IDs, negative/non-finite elapsed time, participant codes outside P01–P05, non-ISO dates, free text containing email/phone patterns, absolute paths, and secret-like keys. `P01` must be `design-partner`/protocol 0; P02–P05 must be `formal`/protocol 1.

`validate-session.mjs` parses every supplied JSON path, validates it, prints the validated code such as `P02: valid`, and exits nonzero on the first parse/privacy/shape error without rewriting the record.

- [ ] **Step 4: Create a non-identifying valid fixture**

Use this complete fixture:

```json
{
  "schemaVersion": 1,
  "participantCode": "P02",
  "role": "formal",
  "protocolVersion": 1,
  "phase": "pre-repair",
  "sessionDate": "2026-07-27",
  "consent": { "notes": true, "recording": false },
  "priorProductInvolvement": false,
  "tasks": [
    { "taskId": "plan-result", "correct": true, "coached": false, "elapsedMs": 60000, "issueIds": [], "observerNote": "Identified the committed inputs and result." },
    { "taskId": "robust-spending", "correct": true, "coached": false, "elapsedMs": 45000, "issueIds": [], "observerNote": "Used the complete all-model tested level." },
    { "taskId": "model-disagreement", "correct": true, "coached": false, "elapsedMs": 50000, "issueIds": [], "observerNote": "Attributed the range to model assumptions." },
    { "taskId": "named-history", "correct": true, "coached": false, "elapsedMs": 40000, "issueIds": [], "observerNote": "Distinguished failure from exhausted data." },
    { "taskId": "next-lever", "correct": true, "coached": false, "elapsedMs": 35000, "issueIds": [], "observerNote": "Selected one plan lever and explained why." },
    { "taskId": "limitations", "correct": true, "coached": false, "elapsedMs": 30000, "issueIds": [], "observerNote": "Rejected certainty and advice interpretations." }
  ],
  "finalInterpretation": {
    "notGuarantee": true,
    "notPrediction": true,
    "notConfidenceInterval": true,
    "notPersonalizedRecommendation": true
  },
  "useCase": {
    "specific": true,
    "anonymizedSummary": "Compare a proposed retirement budget with the all-model tested level before discussing trade-offs."
  }
}
```

- [ ] **Step 5: Run tests and TypeScript**

```powershell
npm run test:pilot
npx tsc -b
```

Expected: both exit zero.

- [ ] **Step 6: Commit**

```powershell
git add package.json validation/pilot/types.ts validation/pilot/sessionContract.ts validation/pilot/sessionContract.test.mjs validation/pilot/validate-session.mjs validation/pilot/fixtures/session-valid.json
git commit -m "test: define advisor pilot evidence contract"
```

---

### Task 2: Deterministic canonical-case selection

**Files:**
- Create: `validation/pilot/caseCriteria.ts`
- Create: `validation/pilot/caseCriteria.test.mjs`
- Create: `validation/pilot/buildPilotCase.ts`
- Create: `validation/pilot/pilot-case.json`
- Create: `docs/pilot/CANONICAL_CASE.md`
- Modify: `package.json`

**Interfaces:**
- Produces: `evaluateCaseCandidate(candidate)`, `selectFirstQualifiedCase(candidates)`, and generated `PilotCaseManifest`.
- Consumes: real `computeCpuFrontier`, `computeGauntletSnapshot`, `DEFAULT_SIM_PARAMS`, and the shipped historical data through existing production imports.

- [ ] **Step 1: Write failing pure criteria tests**

```js
import assert from 'node:assert/strict';
import {
  evaluateCaseCandidate,
  selectFirstQualifiedCase,
} from './caseCriteria.ts';

const qualified = {
  id: 'case-a',
  proposedSpending: 4_000,
  robustSpending: 3_500,
  modelSuccessRates: [0.61, 0.72, 0.63, 0.75],
  historicalStatuses: ['survived', 'failed', 'survived', 'exhausted'],
  intervention: { type: 'spending', monthlySpending: 3_500 },
};
assert.deepEqual(evaluateCaseCandidate(qualified), {
  spendingPremium: 4_000 / 3_500 - 1,
  modelSpread: 0.14,
  historyDiscriminates: true,
  interventionCrossesRobustLevel: true,
  qualified: true,
});
assert.equal(evaluateCaseCandidate({ ...qualified, proposedSpending: 5_000 }).qualified, false);
assert.equal(evaluateCaseCandidate({ ...qualified, modelSuccessRates: [0.7, 0.72, 0.71, 0.73] }).qualified, false);
assert.equal(selectFirstQualifiedCase([{ ...qualified, id: 'first' }, { ...qualified, id: 'second' }]).id, 'first');
assert.throws(() => selectFirstQualifiedCase([{ ...qualified, proposedSpending: 5_000 }]), /no candidate met every gate/);
```

- [ ] **Step 2: Add the case test to `test:pilot` and verify RED**

Expected: FAIL because `caseCriteria.ts` does not exist.

- [ ] **Step 3: Implement criteria without outcome cherry-picking**

`evaluateCaseCandidate` passes only when:

```ts
const spendingPremium = proposedSpending / robustSpending - 1;
const modelSpread = Math.max(...modelSuccessRates) - Math.min(...modelSuccessRates);
const historyDiscriminates = historicalStatuses.some(
  (status) => status === 'failed' || status === 'exhausted',
);
const interventionCrossesRobustLevel =
  intervention.type === 'spending'
  && intervention.monthlySpending <= robustSpending;
const qualified =
  spendingPremium >= 0.10
  && spendingPremium <= 0.25
  && modelSpread >= 0.05
  && historyDiscriminates
  && interventionCrossesRobustLevel;
```

Selection is the first qualified candidate in declared order; it never sorts by dramatic loss, lowest success, or largest spread.

- [ ] **Step 4: Build the fixed candidate grid**

Start from:

```ts
const BASE = {
  ...DEFAULT_SIM_PARAMS,
  model: 'bootstrap',
  pathCount: 10_000,
  horizonYears: 30,
  initialWealth: 1_000_000,
  contribution: 2_000,
  mu: 0.07,
  sigma: 0.15,
  seed: 42,
};
```

Enumerate in this exact order:

- retirement year: `0`, `2`, `5`;
- glidepath: `{ start: 0.8, end: 0.6 }`, `{ start: 0.7, end: 0.5 }`, `null`;
- proposed monthly spending: `3_500`, `3_750`, `4_000`, `4_250`, `4_500`, `4_750`, `5_000`.

For each candidate, run the real 10K CPU four-model Frontier and real deterministic Gauntlet. Set the intervention to the robust tested spending rounded down to the nearest $25. Stop at the first candidate satisfying all gates. If none qualifies, exit nonzero and change no generated files; expanding the grid requires an explicit spec revision.

- [ ] **Step 5: Generate versioned machine and human artifacts**

Define the generated type explicitly:

```ts
export interface PilotCaseManifest {
  schemaVersion: 1;
  sourceCommit: string;
  caseId: string;
  params: SimParams;
  frontier: RobustnessFrontier;
  gauntlet: GauntletSnapshot['result'];
  intervention: { type: 'spending'; monthlySpending: number };
  criteria: {
    spendingPremium: number;
    modelSpread: number;
    historyDiscriminates: boolean;
    interventionCrossesRobustLevel: boolean;
    qualified: true;
  };
  conventions: { dollars: 'real'; spending: 'level-monthly' };
  omittedInputs: string[];
}
```

`pilot-case.json` contains source commit, full inputs, all four model outcomes, robust result, six cohort statuses, intervention, criteria calculations, real-dollar convention, and omitted household inputs. `CANONICAL_CASE.md` is generated from that JSON and contains no manually copied number.

Add:

```json
"build:pilot-case": "esbuild validation/pilot/buildPilotCase.ts --bundle --platform=node --format=esm --outfile=node_modules/.tmp/buildPilotCase.mjs && node node_modules/.tmp/buildPilotCase.mjs",
"check:pilot-case": "npm run build:pilot-case -- --check"
```

`--check` regenerates in memory and byte-compares normalized LF content.

- [ ] **Step 6: Run generation, checks, and existing validators**

```powershell
npm run build:pilot-case
npm run check:pilot-case
npm run test:pilot
npm run test:gauntlet
npm run test:frontier-validate
```

Expected: generated case passes every design gate and all commands exit zero.

- [ ] **Step 7: Commit**

```powershell
git add package.json validation/pilot/caseCriteria.ts validation/pilot/caseCriteria.test.mjs validation/pilot/buildPilotCase.ts validation/pilot/pilot-case.json docs/pilot/CANONICAL_CASE.md
git commit -m "docs: freeze canonical advisor pilot case"
```

---

### Task 3: Facilitator protocol, rubric, and consent

**Files:**
- Create: `docs/pilot/SESSION_PROTOCOL.md`
- Create: `docs/pilot/OBSERVER_RUBRIC.md`
- Create: `docs/pilot/CONSENT.md`
- Create: `docs/pilot/RECRUITING_NOTE.md`
- Create: `validation/pilot/protocolContract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces protocol v0 for P01 and protocol v1 template for P02–P05.
- Consumes exact task IDs and canonical case labels.

- [ ] **Step 1: Write failing document contract tests**

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const protocol = readFileSync('docs/pilot/SESSION_PROTOCOL.md', 'utf8');
const rubric = readFileSync('docs/pilot/OBSERVER_RUBRIC.md', 'utf8');
const consent = readFileSync('docs/pilot/CONSENT.md', 'utf8');
for (const taskId of [
  'plan-result',
  'robust-spending',
  'model-disagreement',
  'named-history',
  'next-lever',
  'limitations',
]) {
  assert.match(protocol, new RegExp('`' + taskId + '`'));
  assert.match(rubric, new RegExp('`' + taskId + '`'));
}
assert.match(protocol, /Facilitator may clarify task wording/);
assert.match(protocol, /must not teach navigation/i);
assert.match(consent, /recording is optional/i);
assert.match(consent, /no client information/i);
assert.match(consent, /withdraw/i);
```

- [ ] **Step 2: Add the protocol test and verify RED**

Expected: FAIL because the pilot documents do not exist.

- [ ] **Step 3: Write the 30-minute session protocol**

Use this exact order:

1. Five-minute neutral context and think-aloud instruction.
2. `plan-result`: “Tell me what household plan is committed and explain the primary result as you would to a client.”
3. `robust-spending`: “What is the highest tested monthly spending at which every included model reaches the target?”
4. `model-disagreement`: “Why do the model results differ, and what does that disagreement mean?”
5. `named-history`: “Which named historical retirement is most concerning here, and did the historical record end before any case completed?”
6. `next-lever`: “Which single plan decision would you investigate next, and why?”
7. `limitations`: “What does this analysis not establish?”
8. Five-minute debrief and concrete-use questions.

The protocol defines an independent attempt, allowed clarification, prohibited coaching, timer start/stop, and the exact transition from task work to debrief.

- [ ] **Step 4: Write the observer rubric**

For each task define observable correct/incorrect criteria. Examples:

- `robust-spending` is correct only when the participant identifies the complete all-model real-monthly tested result, not a selected-model success rate or safe-withdrawal card.
- `named-history` distinguishes failure from exhausted data.
- `limitations` must reject all four prohibited interpretations.

Record coaching as `coached: true` even when the final answer becomes correct. Observer notes use behavior, not inferred personality.

- [ ] **Step 5: Write consent and recruiting copy**

Consent states synthetic case only, notes required, recording optional, no client or firm information, withdrawal at any time, anonymized repository output, and no compensation promise unless separately arranged. Recruiting copy asks for 30 minutes of workflow evaluation, not endorsement or investment advice.

- [ ] **Step 6: Run contract tests and commit**

```powershell
npm run test:pilot
git add package.json docs/pilot validation/pilot/protocolContract.test.mjs
git commit -m "docs: add advisor pilot evaluation kit"
```

---

### Task 4: Responsive release authorization and P01 design-partner session

**Files:**
- Create: `validation/pilot/sessions/P01-design-partner.json`
- Create: `validation/pilot/protocol-v1.json`
- Create: `docs/pilot/DESIGN_PARTNER_FINDINGS.md`
- Modify: `docs/pilot/SESSION_PROTOCOL.md`
- Modify: `docs/pilot/OBSERVER_RUBRIC.md`
- Modify: `validation/REPORT.md`
- Modify: `MEMORY.md`

**Interfaces:**
- Produces frozen protocol v1 and P01 directional findings.
- P01 does not count toward formal acceptance gates.

- [ ] **Step 1: Obtain deployment authorization**

Stop and ask Cyril to authorize deployment of current responsive `master` and record the decision; do not deploy yet. If authorization is withheld, plan to run sessions against a locally served production build and state in `validation/REPORT.md` and `MEMORY.md` that the latest UI is not public.

- [ ] **Step 2: Run the pre-session release gate**

```powershell
npx tsc -b
npm run lint
npm run test:framing
npm run test:pilot
npm run check:pilot-case
npm run build
```

Expected: all exit zero. If deployment was authorized in Step 1, now use the repository's hosting workflow to upload only this validated `dist`, verify HTTPS 200 and expected asset hashes, and record deployment ID/time in `validation/REPORT.md` and `MEMORY.md`. If any gate fails, do not deploy.

- [ ] **Step 3: Conduct P01 using protocol v0**

Use only the synthetic canonical case. Do not coach during task attempts. Enter the anonymized session record as `P01`, role `design-partner`, protocol 0, phase `pre-repair`. Do not commit recording paths or contact details.

- [ ] **Step 4: Validate P01 before analysis**

```powershell
node validation/pilot/validate-session.mjs validation/pilot/sessions/P01-design-partner.json
```

Expected: valid privacy-safe record.

- [ ] **Step 5: Freeze protocol v1**

`DESIGN_PARTNER_FINDINGS.md` separates:

- wording defects in the protocol;
- workflow/product defects;
- participant suggestions not supported by observed behavior.

Revise task wording only to remove ambiguity, never to point toward the correct control/result. Set protocol metadata to version 1 and freeze its SHA-256 digest in `validation/pilot/protocol-v1.json`.

- [ ] **Step 6: Commit**

```powershell
git add validation/pilot/sessions/P01-design-partner.json validation/pilot/protocol-v1.json docs/pilot/SESSION_PROTOCOL.md docs/pilot/OBSERVER_RUBRIC.md docs/pilot/DESIGN_PARTNER_FINDINGS.md validation/REPORT.md MEMORY.md
git commit -m "docs: freeze advisor pilot protocol"
```

---

### Task 5: Formal-session gate calculator

**Files:**
- Create: `validation/pilot/evaluateSessions.ts`
- Create: `validation/pilot/evaluateSessions.test.mjs`
- Create: `validation/pilot/renderFindings.ts`
- Create: `validation/pilot/run-evaluation.mjs`
- Create: `validation/pilot/sessions/P02-formal.json`
- Create: `validation/pilot/sessions/P03-formal.json`

- Create: `docs/pilot/FINDINGS.md`
- Modify: `package.json`

**Interfaces:**
- Produces: `evaluatePilotGate(records, repairs)`, `rankObservedIssues(records)`, and `npm run evaluate:pilot`.
- Consumes only validated protocol-v1 session records; ignores P01 for formal rates.

- [ ] **Step 1: Write failing gate tests**

```js
import assert from 'node:assert/strict';
import { CRITICAL_TASK_IDS } from './sessionContract.ts';
import { evaluatePilotGate } from './evaluateSessions.ts';

function formal(participantCode, overrides = {}) {
  return {
    schemaVersion: 1,
    participantCode,
    role: 'formal',
    protocolVersion: 1,
    phase: 'pre-repair',
    sessionDate: '2026-07-27',
    consent: { notes: true, recording: false },
    priorProductInvolvement: false,
    tasks: CRITICAL_TASK_IDS.map((taskId) => ({
      taskId,
      correct: true,
      coached: false,
      elapsedMs: 30_000,
      issueIds: [],
      observerNote: 'Completed independently.',
    })),
    finalInterpretation: {
      notGuarantee: true,
      notPrediction: true,
      notConfidenceInterval: true,
      notPersonalizedRecommendation: true,
    },
    useCase: {
      specific: true,
      anonymizedSummary: 'Use the tested spending comparison before discussing plan trade-offs.',
    },
    ...overrides,
  };
}

const records = [formal('P02'), formal('P03'), formal('P04', { phase: 'post-repair' })];
const repairs = [
  { issueId: 'ISSUE-001', rank: 1, status: 'verified' },
  { issueId: 'ISSUE-002', rank: 2, status: 'rejected-with-rationale' },
  { issueId: 'ISSUE-003', rank: 3, status: 'verified' },
];
const passing = evaluatePilotGate(records, repairs);
assert.equal(passing.professionalCount, 3);
assert.equal(passing.uncoachedCorrectRate, 1);
assert.equal(passing.everyTaskHasTwoIndependentSuccesses, true);
assert.equal(passing.everyParticipantRejectsFalseCertainty, true);
assert.equal(passing.specificUseCaseCount, 3);
assert.equal(passing.hasPostRepairParticipant, true);
assert.equal(passing.passed, true);

const coached = structuredClone(records);
for (const task of coached[0].tasks) task.coached = true;
assert.equal(evaluatePilotGate(coached, repairs).uncoachedCorrectRate, 12 / 18);
assert.equal(evaluatePilotGate(coached, repairs).passed, false);
assert.throws(() => evaluatePilotGate([formal('P02')], repairs), /three formal professionals/);
```

The `formal` builder above emits all six validated critical tasks and only explicit test overrides.

- [ ] **Step 2: Verify RED**

Add evaluator tests to `test:pilot` and run. Expected: FAIL because the evaluator does not exist.

- [ ] **Step 3: Implement exact gate arithmetic**

Filter to role `formal` and protocol version 1. Require at least three records and at least two with `priorProductInvolvement === false`. Calculate:

```ts
const attempts = formalRecords.flatMap((record) => record.tasks);
const uncoachedCorrect = attempts.filter((attempt) => attempt.correct && !attempt.coached);
const uncoachedCorrectRate = uncoachedCorrect.length / attempts.length;
const everyTaskHasTwoIndependentSuccesses = CRITICAL_TASK_IDS.every(
  (taskId) => formalRecords.filter(
    (record) => record.tasks.some(
      (attempt) => attempt.taskId === taskId && attempt.correct && !attempt.coached,
    ),
  ).length >= 2,
);
```

`passed` additionally requires rate ≥0.75, every limitation flag true for every formal record, ≥2 specific use cases, one post-repair record, complete dispositions for the selected issue set, and the participant/review counts. Define `RepairDisposition` with `issueId`, rank 1–3, and status `verified` or `rejected-with-rationale`; any other/missing status keeps the gate incomplete. The selected issue set must equal the first `Math.min(3, observedDistinctIssueCount)` entries from `rankObservedIssues(records)`, so an implementation cannot omit an observed high-severity issue or invent a filler.

- [ ] **Step 4: Add the evaluation CLI**

Add:

```json
"evaluate:pilot": "esbuild validation/pilot/run-evaluation.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/runPilotEvaluation.mjs && node node_modules/.tmp/runPilotEvaluation.mjs"
```

The CLI loads all files under `validation/pilot/sessions/`, validates them before aggregation, loads `validation/pilot/repairs.json` when present, writes `docs/pilot/FINDINGS.md`, and exits nonzero when the gate fails unless `--allow-incomplete` is explicit. `--write-issues` also writes deterministically ranked `validation/pilot/issues.json`.

- [ ] **Step 5: Conduct and validate P02 and P03**

Run the frozen protocol without coaching. Validate each JSON immediately. If a record fails privacy validation, correct or delete identifying content before any commit; never weaken the validator.

- [ ] **Step 6: Generate pre-repair findings**

`renderFindings` produces counts and anonymized observations only. It must label the milestone incomplete before P04 and before repair dispositions. It does not publish participant-level quotations.

- [ ] **Step 7: Commit pre-repair evidence**

```powershell
npm run test:pilot
npm run evaluate:pilot -- --allow-incomplete
git add validation/pilot/evaluateSessions.ts validation/pilot/evaluateSessions.test.mjs validation/pilot/renderFindings.ts validation/pilot/run-evaluation.mjs validation/pilot/sessions/P02-formal.json validation/pilot/sessions/P03-formal.json docs/pilot/FINDINGS.md package.json
git commit -m "docs: record pre-repair advisor findings"
```

---

### Task 6: Severity ranking and required repair-design checkpoint

**Files:**
- Create: `validation/pilot/issues.json`
- Create: `validation/pilot/repairs.json`
- Create: `docs/pilot/REPAIR_SPEC.md`
- Modify: `docs/pilot/FINDINGS.md`

**Interfaces:**
- Produces up to three ranked repair candidates and a focused repair spec.
- Blocks further implementation until the repair spec and its own implementation plan are approved.

- [ ] **Step 1: Rank observed issues deterministically**

Run `npm run evaluate:pilot -- --allow-incomplete --write-issues` after P02 and P03 validate.

Normalize issue IDs from session records. Severity order:

1. `critical`: participant ends the limitation task with a guarantee/advice/prediction misconception, or identifies a materially wrong decision number.
2. `high`: a critical task cannot be completed without coaching.
3. `medium`: task succeeds but only after navigation reversal, abandoned path, or incorrect intermediate interpretation.
4. `low`: wording/preference issue without task failure.

Within severity, sort by affected participant count descending, affected critical-task count descending, first task order, then issue ID. Select the first `Math.min(3, observedDistinctIssueCount)` entries. Suggestions without observed behavior remain unranked. If fewer than three evidence-backed failures exist, select all of them and record the smaller count explicitly.

- [ ] **Step 2: Create exact repair dispositions**

For each selected issue, `repairs.json` contains:

```json
{
  "issueId": "ISSUE-001",
  "rank": 1,
  "severity": "high",
  "observedParticipants": ["P02", "P03"],
  "tasks": ["robust-spending"],
  "disposition": "repair",
  "rationale": "Both formal participants selected a single-model number before finding the complete Frontier result.",
  "verificationTask": "robust-spending",
  "status": "designed"
}
```

`disposition` is `repair` or `reject`; rejection requires evidence-based rationale and still counts among the three required dispositions, not as a silent omission.

- [ ] **Step 3: Write the focused repair spec**

`REPAIR_SPEC.md` must include for each issue:

- exact observed behavior and participant codes;
- affected task and severity;
- root-cause hypothesis clearly labeled as hypothesis;
- smallest proposed product/copy/navigation change;
- frozen surfaces explicitly untouched;
- test and post-repair observation that would falsify the repair;
- paths expected to change after code inspection.

Do not invent a shared redesign unrelated to the three issues.

- [ ] **Step 4: Commit the evidence and repair design**

```powershell
git add validation/pilot/issues.json validation/pilot/repairs.json docs/pilot/REPAIR_SPEC.md docs/pilot/FINDINGS.md
git commit -m "docs: design evidence-backed pilot repairs"
```

- [ ] **Step 5: Pause for approval and generate the repair plan**

Stop. Ask Cyril to review the committed `REPAIR_SPEC.md`. After approval, invoke `superpowers:writing-plans` and create a separate dated repair implementation plan with exact files and TDD steps. Do not implement a repair from this pilot plan alone; the observed issue determines the actual files.

---

### Task 7: Post-repair independent verification

**Prerequisite:** The separately approved repair implementation plan is complete, its focused tests and full release gate pass, and `repairs.json` statuses are `implemented` or `rejected-with-rationale`.

**Files:**
- Create: `validation/pilot/sessions/P04-post-repair.json`
- Create: `docs/pilot/BEFORE_AFTER.md`
- Modify: `validation/pilot/repairs.json`
- Modify: `docs/pilot/FINDINGS.md`

**Interfaces:**
- Produces the independent post-repair record required by the acceptance gate.
- P04 must not have seen the unrepaired product.

- [ ] **Step 1: Verify the deployed/local build contains the repairs**

Run the repair plan's focused checks, `npm run build`, and verify the exact source commit used for P04. If production deployment is desired, obtain explicit authorization again before changing it.

- [ ] **Step 2: Conduct P04 on frozen protocol v1**

Use the same canonical case, task order, allowed clarification, timer rules, and observer rubric. Do not tell P04 which tasks were previously problematic.

- [ ] **Step 3: Validate the session and repair targets**

```powershell
node validation/pilot/validate-session.mjs validation/pilot/sessions/P04-post-repair.json
npm run evaluate:pilot
```

Expected: P04 independently completes at least one targeted verification task without recurrence. The overall gate also requires all aggregate thresholds.

- [ ] **Step 4: Update dispositions honestly**

Set each repair to `verified`, `failed-verification`, or `rejected-with-rationale`. A failed targeted repair reopens its mini-spec; do not relabel it successful because aggregate completion passes. `docs/pilot/BEFORE_AFTER.md` records every selected issue's pre-repair behavior, exact implemented/rejected disposition, focused tests, and P04 post-repair observation without participant-identifying prose.

- [ ] **Step 5: Commit**

```powershell
git add validation/pilot/sessions/P04-post-repair.json validation/pilot/repairs.json docs/pilot/FINDINGS.md docs/pilot/BEFORE_AFTER.md
git commit -m "docs: verify advisor pilot repairs"
```

---

### Task 8: Portfolio package, gap analysis, and final gate

**Files:**
- Create: `docs/pilot/COMMERCIAL_READINESS_GAPS.md`
- Create: `docs/pilot/DEMO_SCRIPT.md`
- Create: `docs/pilot/PILOT_SUMMARY.md`
- Modify: `README.md`
- Modify: `validation/REPORT.md`
- Modify: `MEMORY.md`
- Modify: `docs/superpowers/plans/2026-07-27-advisor-decision-proof-pilot.md`

**Interfaces:**
- Produces the final portfolio-grade pilot package and honest maturity statement.

- [ ] **Step 1: Generate the final findings report**

Run:

```powershell
npm run evaluate:pilot
```

Expected: report states participant count, uncoached correct rate, per-task independent successes, limitation comprehension, use-case count, every selected issue disposition, post-repair status, and whether the pilot gate passed. If it fails, publish the failed/incomplete status without softening thresholds. The same command writes `docs/pilot/PILOT_SUMMARY.md` from validated case, session, repair, and gate data; no metric is copied manually.

- [ ] **Step 2: Write commercial-readiness gaps**

Cover, at minimum:

- financial-advice and fiduciary boundary;
- privacy/security and retention;
- data licensing and update governance;
- accessibility and browser/device support;
- taxes, Social Security, pensions, mortality, medical spending, and account location;
- authentication, audit logs, persistence, support, incident response, and model governance.

Separate “required before another professional evaluation” from “required before a commercial pilot” and “required before production commercialization.”

- [ ] **Step 3: Write the five-minute demo script**

Use exact timing:

- 0:00–0:35 problem and product thesis;
- 0:35–1:20 committed synthetic plan and client result;
- 1:20–2:15 model disagreement and all-model robust spending;
- 2:15–2:55 named historical cohort;
- 2:55–3:35 one plan intervention;
- 3:35–4:15 physical-GPU/recovery evidence;
- 4:15–4:45 observed advisor failure and repair;
- 4:45–5:00 limitations and maturity.

Every number in the script links to the canonical case, physical evidence, or pilot findings. Record the final video outside the source tree or in an approved artifact host; commit only the script and stable public link, not a large binary, unless Cyril explicitly approves repository storage.

- [ ] **Step 4: Update public narrative**

README states:

- physical GPU measurements with device/browser/protocol link;
- directional professional sample size;
- what participants completed independently;
- one observed failure and repair;
- that the work is a portfolio-grade pilot, not a commercial planning platform.

Do not publish names, firms, endorsements, or implied market demand.

- [ ] **Step 5: Run pilot and artifact checks**

```powershell
npm run test:pilot
npm run check:pilot-case
npm run evaluate:pilot
npm run test:performance
```

Expected: all exit zero.

- [ ] **Step 6: Run the full repository release gate**

```powershell
npx tsc -b
npm run lint
npm run test:framing
npm run test:sim
npm run test:stats
npm run test:gauntlet
npm run test:validate
npm run test:probe-launcher
npm run test:triangulation
npm run test:frontier
npm run test:regime
npm run test:frontier-validate
npm run build
npm run test:compute-probe
node probe/run-viz5-probe.mjs
```

Expected: every command exits zero.

- [ ] **Step 7: Update durable memory**

Record source commit, canonical case digest, formal participant count, exact gate metrics, every selected issue disposition, post-repair result, deployment status, physical evidence link, unresolved risks, and frozen surfaces untouched.

- [ ] **Step 8: Commit the completed package**

```powershell
git diff --check
git add README.md validation/REPORT.md MEMORY.md docs/pilot docs/superpowers/plans/2026-07-27-advisor-decision-proof-pilot.md
git commit -m "docs: complete advisor decision-proof pilot"
```
