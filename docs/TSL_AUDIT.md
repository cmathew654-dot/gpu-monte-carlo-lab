# TSL Import Audit — §3.0 Ground Truth (updated by Agent 1)

**Date:** build kickoff · **Auditor:** Agent 1 · **Method:** runtime import checks (`node --input-type=module`)
against the installed packages in `node_modules`, plus type-declaration grep and the
three.js GitHub `r185` tag examples (`webgpu_compute_particles.html`) as ground truth.

This document supersedes the speculative parts of spec §3.0. All agents MUST code
against the pinned versions below.

## Pinned versions

| Package | Pinned | Spec range | Notes |
|---|---|---|---|
| `three` | **0.185.1 (EXACT, no caret)** | pin exact | r185. TSL + WebGPURenderer. |
| `@types/three` | **0.185.0 (EXACT)** | — | matches three minor (r185). |
| `@react-three/fiber` | **^9.6.1** (installed 9.6.1) | ^9 | React 19 compatible. |
| `@react-three/drei` | **^10.7.7** (installed 10.7.7) | ^10 | peer: fiber ^9, three >=0.159. |
| `@react-three/postprocessing` | **^3.0.4** (installed 3.0.4) | ^3 | ⚠️ WebGL-only engine — see below. |
| `postprocessing` (transitive) | 6.39.3 | — | 148 WebGL refs, **0 WebGPU refs**. |
| `zustand` | **^5.0.14** (installed 5.0.14) | ^5 | |
| `vite` | ^7.2.4 | ^7 | scaffold-provided. |
| `typescript` | ~5.9.3 | ^5 | scaffold-provided. |
| `react` / `react-dom` | ^19.2.0 | React 19 | scaffold-provided. |

## TSL import audit (`three/tsl`, three@0.185.1)

Every name required by spec §3 was verified by **runtime import** (`import * as TSL from 'three/tsl'`)
and by presence in `node_modules/@types/three/src/Three.TSL.d.ts`:

| Spec name | Runtime (`three/tsl`) | Types | Status |
|---|---|---|---|
| `instancedArray` | function | ✅ | **PASS** |
| `instanceIndex` | object (node) | ✅ | **PASS** |
| `Fn` | function | ✅ | **PASS** |
| `uniform` | function | ✅ | **PASS** |
| `hash` | function | ✅ | **PASS** |
| `float` | function | ✅ | **PASS** |
| `uint` | function | ✅ | **PASS** |
| `Loop` | function | ✅ | **PASS** |
| `If` | function | ✅ | **PASS** |
| `PI2` | object (node) | ✅ | **PASS** |
| `positionLocal` | object (node) | ✅ | **PASS** |
| `deltaTime` | object (node) | ✅ | **PASS** |
| `Return` | function | ✅ | **PASS** (used in §3.4 early-out) |
| `vec3` | function | ✅ | **PASS** (used in §3.5) |
| `pass` | function | ✅ | **PASS** (needed by Agent 4 TSL post chain) |

**Zero TSL name drift.** All §3 patterns compile against r185 unchanged.

## `three/webgpu` audit

| Spec name | Runtime | Types | Status |
|---|---|---|---|
| `WebGPURenderer` | function (class) | ✅ | **PASS** |
| `SpriteNodeMaterial` | function (class) | ✅ | **PASS** |
| `PostProcessing` | function (class) | ✅ | **PASS** (WebGPU-native post chain) |

## DRIFT FOUND — two mappings all agents must use

### 1. Readback API: it is NOT `readback`/`readbackAsync`

three r185 `WebGPURenderer` (base class `Renderer`) has **no** `readback()` or
`readbackAsync()` method. The readback API in the pinned version is:

```
renderer.getArrayBufferAsync(attribute, target?, offset?, count?): Promise<ArrayBuffer | TypedArray>
```

- Declared in `@types/three/src/renderers/common/Renderer.d.ts` (overloads at lines 538/544).
- **Mapping for Agent 3:** spec §4.3 task 3's "single `readbackAsync`" →
  `renderer.getArrayBufferAsync(attribute)` where `attribute` is the storage-buffer
  attribute (e.g. the attribute behind an `instancedArray`). This is the r185
  equivalent — documented in the r185 `webgpu_compute_*` examples/addons.

### 2. `@react-three/postprocessing@^3` is NOT WebGPU-compatible

The installed `postprocessing@6.39.3` engine is WebGL-only (148 references to
`WebGLRenderer`/`WebGLRenderTarget`, zero WebGPU support). Its peer range
(`three >= 0.168 < 0.186`) admits r185, but it cannot drive `WebGPURenderer`.

- **Mapping for Agent 4 (per spec §4.4 fallback clause):** do NOT downgrade the
  renderer. Use three r185's native TSL post-processing, all verified present:
  - `import { pass } from 'three/tsl'` ✅
  - `import { bloom } from 'three/addons/tsl/display/BloomNode.js'` ✅
  - `gaussianBlur` → `three/addons/tsl/display/GaussianBlurNode.js` ✅
  - DOF → `three/addons/tsl/display/DepthOfFieldNode.js` ✅
  - Driver: `new THREE.PostProcessing(renderer)` (`three/webgpu`) ✅
  - Reference: three.js `r185` tag, `webgpu_postprocessing_bloom.html`.
- The package remains installed per §1.3 (spec compliance); it must simply not be
  wired to the WebGPURenderer.

## R3F v9 + WebGPURenderer glue (ground truth, used in `src/scene/CanvasRoot.tsx`)

Verified against `@react-three/fiber@9.6.1` type declarations
(`dist/declarations/src/core/renderer.d.ts`) and three r185 sources:

1. R3F v9 `gl` prop accepts an **async factory**:
   `gl?: Renderer | ((defaultProps: DefaultGLProps) => Renderer | Promise<Renderer>)`.
2. R3F's frame loop calls `state.gl.render(scene, camera)` **synchronously**
   (`react-three-fiber.esm.js` line 16060). three r185 `Renderer.render()` is the
   sync method; `renderAsync()` is **deprecated since r181** (warns: use `render()`
   + `await renderer.init()`). The factory therefore awaits `init()` before
   returning, so the first sync `render()` is legal:

```tsx
<Canvas
  frameloop="always"
  gl={async (defaultProps) => {
    const renderer = new WebGPURenderer({
      canvas: defaultProps.canvas as HTMLCanvasElement,
      antialias: true,
    })
    await renderer.init() // awaited before first frame (spec §3.7)
    return renderer
  }}
>
```

3. Compute dispatch (Agent 2): `renderer.compute(node)` or
   `await renderer.computeAsync(node)` — both present in r185 (`Renderer.d.ts`
   line 958). r185 examples call `renderer.compute(computeInit)` after `init()`.
4. **Type cast needed:** R3F types `state.gl` as `THREE.WebGLRenderer`. Agents
   accessing `computeAsync` / `getArrayBufferAsync` must cast:
   `useThree((s) => s.gl) as unknown as WebGPURenderer`.
5. JSX catalogue: `SpriteNodeMaterial` is not in R3F's default catalogue (it comes
   from `three/webgpu`, not `three`). Register once via
   `extend({ SpriteNodeMaterial })` + `declare module '@react-three/fiber'`
   augmentation of `ThreeElements` — implemented in `CanvasRoot.tsx`; Agent 4
   should reuse that pattern (import `CanvasRoot` side effect or re-register).

## Ground-truth examples consulted (three.js GitHub, tag `r185`)

- `examples/webgpu_compute_particles.html` — `instancedArray(count, 'vec3')`,
  `.element(instanceIndex)`, `.toAttribute()`, `SpriteNodeMaterial` with
  `positionNode`/`colorNode`/`scaleNode`, `new THREE.Sprite(material)` +
  `sprite.count = N`, `new THREE.WebGPURenderer({ antialias: true })`,
  `await renderer.init()`, `renderer.compute(computeInit)`.

## Known hazard: nested three@0.170 copy

`stats-gl@2.4.2` (transitive via drei) vendors its own `three@0.170.0` under
`node_modules/stats-gl/node_modules/three`. The hoisted/root `three` is the
pinned 0.185.1 (verified via `npm ls three` — every other consumer is
`deduped`). **Do not use drei's `StatsGl` component** — it would load the
wrong three build. No other duplicate exists.

## Verdict

**AUDIT GREEN** — all §3 TSL imports exist in three@0.185.1 with zero drift.
Two spec-§3.0 items drifted in naming/scope (readback API name; postprocessing
compatibility) and are mapped above. No improvisation was required beyond these
recorded mappings.
