# Wave 1 — Completed in Imported Snapshot

Status: implementation present; verified locally on 2026-07-26 except for the
cross-platform probe launcher limitation recorded in `MEMORY.md`.

## Delivered

- Real equity/bond glidepath mixing across all three return models.
- Month-aligned bond blocks packed into the existing bootstrap buffer.
- Conditional mean of the deepest drawdown decile.
- Seed decorrelation through `pcgRound(seed)` in CPU and GPU mirrors.
- Additive magnitude-of-failure statistics.
- Recruiter-grade README, MIT license, dependency cleanup, and extracted
  SummitMarker production graph.
- Pure TypeScript six-cohort historical gauntlet engine and tests.

## Contract record

Wave-1 changes are documented as Amendment A3 in:

- `docs/CONTRACTS.md`
- `docs/CONTRACTS_STATS.md`

The archive handoff named upstream commit `7398c71`. The attached source did
not include `.git`, so this imported workspace records that SHA as unverified
provenance rather than presenting it as local Git evidence.

## Verification

See `MEMORY.md` for exact command results and the Windows probe-launcher
blocker. Do not infer a fully green gate until the production node graphs reach
Tint successfully from this workspace.
