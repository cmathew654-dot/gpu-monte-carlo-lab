/**
 * playhead.ts — shared year-cursor state (viz2 deliverable 1).
 *
 * A tiny MODULE-LEVEL store (not zustand): the cursor moves every frame
 * while sweeping, and routing that through React state would re-render the
 * HUD 60×/s. Scene components read `playhead` inside useFrame; the DOM HUD
 * (PlayheadHud.tsx) reads it from its own rAF loop and writes it from its
 * slider. Uniform identities are created once here and imported by the
 * materials that need them (stable node identities, §3.4 discipline).
 *
 * Interaction contract:
 *   - auto-sweep: xNorm advances 0 → 1 in SWEEP_SECONDS, then loops;
 *   - the HUD slider pauses the sweep while dragged (scrubbing) and resumes
 *     from the dragged position on release;
 *   - a re-sim (stats computedAt change — wired in YearCursor) restarts the
 *     sweep from 0, so a fresh scenario re-tells its story left→right.
 */
import { uniform } from 'three/tsl';

/** Full sweep duration (spec: ~8 s). */
export const SWEEP_SECONDS = 8.0;

export interface PlayheadState {
  /** Cursor position in normalized time, 0 (start) … 1 (horizon). */
  xNorm: number;
  /** Auto-sweep runs while true AND scrubbing is false. */
  playing: boolean;
  /** True while the HUD slider is held — sweep pauses. */
  scrubbing: boolean;
}

export const playhead: PlayheadState = {
  xNorm: 1.0, // fully revealed until the first sweep starts
  playing: true,
  scrubbing: false,
};

/**
 * Cursor position as a scene uniform (0…1 normalized time). Consumed by
 * ConeParticles (dim sprites ahead of the cursor) — written ONLY by
 * YearCursor's useFrame. Visual-only: never read by a sim kernel.
 */
export const uCursorX = uniform(1.0);

/**
 * Reveal sweep 0→1 (spec §4.4). SHARED visual uniform: ConeParticles is
 * the ONLY writer (its useFrame advances the sweep); TrajectoryLines reads
 * it so dots and threads reveal in lockstep instead of the threads popping
 * in ahead of their sprites. Visual-only, stable module-level identity
 * (§3.4 — never recreated per render).
 */
export const uReveal = uniform(0.0);

/** Soft edge of the cursor dim, in normalized-time units. */
export const CURSOR_FEATHER = 0.012;
/** Residual alpha for sprites ahead of the cursor (ghosted, not hidden).
 * v2.3: 0.05→0.12 — the sweep was reading as an erasing "window" (user
 * feedback); ahead content now stays faintly present. */
export const CURSOR_GHOST = 0.12;
