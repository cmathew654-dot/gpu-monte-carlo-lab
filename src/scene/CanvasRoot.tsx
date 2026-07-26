/**
 * CanvasRoot.tsx — WebGPU canvas root (spec §3.7, §4.1 task 3).
 *
 * THE most version-sensitive file in the project. Ground truth:
 * docs/TSL_AUDIT.md (three@0.185.1 EXACT, @react-three/fiber@9.6.1).
 *
 * Key facts baked in (verified against pinned versions, NOT blog posts):
 *  - R3F v9 `gl` accepts an async factory returning a Promise<Renderer>.
 *  - three r185: `renderer.render()` is the sync entry; `renderAsync()` is
 *    deprecated since r181 — so `await renderer.init()` must complete inside
 *    the factory, before R3F's frame loop issues its first sync `render()`.
 *  - `SpriteNodeMaterial` comes from `three/webgpu` and is NOT in R3F's
 *    default JSX catalogue → registered below via `extend()` + a
 *    `ThreeElements` module augmentation (Agent 4: reuse this pattern).
 *  - Compute dispatch: `renderer.compute(node)` / `await renderer.computeAsync(node)`.
 *  - Stats readback (Agent 3): `renderer.getArrayBufferAsync(attribute)` —
 *    there is NO `readback`/`readbackAsync` in r185.
 *  - R3F types `state.gl` as WebGLRenderer; cast for WebGPU-only methods:
 *    `useThree((s) => s.gl) as unknown as WebGPURenderer`.
 */
import { Canvas, extend, type ThreeElement } from '@react-three/fiber';
import {
  LineBasicNodeMaterial,
  SpriteNodeMaterial,
  WebGPURenderer,
} from 'three/webgpu';
import { hasWebGPU, useSimStore } from '../store/simStore';
import { installDiagOverlay } from '../ui/diagOverlay';
import { CapabilityBadge } from '../ui/CapabilityBadge';
import { AxisScaffold } from './AxisScaffold';
import { ConeParticles } from './ConeParticles';
import { CameraRig } from './CameraRig';
import { CrossSection } from './CrossSection';
import { PercentileGuides } from './PercentileGuides';
import { PostFX } from './PostFX';
import { SimDriver } from './SimDriver';
import { TrajectoryLines } from './TrajectoryLines';
import { YearCursor } from './YearCursor';
import { ClientMountain } from './mountain/ClientMountain';

// Register the WebGPU node materials in the R3F JSX catalogue (spec §3.6).
extend({ SpriteNodeMaterial, LineBasicNodeMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    spriteNodeMaterial: ThreeElement<typeof SpriteNodeMaterial>;
    lineBasicNodeMaterial: ThreeElement<typeof LineBasicNodeMaterial>;
  }
}

/**
 * Non-WebGPU branch (spec §4.1 task 5, R4): clean placeholder that Agent 6
 * skins. Runs NO canvas — CPU sim (Agent 2's cpuSim.ts) drives a DOM view.
 */
function CpuFallback() {
  return (
    <div className="fallback-container">
      <CapabilityBadge
        mode="cpu"
        detail="10k paths — connect a WebGPU browser for 100× more scenarios"
      />
      {/* Agent 6 mounts the worker-driven CPU fallback UI into this node. */}
      <div id="cpu-fallback-root" className="fallback-dom" />
    </div>
  );
}

export function CanvasRoot() {
  // viz5 audience split (VIEW-only — the sim/buffers/stats paths are
  // shared; SimDriver never branches on this):
  //   client : ClientMountain — Mt. Rainier from real USGS terrain, the
  //            simulated futures climbing it as glowing trails; falls back
  //            to the viz4 PercentileBands scene when the terrain asset
  //            can't be loaded (offline)
  //   advisor: the full v3 terminal — cone, threads, year cursor,
  //            cross-section, percentile guide lines, ghosts (byte-identical
  //            to viz4)
  const viewMode = useSimStore((s) => s.viewMode);
  const mode = useSimStore((s) => s.mode);
  if (!hasWebGPU() || mode === 'cpu') {
    return <CpuFallback />;
  }

  // ?diag=1 on-page diagnostics (WGSL/driver errors, device loss). Must be
  // armed before the async gl factory calls adapter.requestDevice().
  installDiagOverlay();

  return (
    <Canvas
      className="sim-canvas"
      frameloop="always"
      dpr={[1, 2]}
      // CameraRig drives the camera every frame; these props are just the
      // pre-first-frame seed. Far plane covers the 70-unit max dolly.
      camera={{ position: [0, 10, 32], fov: 45, near: 0.1, far: 500 }}
      gl={async (defaultProps) => {
        const renderer = new WebGPURenderer({
          canvas: defaultProps.canvas as HTMLCanvasElement,
          antialias: true,
        });
        // Awaited before the first frame (spec §3.7). r185 deprecation of
        // renderAsync() makes this the REQUIRED ordering.
        try {
          await renderer.init();
        } catch (error) {
          useSimStore.getState().setMode('cpu');
          throw error;
        }

        const device = (
          renderer as unknown as {
            backend?: {
              device?: {
                lost: Promise<{ reason?: string; message?: string }>;
              };
            };
          }
        ).backend?.device;
        if (device) {
          void device.lost.then((info) => {
            console.error('[CanvasRoot] WebGPU device lost:', info);
            useSimStore.getState().setMode('cpu');
          });
        }
        return renderer;
      }}
    >
      {/* viz5: the client view is a night scene (deep indigo); the advisor
          terminal stays pure black. */}
      <color
        attach="background"
        args={[viewMode === 'client' ? '#04060d' : '#000000']}
      />
      {viewMode === 'advisor' ? (
        <>
          {/* Advisor mode: the full v3/viz4 terminal, byte-identical. */}
          <ConeParticles />
          <TrajectoryLines />
          <YearCursor />
          <CrossSection />
          <PercentileGuides />
          <AxisScaffold />
        </>
      ) : (
        /* viz5 client view: the mountain (with the viz4 PercentileBands
           scene as its internal offline fallback). */
        <ClientMountain />
      )}
      <CameraRig />
      <PostFX />
      {/* Integrator — GPU sim driver (committedParams → runSimulation →
          recomputeStats → setStats). Renders nothing. */}
      <SimDriver />
    </Canvas>
  );
}
