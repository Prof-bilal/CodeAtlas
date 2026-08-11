# CodeAtlas Modules

This document defines **ownership**: what each module is responsible for, what
it must **never** do, and its public surface. It is the source of truth for
"who owns what." Status tags match [FEATURE_STATUS.md](./FEATURE_STATUS.md).

---

## Foundation

### `packages/shared` — « base types & utilities »
**Status: [IMPLEMENTED]**

- Owns: branded IDs (`FilePath`, `SymbolId`, `ProjectId`, `NodeId`, `EdgeId`,
  `CacheKey`), `Result`/`ok`/`fail`/`isOk`, `VERSION`, `NAME`,
  `ComingSoonError`, and tiny shared utilities used by every package.
- Must **never**: contain business logic, depend on any other `@atlas/*` package.

### `packages/core` — « domain + contracts » 
**Status: [IMPLEMENTED]**

- Owns: domain entities (`Project`, `SourceFile`, `Symbol`, `Reference`,
  `GraphNode`, `GraphEdge`, `ContextItem`, hashing/scan types) and the `*Port`
  interfaces every feature package implements.
- Must **NOT**: contain infrastructure (fs, http, db, processes), or any
  implementation — it is contract-only.

---

## Context Engine pipeline

### Scanner — « `@atlas/scanner` » — **[IMPLEMENTED]**
Responsible for **discovering** repository files and project metadata.

- Owns: directory walking, ignore rules, per-file metadata, language/framework
  detection, `readFile`, and `.codeatlas/manifest.json` generation (`manifest.ts`).
- Must **NOT**:
  - generate AI summaries,
  - directly call AI providers,
  - implement MCP,
  - own UI,
  - persist anything beyond the manifest.

### Manifest — « in `@atlas/scanner` (`manifest.ts`) » — **[IMPLEMENTED]**
Responsible for repository metadata and context versioning.

- Owns: `.codeatlas/manifest.json` schema, merge policy (`createdAt`
  preserved / `updatedAt` refreshed / else recomputed), package-manager +
  git-info collection.
- Must **NOT**: mutate source files or read file *contents* (metadata only).

### File Hashing — « `@atlas/hashing` » — **[IMPLEMENTED]**
Responsible for change detection.

- Owns: SHA-256 hashing, `buildSnapshot`, `compareHashes`
  (`new/changed/deleted/unchanged`), `getChangedFiles`, versioned JSON
  snapshots.
- Must **NOT**: decide *what* files to process (that's the caller's job), or
  perform parsing.

### Parser — « `@atlas/parser` » — **[IMPLEMENTED — TypeScript only]**
Responsible for source-code parsing.

- Owns: `LanguageParser` interface + `ParserRegistry` (plugin seam),
  `TypeScriptParser` (ts-morph → normalized `Symbol`s), `ParsedFile`,
  reference extraction.
- Must **NOT**: build the dependency graph (that's `graph`'s job), summarise
  with AI, or know about storage.

### Symbol Extraction & Indexing — « `@atlas/parser` (`symbol-indexer.ts`) » — **[IMPLEMENTED]**
Responsible for the symbol model: classes, functions, interfaces, types,
methods, variables, definitions, references and cross-file resolution.

- Owns: `SymbolIndexer`, `IndexedSymbol`, symbol ids, find/list/children/
  references queries.
- Must **NOT**: rank/summarise symbols, or persist them (persistence is
  `storage`'s job).

### Dependency Graph — « `@atlas/graph` » — **[IMPLEMENTED]**
Responsible for relationships between files/modules/symbols.

- Owns: `GraphService` building the directed graph, edge kinds, `shortestPath`,
  `detectCircularDependencies`, `exportJson`; **keeps its own module-path
  resolution** as a deliberate decoupling from `parser`.
- Must **NOT**: read source files, query storage, or invoke AI.

### Context Database — « `@atlas/storage` » — **[IMPLEMENTED]**
Responsible for **persistence + search**.

- Owns: SQLite `ContextStore` (`node:sqlite`), 8 tables + repository classes,
  migrations/versioning, transactions, `saveContext`/`updateContext`/
  `loadContext`/`deleteContext`/`searchContext`, sectors, legacy `StorageService`.
- Must **NOT**: contain any AI logic, parse source, or walk the file system.

### Cache — « `@atlas/cache` » — **[IMPLEMENTED]**
Responsible for generic caching.

- Owns: `CacheService` (in-memory Map, per-entry TTL, optional JSON-file
  persistence). Generic — not summary-specific.

### AI Summaries — « `@atlas/summary` » — **[IMPLEMENTED]**
Responsible **only** for AI-assisted semantic summaries.

- Owns: file/folder/module/project summaries, prompt templates, structured-JSON
  parsing, content-hash caching, token usage.
- Must use the **provider abstraction** (`ProviderPort`) — never call a vendor
  directly. Must **NOT** do analysis the parser/graph can do.

### Context Ranking & Assembly — « `@atlas/context` » — **[STUB]**
Responsible for ranking/assembling the most relevant context for an LLM prompt.

- Current state: `ContextBuilderService` exists behind `ContextBuilderPort` but
  both methods throw `ComingSoonError` — an **intentional stub**.
- When implemented it will: score files/symbols vs. a query, select a limit,
  assemble `ContextItem[]` — no UI, no persistence logic.

### Ranked Search — « `@atlas/search` » — **[IMPLEMENTED]**
Responsible for **querying** the indexed context with ranked, typo-aware results.

- Owns: `SearchService` behind `SearchPort`; an in-memory index built from a
  `ContextSnapshot` (files, symbols, modules, **dependencies**, summaries);
  the deterministic `LexicalScorer`; fuzzy matching (`editDistance`,
  word-boundary tokens); and the `RelevanceScorer` **seam** — the swap point for
  future vector scoring (no embeddings today).
- Must **NOT**: persist anything (index is rebuilt from the store), parse source,
  call AI, or walk the file system. It reads data exclusively through the
  `ContextDatabasePort` snapshot.

---

## AI provider layer

### Provider adapters — « `@atlas/providers` » — **[IMPLEMENTED]**
Responsible for unified access to AI model APIs.

- Owns: `ProviderPort.complete` implementation, `ProviderAdapter`, transport
  injection, `ClaudeAdapter`/`OpenAIAdapter`/`DeepSeekAdapter`/
  `GeminiAdapter`, runtime registry, error types.
- Must **NOT**: leak provider-specific logic into any other package; never log
  or store API keys.

---

## Orchestration & client layers

### AI CLI Connection Layer — « `@atlas/agents` » — **[IMPLEMENTED]**
Responsible for the **narrow spawn/detect boundary** of the orchestrator
(Direction B), plus the **Agent Session Manager** (`SessionManager`) and a
supervised long-running `ProcessRunner.launch()`.

- Owns: `AgentService` implementing `AgentPort` (`listAgents`, `detectAgent`,
  `detectAll`, `run`, plus `resolveBinary`/`buildArgsFor` helpers), per-CLI
  `AgentAdapter`s (Claude/Gemini/Codex/OpenCode), executable discovery on PATH
  (`findExecutable`), a supervised `ProcessRunner` (array args, no shell,
  timeout, partial-output reporting, `launch()` → `RunningProcess`), and
  `SessionManager` implementing `SessionPort` in `core`.
- Must **NOT**: model prompt history/multiplexing or the agent **router**
  (that is the planned orchestrator layer), add provider-specific
  `if (provider === …)` switches outside adapters, or run arbitrary
  repository-provided commands.
- Current state: implemented and tested; **composed** into `@atlas/sdk` for
  sessions (`createSessionManager`) and wired to the CLI via `atlas sessions`.
  The **router and slash commands** remain planned. See
  [AGENT_SESSIONS.md](./AGENT_SESSIONS.md) + [AGENT_ORCHESTRATOR.md](./AGENT_ORCHESTRATOR.md).

### Multi-Agent Orchestrator — `@atlas/sdk` (`orchestrator/`) — **[IMPLEMENTED]**
Responsible for turning a bounded `TaskPlan` into a run of **explicit agent
roles** through `SessionPort` and combining their results (Task 17). Lives in
`@atlas/sdk` because it composes the Context → Agent integration
(`createContextIntegration`) with the session manager; it never spawns directly
and never bypasses the Context SDK.

- Owns: `createOrchestrator({ sessions, integration })` (`OrchestratorPort`),
  `buildPlan`/`reviewPlan` (validated, capped role plans; parallel/sequential;
  shared or path-isolated context scopes), `executePlan` (per-role timeouts,
  retries for retryable launch failures only, cancellation, one-failure-cancels-
  the-rest, `captureOutput` on every launch), and `combineResults`/
  `detectConflicts`/`renderCombinedReport` (attributed sections + surfaced
  conflicts).
- Must **NOT**: spawn processes directly (goes through `SessionPort`), do
  free-form autonomous delegation (plans are explicit role lists), or reach for
  the context database (reads via `createContextSDK` → `ContextIntegration`).
- Current state: implemented and tested
  (`packages/sdk/tests/orchestrator.test.ts`); **no CLI/router wiring yet** —
  slash commands and interactive TTY handling remain planned. See
  [CURRENT_STATE.md](./CURRENT_STATE.md).

### Agent Toolkit — « `@atlas/toolkit` » — **[PLANNED]**
Responsible for the curated open-source tool ecosystem (Direction C): discover,
install, configure, and verify high-quality developer/AI-agent tools. **No code
exists yet** — see [AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md) for the design
contract. Sub-modules (all **[PLANNED]**):

- **Tool Registry** — authoritative catalog: metadata, categories, versions,
  licenses, repositories, install methods, compatibility, configuration,
  security/trust status. Kept separate from any future recommendation engine.
- **Tool Manifest** — per-installed-tool state (provenance, verification,
  applied config, trust level) in `.codeatlas/`, mirroring the Scanner manifest
  pattern. Owned by `@atlas/toolkit`.
- **Compatibility Engine** — evaluates a tool's declared requirements (OS,
  runtime, package manager, AI CLI availability/version via `AgentPort`, MCP,
  architecture, permissions) against the detected environment.
- **Tool Installer** — `InstallerPort` + one adapter per ecosystem
  (npm/pip/cargo/go/binary/GitHub release/MCP); **never** blind execution of
  third-party install scripts; user-approval flow; provenance recorded.
- **Tool Configurator** — `ConfiguratorPort` + one adapter per target
  (Claude/Gemini/Codex/OpenCode/MCP/VS Code); auto-configuration after install;
  provider logic quarantined in adapters.
- **Security / Trust** — security status (`verified`/`reviewed`/`community`/
  `unverified`/`blocked`), trust hierarchy, and the approval gate.
- Must **NOT**: import feature packages directly (core + shared only), bundle or
  fork third-party tools into the repository, auto-install without explicit
  user approval, or execute arbitrary `install.sh`. Configuration writes to
  **user config**, never silently into the analyzed repository.

### Composition root — « `@atlas/sdk` » — **[IMPLEMENTED]**
Responsible for wiring implementations behind ports.

- Owns: `Container`/`ContainerOptions`, the public façade callers use.
- Must **NOT**: contain feature logic itself.

### Context API / SDK — « `@atlas/sdk` (`src/context/`) » — **[IMPLEMENTED]**
Responsible for the **stable programmatic interface** through which consumers
(CLI, MCP, editors, agents) read a project's indexed context.

- Owns: `createContextSDK`, the sub-APIs (`files`/`symbols`/`dependencies`/
  `modules`/`summaries`/`search`/`project`), normalized context models,
  `ReadRepositories`/`WriteRepositories` (the persistence boundary over
  `ContextDatabasePort`), typed SDK errors, `status()`/`getRelevantContext()`.
- The database is an implementation detail; no consumer imports
  `@atlas/search`, `@atlas/storage`, or `@atlas/summary`, or sees SQL/rows.
- Read vs write: consumers use the read APIs; the indexing pipeline owns
  `context.write`.
- Must **NOT**: implement ranking/assembly (that is `@atlas/context`'s stub,
  ADR-001), spawn providers, or hold feature logic that belongs in a feature
  package. See [CONTEXT_SDK.md](./CONTEXT_SDK.md) and
  [ADR-005](./decisions/ADR-005.md) for background.

### CLI — « `apps/cli` » — **[PARTIAL]**
Responsible for the command-line interface.

- Owns: `atlas` program, subcommands, and (planned) `/agent` router entry.
- Current state: `search` runs through the Context SDK and `mcp` starts the
  MCP server; `init`/`build`/`update`/`explain`/`doctor` print "Coming Soon".
- Must **NOT**: contain business logic; it delegates to the SDK (and to
  `@atlas/mcp` to start the server).

### Agent Orchestrator — « `@atlas/agents` + planned router » — **[PARTIAL/PLANNED]**
Responsible for launching and managing external AI CLI processes.

- Will own: agent discovery, agent adapters, process spawning/lifecycle,
  terminal/session handling, timeouts, exit codes, environment config.
- **Implemented today:** the connection layer (`@atlas/agents` behind
  `AgentPort`) — adapters, executable detection, supervised process runs; and
  the **Agent Session Manager** (`SessionManager` behind `SessionPort`) — in
  `@atlas/agents`, composed by the SDK (`createSessionManager`) and exposed by
  `atlas sessions`. See [AGENT_SESSIONS.md](./AGENT_SESSIONS.md).
- **Planned still:** the agent router, `/agent` slash commands, and interactive
  terminal/TTY handling for sessions.
- Must **NOT**: reimplement the agent's internal reasoning. See
  [AGENT_ORCHESTRATOR.md](./AGENT_ORCHESTRATOR.md).

### MCP — « `@atlas/mcp` » — **[IMPLEMENTED]**
Responsible for exposing context to external AI agents over MCP.

- Owns: the `codeatlas-mcp` stdio server (or `atlas mcp` CLI command), the six
  tools (`search_symbols`, `search_files`, `get_summary`, `get_dependencies`,
  `explain_module`, `project_overview`), zod input schemas + request
  validation, error handling, and stderr logging. Consumes **only**
  `@atlas/sdk` — every tool reads through **`createContextSDK`** sub-APIs.
- Must **NOT**: own the context engine itself, hardcode an AI provider, import
  feature packages directly, or write to stdout (the protocol channel).

### VS Code — « `apps/extension` » — **[IMPLEMENTED]**
Responsible for editor integration.

- Owns: the `@atlas/extension` package — Activity Bar + five tree views
  (project/symbols/modules/summaries/dependencies), `codeatlas.*` palette
  commands, a status-bar indicator, and a shell-out runner for `atlas
  build`/`update`. Consumes **only** `@atlas/sdk`.
- Must **NOT**: open `.codeatlas` (the DB), import feature packages directly,
  or embed the indexing pipeline (see [VSCODE.md](./VSCODE.md)).

---

## Ownership rules applied to cross-cutting concerns

| Concern                | Owner                                  |
| ---------------------- | -------------------------------------- |
| Secrecy of API keys    | User config; providers adapters must not log/expose |
| Security of command execution | Agent Orchestrator (`@atlas/agents` connection layer + planned router) — see [SECURITY.md](./SECURITY.md) |
| Which files are "in scope" | Scanner (files) + Hashing (changes) |
| What a symbol *is*       | Parser (`Symbol`) + Core entity |
| Where data lives         | `@atlas/storage` (+ manifest file) |
| How context gets picked  | `@atlas/context` (stub) |
| What tools a user may install | Agent Toolkit Registry + Security/Trust (planned) |
| How tools get installed/configured | Agent Toolkit Installer + Configurator (planned) |
| External AI CLI detection | `@atlas/agents` (`AgentPort`, implemented) |
| Tool install safety       | Agent Toolkit Security model — see [SECURITY.md](./SECURITY.md) |

---

## Interaction contract (allowed callers)

- **Ports** are how modules communicate — a module never imports another
  feature package's concrete classes.
- **`core` + `shared`** are the only things feature packages may import
  (including the planned `@atlas/toolkit` and the implemented `@atlas/agents`).
- **`sdk`** is what `cli`, `mcp`, and the VS Code extension (`apps/extension`)
  consume for context; `cli` may additionally import `@atlas/mcp` to start the
  server. Planned `atlas tools`/`atlas setup` follow the same rule: delegate to
  the SDK, never import `@atlas/toolkit` directly.
- The **Context SDK** (`createContextSDK`) is the read façade exported by
  `sdk`; it is what those consumers should call — not `getSearch()`/
  `getContextDb()` on the `Container`.

Enforced by ESLint (`no-restricted-imports`). See [DEPENDENCIES.md](./DEPENDENCIES.md).