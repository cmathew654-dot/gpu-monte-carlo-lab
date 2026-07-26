# Probe Instructions

Applies to `probe/**` in addition to the repository root guidance.

- The probe compiles real production node builders; never inline or re-create a
  simplified shader graph.
- Treat a successful launcher as distinct from a successful Tint compile.
- Keep launcher path and Chromium discovery cross-platform. Use URL-to-path
  conversion APIs rather than raw URL `.pathname` values.
- Do not hardcode a single operating-system browser path without an explicit,
  overrideable fallback search.
- Preserve emitted WGSL snapshots as reviewable evidence; unexplained churn is
  a failure to investigate, not a snapshot to bless.
- SwiftShader device loss limits visual verification, but does not excuse
  skipping the real graph compile.
