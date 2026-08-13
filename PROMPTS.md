# CodeAtlas — Implementation Prompts

> **Purpose.** This file is the **canonical implementation prompt library** for
> CodeAtlas. A fresh Claude Code (or any coding agent) session can open this file
> and execute **any single Task 21–29** without needing the original design
> conversation: each task below is a complete, self-contained implementation
> prompt that says what to build, what already exists to reuse, the required
> architecture, the security rules, the tests, and the acceptance criteria.
>
> **One task at a time.** When a request says "implement Task 21", implement
> **only Task 21**. Do not start Task 22 automatically.
>
> **Ground truth.** `AGENTS.md` is authoritative for repository rules;
> `docs/CURRENT_STATE.md` is the arbiter of what actually exists. **Re-read both
> before starting any task** — this document is a library of prompts, not a
> substitute for inspecting the current code. Status tags below were verified
> against code as of 2026-08-12.

---

## Project Overview

CodeAtlas is an open-source AI toolchain with three product directions:

| Direction | What it does | Status in repo |
| --------- | ------------ | -------------- |
| **A. Context Engine** | Scan → parse → graph → store → search → feed relevant context to AI | ~90% implemented |
| **B. Unified AI CLI Orchestrator** | Launch & supervise installed AI coding CLIs (Claude / Gemini / Codex / OpenCode), coordinate sessions, later coordinate multiple agents | Connection layer, session manager, **multi-agent orchestrator**, and usage/credits implemented; router/slash commands planned |
| **C. Agent Toolkit** | Curated, security-gated discovery/install/config of open-source developer & AI-agent tools | Tasks 19–25 implemented (Registry, Manifest, Compatibility, Installer, Configurator, Security/Trust, CLI); slash commands remain planned |

### Conceptual system

```
Codebase
   ↓
CodeAtlas
   ├── Scanner
   ├── Parser
   ├── Symbol Extraction
   ├── Dependency Graph
   ├── AI Summaries
   ├── Context Database
   ├── Search
   └── Context SDK
             ↓
       Agent Infrastructure
             ↓
       Claude / Gemini / Codex / OpenCode
             ↓
       Agent Toolkit
```

CodeAtlas **understands a codebase once**, persists that understanding in a local
context database, and **provides the relevant context to AI agents on demand** —
so an agent does not rediscover an entire repository on every task. Later it
manages multiple agents and provides a curated ecosystem of useful open-source
developer/AI tools.

### Repository layout (verified)

A **pnpm + TypeScript monorepo** (clean architecture: contracts in `core`,
implementations in feature packages, composition in `sdk`):

```
apps/
  cli/          # Commander.js CLI — `search`+`mcp`+`sessions`+`usage` wired, 5 others stubbed
  extension/    # VS Code extension (@atlas/extension) — SDK consumer
packages/
  shared/       # Base types, Result, branded IDs, VERSION, ComingSoonError
  core/         # Domain entities + *Port interfaces (type-only contracts)
  scanner/      # File walking, ignore rules, language/framework detection, manifest.ts
  hashing/      # SHA-256 hashing, change detection, snapshots
  parser/       # TypeScript → normalized Symbol IR (ts-morph); plugin registry
  graph/        # Dependency graph, shortest path, cycle detection
  storage/      # SQLite context DB (node:sqlite), repositories, migrations
  cache/        # Generic in-memory/TTL cache
  providers/    # AI model provider adapters (Claude/OpenAI/Gemini/DeepSeek)
  summary/      # AI file/folder/module/project summaries (content-hash cached)
  search/       # Ranked, fuzzy-aware project search (vector-ready scorer seam)
  context/      # Context ranking & assembly — INTENTIONAL STUB (ADR-001)
  agents/       # AI CLI connection layer (AgentPort) + Session Manager (SessionPort)
  usage/        # AI usage & credits: tri-state tokens/cost, budgets, limits (UsagePort)
  toolkit/      # Agent Toolkit — Tool Registry (Task 19) + Tool Manifest (Task 20)
  mcp/          # MCP server exposing context to AI tools
  sdk/          # Composition root; createContextSDK; createSessionManager; createUsageService; createOrchestrator; createToolRegistry
docs/           # Design & contributor documentation
```

### Non-negotiable architecture rules (from `AGENTS.md`)

1. **Dependency direction points inward**: `cli → sdk → feature packages → core → shared`.
   - Feature packages import **only** `core` + `shared`.
   - `cli` imports **only** `@atlas/sdk` (+ `@atlas/mcp`); `mcp` and
     `apps/extension` import **only** `@atlas/sdk`.
   - Enforced by ESLint `no-restricted-imports` — see `docs/DEPENDENCIES.md`.
2. **The Context SDK is the single read interface.** Consumers (CLI, MCP,
   editors, agents, future Toolkit) read indexed context through
   `createContextSDK` (`@atlas/sdk`) — never by opening `.codeatlas/context.db`
   or importing `@atlas/search`/`@atlas/storage`/`@atlas/summary` directly.
3. **Provider logic is quarantined in adapters.** Claude/Gemini/Codex/OpenCode
   specifics live in `@atlas/agents` / `@atlas/providers` adapters. Never
   `if (provider === "...")` outside an adapter.
4. **`@atlas/context` is intentionally a stub** (ADR-001). Its methods throw
   `ComingSoonError` by design. Do **not** "fix" it by removing the port or
   silently implementing ranking.
5. **Process execution is security-critical**: `spawn(file, argsArray)` over
   shell strings; validate paths; never build a shell string from repo-derived
   or AI-generated content; never execute arbitrary repository content
   automatically.
6. **Secrets & privacy**: never log/print API keys; never implicit whole-repo
   uploads; provider calls are user-configured and explicit.
7. **One purpose per change**; prefer extending existing abstractions over
   creating parallel ones; `pnpm check` (typecheck + lint + format + test) after
   every change.
8. **Never claim a feature is implemented without checking the code.** Distinguish
   `[IMPLEMENTED]` / `[PARTIAL]` / `[STUB]` / `[PLANNED]`.

### Ports & SDK surface you will reuse (verified names)

- `createContextSDK({ repositoryPath | dbPath | contextDb })` → sub-APIs
  `files`, `symbols`, `dependencies`, `modules`, `summaries`, `search`,
  `project`, `status()`, `getRelevantContext(query)`, `write`, `close()`.
  See `docs/CONTEXT_SDK.md`.
- `createSessionManager()` (`@atlas/sdk`) → `SessionPort` (`SessionManager` in
  `@atlas/agents`): `createSession`, `startSession`, `getSession`,
  `listSessions`, `getActiveSessions`, `stopSession`, `terminateSession`,
  `shutdown`. `SessionLaunchRequest` already reserves `prompt`/`args`/`env`.
  See `docs/AGENT_SESSIONS.md`, `ADR-007`.
- `AgentPort` (`@atlas/core`): `listAgents()`, `detectAgent()`, `detectAll()`,
  `run(AgentRunRequest)`; `AgentService` in `@atlas/agents` adds
  `resolveBinary`/`buildArgsFor`/`binaryOf` helpers; `ProcessRunner` for
  spawning (array args, no shell, timeout, supervised `launch()`).
- `createUsageService()` (`@atlas/sdk`, → `UsagePort` in `@atlas/usage`):
  records/aggregates usage events with **tri-state** actual/estimated/unknown
  tokens & cost, budgets/limits, stats. Store on `.codeatlas/usage.db` (separate
  from the context DB). See `docs/USAGE.md`, `ADR-009`.
- `createOrchestrator()` (`@atlas/sdk`, Direction B): `TaskPlan` of bounded agent
  roles (parallel/sequential), role execution via `SessionPort`, result
  collection + combination, timeout/cancellation/retry, conflict detection.
  See `docs/AGENT_ORCHESTRATOR.md`.
- `createToolRegistry()` (`@atlas/sdk`, → `ToolRegistryPort` in `@atlas/toolkit`):
  curated catalog (`catalog.json`) + local overlay, schema-validated,
  provenance-auditable. See `docs/TOOL_REGISTRY.md`. Tool Manifests
  (`TOOL_MANIFEST_SCHEMA_VERSION = 1`) persisted per tool in
  `.codeatlas/tools/<name>.json`. See `docs/TOOL_MANIFEST.md`.
- `SearchPort` (`@atlas/search`): `LexicalScorer` (deterministic), `RelevanceScorer`
  seam (future vector scorer plug-in point).
- `ProviderPort` (`@atlas/providers`): `complete()` for AI model calls.
- `ContextBuilderPort` (`@atlas/core`, `@atlas/context`): rank/assemble **stub** —
  keep it.

---

## Completed Tasks

Tasks **1–26 are complete**. Do **not** reimplement or modify them. Each is
described concisely below with what it contributes to the next stages.

| # | Task | Status | Provides to later stages |
| - | ---- | ------ | ------------------------ |
| 1 | Scanner | ✅ COMPLETED | Recursively discovers files, languages, frameworks; `readFile`; writes `.codeatlas/manifest.json`. The "eyes" of the pipeline. |
| 2 | Manifest | ✅ COMPLETED | Project metadata + context versioning (`.codeatlas/manifest.json`, merge policy). Model for the planned per-tool manifest (Task 20). |
| 3 | File Hashing | ✅ COMPLETED | SHA-256 snapshots + change detection (`getChangedFiles`). Powers incremental updates and stale-context handling. |
| 4 | Parser | ✅ COMPLETED ([PARTIAL]: TypeScript only) | TypeScript → normalized `Symbol` IR via `ts-morph`; plugin registry ready for more languages. Known gaps: renamed imports / `export default <expr>`. |
| 5 | Symbol Extraction | ✅ COMPLETED | `SymbolIndexer`, cross-file import resolution, definitions/references. Source of symbol-level context. |
| 6 | Dependency Graph | ✅ COMPLETED | Directed graph (imports/calls/extends/…), `shortestPath`, cycle detection. Source of "what depends on what" context. |
| 7 | AI Summaries | ✅ COMPLETED | File/folder/module/project summaries, content-hash cached, structured JSON. Semantic context layer. |
| 8 | Context Database | ✅ COMPLETED | SQLite `ContextStore` (`node:sqlite`), 8 tables, repositories, migrations, transactions. The persistent context. |
| 9 | Search | ✅ COMPLETED | `@atlas/search` ranked fuzzy-aware index over files/symbols/modules/dependencies/summaries; `RelevanceScorer` seam for future vector ranking. |
| 10 | Context API / SDK | ✅ COMPLETED | `createContextSDK` — provider-independent read façade, typed errors, deterministic `getRelevantContext()`. The interface Task 16 builds on. |
| 11 | MCP Server | ✅ COMPLETED | `@atlas/mcp` stdio server, 6 read tools consuming the SDK. Proof of the SDK-as-only-read-path pattern. |
| 12 | VS Code Extension | ✅ COMPLETED | `@atlas/extension`, SDK-only consumer. Another reference consumer of the SDK pattern. |
| 13 | Documentation / AGENTS.md / Project Instructions | ✅ COMPLETED | `AGENTS.md` authoritative rules, `docs/` system, this file. The contract every task must honor. |
| 14 | AI CLI Connection | ✅ COMPLETED | `@atlas/agents` behind `AgentPort` — adapters, executable detection, supervised process runs (`spawn(file, args[])`, no shell, timeout). The narrow boundary for Tasks 16–18. |
| 15 | Agent Session Manager | ✅ COMPLETED | `SessionManager` behind `SessionPort`; `createSessionManager()` in the SDK; `atlas sessions list/info/stop`. Manages many independent live sessions; `SessionLaunchRequest.prompt` reserved for Task 16. |
| 16 | Context → Agent Integration | ✅ COMPLETED | `context-integration` module in `@atlas/sdk` (ADR-008): `createContextIntegration()` assembles a budgeted, deny-filtered, provider-independent `ContextPackage` per task via the Context SDK (ranked files/symbols/summaries/dependencies + overview + repo instructions, each scored with a reason), enforces item/token budgets, drops secrets (exclusion record), reports an honest staleness signal (`ContextSDK.hashes()` vs working tree), and delivers the package through `SessionPort` (`launch` seeds a new session's prompt; `attach` starts a `CREATED` session, typed `ContextAttachUnsupportedError` for live ones). `buildPackage`/`explain`/`launch`/`attach` + render helpers. CLI wiring is Task 26. |
| 17 | Multi-Agent Orchestration | ✅ COMPLETED | `createOrchestrator()` in `@atlas/sdk` (Direction B): a `TaskPlan` decomposes the user task into bounded, explicit agent roles; the executor runs roles in parallel or sequential through `SessionPort` (never reimplementing process/session management), collects typed results, combines them with attribution, and surfaces conflicts. Timeout (kill via `stopSession`, honest partial output), cancellation (stop remaining roles, `shutdown()` cleanup), bounded retry (launch failures only). See `docs/AGENT_ORCHESTRATOR.md`. |
| 18 | Usage / Credits | ✅ COMPLETED | `@atlas/usage` behind `UsagePort`, composed as `createUsageService()` (ADR-009). Tri-state actual/estimated/unknown tokens & cost (never guessed), `PricingSource` abstraction (no hardcoded prices in logic), dedicated `.codeatlas/usage.db` store, `withUsageTracking`/`trackAgentRun` collection seams, soft budgets + fail-safe hard limits, `atlas usage` (summary/list/budgets). See `docs/USAGE.md`. |
| 19 | Tool Registry | ✅ COMPLETED | `@atlas/toolkit` behind `ToolRegistryPort` in `core`, composed as `createToolRegistry()`: a curated, schema-validated, provenance-auditable catalog (`catalog.json`) merged with a local overlay, extensible categories. See `docs/TOOL_REGISTRY.md`. |
| 20 | Tool Manifest | ✅ COMPLETED | Versioned (`TOOL_MANIFEST_SCHEMA_VERSION = 1`), validated, extensible manifest recording **one installed tool's** state (compatibility/installation/configuration/security declarations + applied state + trust at install). Persisted per tool in `.codeatlas/tools/<name>.json`, mirroring the Scanner manifest pattern; loaded as untrusted input (never executed, prototype-pollution safe, size-bounded, path-safe names). See `docs/TOOL_MANIFEST.md`. |
| 21 | Compatibility Engine | ✅ COMPLETED | `@atlas/toolkit` behind `CompatibilityPort` in `core`, composed via `createCompatibilityEngine()`: evaluates tool requirements (OS/arch/runtimes/package manager/AI CLIs via `AgentPort`/MCP/permissions) against detected environment; never installs; never fails open. See `docs/AGENT_TOOLKIT.md` §6. |
| 22 | Tool Installer | ✅ COMPLETED | `@atlas/toolkit` behind `InstallerPort` in `core`, composed via `createInstaller()`: safe MVP subset (npm/pip/cargo/go), argument-array spawns (`shell:false`), approval always required, compatibility + security gates, post-install verification + Tool Manifest provenance + best-effort rollback. |
| 23 | Tool Configurator | ✅ COMPLETED | `@atlas/toolkit` behind `ConfiguratorPort`, per-target adapters (Claude/Gemini/Codex/OpenCode/MCP/VSCode), AgentPort-backed detection, safe user-config merge/backup/rollback, verification, dry-run, SDK composition. See `docs/AGENT_TOOLKIT.md` §9. |
| 24 | Security / Trust | ✅ COMPLETED | `@atlas/toolkit` behind `SecurityPort`: offline per-check risk assessment, exact five trust states (`verified`/`reviewed`/`community`/`unverified`/`blocked`), hostile-input rejection, fail-closed installer gating, explicit unverified override recording. |
| 25 | Toolkit CLI | ✅ COMPLETED | `atlas tools` overview/search/info/install/remove/update/configure/doctor — delegates to SDK `createToolkitSDK()`, follows CLI conventions (`docs/CLI.md`). |
| 26 | Context CLI | ✅ COMPLETED | `atlas context` / `--explain` / `--json` / `launch` / `attach` — thin SDK delegator over `createContextIntegration()`. Follow-up wiring to Task 16 (ADR-008). |

Tasks 21–26 are implemented; each task remains fully specified in the sections
below for auditability. **New tasks 27–29** follow for the Agent Chat UI.

---

# Task 16 — Context → Agent Integration

> **Status:** [IMPLEMENTED] — completed 2026-08-11 (ADR-008). See the Completed
> Tasks table; this section is kept as the historical spec. Do **not** reimplement.
> Verify against `docs/CURRENT_STATE.md` / `docs/FEATURE_STATUS.md` before making
> any change to the `@atlas/sdk` `context-integration` module.

## Goal

Assemble the **most relevant context for a user task** and deliver it to an agent
session, so the agent does not need to rediscover the repository. A user task
becomes a **normalized Context Package** that is injected into a live
Claude / Gemini / Codex / OpenCode session through the existing Agent Session
Manager.

```
User Task
   ↓
Context SDK
   ↓
Relevant Code
   ↓
Context Package
   ↓
Agent Session
   ↓
Claude / Gemini / Codex / OpenCode
```

## Depends on (all implemented — reuse, do not rebuild)

- **Task 10** — Context API / SDK (`createContextSDK`).
- **Task 9** — Search (`@atlas/search`, ranked + `RelevanceScorer` seam).
- **Tasks 5/6/7** — Symbols, Dependency Graph, AI Summaries (read via the SDK).
- **Task 14** — AI CLI Connection (`@atlas/agents` behind `AgentPort`).
- **Task 15** — Agent Session Manager (`SessionManager` behind `SessionPort`,
  `createSessionManager()`; `SessionLaunchRequest.prompt` already reserved).

## Required architecture

```
User Task
    ↓
Context Integration (new — behind a new Context Integration port)
    ↓
Context SDK (createContextSDK)
    ↓
Search / Symbols / Graph / Summaries
    ↓
Context Ranking (reuse ranked search + RelevanceScorer seam)
    ↓
Context Budget (token / item caps)
    ↓
Context Package (normalized, serializable)
    ↓
Provider Adapter (per AI CLI — in @atlas/agents)
    ↓
Agent Session Manager (SessionPort)
    ↓
AI CLI
```

## Placement decision (architectural — write an ADR)

The integration layer must **compose through the SDK** (consumers import only
`@atlas/sdk`) and must **not** import feature packages directly. Two acceptable
shapes — pick one, justify in an ADR:

- **Recommended (lowest friction):** extend `@atlas/sdk` with a
  `context-integration` module, exported as `createContextIntegration()` /
  `createContextPackage()` alongside `createContextSDK` / `createSessionManager`.
  The SDK already owns the context façade and the session manager, so the
  assembler has both dependencies in one composition root.
- **Alternative:** a new feature package behind a new port in `@atlas/core`
  (e.g. `ContextIntegrationPort`), composed by the SDK, receiving context
  through a narrow `ContextSourcePort` implemented by the SDK façade. Only choose
  this if the SDK grows large enough to justify the split.

Either way: **do not modify the `@atlas/context` stub** (ADR-001). Context
selection here is deterministic (ranked search + `getRelevantContext`), and any
future semantic ranking plugs into `@atlas/search`'s `RelevanceScorer` without
changing this layer's callers.

## Requirements

1. **Inspect before coding.** Read `AGENTS.md`, `docs/CURRENT_STATE.md`,
   `docs/CONTEXT_SDK.md`, `docs/AGENT_SESSIONS.md`, `docs/AGENT_ORCHESTRATOR.md`,
   `docs/DEPENDENCIES.md`, `docs/SECURITY.md`, and the source + tests of
   `@atlas/sdk` (`src/context/`, `src/sessions/`), `@atlas/agents`
   (`session-manager.ts`, `agent.service.ts`, `process.ts`), and `@atlas/search`.

2. **Retrieve relevant context from a user task.** Given a task string, gather
   candidate context through `createContextSDK`:
   - ranked `search.search(task, ...)` hits (files + symbols),
   - `getRelevantContext(task)` (deterministic assembly: search + persisted
     dependencies + stored summaries + project overview),
   - explicit `symbols.findDefinition` / `dependencies.query` when the task names
     a symbol or file.

3. **Rank context.** Produce an ordered list of context items. Ranking must be
   deterministic and explainable (score per item + the reason it matched). Reuse
   the scores returned by `@atlas/search`; route through the `RelevanceScorer`
   seam so a future vector scorer upgrades ranking without touching callers.

4. **Enforce context budgets.** Cap the package by maximum items and/or maximum
   token/character budget per item and total. Overflow must be cut **from the
   tail** (lowest-ranked) with the truncation recorded in the package. Budgets are
   configurable, with sensible defaults; do not hardcode a single global limit.

5. **Create a normalized Context Package.** A serializable model containing at
   minimum: task text, selected file snippets (with paths), symbols, dependency
   edges, summaries, project overview, a **selection explanation** (why each item
   was chosen, its score), budget metadata, and an **exclusion record** (what was
   deliberately not sent and why). The package must be provider-independent — no
   AI-CLI-specific formatting.

6. **Support provider adapters.** Convert a Context Package into an AI-CLI
   invocation through the **existing `@atlas/agents` adapters** (add per-CLI
   context-injection logic there; never scatter `if (provider === …)` in the
   integration layer). The adapter produces the prompt/args/env for
   `SessionLaunchRequest` / `AgentRunRequest`.

7. **Integrate with existing agent sessions.** Deliver the package to a session
   via `createSessionManager().startSession(id, { prompt, args, env })` (Task 15
   already reserved `SessionLaunchRequest.prompt`). Support both launching a new
   session with context and attaching context to an existing live session where
   the adapter makes it feasible.

8. **Respect AGENTS.md and repository instructions.** Include project-level
   instructions (e.g. the repo's `AGENTS.md`/`CLAUDE.md`-equivalent, README
   overview, manifest summary) in the package so the agent follows project rules
   without re-reading the whole repo.

9. **Protect secrets.** Never include `.env*`, credentials, private keys, or
   config with keys. Run an explicit deny-filter over selected file contents
   before inclusion and record anything dropped. Follow `docs/SECURITY.md` and
   `docs/PRIVACY.md`.

10. **Avoid sending unnecessary files.** Only files/symbols that ranked for the
    task (or are direct dependencies of selected symbols) may be included. Never
    send whole-repository dumps.

11. **Support incremental / stale-context handling.** Use `context.status()`
    (lastUpdated, available) to detect when the index is stale vs the working
    tree (via `@atlas/hashing` change detection when available). Surface a clear
    signal when context may be stale and allow the caller to proceed, refresh, or
    abort — never silently ship stale context as if fresh.

12. **Provide explainability.** `explain(package)` returns, per item, its source
    (search hit / summary / dependency / instructions), score, and the exclusion
    record. CLI `--explain` and JSON output must be able to render this.

## Tests

- Unit: ranking determinism, budget enforcement (cap items, cap tokens, tail
  truncation), deny-filter removes secrets, package serialization round-trip,
  stale-context detection.
- Integration: `createContextIntegration()` + a real fixture database
  (like `apps/cli/tests` does for `atlas search`); a fake `SessionPort` verifies
  the package reaches `startSession` correctly.
- Adapter tests: each AI-CLI adapter converts a package to the right invocation;
  provider differences stay inside adapters.
- No provider credentials and no network in tests (mock transports/process
  runners). Follow `docs/TESTING.md`.

## Boundaries — do not

- Do **not** modify `@atlas/context` (ADR-001 stub stays).
- Do **not** open `.codeatlas/context.db` or import `@atlas/search`/`storage`/
  `summary` from any consumer — go through the SDK.
- Do **not** reimplement process spawning, session lifecycle, or executable
  detection — reuse `@atlas/agents`.
- Do **not** send whole-repo context or implicit uploads (`docs/PRIVACY.md`).
- Do **not** rebuild search/rank — reuse `@atlas/search` and the scorer seam.

## Acceptance criteria

- [x] A task string produces a ranked, budgeted, normalized `ContextPackage`.
- [x] The package is delivered to a live agent session through `SessionPort`.
- [x] Secrets are filtered; the exclusion record is available.
- [x] Stale context is detected and surfaced honestly.
- [x] Provider-specific injection lives only in adapters.
- [x] `pnpm check` passes; unit + integration tests cover the above.

---

# Task 17 — Multi-Agent Orchestration

> **Status:** [IMPLEMENTED] — completed 2026-08-11. See the Completed Tasks
> table; this section is kept as the historical spec. Do **not** reimplement.
> Verify against `docs/AGENT_ORCHESTRATOR.md` / `docs/CURRENT_STATE.md` before
> making any change to the `@atlas/sdk` `orchestrator` module.

## Goal

Allow CodeAtlas to **coordinate multiple AI agents** on a task — assigning roles,
running them in parallel or sequentially, collecting results, and combining them —
with **explicit orchestration boundaries**. This is **not** an uncontrolled
autonomous swarm.

```
User Task
      ↓
CodeAtlas (Orchestrator)
      │
      ├── Claude
      ├── Gemini
      ├── Codex
      └── OpenCode
```

## Depends on (implemented — reuse)

- **Task 15** — `SessionManager` behind `SessionPort` (`createSessionManager`).
- **Task 14** — `@atlas/agents` connection layer (`AgentPort`, `ProcessRunner`).
- **Task 16** — Context → Agent Integration (per-agent Context Package).
- **Task 18** — Usage/Credits collector (optional consumer; design the seam now,
  wire later if Task 18 is not yet built).

## Required architecture

```
User Task
    ↓
Orchestrator (new — OrchestratorPort in @atlas/core)
    ├── Plan          (decompose task into agent roles + steps)
    ├── Executor      (run agents via SessionPort, parallel or sequential)
    ├── Coordinator   (shared/isolated context, result collection)
    └── Supervisor    (error handling, cancellation, timeout, retry)
    ↓
Agent Session Manager (SessionPort) → @atlas/agents → AI CLIs
```

## Requirements

1. **Inspect before coding.** Read `AGENTS.md`, `docs/CURRENT_STATE.md`,
   `docs/AGENT_SESSIONS.md`, `docs/AGENT_ORCHESTRATOR.md`, `docs/CONTEXT_SDK.md`,
   `docs/SECURITY.md`, `docs/DEPENDENCIES.md`, and the source + tests of
   `@atlas/agents` (session-manager, process, adapters) and `@atlas/sdk`
   (sessions). If Task 16 exists, reuse its Context Package; otherwise define a
   minimal per-agent context input now and defer full integration.

2. **Agent roles.** A `TaskPlan` assigns each participating agent a **role**
   (e.g. "analyze architecture", "review security", "review implementation") and
   the provider to run it. Roles are explicit and bounded — no dynamic agent
   spawning from task text.

3. **Execution model.** Support **parallel** (multiple sessions launched together,
   e.g. `Promise.all` over independent `SessionPort` runs) and **sequential**
   (later roles consume earlier results). The executor never reimplements process
   management — it drives `SessionPort`.

4. **Task delegation.** A role's input is a sub-task + its Context Package. The
   orchestrator decomposes the user task deterministically (a fixed role list for
   known scenarios; no free-form autonomous delegation in the MVP).

5. **Shared vs isolated context.** Define whether roles share the project context
   (normal) or get isolated scopes (e.g. security review receives only the
   authentication module). Document the choice per plan; do not leak secrets
   between roles.

6. **Session tracking & status.** Track every participant through `SessionPort`
   (`listSessions`, `getSession`). Expose a combined status view: which agents are
   running/stopped/failed, and their collected results.

7. **Result collection.** Collect each role's output into typed results. Provide
   a **combination step** that merges results (for the example workflow below,
   combine the architecture, security, and implementation reviews into one report,
   attributing each section).

8. **Error handling, cancellation, timeout, retry.**
   - Timeout per role (kill via `stopSession`/`terminateSession`; report partial
     output honestly — reuse `ProcessRunner` behavior).
   - Cancellation: cancel remaining/other roles when one fails or the user
     cancels; never leave orphan children (use `shutdown()`).
   - Retry: bounded, explicit (max N retries) and only for retryable failures
     (e.g. CLI launch failure), never for non-deterministic outcomes.
   - A single role failure must not silently corrupt others; classify and report.

9. **Conflict detection.** When combining results, detect obvious conflicts
   (contradictory findings across roles) and surface them to the user rather than
   merging silently.

10. **Explicit orchestration boundaries.**
    - The orchestrator decides **what** each agent runs and **when**; agents never
      spawn other agents and never talk to each other directly.
    - All process/session concerns go through `SessionPort`; all provider concerns
      through `@atlas/agents` adapters.
    - **No uncontrolled autonomous swarm** — a fixed plan, bounded concurrency,
      and a hard cap on participating agents.

11. **Security.** Provider-agnostic; no new shell execution (reuse
    `ProcessRunner`); never expose API keys in plans, logs, or result collection;
    per-role context follows the Task 16 secret rules.

## Example workflow (must be supported)

```
User: "Review this authentication implementation."
        ↓
Claude → Analyze architecture
Gemini → Review security
Codex → Review implementation
        ↓
CodeAtlas (combine results)
```

## Tests

- Unit: plan building, parallel vs sequential execution with a fake `SessionPort`,
  timeout → kill → partial-output reporting, retry on launch failure, conflict
  detection, cancellation (one failure stops remaining roles), shutdown cleanup.
- Integration: a 3-role plan over a fixture context database with mocked agent
  CLIs; verify result combination and attribution.
- Security: no keys leak into plans/results; isolated context stays isolated.
- No provider credentials / no network (mock the process runner and adapters).

## Acceptance criteria

- [x] A user task becomes a bounded plan of explicit agent roles.
- [x] Parallel and sequential execution both work through `SessionPort`.
- [x] Results are collected, combined, and attributed; conflicts surfaced.
- [x] Timeout/cancellation/retry behave per spec; no orphan processes.
- [x] Provider logic stays in adapters; no autonomous swarm behavior.
- [x] `pnpm check` passes with the tests above.

---

# Task 18 — Usage / Credits

> **Status:** [IMPLEMENTED] — completed 2026-08-11 (ADR-009). See the Completed
> Tasks table; this section is kept as the historical spec. Do **not** reimplement.
> Verify against `docs/USAGE.md` / `docs/CURRENT_STATE.md` before making any
> change to the `@atlas/usage` package or the SDK's `createUsageService`.

## Goal

**Track AI usage** so users can see what their agents are consuming and enforce
budgets/limits.

```
Agent
 ↓
Usage Collector
 ↓
Usage Database
 ↓
Usage Service
 ↓
Dashboard / CLI
```

Track where possible: **Agent · Provider · Model · Task · Session · Input tokens ·
Output tokens · Total tokens · Request count · Latency · Estimated cost**.

## Depends on (implemented — reuse)

- **Task 14/15** — `@atlas/agents` (agent runs, sessions) and `SessionPort`.
- **`@atlas/providers`** — `ProviderPort.complete()` (where AI model calls happen).
- **`@atlas/storage`** pattern + `@atlas/sdk` composition pattern. **Do not** reuse
  the context database tables for usage; usage gets its own store.

## Requirements

1. **Inspect before coding.** Read `AGENTS.md`, `docs/CURRENT_STATE.md`,
   `docs/PRIVACY.md`, `docs/SECURITY.md`, `docs/DEPENDENCIES.md`, and the source +
   tests of `@atlas/agents` and `@atlas/providers`.

2. **Usage Collector.** A narrow seam that records a usage event:
   - From provider calls: `ProviderPort.complete()` results (tokens, latency,
     model) — wrap at the port boundary, never inside provider adapters.
   - From agent sessions: `SessionPort` events (`AgentRunResult` already exposes
     `durationMs`, exit info) and Task 17's plan/role metadata when present.
   - Every event carries agent, provider, model (when known), task/session id,
     timestamps, input/output/total tokens, request count, latency.

3. **Distinguish actual / estimated / unknown — never fake precision.**
   - **Actual** — the provider reported exact values.
   - **Estimated** — derived from a documented heuristic (e.g. character→token
     estimate) and clearly labeled estimated.
   - **Unknown** — no data available; record `unknown`, do not guess.
   The model must make this tri-state explicit on every cost/token field.

4. **Do not hardcode provider pricing into business logic.** Design a
   **provider pricing abstraction** (e.g. a `PricingSource` / per-provider
   price-lookup adapter) that returns price-per-token and may return
   actual / estimated / unknown. Business logic consumes the abstraction only;
   pricing data lives behind it and is never a `switch` in the service.

5. **Usage Database.** A dedicated, versioned store owned by the usage module
   (separate from the context DB). Use the `@atlas/storage` repository +
   migration patterns but **do not** modify the context database schema.

6. **Usage Service.** CRUD + aggregates behind a `UsagePort` in `@atlas/core`,
   composed by the SDK (`createUsageService()`). Supports:
   - **Usage** — raw and aggregated records (by agent, provider, session, task).
   - **Budgets** — per-agent/provider/session/user token and cost budgets.
   - **Limits** — hard caps that stop/block an agent call when exceeded (enforced
     at the collection/run seam; never blocks reads of existing usage).
   - **Statistics** — latency, request counts, trends over time.

7. **Dashboard / CLI.** A `atlas usage` command surface (planned; register only if
   the CLI wiring matches Task 25's conventions): list usage, show budget status,
   `--json` output. The CLI delegates to the SDK — no business logic in the CLI.

8. **Privacy & security requirements.**
   - **Local-first**: usage data stays on the user's machine; no telemetry, no
     uploads (`docs/PRIVACY.md`).
   - Never log/print API keys, tokens, prompts, or config values in usage records
     or CLI output.
   - Usage records must not contain sensitive task content by default; allow
     hashed/anonymized task references.
   - Budget/limit enforcement must fail safe (deny the call) and never fail open.

## Tests

- Unit: collector maps provider/session events to usage records; tri-state
  actual/estimated/unknown correctness; budget enforcement (under/at/over);
  limit blocks the call; statistics aggregation; pricing abstraction resolves
  per-provider without a business-logic switch.
- Integration: a usage event round-trips collector → DB → service → CLI output
  (against a temp DB); provider with unknown tokens yields `unknown`, not a guess.
- Security: assertions that keys/prompts never appear in records or output.

## Acceptance criteria

- [x] Usage is recorded for agent runs and provider calls with the tri-state
      token/cost model.
- [x] Pricing lives behind an abstraction; no hardcoded prices in logic.
- [x] Budgets and limits work; limits fail safe.
- [x] Data is local; no secrets or task content leak.
- [x] `atlas usage` (or the agreed CLI surface) renders usage via the SDK.
- [x] `pnpm check` passes with the tests above.

---

# Task 19 — Tool Registry

> **Status:** [IMPLEMENTED] — completed 2026-08-11. See the Completed Tasks
> table; this section is kept as the historical spec. Do **not** reimplement.
> Verify against `docs/TOOL_REGISTRY.md` / `docs/CURRENT_STATE.md` before making
> any change to the `@atlas/toolkit` package or the SDK's `createToolRegistry`.
> This was the first Task of the Agent Toolkit (Direction C): it established the
> **registry foundation only** — no installer, no compatibility engine, no
> security engine (those are Tasks 21–24).

## Goal

Create a **curated registry** of useful open-source developer/AI-agent tools — the
authoritative catalog of *what exists*. This is the data foundation for every
Toolkit task that follows.

```
CodeAtlas
    ↓
Agent Toolkit (@atlas/toolkit)
    ↓
Tool Registry  (this task — "what is there")
```

## Depends on

- None of the Toolkit tasks; builds directly on the monorepo conventions
  (ports in `core`, feature package, SDK composition). The Toolkit will reuse
  `@atlas/agents` (`AgentPort`) for AI-CLI detection in later tasks — wire the
  seam now, don't implement detection here.

## Required architecture

```
Registry (new — @atlas/toolkit)
    ↓  reads/writes
Registry Store (curated catalog + local overlay)
    ↓  validated by
Registry Schema (versioned, validated, extensible)
```

## Requirements

1. **Inspect before coding.** Read `AGENTS.md`, `docs/CURRENT_STATE.md`,
   `docs/AGENT_TOOLKIT.md` (the design contract — **read it fully**, including
   §3 Registry, §7 Security, §8 Trust), `docs/DEPENDENCIES.md`, `docs/SECURITY.md`,
   `docs/MODULES.md`, and the Scanner manifest pattern
   (`packages/scanner/src/manifest.ts`).

2. **Create the `@atlas/toolkit` feature package** (imports **only** `core` +
   `shared`), with new ports declared in `@atlas/core` (e.g. `ToolRegistryPort`).
   Compose it through `@atlas/sdk` so consumers (CLI/MCP/editors) reach it only
   via the SDK. Follow `docs/DEPENDENCIES.md` (planned: `@atlas/toolkit` imports
   only `core` + `shared`; SDK composes it).

3. **Registry metadata.** Define and validate a per-tool record covering (at
   least): name, description, repository, website, license, version, categories,
   supported OS, supported agents, installation method(s), dependencies, security
   status, trust level, documentation/website. Categories must be **extensible**
   — nothing hardcoded around an initial list. Suggested initial categories (not
   exhaustive): Context, Token Optimization, MCP, Code Analysis, Testing, AI
   Quality, Agent Tools, CLI Utilities, Developer Productivity.

4. **Curated, not scraped.** The registry is the **authoritative, curated layer**.
   External sources (GitHub, npm, PyPI, Cargo, MCP directories) are **advisory
   inputs only** — they must pass a curated/sanitized pipeline before they can be
   recommended. **Never trust GitHub/npm metadata blindly.** Store the origin of
   every field so it is auditable.

5. **Separate concerns (do not conflate in this task).** Keep **Registry**
   (what exists) distinct from **Tool** (the installed instance, Task 20
   manifest), **Installation** (Task 22), **Compatibility** (Task 21), and
   **Security/Trust** (Task 24). Task 19 only creates the registry records and
   their metadata shape; the fields for install/compat/security are declared and
   validated here but **evaluated by later tasks**.

6. **Registry store.** The curated catalog should ship with the package (a
   versioned data file), and support a **local overlay** so users can add private/
   community tools without editing the shipped catalog. Both must be validated
   against the registry schema. Do **not** put the registry in the context
   database.

7. **Versioning & validation.** Schema-validate every record (registry entries
   and overlay entries). Fail loudly on malformed records rather than skipping
   silently.

## Tests

- Unit: schema validation (valid/invalid records), overlay merge (user tool wins
  without corrupting the curated catalog), category list stays extensible,
  provenance recorded per field.
- Integration: registry loads from the shipped catalog + a temp overlay through
  the SDK surface.
- No network in tests.

## Boundaries — do not

- Do **not** implement installation (Task 22), compatibility evaluation
  (Task 21), or security evaluation (Task 24) here.
- Do **not** auto-approve external metadata.
- Do **not** download or fetch anything from the network at runtime in this task.

## Acceptance criteria

- [x] `@atlas/toolkit` exists with `ToolRegistryPort` in `core`, composed by the SDK.
- [x] Curated catalog + local overlay both load and validate.
- [x] Metadata covers the fields above; categories are extensible.
- [x] Provenance is recorded; external metadata is never trusted blindly.
- [x] `pnpm check` passes with the tests above.

---

# Task 20 — Tool Manifest System

> **Status:** [IMPLEMENTED] — completed 2026-08-12. See the Completed Tasks
> table; this section is kept as the historical spec. Do **not** reimplement.
> Verify against `docs/TOOL_MANIFEST.md` / `docs/CURRENT_STATE.md` before making
> any change to the `@atlas/toolkit` manifest module. Depends on Task 19
> (Registry) for the catalog; defines the per-installed-tool state that
> Tasks 21–24 read and write.

## Goal

Define a **standard manifest format** that describes how a third-party tool
integrates with CodeAtlas and records the state of **one installed tool** on the
user's machine.

```
Registry Entry  (Task 19 — the catalog record)
      ↓  refines into
Tool Manifest   (this task — one installed tool's state)
      ↓  read/written by
Compatibility (21) · Installer (22) · Configurator (23) · Security/Trust (24)
```

## Requirements

1. **Inspect before coding.** Read `AGENTS.md`, `docs/CURRENT_STATE.md`,
   `docs/AGENT_TOOLKIT.md` (§4 Tool Manifest), `docs/DEPENDENCIES.md`,
   `docs/SECURITY.md`, and the existing **Scanner manifest pattern**
   (`packages/scanner/src/manifest.ts`) — the tool manifest should mirror its
   merge/versioning approach. Also read `docs/CONTEXT_STORAGE.md` (`.codeatlas/`
   layout conventions).

2. **Design the final schema — do not copy the sketch verbatim.** Derive the
   schema from actual requirements. The conceptual shape (to refine):

   ```yaml
   name:
   description:
   repository:
   license:
   categories:
   supported_agents:
   compatibility:      # declared requirements (evaluated by Task 21)
   installation:       # how to install (executed by Task 22)
   configuration:      # how to configure (applied by Task 23)
   security:           # security/trust status (evaluated by Task 24)
   documentation:
   ```

   The manifest must be:
   - **versioned** (schema version + tool version),
   - **validated** (schema validation on load and before any write),
   - **extensible** (unknown-but-well-formed fields preserved, not rejected),
   - **machine-readable and human-readable**,
   - **secure** (treated as untrusted input — see Task 24 and `docs/SECURITY.md`).

3. **Support multiple installation ecosystems.** The schema must be able to
   describe installation via: `npm`, `pip`, `cargo`, `go`, `binary`, GitHub
   release, and MCP. **Do not implement any installer in this task** — the
   manifest describes installation requirements (`type`, `package`, `source`,
   `checksum`, `version range`) without executing anything.

4. **Record installed-tool state.** The manifest tracks: which tool + version is
   installed, where it came from (registry entry / npm / release), install method
   + provenance, verification result, applied configuration + which agents it was
   configured for, trust/security status at install time, and a doctor-able
   integration state. Store per-installed-tool manifests in `.codeatlas/` next to
   the project state (mirroring the Scanner manifest pattern).

5. **Schema validation & tests.** Ship a validator with clear errors. Treat the
   manifest as **untrusted input** when loading from disk (see Task 24 threat
   list) — never execute anything from it.

## Tests

- Unit: schema validation (valid/invalid manifests), versioning, extensibility
  (unknown fields preserved), round-trip serialize/parse.
- Integration: a manifest written for a fixture tool loads back correctly; a
  corrupted manifest fails validation with a clear error (never crashes).
- Malformed/hostile manifest content is rejected, not executed (safety).

## Boundaries — do not

- Do **not** install anything (Task 22).
- Do **not** evaluate compatibility (Task 21) or security (Task 24) — only declare
  the fields those tasks will evaluate.
- Do **not** read or modify the context database.

## Acceptance criteria

- [x] A versioned, validated, extensible manifest schema exists and is documented.
- [x] The schema can describe all listed installation ecosystems without executing any.
- [x] Installed-tool state is persisted in `.codeatlas/` following the Scanner manifest pattern.
- [x] Manifests are loaded as untrusted input and validated.
- [x] `pnpm check` passes with the tests above.

---

# Task 21 — Compatibility Engine

> **Status:** [IMPLEMENTED] — completed 2026-08-12. This section is retained as
> the historical implementation specification; do not reimplement. Verify
> against `docs/CURRENT_STATE.md` and `docs/AGENT_TOOLKIT.md` before changes.
> Depends on Task 19 (Registry) + Task 20 (Manifest). **Does not install anything.**

## Goal

Determine whether a tool **can safely operate in the user's environment** before
any install or configuration step.

```
Tool Manifest (Task 20)
      ↓
Environment Detector (new)
      ↓
Compatibility Engine (new)
      ↓
Compatibility Result
```

## Requirements

1. **Inspect before coding.** Read `AGENTS.md`, `docs/CURRENT_STATE.md`,
   `docs/AGENT_TOOLKIT.md` (§6 Compatibility Engine), `docs/DEPENDENCIES.md`,
   `docs/SECURITY.md`, and the `@atlas/agents` source + tests — the engine must
   use `AgentPort.detectAgent()`/`detectAll()` for AI-CLI availability, **never
   reimplement executable detection**.

2. **Check, at minimum:** OS; architecture (x64/arm64); runtime versions (Node,
   Python, .NET, …); package-manager availability; AI CLI availability + version;
   MCP support; declared dependencies; required permissions. Compare the manifest's
   declared requirements against the **detected environment**.

3. **Result states** (exactly one per check and overall):

   | State | Meaning |
   | ----- | ------- |
   | `Compatible` | every declared requirement is satisfiable |
   | `Partially Compatible` | runs, but some requirements unmet (report which) |
   | `Incompatible` | cannot operate in this environment |
   | `Unknown` | cannot determine (flag it; do not guess) |

4. **Render like the design contract.** A per-check verdict with ✓/✗ lines, e.g.:

   ```text
   Tool: Example Context Tool
   ✓ Windows
   ✓ Node 20+
   ✓ Claude
   ✓ Gemini
   ✗ Python 3.12 required
   ```

5. **Never install** in this task; the engine only evaluates and reports.

6. **Do not fail open.** An `Incompatible` tool is surfaced as **not installable
   in this environment** — not silently skipped, not auto-installed.

## Tests

- Unit: each check (OS, arch, runtime, package manager, AI CLI present/absent,
  AI CLI version, MCP) and each result state; declared-requirement parsing.
- Integration: a fixture manifest evaluated against a stubbed environment yields
  `Compatible`/`Partially Compatible`/`Incompatible`/`Unknown` correctly; AI-CLI
  checks route through a fake `AgentPort`.
- No network; no real CLI detection in unit tests (stub `findExecutable`).

## Acceptance criteria

- [x] The engine checks the listed dimensions and returns one of the four states.
- [x] AI-CLI availability/version is detected through `AgentPort`, not duplicated.
- [x] `Incompatible` tools are reported as not installable (no silent skip).
- [x] `pnpm check` passes with unit + integration tests.

---

# Task 22 — Tool Installer

> **Status:** [IMPLEMENTED] — completed 2026-08-12. This section is retained as
> the historical implementation specification; do not reimplement. Verify
> against `docs/CURRENT_STATE.md` and `docs/AGENT_TOOLKIT.md` before changes.
> Depends on Tasks 19–21. **Security-critical task — follow `docs/SECURITY.md`
> strictly.** Do **not** implement every installer unless the architecture makes
> it appropriate for the MVP (a safe subset is acceptable).

## Goal

Safely install tools described by the CodeAtlas registry/manifests — through
**official distribution channels only**, with explicit user approval and
recorded provenance.

```
User selects tool
       ↓
Manifest (Task 20)
       ↓
Compatibility Check (Task 21)
       ↓
Security Check (Task 24)
       ↓
User Approval
       ↓
Installer
       ↓
Installation
       ↓
Verification
```

## Requirements

1. **Inspect before coding.** Read `AGENTS.md` (§4.7 process execution),
   `docs/CURRENT_STATE.md`, `docs/AGENT_TOOLKIT.md` (§5 Installer, §7 Security),
   `docs/SECURITY.md`, `docs/PRIVACY.md`, `docs/DEPENDENCIES.md`, and the
   `@atlas/agents` `ProcessRunner` source + tests (the spawn pattern to follow).

2. **Extensible installer abstraction.** An `InstallerPort` in `@atlas/core`,
   implemented in `@atlas/toolkit`, with **one adapter per ecosystem** — mirroring
   `ProviderPort`/`AgentPort` adapter patterns. Adapters: `npm`, `pip`, `cargo`,
   `go`, `binary`, `github-release`, `mcp`. MVP may implement a safe subset; the
   abstraction must make a new ecosystem a new small adapter, not a fork.

3. **Flow.** Validate tool → check compatibility (Task 21) → check security
   metadata (Task 24) → **ask user approval** → install → configure (Task 23, if
   built) → verify. **No automatic install without explicit user approval** unless
   the user enables an explicit automation mode.

4. **Security requirements (non-negotiable).**
   - **Never blindly execute arbitrary repository scripts** (no `download repo →
     run install.sh → done`). Install through the ecosystem's official package
     manager or an official release asset only.
   - **Validate commands**; pass package-manager args as **argument arrays**, never
     shell strings (`spawn(file, argsArray)` — no `shell: true`).
   - **Prevent command injection** — never build a shell string from manifest,
     registry, or AI-derived content.
   - **Handle paths safely** — resolve and validate install paths; prevent
     path traversal.
   - **Never expose secrets** — no keys/env in install commands, logs, or output.
   - **Show the user what will happen** before installing (exact command/effect).
   - **Require approval for dangerous operations** (network access, writing outside
     `.codeatlas/`, installing globally, running post-install hooks).
   - **Capture installation logs** (to a local log; never to a remote service).
   - **Support rollback where practical** — record the pre-install state so a failed
     install can be reverted or cleanly uninstalled.
   - **Record provenance** in the Tool Manifest (Task 20): source, version,
     checksum/signature verification, timestamp.

5. **Verification.** After install, verify the tool is present and runnable
   (binary on PATH, version matches, `doctor`-able integration state). Report
   honestly when verification fails.

## Tests

- Unit: each implemented adapter builds the correct `spawn` call (assert the arg
  array — no shell strings); compatibility gate blocks installs; security gate
  blocks `blocked`/unapproved tools; approval required.
- Integration: install/verify flow against a fake package-manager executable or a
  fixture; rollback path on failure.
- **Adversarial:** hostile manifest/registry input cannot inject shell syntax,
  traverse paths, or exfiltrate env (assert safe spawn arrays and path validation).
- No real network; stub external commands.

## Boundaries — do not

- Do **not** install arbitrary GitHub projects silently; never run arbitrary
  third-party install scripts.
- Do **not** add provider-specific logic outside adapters.
- Do **not** modify the context database.

## Acceptance criteria

- [x] `InstallerPort` + per-ecosystem adapters exist; a safe MVP subset is implemented.
- [x] Approval is required before any install; the user is shown what will run.
- [x] All commands are argument-array spawns (no shell strings, no injection).
- [x] Provenance + logs are captured; rollback works for the implemented cases.
- [x] `pnpm check` passes including the adversarial security tests.

---

# Task 23 — Tool Configurator

> **Status:** [IMPLEMENTED] — completed 2026-08-12. This section is retained as
> the historical implementation specification; do not reimplement. Verify
> against `docs/CURRENT_STATE.md` and `docs/AGENT_TOOLKIT.md` before changes.
> Depends on Tasks 19–22.

## Goal

After installation, **automatically configure the tool** for the supported AI
agents (Claude / Gemini / Codex / OpenCode, and MCP/VS Code where applicable).

```
Installed Tool
      ↓
Tool Configurator
      ↓
Provider Adapter
      ↓
Claude / Gemini / Codex / OpenCode
```

## Requirements

1. **Inspect before coding.** Read `AGENTS.md`, `docs/CURRENT_STATE.md`,
   `docs/AGENT_TOOLKIT.md` (§9 Configurator), `docs/DEPENDENCIES.md`,
   `docs/SECURITY.md`, and the `@atlas/agents` adapters (`@atlas/agents` source +
   tests) for the executable-detection seam. Also read the `@atlas/providers`
   adapter pattern (the target-config adapters should mirror it).

2. **`ConfiguratorPort` + one adapter per target** — `ClaudeAdapter`,
   `GeminiAdapter`, `CodexAdapter`, `OpenCodeAdapter`, `McpAdapter`,
   `VsCodeAdapter` (per `docs/AGENT_TOOLKIT.md` §9). **Provider-specific
   configuration must remain inside adapters. Do not create one giant
   configuration function** with `if (target === …)` in the service.

3. **Detect installed agents** via `AgentPort.detectAll()`/`detectAgent()`
   (through the existing connection layer — never duplicate executable
   detection). Configure only agents that are actually installed and that the tool
   supports (declared in the manifest's `supported_agents`).

4. **Configuration lifecycle.** For each applicable target: detect supported
   configurations → **generate** configuration → **validate** it →
   **apply** it → **verify** the integration (tool discoverable/runnable by the
   agent).

5. **Backup & safety.** Back up existing configuration before overwriting; **avoid
   overwriting unrelated user configuration** (merge or append, never clobber
   unrelated keys). Support rollback of applied configuration. Write to **user
   config**, never silently into the analyzed repository (`docs/SECURITY.md` —
   repo files are untrusted input).

6. **Dry-run mode.** Support `--dry-run`: render the exact configuration changes
   without applying them. Example surface:

   ```bash
   codeatlas tools configure <tool> --dry-run
   ```

7. **Adapters stay thin and testable.** Each adapter is small, self-contained, and
   unit-testable in isolation; no adapter depends on another adapter's internals.

## Tests

- Unit, per adapter: **existing configuration** (merge, don't clobber), **missing
  configuration** (create cleanly), **invalid configuration** (validate + error),
  **backup** (before write), **rollback** (restore on failure), **provider
  differences** (each adapter behaves correctly for its target).
- Integration: `--dry-run` produces changes without applying; apply → verify
  against a temp user-config directory and a fake `AgentPort`.
- No real user config is touched in tests; use temp dirs.

## Acceptance criteria

- [x] `ConfiguratorPort` + per-target adapters exist; no giant config function.
- [x] Configuration targets only installed, supported agents (via `AgentPort`).
- [x] Backup/merge/rollback protect existing user config.
- [x] `--dry-run` works and is tested.
- [x] `pnpm check` passes with the tests above.

---

# Task 24 — Security / Trust System

> **Status:** [IMPLEMENTED] — completed 2026-08-12. This section is retained as
> the original acceptance contract; implementation lives in `SecurityPort` and
> `SecurityAssessor`.
> **Critical task.** Depends on Tasks 19–20. Treat third-party repositories and
> manifests as **untrusted input** (see `docs/SECURITY.md`).

## Goal

Create the **trust/security layer** for third-party tools: assess risk before any
install, assign a trust status, and gate the installation decision.

```
Tool
 ↓
Metadata
 ↓
Security Checks
 ↓
Risk Assessment
 ↓
Trust Status
 ↓
Installation Decision
```

## Requirements

1. **Inspect before coding.** Read `AGENTS.md` (§4.7, §4.8, §4.9),
   `docs/CURRENT_STATE.md`, `docs/AGENT_TOOLKIT.md` (§7 Security, §8 Trust — **read
   both fully**), `docs/SECURITY.md`, `docs/PRIVACY.md`, `docs/DEPENDENCIES.md`.

2. **Evaluate (at minimum):** repository (owner, activity, fork status, stars as a
   **weak** signal only), license, package source (official registry vs unknown
   tarball), dependencies (transitive supply chain), installation commands (what
   would actually run), required permissions (network, filesystem, processes),
   network access, secrets, maintainer information, release information
   (version/tag/provenance), and known security issues **where available** (never
   fabricate; mark `unknown` when absent).

3. **Trust states** (from `docs/AGENT_TOOLKIT.md` §7/§8 — use exactly these):

   | State | Meaning |
   | ----- | ------- |
   | `verified` | Reviewed by CodeAtlas against a concrete checklist (rare; high bar) |
   | `reviewed` | Passed a documented review pass (metadata + install path + provenance) |
   | `community` | Community-used and reported, but not individually audited by CodeAtlas |
   | `unverified` | Not yet reviewed; installable only with explicit user override |
   | `blocked` | Known bad — cannot be installed through the Toolkit |

   **CodeAtlas must never claim something is "verified" unless CodeAtlas actually
   verified it.** The **default is `unverified`**; promotion to `reviewed`/
   `verified` is a deliberate, documented, human-in-the-loop act.

4. **Security assessment model.** A `SecurityAssessor` that runs a defined set of
   checks over the metadata/manifest, produces a **risk assessment** (per-check
   verdict + overall risk level), and maps to a **trust status**. The installation
   decision consults both compatibility (Task 21) and trust status (Task 24) —
   the security gate is a hard gate, not advisory.

5. **Protect against (threat list — must have explicit defenses + tests):**
   - command injection (safe arg-array spawns),
   - malicious installation scripts (no blind execution — Task 22 rule),
   - path traversal (path validation),
   - arbitrary code execution (no manifest-triggered code),
   - secret leakage (no keys in install/config/logs),
   - malicious manifests (schema-validated, but content never trusted),
   - dependency attacks (transitive supply-chain awareness),
   - repository prompt injection (treat repo content as untrusted; never feed it
     into commands),
   - unsafe configuration (never write into the analyzed repository).

6. **Trust status is shown everywhere** (list/install/configure UI and CLI) and
   recorded in the Tool Manifest at install time (Task 20). Users can **override
   with explicit consent**, but the override is visible and recorded.

## Tests

- Unit: each security check (license, source, dependencies, install command,
  permissions, maintainers, release provenance); risk → trust-status mapping;
  default is `unverified`.
- **Adversarial/malicious inputs:** hostile manifests and registry entries (shell
  metacharacters in fields, path-traversal paths, scripts masquerading as
  metadata, fake maintainer fields) are detected and rejected — never executed.
- Integration: an `unverified` tool requires explicit override; a `blocked` tool
  is rejected outright; the status is recorded in the Tool Manifest.
- No network; no real installs.

## Acceptance criteria

- [ ] Security assessment model exists; threat list has concrete defenses.
- [ ] Trust states are exactly `verified`/`reviewed`/`community`/`unverified`/`blocked`; default is `unverified`.
- [ ] No "verified" claim is ever made without an actual, documented verification.
- [ ] Malicious/hostile manifest and registry inputs are rejected in tests.
- [ ] `pnpm check` passes with the adversarial tests.

---

# Task 25 — Toolkit CLI

> **Status:** [PLANNED] — no code exists. Roadmap Phase 6 (Direction C).
> Depends on Tasks 19–24. **The CLI is an interface/orchestrator, not another
> implementation** of the Toolkit systems.

## Goal

Provide a **unified CLI interface** for the Agent Toolkit, delegating to the SDK
and the Task 19–24 systems.

```bash
codeatlas tools                     # overview: recommended + installed
codeatlas tools search <query>      # search the registry
codeatlas tools info <tool>         # details for one tool
codeatlas tools install <tool>      # install (approval/security flow)
codeatlas tools remove <tool>       # uninstall + remove configuration
codeatlas tools update              # update installed tools / local registry
codeatlas tools configure <tool>    # configure for installed agents
codeatlas tools doctor              # reconcile installed vs manifest vs environment
```

## Requirements

1. **Inspect before coding.** Read `AGENTS.md`, `docs/CURRENT_STATE.md`,
   `docs/AGENT_TOOLKIT.md` (§10 CLI / Slash-Command UX), `docs/CLI.md` (the CLI
   contract and its conventions — exit codes, `--json`, help text, "no business
   logic in the CLI"), `docs/DEPENDENCIES.md`, `docs/SECURITY.md`, and the
   existing CLI source (`apps/cli/src/cli.ts`, `apps/cli/src/commands/*`).

2. **Compose the Toolkit through the SDK.** `@atlas/sdk` must expose the Toolkit
   (e.g. a `createToolkitSDK()` / `createToolRegistry()` style factory composing
   Registry, Manifest, Compatibility, Installer, Configurator, and Security/Trust
   behind their ports). The CLI imports **only** `@atlas/sdk` (+ `@atlas/mcp`
   where needed) — it must **not** import `@atlas/toolkit` or any feature package
   directly (ESLint-enforced).

3. **Commands delegate; they do not reimplement.** Each command parses args and
   calls the SDK surface:
   - `tools` — overview of recommended + installed tools.
   - `tools search <query>` — registry search (via the Registry, Task 19).
   - `tools info <tool>` — registry record + installed/doctor state.
   - `tools install <tool>` — runs the full flow (compatibility → security →
     approval → install → configure → verify), showing trust status and what will
     happen before installing.
   - `tools remove <tool>` — uninstall + remove configuration (rollback-aware).
   - `tools update` — update installed tools / local registry.
   - `tools configure <tool>` — configure for installed agents (supports
     `--dry-run`, Task 23).
   - `tools doctor` — reconcile installed vs Tool Manifest vs environment (using
     Tasks 20, 21, 24 state).
   Follow the CLI's global conventions from `docs/CLI.md` (exit codes, `--json`,
   help text, redact secrets).

4. **Follow the CLI conventions.** Exit codes `0` success / `1` user error /
   `2` internal. Never echo API keys or full provider config. `--json` for
   machine-readable output. Help text is the contract of record.

5. **Future slash-command integration.** Design for a planned `/tools` slash
   command surface (in the future orchestrator TTY), e.g.:

   ```text
   /tools
   ──────────────
   Recommended
   Context
   Token Optimization
   MCP
   Code Review

   Installed
   ──────────────
   ✓ Tool A
   ✓ Tool B
   ```

   **Do not implement the slash-command router** (the agent router is a separate
   planned task) — only ensure the Toolkit data needed by `/tools` is reachable
   through the SDK so the router can render it later.

6. **Keep it thin.** The CLI is an interface/orchestrator: any logic that belongs
   to the Registry, Manifest, Compatibility, Installer, Configurator, or
   Security/Trust must live in those modules — **never duplicated in the CLI**.

## Tests

- Unit/CLI: command registration, help text, exit codes, `--json` output, redaction.
- Integration: `tools install`/`configure`/`doctor` against a temp environment
  with stubbed Toolkit services (via a fake SDK dependency or fixture) — assert
  the CLI delegates and renders, not that it reimplements.
- Follow the existing `apps/cli/tests/cli.test.ts` pattern (fixture-based, offline).

## Boundaries — do not

- Do **not** implement Registry/Manifest/Compatibility/Installer/Configurator/
  Security logic inside the CLI.
- Do **not** import `@atlas/toolkit` directly from the CLI.
- Do **not** build the `/tools` slash-command router (future task).

## Acceptance criteria

- [ ] All listed `atlas tools` commands are registered and delegate to the SDK.
- [ ] Trust status + install details are shown before any install.
- [ ] `doctor` reconciles installed vs manifest vs environment.
- [ ] CLI follows `docs/CLI.md` conventions; secrets redacted; `--json` supported.
- [ ] `pnpm check` passes with the tests above.

---

# Task 26 — Context CLI (`atlas context` / slash-command wiring)

> **Status:** [IMPLEMENTED]. Follow-up to Task 16 (ADR-008 "Follow-ups").
> `apps/cli` delegates to the SDK `context-integration` surface; the future
> slash-command router remains separate and planned.

## Goal

Expose Task 16's Context → Agent integration through the CLI: turn a user task
into a rendered, budgeted **Context Package** (and its explanation), and launch
an AI CLI session with that context — so a user can run
`atlas context "fix the auth tests"` without writing SDK code.

```
User Task
   ↓
atlas context (CLI — new)
   ↓
createContextIntegration (Task 16, @atlas/sdk)
   ↓
Context SDK → Context Package → SessionPort → AI CLI
```

## Depends on (all implemented — reuse, do not rebuild)

- **Task 16** — `context-integration` in `@atlas/sdk`: `createContextIntegration()`
  with `buildPackage` / `explain` / `launch` / `attach`, render helpers
  (`renderContextPackage`, `renderContextExplanation`), budget, deny-filter,
  staleness signal. ADR-008.
- **Task 10** — `createContextSDK` (the read façade the integration consumes).
- **Task 15** — `createSessionManager()` / `SessionPort` (`atlas sessions`).
- **Task 14** — `@atlas/agents` adapters (provider injection stays there).

## Requirements

1. **Inspect before coding.** Read `AGENTS.md`, `docs/CURRENT_STATE.md`,
   `docs/CLI.md` (command conventions: exit codes, `--json`, redaction, help
   text), `docs/AGENT_SESSIONS.md`, ADR-008, and the existing wired commands
   (`apps/cli/src/commands/search.ts`, `sessions.ts`, `mcp.ts`) + their tests in
   `apps/cli/tests/cli.test.ts`. Re-read the SDK's `context-integration` source
   and `tests/context-integration.test.ts` before touching the CLI.

2. **Register `atlas context <task>`.** A thin command that delegates **only** to
   `@atlas/sdk` (`createContextIntegration`). No business logic in the CLI; no
   direct DB / `@atlas/search` / `@atlas/storage` imports.

3. **Subcommand surface** (align with `docs/CLI.md` conventions):
   - `atlas context <task>` — build + render the package (prompt form) to stdout,
     including the staleness signal and any exclusions.
   - `atlas context <task> --explain` — content-free explanation listing per-item
     source/score/reason (via `explain()` + `renderContextExplanation`).
   - `atlas context <task> --json` — machine-readable `ContextPackage` /
     `ContextExplanation` (deny-filtered input only, no secrets).
   - `atlas context launch <task> --provider <id> [--repo <path>]` — build the
     package and start a new session through `createContextIntegration().launch()`
     (prompt seeded with the rendered package). Provider differences stay in
     `@atlas/agents` adapters — no `if (provider === …)` here.
   - `atlas context attach <session-id> <task>` — `attach()` a package to a
     `CREATED` session; surface the typed `ContextAttachUnsupportedError` for
     live/terminal sessions as a clear, non-crashy CLI error (exit 1).
   - Budget/tuning flags where sensible (e.g. `--max-tokens-total`,
     `--include-instructions`/`--no-instructions`,
     `--include-overview`/`--no-overview`) mapped to the integration's
     `AssembleOptions`.

4. **Follow the CLI conventions.** Exit codes `0` success / `1` user error /
   `2` internal. Never echo API keys, env, or full provider config. `--json` for
   machine-readable output. Help text is the contract of record.

5. **Slash-command design (planned, not built).** Ensure the data a future
   `/context` slash command needs (package + explanation + staleness) is
   reachable through the SDK. **Do not implement the slash-command router** — that
   is the separate planned orchestrator task.

6. **Respect Task 16's guarantees.** Every package the CLI renders already passed
   the deny-filter; the CLI must not print excluded paths' contents or bypass the
   filter. Show the staleness signal honestly (never present stale context as
   fresh).

## Tests

- Unit/CLI: command registration, help text, exit codes, `--json` output,
  `--explain` rendering, redaction, unknown `--provider` / unknown session id
  handling, `ContextAttachUnsupportedError` mapped to a clean exit-1 message.
- Integration: `atlas context` against a fixture database (like the existing
  `atlas search` CLI tests) with a fake/stubbed `SessionPort`, verifying the
  package reaches `launch`/`attach`; assert the CLI delegates and renders, never
  reimplements.
- No provider credentials and no network in tests (mock transports/process
  runners). Follow `docs/TESTING.md` and the `apps/cli/tests/cli.test.ts`
  patterns.

## Boundaries — do not

- Do **not** reimplement assembly/budget/deny/staleness in the CLI — call the SDK.
- Do **not** import `@atlas/search` / `@atlas/storage` / `@atlas/context` or open
  the DB from `apps/cli` (ESLint `no-restricted-imports`).
- Do **not** add provider-specific logic or `if (provider === …)` switches.
- Do **not** build the slash-command router or the agent orchestrator (future
  tasks).

## Acceptance criteria

- [ ] `atlas context` / `--explain` / `--json` render packages via the SDK.
- [ ] `launch` and `attach` deliver packages through `createContextIntegration`
      and the existing `SessionPort` (`atlas sessions` still lists the session).
- [ ] Deny-filtered output only; no secrets; staleness shown honestly.
- [ ] CLI follows `docs/CLI.md` conventions; `--json` supported; exit codes correct.
- [ ] `pnpm check` passes with the tests above.

---

# Task 27 — VS Code Agent Chat Webview Panel

> **Status:** [PLANNED] — no code exists. This is the first UI-facing task for
> the agent chat experience. Depends on Tasks 15 (Session Manager), 16 (Context
> Integration), and the existing `@atlas/extension` infrastructure.

## Goal

Add an **interactive webview panel** to the VS Code extension that lets users
launch AI coding agents (Claude / Gemini / Codex / OpenCode) with automatic
context injection, view agent output in real time, and manage sessions — all
from a unified chat-style interface inside the editor.

```
┌─ CodeAtlas Agent Chat ──────────────────────────────────────┐
│  AGENTS          │  Terminal Output                          │
│  ──────────      │                                           │
│  ● claude (run)  │  > Launching claude...                    │
│    gemini        │  > Context: 12 items, 8.4k tokens        │
│    codex         │  [real-time stdout from agent process]    │
│    opencode      │                                           │
│                  │                                           │
│  SESSIONS        │                                           │
│  ──────────      │                                           │
│  #a3f2 Running   │                                           │
│  #b1c9 Stopped   │                                           │
│                  │                                           │
├──────────────────┴───────────────────────────────────────────┤
│ [🤖 auto] [Type a message or /command...]          [Send]    │
└─────────────────────────────────────────────────────────────┘
```

## Depends on (all implemented — reuse, do not rebuild)

- **Task 15** — `SessionManager` behind `SessionPort` (`createSessionManager()`).
  Sessions are created and tracked through the existing session manager.
- **Task 16** — `ContextIntegration` (`createContextIntegration()`). Context is
  assembled, budgeted, deny-filtered, and rendered through the existing module.
- **Task 14** — `@atlas/agents` adapters. Provider-specific binary names, run
  flags, and interactive args stay in adapters — no `if (provider === …)` in
  the webview.
- **Task 12** — `@atlas/extension` infrastructure. The existing `ContextClient`,
  `VscodeApi` facade, `AtlasRunner`, and tree view providers provide the
  foundation to build on.
- **`renderContextPackage()`** (`@atlas/sdk`) — renders the context package as a
  provider-independent prompt for injection.

## Required architecture

```
VS Code Extension
    │
    ├── AgentChatPanel (new — WebviewViewProvider)
    │       │
    │       ├── Webview HTML/CSS/JS (media/chat-panel.*)
    │       │       └── message protocol (postMessage / onDidReceiveMessage)
    │       │
    │       ├── SessionManager (reuse — createSessionManager())
    │       │       └── @atlas/agents → AI CLI processes
    │       │
    │       ├── ContextIntegration (reuse — createContextIntegration())
    │       │       └── Context SDK → Context Package
    │       │
    │       └── VS Code Terminal (vscode.window.createTerminal)
    │               └── interactive AI CLI with inherited stdio
    │
    ├── AgentCommands (new — command handlers)
    │       └── codeatlas.chat.open, codeatlas.agent.launch,
    │           codeatlas.agent.stop, codeatlas.agent.selectDefault
    │
    └── VscodeApi facade (extend — add terminals, webview providers)
```

## Requirements

1. **Inspect before coding.** Read `AGENTS.md`, `docs/CURRENT_STATE.md`,
   `docs/VSCODE.md`, `docs/AGENT_SESSIONS.md`, `docs/AGENT_TOOLKIT.md`,
   `docs/DEPENDENCIES.md`, `docs/SECURITY.md`, and the full `@atlas/extension`
   source (`src/extension.ts`, `src/extension-core.ts`, `src/commands.ts`,
   `src/client.ts`, `src/vscode-host.ts`) plus tests. Also read the TUI
   implementation (`apps/cli/src/tui/shell.ts`, `router.ts`, `render.ts`,
   `io.ts`) — the webview should mirror the TUI's agent launch pattern
   (detect → create session → launch interactively → track status).

2. **Webview panel as a `WebviewViewProvider`.** Register a webview view in the
   CodeAtlas activity bar container (`codeatlas-chat` view ID). The webview is a
   standard `WebviewViewProvider` that creates an HTML panel with CSP-safe
   resource loading.

3. **Split layout.** The webview renders three zones:
   - **Left sidebar** — agent list (installed status), active sessions list,
     default agent indicator.
   - **Right main area** — terminal output (agent stdout/stderr, context info,
     status messages, scrollable buffer).
   - **Bottom input bar** — text input with send button, slash-command
     hint (`/claude`, `/gemini`, `/auto`, or bare text for default agent).

4. **Message protocol.** Webview ↔ extension communication via
   `postMessage` / `onDidReceiveMessage`:

   | Direction | Type | Payload |
   |-----------|------|---------|
   | webview→ext | `launchAgent` | `{ provider?: string, task: string }` |
   | webview→ext | `stopAgent` | `{ sessionId: string }` |
   | webview→ext | `listAgents` | `{}` |
   | webview→ext | `listSessions` | `{}` |
   | ext→webview | `agentOutput` | `{ sessionId, stream: "stdout"\|"stderr", data }` |
   | ext→webview | `agentStatus` | `{ sessionId, status, provider }` |
   | ext→webview | `contextInfo` | `{ sessionId, items, tokens, staleness }` |
   | ext→webview | `agentsList` | `{ agents: AgentInfo[] }` |
   | ext→webview | `sessionsList` | `{ sessions: Session[] }` |
   | ext→webview | `error` | `{ message }` |

5. **Slash-command parsing in the webview.** The input bar accepts:
   - `/claude fix the login bug` — explicit provider + task.
   - `/gemini refactor auth` — explicit provider + task.
   - `/auto fix bug` — auto-select provider (future Task 29 classifier).
   - `fix the login bug` (no slash) — use the configured default agent.
   The parser runs in the extension host (not the webview) for security.

6. **Automatic context injection.** When launching an agent, the panel
   automatically:
   - Calls `createContextIntegration().buildPackage({ task })` to assemble a
     budgeted, deny-filtered `ContextPackage`.
   - Renders it via `renderContextPackage(pkg)`.
   - Shows context metadata in the output area (item count, token estimate,
     staleness signal).
   - Injects the rendered context as the initial prompt to the agent CLI.

7. **Terminal integration.** For interactive mode (the primary use case):
   - Create a VS Code integrated terminal via `vscode.window.createTerminal()`.
   - Use the `@atlas/agents` adapter's `buildInteractiveArgs()` to get the
     correct binary and flags (no `-p` for interactive mode).
   - Send the context-augmented prompt to the terminal.
   - Show the terminal alongside the webview panel.
   - Pipe terminal output back to the webview via `postMessage`.

8. **Default agent setting.** Add VS Code configuration:
   ```json
   "codeatlas.defaultAgent": {
     "type": "string",
     "default": "claude",
     "enum": ["claude", "gemini", "codex", "opencode"],
     "description": "Default AI agent when no slash command specifies one."
   }
   ```

9. **Context auto-inject toggle.** Add VS Code configuration:
   ```json
   "codeatlas.contextAutoInject": {
     "type": "boolean",
     "default": true,
     "description": "Automatically inject CodeAtlas context when launching an agent."
   }
   ```

10. **Context budget setting.** Add VS Code configuration:
    ```json
    "codeatlas.contextBudget": {
      "type": "number",
      "default": 12000,
      "description": "Maximum total tokens for the context package injected into agents."
    }
    ```

11. **Session tracking.** The sidebar shows active sessions with status badges
    (Running/Stopped/Failed). Clicking a session shows its details in the output
    area. The "stop" action sends `stopAgent` to the extension host.

12. **Expand the `VscodeApi` facade.** Add terminal and webview provider
    registration to the injectable interface so the panel is testable headlessly:
    ```typescript
    interface VscodeApi {
      // ... existing
      readonly terminals: {
        createTerminal(options: { name: string; cwd?: string }): VscodeTerminal;
      };
      readonly webview: {
        registerWebviewViewProvider(viewType: string, provider: unknown): VscodeDisposable;
      };
    }
    ```

13. **Fix the broken `ui/nodes.ts` first.** The existing `@atlas/extension`
    cannot compile because `src/ui/nodes.ts` is missing (imported by
    `providers.ts` and `tests/nodes.test.ts`). Create this file to match the
    test contract in `tests/nodes.test.ts` before implementing the webview. This
    is a prerequisite.

14. **Security.** The webview uses a strict CSP (no `eval`, no inline scripts
    from untrusted sources). Context packages pass through the deny filter
    (Task 16). The webview never directly accesses the context database, the
    filesystem, or any `@atlas/*` package — all communication goes through the
    extension host's message handler.

15. **New commands.** Register in `package.json`:
    - `codeatlas.chat.open` — "Atlas: Open Agent Chat"
    - `codeatlas.agent.launch` — "Atlas: Launch Agent"
    - `codeatlas.agent.stop` — "Atlas: Stop Agent"
    - `codeatlas.agent.selectDefault` — "Atlas: Select Default Agent"

## Tests

- Unit: webview message handling (launch, stop, list), slash-command parsing
  (explicit provider, bare text, auto mode), context assembly integration
  (mock `ContextIntegration` + `SessionManager`), panel lifecycle (create,
  dispose, refresh).
- Integration: full launch flow against stubbed `SessionManager` and
  `ContextIntegration` — verify context reaches `buildPackage()`, session is
  created, terminal is spawned. Use a fake `VscodeTerminal` in the injectable
  host.
- No real AI CLIs, no network, no real terminal in tests. Follow
  `docs/TESTING.md` and the existing `apps/extension/tests/` patterns.

## Boundaries — do not

- Do **not** import `@atlas/search`, `@atlas/storage`, `@atlas/summary`, or
  open `.codeatlas/context.db` from the webview panel — go through the SDK.
- Do **not** implement provider-specific logic outside `@atlas/agents` adapters.
- Do **not** build a slash-command router (that is a separate future task for
  the orchestrator TTY).
- Do **not** add AI provider calls, embeddings, or semantic ranking — that is
  the `@atlas/context` stub's future scope.
- Do **not** modify the context database schema or usage database.

## Acceptance criteria

- [ ] `src/ui/nodes.ts` exists and `@atlas/extension` compiles.
- [ ] Webview panel renders with split layout (sidebar + output + input bar).
- [ ] Slash commands (`/claude`, `/gemini`, `/codex`, `/opencode`) launch
      interactive terminals with context injected.
- [ ] Bare text input uses the configured default agent.
- [ ] Context is assembled and rendered automatically before agent launch.
- [ ] Agent stdout/stderr is visible in the output area.
- [ ] Session list with status badges is shown in the sidebar.
- [ ] Default agent, context auto-inject, and budget settings are configurable.
- [ ] `VscodeApi` facade extended; panel is testable headlessly.
- [ ] `pnpm check` passes with the tests above.

---

# Task 28 — Terminal TUI Upgrade (Agent Chat Layout)

> **Status:** [PLANNED] — the existing TUI (`apps/cli/src/tui/`) is functional
> but uses a plain readline loop. This task upgrades it to match the VS Code
> webview's split-panel layout (sidebar + terminal output + input bar) using the
> same rendering approach (no new dependencies).

## Goal

Upgrade the existing `atlas tui` to display a **split-panel layout** that
mirrors the VS Code webview: agent sidebar on the left, terminal output on the
right, input bar at the bottom. Add `/auto` smart-routing support. The TUI
remains a `node:readline` + Unicode box-drawing implementation — no TUI
framework dependencies.

```
┌─ CodeAtlas Agent Chat ──────────────────────────────────────────┐
│  AGENTS          │  Terminal Output                              │
│  ──────────      │                                               │
│  ● claude (run)  │  [agent stdout/stderr appears here]           │
│    gemini        │                                               │
│    codex         │                                               │
│    opencode      │                                               │
│                  │                                               │
│  SESSIONS        │                                               │
│  ──────────      │                                               │
│  #a3f2 Running   │                                               │
│  #b1c9 Stopped   │                                               │
│                  │                                               │
├──────────────────┴───────────────────────────────────────────────┤
│ atlas>                                                           │
└─────────────────────────────────────────────────────────────────┘
```

## Depends on (all implemented — modify existing TUI, do not rebuild)

- **Task 15** — `SessionManager` / `SessionPort` (already injected into the
  TUI as `deps.sessions`).
- **Task 16** — `ContextIntegration` (already injected as `deps.integration`).
- **Task 14** — `@atlas/agents` / `AgentPort` (already injected as
  `deps.agents`).
- **Existing TUI** — `apps/cli/src/tui/shell.ts`, `router.ts`, `render.ts`,
  `io.ts`. Modify and extend; do not rewrite from scratch.

## Requirements

1. **Inspect before coding.** Read `AGENTS.md`, `docs/CURRENT_STATE.md`,
   `docs/CLI.md`, `docs/AGENT_SESSIONS.md`, `docs/AGENT_TOOLKIT.md`,
   `docs/DEPENDENCIES.md`, and the full TUI source (`apps/cli/src/tui/*.ts`)
   plus `apps/cli/tests/tui.test.ts`. Also read the VS Code webview plan
   (Task 27) to understand the shared layout pattern.

2. **Upgrade `render.ts` with split-panel renderers.** Add new pure functions
   that render the two-column layout:
   - `renderSplitLayout(sidebar, terminal, inputPrompt)` — the outer frame with
     Unicode box drawing (`┌─┐│└─┘`).
   - `renderAgentSidebar(agents, activeSessions)` — left column showing agent
     status (installed/running) and session list.
   - `renderTerminalContent(lines)` — right column showing agent output buffer
     (scrollable, capped to terminal height).
   - The existing `renderHeader()`, `renderHelp()`, `renderAgents()`,
     `renderToolkitSidebar()` functions stay — they are used by existing
     commands.

3. **Extend `router.ts` with `/auto` command.** Add to the `TuiCommand`
   discriminated union:
   ```typescript
   | { readonly kind: "auto"; readonly task: string }
   ```
   In `parseCommandLine()`:
   - `/auto <task>` → `{ kind: "auto", task }`.
   - Bare text (no `/` prefix) → `{ kind: "auto", task: trimmed }` (auto-select
     mode by default when no slash command is given).

4. **Add `renderAutoResult()` to `render.ts`.** Show the classification result
   before launching:
   ```
   Task classified as: simple → using gemini
   Reason: medium word count, "fix" keyword
   Context: 8 items, 4.2k tokens, fresh
   ```

5. **Wire `/auto` into `shell.ts` dispatch.** Add a case for `kind === "auto"`
   that:
   - Calls the task classifier (new module — see Task 29) to determine the
     provider.
   - Assembles context via `deps.integration.buildPackage({ task })`.
   - Shows the classification + context info.
   - Launches the agent interactively via the existing `launchAgentInteractive()`.

6. **Show agent sidebar on every prompt.** After each command completes (or on
   `/status`), render a compact agent sidebar showing:
   - Which agents are installed (checkmark) vs not (cross).
   - Which agents have active sessions (running indicator).
   - The configured default agent.

7. **Add `/auto` to help text.** Update `renderHelp()` to include:
   ```
   /auto <task>          Auto-select the best AI agent for the task
   ```
   Also note that bare text (without `/`) is treated as `/auto`.

8. **Default agent setting.** Support a `--default-agent <provider>` CLI flag
   and a `CODEATLAS_DEFAULT_AGENT` environment variable. The TUI shows the
   current default in the header. The user can change it interactively with
   `/default <provider>`.

9. **Add `/default` command to router.** `{ kind: "default"; readonly provider: string }`.
   Changes the in-memory default agent for the current TUI session.

10. **Output buffer.** The right column maintains a scrollable buffer of the
    last N lines (configurable, default 50) of agent output. When an agent is
    launched, its stdout/stderr lines are appended to the buffer. When no agent
    is running, the buffer shows the last command's output.

11. **No new dependencies.** The TUI stays `node:readline` + Unicode box-drawing
    + plain string rendering. No chalk, ora, ink, blessed, or similar.

12. **Terminal handoff preserved.** The existing `io.suspend()` / `io.resume()`
    pattern for interactive AI CLI launches stays unchanged. The split layout is
    shown before and after the handoff; during the handoff the AI CLI owns the
    terminal.

## Tests

- Unit: new render functions (`renderSplitLayout`, `renderAgentSidebar`,
  `renderAutoResult`, `renderTerminalContent`), `/auto` and `/default` command
  parsing, bare-text-as-auto routing.
- Integration: `/auto` dispatch against stubbed dependencies — verify the
  classifier is called, context is assembled, agent is launched. `/default`
  changes the default provider.
- Layout: verify the split-panel renders correctly with various agent/session
  states (all installed, none installed, mixed, active sessions).
- Modify existing `apps/cli/tests/tui.test.ts` — add new test cases, do not
  delete existing ones.

## Boundaries — do not

- Do **not** add a TUI framework dependency (ink, blessed, terminal-kit).
- Do **not** reimplement the session manager, context integration, or agent
  detection — reuse existing injected dependencies.
- Do **not** implement the task classifier in this task (Task 29 owns that);
  for now, `/auto` can default to the configured default agent and show a
  "classifier not yet implemented" message.
- Do **not** modify the VS Code extension (that is Task 27's scope).
- Do **not** break existing TUI commands (`/help`, `/status`, `/scan`, `/search`,
  `/context`, `/agents`, `/toolkit`, `/tools-install`, `/claude`, etc.).

## Acceptance criteria

- [ ] TUI renders a split-panel layout (sidebar + terminal output + input bar).
- [ ] `/auto <task>` command works (even if classifier defaults to default agent).
- [ ] Bare text input is treated as `/auto`.
- [ ] `/default <provider>` changes the session default agent.
- [ ] Agent sidebar shows installed status and active sessions.
- [ ] Output buffer displays agent output after launch.
- [ ] Existing TUI commands still work unchanged.
- [ ] Help text includes `/auto` and `/default`.
- [ ] `pnpm check` passes with the tests above.

---

# Task 29 — Smart Model Routing (TaskClassifier)

> **Status:** [PLANNED] — no code exists. This task creates the deterministic
> task classifier that Tasks 27 (VS Code webview) and 28 (TUI) consume for
> automatic provider selection. It is a pure SDK module with no UI.

## Goal

Create a **rule-based task classifier** that analyzes a user's task description
and recommends the most cost-effective AI provider (Claude / Gemini / Codex /
OpenCode) based on task complexity. Simple tasks route to cheap/fast models;
complex tasks route to powerful/expensive models. The classifier is deterministic,
free, and never calls an LLM.

```
User Task ("fix the login bug")
       ↓
TaskClassifier (pure function)
       ↓
Classification { tier: "simple", recommended: "gemini", reason: "..." }
       ↓
SessionManager.startSession({ provider: "gemini", ... })
```

## Depends on (all implemented — reuse, do not rebuild)

- **Task 14** — `@atlas/agents` adapters. The classifier needs to know which
  providers are available (via `AgentPort.listAgents()` or a static list). It
  does **not** detect installed CLIs — that is the caller's responsibility.
- **Task 18** — Usage/Pricing (`BUILTIN_PRICING`). The classifier uses pricing
  data to rank providers by cost within a tier. It does **not** call the usage
  service.
- **`@atlas/shared`** — `Result` type for error handling.

## Required architecture

```
TaskClassifier (new — @atlas/sdk/agents/task-classifier.ts)
    │
    ├── classifyTask(task, availableProviders, options?)
    │       ↓
    ├── TaskComplexityTier (trivial | simple | complex)
    │       ↓
    ├── ProviderTier (budget | mid | premium)
    │       ↓
    └── TaskClassification { tier, recommended, alternatives, reason }
```

## Requirements

1. **Inspect before coding.** Read `AGENTS.md`, `docs/CURRENT_STATE.md`,
   `docs/AGENT_SESSIONS.md`, `docs/USAGE.md`, `docs/DEPENDENCIES.md`, and the
   source of `@atlas/agents` adapters (`adapters.ts`, `adapter.ts`), the
   pricing table (`packages/usage/src/pricing.ts`), and the SDK's agent
   composition (`packages/sdk/src/agents/index.ts`).

2. **Create `packages/sdk/src/agents/task-classifier.ts`.** A pure module with
   no side effects. Exports:

   ```typescript
   interface TaskClassification {
     readonly tier: "trivial" | "simple" | "complex";
     readonly recommended: string;     // provider id
     readonly alternatives: string[];  // other valid providers, cheapest first
     readonly reason: string;          // human-readable explanation
   }

   function classifyTask(
     task: string,
     availableProviders: readonly string[],
     options?: ClassifyOptions,
   ): TaskClassification;

   interface ClassifyOptions {
     readonly contextTokens?: number;  // estimated context size
     readonly fileCount?: number;      // number of files involved
     readonly defaultProvider?: string; // fallback if no match
   }
   ```

3. **Complexity tiers.** Classify tasks into three tiers:

   | Tier | Description | Examples |
   |------|-------------|----------|
   | `trivial` | Formatting, renaming, single-line, typo fixes, comments | "add semicolon", "rename foo to bar", "fix typo", "add comment" |
   | `simple` | Bug fixes, small feature, file-level changes, validation | "fix login bug", "add input validation", "update README" |
   | `complex` | Architecture, multi-file, security, system design, migration | "refactor auth system", "security audit", "migrate to new API", "redesign database layer" |

4. **Classification heuristics (rule-based).** Use these signals:

   | Signal | Trivial | Simple | Complex |
   |--------|---------|--------|---------|
   | Word count | 1–5 words | 5–15 words | 15+ words |
   | Trivial keywords | rename, format, lint, typo, comment, capitalize, whitespace | — | — |
   | Simple keywords | — | fix, add, update, create, implement, refactor (single), write, remove (single) | — |
   | Complex keywords | — | — | architecture, security, audit, refactor (system), migrate, redesign, multi, entire, database, schema, auth, performance, optimize, scale |
   | File scope mentions | 1 file | 1–3 files | many files, "all", "entire" |
   | Context size (if provided) | <1k tokens | 1k–5k tokens | 5k+ tokens |

   The classifier evaluates each signal, scores the task, and picks the tier
   with the highest aggregate score. Tiebreak: default to `simple`.

5. **Provider tier mapping.** Map providers to cost tiers using a static table
   (derived from `BUILTIN_PRICING`):

   ```typescript
   const PROVIDER_COST_TIERS: Record<string, number> = {
     "deepseek":  0.27,   // budget — cheapest
     "gemini":    1.25,   // mid
     "codex":     2.50,   // mid
     "openai":    2.50,   // mid
     "claude":    3.00,   // premium — most expensive
   };
   ```

   The table is static and matches the adapters in `@atlas/agents`. It is
   **not** the full `BUILTIN_PRICING` (which has per-model detail); it is a
   simplified cost-per-1M-input-tokens lookup for ranking.

6. **Selection algorithm.**
   - Step 1: Classify the task → get target tier.
   - Step 2: Filter `availableProviders` to those installed.
   - Step 3: Map each available provider to its cost tier.
   - Step 4: Pick the cheapest provider in the target tier. If no provider in
     the exact tier, pick the cheapest provider in the next higher tier.
   - Step 5: If no provider matches, fall back to `options.defaultProvider` or
     `"claude"`.
   - Step 6: Return the classification with `alternatives` (other valid
     providers, cheapest first, excluding the recommended one).

7. **Tier-to-provider mapping:**

   | Task Tier | Target Provider Tier | Rationale |
   |-----------|---------------------|-----------|
   | `trivial` | `budget` (deepseek) | Cheap model handles simple renames/formatting |
   | `simple` | `mid` (gemini, codex) | Mid-tier handles bug fixes and small features |
   | `complex` | `premium` (claude) | Best model for architecture and security |

8. **Deterministic output.** Same input always produces the same classification.
   No randomness, no network calls, no LLM calls. The function is pure —
   same arguments → same result.

9. **Export from SDK.** Add `classifyTask` to `packages/sdk/src/agents/index.ts`
   and re-export from `packages/sdk/src/index.ts`. Consumers (CLI TUI, VS Code
   extension) import from `@atlas/sdk`.

10. **Reason string.** The `reason` field explains the classification in plain
    English, e.g.:
    - `"trivial: short task (3 words), 'rename' keyword detected"`
    - `"simple: moderate length, 'fix' keyword, 1 file referenced"`
    - `"complex: long task (18 words), 'architecture' and 'refactor' keywords"`

11. **Do not detect installed CLIs.** The classifier takes
    `availableProviders: readonly string[]` as input. The caller (TUI, VS Code
    extension) is responsible for detecting installed providers via
    `AgentPort.detectAll()` and passing the available list. The classifier does
    not import `@atlas/agents`.

12. **Do not call an LLM.** The classifier is rule-based. Using an LLM to decide
    which LLM to use is circular, costly, and non-deterministic. Simple
    heuristics are sufficient for this tier of routing.

## Tests

- Unit: pure function tests for `classifyTask()`:
  - Trivial tasks: "rename foo to bar", "add semicolon", "fix typo" → `trivial`.
  - Simple tasks: "fix the login bug", "add input validation", "update the
    README" → `simple`.
  - Complex tasks: "refactor the authentication system to use JWT",
    "security audit of the API layer", "migrate the database schema" → `complex`.
  - Edge cases: empty task (→ `simple` default), very long task (→ `complex`),
    task with no keywords (→ `simple` default), task naming a specific provider
    (still classified, but that info is used by the caller).
  - Provider availability: only deepseek available → uses deepseek even for
    complex tasks (graceful degradation).
  - Alternatives: when claude is recommended, alternatives include gemini and
    codex (mid-tier options).
  - Default fallback: no providers match → uses default provider.
- Integration: none needed (pure function). The TUI and VS Code tests in
  Tasks 27/28 cover end-to-end wiring.

## Boundaries — do not

- Do **not** detect installed CLIs (that is `AgentPort`'s job).
- Do **not** call an LLM for classification (rule-based only).
- Do **not** import `@atlas/agents`, `@atlas/providers`, or `@atlas/usage` — the
  classifier lives in `@atlas/sdk` and takes its inputs as arguments.
- Do **not** modify the session manager, context integration, or agent
  detection — this is a pure function only.
- Do **not** build UI (that is Tasks 27 and 28).

## Acceptance criteria

- [ ] `classifyTask()` exists in `packages/sdk/src/agents/task-classifier.ts`.
- [ ] Tasks are classified into `trivial`/`simple`/`complex` tiers.
- [ ] Trivial tasks → cheapest provider, simple → mid-tier, complex → premium.
- [ ] Provider availability is respected (never recommend an unavailable provider).
- [ ] Alternatives are provided, cheapest first.
- [ ] Reason strings are human-readable and explain the classification.
- [ ] Same input always produces the same output (deterministic).
- [ ] No LLM calls, no network, no side effects.
- [ ] Exported from `@atlas/sdk`.
- [ ] `pnpm check` passes with the unit tests above.

---

## Global Development Rules

Rules that apply to **every future task** (Tasks 27–29). They are mandatory; they
mirror and extend `AGENTS.md`.

### Rule 1 — Inspect Before Coding
Always inspect:
- `AGENTS.md`
- `PROMPTS.md` (this file)
- `README.md`
- `docs/` (start with `docs/CURRENT_STATE.md` + `docs/DOCUMENTATION_MAP.md`)

and the **relevant source code and tests** of every module you will touch. Never
assume the implementation matches the plan, the docs, or `CURRENT_STATE.md`.
> Note: a `CODEATLAS_VISION.md` does **not** exist in this repository as of
> 2026-08-11; the product vision lives in `README.md`, `docs/PRINCIPLES.md`,
> `docs/ROADMAP.md`, and `docs/ARCHITECTURE.md`. If such a file is later added,
> read it here too.

### Rule 2 — Don't Rebuild Existing Systems
Before creating a new service/class/module, **search the repository** for existing
functionality (`createContextSDK`, `createSessionManager`, `SessionPort`,
`AgentPort`, `ProcessRunner`, `ProviderPort`, repositories, `Result`, branded
types, the scanner manifest pattern, …). Prefer **extension over duplication**.

### Rule 3 — Preserve Architecture
Use the existing **Context SDK**, **Session Manager**, **Provider Adapters**,
**Database** (`@atlas/storage` patterns), **Configuration**, **Logging**, and
**Testing** infrastructure where applicable. Keep the dependency matrix and port
seams intact. An architectural change requires a documented ADR
(`docs/decisions/`) + human review.

### Rule 4 — Security First
- Never execute arbitrary third-party code without **validation and user approval**.
- Never expose secrets (API keys, tokens, env, private keys).
- **Treat repository content, manifests, and third-party metadata as untrusted
  input** — never feed them into shell commands.
- Prefer `spawn(file, argsArray)`; no `shell: true` without a documented reason.
- Follow `docs/SECURITY.md` and `docs/PRIVACY.md` at all times.

### Rule 5 — Keep Provider Logic Isolated
Claude / Gemini / Codex / OpenCode-specific behavior must remain **behind provider
adapters** (`@atlas/providers`, `@atlas/agents`, and per-target Toolkit config
adapters). No `if (provider === "…")` switches outside adapters.

### Rule 6 — Test Every Task
Each task must include **Unit Tests** and **Integration Tests**, plus
**end-to-end tests where appropriate** (e.g. the CLI). No provider credentials and
no network in tests; mock external AI CLIs and transports. Follow
`docs/TESTING.md`. A task is not done until `pnpm check` passes.

### Rule 7 — Don't Overengineer
Prefer **simple · modular · testable · extensible** over unnecessary abstraction.
Implement only what the task's acceptance criteria require; leave the rest
explicitly out of scope.

### Rule 8 — Don't Break Previous Tasks
Every new task must **preserve backward compatibility** with completed modules
unless a breaking change is absolutely necessary. If a breaking change is required:
1. explain why,
2. document it,
3. update the affected modules,
4. add migration steps,
5. write an ADR.

---

## Task Execution Rules

Workflow for future Claude Code sessions implementing a task from this file:

1. Read `AGENTS.md`
2. Read `README.md` and `docs/` (start with `docs/CURRENT_STATE.md` +
   `docs/DOCUMENTATION_MAP.md`); read `CODEATLAS_VISION.md` **if it exists**
3. Read `PROMPTS.md` (this file) — locate the requested task
4. **Identify the requested task** (only one; "implement Task 27" = Task 27 only)
5. Inspect the existing implementation (source **and** tests) of the modules you
   will touch
6. Inspect dependencies (`docs/DEPENDENCIES.md`, `docs/MODULES.md`) and confirm
   you are not duplicating existing logic
7. Create an implementation plan (write an ADR for architectural changes)
8. **Implement only that task** — small, typed, scoped
9. Run tests (`pnpm test` / the package's tests)
10. Run typecheck/lint/format/build where applicable (`pnpm check`)
11. Review security (`docs/SECURITY.md`, `docs/PRIVACY.md`)
12. Check for duplicated logic (Rule 2)
13. Check backward compatibility (Rule 8)
14. Update documentation (the relevant `docs/`, and `docs/FEATURE_STATUS.md` if
    the status changed)
15. Provide the final implementation report per `docs/DEVELOPMENT_WORKFLOW.md`:
    files changed, what changed, tests run/passed, known limitations, remaining work

> **One task at a time.** Do **not** automatically implement Tasks 27–29 when a
> developer asks for one task. "Implement Task 27" means implement **only
> Task 27** — do not start Task 28 automatically.

---

## Task Dependency Map

```
1–20 (complete)
 │
 ├── 26 Context CLI (`atlas context`) — follow-up wiring to 16 (done)
 │
 ├── Agent Toolkit (complete)
 │       ├── 21 Compatibility Engine   ← depends on 19, 20 (done)
 │       ├── 22 Tool Installer         ← depends on 19–21 (done)
 │       ├── 23 Tool Configurator      ← depends on 19–22 (done)
 │       ├── 24 Security / Trust       ← depends on 19–20 (done)
 │       └── 25 Toolkit CLI            ← depends on 19–24 (done)
 │
 └── Agent Chat UI (new)
         ├── 29 TaskClassifier         ← depends on 14, 18 (done — pure function, no UI)
         ├── 28 TUI Upgrade            ← depends on 15, 16, 27's classifier
         └── 27 VS Code Chat Panel     ← depends on 15, 16, fixes ui/nodes.ts
```

### Dependency details for Tasks 27–29

- **29 (TaskClassifier)** is a pure SDK function with no UI dependencies. It can
  be implemented independently. It depends on the pricing data concept from
  Task 18 and the provider list from Task 14, but only as static data — no
  runtime imports.
- **28 (TUI Upgrade)** modifies the existing TUI in `apps/cli/src/tui/`. It
  depends on Tasks 15 and 16 (already injected into the TUI). It consumes the
  classifier from Task 29 for `/auto` routing.
- **27 (VS Code Chat Panel)** extends `@atlas/extension` with a webview panel.
  It depends on Tasks 15 and 16 (session manager + context integration). It
  requires `src/ui/nodes.ts` to be created first (prerequisite to fix the broken
  build). It consumes the classifier from Task 29 for auto-routing.

### Documented overlaps

- **27 ↔ 28**: Both implement the same UI pattern (sidebar + output + input bar)
  and the same slash-command semantics. The webview (27) uses HTML/CSS/JS; the
  TUI (28) uses Unicode box-drawing. They share no code but follow the same
  message protocol and layout structure.
- **29 → 27, 28**: Both the webview and the TUI consume the classifier for
  `/auto` routing. The classifier is agnostic to the UI layer.
- **27 prerequisite**: `src/ui/nodes.ts` must exist for the extension to compile.
  This is a small fix that should be done before or as part of Task 27.
