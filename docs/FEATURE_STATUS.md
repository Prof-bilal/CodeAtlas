# CodeAtlas Feature Status

Single source of truth for what each feature is — **verified against the code**
(see [CURRENT_STATE.md](./CURRENT_STATE.md), last audit 2026-08-11).

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
| Usage & Credits (`@atlas/usage`, `UsagePort`) | **[IMPLEMENTED]** | Tri-state actual/estimated/unknown provenance for tokens/cost/latency/price (never guessed); `PricingSource` abstraction (built-in estimated `StaticPricingSource`); `UsageStore` on `.codeatlas/usage.db` (`node:sqlite`, separate from the context DB); `withUsageTracking`/`trackAgentRun` collection seams with opt-in token estimation; soft budgets + fail-safe hard limits; SDK `createUsageService`; CLI `atlas usage` (summary/list/budgets). ADR-009. See docs/USAGE.md |
| CLI | **[PARTIAL]** | `search`, `mcp`, `sessions`, `usage`, all `tools` commands, and `context` are wired through SDK seams; `init`/`build`/`update`/`explain`/`doctor` still print "Coming Soon" |
| Unified AI CLI (`/claude`, `/gemini`, `/codex`, `/opencode`, `/deepseek`) | **[PLANNED]** | No router/slash commands — see AGENT_ORCHESTRATOR.md |
| AI CLI Connection layer (`@atlas/agents`, `AgentPort`) | **[IMPLEMENTED]** | Per-CLI adapters, executable detection, supervised one-shot runs + `ProcessRunner.launch()` for supervised long-running processes — behind `AgentPort`/`SessionPort` in `core`; composed by the SDK for sessions (`createSessionManager`), not yet wired for the router/slash commands |
| Agent Session Manager (`SessionPort`) | **[IMPLEMENTED]** | In-memory manager in `@atlas/agents` (`SessionManager`); `createSessionManager()` from the SDK; `atlas sessions list/info/stop`; independent concurrent sessions, graceful stop/terminate, shutdown, terminal-session pruning (no DB). Sessions launched with `captureOutput: true` have their bounded stdout/stderr captured and readable via `getSessionOutput` even after exit. See docs/AGENT_SESSIONS.md |
| Context → Agent integration (`context-integration`) | **[IMPLEMENTED]** | `createContextIntegration()` in `@atlas/sdk`: assembles a provider-independent, serializable `ContextPackage` per task with budget enforcement, secret deny-filter, and honest staleness; `buildPackage`/`explain`/`launch`/`attach` deliver through `SessionPort`. `atlas context` exposes build, `--explain`, `--json`, launch, attach, budget, and include/exclude flags. ADR-008 |
| Agent Router / Orchestrator | **[PARTIAL]** | The **plan-executing orchestrator** is implemented in `@atlas/sdk` — `createOrchestrator({ sessions, integration })`: bounded explicit role plans (`buildPlan`, `reviewPlan`, up to 8 roles, parallel/sequential), execution through `SessionPort` (per-role timeouts, retries for retryable launch failures only, user cancellation, one-failure-cancels-the-rest, isolated context scopes, `captureOutput` on every launch), and deterministic attributed combining with conflict detection (`combineResults`/`detectConflicts`/`renderCombinedReport`). The **router and slash commands** (`atlas /claude`, …) and interactive TTY handling remain **[PLANNED]** (build on `@atlas/agents`) |
| Agent sessions / interactive terminal handling | **[PLANNED]** | Session *lifecycle* ships (see Agent Session Manager); interactive TTY attachment/output streaming for sessions does not; part of the Orchestrator (Direction B) |
| CLI Agents (`atlas agents`, `/agent` commands) | **[PLANNED]** | No code — see AGENT_ORCHESTRATOR.md + docs/CLI.md |
| MCP | **[IMPLEMENTED]** | `@atlas/mcp`: stdio server (official `@modelcontextprotocol/sdk`) exposing 6 tools that read through the **Context SDK** (`createContextSDK` sub-APIs) — deterministic search/deps/explain/overview, opt-in AI summary generation; `codeatlas-mcp` binary **and** `atlas mcp` CLI command; tools only (no resources/prompts) |
| VS Code integration | **[IMPLEMENTED]** | `@atlas/extension` (in `apps/extension`): Activity Bar + 5 tree views (project/symbols/modules/summaries/dependencies), `codeatlas.*` palette commands, status-bar indicator; reads only through the Context SDK (`createContextSDK`); `atlas build`/`update` shell out to the CLI, which remain intentionally unavailable |
| JetBrains / other editor integrations | **[PLANNED]** | No code |
| Agent Toolkit subsystem (`@atlas/toolkit`) | **[PARTIAL]** | Tasks 19–25 implemented: Registry, Tool Manifest, Compatibility Engine, Tool Installer, Tool Configurator, Security/Trust, and the thin SDK-backed Toolkit CLI; `/tools` slash integration and `atlas setup` remain planned |
| Tool Registry | **[IMPLEMENTED]** | `@atlas/toolkit` behind `ToolRegistryPort` in `core`, composed via `createToolRegistry()` in `@atlas/sdk`: curated, schema-validated, provenance-auditable catalog (`packages/toolkit/src/catalog.json`) + local overlay merged by name (user wins, catalog never mutated); per-field provenance (curated/external/user/unknown — external never trusted blindly); extensible categories; fail-loud validation; install/compat/config/security fields declared and evaluated by Tasks 21–24. See docs/TOOL_REGISTRY.md |
| Tool Manifest System | **[IMPLEMENTED]** | `@atlas/toolkit` (`manifest-schema.ts` + `manifest.ts`): versioned (`TOOL_MANIFEST_SCHEMA_VERSION=1`), validated (load + before write, every problem listed), extensible (unknown fields preserved) per-installed-tool state; `.codeatlas/tools/<name>.json` (Scanner manifest merge policy); declares all 7 install ecosystems, executes nothing; untrusted-input safe (typed errors, `__proto__` inert, 1 MiB bound, path-safe names); manifest persistence remains toolkit-internal while higher-level services are SDK-composed. See docs/TOOL_MANIFEST.md |
| Tool Discovery (`atlas tools` search/list) | **[IMPLEMENTED]** | SDK-backed `atlas tools` overview and registry search with text/JSON output |
| Tool Compatibility Engine | **[IMPLEMENTED]** | `@atlas/toolkit` (`compatibility.service.ts` + `environment.ts` + `version-range.ts` + `render.ts`) behind `CompatibilityPort` in `core`, composed via `createCompatibilityEngine()` in `@atlas/sdk` (Task 21): evaluates a tool's declared requirements (OS/architecture/runtimes/package manager/AI CLIs via `AgentPort`/MCP/permissions) against the detected environment and returns one of four states with per-check evidence; `incompatible` ⇒ not installable here (**never fails open**), `unknown` flagged never guessed; offline + read-only, never installs. See docs/AGENT_TOOLKIT.md §6 |
| Tool Installer (`InstallerPort` + adapters) | **[IMPLEMENTED]** | `@atlas/toolkit` behind `InstallerPort` in `core`, composed via `createInstaller()` and `createToolkitSDK()` in `@atlas/sdk`: safe MVP subset, approval-gated argument-array spawns, verification, Tool Manifest provenance, rollback, and CLI rendering of trust/plan before `--yes` execution |
| Tool Configurator | **[IMPLEMENTED]** | `ConfiguratorPort` + Claude/Gemini/Codex/OpenCode/MCP/VS Code adapters; AgentPort-backed installed-target detection; safe merge, backup, rollback, verification, dry-run; SDK `createConfigurator`; `atlas tools configure` |
| Tool Security / Trust System | **[IMPLEMENTED]** | `SecurityPort` + `SecurityAssessor` perform offline license/source/dependency/command/permission/maintainer/provenance/repository checks, produce per-check verdicts and risk, map only documented reviews to `reviewed`/`verified`, default to `unverified`, reject hostile metadata, and hard-gate installation. `blocked` cannot be overridden |
| Tool CLI / Slash Commands (`atlas tools`, `/tools`, `atlas setup`) | **[PARTIAL]** | `atlas tools` overview/search/info/install/remove/update/configure/doctor are SDK-backed; future `/tools` slash command and `atlas setup` remain planned |
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
- CLI: `atlas search`, `atlas mcp`, `atlas sessions`, `atlas usage`, all
  `atlas tools` commands, and `atlas context` are wired; `init`/`build`/`update`/
  `explain`/`doctor` remain stubs.
- `@atlas/agents`: implements `AgentPort` (+`SessionPort` session manager with
  `captureOutput`/`getSessionOutput`); the SDK composes it for sessions
  (`createSessionManager`) and for the multi-agent orchestrator
  (`createOrchestrator`, which drives `SessionPort`), but the **router and
  slash commands** (`atlas /claude`, …) and interactive TTY handling are absent.
- Agent Toolkit: **registry (Task 19), Tool Manifest (Task 20), Compatibility
  Engine (Task 21), Installer (Task 22), Configurator (Task 23), Security/Trust
  (Task 24), and the SDK-backed CLI (Task 25)** are
  implemented — `@atlas/toolkit` behind `ToolRegistryPort`, `CompatibilityPort`,
  and `InstallerPort` in `core`; SDK `createToolRegistry`,
  `createCompatibilityEngine()`, and `createInstaller()`; shipped catalog +
  local overlay, per-field provenance, extensible categories. The Installer
  ships a safe MVP subset (`npm`/`pip`/`cargo`/`go`), requires approval, spawns
  argument arrays only, verifies + records Tool Manifest provenance, and rolls
  back best-effort. The `/tools` slash surface and automatic setup remain
  planned — see `docs/TOOL_REGISTRY.md`.
- Vector search: embeddings are planned; `@atlas/search` exposes the
  `RelevanceScorer` seam so an embedding scorer can be added without callers
  changing.
- `@atlas/context`: ranking/assembly intentionally unimplemented.
- Context SDK consumers: `atlas search` and the MCP handlers use
  `createContextSDK`; the indexing pipeline (`build`/`update`) still drives the
  `Container` directly and should migrate to the SDK write APIs.
