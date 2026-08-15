# CodeAtlas Roadmap

Phased plan from the current state (2026-08-09) to the full three-direction
product (Context Engine · Agent Platform · Agent Toolkit). **Status in
brackets** is verified against code — [FEATURE_STATUS.md](./FEATURE_STATUS.md)
is the authoritative tracker.

---

## Task numbering

The 31 tasks below give the stable, non-overlapping number for each item.
Existing phase numbering in this file is preserved where it already exists;
new phases (Agent Toolkit, Quality & Production) extend it.

| # | Task | Phase |
| - | ---- | ----- |
| 1 | Scanner | 1 |
| 2 | Manifest | 1 |
| 3 | File Hashing | 1 |
| 4 | Parser | 1 |
| 5 | Symbol Extraction | 1 |
| 6 | Dependency Graph | 1 |
| 7 | AI Summaries | 2 |
| 8 | Context Database | 2 |
| 9 | Search | 2 |
| 10 | Context API / SDK | 3 |
| 11 | MCP Server | 3 |
| 12 | VS Code Extension | 5 |
| 13 | Documentation / AGENTS.md | — (done) |
| 14 | AI CLI Connection (`@atlas/agents`) | 4 |
| 15 | Agent Session Manager | 4 |
| 16 | Context → Agent Integration | 4 |
| 17 | Multi-Agent Orchestration | 4 |
| 18 | Usage / Credits | 4 |
| 19 | Tool Registry | 6 |
| 20 | Tool Manifest System | 6 |
| 21 | Compatibility Engine | 6 |
| 22 | Tool Installer | 6 |
| 23 | Tool Configurator | 6 |
| 24 | Tool Security / Trust System | 6 |
| 25 | Tool CLI / Slash Commands | 6 |
| 26 | Context CLI | 6 |
| 27 | Tool Benchmarking | 7 |
| 28 | Security Audit | 7 |
| 29 | Full Testing | 7 |
| 30 | Performance Audit | 7 |
| 31 | Final Engineering Audit | 7 |
| 32 | Open Source Release | 7 |

---

## Phase 1 — Repository intelligence *(mostly [IMPLEMENTED])*

Build deterministic understanding of a repository.

- Scanner — **[IMPLEMENTED]**
- Manifest — **[IMPLEMENTED]**
- File hashing / change detection — **[IMPLEMENTED]**
- Parser (TypeScript) — **[PARTIAL]**
- Symbol extraction & indexing — **[IMPLEMENTED]** (gaps: renamed imports, `export default`)
- Dependency graph — **[IMPLEMENTED]**

**Remaining Phase-1 work:**
- Parser: resolve renamed imports and `export default <expr>` cross-file.
- Additional language plugins (Python, Go, etc.) behind `LanguageParser`.

---

## Phase 2 — Persistent context *(partially done)*

Make the index persistent and queryable.

- Context DB (`ContextStore`) — **[IMPLEMENTED]**
- Search (`searchContext` + `@atlas/search`) — **[IMPLEMENTED]** — ranked
  in-memory search over symbols/files/modules/dependencies/summaries with fuzzy
  matching; vector search planned behind the `RelevanceScorer` seam
- **Context ranking & assembly** (`@atlas/context`) — **[STUB] — implement**
- Hash-backed incremental updates wired into the SDK-owned `build`/`update`
  pipeline — **[IMPLEMENTED]**
- AI summaries — **[IMPLEMENTED]** (fold into persistence)

---

## Phase 3 — AI integration *(partially done)*

- Providers adapters — **[IMPLEMENTED]** (add streaming, real default models)
- **MCP server** exposing context (search/symbols) — **[IMPLEMENTED]** — `@atlas/mcp`, stdio server + 7 tools; runnable via `atlas mcp` and the `codeatlas-mcp` binary (see [MCP.md](./MCP.md)); follow-ups: MCP resources/prompts
- **SDK** (Container + `createContextSDK`) — **[IMPLEMENTED]** — documented as the programmatic API / plugin seam; publishing to the npm registry is a future step
- Provider expansion: Ollama, others — **[PLANNED]**

---

## Phase 4 — Unified AI CLI *(partially started — Direction B)*

Launch and supervise existing AI coding CLIs. See
[AGENT_ORCHESTRATOR.md](./AGENT_ORCHESTRATOR.md).

- AI CLI connection layer (`@atlas/agents`, `AgentPort`) — **[IMPLEMENTED]**
  (adapters, executable detection, supervised process runs; composed into the
  SDK for sessions — `createSessionManager`)
- **Agent Session Manager** (`SessionManager` behind `SessionPort`,
  `atlas sessions list/info/stop`) — **[IMPLEMENTED]** (Task 15; see
  [AGENT_SESSIONS.md](./AGENT_SESSIONS.md))
- Process management for long-running sessions (`ProcessRunner.launch()` →
  supervised `RunningProcess`, SIGTERM→SIGKILL) — **[IMPLEMENTED]**
- Agent discovery (`atlas doctor` / `atlas agents`) — **[PLANNED]** (`atlas
  doctor` reports detected agents; a `/agents` discovery surface exists in the
  v2 TUI)
- Agent router + adapters wired (`/claude`, `/gemini`, `/codex`, `/opencode`, `/deepseek`) — **[PARTIAL]** (the v2 `atlas tui` slash surface launches/installs these; the standalone CLI/editor router stays planned)
- Interactive terminal / TTY session handling — **[IMPLEMENTED]**
  (`SessionLaunchRequest.interactive`, `stdio: "inherit"` terminal handoff;
  the v2 TUI suspended/reclaimed the terminal)
- Context → agent integration (`createContextIntegration`, context packages
  delivered through `SessionPort`) — **[IMPLEMENTED]** (Task 16; ADR-008)
- Multi-agent orchestration (`createOrchestrator`, plan builder + executor +
  result combining through `SessionPort`) — **[IMPLEMENTED]** (Task 17)
- Router / slash commands wired to the orchestrator — **[PLANNED]**
- Usage / credits (`@atlas/usage`, tri-state tokens/cost, budgets/limits,
  `atlas usage`) — **[IMPLEMENTED]** (see [USAGE.md](./USAGE.md), ADR-009)
- Security hardening per [SECURITY.md](./SECURITY.md) — **[PLANNED]**

---

## Phase 5 — Developer integrations *(planned)*

- **[IMPLEMENTED]** VS Code extension (`@atlas/extension`, consumes the SDK)
- **[PLANNED]** JetBrains plugin
- Additional editor/agent integrations
- VS Code follow-ups: publish vsix + marketplace; improve indexing progress and
  language coverage

---

## Phase 6 — Agent Toolkit *(in progress — Direction C)*

Curated, verified ecosystem of open-source developer / AI-agent tools:
discover, install, configure, verify. The Tool Registry (**Task 19**), Tool
Manifest System (**Task 20**), **Compatibility Engine (Task 21)**, **Tool
Installer (Task 22)**, **Tool Configurator (Task 23)**, and **Security/Trust
(Task 24)** are
**[IMPLEMENTED]** — see
[AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md) for the design contract,
[TOOL_REGISTRY.md](./TOOL_REGISTRY.md), and [TOOL_MANIFEST.md](./TOOL_MANIFEST.md).

The Toolkit CLI is **[IMPLEMENTED]**; the future slash-command and setup
surfaces remain **[PLANNED]**.

1. **Tool Registry** — **[IMPLEMENTED]** authoritative catalog (metadata,
   categories, versions, licenses, repos, install methods, compatibility,
   configuration, security/trust status).
2. **Tool Manifest System** — **[IMPLEMENTED]** versioned/validated/extensible
   per-installed-tool state in `.codeatlas/tools/`.
3. **Compatibility Engine** — **[IMPLEMENTED]** evaluates declared requirements
   (OS, architecture, runtime version ranges, package-manager, AI CLI via
   `AgentPort`, MCP, permissions) against the detected environment; fail-closed
   verdicts (`incompatible` ⇒ not installable, `unknown` flagged never
   guessed); offline + read-only; `createCompatibilityEngine()` in the SDK.
4. **Tool Installer** — **[IMPLEMENTED]** `InstallerPort` + safe MVP
   per-ecosystem adapters (npm/pip/cargo/go); approval-gated argument-array
   execution, verification, provenance, and rollback.
5. **Tool Configurator** — **[IMPLEMENTED]** `ConfiguratorPort` + per-target
   adapters (Claude/Gemini/Codex/OpenCode/MCP/VS Code), AgentPort-backed
   detection, safe user-config merge/backup/rollback/verification, dry-run,
   SDK composition, and `atlas tools configure`.
6. **Tool Security / Trust System** — security status + trust hierarchy
   (`verified`/`reviewed`/`community`/`unverified`/`blocked`) and the approval
   gate.
7. **Tool CLI / Slash Commands** — **[IMPLEMENTED]** SDK-backed `atlas tools`
   overview/search/info/install/remove/update/configure/doctor with text/JSON
   output and explicit install approval. `/tools` and `atlas setup` remain
   planned.
8. **Context CLI** — **[IMPLEMENTED]** `atlas context` delegates to the Task 16
   Context Integration for build/explain/JSON/launch/attach. The future slash
   router remains planned.

**MVP scope for the Toolkit** (what ships in Phase 6's first increment): Tool
Registry, Tool Manifest, Tool Discovery, Tool Compatibility, Basic Tool
Installation, Basic Tool Configuration.

**Deliberately NOT in MVP:** automatic recommendations, advanced benchmarking,
automatic token optimization, automatic hallucination detection, automatic
tool selection, a full ecosystem marketplace, billing, and AI-powered tool
recommendations from context signals. Those belong to later phases.

---

## Phase 7 — Quality & Production *(planned)*

- **Tool Benchmarking** — measure without-tool vs with-tool (token usage,
  context size, latency, task success, error rate, repeated reads, tool calls,
  agent cost); keep vendor claims separate from CodeAtlas benchmarks; precise
  language only (no "eliminates hallucinations").
- Security audit
- Full testing
- Performance audit
- Final engineering audit
- Open source release

---

## Guiding principle across phases

- **Deterministic before AI** — Phases 1–2 are offline and AI-independent.
- **Local First / AI Optional / Provider Agnostic** ([PRINCIPLES.md](./PRINCIPLES.md)).
- **Orchestrate, don't recreate** — CodeAtlas wraps existing AI CLIs and
  open-source tools; it never forks/bundles them, and never executes
  third-party install scripts blindly.
- **Users stay in control** — automatic installation is opt-in; security/trust
  status is shown before every install.
- Each phase ships **tested** increments behind the existing ports; no phase
  requires rewriting a finished earlier phase.
