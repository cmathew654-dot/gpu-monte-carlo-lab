# Robustness Frontier Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the A5 frontier engine into an accessible advisor decision lens and a calm client explanation that makes saturated success rates honest.

**Architecture:** Consume only the landed `ModelComparison` and `RobustnessFrontier` artifacts produced by the core A5 plan. Pure presentation helpers derive ranges, statuses, sentences, plot geometry, and accessible rows; React components render those results without financial computation. Advisor navigation switches among the existing simulated-futures scene, the new frontier panel, and the existing historical gauntlet while the canvas remains mounted.

**Tech Stack:** TypeScript strict, React 19, Zustand 5, SVG, React DOM server tests, authored CSS, Vite 7.

## Global Constraints

- This plan begins only after `docs/superpowers/plans/2026-07-26-robustness-frontier-core.md` is complete and green.
- Do not mutate frozen `SimParams`, `SimStats`, `TriStats`, worker protocols, model IDs 0–2, buffer layouts, or operation order.
- Render only complete landed artifacts. React components do not compute financial statistics.
- `RobustnessFrontier.basis.params` must equal current `committedParams` before its values are described as current.
- The plot may connect tested points visually, but text and accessibility copy must identify them as tested points and must not claim interpolated values were simulated.
- “Robust spend” means the highest tested real monthly spending at which every included model reaches at least 90 in 100 simulated futures.
- Never use “recommended,” “affordable,” “guaranteed,” “you can spend,” or an unqualified “safe.”
- Preserve the mountain as the client experience. The advisor frontier is a dedicated lens, not a card added to `StatCards`.
- Use direct curve labels, line pattern, point shape, and color; color alone never carries model identity.
- Target WCAG 2.2 AA, visible keyboard focus, `prefers-reduced-motion`, and a DOM representation of every decision-critical value.
- Visual direction is an alpine field instrument: near-black, glacial cyan, mineral gold, contour geometry, and ember only for failure. No purple gradient, glassmorphism, or generic rounded KPI-card grid.
- Replace generic Inter typography with `Barlow Semi Condensed` for prose/UI and `IBM Plex Mono` for data; load only weights 300, 400, 500, 600.
- Every task follows red-green-refactor, runs its focused tests, and ends with an atomic commit.

---

## File Structure

- Create `src/ui/frontierPresentation.ts`: pure labels, ranges, status, saturation copy, and current-result guard.
- Create `src/ui/frontierPresentation.test.mjs`: pure presentation and copy tests.
- Create `src/ui/AdvisorLensNav.tsx`: three-lens navigation with keyboard and pressed-state semantics.
- Create `src/ui/AdvisorLensNav.test.mjs`: server-rendered navigation semantics.
- Create `src/ui/FrontierChart.tsx`: accessible SVG plot and tested-point table.
- Create `src/ui/RobustnessFrontierPanel.tsx`: action, progress, error, interpretation, chart, and aligned comparison table.
- Create `src/ui/RobustnessFrontierPanel.test.mjs`: server-rendered complete/running/saturated states.
- Modify `src/app/App.tsx`: conditional advisor lens composition while preserving the canvas and client gauntlet.
- Modify `src/ui/StatCards.tsx`: current-plan multi-stat summary in the futures lens.
- Modify `src/ui/ClientHud.tsx`: saturation explanation and current robust-spend sentence.
- Modify `src/app/theme.css`: frontier layout, plot, navigation, responsive behavior, motion, and typography.
- Modify `index.html`: replace generic font imports.
- Modify `package.json`: include experience tests in `test:frontier`.
- Modify `PRODUCT.md`: record the three-lens advisor hierarchy and client saturation contract.
- Modify `docs/AMENDMENT_A5_ROBUSTNESS_FRONTIER.md`: record presentation semantics and accessibility.
- Modify `MEMORY.md`: checkpoint the completed A5 experience and focused evidence.

### Task 1: Pure presentation contract

**Files:**
- Create: `src/ui/frontierPresentation.ts`
- Create: `src/ui/frontierPresentation.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ModelComparison`, `RobustnessFrontier`, `FrontierModelKey`, `SpendingCapacity90`, `SimParams`, and `RETURN_MODELS` from the completed core plan.
- Produces:

```ts
export const FRONTIER_MODEL_LABELS: Record<FrontierModelKey, string>;
export interface ComparisonRange {
  success: { min: number; max: number };
  medianWealth: { min: number; max: number };
  worstDecileMaxDD: { min: number; max: number };
}
export function comparisonRange(comparison: ModelComparison): ComparisonRange;
export function isFrontierCurrent(
  frontier: RobustnessFrontier | null,
  committed: SimParams,
  mode: 'gpu' | 'cpu',
): frontier is RobustnessFrontier;
export function advisorComparisonSentence(comparison: ModelComparison): string;
export function clientSaturationSentence(comparison: ModelComparison): string | null;
export function clientRobustSpendSentence(frontier: RobustnessFrontier): string | null;
export function capacityLabel(capacity: SpendingCapacity90): string;
```

- [ ] **Step 1: Write the failing pure presentation tests**

Create `src/ui/frontierPresentation.test.mjs` with fixtures containing GBM 100% / $115,188 / 56.7%, bootstrap 100% / $150,906 / 71.3%, and Student-t(5) 100% / $115,697 / 56.9%. Assert:

```js
assert.deepEqual(comparisonRange(comparison), {
  success: { min: 1, max: 1 },
  medianWealth: { min: 115188, max: 150906 },
  worstDecileMaxDD: { min: 0.567, max: 0.713 },
});
assert.match(advisorComparisonSentence(comparison), /Success agrees at 100\.0%/);
assert.match(advisorComparisonSentence(comparison), /\$115K to \$151K/);
assert.match(advisorComparisonSentence(comparison), /56\.7% to 71\.3%/);
assert.match(clientSaturationSentence(comparison), /ceiling of this measure, not a guarantee/i);
assert.equal(clientSaturationSentence({ ...comparison, models: nonsaturated }), null);
assert.equal(isFrontierCurrent(frontier, committed, 'gpu'), true);
assert.equal(isFrontierCurrent(frontier, { ...committed, withdrawal: 6001 }, 'gpu'), false);
assert.equal(isFrontierCurrent(frontier, committed, 'cpu'), false);
assert.equal(capacityLabel(converged), '$4,576/mo real');
assert.equal(capacityLabel(unbounded), 'Above tested range');
assert.equal(clientRobustSpendSentence(incompleteFrontier), null);
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npx esbuild src/ui/frontierPresentation.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/frontierPresentation.test.bundle.mjs
node node_modules/.tmp/frontierPresentation.test.bundle.mjs
```

Expected: FAIL because `frontierPresentation.ts` does not exist.

- [ ] **Step 3: Implement the pure helpers**

Use ordered finite-value extraction. Format percentages with `fmtPct` and wealth with `fmtUSDCompact`. Saturation is true only when every model has `successRate === 1`. `clientRobustSpendSentence` returns null unless `robustSpend !== null` and every model has a non-null measured capacity.

Use a canonical parameter comparison that checks every frozen field, including both glidepath endpoints:

```ts
function sameParams(a: SimParams, b: SimParams): boolean {
  return (
    a.model === b.model &&
    a.pathCount === b.pathCount &&
    a.horizonYears === b.horizonYears &&
    a.retireYear === b.retireYear &&
    a.initialWealth === b.initialWealth &&
    a.contribution === b.contribution &&
    a.withdrawal === b.withdrawal &&
    a.mu === b.mu &&
    a.sigma === b.sigma &&
    a.seed === b.seed &&
    (a.glidepath === null
      ? b.glidepath === null
      : b.glidepath !== null &&
        a.glidepath.start === b.glidepath.start &&
        a.glidepath.end === b.glidepath.end)
  );
}
```

- [ ] **Step 4: Add the test to `test:frontier` and run it**

Append the esbuild-and-node pair to the existing `test:frontier` script. Run `npm run test:frontier`.

Expected: all core A5 tests plus the presentation assertions pass.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/frontierPresentation.ts src/ui/frontierPresentation.test.mjs package.json
git commit -m "feat: define frontier presentation semantics"
```

### Task 2: Advisor lens navigation and composition

**Files:**
- Create: `src/ui/AdvisorLensNav.tsx`
- Create: `src/ui/AdvisorLensNav.test.mjs`
- Modify: `src/app/App.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: `advisorLens` and `setAdvisorLens` from `useFrontierStore`; existing `GauntletDriver`, `GauntletPanel`, `PlayheadHud`, `ReadThisCaption`, `ControlPanel`, `StatCards`, and `SwrButton`.
- Produces: `AdvisorLensNav(): JSX.Element`.

- [ ] **Step 1: Write the failing server-render test**

Bundle a test that renders `AdvisorLensNav` with the store set to each lens and asserts:

```js
assert.match(markup, /aria-label="Advisor analysis lens"/);
assert.equal((markup.match(/role="tab"/g) ?? []).length, 3);
assert.match(markup, />Simulated futures</);
assert.match(markup, />Robustness frontier</);
assert.match(markup, />Historical gauntlet</);
assert.equal((markup.match(/aria-selected="true"/g) ?? []).length, 1);
```

Also import an exported pure `lensForArrowKey(current, key)` and assert left/right/Home/End wrap and select correctly.

- [ ] **Step 2: Run and verify the test fails**

Run the direct esbuild-and-node command.

Expected: FAIL because `AdvisorLensNav.tsx` is absent.

- [ ] **Step 3: Implement the tablist**

Use a semantic `role="tablist"` with three buttons, `aria-controls`, roving `tabIndex`, and the labels above. ArrowLeft/ArrowRight wrap; Home selects futures; End selects gauntlet. `setAdvisorLens` changes presentation only and does not run frontier work.

- [ ] **Step 4: Recompose `App.tsx`**

Preserve `<CanvasRoot />` and `<GauntletDriver />` at all times. Apply:

```tsx
const showFutures = viewMode === 'advisor' && advisorLens === 'futures';
const showFrontier = viewMode === 'advisor' && advisorLens === 'frontier';
const showGauntlet = viewMode === 'advisor' && advisorLens === 'gauntlet';
```

- Render `AdvisorLensNav` inside the advisor header.
- Render `PlayheadHud` and `ReadThisCaption` only for `showFutures`.
- Render the client `GauntletPanel` whenever `viewMode === 'client'`.
- Render the advisor `GauntletPanel` only for `showGauntlet`.
- Render `ControlPanel` for every non-presentation advisor lens.
- Render `StatCards` and `SwrButton` only for `showFutures` or `showGauntlet`.
- Leave a typed import seam for `RobustnessFrontierPanel`, which Task 3 mounts for `showFrontier`.
- Preserve presentation mode behavior unchanged.

- [ ] **Step 5: Run focused and static checks**

Run:

```powershell
npm run test:frontier
npx tsc -b
npm run lint
```

Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add src/ui/AdvisorLensNav.tsx src/ui/AdvisorLensNav.test.mjs src/app/App.tsx package.json
git commit -m "feat: add advisor analysis lenses"
```

### Task 3: Accessible frontier plot and complete panel

**Files:**
- Create: `src/ui/FrontierChart.tsx`
- Create: `src/ui/RobustnessFrontierPanel.tsx`
- Create: `src/ui/RobustnessFrontierPanel.test.mjs`
- Modify: `src/app/App.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: `useFrontierStore`, `simRuntime.requestRobustnessFrontier`, `isFrontierCurrent`, `capacityLabel`, `advisorComparisonSentence`, formatting helpers, and complete core artifacts.
- Produces:

```ts
export interface FrontierChartProps {
  result: RobustnessFrontier;
}
export function FrontierChart(props: FrontierChartProps): JSX.Element;
export function RobustnessFrontierPanel(): JSX.Element;
```

- [ ] **Step 1: Write failing render tests for all states**

Use `renderToStaticMarkup` after seeding `useFrontierStore` and `useSimStore`.

Assert idle state contains:

```js
assert.match(markup, /Run robustness frontier/);
assert.match(markup, /up to 100,000 paths per model/i);
```

Assert running state contains `role="status"`, `aria-busy="true"`, model label, and `completed / total`.

Assert complete state contains:

```js
assert.match(markup, /Robust spend/i);
assert.match(markup, /highest tested real monthly spending/i);
assert.match(markup, /90 in 100/);
assert.equal((markup.match(/<path /g) ?? []).length, result.models.length);
assert.equal((markup.match(/<table/g) ?? []).length >= 2, true);
assert.match(markup, /Tested spending points/);
assert.match(markup, /Within a curve: simulated path variation/);
assert.match(markup, /Between curves: model-assumption uncertainty/);
assert.match(markup, /Along the spending axis: decision sensitivity/);
```

Assert an error state exposes `role="alert"` and does not render a robust-spend value. Assert a stale complete result renders the run action and `Current plan changed` instead of the old value.

- [ ] **Step 2: Run and verify failure**

Run the direct esbuild-and-node command.

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement deterministic plot geometry**

`FrontierChart` uses a fixed `viewBox="0 0 960 420"` with margins `{ left: 72, right: 132, top: 32, bottom: 58 }`. Compute domains from finite tested points:

```ts
const xMax = Math.max(1_000, ...points.map((point) => point.monthlySpending));
const x = (value: number) => left + (value / xMax) * innerWidth;
const y = (rate: number) => top + (1 - Math.min(1, Math.max(0, rate))) * innerHeight;
```

Render:

- contour-like horizontal rules at 0%, 25%, 50%, 75%, 90%, and 100%;
- one `path` per model through sorted tested points;
- a unique `strokeDasharray` and point symbol per model;
- direct label at the highest-spending point;
- the 90% threshold with text;
- current spending as a white hairline;
- robust spend as a mineral-gold line and annotation when non-null;
- `<title>` and `<desc>` describing models, target, path count, engine, and tested-point caveat.

The adjacent tested-points table has columns Model, Real monthly spending, Success, and Measured status. Every SVG point is keyboard reachable through a synchronized `<button>` list; focusing a button highlights the corresponding SVG point through local presentation state only.

- [ ] **Step 4: Implement panel lifecycle and tables**

The panel:

- derives `isCurrent` from captured params and engine;
- invokes `simRuntime.requestRobustnessFrontier?.()` only from the explicit button;
- keeps a large result interpretation, not a grid of detached cards;
- shows analysis path count and seed;
- renders model comparison columns: Model, Success now, Median ending wealth, Worst-decile max drawdown, Median failure year, 90% spending;
- uses an em dash for null failure year;
- includes the exact robust-spend definition;
- displays `RUNNING MODEL X — N / TOTAL EVALUATIONS` during computation;
- does not render partial curves;
- uses `aria-live="polite"` only for final completion/invalidation and `role="alert"` for errors.

Mount `<RobustnessFrontierPanel />` in `App.tsx` only for `showFrontier`; omit `StatCards` and `SwrButton` in that lens.

- [ ] **Step 5: Run focused checks**

Run:

```powershell
npm run test:frontier
npx tsc -b
npm run lint
```

Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add src/ui/FrontierChart.tsx src/ui/RobustnessFrontierPanel.tsx src/ui/RobustnessFrontierPanel.test.mjs src/app/App.tsx package.json
git commit -m "feat: render the robustness frontier lens"
```

### Task 4: Multi-stat futures summary and client saturation truth

**Files:**
- Modify: `src/ui/StatCards.tsx`
- Modify: `src/ui/ClientHud.tsx`
- Create: `src/ui/robustnessCopy.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `modelComparison` from `simStore`, complete/current `frontierStore.result`, and Task 1 pure helpers.
- Produces: advisor and client DOM copy only.

- [ ] **Step 1: Write failing source/render assertions**

Server-render `StatCards` and `ClientHud` with the measured saturated fixture. Assert:

```js
assert.match(statsMarkup, /Success agrees at 100\.0%/);
assert.match(statsMarkup, /Median ending wealth/);
assert.match(statsMarkup, /\$115K to \$151K/);
assert.match(statsMarkup, /Worst-decile max drawdown/);
assert.match(clientMarkup, /ceiling of this measure, not a guarantee/i);
assert.match(clientMarkup, /roughest 1 in 10 futures/i);
assert.doesNotMatch(clientMarkup, /guaranteed|recommended|affordable/i);
```

With a non-saturated fixture, assert the existing `In 70–74 of 100 futures` headline remains and the saturation sentence is absent. With a current complete frontier, assert the real-monthly-spending sentence appears. With a stale frontier, assert it is absent.

- [ ] **Step 2: Run and verify failure**

Run the direct esbuild-and-node command.

Expected: FAIL because current components do not use `modelComparison` or frontier results.

- [ ] **Step 3: Replace success-only advisor triangulation**

Keep the existing A4 success-range rows for continuity, then add one compact multi-stat interpretation block using `advisorComparisonSentence`. Use aligned mini-rows for P50 terminal wealth and worst-decile max drawdown across all three models. Do not display `safeWithdrawalRate` from comparison snapshots.

- [ ] **Step 4: Add client saturation and robust-spend sentences**

Keep the existing headline natural frequency. Under it:

- render `clientSaturationSentence` only when all comparison models are exactly 100%;
- retain the existing failure timing/magnitude sentence when failures exist;
- render `clientRobustSpendSentence` only for a complete current frontier;
- prefix the robust value with `Across all included models`;
- label it `real monthly spending`.

- [ ] **Step 5: Run tests and static checks**

Run:

```powershell
npm run test:frontier
npx tsc -b
npm run lint
```

Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add src/ui/StatCards.tsx src/ui/ClientHud.tsx src/ui/robustnessCopy.test.mjs package.json
git commit -m "feat: explain model disagreement beyond success"
```

### Task 5: Authored visual system, responsive layout, and documentation

**Files:**
- Modify: `src/app/theme.css`
- Modify: `index.html`
- Modify: `PRODUCT.md`
- Modify: `docs/AMENDMENT_A5_ROBUSTNESS_FRONTIER.md`
- Modify: `MEMORY.md`

**Interfaces:**
- Consumes: class names from Tasks 2–4.
- Produces: responsive, keyboard-visible, reduced-motion presentation and durable product truth.

- [ ] **Step 1: Add a failing static visual-contract test**

Extend `src/ui/robustnessCopy.test.mjs` to read `src/app/theme.css` and `index.html`, then assert:

```js
assert.match(html, /Barlow\+Semi\+Condensed/);
assert.match(html, /IBM\+Plex\+Mono/);
assert.doesNotMatch(html, /family=Inter/);
assert.match(css, /--frontier-gbm:/);
assert.match(css, /--frontier-bootstrap:/);
assert.match(css, /--frontier-fattail:/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(css, /\.frontier-point-button:focus-visible/);
assert.match(css, /@media \(max-width: 720px\)/);
```

- [ ] **Step 2: Run and verify failure**

Run `npm run test:frontier`.

Expected: FAIL on missing fonts, variables, and selectors.

- [ ] **Step 3: Implement the field-instrument styling**

Set:

```css
:root {
  --font-ui: 'Barlow Semi Condensed', 'Arial Narrow', sans-serif;
  --font-data: 'IBM Plex Mono', Consolas, monospace;
  --frontier-gbm: #72d6ff;
  --frontier-bootstrap: #e6bd63;
  --frontier-fattail: #a6b7ff;
  --frontier-regime: #73d6ad;
  --frontier-grid: #18304a;
}
```

Style the lens navigation as an etched instrument selector with a moving bottom rule, square corners, and no pill treatment. Give the frontier surface a topographic background made from layered repeating-linear-gradients at low opacity, a sharp one-pixel border, and no blur.

Use a single 360ms staggered entrance for interpretation, plot, and table with delays 0ms, 70ms, and 140ms. Under `prefers-reduced-motion: reduce`, set animation and transition duration to `0.01ms`.

Desktop layout:

- left edge `332px`, right edge `24px`, top `68px`, bottom `24px`;
- plot occupies the upper 58%;
- comparison and tested-point tables occupy the lower area with independent overflow;
- progress veil covers only the frontier surface.

At `max-width: 1180px`, left edge becomes `316px`. At `max-width: 720px`, the panel uses `left: 12px; right: 12px; top: 108px; bottom: 12px`, plot comes before horizontally scrollable tables, and lens navigation scrolls horizontally without shrinking labels.

Every button and tested point gets a 2px glacial-cyan focus outline with 2px offset. Maintain at least 3:1 non-text contrast and 4.5:1 body-text contrast.

- [ ] **Step 4: Replace the font import**

In `index.html`, replace the existing Google Fonts request with:

```html
<link
  href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
  rel="stylesheet"
/>
```

- [ ] **Step 5: Update durable product documentation**

In `PRODUCT.md`, replace the success-only advisor hierarchy with the three lenses and add the robust-spend definition. In the A5 amendment, record:

- explicit-action trigger;
- tested-point convention;
- saturation copy;
- advisor/client shared artifacts;
- accessibility semantics;
- fonts and model encodings;
- no advice/model-weight claim.

In `MEMORY.md`, add an A5 experience entry containing the commit range, focused commands, results, and next action “implement A6 Regime-t lens.” Do not claim the full baseline until it has actually run.

- [ ] **Step 6: Run the A5 experience gate**

Run:

```powershell
npm run test:frontier
npx tsc -b
npm run lint
npm run build
```

Expected: all pass. Record exact assertion counts and Vite module count in the task report.

- [ ] **Step 7: Commit**

```powershell
git add src/app/theme.css index.html PRODUCT.md docs/AMENDMENT_A5_ROBUSTNESS_FRONTIER.md MEMORY.md src/ui/robustnessCopy.test.mjs
git commit -m "feat: finish the frontier decision experience"
```

## Plan Completion Check

Before handing this plan to A6:

- `npm run test:frontier`, `npx tsc -b`, `npm run lint`, and `npm run build` pass.
- Advisor futures, frontier, and gauntlet lenses are keyboard selectable.
- Frontier never starts merely because the lens opens.
- Incomplete/stale results never publish robust spend.
- The DOM contains all plotted values and decision-critical statistics.
- Client saturation copy explains why 100% is not a guarantee.
- No banned advice language appears.
- A5 documentation contains only measured test evidence.
- Commit and review results are appended to this plan’s SDD ledger.
