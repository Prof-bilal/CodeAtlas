# ADR-025: Task ledger and mid-task provider handoff

Status:     Accepted
Date:       2026-10-08

## Context

A CodeAtlas session is one live AI CLI (or chat-agent) process with a provider
fixed at `createSession` (ADR-007). Context is injected only when a session
*starts* (ADR-008). Users still switch models mid-task — Claude to Codex, Codex
to Gemini, any registered adapter — and the new model otherwise pays to
re-discover both the repository and the work already done.

The index already avoids a full re-scan: a new `launch` rebuilds a
`ContextPackage` from `.codeatlas/context.db`. What is missing is a durable
record of **prior-model progress** that outlives the in-memory session and is
not vendor chat-log access (external CLIs do not give CodeAtlas their
transcript; interactive `stdio: "inherit"` cannot be captured).

## Decision

- Keep **sessions provider-immutable**. A switch is a **new session** on the
  **same Task**.
- Persist a **task ledger** as untrusted JSON under `.codeatlas/tasks/<id>.json`
  (schema-versioned, path-safe ids, size-bounded, structural validation — the
  same load rules as context slices). Not in `context.db` (storage ownership)
  and not a session-process database (ADR-007).
- Own the ledger in `@prof-bilal/atlas-sdk` (`context-integration`). Consumers
  (CLI, MCP) go through the SDK. No `if (provider === …)` in the ledger or
  renderer; any registered adapter/chat-agent id is valid.
- Record, when available: original task, session chain (provider, ids, times),
  bounded captured stdout / chat-agent output, and a **hash-delta** of files
  touched (`@prof-bilal/atlas-hashing` `compareHashes` against the snapshot taken
  at task start). Honest about missing interactive transcripts.
- **Handoff** stops a still-running previous session, reassembles the
  `ContextPackage` for the same task (incremental index, no full rescan),
  appends a deny-filtered, budgeted handoff section, and starts the new
  provider. Usage events share `taskId`; each session is billed as its own
  input/output.
- Surfaces: `atlas context launch/handoff/tasks/task`, plus MCP
  `list_tasks` / `get_task` / `continue_task` and resource
  `codeatlas://task/{id}`. MCP never spawns CLIs.

## Alternatives

- **Mutate `Session.provider` / inject into a live CLI.** Rejected: adapters
  are one-shot at start; there is no mid-process prompt channel.
- **Store ledgers in `context.db`.** Rejected: that schema is owned by
  `@prof-bilal/atlas-storage` for indexed source context, not agent-run state.
- **Persist full vendor chat logs.** Rejected: we do not have them for
  external CLIs, and capturing interactive TTY would mix secrets into a
  durable file without a consent boundary. Bounded captured output + file
  delta is the honest v1.

## Consequences

- Switching providers mid-task no longer requires the new model to re-read
  the whole tree from scratch; it still pays for the handoff prompt tokens.
- Interactive sessions contribute task + files-touched only, unless
  non-interactive capture ran.
- Adding a new CLI (e.g. Antigravity) is an adapter change, not a handoff
  change.
