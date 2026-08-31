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
| Symbols (extraction + indexing) | **[IMPLEMENTED]** | `SymbolIndexer`, cross-file resolution; renamed + default imports resolve cross-file; namespaces/bare expressions not extracted |
| Dependency Graph | **[IMPLEMENTED]** | Build, shortest path, cycles, JSON export |
| AI Summaries | **[IMPLEMENTED]** | File/folder/module/project, content-hash cache; on-demand (`search --ai`, `explain --ai`, MCP `get_summary`) and bulk backfill during indexing (`init`/`build`/`update --summaries`, persisted to the `Summaries` table) |
| Context DB | **[IMPLEMENTED]** | `ContextStore` (SQLite, 8 tables, migrations, transactions) |
| Search | **[IMPLEMENTED]** | `@atlas/search` builds a ranked in-memory index (symbols, files, modules, **dependencies**, summaries) with fuzzy matching behind a vector-ready scorer seam (no embeddings yet); `searchContext` still provides the DB-level LIKE fallback |
| Context ranking & assembly (`@atlas/context`) | **[IMPLEMENTED]** | `ContextBuilderService` ranks search hits and resolves them to source-file `ContextItem`s (`build`/`sourceFile`) behind `ContextBuilderPort` in `core`, composed into the SDK container; deterministic, no AI. See ADR-001 |
| Context API / SDK (`createContextSDK`) | **[IMPLEMENTED]** | Read-first façade in `@atlas/sdk`: files/symbols/dependencies/modules/summaries/search/project sub-APIs, typed errors, `status()`, deterministic `getRelevantContext()`, split read/write edge; DB hidden behind repositories (see `docs/CONTEXT_SDK.md`, ADR-005) |
| Usage & Credits (`@atlas/usage`, `UsagePort`) | **[IMPLEMENTED]** | Tri-state actual/estimated/unknown provenance for tokens/cost/latency/price (never guessed); `PricingSource` abstraction (built-in estimated `StaticPricingSource`); `UsageStore` on `.codeatlas/usage.db` (`node:sqlite`, separate from the context DB); `withUsageTracking`/`trackAgentRun` collection seams with opt-in token estimation; soft budgets + fail-safe hard limits; SDK `createUsageService`; CLI `atlas usage` (summary/list/budgets). ADR-009. See docs/USAGE.md |
| CLI | **[IMPLEMENTED]** | `init`/`build`/`update` (incl. opt-in `--summaries` AI backfill), `search`, `mcp`, `sessions`, `usage`, all `tools` commands, `context`, `explain`, and `doctor` are wired through SDK seams; bare `atlas` prints help; the interactive **`atlas tui`** is **v2 / not shipped** (source untracked) |
| Unified AI CLI (`/claude`, `/gemini`, `/codex`, `/opencode`, `/deepseek`) | **[PARTIAL]** | The **`atlas tui`** slash-command surface (`/claude`, `/gemini`, `/codex`, `/opencode` detect + interactive launch + Toolkit install fallback; `/cursor`, `/grok` vendor guidance) is **v2 / not shipped** (source untracked). The plan-executing **orchestrator router** (Direction B) remains **[PLANNED]** |
| AI CLI Connection layer (`@atlas/agents`, `AgentPort`) | **[IMPLEMENTED]** | Per-CLI adapters, executable detection, supervised one-shot runs + `ProcessRunner.launch()` for supervised long-running processes — behind `AgentPort`/`SessionPort` in `core`; composed by the SDK for sessions (`createSessionManager`) and wired through the CLI for standalone launches (`atlas claude`/`gemini`/`codex`/`opencode` `<prompt...>`); not yet wired for the interactive slash router |
| Agent Session Manager (`SessionPort`) | **[IMPLEMENTED]** | In-memory manager in `@atlas/agents` (`SessionManager`); `createSessionManager()` from the SDK; `atlas sessions list/info/stop`; independent concurrent sessions, graceful stop/terminate, shutdown, terminal-session pruning (no DB). Sessions launched with `captureOutput: true` have their bounded stdout/stderr captured and readable via `getSessionOutput` even after exit. See docs/AGENT_SESSIONS.md |
| Context → Agent integration (`context-integration`) | **[IMPLEMENTED]** | `createContextIntegration()` in `@atlas/sdk`: assembles a provider-independent, serializable `ContextPackage` per task with budget enforcement, secret deny-filter, and honest staleness; `buildPackage`/`explain`/`launch`/`attach` deliver through `SessionPort`, and `brief()` adds a provider-backed `ContextBriefing` (content-hash cached, clean `fail` without a provider). Includes the **deterministic repository digest** (P7.1–P7.2, small-model intelligence): architecture map, entry points, module structure, test/naming conventions, key exports, and circular dependencies, generated by the indexer (`kind: "digest"` in the `Summaries` table) and included in every package after instructions (Supporting tier, never budget-dropped); read via `ContextSDK.summaries.getDigest()`. `atlas context` exposes build (default subcommand), `explain`, `json`, `--ai` briefing (build/launch/attach), launch, attach, budget, and include/exclude flags. ADR-008 |
| Agent Router / Orchestrator | **[PARTIAL]** | The **plan-executing orchestrator** is implemented in `@atlas/sdk` — `createOrchestrator({ sessions, integration })`: bounded explicit role plans (`buildPlan`, `reviewPlan`, up to 8 roles, parallel/sequential), execution through `SessionPort` (per-role timeouts, retries for retryable launch failures only, user cancellation, one-failure-cancels-the-rest, isolated context scopes, `captureOutput` on every launch), and deterministic attributed combining with conflict detection (`combineResults`/`detectConflicts`/`renderCombinedReport`). The **router and slash commands** (`atlas /claude`, …) and interactive TTY handling remain **[PLANNED]** (build on `@atlas/agents`) |
| Agent sessions / interactive terminal handling | **[IMPLEMENTED]** | `SessionLaunchRequest.interactive` launches a session with `stdio: "inherit"` and **no** non-interactive run-mode flags — a real terminal handoff to the agent CLI (interactive wins over `captureOutput`); the v2 TUI used to suspend readline and reclaim the terminal. Non-interactive output streaming stays on `captureOutput`/`getSessionOutput`. Plan-level orchestration remains part of Direction B |
| CLI Agents (`atlas agents`, `/agent` commands) | **[PARTIAL]** | **`atlas agents status`/`connect` are implemented** (SDK-backed, `--target`/`--config-home`/`--dry-run`): registers the CodeAtlas MCP server per agent into the correct config file and shape (Claude `~/.claude.json`, Gemini `~/.gemini/settings.json`, Codex `~/.codex/config.toml` via surgical TOML merge, OpenCode `~/.config/opencode/opencode.jsonc`, Cursor/Cline) and **live-verified** with each agent's own CLI (`claude mcp list`, `gemini mcp list`, `opencode mcp list`, `codex mcp list`). Agent discovery/launch is additionally reachable via `atlas context launch`/`attach` and the standalone `atlas claude`/`gemini`/`codex`/`opencode` `<prompt...>` launch commands. The `atlas tui` slash surface (`/agents`, `/claude` … `/opencode`, `/cursor`, `/grok`) is **v2 / not shipped**. See docs/CLI.md |
| MCP | **[IMPLEMENTED]** | `@atlas/mcp`: stdio server (official `@modelcontextprotocol/sdk`) exposing 7 tools that read through the **Context SDK** (`createContextSDK` sub-APIs) — deterministic search/deps/explain/overview/read-range, opt-in AI summary generation; every tool declares an `outputSchema` and auto-refreshes the index incrementally before reads; `codeatlas-mcp` binary **and** `atlas mcp` CLI command; tools only (no resources/prompts) |
| VS Code integration | **[IMPLEMENTED]** | `@atlas/extension` (in `apps/extension`): Activity Bar + 5 tree views (project/symbols/modules/summaries/dependencies), `codeatlas.*` palette commands, status-bar indicator; reads only through the Context SDK (`createContextSDK`); `atlas build`/`update` shell out to the working CLI indexer; read-only context viewer |
| JetBrains / other editor integrations | **[PLANNED]** | No code |
| Agent Toolkit subsystem (`@atlas/toolkit`) | **[PARTIAL]** | Tasks 19–25 implemented: Registry, Tool Manifest, Compatibility Engine, Tool Installer, Tool Configurator, Security/Trust, and the thin SDK-backed Toolkit CLI; `/tools` slash integration and `atlas setup` remain planned |
| Tool Registry | **[IMPLEMENTED]** | `@atlas/toolkit` behind `ToolRegistryPort` in `core`, composed via `createToolRegistry()` in `@atlas/sdk`: curated, schema-validated (schemaVersion **2**), provenance-auditable catalog (`packages/toolkit/src/catalog.json`) — 9 foundational tools + 47 deduplicated Agent-Toolkit skills (Top-10 `recommended`), every record has a `tier` field (`recommended`/`optional`/`experimental`/`incompatible`); `skill` install type uses shallow git clone of the canonical repository with sub-path in `note`; local overlay merged by name (user wins, catalog never mutated); per-field provenance (curated/external/user/unknown — external never trusted blindly); extensible categories; fail-loud validation; install/compat/config/security fields declared and evaluated by Tasks 21–24. See docs/TOOL_REGISTRY.md |
| Tool Manifest System | **[IMPLEMENTED]** | `@atlas/toolkit` (`manifest-schema.ts` + `manifest.ts`): versioned (`TOOL_MANIFEST_SCHEMA_VERSION=1`), validated (load + before write, every problem listed), extensible (unknown fields preserved) per-installed-tool state; `.codeatlas/tools/<name>.json` (Scanner manifest merge policy); declares all 7 install ecosystems, executes nothing; untrusted-input safe (typed errors, `__proto__` inert, 1 MiB bound, path-safe names); manifest persistence remains toolkit-internal while higher-level services are SDK-composed. See docs/TOOL_MANIFEST.md |
| Tool Discovery (`atlas tools` search/list) | **[IMPLEMENTED]** | SDK-backed `atlas tools` overview and registry search with text/JSON output |
| Tool Compatibility Engine | **[IMPLEMENTED]** | `@atlas/toolkit` (`compatibility.service.ts` + `environment.ts` + `version-range.ts` + `render.ts`) behind `CompatibilityPort` in `core`, composed via `createCompatibilityEngine()` in `@atlas/sdk` (Task 21): evaluates a tool's declared requirements (OS/architecture/runtimes/package manager/AI CLIs via `AgentPort`/MCP/permissions) against the detected environment and returns one of four states with per-check evidence; `incompatible` ⇒ not installable here (**never fails open**), `unknown` flagged never guessed; offline + read-only, never installs. See docs/AGENT_TOOLKIT.md §6 |
| Tool Installer (`InstallerPort` + adapters) | **[IMPLEMENTED]** | `@atlas/toolkit` behind `InstallerPort` in `core`, composed via `createInstaller()` and `createToolkitSDK()` in `@atlas/sdk`: safe MVP subset (`npm`/`pip`/`cargo`/`go` + `skill` git-clone), approval-gated argument-array spawns, `verifyPath` for non-binary artifacts (skill SKILL.md file-existence check), Tool Manifest provenance, rollback, and CLI rendering of trust/plan before `--yes` execution |
| Tool Configurator | **[IMPLEMENTED]** | `ConfiguratorPort` + Claude/Gemini/Codex/OpenCode/MCP/VS Code adapters; AgentPort-backed installed-target detection; safe merge, backup, rollback, verification, dry-run; SDK `createConfigurator`; `atlas tools configure` |
| Tool Security / Trust System | **[IMPLEMENTED]** | `SecurityPort` + `SecurityAssessor` perform offline license/source/dependency/command/permission/maintainer/provenance/repository checks, produce per-check verdicts and risk, map only documented reviews to `reviewed`/`verified`, default to `unverified`, reject hostile metadata, and hard-gate installation. `blocked` cannot be overridden |
| Tool CLI / Slash Commands (`atlas tools`, `/tools`, `atlas setup`) | **[PARTIAL]** | `atlas tools` overview/search/info/install/remove/update/configure/doctor are SDK-backed; the `atlas tui` surface adding `/toolkit` and `/tools-install <tool>` is **v2 / not shipped**; `atlas setup` remains planned |
| Benchmark Framework (`atlas benchmark`) | **[IMPLEMENTED]** | `@atlas/benchmark` behind `BenchmarkPort` (ADR-012): `init/run/status/report/ablation` CLI, OpenCode + Ollama runners (3-arm: baseline vs CodeAtlas vs CodeAtlas Intel), per-task timeout, resume, automated accuracy evaluation, real token/cost/latency capture via `@atlas/usage`/`MetricsPort`, Markdown/JSON/HTML reports with 3-arm and ablation comparison sections. AblationService for toggling intel features. Per-provider default budgets. See `docs/benchmark.md` |
| Benchmark API + dashboard (`apps/server` + web UI) | **[IMPLEMENTED]** | `@atlas/server` (ADR-013): localhost HTTP API over the same benchmark store — suite list/detail/report, job-based runs with real progress + cancel, curated community library (local + shallow-cloned git repos, isolated temp workspaces, live availability), "Test in Browser" quick test (scan/index/retrieval/context assembly + optional Ollama answer), transparent score from measured inputs; powers the rebuilt Atlas Benchmark UI (My Benchmarks / Community / Leaderboard, run dialog, suite detail + history, browser workspace). No fabricated data. See `docs/benchmark.md` §"HTTP API" |
| Tool Recommendation Engine | **[PLANNED]** | Future; separate from Registry; out of MVP |

> **Never mark something implemented without checking the code.** If you are
> about to update this table, re-verify the module (status lives in
> CURRENT_STATE.md + tests) first.

---

## Known gaps worth tracking

- Parser/graph: namespaces and bare expressions are not extracted.
- Providers: no streaming; transport errors return `Result` (fixed).
- Storage: engine `>=22.5.0` — now the shared floor for all packages (node:sqlite).
- CLI: `atlas search`, `atlas mcp`, `atlas sessions`, `atlas usage`, all
  `atlas tools` commands, `atlas context`, `atlas explain`, `atlas doctor`, and
  `atlas init/build/update` are wired through SDK seams; `atlas tui` is v2 /
  not shipped (untracked).
- `@atlas/agents`: implements `AgentPort` (+`SessionPort` session manager with
  `captureOutput`/`getSessionOutput` **and** interactive `stdio: "inherit"`
  launches); the SDK composes it for sessions (`createSessionManager`) and the
  multi-agent orchestrator (`createOrchestrator`, which drives `SessionPort`),
  but the **plan-executing orchestrator router** remains planned; the standalone
  `atlas agents` CLI command (`status`/`connect`) is **implemented**.
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
- `@atlas/context`: `ContextBuilderService` (ADR-001) ranks search hits and
  resolves them to source-file `ContextItem`s behind `ContextBuilderPort`,
  composed into the SDK container.
- Context SDK consumers: `atlas search` and the MCP handlers use
  `createContextSDK`; the indexing pipeline is now exposed as `indexProject()`
  from the SDK and the CLI delegates to that service.
