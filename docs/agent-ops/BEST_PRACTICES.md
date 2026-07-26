# Agent Workspace Best Practices

Research reviewed 2026-07-26. This document distinguishes official behavior
from repository conventions.

## The three-layer documentation model

### `AGENTS.md`: stable instructions

Codex automatically discovers `AGENTS.md` from the project root toward the
working directory. A deeper file governs its subtree and takes precedence over
broader guidance. Keep the root file concise and place specialized, non-obvious
rules near the code they govern.

Use it for:

- exact build and test commands;
- frozen contracts and safe extension paths;
- architectural and security boundaries;
- completion evidence.

Do not use it as a changelog, backlog, or substitute for executable tests.

### `PRODUCT.md`: local product contract

OpenAI documents PRD practices but assigns no automatic meaning to the filename
`PRODUCT.md`. This repository adopts it deliberately for slowly changing truth:
problem, users, outcomes, non-goals, product principles, quantitative
conventions, accessibility, and ship bar.

Do not put current branch status or test logs there.

### `MEMORY.md`: mutable operational handoff

Repository `MEMORY.md` is not auto-loaded. Root `AGENTS.md` explicitly requires
reading it. It records current state, verified evidence, decisions, blockers,
and next actions—not mandatory behavior.

Memory rules:

- timestamp observations and identify what they were verified against;
- separate current, completed, and future-not-committed work;
- link to code, commits, plans, or commands instead of pasting large logs;
- update or supersede stale facts in place;
- never store secrets, tokens, raw environment dumps, or signed URLs;
- keep the file lean and archive detail elsewhere.

## Scoped instruction design

- One `AGENTS.md` per real boundary, not per folder.
- Nested files contain only local deltas; do not copy the root.
- State consequential, non-obvious rules and the safe alternative.
- Prefer durable outcomes over volatile function-name trivia.
- Keep deterministic formatting and contract enforcement in tests/CI.
- Do not assume a linked file is auto-loaded; tell the agent to read it.
- `AGENTS.override.md` replaces, rather than merges with, `AGENTS.md` in the
  same directory.

The default combined project-instruction budget is 32 KiB, so progressive
disclosure improves both reliability and context use.

## Persona and subagent design

Project custom roles live under `.codex/agents/*.toml`. Each role has:

- `name`: authoritative role identifier;
- `description`: when the parent should choose it;
- `developer_instructions`: narrow behavior, evidence standard, and output
  contract.

Stable repository rules remain in `AGENTS.md`. Persona files define how a role
works; they must not contradict contracts or try to bypass permissions.

Recommended operating model:

- parallelize independent read-only analysis;
- use one implementation writer per file;
- give writers explicit ownership and acceptance criteria;
- keep reviewers independent of the implementation;
- inherit the parent model unless a measured cost/latency reason justifies a
  pin;
- treat `sandbox_mode = "read-only"` as defense-in-depth, not a security
  boundary independent of the parent session.

Avoid theatrical biographies, claimed credentials, undocumented tool
allowlists, automatic delegation assumptions, or feature-specific roles that
will become stale after one milestone.

## Plans and long-running work

A durable execution plan names:

- observable outcome;
- scope and excluded scope;
- frozen constraints;
- ordered work with dependencies;
- acceptance tests;
- rollback or abort behavior;
- decisions and unresolved questions.

Version active and completed plans. Update the plan when reality changes rather
than preserving a false forecast.

## Verification discipline

- Test the imported base before attributing failures to new work.
- Run focused tests while developing and the entire gate before merging.
- Record commands, results, commit, and environment limitations.
- Never label a gate green if a check was skipped or blocked.
- Separate a launcher/harness defect from the shader or product behavior it
  prevented testing.
- Require real measurements before performance or financial claims.

## Primary sources

- [OpenAI: Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [OpenAI: How OpenAI uses Codex](https://openai.com/business/guides-and-resources/how-openai-uses-codex/)
- [OpenAI: Harness engineering](https://openai.com/index/harness-engineering/)
- [OpenAI: Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [OpenAI: Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference#configtoml)
- [OpenAI: Long-running work](https://learn.chatgpt.com/docs/long-running-work)
- [OpenAI: Memories](https://learn.chatgpt.com/docs/customization/memories)
- [OpenAI: Draft PRDs from internal context](https://learn.chatgpt.com/use-cases/draft-prds-from-sources)
- [OpenAI Codex: configuration schema](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json)
- [AGENTS.md specification](https://agents.md/)

The OpenAI documentation is the authority for Codex-specific discovery and
configuration behavior. The repository conventions in this document may evolve
without implying a platform standard.
