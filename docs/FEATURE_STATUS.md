# CodeAtlas Feature Status

Single source of truth for what each feature is — **verified against the code**
(see [CURRENT_STATE.md](./CURRENT_STATE.md), last audit 2026-08-09).

---

## Status tags

- **[IMPLEMENTED]** — production code exists, tested, and considered complete
  for its current scope.
- **[PARTIAL]** — real implementation with known gaps.
- **[EXPERIMENTAL]** — works but unstable / API may change.
- **[PLANNED]** — documented goal; no code.
- **[DEPRECATED]** — exists but scheduled for removal/replacement.

---

## Feature status table

| Feature | Status | Notes |
| ------- | ------ | ----- |
| Foundation (`shared`, `core`) | **[IMPLEMENTED]** | Entities, ports, `Result`, branded types |
| Scanner | **[IMPLEMENTED]** | Recursive walk, ignore rules, metadata, `readFile` |
| Manifest | **[IMPLEMENTED]** | `.codeatlas/manifest.json`, merge policy (in `@atlas/scanner`) |
| File Hashing | **[IMPLEMENTED]** | SHA-256, change detection, snapshots |
| Parser | **[PARTIAL]** | TypeScript via `ts-morph`; plugin registry ready; other languages = PLANNED |
| Symbols (extraction + indexing) | **[IMPLEMENTED]** | `SymbolIndexer`, cross-file resolution; **gaps:** renamed imports + `export default <expr>` don't resolve cross-file |
| Dependency Graph | **[IMPLEMENTED]** | Build, shortest path, cycles, JSON export |
| AI Summaries | **[IMPLEMENTED]** | File/folder/module/project, content-hash cache |
| Context DB | **[IMPLEMENTED]** | `ContextStore` (SQLite, 8 tables, migrations, transactions) |
| Search | **[IMPLEMENTED]** | `@atlas/search` builds a ranked in-memory index (symbols, files, modules, **dependencies**, summaries) with fuzzy matching behind a vector-ready scorer seam (no embeddings yet); `searchContext` still provides the DB-level LIKE fallback |
| Context ranking & assembly (`@atlas/context`) | **[STUB]** | Both methods throw `ComingSoonError` — intentional |
| Context API / SDK (`createContextSDK`) | **[IMPLEMENTED]** | Read-first façade in `@atlas/sdk`: files/symbols/dependencies/modules/summaries/search/project sub-APIs, typed errors, `status()`, deterministic `getRelevantContext()`, split read/write edge; DB hidden behind repositories (see `docs/CONTEXT_SDK.md`, ADR-005) |
| CLI | **[PARTIAL]** | `search` routes through the Context SDK and `mcp` starts the MCP server; `init`/`build`/`update`/`explain`/`doctor` still print "Coming Soon" |
| Unified AI CLI (`/claude`, `/gemini`, `/codex`, `/opencode`, `/deepseek`) | **[PLANNED]** | No router/slash commands — see AGENT_ORCHESTRATOR.md |
| AI CLI Connection layer (`@atlas/agents`, `AgentPort`) | **[IMPLEMENTED]** | Per-CLI adapters, executable detection, supervised one-shot runs + `ProcessRunner.launch()` for supervised long-running processes — behind `AgentPort`/`SessionPort` in `core`; composed by the SDK for sessions (`createSessionManager`), not yet wired for the router/slash commands |
| Agent Session Manager (`SessionPort`) | **[IMPLEMENTED]** | In-memory manager in `@atlas/agents` (`SessionManager`); `createSessionManager()` from the SDK; `atlas sessions list/info/stop`; independent concurrent sessions, graceful stop/terminate, shutdown, terminal-session pruning (no DB). Sessions launched with `captureOutput: true` have their bounded stdout/stderr captured and readable via `getSessionOutput` even after exit. See docs/AGENT_SESSIONS.md |
| Context → Agent integration (`context-integration`) | **[IMPLEMENTED]** | `createContextIntegration()` in `@atlas/sdk`: assembles a provider-independent, serializable `ContextPackage` per task (ranked file/symbol/summary/dependency items + project overview + instructions, each with score+reason), budget enforcement (items/tokens, truncation recorded), secret deny-filter with exclusion record, honest staleness signal (`ContextSDK.hashes()` vs working tree); `buildPackage`/`explain`/`launch`/`attach` deliver packages through the existing `SessionPort` — `launch` seeds a new session's prompt, `attach` starts a `CREATED` session and reports a typed `ContextAttachUnsupportedError` for live/terminal sessions. ADR-008. No CLI wiring yet (follow-up) |
| Agent Router / Orchestrator | **[PARTIAL]** | The **plan-executing orchestrator** is implemented in `@atlas/sdk` — `createOrchestrator({ sessions, integration })`: bounded explicit role plans (`buildPlan`, `reviewPlan`, up to 8 roles, parallel/sequential), execution through `SessionPort` (per-role timeouts, retries for retryable launch failures only, user cancellation, one-failure-cancels-the-rest, isolated context scopes, `captureOutput` on every launch), and deterministic attributed combining with conflict detection (`combineResults`/`detectConflicts`/`renderCombinedReport`). The **router and slash commands** (`atlas /claude`, …) and interactive TTY handling remain **[PLANNED]** (build on `@atlas/agents`) |
| Agent sessions / interactive terminal handling | **[PLANNED]** | Session *lifecycle* ships (see Agent Session Manager); interactive TTY attachment/output streaming for sessions does not; part of the Orchestrator (Direction B) |
| CLI Agents (`atlas agents`, `/agent` commands) | **[PLANNED]** | No code — see AGENT_ORCHESTRATOR.md + docs/CLI.md |
| MCP | **[IMPLEMENTED]** | `@atlas/mcp`: stdio server (official `@modelcontextprotocol/sdk`) exposing 6 tools that read through the **Context SDK** (`createContextSDK` sub-APIs) — deterministic search/deps/explain/overview, opt-in AI summary generation; `codeatlas-mcp` binary **and** `atlas mcp` CLI command; tools only (no resources/prompts) |
| VS Code integration | **[IMPLEMENTED]** | `@atlas/extension` (in `apps/extension`): Activity Bar + 5 tree views (project/symbols/modules/summaries/dependencies), `codeatlas.*` palette commands, status-bar indicator; reads only through the Context SDK (`createContextSDK`); `atlas build`/`update` shell out to the CLI (pipeline still "Coming Soon" — see `docs/VSCODE.md`) |
| JetBrains / other editor integrations | **[PLANNED]** | No code |
| Agent Toolkit subsystem (`@atlas/toolkit`) | **[PLANNED]** | No code — see AGENT_TOOLKIT.md |
| Tool Registry | **[PLANNED]** | No code — authoritative curated catalog (in `@atlas/toolkit`) |
| Tool Manifest System | **[PLANNED]** | No code — per-installed-tool state in `.codeatlas/` |
| Tool Discovery (`atlas tools` search/list) | **[PLANNED]** | No code |
| Tool Compatibility Engine | **[PLANNED]** | No code |
| Tool Installer (`atlas tools install/remove/update`) | **[PLANNED]** | No code — `InstallerPort` + per-ecosystem adapters; no blind install scripts |
| Tool Configurator | **[PLANNED]** | No code — `ConfiguratorPort` + per-target adapters |
| Tool Security / Trust System | **[PLANNED]** | No code — `verified`/`reviewed`/`community`/`unverified`/`blocked` |
| Tool CLI / Slash Commands (`atlas tools`, `/tools`, `atlas setup`) | **[PLANNED]** | No code |
| Tool Benchmarking | **[PLANNED]** | Future subsystem; out of MVP |
| Tool Recommendation Engine | **[PLANNED]** | Future; separate from Registry; out of MVP |

> **Never mark something implemented without checking the code.** If you are
> about to update this table, re-verify the module (status lives in
> CURRENT_STATE.md + tests) first.

---

## Known gaps worth tracking

- Parser/graph: renamed imports & `export default <expr>` cross-file resolution.
- Providers: placeholder default model ids; no streaming.
- Storage: engine `>=22.5.0` vs monorepo `>=20.19.0` (node:sqlite).
- CLI: `atlas search` and `atlas mcp` are wired; `init`/`build`/`update`/
  `explain`/`doctor` remain stubs.
- `@atlas/agents`: implements `AgentPort` (+`SessionPort` session manager with
  `captureOutput`/`getSessionOutput`); the SDK composes it for sessions
  (`createSessionManager`) and for the multi-agent orchestrator
  (`createOrchestrator`, which drives `SessionPort`), but the **router and
  slash commands** (`atlas /claude`, …) and interactive TTY handling are absent.
- Agent Toolkit: entirely planned — see `docs/AGENT_TOOLKIT.md`.
- Vector search: embeddings are planned; `@atlas/search` exposes the
  `RelevanceScorer` seam so an embedding scorer can be added without callers
  changing.
- `@atlas/context`: ranking/assembly intentionally unimplemented.
- Context SDK consumers: `atlas search` and the MCP handlers use
  `createContextSDK`; the indexing pipeline (`build`/`update`) still drives the
  `Container` directly and should migrate to the SDK write APIs.