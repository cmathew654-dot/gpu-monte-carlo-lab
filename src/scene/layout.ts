/**
 * layout.ts — shared world-space layout constants for the cone scene.
 *
 * SINGLE SOURCE OF TRUTH: these values originated in ConeParticles.tsx
 * (identical numbers, moved verbatim); every viz2 overlay (year cursor,
 * cross-section histogram, percentile guides, trajectory lines, axis
 * scaffolding) maps data through the SAME transform so all layers agree:
 *
 *   x = (month / horizonMonths − 0.5) · X_SPAN
 *   y = (log10(wealth) − log10(initialWealth)) · Y_SCALE   (clamped ±Y_CLAMP
 *       for live points; dead paths drop to the ember floor Y_FLOOR)
 *   z = per-path hash-disc jitter, radius Z_RAD (sprites only — overlays
 *       live on the z = 0 center plane)
 */

/** Full time-axis span. */
export const X_SPAN = 26;
/** World units per log10 decade of wealth around the initial-wealth pivot. */
export const Y_SCALE = 4.0;
/** Vertical clamp for live points (±8 units = ±2 decades). */
export const Y_CLAMP = 8.0;
/** Ember-floor height for death-step sprites (below the live clamp floor). */
export const Y_FLOOR = -9.2;
/** Radius of the per-path hash-disc Z jitter (cone volume). v2.2: 3.4→2.4 —
 * tighter volume reads as a CONE, not a starfield (user feedback). */
export const Z_RAD = 2.4;

/** World X of a normalized time position (0…1). */
export const xFromNorm = (xNorm: number): number => (xNorm - 0.5) * X_SPAN;

/** World Y of an absolute wealth in $ (live clamp applied). */
export const yFromWealth = (wealth: number, logCenter: number): number =>
  Math.min(
    Y_CLAMP,
    Math.max(-Y_CLAMP, (Math.log10(Math.max(wealth, 1)) - logCenter) * Y_SCALE),
  );
