# CodeAtlas — Current State

> **Read this first.** This document records what *actually* exists in the
> repository as of **2026-08-11** (re-verified against code), so AI agents do
> not mistake planned features for implemented ones. Each section is tagged:
>
> - **[IMPLEMENTED]** — production code exists and is tested.
> - **[PARTIAL]** — a real implementation exists, but with known gaps.
> - **[STUB]** — the interface exists, but every method throws `ComingSoonError`
>   or prints a "Coming Soon" placeholder.
> - **[PLANNED]** — documented as a goal; there is no code.
> - **[UNKNOWN]** — cannot be safely determined from the repository.

---

## 1. Project at a Glance

| | |
|---|---|
| **Name** | CodeAtlas |
| **Description** | Open-source **AI Context Engine** (+ future Unified AI CLI Orchestrator) |
| **License** | MIT |
| **Monorepo** | pnpm workspaces (`pnpm-workspace.yaml`, pnpm `9.15.0`) |
| **Runtime** | Node.js `>=20.19.0` (one exception, see §5) |
| **Language** | TypeScript, strict mode, ESM (`"type": "module"`) |
| **Package manager** | pnpm |
| **Git** | **Not a git repository.** No `.git` directory exists anywhere in the tree. `.gitignore`, `.husky`, and `commitlint` are present but were never activated against a repo. |
| **Published version** | `0.0.0` everywhere (package.json, `@atlas/shared` `VERSION`) |

Verified by full-tree inspection (`packages/*`, `apps/*`, configs) and by reading
every package's source and tests.

---

## 2. What exists (monorepo layout)

```
apps/
  cli/          # Commander.js CLI — `search`+`mcp`+`sessions`+`usage` wired, 5 stubbed  [PARTIAL]
  extension/    # VS Code extension (@atlas/extension) — SDK consumer         [IMPLEMENTED]
packages/
  shared/       # Base types, Result, branded IDs, VERSION, ComingSoonError  [EXISTING]
  core/         # Domain entities + port interfaces (type-only)              [EXISTING]
  scanner/      # File walking, ignore rules, language/framework detection   [EXISTING]
  hashing/      # SHA-256 + change detection + snapshots                     [EXISTING]
  parser/       # TypeScript → normalized Symbol IR (ts-morph)               [PARTIAL]
  graph/        # Dependency graph, shortest path, cycle detection           [EXISTING]
  storage/      # SQLite context DB (node:sqlite), repos, migrations         [EXISTING]
  cache/        # Generic in-memory/TTL cache (+ JSON persistence)           [EXISTING]
  providers/    # Claude / OpenAI / DeepSeek / Gemini adapters               [EXISTING]
  summary/      # AI file/folder/module/project summaries                     [EXISTING]
  search/       # Ranked, fuzzy-aware project search (vector-ready)          [EXISTING]
  usage/        # AI usage & credits: tri-state tokens/cost, budgets, limits [EXISTING]
  context/      # Context ranking & assembly                                  [STUB]
  agents/       # AI CLI connection layer (AgentPort)                         [EXISTING]
  toolkit/      # Agent Toolkit — Tool Registry foundation (Task 19)          [PARTIAL]
  mcp/          # MCP server exposing context to AI tools                      [EXISTING]
  sdk/         # Composition root (Container)                                  [EXISTING]
docs/            # (this documentation system)
examples/        # README placeholder only (no runnable examples)
```

---

## 3. Per-module status

### Foundation (`packages/core`, `packages/shared`) — **[EXISTING]**

- `core` declares domain entities (`Project`, `SourceFile`, `Symbol`, `Reference`,
  `GraphNode`, `GraphEdge`, `ContextItem`) and the `*Port` interfaces
  (`ScannerPort`, `ParserPort`, `StoragePort`, `GraphPort`, `ContextBuilderPort`,
  `CachePort`, `ProviderPort`, `HashPort`, `SummaryPort`, `ContextDatabasePort`,
  `UsagePort`).
  No infrastructure, no implementation — contracts only.
- `shared` provides `Result`/`ok`/`fail`/`isOk`, branded types
  (`FilePath`, `SymbolId`, `ProjectId`, `NodeId`, `EdgeId`, `CacheKey`),
  `VERSION`, and `ComingSoonError`.
- No gaps found.

### Scanner — **[EXISTING]**

- `ScannerService implements ScannerPort`: recursive directory walk, case-insensitive
  ignore list (`node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`,
  `vendor`, configurable), per-file metadata (path, name, extension, size,
  language), tree, totals, languages, framework detection, root markers.
- `readFile` decodes a single file into a `SourceFile`.
- Framework detection is **heuristic only** — based on dependency names and
  marker files, not content parsing.
- Manifest generation (`packages/scanner/src/manifest.ts`) writes
  `<root>/.codeatlas/manifest.json` from a scan.
- **Known cosmetic issue:** an orphaned JSDoc block for `collectGitInfo` sits
  detached at `manifest.ts:101–109`; the real function at line 173 has no doc.

### File Hashing — **[EXISTING]**

- `hashContent` (SHA-256, `node:crypto`), `buildSnapshot`, `compareHashes`
  (`changed`/`added`/`deleted`/`unchanged`), `getChangedFiles`, and
  `saveSnapshot`/`loadSnapshot` (versioned JSON, `SNAPSHOT_VERSION = 1`).
- This is what powers incremental re-parsing.

### Manifest — **[EXISTING]**

- Lives in `packages/scanner/src/manifest.ts` (module-level, not a separate
  `@atlas/manifest` package).
- Writes `.codeatlas/manifest.json`: schema version, name, languages, framework,
  package manager (from lockfiles), git info, timestamps, file/folder totals.
- Merge policy: `createdAt` preserved, `updatedAt` refreshed, else recomputed.
- `loadManifest`, `detectPackageManager`, `collectGitInfo` exported.

### Parser — **[EXISTING / PARTIAL]**

- `ParserService` implements `ParserPort`; plugin registry
  (`LanguageParser` + `ParserRegistry`).
- `TypeScriptParser` (via **ts-morph**) — in-memory, no type-check — extracts
  imports/exports/classes/interfaces/functions/enums/type-aliases/variables,
  member structure, doc comments, and references.
- `SymbolIndexer` — in-memory find/list/children/references with cross-file
  import resolution (`./x`, `../x` → `.ts`/`.tsx`/`/index.ts`/`/index.tsx`),
  same-file reference resolution.
- **Known gaps (documented in code):**
  - Renamed imports (`import { a as b }`) do **not** resolve cross-file.
  - `export default <expression>` does **not** resolve cross-file.

### Dependency Graph — **[EXISTING]**

- `GraphService` implements `GraphPort`: nodes = symbols + one file node per
  source file; edges for calls/constructs/accesses/references/reads/writes/
  extends/implements/imports/exports/contains.
- `shortestPath` (BFS), `detectCircularDependencies` (Tarjan SCC), `exportJson`.
- `module-resolution.ts` intentionally duplicates the parser's module-path
  resolution so the graph stays decoupled from the parser.
- Same renamed-import / `export default` gaps as the parser.

### Context Database (`packages/storage`) — **[EXISTING]**

- `ContextStore` implements `ContextDatabasePort`; SQLite via **`node:sqlite`**
  (Node built-in, no npm dependency), **synchronous**.
- 8 tables: Files, Symbols, Dependencies, Summaries, Modules, Relationships,
  Hashes, Metadata — behind 8 repository classes; migrations/versioning +
  transactions.
- `saveContext` (replace) / `updateContext` (merge) / `loadContext` / `deleteContext` /
  `searchContext` (LIKE + simple scoring/snippets).
- `StorageService` wraps the same store with the **legacy** `StoragePort`
  (projects/files/symbols) so old callers keep working.
- **Note:** The `db` is loaded via `createRequire` because Vite/Vitest strips the
  `node:` prefix on static imports; `vitest.config.ts` keeps `node:sqlite`
  external. This is an intentional workaround, not dead code.

### Cache (`packages/cache`) — **[EXISTING]**

- In-memory `Map` with per-entry TTL; optional best-effort JSON-file persistence.

### Providers (`packages/providers`) — **[EXISTING / PARTIAL]**

- `ProviderService` implements `ProviderPort.complete()`. Adapters:
  `ClaudeAdapter` (Anthropic Messages), `GeminiAdapter` (generateContent),
  `OpenAIAdapter` + `DeepSeekAdapter` (OpenAI-compatible chat completions).
- Injectable `HttpTransport` (global `fetch` default); `json` knob per provider;
  runtime `register()`.
- **Known gap:** default model ids are placeholders — `claude-sonnet-5` for
  Claude and `gemini-1.5-pro` for Gemini. They are not maintained/verified
  against live APIs. Tests use mocked transports.
- **Note:** The `ProviderService` registers **no** adapters by default; adapters
  are registered only for providers present in the config. The SDK's default
  `ProviderService()` is therefore configured with zero providers.

### AI Summaries (`packages/summary`) — **[EXISTING]**

- `SummaryService` implements `SummaryPort`: `summarizeFile` /
  `summarizeFolder` / `summarizeModule` / `summarizeProject`, Q&A via
  `render`+ templates + system JSON instruction;
  content-hash-cached through `CachePort` + `HashPort` (only changed files reach
  the model; `metadata.cacheHit`), JSON-parse with `SummaryParseError`,
  `MAX_CONTENT_CHARS` truncation.

### Search (`packages/search`) — **[EXISTING]**

- `SearchService` implements `SearchPort`: builds an in-memory index from a
  `ContextSnapshot` (loaded via the injected `ContextDatabasePort`) and returns
  ranked hits for **symbols, files, modules, dependencies, and summaries**.
- Deterministic `LexicalScorer`: exact → prefix → whole-token → substring →
  fuzzy (Levenshtein edit distance) matching; secondary fields (documentation,
  paths, prose) are damped. Ranking flows through the `RelevanceScorer`
  interface, which is the seam for a future embedding/vector scorer — **no
  embeddings today**.
- `Container.getSearch()` wires it to the default `contextDb`; helpers
  `renderSearchHits`/`contextDbPath`/`createProjectContainer` back the
  `atlas search` command.

### AI Usage & Credits (`packages/usage`) — **[EXISTING]**

- `UsageService` implements the **`UsagePort`** contract (new port in `core`):
  `record` / `getUsage` / `listUsage` / `statistics` / `setBudget` /
  `budgetStatus` / `listBudgets` / `setLimit` / `checkLimit` / `listLimits` /
  `close`.
- **Tri-state provenance — never guess:** every token, cost, latency, and price
  value is `actual`, `estimated` (documented, labeled heuristic), or `unknown`
  (`value: null`); aggregation keeps `unknown` unknown; cost is computed at
  record time from tokens + pricing (`computeCost`). See `docs/USAGE.md`.
- **Pricing is quarantined** behind `PricingSource` (`priceFor` +
  `listProviders`); `StaticPricingSource` ships a built-in estimated table
  (claude/openai/deepseek/gemini — "published list price, not verified").
  Unknown provider/model fails cleanly (`UnknownPriceError`). No
  `if (provider === …)` switches in business logic.
- **Collection seams:** `withUsageTracking({ estimateTokens?, recordOnError? })`
  wraps provider calls and records actual (or **opt-in estimated**) tokens;
  `trackAgentRun` records agent-session runs as `session` events (tokens unknown
  by design). `estimateTokens` uses `Math.ceil(len/4)` character→token and is
  exported from `@atlas/usage` (not from `@atlas/sdk`, which already exports a
  different `estimateTokens` from context-integration).
- **Budgets (soft, never block) vs limits (hard, fail-safe):** `checkLimit`
  returns a failed `Result` (`UsageLimitExceededError`) when a projected call
  would exceed a hard limit — deny by default; reads are never blocked.
- **Privacy:** records never contain prompts, API keys, or provider secrets;
  `taskRef` is an anonymized hash.
- **Persistence:** `UsageStore` — its own SQLite DB (`.codeatlas/usage.db`,
  `node:sqlite`, schema + migrations in `@atlas/usage`), separate from the
  context database. Defaults to `:memory:`.
- **SDK surface:** `createUsageService({ filePath?, store?, pricing? })` in
  `@atlas/sdk` returns a wired `UsagePort`; errors (`UsageError`,
  `UnknownPriceError`, `UsageLimitExceededError`) re-exported. CLI `atlas usage`
  is wired (see CLI section). Tests:
  `packages/usage/tests/{collector,pricing,usage.service,usage-store,integration}.test.ts`
  (no provider credentials / network). See ADR-009.

### Context ranking & assembly (`packages/context`) — **[STUB]**

- `ContextBuilderService` implements `ContextBuilderPort` but **both** methods
  (`build`, `sourceFile`) throw `ComingSoonError("context.build")` /
  `("context.sourceFile")`. The class comment states this is intentional:
  *"context ranking is intentionally not implemented yet"*.
- This is the **only** deliberately stubbed service.
- The SDK `Container` wires this stub in by default, so `getContext()` calls
  fail by design. Do **not** treat this as an accident.

### SDK composition root (`packages/sdk`) — **[EXISTING]**

- `Container.create()` wires every default implementation behind its port;
  `ContainerOptions` lets callers override each service (the plugin seam).
- Constraint: default `Container` pulls in the `context` stub (see above).

### Context API / SDK (`packages/sdk/src/context/`) — **[EXISTING]**

- `createContextSDK({ repositoryPath | dbPath | contextDb })` — the stable,
  provider-independent read façade consumers use (files, symbols, dependencies,
  modules, summaries, search, project, status, relevant context).
- Reads go through `ReadRepositories` (→ `ContextDatabasePort`), writes through
  `WriteRepositories` (clear read/write split). No SQL/rows ever reach callers;
  errors are typed SDK errors (`FileNotFoundError`, `SymbolNotFoundError`, …).
- `getRelevantContext` is **deterministic** (search + persisted deps + stored
  summaries) — it does not implement the `@atlas/context` ranking stub
  (ADR-001). Future vector ranking plugs into `@atlas/search`'s `RelevanceScorer`.
- The CLI's `atlas search` routes through this SDK instead of reaching for
  `Container.getSearch()`/`getContextDb()`. See
  [CONTEXT_SDK.md](./CONTEXT_SDK.md) + [ADR-005](./decisions/ADR-005.md).

### CLI (`apps/cli`) — **[PARTIAL]**

- Commander.js program `atlas`, nine subcommands — `init`, `build`, `update`,
  `search`, `sessions`, `usage`, `explain`, `doctor`, `mcp`. **`search` is wired
  to the Context SDK**: it opens `.codeatlas/context.db` (via `ATLAS_ROOT` or
  cwd) with `createContextSDK`, runs `context.search.search(...)`, and prints
  ranked hits. **`mcp` starts the MCP server** (`startStdioServer`) for the
  current project. **`sessions` manages agent sessions**
  (`list`/`info`/`stop`) via `createSessionManager()` from the SDK. **`usage`
  reports AI usage & credits** (`summary`/`list`/`budgets`, bare `atlas usage`
  = summary, `--json` per subcommand) through `createUsageService()` from the
  SDK against `.codeatlas/usage.db`. The other five commands still print
  `[atlas <command>] Coming Soon`. No `/agent`-style slash commands (the agent
  router is planned).
- Dependency note: the CLI may import `@atlas/sdk` **and** `@atlas/mcp` (so it
  can start the server); enforced by ESLint. See `docs/DEPENDENCIES.md`.
- `atlas search` accepts positional query words plus `--limit`, `--type`,
  `--no-fuzzy`, and `--json`; it reports a friendly error and exit code `1`
  when no context database exists.
- Tests assert the command list, version, placeholder text, `atlas search`
  end-to-end against a fixture database (including the missing-index error),
  and the `usage` rendering/CLI (`usageDbPath`, `formatMeasured`,
  `renderUsageSummary`, `renderUsageTable`, fresh-project empty output, JSON).

### MCP server (`packages/mcp`) — **[IMPLEMENTED]**

- `@atlas/mcp` is an MCP server over stdio (JSON-RPC 2.0) built on the official
  `@modelcontextprotocol/sdk`. It consumes **only** `@atlas/sdk` — every tool
  reads normalized context through `createContextSDK` sub-APIs
  (`symbols.searchSymbols`, `files.searchFiles`, `dependencies.query`,
  `modules.explain`, `summaries.*`, `project.overview`) — and is
  provider-independent: dialogue reads are deterministic; AI summary
  generation is opt-in per call (`get_summary ... generate: true`) and fails
  cleanly when no provider is configured.
- Exposes six tools: `search_symbols`, `search_files`, `get_summary`,
  `get_dependencies`, `explain_module`, `project_overview`. Each has a zod
  input schema (validated by the SDK, surfaced as `-32602` on failure) and
  returns `structuredContent` + a JSON text block; domain errors return
  `isError: true`.
- Ships a `codeatlas-mcp` binary (`src/bin.ts`) **and** the `atlas mcp` CLI
  command, plus a library API (`createMcpServer` / `startStdioServer`). The
  Context SDK opens lazily, so the server can start before an index exists.
  Logs go to stderr only.
- **Known scope:** resources/prompts are not yet exposed (tools only).
- See `docs/MCP.md` for the full tool reference.

### VS Code integration — **[IMPLEMENTED]** (`@atlas/extension`)

- `apps/extension` is a VS Code extension that reads context **only through the
  Context SDK** (`createContextSDK`): Activity Bar + five tree views
  (project/symbols/modules/summaries/dependencies), `codeatlas.*` palette
  commands, and a status-bar indicator.
- `atlas build`/`update` are invoked by shelling out to the built CLI (the
  indexing pipeline is not yet an SDK method, so those still report "Coming
  Soon").
- The extension is anonymous at the database: it never opens `.codeatlas`
  itself (see `docs/VSCODE.md`), and is tested headlessly.
- JetBrains / other editor integrations are still **[PLANNED]**.

### AI CLI connection layer (`packages/agents`) — **[EXISTING]**

- `AgentService` implements `AgentPort` (new port in `core`): `listAgents`,
  `detectAgent`, `detectAll`, `run`.
- Per-CLI `AgentAdapter`s (Claude / Gemini / Codex / OpenCode), executable
  discovery (`findExecutable`), and a `ProcessRunner` that spawns with an
  **argument array** (no shell), applies a timeout, kills on timeout, and
  reports partial output honestly.
- **Session manager (Task 15):** `SessionManager` implements `SessionPort` (in
  `core`) — create/start/get/list/stop/terminate/shutdown for independent
  concurrent sessions — plus `ProcessRunner.launch()` returning a supervised
  `RunningProcess` handle (SIGTERM → SIGKILL, buffered `onExit`, `stdio:
  "ignore"` by default). Sessions launched with `captureOutput: true` pipe and
  bound stdout/stderr (readable later via `SessionPort.getSessionOutput`, even
  after exit), which the orchestrator uses to report partial output honestly.
  The SDK composes it (`createSessionManager()`) and the CLI exposes
  `atlas sessions list` / `info` / `stop`. See `docs/AGENT_SESSIONS.md` +
  ADR-007.
- **Not yet wired** into the SDK/CLI for *routing* (slash commands) — the
  agent router and `/claude`-style commands remain planned. Package
  `package.json` description: "AI CLI connection layer for CodeAtlas — detect
  and run external AI coding CLIs."
- Tests: `packages/agents/tests/*.test.ts` (executable resolution, service
  detection/run with a fake process runner; process `launch()`; session
  manager lifecycle/isolation/shutdown).

### Context → Agent integration (Task 16) — **[IMPLEMENTED]**

- **`context-integration` in `@atlas/sdk`** (ADR-008): `createContextIntegration()`
  composes the Context SDK (`createContextSDK`) with the session manager
  (`createSessionManager`) and assembles a **provider-independent, serializable
  `ContextPackage`** for one task: ranked file/symbol/summary/dependency items
  plus a project overview and project instruction files (`AGENTS.md`,
  `CLAUDE.md`, README, `.codeatlas/manifest.json`), every item carrying a score
  and a human-readable reason.
- **Budget** (`ContextBudget`): per-item and total token caps with a recorded
  `BudgetRecord` — oversized items are truncated and marked, the tail is dropped
  by token/count while essential items (instructions, overview) are never
  dropped, and `budgetExceeded` is reported honestly.
- **Secret deny-filter**: `.env*`/keys/credentials are dropped by path or content
  and recorded in the package's `ExclusionRecord`; placeholder examples in docs
  are tolerated. No `.env*` is ever sent.
- **Staleness**: `detectStaleness()` compares persisted per-file hashes
  (`ContextSDK.hashes()`) against the working tree via `@atlas/hashing`,
  reporting `fresh`/`stale`/`unknown`/`unavailable` on the package.
- **Delivery through `SessionPort`**: `launch()` creates + starts a session with
  the rendered package as its prompt; `attach()` starts a `CREATED` session with
  context and reports a typed `ContextAttachUnsupportedError` for live/terminal
  sessions (the adapters run non-interactively, so context is injectable only at
  launch). `explain()` projects a package to a content-free explanation; render
  helpers produce a plain prompt and a `--explain`-style listing.
- **No CLI wiring yet** — a future `atlas context` / slash-command is the
  follow-up. Tests: `packages/sdk/tests/context-integration.test.ts`.
  See ADR-008.

### Multi-Agent Orchestrator (Task 17) — **[IMPLEMENTED]**

- **`orchestrator` in `@atlas/sdk`**: `createOrchestrator({ sessions, integration })`
  turns a bounded `TaskPlan` into a run of **explicit agent roles** through
  `SessionPort` (never spawning directly), then collects and combines their
  results. It is the Coordinator/Supervisor: it decides what each role runs and
  when, cancels the remaining roles on a failure, and never leaves orphan
  children (active sessions are terminated on run end).
- **Plan building** is explicit and bounded — no free-form autonomous
  delegation: `buildPlan({ task, repositoryPath, roles })` (1..`MAX_PLAN_ROLES`
  = 8 roles, validated: non-empty task/path, unique role ids, positive timeouts)
  defaults to `parallel` mode and a **shared** context scope; `reviewPlan()` is
  the built-in parallel 3-role review scenario (`architecture`/`security`/
  `implementation`, providers configurable). Per-role `contextScope` may be
  `{ type: "isolated", paths: [...] }`, forwarded to
  `ContextIntegration.buildPackage` so each role only sees its slice of the
  repository (never bypassing the Context SDK).
- **Execution** (`executePlan`): per-role and default timeouts (deadline watch →
  terminate → honest `timed-out` result with partial output), bounded retries
  **only** for retryable launch failures (`AgentCliNotFoundError`,
  `ProcessSpawnError`), user cancellation, "one failure stops the remaining
  roles" (a failed/timed-out role aborts concurrent siblings), and
  **`captureOutput`** on every launched session so partial stdout/stderr is
  reported even on failure/timeout. `sequential` mode feeds each later role the
  attributed findings of earlier roles ("Findings from earlier roles").
- **Combining** is deterministic and honest: `combineResults()` attributes every
  section to its role, and `detectConflicts()` surfaces *obvious* disagreements
  (the same topic mentioned with opposing verdicts across roles) instead of
  merging them away; `renderCombinedReport()` renders the attributed report.
- **Live view**: `orchestrator.getRun(id?)` exposes the run snapshot as it
  progresses (`onProgress`), and `orchestrator.cancel(id?)` stops a running run.
- **No CLI/router wiring yet** — no `atlas /claude`-style commands (see below).
  Tests: `packages/sdk/tests/orchestrator.test.ts` (plan validation, parallel/
  sequential execution, timeouts, retries, cancellation, abort-on-failure,
  isolated scopes, orphan cleanup, live view, conflict detection).

### Unified AI CLI Orchestrator (`/gemini`, `/claude`, `/codex`, `/opencode`, ...) — **[PLANNED]**

- **The connection layer and the session manager exist (`@atlas/agents`,
  above), and the plan-executing orchestrator exists in `@atlas/sdk`; the
  routing surface does not.** Agent sessions are implemented (`SessionManager`
  behind `SessionPort`, `atlas sessions list/info/stop`); the **router, slash
  commands, and interactive terminal handling remain planned** — no agent
  router, no `/agents`-style commands. The narrow spawn/detect boundary, the
  session manager, and the multi-agent plan executor are real; the router on
  top of them is the planned orchestrator.

### Agent Toolkit (Direction C) — **[PARTIAL]**

- **Tool Registry foundation (Task 19) is implemented.** `@atlas/toolkit`
  behind a new `ToolRegistryPort` in `core`, composed by the SDK as
  `createToolRegistry()`. It is the authoritative catalog of *what exists*:
  a curated, schema-validated, **per-field provenance-auditable** record set
  (name, description, repository, website, documentation, license, version,
  categories, supported OS/agents, install methods, dependencies, security
  status, trust level, maintainer, last-update + star signals) shipped as a
  versioned data file (`packages/toolkit/src/catalog.json`), merged with a
  **local overlay** by name (user records win; the catalog is never mutated).
  Categories are **extensible** (any non-empty string). Validation is
  **fail-loud** — version mismatch / malformed record / unreadable overlay
  throw typed errors; nothing is skipped silently. External metadata is
  advisory only and recorded as `external` provenance — never trusted blindly,
  never auto-approved. The install/compat/security **fields are declared and
  validated here but evaluated by later tasks** (Tasks 21/22/24). No network,
  no database. See [TOOL_REGISTRY.md](./TOOL_REGISTRY.md).
- **Everything else is still [PLANNED]**: the Tool Manifest, Compatibility
  Engine, Installer, Configurator, Security/Trust evaluation, the `atlas
  tools`/`/tools` CLI surface. See [AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md).

---

## 4. Intended vs. actual

| Intended direction                    | Status in repo |
| ------------------------------------- | -------------- |
| **A. Context Engine** (scan → parse → graph → store → search → feed AI) | ~90% implemented; context ranking intentionally stubbed; `search` + `mcp` are CLI-wired |
| **B. Unified AI CLI Orchestrator** (`/claude`, `/gemini`, …) | Partial — the connection layer (`@atlas/agents` behind `AgentPort`) and the session manager (`SessionManager`, `atlas sessions`) are implemented and SDK-wired, and the **multi-agent plan orchestrator** (`createOrchestrator` in `@atlas/sdk`) is implemented and tested; router/slash commands **0%** |
| **C. Agent Toolkit** (curated tool registry → install → configure → verify) | ~10% — **Task 19 registry foundation implemented** (`@atlas/toolkit` behind `ToolRegistryPort`, SDK `createToolRegistry`, shipped catalog + local overlay, per-field provenance); Manifest/Compatibility/Installer/Configurator/Security evaluation/`atlas tools` are **0%** ([PLANNED]) |

The existing code fully implements **Direction A's pipeline layers** but stops
at: (1) the other CLI commands (build/update/init/explain/doctor are stubs),
(2) context ranking/assembly (stub), and (3) the **router/slash commands** of
the orchestrator (the plan-executing orchestrator itself exists in
`@atlas/sdk`). MCP (`@atlas/mcp`) and the VS Code extension (`@atlas/extension`)
are thin consumers of the SDK; JetBrains/other editor integrations are still
absent.

---

## 5. Cross-cutting facts & known inconsistencies

1. **Engine version drift.** `packages/storage` requires Node `>=22.5.0`
   (because of `node:sqlite`); every other package requires `>=20.19.0`. The
   root engine is `>=20.19.0`. Running on Node <22.5 breaks `storage`.
2. **Provider default model ids are placeholder values** (not verified against
   vendor catalogs).
3. **No git history.** `.husky`, `commitlint`, `.gitignore`, `pre-commit` hooks
   are all configured but have never run against a commit.
4. **CI/CD**: no `.github/`, no `.gitlab-ci.yml`, no CI config at all.
5. **`.codeatlas/`**: currently `manifest.json` (by the Scanner manifest) and
   `usage.db` (by `@atlas/usage` / `atlas usage`) are written there. The rest
   of the target layout (`.codeatlas/context.db`, `graph.json`, `symbols.json`,
   `summaries/`) does not exist yet — it is a **target** architecture
   (context.db is produced only when an indexing run happens, e.g. via the SDK
   write edge or a future `atlas build`).
6. **Existing docs at the time of writing this audit:** root `ARCHITECTURE.md`,
   root `agents.md` (agent catalog), `README.md`, `docs/README.md`,
   `examples/README.md`. No `CLAUDE.md`. These docs predate/replace with the
   canonical set in `docs/`.
7. **build artifacts** (`dist/` in every package) are checked-in-but-gitignored,
   generated by a prior `pnpm build` from current source.

---

## 6. Testing status

Full test files exist in every package (`packages/*/tests/*.test.ts`) and in
`apps/cli`. Coverage is genuine (unit-level, behavior-focused). See
[TESTING.md](./TESTING.md) and `pnpm test` for the runnable suite. At the time
of writing the suite is expected to pass.