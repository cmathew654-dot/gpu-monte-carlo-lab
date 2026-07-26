/**
 * CameraRig.tsx — slow orbital drift + mouse parallax + wheel zoom (spec §4.4).
 * SINGLE OWNER: Agent 4.
 *
 * Behavior:
 *  - Slow constant orbital drift around the cone (~90 s per revolution).
 *  - Mouse parallax: ±5° on azimuth and elevation, exponentially damped
 *    (spec: "mouse parallax ±5°").
 *  - Wheel zoom: exponential dolly, clamped [9, 70] world units. As the
 *    camera dollies in, the look-at target slides along the time axis toward
 *    the terminal fan / ember field (+X) so scroll-zoom inspects the TAIL
 *    region (spec: "scroll/zoom to inspect the tail region").
 *
 * Custom implementation (not drei's CameraRig) so the drift/parallax/zoom
 * compose exactly per spec and no extra drei surface is pulled into the
 * WebGPU scene. No drei StatsGl anywhere (TSL_AUDIT.md hazard: stats-gl
 * vendors a nested three@0.170).
 *
 * Frame math is plain three objects (no TSL) — this is scene-graph code,
 * not shader code.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useSimStore } from '../store/simStore';
import { mountainFitRadius } from './cameraFit';
import {
  getTerrainStatus,
  getTerrainSummitY,
  MOUNTAIN_WORLD_SIZE,
} from './mountain/terrain';

/** Orbital drift speed (rad/s): full revolution in ~90 s. */
const DRIFT_SPEED = 0.07;
/** viz4 client view: the band river must never turn edge-on, so the full
 * orbit becomes a slow, gentle sway around the front three-quarter view
 * (±0.45 rad, ~60 s period — slightly slower than the advisor drift). */
const CLIENT_SWAY_SPEED = 0.1;
const CLIENT_SWAY_AMPLITUDE = 0.45;
/** viz5 mountain client view: a slow, low-angle sway looking UP the face
 * at the summit (the mountain must never turn edge-on either). */
const MOUNTAIN_SWAY_SPEED = 0.06;
const MOUNTAIN_SWAY_AMPLITUDE = 0.3;
const MOUNTAIN_ELEVATION = 0.15; // rad above the XZ plane — a low look up
const MOUNTAIN_RADIUS_MIN = 15;
const MOUNTAIN_RADIUS_MAX = 60;
/** Base elevation above the XZ plane. */
const BASE_ELEVATION = 0.32; // ~18°
/** Parallax amplitude (spec: ±5°). */
const PARALLAX = (5 * Math.PI) / 180;
/** Damping rate for pointer parallax (1/s). */
const DAMPING = 2.5;
/** Wheel dolly range (world units). */
const RADIUS_MIN = 9;
const RADIUS_MAX = 70;
const RADIUS_START = 34;
/** How far the look-at target slides toward the tail (+X) at full zoom-in. */
const TAIL_TARGET_X = 11;
const TAIL_TARGET_Y = -2;

export function CameraRig() {
  const gl = useThree((s) => s.gl);
  const radius = useRef(RADIUS_START);
  // Damped pointer parallax offsets (radians).
  const parallax = useRef({ x: 0, y: 0 });

  // Wheel zoom on the canvas element. passive:false so the page doesn't
  // scroll while the user inspects the tail.
  useEffect(() => {
    const el = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const next = radius.current * Math.exp(e.deltaY * 0.001);
      radius.current = Math.min(Math.max(next, RADIUS_MIN), RADIUS_MAX);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [gl]);

  useFrame((state, delta) => {
    const { camera, pointer, clock } = state;

    // Exponentially damped pointer parallax (frame-rate independent).
    const k = 1 - Math.exp(-delta * DAMPING);
    parallax.current.x += (pointer.x * PARALLAX - parallax.current.x) * k;
    parallax.current.y += (pointer.y * PARALLAX - parallax.current.y) * k;

    // getState() inside useFrame: no React re-render for a per-frame read.
    const client = useSimStore.getState().viewMode === 'client';
    // viz5: the mountain frames differently — low angle, summit target.
    const mountain = client && getTerrainStatus() === 'ready';
    let targetX: number;
    let targetY: number;
    let azimuth: number;
    let elevation: number;
    let effectiveRadius = radius.current;
    if (mountain) {
      radius.current = Math.min(
        Math.max(radius.current, MOUNTAIN_RADIUS_MIN),
        MOUNTAIN_RADIUS_MAX,
      );
      azimuth =
        Math.sin(clock.elapsedTime * MOUNTAIN_SWAY_SPEED) *
          MOUNTAIN_SWAY_AMPLITUDE +
        parallax.current.x;
      elevation = MOUNTAIN_ELEVATION + parallax.current.y * 0.5;
      if ('isPerspectiveCamera' in camera) {
        effectiveRadius = mountainFitRadius(
          radius.current,
          MOUNTAIN_WORLD_SIZE * 0.5,
          camera.fov,
          camera.aspect,
        );
      } else {
        effectiveRadius = radius.current;
      }
      targetX = 0;
      targetY = getTerrainSummitY() * 0.60;
    } else {
      azimuth = client
        ? Math.sin(clock.elapsedTime * CLIENT_SWAY_SPEED) *
            CLIENT_SWAY_AMPLITUDE +
          parallax.current.x
        : clock.elapsedTime * DRIFT_SPEED + parallax.current.x;
      elevation = BASE_ELEVATION + parallax.current.y;

      // Zoom factor 0 (far) → 1 (close); quadratic so the tail slide
      // engages mostly at close range.
      const zt =
        1 - (radius.current - RADIUS_MIN) / (RADIUS_MAX - RADIUS_MIN);
      const slide = zt * zt;
      targetX = slide * TAIL_TARGET_X;
      targetY = slide * TAIL_TARGET_Y;
    }

    const r = effectiveRadius;
    camera.position.set(
      targetX + r * Math.cos(elevation) * Math.sin(azimuth),
      targetY + r * Math.sin(elevation),
      r * Math.cos(elevation) * Math.cos(azimuth),
    );
    camera.lookAt(targetX, targetY, 0);
  });

  return null;
}
