# Amendment A4, Part B — Historical Gauntlet Presentation

Status: implemented on `p2-gauntletviz`  
Authority: user-approved Wave-2 handoff, 2026-07-26

## Purpose

Expose the existing deterministic six-cohort replay as client-readable status,
an advisor table, and Rainier trails without changing any frozen stochastic
simulation contract.

## Additive data contract

`ReplayResult` now includes `wealthPath: number[]`:

- index 0 is initial real wealth;
- index `m` is wealth after `m` observed monthly returns;
- length is always `monthsSimulated + 1`;
- failure ends at post-clamp zero;
- historical exhaustion ends at the final observed month and remains distinct
  from failure.

`src/sim/gauntlet/snapshots.ts` samples those monthly paths onto the existing
horizon-adaptive `SNAP_MAX = 32` grid. A partial-period failure or data
exhaustion receives one exact endpoint slot. The packed view payload contains:

- cohort-major wealth: `6 × 32 × 4 B = 768 B`;
- end slot: `6 × 4 B = 24 B`;
- end state: `6 × 4 B = 24 B`;
- fixed route index: `6 × 4 B = 24 B`;
- total additive storage: `840 B`.

End-state values are explicit: `0 = full horizon`, `1 = failed`,
`2 = historical data exhausted`. Exhaustion never becomes a red failure
endpoint or a full-horizon pass.

## Trigger and allocation contract

`gauntletStore.ts` is a dedicated Zustand store with setter-only actions;
`simStore.ts`, `SimParams`, and `SimStats` are untouched. The pure historical
calculation remains outside Zustand in `computeGauntletSnapshot`.
`GauntletDriver` listens only to `committedParams`, clears stale presentation,
computes one complete snapshot, then commits it. Slider previews and frame
updates never trigger replay.

Allocation follows the historical bootstrap convention:

- `glidepath === null` → constant equity allocation `1.0`;
- active glidepath → `glidepathMix(step, retireYear × 12, start, end)`;
- monthly portfolio gross remains
  `A(t) × (1 + r_equity) + (1 - A(t)) × (1 + r_bond)`.

## Presentation contract

One store snapshot drives both DOM altitudes:

- client: six year/status chips plus an evidence-derived narrative;
- advisor: cohort, plan result, ending real wealth, max SWR, and observed
  years;
- `✓`, `✗`, and `*` accompany color; `*` means the plan was still solvent
  when the historical record ended, not that it passed the full horizon.

The Rainier overlay assigns six distinct routes from +Z using golden-angle
targets. Trail height uses the existing
`log10(cohort wealth) - log10(simulated median wealth)` offset. Failure stops
at an ember-red endpoint; exhaustion stops neutrally. Segment zero remains a
real drawable interval so first-period failure/exhaustion cannot disappear.
For horizons whose terminal month falls between regular snapshots (including
32â€“39 years), the extra terminal slot uses the primary terminal p50 readback
rather than falling back to initial wealth.

## WebGPU limits and r185 discipline

The production gauntlet graph binds seven storage buffers:

1. route positions;
2. route normals;
3. simulated median log wealth;
4. cohort wealth;
5. cohort end slots;
6. cohort end states;
7. cohort route indices.

This stays below the default limit of eight. The line pool is planned through
`planSprites`, `lineStrideForBudget`, and `maxLineVerts`; the full six-line
carrier is only 372 vertices (4,464 bytes).

All endpoint/index selects are uint-only. A separate float `slotF` select feeds
route progress. The real production builder is compiled by
`probe/viz5-probe.js`; the measured emitted shaders are 5,687-byte vertex WGSL
and 869-byte fragment WGSL with zero Tint errors.

## Verification

- Existing gauntlet engine suite: 26 passed.
- W2-B focused engine/store/sampling/copy/route suite: 38 passed.
- Literature anchors remain: 1929 survives a 30-year 4% rule; 1966 fails at
  month 338 (year 28.17); 1966 max SWR is 3.91%.
- SwiftShader validates WGSL but cannot provide physical-GPU performance or
  reliable visual evidence; those remain separate ship checks.
