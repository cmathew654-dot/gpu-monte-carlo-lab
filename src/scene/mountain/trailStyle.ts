/**
 * trailStyle.ts — the shared trail-shape constants for the viz5 mountain.
 * Single source of truth for the trail shape — never hardcode these values
 * in the node graphs.
 */

/** Trail lift above the surface at zero offset (avoids z-fighting). */
export const TRAIL_LIFT = 0.1;
/** Offset mapping: world units per log10 decade from the median.
 * v5.3: 1.5→1.0 — "trim some of that verticality": wealth shows up as
 * altitude ABOVE/BELOW the route, but the braid must read as spread, not
 * strata. */
export const OFFSET_K = 1.0;
/** Offset clamp: winners ride ≤ +1.4 above (was 2.0), strugglers sink to
 * the surface. */
export const OFFSET_HI = 0.35;
export const OFFSET_LO = -0.06;
/** Lateral spread ACROSS the face (world units, full width = LAT_SPREAD).
 * v5.3: 1.7→3.5 — "spread but not nearly enough". The braid now spans a
 * wide swath of the mountainside around each route. */
export const LAT_SPREAD = 3.5;
/** Sinusoidal weave amplitude along the route (v5.3: 0.35→0.5). */
export const LAT_WEAVE_AMP = 0.5;
/** Extra lift for the highlighted hero thread so it floats just above the
 * braid and never tangles into it. */
export const HERO_LIFT = 0.15;
