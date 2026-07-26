/**
 * ClientMountain.tsx — the viz5 CLIENT view: Mt. Rainier at night, built
 * from real USGS elevation data, with the simulated futures climbing it.
 *
 *   TerrainMesh     shaded relief + snowline, lit by a low moon key light
 *   MountainTrails  blue ascent trails (wealth-mapped offset along terrain
 *                   normals; median path near-white 3×)
 *   MountainEmbers  failed futures ignite at their death snap and slide
 *                   downhill, ember red
 *   SummitMarker    glowing cairn at the summit
 *   MountainReveal  drives the shared uReveal sweep while the cone is
 *                   unmounted (4 s ease-out, restarts on each re-sim)
 *
 * OFFLINE FALLBACK (spec): if the terrain asset fails to load, this renders
 * the viz4 client scene instead — PercentileBands + ConeParticles +
 * TrajectoryLines + AxisScaffold (PercentileBands.tsx is kept in the tree
 * for exactly this path).
 */
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSimStore } from '../../store/simStore';
import { uReveal } from '../playhead';
import { AxisScaffold } from '../AxisScaffold';
import { ConeParticles } from '../ConeParticles';
import { PercentileBands } from '../PercentileBands';
import { TrajectoryLines } from '../TrajectoryLines';
import { MountainEmbers } from './MountainEmbers';
import { GauntletMountainTrails } from './GauntletMountainTrails';
import { MountainTrails } from './MountainTrails';
import { SummitMarker } from './SummitMarker';
import { TerrainMesh } from './TerrainMesh';
import { useTerrain } from './terrain';

/** Reveal sweep duration (matches the cone's 4 s, spec §4.4). */
const REVEAL_SECONDS = 4.0;

/**
 * Drives the shared uReveal uniform while ConeParticles (its advisor-mode
 * writer) is unmounted. Same restart triggers + easing as ConeParticles so
 * trails ignite left→right along their routes after every re-sim.
 */
function MountainReveal() {
  const revealStart = useRef<number | null>(null);

  useEffect(
    () =>
      useSimStore.subscribe((state, prev) => {
        if (
          state.params !== prev.params ||
          state.stats?.computedAt !== prev.stats?.computedAt
        ) {
          revealStart.current = null;
        }
      }),
    [],
  );

  useFrame((state) => {
    if (revealStart.current === null) {
      revealStart.current = state.clock.elapsedTime;
    }
    const t = (state.clock.elapsedTime - revealStart.current) / REVEAL_SECONDS;
    const c = Math.min(Math.max(t, 0), 1);
    uReveal.value = 1 - Math.pow(1 - c, 3);
  });

  return null;
}

export function ClientMountain() {
  const terrain = useTerrain();

  // Offline path: the viz4 client scene (bands + ember rain + hero thread).
  if (terrain.status === 'failed') {
    return (
      <>
        <ConeParticles />
        <TrajectoryLines />
        <PercentileBands />
        <AxisScaffold />
      </>
    );
  }
  // Loading: the narrative HUD carries the wait ("Listening to a hundred
  // thousand possible futures…"); the canvas stays dark for a beat.
  if (terrain.status !== 'ready' || terrain.data === null) {
    return null;
  }

  const data = terrain.data;
  return (
    <>
      {/* Night: deep indigo haze + a low cool moon key from the WSW
          (tuned against the viz5 visual probe render). */}
      <fog attach="fog" args={['#04060d', 36, 120]} />
      <ambientLight intensity={0.2} color="#2a3852" />
      <directionalLight position={[-16, 11, 15]} intensity={2.6} color="#b8ccff" />
      <directionalLight position={[18, 5, 22]} intensity={0.3} color="#3a4a70" />
      <TerrainMesh data={data} />
      <MountainTrails data={data} />
      <GauntletMountainTrails data={data} />
      <MountainEmbers data={data} />
      <SummitMarker data={data} />
      <MountainReveal />
    </>
  );
}
