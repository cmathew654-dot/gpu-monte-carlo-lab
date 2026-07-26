/**
 * clientMode.ts — shared client/advisor VIEW uniform (viz4).
 *
 * The audience split is a VIEW, never a second sim: the same GPU-resident
 * run feeds both modes, and this single uint uniform tells the two
 * particle/line node graphs which subset to draw:
 *
 *   0 = advisor  full cone body + all trajectory threads (v3 behavior)
 *   1 = client   cone sprites: death-slot embers + the hero thread ONLY
 *                trajectory threads: the hero path's segments ONLY
 *
 * Stable module-level identity (§3.4 — never recreated per render), the
 * same pattern as playhead.ts's uReveal/uCursorX. SINGLE WRITER:
 * ConeParticles' store sync writes it on viewMode change; every other
 * consumer reads. Consumed only in uint comparisons (r185 ConditionalNode
 * discipline — never mix a uint node into float contexts).
 */
import { uniform } from 'three/tsl';

/** 0 = advisor (full density field), 1 = client (embers + hero only). */
export const uClientMode = uniform(0, 'uint');
