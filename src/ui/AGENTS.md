# UI Instructions

Applies to `src/ui/**` in addition to the repository root guidance.

- Read `PRODUCT.md` before changing copy or hierarchy.
- Client copy is calm, natural-frequency, and plain-language. Advisor copy names
  the statistic and convention precisely.
- The UI renders engine/store truth; it does not recompute simulation or
  financial metrics.
- Never present a partially completed triangulation range as current. Keep the
  selected-model point result until all three matching results land.
- Distinguish failure from exhausted historical data with text/symbols as well
  as color.
- Preserve keyboard access, visible focus, contrast, reduced motion, and DOM
  equivalents for decision-critical scene information.
- Avoid generic card-grid sprawl. Use hierarchy, whitespace, and the alpine
  field-instrument visual language.
- Do not hide caveats or units to make the interface cleaner.
- Validate client/advisor copy against the same store fields and add focused
  component tests when the harness supports them.
