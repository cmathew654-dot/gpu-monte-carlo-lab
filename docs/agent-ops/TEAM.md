# Agent Team

The roster is small by design. Roles are task-focused operating contracts, not
claims of human credentials. Their executable definitions live in
`.codex/agents/`.

| Role | Persona | Default authority | Primary surfaces |
|---|---|---|---|
| `quant_reviewer` | Skeptical, CFA-aware numerical auditor | Read-only | return models, RNG, stats, gauntlet, calibration |
| `webgpu_reviewer` | Tint-first shader and resource-limit auditor | Read-only | TSL kernels/nodes, buffers, probe, device lifecycle |
| `product_reviewer` | Calm-client / precise-advisor experience critic | Read-only | UI copy, hierarchy, accessibility, portfolio skim |
| `implementation_worker` | Minimal-change implementation owner | Workspace write, explicitly scoped | files assigned by parent |
| `release_verifier` | Independent evidence and integration gate | Read-only | requirements, full baseline, docs/code agreement |

## How to assign work

Every task message contains:

1. outcome and why it matters;
2. exact owned files or read-only scope;
3. applicable contracts and nested `AGENTS.md`;
4. acceptance checks;
5. expected response format;
6. instruction not to revert other contributors' work.

Example:

> Own the store-free statistics computation and its tests in the explicitly
> listed files. Preserve primary output byte-for-byte and do not touch UI or
> gauntlet files. Run the focused stats tests and report changed paths, commands,
> results, and remaining risks. You are not alone in the repository; accommodate
> concurrent changes and do not revert them.

## Wave-2 assignment

### W2-A

- `quant_reviewer`: review pure stats split, seed/parameter identity, and
  secondary-model contamination risks.
- `webgpu_reviewer`: review sequential dispatch, abort discipline, primary
  buffer restoration, and device-loss CPU fallback.
- `product_reviewer`: review model range, magnitude copy, and client/advisor
  consistency.
- `implementation_worker`: implement only after the worktree/branch and file
  ownership are explicit.
- `release_verifier`: run the requirement matrix and full gate independently.

### W2-B

- `quant_reviewer`: review cohort conventions, maxSWR, path sampling, failure
  and exhaustion semantics.
- `webgpu_reviewer`: review small buffer layout, route node graph, select
  typing, shared reveal, and probe coverage.
- `product_reviewer`: review cohort chips/table, narrative, responsive layout,
  non-color cues, and visual distinction.
- `implementation_worker`: implement in disjoint files on the gauntlet branch.
- `release_verifier`: verify engine-to-store-to-HUD-to-scene integration.

## Concurrency rules

- At most one writer owns a file.
- Reviewers may run in parallel and do not edit by default.
- A reviewer does not silently become a fixer; the parent decides disposition.
- Separate branches/worktrees are required for W2-A and W2-B.
- The integrator resolves conflicts and runs the gate; specialists do not
  overwrite each other's work.
