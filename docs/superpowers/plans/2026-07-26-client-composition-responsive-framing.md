# Client Composition and Responsive Framing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the complete client evidence legible across the approved landscape and portrait viewports while preserving Rainier as the visual anchor and dissolving the finite DEM edge into the night stage.

**Architecture:** Isolate the camera geometry in a pure TypeScript helper so aspect fitting can be unit-tested without React or WebGPU. Keep the HUD changes in the existing alpine instrument stylesheet, with compact rules gated by both height and landscape-like aspect ratio. Extend the single production terrain graph with an opacity node and continue compiling that graph through the existing Viz5 Tint probe.

**Tech Stack:** React 19, TypeScript 5.9, three.js/WebGPU/TSL 0.185.1, React Three Fiber 9.6.1, plain ESM assertion tests, Vite 7.

## Global Constraints

- Keep `three` exactly at `0.185.1`.
- Do not change simulation formulas, return models, statistics, store fields, worker messages, buffer layouts, seed streams, or financial operations.
- Advisor framing remains unchanged.
- Normal-height HUD top padding is `clamp(36px, 6vh, 48px)`.
- Mountain look-at target is 60% of summit height.
- Camera fit uses terrain half-width, vertical field of view, camera aspect, and a `1.12` fit margin without mutating stored wheel radius.
- Terrain opacity fades only within the final `1.75` world units of the x/z boundary.
- Plan, method, and cohort evidence text never drops below `10px`.
- No client background panel, pill, border, or decorative glow is added.

---

### Task 1: Pure mountain camera fit

**Files:**
- Create: `src/scene/cameraFit.ts`
- Create: `src/scene/cameraFit.test.mjs`
- Modify: `src/scene/CameraRig.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: `MOUNTAIN_WORLD_SIZE`, stored wheel radius, `PerspectiveCamera.fov`, and `camera.aspect`.
- Produces: `mountainFitRadius(baseRadius: number, terrainHalfWidth: number, verticalFovDegrees: number, aspect: number, margin?: number): number`.

- [ ] **Step 1: Write the failing camera-fit tests**

```js
import assert from 'node:assert/strict';
import { mountainFitRadius } from './cameraFit.ts';

const base = 34;
assert.equal(mountainFitRadius(base, 13, 45, 982 / 800), base);
assert.ok(mountainFitRadius(base, 13, 45, 390 / 844) > base);
assert.ok(mountainFitRadius(base, 13, 45, 255 / 542) > base);
assert.ok(
  mountainFitRadius(base, 13, 45, 255 / 542)
    > mountainFitRadius(base, 13, 45, 390 / 844),
);
assert.equal(mountainFitRadius(base, 13, 45, Number.NaN), base);
assert.equal(mountainFitRadius(base, 13, 0, 0.5), base);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx esbuild src/scene/cameraFit.test.mjs --bundle --platform=node --format=esm --outfile=node_modules/.tmp/cameraFit.test.bundle.mjs
node node_modules/.tmp/cameraFit.test.bundle.mjs
```

Expected: FAIL because `src/scene/cameraFit.ts` does not exist.

- [ ] **Step 3: Implement the minimum effective radius**

```ts
export const MOUNTAIN_FIT_MARGIN = 1.12;

export function mountainFitRadius(
  baseRadius: number,
  terrainHalfWidth: number,
  verticalFovDegrees: number,
  aspect: number,
  margin = MOUNTAIN_FIT_MARGIN,
): number {
  if (
    !Number.isFinite(baseRadius)
    || !Number.isFinite(terrainHalfWidth)
    || !Number.isFinite(verticalFovDegrees)
    || !Number.isFinite(aspect)
    || !Number.isFinite(margin)
    || baseRadius <= 0
    || terrainHalfWidth <= 0
    || verticalFovDegrees <= 0
    || verticalFovDegrees >= 180
    || aspect <= 0
    || margin <= 0
  ) return baseRadius;

  const halfVerticalFov = (verticalFovDegrees * Math.PI) / 360;
  const horizontalTangent = Math.tan(halfVerticalFov) * aspect;
  if (!Number.isFinite(horizontalTangent) || horizontalTangent <= 0) {
    return baseRadius;
  }
  return Math.max(baseRadius, (terrainHalfWidth * margin) / horizontalTangent);
}
```

In `CameraRig`, keep clamping `radius.current` to the existing mountain wheel range, derive a frame-local effective radius only for a ready client terrain and a perspective camera, and change the mountain target to `getTerrainSummitY() * 0.60`.

- [ ] **Step 4: Run focused camera tests and verify GREEN**

Run:

```powershell
npm run test:framing
```

Expected: all camera-fit assertions pass, with finite radii that increase monotonically as aspect narrows.

### Task 2: Responsive client evidence contracts

**Files:**
- Modify: `src/ui/robustnessCopy.test.mjs`
- Modify: `src/app/theme.css`

**Interfaces:**
- Consumes: existing `.client-hud*` and `.gauntlet-panel--client*` DOM classes.
- Produces: landscape-only compact treatment and portrait reflow without markup or data changes.

- [ ] **Step 1: Extend CSS contract assertions**

Add assertions requiring:

```js
assert.match(visualCss, /padding:\s*clamp\(36px,\s*6vh,\s*48px\)\s+24px\s+28px/);
assert.match(
  visualCss,
  /@media \(max-height: 560px\) and \(min-aspect-ratio: 4\/3\)/,
);
assert.doesNotMatch(visualCss, /@media \(max-height: 560px\)\s*\{/);
assert.match(
  visualCss,
  /\.gauntlet-panel--client \.gauntlet-chip__year[\s\S]{0,180}text-shadow:/,
);
assert.match(
  visualCss,
  /@media \(max-width: 600px\) and \(max-aspect-ratio: 3\/4\)[\s\S]*flex-wrap:\s*wrap/,
);
```

Also assert that the compact block contains no `font-size: 8px` or `font-size: 9px` declarations for model, plan, method, or cohort evidence.

- [ ] **Step 2: Run the UI test and verify RED**

Run:

```powershell
npm run test:frontier
```

Expected: FAIL on the new responsive contracts because the stylesheet still has a height-only compact query, `9vh` normal padding, sub-10px evidence text, and a non-wrapping client cohort row.

- [ ] **Step 3: Implement the responsive rules**

In `src/app/theme.css`:

- Change base client padding to `clamp(36px, 6vh, 48px) 24px 28px`.
- Add a restrained dark edge to client cohort year/status labels with a compact text shadow only; keep the row transparent and borderless.
- Change the compact media query to `@media (max-height: 560px) and (min-aspect-ratio: 4/3)`.
- Raise compact model, plan, method, method-state, and cohort label sizes to at least `10px`.
- Add a portrait rule at `@media (max-width: 600px) and (max-aspect-ratio: 3/4)` that allows the HUD to scroll vertically, keeps plan text wrapping, and lets the six transparent cohort items wrap into two rows without horizontal overflow.
- Preserve the current 982×319 information hierarchy and advisor styles.

- [ ] **Step 4: Run the UI test and verify GREEN**

Run:

```powershell
npm run test:frontier
```

Expected: all Frontier and UI source-contract assertions pass.

### Task 3: Terrain boundary dissolve

**Files:**
- Modify: `src/scene/mountain/terrainColor.ts`
- Modify: `src/scene/mountain/TerrainMesh.tsx`
- Modify: `src/scene/cameraFit.test.mjs`

**Interfaces:**
- Consumes: `MOUNTAIN_WORLD_SIZE` and `positionWorld.x/z`.
- Produces: `opacityNode` on `buildTerrainColorNode(data)` and a transparent, depth-writing material with a small alpha cutoff.

- [ ] **Step 1: Add the failing graph contract**

```js
import { buildTerrainColorNode } from './mountain/terrainColor.ts';

const graph = buildTerrainColorNode({
  minElev: 0,
  summit: { x: 0, y: 8, z: 0 },
  yScale: 1,
});
assert.ok(graph.opacityNode, 'terrain graph exposes boundary opacity');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm run test:framing
```

Expected: FAIL because the production graph has no `opacityNode`.

- [ ] **Step 3: Implement the production fade**

Build the edge opacity from the distance to the nearest square boundary:

```ts
const halfWidth = uniform(MOUNTAIN_WORLD_SIZE * 0.5);
const edgeFadeWidth = uniform(1.75);
const edgeDistance = halfWidth.sub(
  positionWorld.x.abs().max(positionWorld.z.abs()),
);
const opacityNode = smoothstep(0, edgeFadeWidth, edgeDistance);
```

Return `opacityNode` from `buildTerrainColorNode`. In `TerrainMesh`, set `m.opacityNode`, `m.transparent = true`, keep `m.depthWrite = true`, and set a small `m.alphaTest` cutoff so only the outermost nearly invisible edge is discarded. Do not duplicate or replace the terrain graph in the probe.

- [ ] **Step 4: Run focused tests and the real Viz5 Tint probe**

Run:

```powershell
npm run test:framing
node probe/run-viz5-probe.mjs
```

Expected: focused assertions pass; Viz5 reports a completed probe with zero errors and valid terrain WGSL.

### Task 4: Full verification, visual review, and handoff state

**Files:**
- Modify: `MEMORY.md`

**Interfaces:**
- Consumes: the complete implementation and approved viewport matrix.
- Produces: current verification evidence and an explicit record that frozen quantitative contracts stayed untouched.

- [ ] **Step 1: Run the repository release gate**

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
node probe/run-viz5-probe.mjs
```

Expected: every command exits zero. Report environmental limitations separately from product defects.

- [ ] **Step 2: Perform read-only browser review**

Review `982×800`, `982×443`, `982×319`, `390×844`, and `255×542`.

For each viewport confirm:

- Rainier remains centered and fully framed horizontally.
- The DEM edge dissolves into the night stage without exposing a hard square boundary.
- Historical year/status evidence remains readable across bright snow/trail pixels.
- Plan, method, and cohort evidence remains at least `10px`.
- Portrait plan text wraps and all six cohorts reflow without horizontal overflow.
- Visible client elements do not intersect or clip.

- [ ] **Step 3: Update the repository handoff**

Add a dated `MEMORY.md` entry recording the source paths changed, viewport results, exact verification commands, the camera-fit margin (`1.12`), terrain fade width (`1.75` world units), and that simulation/store/worker/buffer/statistical contracts were untouched.

- [ ] **Step 4: Review the final diff**

Run:

```powershell
git diff --check
git status --short
git diff -- src/scene/cameraFit.ts src/scene/cameraFit.test.mjs src/scene/CameraRig.tsx src/scene/mountain/terrainColor.ts src/scene/mountain/TerrainMesh.tsx src/app/theme.css src/ui/robustnessCopy.test.mjs package.json MEMORY.md
```

Expected: no whitespace errors, no unrelated changes, and every approved design requirement maps to a verified implementation or explicitly recorded limitation.
