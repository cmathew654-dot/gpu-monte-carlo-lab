---
name: "GPU Monte Carlo Lab"
description: "A measured retirement-risk instrument for advisors and clients."
colors:
  stage-black: "#000000"
  panel-black: "#0a0a0a"
  raised-black: "#111111"
  hairline: "#2e2e2e"
  control-line: "#606060"
  summit-white: "#ffffff"
  weather-gray: "#8f8f8f"
  instrument-blue: "#3080ff"
  forecast-blue: "#9fd8ff"
  ember-red: "#fb2c36"
  survival-green: "#72d6ad"
  caution-amber: "#e1c26e"
typography:
  display:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, sans-serif"
    fontSize: "44px"
    fontWeight: 300
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "IBM Plex Mono, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.02em"
rounded:
  instrument: "4px"
  panel: "6px"
  control: "8px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.summit-white}"
    textColor: "{colors.stage-black}"
    typography: "{typography.data}"
    rounded: "{rounded.panel}"
    padding: "6px 12px"
  button-secondary:
    backgroundColor: "{colors.panel-black}"
    textColor: "{colors.summit-white}"
    typography: "{typography.data}"
    rounded: "{rounded.panel}"
    padding: "6px 12px"
  panel:
    backgroundColor: "{colors.panel-black}"
    textColor: "{colors.summit-white}"
    rounded: "{rounded.panel}"
    padding: "16px"
  chip:
    backgroundColor: "{colors.raised-black}"
    textColor: "{colors.summit-white}"
    typography: "{typography.data}"
    rounded: "{rounded.instrument}"
    padding: "7px 8px"
---

# Design System: GPU Monte Carlo Lab

## Overview

**Creative North Star: "The Instrumented Ascent"**

The interface is a field instrument operated at night: the mountain supplies
the physical metaphor, while every DOM surface behaves like calibrated
measurement equipment placed over it. Client view is the quiet overlook; advisor
view is the survey station. They share one visual language but deliberately use
different information densities.

The system is restrained, flat, and exact. It rejects both generic fintech KPI
grids and trading-terminal cosplay. Visual interest comes from the real terrain,
measured curves, cohort colors, and changes of analytical scale—not ornamental
gradient, glass, or gratuitous animation.

**Key Characteristics:**

- Near-black stage with rare, state-bearing color.
- Condensed humanist copy paired with truly monospaced data.
- Hairlines and tonal layers instead of ambient card shadows.
- One explicit decision path: solvency → model disagreement → robust spending.
- Accessible tables and sentences are peers of the WebGPU scene, never fallbacks.

## Colors

The palette reads like weather instruments after dark: a black field, white
markings, cold blue analytical signals, and warm colors reserved for risk or
historical status.

### Primary

- **Instrument Blue** (`#3080ff`): active analytical lens, selected controls,
  focus, primary series, and successful frontier progress.
- **Forecast Blue** (`#9fd8ff`): model ranges and secondary measured-series
  emphasis where Instrument Blue would overpower dense data.

### Secondary

- **Ember Red** (`#fb2c36`): failure, drawdown, and error only.
- **Survival Green** (`#72d6ad`): survived historical cohorts; never a generic
  decorative success wash.
- **Caution Amber** (`#e1c26e`): data-limited or still-running historical states.

### Neutral

- **Stage Black** (`#000000`): canvas and application field.
- **Panel Black** (`#0a0a0a`) and **Raised Black** (`#111111`): the two allowed
  DOM surface layers.
- **Hairline** (`#2e2e2e`): decorative dividers that are not required to
  perceive a control, state, or data boundary.
- **Control Line** (`#606060`): interactive-control edges, inactive tracks, and
  plot frames; maintains at least 3:1 non-text contrast on the black surfaces.
- **Summit White** (`#ffffff`): primary text and selected high-contrast controls.
- **Weather Gray** (`#8f8f8f`): secondary labels; never use it below AA contrast
  for body-size prose.

**The Evidence Color Rule.** Saturated color must encode model, state, cohort,
or interaction. If color can be removed without losing information, remove it.

**The Red Means Failure Rule.** Ember Red is forbidden for emphasis, branding,
or hover decoration. Its rarity preserves its meaning.

## Typography

**Display Font:** Barlow Semi Condensed (with Arial Narrow fallback)

**Body Font:** Barlow Semi Condensed (with Arial Narrow fallback)

**Label/Mono Font:** IBM Plex Mono (with Consolas fallback)

**Character:** Barlow Semi Condensed gives client language a calm, editorial
humanity without wasting horizontal space. IBM Plex Mono makes parameters,
percentages, axes, and measured points align as evidence rather than decoration.

### Hierarchy

- **Display** (300, `44px`, 1.1): client outcome sentence only; tabular numbers
  use a slightly stronger weight.
- **Headline** (600, `20px`, 1.2): analytical lens titles and decision summaries.
- **Title** (600, `14px`, 1.3): panel and table titles.
- **Body** (400, `14px`, 1.5): interpretation and methodology, capped at 72ch.
- **Data** (500, `12px`, 1.4): controls, tables, capacities, and chart labels;
  always tabular where numeric.
- **Micro label** (600, `10px`, 0.08em tracking): sparingly used for dense
  instrument labels, never repeated as an eyebrow above every section.

**The Two Voices Rule.** Human interpretation uses Barlow; machine-measured
facts use IBM Plex Mono. Do not put long prose in mono or data in decorative type.

## Elevation

The system is flat by default. Depth comes from the full-black stage, two tonal
surface layers, one-pixel hairlines, and occlusion over the 3D scene. Panels do
not use ambient drop shadows. Small glows are permitted only on literal plotted
signals—capability dots, trail markers, and the active measured point.

**The Survey Glass Rule.** A translucent surface is allowed only when it must
preserve spatial context over the mountain. It still requires a solid-enough
black fill for readable contrast and may not become decorative glassmorphism.

## Components

### Buttons

- **Shape:** compact instrument control (6px radius).
- **Primary:** Summit White on Stage Black, 6px × 12px padding; reserved for the
  current high-value action.
- **Secondary:** Panel Black with a Control Line border; hover strengthens the
  border and focus uses a 2px Instrument Blue outline. Never substitute the
  decorative Hairline token for this resting control edge.
- **Motion:** 160–200ms ease-out state transition; no transform bounce.

### Chips

- **Style:** Raised Black, 4px corners, cohort/model color as a small symbol—not
  a colored side stripe.
- **State:** text or symbol always duplicates color meaning; selected states may
  use a full Instrument Blue hairline and stronger text.

### Cards / Containers

- **Corner Style:** restrained 6px panel radius.
- **Background:** Panel Black or Raised Black only.
- **Shadow Strategy:** none at rest; use structure and borders.
- **Border:** one-pixel Hairline for decorative surface separation; Control
  Line wherever the edge must communicate interaction, state, or plotted data.
  Never pair either border with a wide soft shadow.
- **Internal Padding:** 12–16px in rails, 16–24px for analytical workspaces.

### Inputs / Fields

- **Style:** native, keyboard-correct affordances on Panel/Raised Black with
  4–6px corners and Control Line tracks.
- **Focus:** 2px Instrument Blue outline with 2px offset.
- **Error / Disabled:** Ember Red text for error; disabled lowers contrast but
  retains a readable label and does not rely on opacity alone.

### Navigation

Advisor analytical lenses use a compact tablist with a persistent active
indicator and ordinary arrow-key semantics. Client/advisor mode remains a
clearly labeled action, not an icon-only toggle. On narrow screens lenses
scroll horizontally rather than collapsing into an undiscoverable menu.

### Robustness Frontier

The signature analytical surface combines an accessible model table with a
tested-point chart. Every marker is an evaluated simulation point. Lines may
connect measured points to aid reading but must not imply an interpolated
estimate; status text names unbounded, infeasible, or budget-exhausted cases.
The robust-spend decision is visually singular and states which model limits it.

## Do's and Don'ts

### Do:

- **Do** lead from the client question to exact advisor evidence without changing
  the underlying result.
- **Do** reserve Instrument Blue, Ember Red, Survival Green, and Caution Amber
  for state-bearing information.
- **Do** use semantic tables, headings, live regions, and non-color symbols for
  every WebGPU-presented fact.
- **Do** show loading, cancellation, stale, infeasible, unbounded, and error
  states in place with stable layout.
- **Do** keep transitions between 150ms and 250ms and provide a reduced-motion
  alternative.

### Don't:

- **Don't** build a generic fintech KPI dashboard of interchangeable cards or
  imply that one large percentage is the answer.
- **Don't** use trading-terminal cosplay: gratuitous density, neon decoration,
  or jargon that performs sophistication.
- **Don't** gamify retirement with confetti, traffic-light verdicts, or language
  that turns a stochastic result into a guarantee.
- **Don't** bury model limitations, historical scope, failure magnitude, or
  physical-GPU measurement limits behind a polished score.
- **Don't** use generic AI patterns: excessive rounded cards, ornamental
  gradients, decorative grids, repeated eyebrow labels, or gradient text.
- **Don't** use a colored side stripe, ambient glassmorphism, or a one-pixel
  border paired with a wide soft shadow.
- **Don't** animate content into visibility, use color as the only status cue,
  or let text overflow a narrow rail.
