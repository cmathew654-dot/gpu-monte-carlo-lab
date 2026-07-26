---
status: approved
owner: Cyril
approved_at: 2026-07-26
scope: client HUD composition, Rainier framing, and terrain edge treatment
---

# Client composition and responsive Rainier framing

## Problem

The transparent historical evidence row crosses Rainier's brightest snow and
trail pixels. Its 9–11 px labels have measured contrast between 1.04:1 and
2.96:1 there, so transparency alone is not readable. The height-only compact
breakpoint also misclassifies a 255×542 portrait window as short landscape,
forcing plan and cohort content offscreen.

The 45° perspective camera uses a fixed distance and never accounts for aspect
ratio. At 255×542 only 51.2% of sampled terrain vertices fit horizontally.
The square DEM also has no boundary treatment, so a close crop exposes a hard
rectangular edge.

## Approved composition

The client result remains a flat alpine instrument, not a card stack.

- Normal-height HUD top padding becomes `clamp(36px, 6vh, 48px)`, moving the
  stack upward by 24 px at an 800 px viewport. The verified
  982×319 layout keeps its existing top position.
- Rainier's look-at target rises from 52% to 60% of summit height,
  which optically lowers the mountain beneath the client evidence.
- Historical labels receive a restrained dark text edge for stable contrast.
  There is no background panel, pill, border, or decorative glow.
- Plan, method, and cohort text never drop below 10 px.
- The compact height treatment applies only to landscape-like aspect ratios.
  Narrow portrait content wraps, and six cohorts reflow rather than overflow.

## Camera and terrain treatment

`CameraRig` derives a mountain-only minimum effective radius from the terrain
half-width, vertical field of view, camera aspect, and a 1.12 fit margin. It
does not mutate the stored wheel radius and does not change advisor framing.
Landscape framing remains unchanged except for the modest vertical target.

The terrain material fades only within the final 1.75 world units of the x/z
boundary. The fade blends the finite DEM into the night stage while preserving
the interior color, elevation, routes, and simulation data. The material keeps
depth behavior for the opaque interior and uses a small alpha cutoff at the
outermost edge. The existing production terrain graph remains the single source
compiled by the Viz5 probe.

## Data and contract impact

No simulation, return model, statistic, store field, worker message, buffer
layout, seed stream, or financial operation changes. Camera fitting reads only
existing viewport/camera data. Terrain fading is presentation-only and additive.

## Failure handling

If terrain loading fails, the existing percentile-band fallback remains
unchanged. Aspect fitting engages only when client mode and ready terrain are
both true. Invalid or non-perspective camera values fall back to the existing
radius so the frame loop cannot produce a non-finite position.

## Verification

- Add pure camera-fit tests: landscape retains the base radius; 390×844 and
  255×542 receive the calculated minimum; results are finite and monotone as
  aspect narrows.
- Extend UI CSS assertions for landscape-only compact rules, 10 px minimum
  evidence text, portrait wrapping, and cohort reflow.
- Compile the real modified terrain material through
  `node probe/run-viz5-probe.mjs` and require zero Tint errors.
- Read-only visual review at 982×800, 982×443, 982×319, 390×844, and 255×542.
  Check that Rainier is centered, the DEM edge dissolves into black, the
  historical evidence remains readable, and visible client elements do not
  intersect or clip.
- Run the repository's full release gate before deployment.

## Non-goals

No new model copy, no client card or scrim, no camera controls redesign, no
terrain-data replacement, and no change to advisor presentation.
