# Physical GPU Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible physical-WebGPU evidence system that measures the real production application on the RTX 3080 Ti, verifies correctness and recovery, and generates sanitized reviewer-facing artifacts.

**Architecture:** A query-gated browser bridge observes the existing simulation, Frontier, store, and device-loss paths without duplicating them. A Node runner drives controlled cold/warm matrices through system Chrome, validates versioned JSON evidence, and generates a Markdown report. Runtime instrumentation is an additive event bus and benchmark-only rerun seam; frozen simulation contracts remain untouched.

**Tech Stack:** TypeScript 5.9, Node ESM, React 19, Zustand 5, three.js/WebGPU 0.185.1, Playwright Core 1.58.0, Vite 7, Node test assertions.

## Global Constraints

- Keep `three` exactly at `0.185.1`.
- Do not change `SimParams`, `SimStats`, worker protocols, buffer layouts, seed streams, model formulas, or financial operation order.
- Production simulation, Frontier, coordination, CPU fallback, and device-loss paths remain the source under test.
- Do not duplicate a simulation or TSL graph in the evidence harness.
- Primary controlled hardware is the Windows RTX 3080 Ti; secondary hardware is portability-only evidence.
- GPU cells: GBM/bootstrap/Student-t(5) at 10K, 100K, and 1M paths.
- Frontier cell: the supported 10K four-model analysis count.
- Primary repetitions: 10 cold and 30 warm per GPU/Frontier cell; CPU fallback 10 warm at 10K only because the production CPU contract caps at 10K.
- Rendering: three 60-second captures per client/advisor view at 982×800 after reveal completion.
- Resilience: 30 cancellation/supersession repetitions and 10 fresh-page device-loss repetitions.
- Never pool cold and warm samples. Controlled cells report count, median, empirical p95, minimum, maximum, and all raw observations.
- Never label calculated allocation as measured GPU memory.
- Never commit raw environment dumps, usernames, absolute user paths, tokens, signed URLs, credentials, recordings, or identifiable data.
- A performance claim must come from committed physical-hardware evidence, never SwiftShader, CUDA, an uncontrolled cloud tenancy, or a best single run.

---

### Task 1: Versioned evidence contract and statistics

**Files:**
- Create: `validation/performance/types.ts`
- Create: `validation/performance/contract.ts`
- Create: `validation/performance/contract.test.mjs`
- Create: `validation/performance/summary.ts`
- Create: `validation/performance/summary.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `EVIDENCE_SCHEMA_VERSION`, `BenchmarkScenarioConfig`, `BenchmarkManifest`, `BenchmarkEvidence`, `resolveManifest(config, sourceCommit)`, `validateManifest(value)`, `validateEvidence(value)`, and `summarizeObservations(values)`.
- Consumes: `SimParams['model']` vocabulary only; no runtime store import.

- [ ] **Step 1: Write failing contract and summary tests**

```js
// validation/performance/contract.test.mjs
import assert from 'node:assert/strict';
import {
  EVIDENCE_SCHEMA_VERSION,
  validateEvidence,
  validateManifest,
} from './contract.ts';

const manifest = {
  schemaVersion: EVIDENCE_SCHEMA_VERSION,
  sourceCommit: '0123456789abcdef0123456789abcdef01234567',
  params: {
    horizonYears: 30,
    retireYear: 0,
    initialWealth: 1_000_000,
    contribution: 2_000,
    withdrawal: 5_000,
    mu: 0.07,
    sigma: 0.15,
    glidepath: { start: 0.8, end: 0.6 },
    seed: 42,
  },
  primary: {
    models: ['gbm', 'bootstrap', 'fattail'],
    gpuPathCounts: [10_000, 100_000, 1_000_000],
    cpuPathCounts: [10_000],
    frontierPathCount: 10_000,
    coldRepetitions: 10,
    warmRepetitions: 30,
    cpuRepetitions: 10,
    cancellationRepetitions: 30,
    deviceLossRepetitions: 10,
  },
};
assert.deepEqual(validateManifest(manifest), manifest);
assert.throws(
  () => validateManifest({ ...manifest, primary: { ...manifest.primary, coldRepetitions: 9 } }),
  /coldRepetitions/,
);

const evidence = {
  schemaVersion: EVIDENCE_SCHEMA_VERSION,
  sourceCommit: manifest.sourceCommit,
  capturedAt: '2026-07-27T12:00:00.000Z',
  environment: {
    os: 'Windows 11',
    browser: 'Chrome 150.0.0.0',
    adapter: 'NVIDIA GeForce RTX 3080 Ti',
    backend: 'WebGPU',
    limits: { maxStorageBufferBindingSize: 134_217_728 },
  },
  cells: [{
    id: 'gpu-gbm-10000-warm',
    class: 'warm',
    engine: 'gpu',
    model: 'gbm',
    pathCount: 10_000,
    observationsMs: Array.from({ length: 30 }, (_, index) => index + 1),
    errors: [],
  }],
  resilience: { supersession: [], deviceLoss: [] },
};
assert.deepEqual(validateEvidence(evidence), evidence);
assert.throws(
  () => validateEvidence({ ...evidence, environment: { ...evidence.environment, userProfile: 'C:/Users/name' } }),
  /unknown environment field/,
);
```

```js
// validation/performance/summary.test.mjs
import assert from 'node:assert/strict';
import { summarizeObservations } from './summary.ts';

assert.deepEqual(summarizeObservations([4, 1, 3, 2]), {
  count: 4,
  median: 2.5,
  p95: 4,
  min: 1,
  max: 4,
  mean: 2.5,
});
assert.throws(() => summarizeObservations([]), /at least one observation/);
assert.throws(() => summarizeObservations([1, Number.NaN]), /finite non-negative/);
```

- [ ] **Step 2: Add the focused test command and verify RED**

Add:

```json
"test:performance": "esbuild validation/performance/contract.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/performance-contract.test.mjs && node node_modules/.tmp/performance-contract.test.mjs && esbuild validation/performance/summary.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/performance-summary.test.mjs && node node_modules/.tmp/performance-summary.test.mjs"
```

Run:

```powershell
npm run test:performance
```

Expected: FAIL because the contract and summary modules do not exist.

- [ ] **Step 3: Define the exact evidence types**

```ts
// validation/performance/types.ts
import type { SimParams } from '../../src/store/simStore';

export type EvidenceModel = 'gbm' | 'bootstrap' | 'fattail' | 'regime';
export type EvidenceEngine = 'gpu' | 'cpu';
export type EvidenceRunClass = 'cold' | 'warm' | 'frontier' | 'visual';

export interface BenchmarkCell {
  id: string;
  class: EvidenceRunClass;
  engine: EvidenceEngine;
  model: EvidenceModel | 'frontier';
  pathCount: 10_000 | 100_000 | 1_000_000;
  observationsMs: number[];
  dispatchReadbackMs?: number[];
  resultReadyMs?: number[];
  stableUiMs?: number[];
  frameTimesMs?: number[];
  errors: string[];
}

export interface EvidenceEnvironment {
  os: string;
  browser: string;
  adapter: string;
  backend: 'WebGPU' | 'CPU';
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
  limits: Record<string, number>;
}

export interface BenchmarkScenarioConfig {
  schemaVersion: 1;
  params: Omit<SimParams, 'model' | 'pathCount'>;
  primary: {
    models: Array<'gbm' | 'bootstrap' | 'fattail'>;
    gpuPathCounts: Array<10_000 | 100_000 | 1_000_000>;
    cpuPathCounts: [10_000];
    frontierPathCount: 10_000;
    coldRepetitions: 10;
    warmRepetitions: 30;
    cpuRepetitions: 10;
    cancellationRepetitions: 30;
    deviceLossRepetitions: 10;
  };
}

export interface BenchmarkManifest extends BenchmarkScenarioConfig {
  sourceCommit: string;
}

export interface BenchmarkEvidence {
  schemaVersion: 1;
  sourceCommit: string;
  capturedAt: string;
  environment: EvidenceEnvironment;
  cells: BenchmarkCell[];
  resilience: {
    supersession: Array<{ iteration: number; finalSeed: number; stalePublished: boolean; errors: string[] }>;
    deviceLoss: Array<{ iteration: number; cpuReadyMs: number | null; pageReloaded: boolean; staleGpuPublished: boolean; errors: string[] }>;
  };
}
```

Define `BenchmarkManifest` with the exact primary matrix and repetition counts shown in the test. `validateManifest` and `validateEvidence` must return the original typed value after rejecting missing fields, extra environment fields, non-finite timings, wrong counts, malformed SHA-1 commits, unknown models, non-ISO timestamps, absolute user paths, and secret-like keys.

- [ ] **Step 4: Implement empirical summaries**

```ts
// validation/performance/summary.ts
export interface ObservationSummary {
  count: number;
  median: number;
  p95: number;
  min: number;
  max: number;
  mean: number;
}

function quantile(sorted: readonly number[], p: number): number {
  const index = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

export function summarizeObservations(values: readonly number[]): ObservationSummary {
  if (values.length === 0) throw new Error('at least one observation required');
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('observations must be finite non-negative numbers');
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  return {
    count: sorted.length,
    median,
    p95: quantile(sorted, 0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
  };
}
```

- [ ] **Step 5: Run focused tests and TypeScript**

```powershell
npm run test:performance
npx tsc -b
```

Expected: both exit zero.

- [ ] **Step 6: Commit**

```powershell
git add package.json validation/performance/types.ts validation/performance/contract.ts validation/performance/contract.test.mjs validation/performance/summary.ts validation/performance/summary.test.mjs
git commit -m "test: define physical GPU evidence contract"
```

---

### Task 2: Additive production lifecycle instrumentation

**Files:**
- Create: `src/scene/performanceEvidence.ts`
- Create: `src/scene/performanceEvidence.test.mjs`
- Modify: `src/scene/simRuntime.ts`
- Modify: `src/scene/SimDriver.tsx`
- Modify: `src/ui/useCpuSim.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `emitPerformanceEvent(event)`, `subscribePerformanceEvents(listener)`, `nextEvidenceRunId()`, and `RuntimePerformanceEvent`.
- Extends additive `simRuntime.requestEvidenceRun(params): Promise<void> | null`; no Zustand or frozen contract change.
- Consumed later by: `validation/performance/browserBridge.ts`.

- [ ] **Step 1: Write the failing event-bus test**

```js
import assert from 'node:assert/strict';
import {
  emitPerformanceEvent,
  nextEvidenceRunId,
  subscribePerformanceEvents,
} from './performanceEvidence.ts';

const received = [];
const unsubscribe = subscribePerformanceEvents((event) => received.push(event));
const runId = nextEvidenceRunId();
emitPerformanceEvent({
  name: 'normal-start',
  runId,
  at: 12.5,
  engine: 'gpu',
  seed: 42,
  pathCount: 100_000,
});
unsubscribe();
emitPerformanceEvent({
  name: 'normal-complete',
  runId,
  at: 20,
  engine: 'gpu',
  seed: 42,
  pathCount: 100_000,
});
assert.equal(received.length, 1);
assert.equal(received[0].runId, runId);
assert.equal(received[0].name, 'normal-start');
assert.ok(nextEvidenceRunId() > runId);
```

- [ ] **Step 2: Add the event test to `test:performance` and verify RED**

Bundle and run `src/scene/performanceEvidence.test.mjs` after the summary test.

Expected: FAIL because `performanceEvidence.ts` does not exist.

- [ ] **Step 3: Implement a dependency-free event bus**

```ts
export type RuntimePerformanceEventName =
  | 'normal-start'
  | 'simulation-complete'
  | 'stats-complete'
  | 'normal-complete'
  | 'frontier-start'
  | 'frontier-complete'
  | 'device-lost';

export interface RuntimePerformanceEvent {
  name: RuntimePerformanceEventName;
  runId: number;
  at: number;
  engine: 'gpu' | 'cpu';
  seed: number;
  pathCount: 10_000 | 100_000 | 1_000_000;
  outcome?: 'landed' | 'aborted' | 'superseded' | 'error';
}

type PerformanceListener = (event: RuntimePerformanceEvent) => void;
const listeners = new Set<PerformanceListener>();
let runCounter = 0;

export const nextEvidenceRunId = (): number => ++runCounter;
export const emitPerformanceEvent = (event: RuntimePerformanceEvent): void => {
  for (const listener of listeners) listener(event);
};
export const subscribePerformanceEvents = (listener: PerformanceListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
```

The bus is always safe but has zero work when no listener is registered.

- [ ] **Step 4: Add the benchmark-only rerun seam**

In `src/scene/simRuntime.ts`:

```ts
import type { SimParams } from '../store/simStore';

export interface SimRuntime {
  requestSafeWithdrawal: (() => void) | null;
  requestRobustnessFrontier: (() => void) | null;
  requestEvidenceRun: ((params: SimParams) => Promise<void>) | null;
}

export const simRuntime: SimRuntime = {
  requestSafeWithdrawal: null,
  requestRobustnessFrontier: null,
  requestEvidenceRun: null,
};
```

Assign it inside each real driver only when `?benchmark=1` is present:

```ts
const benchmarkEnabled = new URLSearchParams(window.location.search).has('benchmark');
if (benchmarkEnabled) simRuntime.requestEvidenceRun = (params) => runPipeline(params, false);
```

Clear the handle during effect cleanup using the same identity guard used by the existing runtime actions.

- [ ] **Step 5: Emit events at real lifecycle boundaries**

In GPU `runPipeline`, allocate a `runId` before `coordinator.beginNormal()`. Emit:

```ts
emitPerformanceEvent({ name: 'normal-start', runId, at: performance.now(), engine: 'gpu', seed: params.seed, pathCount: params.pathCount });
await runSimulation({ renderer, params, bootstrapData, signal });
emitPerformanceEvent({ name: 'simulation-complete', runId, at: performance.now(), engine: 'gpu', seed: params.seed, pathCount: params.pathCount });
// after computeStats/recomputeStats
emitPerformanceEvent({ name: 'stats-complete', runId, at: performance.now(), engine: 'gpu', seed: params.seed, pathCount: params.pathCount });
// in finally, before settle; set outcome from the actual control path
emitPerformanceEvent({ name: 'normal-complete', runId, at: performance.now(), engine: 'gpu', seed: params.seed, pathCount: params.pathCount, outcome });
```

Initialize `outcome` to `error`, set it to `landed` only after all current-run publications finish, set it to `aborted` when `signal.aborted`, and set it to `superseded` when `work.isCurrent()` becomes false. Emit `frontier-start` immediately after `frontierStore.begin(...)` and `frontier-complete` only after `useFrontierStore.getState().complete(result)`. Mirror `normal-start`, `stats-complete`, and `normal-complete` around the real CPU worker pipeline. Events observe operation order; they do not move store writes or catches.

- [ ] **Step 6: Run focused and existing ownership tests**

```powershell
npm run test:performance
npm run test:frontier
npm run test:triangulation
npx tsc -b
```

Expected: all exit zero.

- [ ] **Step 7: Commit**

```powershell
git add package.json src/scene/performanceEvidence.ts src/scene/performanceEvidence.test.mjs src/scene/simRuntime.ts src/scene/SimDriver.tsx src/ui/useCpuSim.ts
git commit -m "feat: instrument production simulation lifecycle"
```

---

### Task 3: Query-gated in-browser benchmark bridge

**Files:**
- Create: `validation/performance/browserBridge.ts`
- Create: `validation/performance/browserBridge.test.mjs`
- Modify: `src/app/main.tsx`
- Modify: `src/scene/CanvasRoot.tsx`
- Modify: `src/scene/performanceEvidence.ts`

**Interfaces:**
- Produces browser global `window.__gpuLabEvidence: PhysicalGpuEvidenceBridge`.
- Adds `registerDeviceLossInjector(injector)`, `injectDeviceLoss()`, and `clearDeviceLossInjector(injector)` to the evidence module.
- Consumes the real `useSimStore`, `useFrontierStore`, `useGauntletStore`, `simRuntime`, and runtime events.

- [ ] **Step 1: Write a failing source-contract test**

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync('src/app/main.tsx', 'utf8');
const canvas = readFileSync('src/scene/CanvasRoot.tsx', 'utf8');
const bridge = readFileSync('validation/performance/browserBridge.ts', 'utf8');

assert.match(main, /searchParams\.has\('benchmark'\)/);
assert.match(main, /import\('\.\.\/\.\.\/validation\/performance\/browserBridge'\)/);
assert.match(canvas, /registerDeviceLossInjector/);
assert.match(bridge, /window\.__gpuLabEvidence/);
assert.match(bridge, /simRuntime\.requestEvidenceRun/);
assert.match(bridge, /simRuntime\.requestRobustnessFrontier/);
```

- [ ] **Step 2: Add the bridge test to `test:performance` and verify RED**

Expected: FAIL because the bridge and device injector do not exist.

- [ ] **Step 3: Add a strictly query-gated dynamic import**

In `src/app/main.tsx`, before rendering:

```ts
const searchParams = new URLSearchParams(window.location.search);
if (searchParams.has('benchmark')) {
  void import('../../validation/performance/browserBridge').then(({ installBrowserBridge }) => {
    installBrowserBridge();
  });
}
```

The normal production URL does not download or execute the bridge chunk.

- [ ] **Step 4: Register the real device destroy path**

Add an injector registry to `performanceEvidence.ts`:

```ts
let deviceLossInjector: (() => void) | null = null;
export const registerDeviceLossInjector = (injector: () => void): void => {
  deviceLossInjector = injector;
};
export const clearDeviceLossInjector = (injector: () => void): void => {
  if (deviceLossInjector === injector) deviceLossInjector = null;
};
export const injectDeviceLoss = (): void => {
  if (!deviceLossInjector) throw new Error('WebGPU device-loss injector is unavailable');
  deviceLossInjector();
};
```

In `CanvasRoot` after `renderer.init()`, resolve the r185 backend device, require a callable `destroy`, and register `() => device.destroy()` only under `?benchmark=1`. Its existing `device.lost` continuation remains the sole production fallback writer and emits `device-lost` before `setMode('cpu')`.

- [ ] **Step 5: Implement the bridge contract**

```ts
export interface PhysicalGpuEvidenceBridge {
  version: 1;
  ready(): Promise<void>;
  environment(): Promise<Record<string, unknown>>;
  runInteractive(params: SimParams): Promise<{
    params: SimParams;
    stats: Omit<SimStats, 'computedAt'>;
    modelComparison: ModelComparison;
    events: RuntimePerformanceEvent[];
    stableAt: number;
  }>;
  runFrontier(): Promise<{
    result: RobustnessFrontier;
    events: RuntimePerformanceEvent[];
    stableAt: number;
  }>;
  frameTimes(viewMode: 'client' | 'advisor', durationMs: number): Promise<number[]>;
  supersede(first: SimParams, second: SimParams): Promise<{
    finalSeed: number;
    stalePublished: boolean;
    events: RuntimePerformanceEvent[];
  }>;
  injectDeviceLoss(): void;
  snapshot(): {
    mode: SimMode;
    isRecomputing: boolean;
    committedParams: SimParams;
    stats: Omit<SimStats, 'computedAt'> | null;
    frontierStatus: FrontierStatus;
  };
}
```

`ready()` waits for `simRuntime.requestEvidenceRun`, a settled initial store, and a gauntlet snapshot. `runInteractive` calls the real benchmark-only rerun seam, subscribes to events before invocation, waits for the matching `normal-complete` with `outcome === 'landed'`, strips timestamps, verifies `modelComparison` matches the requested seed/path count, and waits for two animation frames before setting `stableAt`. `runFrontier` invokes the existing runtime action and requires a complete current GPU result. `frameTimes` records `requestAnimationFrame` deltas after setting the actual view mode. `supersede` begins the first run, waits for its `normal-start`, begins the second, and proves the final store basis belongs only to the second.

- [ ] **Step 6: Run focused tests, build, and normal-load bundle check**

```powershell
npm run test:performance
npm run build
```

Inspect `dist/assets` and confirm the bridge is a separate lazy chunk and the normal entry does not execute it.

- [ ] **Step 7: Commit**

```powershell
git add src/app/main.tsx src/scene/CanvasRoot.tsx src/scene/performanceEvidence.ts validation/performance/browserBridge.ts validation/performance/browserBridge.test.mjs
git commit -m "feat: expose query-gated physical GPU bridge"
```

---

### Task 4: Cross-platform native-browser lifecycle

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `probe/launcherPaths.mjs`
- Modify: `probe/launcherPaths.test.mjs`
- Create: `validation/performance/browserProcess.mjs`
- Create: `validation/performance/browserProcess.test.mjs`

**Interfaces:**
- Produces `startViteServer(options)`, `launchNativeBrowser(options)`, `stopProcessTree(process)`, and `withBrowserRun(options, callback)`.
- Consumes `resolveChromiumExecutable`, `systemChromiumCandidates`, and `playwright-core@1.58.0`.

- [ ] **Step 1: Extend launcher tests for Windows Chrome and Edge**

Use injected roots so tests never depend on the executing machine:

```js
assert.deepEqual(
  systemChromiumCandidates('win32', {
    programFiles: 'C:\\Program Files',
    programFilesX86: 'C:\\Program Files (x86)',
    localAppData: 'C:\\Users\\test\\AppData\\Local',
  }),
  [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Users\\test\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  ],
);
```

Add lifecycle tests with a fake child process proving success, timeout, abort, and browser-crash paths call cleanup exactly once and preserve the original failure.

- [ ] **Step 2: Verify RED**

```powershell
npm run test:probe-launcher
npm run test:performance
```

Expected: launcher test fails because Windows candidates remain empty; performance test fails because `browserProcess.mjs` does not exist.

- [ ] **Step 3: Pin browser automation without bundled-browser assumptions**

```powershell
npm install --save-dev --save-exact playwright-core@1.58.0
```

The runner launches installed Chrome/Edge or `CHROMIUM_PATH`. It does not call `npx playwright install` and does not silently fall back to SwiftShader.

- [ ] **Step 4: Implement native process lifecycle**

`startViteServer` uses `process.execPath node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5198 --strictPort`, captures bounded log tails, and polls `http://127.0.0.1:5198/?benchmark=1`. `launchNativeBrowser` uses:

```js
chromium.launch({
  executablePath,
  headless: false,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=WebGPU',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ],
});
```

It must reject adapters containing `SwiftShader`, `llvmpipe`, or `software` during a primary physical run. `withBrowserRun` owns `page`, `context`, `browser`, and Vite cleanup in `finally`; cold mode launches a new browser process, while warm mode reuses one page after one unrecorded priming run.

- [ ] **Step 5: Run launcher and lifecycle tests**

```powershell
npm run test:probe-launcher
npm run test:performance
npx tsc -b
```

Expected: all exit zero.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json probe/launcherPaths.mjs probe/launcherPaths.test.mjs validation/performance/browserProcess.mjs validation/performance/browserProcess.test.mjs
git commit -m "feat: add native WebGPU browser lifecycle"
```

---

### Task 5: Deterministic benchmark matrix runner

**Files:**
- Create: `validation/performance/scenarios.json`
- Create: `validation/performance/matrix.ts`
- Create: `validation/performance/matrix.test.mjs`
- Create: `validation/performance/run-benchmark.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `buildPrimaryMatrix(config)` and CLI `npm run evidence:benchmark -- --output C:\tmp\gpu-lab-benchmark.json`.
- Consumes `PhysicalGpuEvidenceBridge`, `BenchmarkManifest`, and browser lifecycle helpers.

- [ ] **Step 1: Write the failing matrix test**

```js
import assert from 'node:assert/strict';
import manifest from './scenarios.json' with { type: 'json' };
import { buildPrimaryMatrix } from './matrix.ts';

const cells = buildPrimaryMatrix(manifest);
assert.equal(cells.filter((cell) => cell.class === 'cold' && cell.model !== 'frontier').length, 9);
assert.equal(cells.filter((cell) => cell.class === 'warm' && cell.model !== 'frontier').length, 9);
assert.equal(cells.find((cell) => cell.id === 'gpu-gbm-1000000-warm').repetitions, 30);
assert.equal(cells.find((cell) => cell.id === 'gpu-frontier-10000-cold').repetitions, 10);
assert.equal(cells.filter((cell) => cell.engine === 'cpu').every((cell) => cell.pathCount === 10_000), true);
assert.equal(new Set(cells.map((cell) => cell.id)).size, cells.length);
```

- [ ] **Step 2: Verify RED**

Add the matrix test to `test:performance`, then run it. Expected: FAIL because manifest/matrix are absent.

- [ ] **Step 3: Freeze the benchmark manifest**

Use `DEFAULT_SIM_PARAMS` values copied into JSON, with:

```json
{
  "schemaVersion": 1,
  "params": {
    "horizonYears": 30,
    "retireYear": 0,
    "initialWealth": 1000000,
    "contribution": 2000,
    "withdrawal": 5000,
    "mu": 0.07,
    "sigma": 0.15,
    "glidepath": { "start": 0.8, "end": 0.6 },
    "seed": 42
  },
  "primary": {
    "models": ["gbm", "bootstrap", "fattail"],
    "gpuPathCounts": [10000, 100000, 1000000],
    "cpuPathCounts": [10000],
    "frontierPathCount": 10000,
    "coldRepetitions": 10,
    "warmRepetitions": 30,
    "cpuRepetitions": 10,
    "cancellationRepetitions": 30,
    "deviceLossRepetitions": 10
  }
}
```

The runner resolves `git rev-parse HEAD`, adds that exact SHA to the in-memory validated `BenchmarkManifest`, and copies it into evidence. A dirty worktree is a hard failure.

- [ ] **Step 4: Implement matrix execution**

For each cold cell, launch a fresh native browser process, call `bridge.ready()`, execute one recorded run, close the process, and repeat. For each warm cell, launch once, execute one unrecorded priming run, then 30 recorded reruns through `requestEvidenceRun`. Preserve each runtime event list so the result can derive:

```ts
dispatchReadbackMs = statsComplete.at - normalStart.at;
resultReadyMs = normalComplete.at - normalStart.at;
stableUiMs = bridgeResult.stableAt - normalStart.at;
```

CPU cells reload with `?cpu=1&benchmark=1`; Frontier cells use `runFrontier()`. Write to a temporary sibling path and atomically rename only after `validateEvidence` passes.

- [ ] **Step 5: Add CLI scripts**

```json
"evidence:benchmark": "node validation/performance/run-benchmark.mjs",
"evidence:benchmark:smoke": "node validation/performance/run-benchmark.mjs --smoke"
```

`--smoke` executes one warm 10K GBM cell and is correctness-only; its output sets `"claimablePerformance": false`.

- [ ] **Step 6: Run pure tests and a native smoke**

```powershell
npm run test:performance
npm run evidence:benchmark:smoke -- --output C:\tmp\gpu-lab-benchmark-smoke.json
```

Expected: tests exit zero; smoke uses a non-software adapter, validates its JSON, and cleans up browser/Vite processes.

- [ ] **Step 7: Commit**

```powershell
git add package.json validation/performance/scenarios.json validation/performance/matrix.ts validation/performance/matrix.test.mjs validation/performance/run-benchmark.mjs
git commit -m "feat: run deterministic physical GPU matrix"
```

---

### Task 6: Resilience and settled-render drills

**Files:**
- Create: `validation/performance/run-resilience.mjs`
- Create: `validation/performance/resilience.test.mjs`
- Modify: `validation/performance/run-benchmark.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `npm run evidence:resilience -- --output C:\tmp\gpu-lab-resilience.json`.
- Consumes bridge `supersede`, `injectDeviceLoss`, `snapshot`, and `frameTimes`.

- [ ] **Step 1: Write failing evaluation tests**

```js
import assert from 'node:assert/strict';
import {
  evaluateDeviceLoss,
  evaluateFrameTimes,
  evaluateSupersession,
} from './run-resilience.mjs';

assert.deepEqual(evaluateSupersession([
  { iteration: 1, finalSeed: 1337, stalePublished: false, errors: [] },
]), { passed: true, failures: [] });
assert.equal(evaluateSupersession([
  { iteration: 1, finalSeed: 42, stalePublished: true, errors: [] },
]).passed, false);
assert.equal(evaluateDeviceLoss([
  { iteration: 1, cpuReadyMs: 800, pageReloaded: false, staleGpuPublished: false, errors: [] },
]).passed, true);
assert.equal(evaluateFrameTimes([16, 17, 19, 21]).stableClaimAllowed, false);
```

- [ ] **Step 2: Verify RED**

Run `npm run test:performance`. Expected: FAIL because resilience evaluators do not exist.

- [ ] **Step 3: Implement 30 supersession repetitions**

Each repetition uses first params `{ ...base, pathCount: 1_000_000, seed: 42 }` and second params `{ ...base, pathCount: 10_000, seed: 1337 }`. Begin the second only after the first emits `normal-start`. Pass only when final store, stats basis, model comparison, and visible client claim belong to seed 1337 and no seed-42 `normal-complete` publishes afterward.

- [ ] **Step 4: Implement 10 fresh-page device-loss repetitions**

For each repetition:

1. Launch a fresh native browser and wait for a complete GPU result.
2. Record current GPU result identity.
3. Call the registered real-device `destroy()`.
4. Wait for the existing `device.lost` continuation to set `mode === 'cpu'`.
5. Wait for the real CPU worker to publish a current 10K result without reload.
6. Assert the prior GPU result was not republished after loss.
7. Close the browser and verify cleanup.

Record `cpuReadyMs` from injection to functional CPU state. Any missing injector, reload, stale GPU publication, uncaught error, or non-CPU terminal state fails the repetition.

- [ ] **Step 5: Capture settled frame times**

Use the already-computed app, disable presentation animation via the product's reduced-motion media emulation, wait for the client reveal and terrain status to settle, then collect three 60-second client samples and three advisor samples at viewport 982×800. Summarize each capture independently and combined. A combined p95 above 20 ms sets `stableClaimAllowed: false` and requires investigation before reporting.

- [ ] **Step 6: Run focused tests and one-repetition drill**

```powershell
npm run test:performance
npm run evidence:resilience -- --smoke --output C:\tmp\gpu-lab-resilience-smoke.json
```

Expected: one supersession, one device-loss recovery, and one 5-second frame capture pass on physical WebGPU.

- [ ] **Step 7: Commit**

```powershell
git add package.json validation/performance/run-resilience.mjs validation/performance/resilience.test.mjs validation/performance/run-benchmark.mjs
git commit -m "test: add WebGPU resilience evidence drills"
```

---

### Task 7: Deterministic report generation and claim audit

**Files:**
- Create: `validation/performance/report.ts`
- Create: `validation/performance/report.test.mjs`
- Create: `validation/performance/render-report.mjs`
- Create: `validation/performance/run-evidence.mjs`
- Create: `docs/performance/PROTOCOL.md`
- Create: `docs/performance/RECOVERY_DEMO.md`
- Create: `docs/performance/PHYSICAL_GPU_REPORT.md`
- Modify: `package.json`

**Interfaces:**
- Produces `renderPhysicalGpuReport(evidence, resilience)`, `npm run evidence:report`, and the one-command `npm run evidence:physical` orchestration.
- Consumes validated evidence only; never parses console prose.

- [ ] **Step 1: Write a failing report golden test**

```js
import assert from 'node:assert/strict';
import { renderPhysicalGpuReport } from './report.ts';

const fixtureResilience = {
  supersession: [{ iteration: 1, finalSeed: 1337, stalePublished: false, errors: [] }],
  deviceLoss: [{ iteration: 1, cpuReadyMs: 800, pageReloaded: false, staleGpuPublished: false, errors: [] }],
};
const fixtureEvidence = {
  schemaVersion: 1,
  sourceCommit: '0123456789abcdef0123456789abcdef01234567',
  capturedAt: '2026-07-27T12:00:00.000Z',
  environment: {
    os: 'Windows 11',
    browser: 'Chrome 150.0.0.0',
    adapter: 'NVIDIA GeForce RTX 3080 Ti',
    backend: 'WebGPU',
    limits: { maxStorageBufferBindingSize: 134_217_728 },
  },
  cells: [{
    id: 'gpu-gbm-10000-warm',
    class: 'warm',
    engine: 'gpu',
    model: 'gbm',
    pathCount: 10_000,
    observationsMs: [10, 11, 12],
    dispatchReadbackMs: [8, 9, 10],
    resultReadyMs: [9, 10, 11],
    stableUiMs: [10, 11, 12],
    errors: [],
  }],
  resilience: fixtureResilience,
};

const markdown = renderPhysicalGpuReport(fixtureEvidence, fixtureResilience);
assert.match(markdown, /Source commit: `0123456789abcdef/);
assert.match(markdown, /NVIDIA GeForce RTX 3080 Ti/);
assert.match(markdown, /Cold runs and warm runs are not pooled/);
assert.match(markdown, /Median/);
assert.match(markdown, /Empirical p95/);
assert.match(markdown, /Calculated buffer allocation/);
assert.doesNotMatch(markdown, /C:\\Users\\/);
assert.doesNotMatch(markdown, /fastest run/i);
```

The fixture above is complete for schema version 1 and remains independent of future physical results.

- [ ] **Step 2: Verify RED**

Add the report test to `test:performance` and run. Expected: FAIL because `report.ts` does not exist.

- [ ] **Step 3: Implement report rendering**

The report must contain:

- source/environment/protocol;
- interactive cold table;
- interactive warm table;
- Frontier table;
- CPU fallback table;
- separate dispatch/readback, result-ready, and stable-UI timings;
- client/advisor frame-time distributions;
- cancellation and device-loss results;
- measured browser memory, calculated buffer allocation, and unavailable GPU residency in distinct sections;
- instability flags where p95 exceeds 2× median;
- limitations and claimable/non-claimable statements.

Sort tables by engine, model order `gbm → bootstrap → fattail → regime`, path count, then run class. Format durations to two decimals without modifying raw JSON.

- [ ] **Step 4: Document the exact protocol**

`docs/performance/PROTOCOL.md` records power mode, foreground browser, closed competing GPU workloads, viewport, repetitions, cold/warm definitions, smoke limitations, sanitization, and rerun rules. It must explicitly say cloud timing is not a consumer comparison.

- [ ] **Step 5: Add report and one-command orchestration, then verify deterministic output**

```json
"evidence:report": "node validation/performance/render-report.mjs",
"evidence:physical": "node validation/performance/run-evidence.mjs"
```

`run-evidence.mjs` imports the benchmark runner, resilience runner, and report generator directly; it does not spawn npm recursively. It writes benchmark and resilience files to temporary siblings, validates both, merges them into `validation/performance/results/primary-rtx-3080-ti.json`, writes the report, and renames final outputs only after every stage passes. `evidence:report -- --check` regenerates in memory and byte-compares the committed report/result. Run twice on the same fixtures and byte-compare output.

- [ ] **Step 6: Commit**

```powershell
git add package.json validation/performance/report.ts validation/performance/report.test.mjs validation/performance/render-report.mjs validation/performance/run-evidence.mjs docs/performance/PROTOCOL.md docs/performance/RECOVERY_DEMO.md docs/performance/PHYSICAL_GPU_REPORT.md
git commit -m "docs: generate physical GPU evidence report"
```

---

### Task 8: Execute and commit the RTX 3080 Ti evidence

**Files:**
- Create: `validation/performance/results/primary-rtx-3080-ti.json`
- Modify: `docs/performance/PHYSICAL_GPU_REPORT.md`
- Modify only if measurement exposes a defect: the smallest affected production/test files

**Interfaces:**
- Produces the primary claimable physical evidence record.
- Consumes the complete runner, resilience drills, and report generator.

- [ ] **Step 1: Establish a clean controlled environment**

```powershell
git status --short --branch
Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion
Get-ComputerInfo | Select-Object WindowsProductName,WindowsVersion,OsBuildNumber
```

Record only sanitized values in evidence. Set Windows to a stable plugged-in performance mode, close other GPU workloads, and use an installed stable Chrome/Edge via `CHROMIUM_PATH` when automatic discovery is ambiguous.

- [ ] **Step 2: Run the complete controlled protocol with one command**

```powershell
npm run evidence:physical -- --benchmark-output C:\tmp\gpu-lab-rtx3080ti.json --resilience-output C:\tmp\gpu-lab-resilience-rtx3080ti.json --report-output docs/performance/PHYSICAL_GPU_REPORT.md --result-output validation/performance/results/primary-rtx-3080-ti.json
```

Expected: all required matrix cells have exact repetition counts, the physical adapter is RTX 3080 Ti, no software adapter is present, 30/30 supersession and 10/10 device-loss repetitions pass, six 60-second rendering captures exist, and validated result/report files land atomically.

- [ ] **Step 3: Record the recovery demonstration**

Run one additional visible device-loss drill while recording the application window. The video must show the current GPU result, injected loss, capability transition, and functional CPU result without reload. Store the video outside Git in an approved stable artifact host and place only its public link, source commit, device, and drill result in `docs/performance/RECOVERY_DEMO.md`. Do not capture desktop notifications, usernames, tokens, or unrelated windows.

- [ ] **Step 4: Investigate only measured failures**

If a correctness, stale-result, recovery, cleanup, or frame-time gate fails, stop evidence publication. Use `superpowers:systematic-debugging`, write a focused failing test, repair the smallest production boundary, rerun its focused suite, then rerun every affected benchmark cell. A frozen quantitative change requires a separate amendment and user approval.

- [ ] **Step 5: Audit generated evidence and report determinism**

```powershell
npm run evidence:report -- --check --benchmark C:\tmp\gpu-lab-rtx3080ti.json --resilience C:\tmp\gpu-lab-resilience-rtx3080ti.json --result validation/performance/results/primary-rtx-3080-ti.json --output docs/performance/PHYSICAL_GPU_REPORT.md
```

Validate that the committed JSON contains no absolute user path, raw environment dump, username, token, or credential-like key. Confirm one 30-run warm cell is explicitly reported as the consecutive end-to-end stability series with zero uncaught errors or contradictory UI claims.

- [ ] **Step 6: Commit primary evidence**

```powershell
git add validation/performance/results docs/performance/PHYSICAL_GPU_REPORT.md docs/performance/RECOVERY_DEMO.md
git commit -m "docs: publish RTX 3080 Ti evidence"
```

---

### Task 9: Secondary portability attempt

**Files:**
- Create on success: `validation/performance/results/secondary-portability-smoke.json`
- Modify: `docs/performance/PHYSICAL_GPU_REPORT.md`

**Interfaces:**
- Produces either one non-claimable portability record or an explicit blocked-environment section.

- [ ] **Step 1: Prepare the secondary environment**

Prefer a second physical consumer device. A rented environment is acceptable only when an installed Chromium browser exposes a hardware WebGPU adapter. Set `CHROMIUM_PATH`; do not use CUDA-only scripts.

- [ ] **Step 2: Run the portability matrix**

```powershell
npm ci
npm run evidence:benchmark -- --portability --output C:\tmp\gpu-lab-portability.json
```

Expected: three warm repetitions per interactive GPU cell plus one complete Frontier, `"claimablePerformance": false`, and no p95 comparison to the primary machine.

- [ ] **Step 3: Apply the explicit fallback**

If Chrome cannot expose non-software WebGPU, save no fabricated timing record. Add a report row with provider/OS/browser class, `status: blocked`, and the exact non-sensitive reason. Do not substitute SwiftShader, CUDA, or an A100 kernel microbenchmark.

- [ ] **Step 4: Regenerate and commit**

```powershell
npm run evidence:report -- --benchmark validation/performance/results/primary-rtx-3080-ti.json --secondary C:\tmp\gpu-lab-portability.json --copy-secondary validation/performance/results/secondary-portability-smoke.json --output docs/performance/PHYSICAL_GPU_REPORT.md
git add validation/performance/results docs/performance/PHYSICAL_GPU_REPORT.md docs/performance/RECOVERY_DEMO.md
git commit -m "docs: record WebGPU portability evidence"
```

If blocked, omit the secondary JSON from `git add` and commit only the honest report.

---

### Task 10: Release verification and engineering handoff

**Files:**
- Modify: `README.md`
- Modify: `validation/REPORT.md`
- Modify: `MEMORY.md`
- Modify: `docs/superpowers/plans/2026-07-27-physical-gpu-evidence.md`

**Interfaces:**
- Produces the Milestone 1 completion record and the gate that permits Milestone 2.

- [ ] **Step 1: Audit every public engineering claim**

Create a claim table in `validation/REPORT.md`:

```markdown
| Claim | Evidence file | Cell/protocol | Status |
|---|---|---|---|
| 1M physical-WebGPU latency | `validation/performance/results/primary-rtx-3080-ti.json` | `gpu-gbm-1000000-warm`, `gpu-bootstrap-1000000-warm`, `gpu-fattail-1000000-warm` | measured |
| Device-loss CPU recovery | `validation/performance/results/primary-rtx-3080-ti.json` | 10 fresh-page repetitions | measured |
| Secondary portability | `validation/performance/results/secondary-portability-smoke.json` or blocked report section | smoke only | non-comparative |
```

Remove or qualify any sentence that cannot point to committed evidence.

- [ ] **Step 2: Update README and memory**

README receives only concise measured numbers and a link to the generated report. `MEMORY.md` records source commit, device/browser/driver, exact commands, repetition counts, gate results, secondary portability status, frozen surfaces untouched, and remaining limitations.

- [ ] **Step 3: Run the focused evidence suite**

```powershell
npm run test:performance
npm run test:probe-launcher
npm run test:compute-probe
```

Expected: all exit zero.

- [ ] **Step 4: Run the complete repository gate**

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

Expected: every command exits zero. Build size/Browserslist warnings are recorded separately from failures.

- [ ] **Step 5: Verify completion gates**

Milestone 2 may begin only if correctness parity, stale-result suppression, device-loss CPU recovery, browser cleanup, report sanitization, and the full gate pass. Performance instability may remain only when the report explicitly withholds a stable-latency claim for that cell.

- [ ] **Step 6: Complete and commit the plan record**

Mark completed checkboxes, run:

```powershell
git diff --check
git status --short
```

Then:

```powershell
git add README.md validation/REPORT.md MEMORY.md docs/superpowers/plans/2026-07-27-physical-gpu-evidence.md
git commit -m "docs: complete physical GPU evidence milestone"
```
