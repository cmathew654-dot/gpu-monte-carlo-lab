/**
 * YearCursor.tsx — the time playhead (viz2 deliverable 1): a vertical
 * year-cursor plane slicing the cone at year t.
 *
 * Behavior (interaction contract documented in playhead.ts):
 *   - auto-sweeps 0 → horizon in SWEEP_SECONDS (~8 s), then loops;
 *   - drag-scrubbable via the DOM slider in PlayheadHud.tsx (scrubbing
 *     pauses the sweep; release resumes from the dragged position);
 *   - restarts from 0 on every completed re-sim (stats computedAt bump).
 *
 * Geometry: a faint additive YZ plane (x = cursor position) spanning the
 * full live region plus the ember floor, plus a brighter vertical core
 * line at z = 0 and a floor line along z at the live clamp bottom. All
 * plain three materials (no authored TSL → no new shader-graph risk);
 * position is driven per-frame from the shared playhead state, which this
 * component owns advancing (the ONLY writer of uCursorX).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three/webgpu';
import { X_SPAN, Y_CLAMP, Y_FLOOR, xFromNorm } from './layout';
import { SWEEP_SECONDS, playhead, uCursorX } from './playhead';
import { useSimStore } from '../store/simStore';

/** Plane spans a little past the cone volume in z. */
const Z_HALF = 4.6;

export function YearCursor() {
  const group = useRef<Group>(null);

  const { plane, lines } = useMemo(() => {
    const height = Y_CLAMP - Y_FLOOR;
    const yCenter = (Y_CLAMP + Y_FLOOR) / 2;

    const planeGeo = new PlaneGeometry(Z_HALF * 2, height);
    const planeMat = new MeshBasicMaterial({
      color: 0x3080ff,
      transparent: true,
      opacity: 0.045,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    const planeMesh = new Mesh(planeGeo, planeMat);
    // PlaneGeometry lies in XY; rotate so width maps to Z (a YZ slice).
    planeMesh.rotation.y = Math.PI / 2;
    planeMesh.position.y = yCenter;

    // Brighter core lines: vertical at z=0 through the cone's center plane,
    // and a floor line along z at the bottom of the live region.
    const lineGeo = new BufferGeometry();
    lineGeo.setAttribute(
      'position',
      new Float32BufferAttribute(
        [
          0, Y_FLOOR, 0, 0, Y_CLAMP, 0, // vertical core
          0, Y_CLAMP * -1, -Z_HALF, 0, Y_CLAMP * -1, Z_HALF, // floor line
        ],
        3,
      ),
    );
    const lineMat = new LineBasicMaterial({
      color: 0x9cc4ff,
      transparent: true,
      opacity: 0.4, // v2.2: 0.55→0.4 — scanner line, not a wall
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const lineSegs = new LineSegments(lineGeo, lineMat);
    lineSegs.frustumCulled = false;
    planeMesh.frustumCulled = false;

    return { plane: planeMesh, lines: lineSegs };
  }, []);

  // Restart the sweep on each completed re-sim (same signal that restarts
  // ConeParticles' reveal): a fresh scenario re-tells its story left→right.
  useEffect(
    () =>
      useSimStore.subscribe((state, prev) => {
        if (state.stats?.computedAt !== prev.stats?.computedAt) {
          playhead.xNorm = 0;
          playhead.playing = true;
        }
      }),
    [],
  );

  // Advance the sweep + position the plane. The ONLY writer of uCursorX.
  useFrame((_, delta) => {
    if (playhead.playing && !playhead.scrubbing) {
      playhead.xNorm += delta / SWEEP_SECONDS;
      if (playhead.xNorm > 1) playhead.xNorm -= 1; // loop
    }
    uCursorX.value = playhead.xNorm;
    if (group.current) {
      group.current.position.x = xFromNorm(playhead.xNorm);
    }
  });

  return (
    <group ref={group} position={[X_SPAN / 2, 0, 0]}>
      <primitive object={plane} />
      <primitive object={lines} />
    </group>
  );
}
