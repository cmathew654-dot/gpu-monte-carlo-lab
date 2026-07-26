# Scene and WebGPU Instructions

Applies to `src/scene/**` in addition to the repository root guidance.

- three.js is exactly r185. Use APIs and TSL typing verified for that release.
- A `select()` consumed as uint may feed only indices/comparisons. Create a
  separate float twin for float math; mixed use can emit invalid WGSL and a
  production black screen.
- Uniform node identities are created once and their `.value` changes later.
  Preserve intentional `useMemo([])` identities and their justification.
- Frame-loop reads use `getState()`. Do not add React subscriptions solely to
  drive per-frame work.
- Dispatch, readback, stats, gauntlet computation, and triangulation occur only
  on committed parameter changes.
- New line/sprite pools plan through `spritePlan`; do not raw-allocate against
  assumed limits.
- Respect the eight-storage-buffer and 134,217,728-byte default binding limits.
- Device initialization failure and `device.lost` must leave the product in
  useful CPU mode.
- Every new production node builder is imported by the probe. Never duplicate
  its graph in the harness.
- Report Tint compilation separately from visual verification and physical-GPU
  performance.
