# Agent Session Manager

> **Status: [IMPLEMENTED]** — the in-memory session manager ships behind the
> `SessionPort` port (in `@atlas/core`), is implemented in `@atlas/agents`
> (`SessionManager`), and is composed through `@atlas/sdk` via
> `createSessionManager()`. It is **not** an orchestration layer: it manages
> many **independent** agent sessions. Prompt/context construction (Task 16) and
> usage/billing (Task 18) are out of scope and deliberately not built here.
> Multi-agent collaboration (Task 17) is built **on top** of it, in `@atlas/sdk`
> (`createOrchestrator` drives `SessionPort` directly) — see
> [CURRENT_STATE.md](./CURRENT_STATE.md).

---

## 1. Purpose

CodeAtlas launches and supervises external AI coding CLIs (Claude, Gemini,
Codex, OpenCode, …). A **session** is one live instance of one of those CLIs,
running in a specific repository, tracked until it exits. The Agent Session
Manager is the infrastructure that creates, starts, tracks, inspects, stops,
terminates, and cleans up **many such sessions at the same time** — each fully
independent of the others.

```
                 CodeAtlas
                     │
             Session Manager (SessionPort)
                     │
       ┌─────────────┼─────────────┐
       │             │             │
   Session A     Session B     Session C
       │             │             │
     Claude        Gemini        Codex
       │             │             │
       └─────────────┼─────────────┘
                     │
              Process Runner (launch)
                     │
              External AI CLI
```

The manager is **provider-agnostic**. It never contains
`if (provider === "…")` logic; all provider-specific binary names, arguments,
and exit-code interpretation stay inside the `@atlas/agents` adapters.

## 2. Architecture & responsibility split

```
Session Manager   owns the session lifecycle (create → start → stop → cleanup),
                  bookkeeping, and failure classification.
      ↓
Agent Adapter     owns provider specifics: binary name, run-mode flags, arg
    (AgentService) building, CLI detection. Resolved through the existing
                  connection layer — no reimplementation.
      ↓
Process Runner    owns low-level process execution: spawn (no shell), stdio,
   (ProcessRunner) SIGTERM→SIGKILL escalation, exit observation.
      ↓
External CLI      the user's installed `claude` / `gemini` / `codex` / `opencode`.
```

- The manager **never spawns** directly — it calls `ProcessRunner.launch()`.
- The manager **never builds provider args** — it calls
  `AgentService.buildArgsFor(provider, …)`.
- The manager **never detects binaries** — it calls `AgentService.resolveBinary()`
  and `binaryOf()`.
- These boundaries keep the security-sensitive surface small and consistent with
  the rest of the connection layer.

### Port seam

- `SessionPort`, `Session`, `SessionStatus`, `AgentId`, `SessionCreateRequest`,
  `SessionLaunchRequest` live in `@atlas/core`
  (`packages/core/src/ports/session.port.ts`).
- `SessionManager implements SessionPort` lives in `@atlas/agents`
  (`packages/agents/src/session-manager.ts`), with typed errors in
  `session-errors.ts`.
- Consumers (CLI, MCP, editors, future orchestrator) obtain it through the
  SDK: `createSessionManager()` from `@atlas/sdk`. The CLI may not import
  `@atlas/agents` directly — it goes through the SDK.

## 3. Session model

```text
Session
├── id             unique, stable, short (8 hex chars); never the OS pid
├── agentId        typed agent identifier (today = the provider id)
├── provider       adapter id, e.g. "claude"
├── repositoryPath absolute repository the session runs in
├── status         SessionStatus (single status system, below)
├── processId      OS pid of the live child, once started
├── startedAt      epoch ms of launch
├── endedAt        epoch ms of reaching a terminal state
├── exitCode       child exit code; null when killed by a signal; undefined before exit
└── error          safe, human-readable failure detail — never keys/env
```

Every session keeps its own **process, provider, repository, status, stdout/
stderr wiring, timestamps, exit code, and error state**. A failure in one
session never touches another (verified by tests).

## 4. Lifecycle & states

```text
CREATED
   ↓  startSession()
STARTING
   ↓  launch succeeds
RUNNING
   ↓  stopSession() / terminateSession()      ↓  clean exit (code 0)
STOPPING                                          │
   ↓  process exits / finalized               STOPPED
STOPPED
```

Failure path (startup): `STARTING → FAILED` when the CLI is not installed, the
spawn fails, or any pre-launch validation fails.

Runtime failure: `RUNNING → FAILED` on a non-zero exit code, a signal, or a
spawn-time error that surfaces before the child ever ran.

- **`stopSession()`** is graceful: `SIGTERM`, escalate to `SIGKILL` after the
  kill-grace period. Exiting while `STOPPING` (or not exiting within the grace)
  finishes as `STOPPED` — a session is **never left stuck in `STOPPING`**.
- **`terminateSession()`** is force: immediate `SIGKILL`.
- `STOPPED` is always the terminal state for a *user-requested* stop/terminate;
  `FAILED` is reserved for exits the manager did not initiate.

## 5. API

`SessionPort` (exported by `@atlas/sdk`):

| Method | Purpose |
| ------ | ------- |
| `createSession({ provider, repositoryPath })` | Validate provider + repository; create in `CREATED`. |
| `startSession(id, launch?)` | Resolve CLI, spawn, set `RUNNING`, attach exit handling. |
| `getSession(id)` | Current snapshot, or `undefined`. |
| `listSessions()` | All sessions, oldest → newest. |
| `getActiveSessions()` | `STARTING`/`RUNNING`/`STOPPING` sessions. |
| `getSessionOutput(id)` | The captured stdout/stderr when launched with `captureOutput: true`; stays available after exit; `undefined` when unknown or not captured. |
| `stopSession(id)` | Graceful stop. |
| `terminateSession(id)` | Force stop. |
| `shutdown()` | Stop every active session (CodeAtlas shutdown). |

`startSession` takes an optional `{ prompt?, args?, env?, captureOutput? }`.
**This is not context/prompt construction** — Task 16 owns that. Without a
prompt the CLI is launched in its configured non-interactive mode
(`claude -p ""`, …), a known limitation until Task 16 supplies real prompts.
`captureOutput: true` pipes the child's stdout/stderr through a **bounded**
buffer (128 KiB per stream, tail dropped) that stays readable via
`getSessionOutput` after the session exits — used by the orchestrator (Task 17)
to report partial output honestly. Captured output is never echoed to logs.

## 6. CLI commands

```bash
atlas sessions               # list (same as `sessions list`)
atlas sessions list          # table of tracked sessions
atlas sessions info <id>     # details for one session
atlas sessions stop <id>     # graceful stop; "✓ Session stopped" on success
```

- `info` / `stop` on a missing id print `Session not found: <id>` and exit `1`.
- `stop` on a bad state (already stopped) prints the error and exits `1`.
- Output never includes API keys, tokens, env, or full sensitive launch args.
  `info` shows pid, status, repository, started/ended times, exit code, and the
  safe error message when present.

## 7. Failure handling

| Failure | Result / status |
| ------- | --------------- |
| Unknown provider | `createSession` fails (`UnknownAgentError`); nothing stored |
| Invalid repository | `createSession` fails (`InvalidRepositoryPathError`) |
| CLI not installed | `startSession` fails (`AgentCliNotFoundError`); session `FAILED` |
| Process startup failure | session `FAILED` with a safe message |
| Process crash (non-zero / signal) | session `FAILED` |
| Invalid session id | every operation fails (`UnknownSessionError`) |
| Already stopped / already stopping | `SessionStateError` (stop is idempotent) |
| Still starting | `SessionStateError` (retry shortly) |
| Unresponsive during stop | session finalized `STOPPED` with an error note |
| Shutdown | every active session stopped |

Error messages are actionable, provider-aware where meaningful, and never leak
secrets or stack traces.

## 8. Shutdown & orphan protection

`shutdown()` records “shutting down”, then stops every active session
(`SIGTERM` → `SIGKILL`). New `startSession` calls are rejected once shutdown has
begun. Because sessions run as supervised children and stop/terminate are
idempotent, CodeAtlas does not leave uncontrolled child processes behind during
normal shutdown.

**Known limitation:** CodeAtlas is normally a short-lived CLI; sessions outlive
the process only if a consumer daemonizes the manager and is then force-killed
without calling `shutdown()`. That is outside the manager’s control.

## 9. Concurrency & memory

- Immutable-snapshot updates on a single-threaded event loop plus state guards
  prevent duplicate starts, double-termination, and duplicate cleanup.
- Exit transitions are guarded so a process can be classified exactly once.
- Retention is capped (`maxRetainedSessions`, default 100): the **oldest
  terminal** sessions are pruned; live sessions are never pruned. This is an
  in-memory manager — **no session database** (Task 15 keeps persistence out of
  scope; a future task may add it).

## 10. Testing strategy

Unit tests mock the Process Runner and provider adapters (`createFakeSpawn`, a
stubbed executable resolver) — **no real Claude/Gemini/Codex/OpenCode is ever
needed**. Coverage includes:

- Session creation: valid, unknown provider, invalid repository, unique ids.
- Starting: success, CLI unavailable, spawn failure, duplicate start, missing id.
- Running: multiple independent sessions, lookup, listing, active filtering.
- Stopping: graceful, unresponsive, idempotent, already-stopped, missing id.
- Termination: SIGKILL, already-stopped.
- Process exit: code 0 → `STOPPED`; non-zero → `FAILED`; signal → `FAILED`.
- **Isolation:** a Claude failure leaves a running Gemini untouched.
- **Mandatory scenario:** Claude + Gemini + Codex all `RUNNING`; stop Gemini;
  Claude and Codex remain `RUNNING`, Gemini is `STOPPED`.
- Shutdown: all active sessions stopped; idempotent.
- Memory: terminal-session pruning beyond the cap.

The `atlas sessions` CLI is exercised offline: command registration, table and
`info` rendering, "No sessions." listing, and the missing-session stop error
(exits `1`). See `docs/TESTING.md`.

## 11. Relationship to other tasks

- **Do not build here** — Task 16 (Context → Agent: prompt/context selection and
  injection), Task 17 (Multi-Agent Orchestration: agents *collaborating*), and
  Task 18 (Usage/Credits/Billing) are separate. The session manager only
  *manages independent sessions*; Task 17's `createOrchestrator()` (in
  `@atlas/sdk`) drives this port to run multiple roles and combine their
  results.
- **Task 16 will need:** a way to supply a real `prompt`/context to
  `startSession`, and a stable way to read the session’s repository path and
  status. The `SessionLaunchRequest.prompt` field is already reserved for this.