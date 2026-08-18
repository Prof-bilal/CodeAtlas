# CodeAtlas — Current State

> **Read this first.** This document records what *actually* exists in the
> repository as of **2026-08-12** (re-verified against code), so AI agents do
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
| **Runtime** | Node.js `>=22.5.0` (all packages share the same floor — `node:sqlite`; see §5) |
| **Language** | TypeScript, strict mode, ESM (`"type": "module"`) |
| **Package manager** | pnpm |
| **Git** | **Is a git repository** (branch `main`, remote `github.com/Prof-bilal/CodeAtlas.git`). `.gitignore`, `.husky`, and `commitlint` are configured. |
| **Published version** | CLI `codeatlas-cli` `0.2.1`; `@atlas/*` workspace packages `0.0.0` (`@atlas/shared` `VERSION`) |

Verified by full-tree inspection (`packages/*`, `apps/*`, configs) and by reading
every package's source and tests.

---

## 2. What exists (monorepo layout)

```
apps/
  cli/          # Commander.js CLI — context, sessions, usage, MCP, and Toolkit commands wired [PARTIAL]
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
  toolkit/      # Toolkit — Registry (19) + Manifest (20) + Compatibility (21) + Installer (22)  [PARTIAL]
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
  same-file reference resolution. Renamed imports (`import { a as b }`) and
  `export default <expression>` **do** resolve cross-file (via the import
  symbol's `importedName`).
- **Known gap:** namespaces and bare expressions are not extracted.

### Dependency Graph — **[EXISTING]**

- `GraphService` implements `GraphPort`: nodes = symbols + one file node per
  source file; edges for calls/constructs/accesses/references/reads/writes/
  extends/implements/imports/exports/contains.
- `shortestPath` (BFS), `detectCircularDependencies` (Tarjan SCC), `exportJson`.
- `module-resolution.ts` intentionally duplicates the parser's module-path
  resolution so the graph stays decoupled from the parser.
- Import resolution matches the parser: renamed and default imports resolve to
  their definitions cross-file.

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
- Default model ids are maintained current: `claude-sonnet-5` (Claude),
  `gemini-2.5-pro` (Gemini), `gpt-5.6` (OpenAI), `deepseek-v4-flash` (DeepSeek),
  `llama3.2` (Ollama) — always overridable per request via `ProviderRequest.model`.
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

### Context ranking & assembly (`packages/context`) — **[IMPLEMENTED]**

- `ContextBuilderService` implements `ContextBuilderPort` (ADR-001
  "Deterministic Before AI"). `build(query, limit)` refreshes the injected
  `SearchPort`, runs a ranked search over the indexed context, resolves each hit
  to the source file that carries it, deduplicates file/symbol hits for the same
  file (keeping the highest score), and returns the surviving files as ranked
  `ContextItem[]` (source + content + score). `sourceFile(path)` returns one
  file's content as a single item. No AI is involved.
- The SDK `Container` wires this service in by default, so `getContext()` and
  `getRelevantContext()` work out of the box. Tests:
  `packages/context/tests/context-builder.test.ts`.

### SDK composition root (`packages/sdk`) — **[EXISTING]**

- `Container.create()` wires every default implementation behind its port;
  `ContainerOptions` lets callers override each service (the plugin seam).
- Constraint: default `Container` wires the deterministic `context` service
  behind `ContextBuilderPort` (see above).

### Context API / SDK (`packages/sdk/src/context/`) — **[EXISTING]**

- `createContextSDK({ repositoryPath | dbPath | contextDb })` — the stable,
  provider-independent read façade consumers use (files, symbols, dependencies,
  modules, summaries, search, project, status, relevant context).
- Reads go through `ReadRepositories` (→ `ContextDatabasePort`), writes through
  `WriteRepositories` (clear read/write split). No SQL/rows ever reach callers;
  errors are typed SDK errors (`FileNotFoundError`, `SymbolNotFoundError`, …).
- `getRelevantContext` is **deterministic** (search + persisted deps + stored
  summaries) — a richer assembly independent of `@atlas/context`'s ranker
  (ADR-001). Future vector ranking plugs into `@atlas/search`'s `RelevanceScorer`.
- The CLI's `atlas search` routes through this SDK instead of reaching for
  `Container.getSearch()`/`getContextDb()`. See
  [CONTEXT_SDK.md](./CONTEXT_SDK.md) + [ADR-005](./decisions/ADR-005.md).

### CLI (`apps/cli`) — **[IMPLEMENTED]**

- Commander.js program `atlas`, **20 top-level commands** — `init`, `build`,
  `update`, `scan`, `search`, `sessions`, `usage`, `metrics`, `explain`,
  `doctor`, `mcp`, `context`, `tools`, `providers`, `agents`, `ollama`, and the
  standalone agent launchers `claude`/`gemini`/`codex`/`opencode` (sugar over
  `atlas context launch --provider <agent>`; the future slash router remains
  planned).
  **`search` is wired
  to the Context SDK**: it opens `.codeatlas/context.db` (via `ATLAS_ROOT` or
  cwd) with `createContextSDK`, runs `context.search.search(...)`, and prints
  ranked hits. **`mcp` starts the MCP server** (`startStdioServer`) for the
  current project. **`sessions` manages agent sessions**
  (`list`/`info`/`stop`) via `createSessionManager()` from the SDK. **`usage`
  reports AI usage & credits** (`summary`/`list`/`budgets`, bare `atlas usage`
  = summary, `--json` per subcommand) through `createUsageService()` from the
  SDK against `.codeatlas/usage.db`. **`tools`** delegates to
  `createToolkitSDK()` for overview, registry search, info, install, remove,
  update, configure, and doctor. Install displays the exact command plus
  trust/risk before execution and requires `--yes` consent; all data commands
  support `--json`. **`init`/`build`/`update` run the SDK-owned indexer**
  (`indexProject`; `update` is incremental) and **`scan` prints a metadata-only
  project overview** (`scanProjectOverview`). **`explain`** resolves a target
  deterministically (file/module/symbol/concept) with optional `--ai` AI
  summaries, and **`doctor`** runs a PASS/WARN/FAIL health checklist (exit `1`
  on failure). **Standalone agent launch commands** exist for every agent with
  a launch adapter (`atlas claude`/`gemini`/`codex`/`opencode` `<prompt...>`:
  sugar over `atlas context launch --provider <agent>`, `--ai` briefing
  supported). No interactive `/agent`-style slash commands (the plan-executing
  agent router is planned).
- Dependency note: the CLI may import `@atlas/sdk` **and** `@atlas/mcp` (so it
  can start the server); enforced by ESLint. See `docs/DEPENDENCIES.md`.
- `atlas search` accepts positional query words plus `--repo`, `--limit`,
  `type`, `no-fuzzy`, and `json`; `--ai` additionally generates (or reuses
  stored) AI summaries for the top 5 file hits via `summaries.generateFile`,
  failing cleanly without a configured provider. It reports a friendly error
  and exit code `1` when no context database exists.
- Tests assert the command list, version, placeholder text, `atlas search`
  end-to-end against a fixture database (including the missing-index error),
  `atlas explain` (symbol/file/JSON/missing-index), `atlas doctor`
  (healthy/`--json`/render), and the `usage` rendering/CLI (`usageDbPath`,
  `formatMeasured`, `renderUsageSummary`, `renderUsageTable`, fresh-project
  empty output, JSON).

### MCP server (`packages/mcp`) — **[IMPLEMENTED]**

- `@atlas/mcp` is an MCP server over stdio (JSON-RPC 2.0) built on the official
  `@modelcontextprotocol/sdk`. It consumes **only** `@atlas/sdk` — every tool
  reads normalized context through `createContextSDK` sub-APIs
  (`symbols.searchSymbols`, `files.searchFiles`, `dependencies.query`,
  `modules.explain`, `summaries.*`, `project.overview`) — and is
  provider-independent: dialogue reads are deterministic; AI summary
  generation is opt-in per call (`get_summary ... generate: true`) and fails
  cleanly when no provider is configured.
- Exposes seven tools: `search_symbols`, `search_files`, `get_summary`,
  `get_dependencies`, `explain_module`, `project_overview`,
  `read_file_range`. Each has a zod
  input schema (validated by the SDK, surfaced as `-32602` on failure), an
  `outputSchema` the server validates `structuredContent` against, and returns
  `structuredContent` + a JSON text block; domain errors return
  `isError: true` with text content only (no `structuredContent`, so
  outputSchema-validating clients see the real error). Tools auto-refresh the
  index incrementally before reads when the working tree has changed, and
  report the outcome via `freshness` on every result.
  `read_file_range` is a version-aware working-tree read with
  freshness metadata (mirrors the Context SDK `files.readRange`).
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
- `atlas init`/`build`/`update` delegate to the SDK-owned `indexProject()` flow,
  which creates the manifest/database and reports hash changes. An explicit
  `--summaries` flag also generates an AI file summary per parsed file (cached
  by content hash, persisted to the `Summaries` table, failures counted not
  fatal — `update` only summarizes changed/added files). `atlas explain`
  resolves symbols/files/modules/concepts deterministically (AI summary only via
  explicit `--ai`), and `atlas doctor` runs a health checklist (exit `1` on
  failure).
- The extension is anonymous at the database: it never opens `.codeatlas`
  itself (see `docs/VSCODE.md`), and is tested headlessly.
- Interactive agent launching lived in the **TUI** (`atlas tui`), which is
  **v2 / not shipped** (untracked source; bare `atlas` prints help). The
  extension is a read-only context viewer.
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
- **Wired into the CLI for standalone launches**: `atlas context launch`
  and the `atlas claude`/`gemini`/`codex`/`opencode` `<prompt...>` commands
  deliver a Context Package through this port. **Not yet wired for *plan*
  routing** — the interactive slash router and `/claude`-style commands remain
  planned. Package
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
- **CLI wiring (Task 26) is implemented**: `atlas context <task>` builds and
  renders the package (the `context` command is a namespace whose `build`
  subcommand is the default, so `atlas context <task>` and
  `atlas context build <task>` are equivalent), `explain` renders content-free
  reasons, `json` emits machine-readable package/explanation data,
  `--ai` appends a provider-backed AI context briefing (success: briefing
  section in text / full `ContextBriefing` in JSON; failure: degrades to the
  deterministic package with `aiMessage` and still exits 0), and
  `launch`/`attach` deliver through the existing `SessionPort` (`--ai`
  prepends the briefing to the session prompt; a failed briefing still
  launches). Budget, instruction, overview, and repository/provider flags are
  forwarded to the SDK. The future slash
  router remains separate. Tests: `packages/sdk/tests/context-integration.test.ts`
  and `apps/cli/tests/cli.test.ts`.
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
- **No plan-router CLI wiring yet** — no interactive `atlas /claude`-style
  commands (see below); the standalone `atlas <agent> <prompt...>` launch
  commands above are a separate, non-orchestrated surface.
  Tests: `packages/sdk/tests/orchestrator.test.ts` (plan validation, parallel/
  sequential execution, timeouts, retries, cancellation, abort-on-failure,
  isolated scopes, orphan cleanup, live view, conflict detection).

### Unified AI CLI Orchestrator (`/gemini`, `/claude`, `/codex`, `/opencode`, ...) — **[PARTIAL]**

- **The connection layer, the session manager (`@atlas/agents`), and the
  plan-executing orchestrator (`@atlas/sdk`) exist; the standalone orchestrator
  router/CLI does not.** Agent
  sessions are implemented (`SessionManager` behind `SessionPort`, `atlas
  sessions list/info/stop`, interactive `stdio: "inherit"` launches).
  The interactive **TUI slash surface** (`atlas tui`: `/claude`, `/gemini`,
  `/codex`, `/opencode` detect → launch interactively → install via the Toolkit
  when missing; `/cursor` and `/grok` vendor guidance; `/agents`, `/toolkit`,
  `/tools-install <tool>`) is **v2 / not shipped** — its source is git-untracked.
- **Standalone launch commands are implemented** for every agent with a launch
  adapter: `atlas claude`/`gemini`/`codex`/`opencode` `<prompt...>` are thin
  wrappers over `atlas context launch --provider <agent>`, sharing the same
  context-assembly, `--ai` briefing, and rendering path
  (`apps/cli/src/commands/context.ts`).
- **`atlas agents` is implemented**: `atlas agents status` shows each AI coding
  tool (claude, gemini, codex, opencode, cursor, cline) and whether the
  CodeAtlas MCP server is registered for it; `atlas agents connect` registers
  the MCP server for installed, supported agents.
  There is still **no agent router** for the plan-executing
  orchestrator (Direction B) — the slash-command surface remains planned.

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
  validated here but evaluated by later tasks** (Tasks 21–24). No network,
  no database. See [TOOL_REGISTRY.md](./TOOL_REGISTRY.md).
- **The Configurator (Task 23) is implemented**: `ConfiguratorPort` with
  Claude/Gemini/Codex/OpenCode/MCP/VS Code adapters, AgentPort-backed target
  detection, merge/backup/rollback/read-back verification, dry-run support,
  SDK composition, and `atlas tools configure`.
- **Security/Trust (Task 24) is implemented**: `SecurityPort` and the pure,
  offline `SecurityAssessor` run license, source, dependency, install-command,
  permission, maintainer, release-provenance, and repository checks. Each check
  has a verdict; the assessor produces risk plus exactly
  `verified`/`reviewed`/`community`/`unverified`/`blocked`. Missing evidence
  defaults to `unverified`, documented human review is required for promotion,
  hostile metadata is rejected, and the Installer uses the result as a hard
  gate. `unverified` requires explicit installation consent; `blocked` cannot
  be overridden. See [AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md) §7–§8.
- The remaining `atlas tools`/`/tools` surface remains [PLANNED]. See
  [AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md).

### Tool Manifest System — **[IMPLEMENTED]**

- **Task 20 implemented.** `@atlas/toolkit` now ships a **versioned, validated,
  extensible Tool Manifest schema** (`TOOL_MANIFEST_SCHEMA_VERSION = 1`) that
  records **one installed tool's state** on the user's machine — which tool +
  version, where it came from (registry entry / ecosystem / release / manual),
  install method + provenance (argv, never a shell string), verification result,
  applied configuration + the agents it was configured for, the trust/security
  snapshot at install time, and a doctor-able integration state.
  Installation is declared for **all seven ecosystems** (`npm`/`pip`/`cargo`/
  `go`/`binary`/`github-release`/`mcp`) as requirements (`type`, `package`,
  `source`, `checksum`, `versionRange`) — **nothing is executed**.
- **Persistence mirrors the Scanner manifest pattern**: one file per installed
  tool at `.codeatlas/tools/<name>.json` (gitignored), merge policy
  (`installedAt` preserved / `updatedAt` refreshed), validated **before any
  write**.
- **Loaded as untrusted input**: corrupted/hostile manifests fail with typed
  errors (`ManifestValidationError` / `ManifestSchemaVersionError` /
  `ManifestLoadError`) — never a crash, never executed; prototype-pollution
  safe (`__proto__` preserved inertly), size-bounded (1 MiB), and tool names are
  path-safe (can never escape `tools/`). Unknown-but-well-formed fields are
  **preserved** across serialize/parse (extensibility).
- Manifest persistence is toolkit-internal and exported from `@atlas/toolkit`
  (`createToolManifest`, `saveToolManifest`, `loadToolManifest`,
  `listInstalledTools`, `validateToolManifest`, `parseToolManifest`); the
  higher-level installer/configurator services are composed through the SDK,
  including `atlas tools configure`. No network, no database. See
  [TOOL_MANIFEST.md](./TOOL_MANIFEST.md).

### Compatibility Engine — **[IMPLEMENTED]**

- **Task 21 implemented.** `@atlas/toolkit` ships the **Compatibility Engine**
  (`compatibility.service.ts` behind `CompatibilityPort` in `core`, composed by
  the SDK as `createCompatibilityEngine()`): it determines whether a tool
  **can safely operate in the user's environment** before any install or
  configuration step. It compares a tool's *declared* requirements (a Tool
  Manifest's `compatibility` object — OS, architecture, runtimes with version
  ranges, package-manager availability, AI CLIs, MCP, permissions) against the
  *detected* environment and returns one of four states
  (`compatible` / `partially-compatible` / `incompatible` / `unknown`) with
  per-check evidence, grouped sub-checks, and a single overall verdict.
- **Trust rules enforced**: it **never installs anything** and **never fails
  open** — an `incompatible` tool is reported as **not installable in this
  environment** (rendered explicitly, never silently skipped). `unknown` means
  "cannot determine" and is **flagged, never guessed** (e.g. a runtime version
  that cannot be parsed downgrades to `unknown`, not a guess). Declared
  permissions are **advisory** — reported but never downgrade the verdict
  (enforcement belongs to the installer's consent flow).
- **AI-CLI detection is not reimplemented**: every agent check routes through
  `AgentPort` (`@atlas/agents`). OS aliases (`windows`→`win32`,
  `macos`→`darwin`) and architecture aliases (`x86_64`/`amd64`→`x64`) are
  normalized. Environment detection (`EnvironmentDetector`) is **read-only and
  offline** — no network, no implicit installs, binaries located by PATH
  scanning (`spawn`-safe, no shell strings).
- **SDK surface**: `createCompatibilityEngine()` in `@atlas/sdk` (defaults to a
  real `AgentService` + `EnvironmentDetector`; both injectable for offline
  tests). `renderCompatibilityReport()` turns a report into the design
  contract's per-check `✓ / ~ / ✗ / ?` output. `atlas tools configure` is now
  wired through the Toolkit SDK; the future slash surface is planned. See
  [AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md) §6.

### Tool Installer — **[IMPLEMENTED]**

- **Task 22 implemented.** `@atlas/toolkit` ships the **Tool Installer**
  (`installer.service.ts` behind `InstallerPort` in `core`, composed by the SDK
  as `createInstaller()`), with **one adapter per ecosystem**
  (`installer-adapters.ts`: `NpmAdapter` / `PipAdapter` / `CargoAdapter` /
  `GoAdapter`) mirroring the `ProviderPort`/`AgentPort` adapter pattern — a new
  ecosystem is a new small adapter, not a fork. A safe MVP subset (`npm`, `pip`,
  `cargo`, `go`) is executable; `binary` / `github-release` / `mcp` are declared
  by the port but not yet implemented (adding one is a new adapter).
- **Official distribution channels only** — every command is spawned through the
  ecosystem's own package manager (`npm install --global`, `pip install --user`,
  `cargo install`, `go install <mod>@<ver>`); it **never** downloads a repo and
  runs a third-party install script.
- **Gates before anything runs**: request validation (safe tool name + real
  working dir), the **Compatibility Engine** (Task 21 — an `incompatible` tool
  is `InstallNotCompatibleError`), and a **security gate** (`blocked` status or
  trust ⇒ `InstallBlockedError`, even with approval). `plan()` builds the exact
  command and never executes.
- **Approval is always required** — `install()` runs the same gates then aborts
  with `InstallApprovalDeniedError` unless `approval.granted === true`; the
  caller shows the exact `command`/`effect`/`dangerous` flags first.
- **Command injection is structurally prevented** — every command is spawned as
  an **argument array** with `shell:false` (`installer-process.ts`); hostile
  manifest/registry values are rejected (leading `-`, whitespace, control
  chars, oversized) or, if they pass, arrive as a single inert argv element.
  Captured output is bounded and **secret-redacted**; no env/keys are ever
  logged.
- **Verification + provenance + rollback**: after install the binary is resolved
  on PATH and, when a `versionRange` is declared, the detected version is
  checked — the outcome records `verified` / `unverified` / `failed` honestly. A
  Tool Manifest (Task 20) is recorded (`.codeatlas/tools/<name>.json`) with the
  exact argv, verification status, and timestamp. On a failed install the
  pre-install state is restored best-effort (`npm`/`pip`/`cargo` uninstall) when
  the tool was not already present; `go` (no module-uninstall) reports rollback
  as unsupported honestly.
- **Tests** (`packages/toolkit/tests/installer-*.test.ts`): adapters build exact
  argument arrays; compatibility/security gates block; approval required;
  install→verify→manifest flow and rollback against a fake package-manager
  executable; adversarial tests assert no shell syntax, path traversal, or
  secret exfiltration is possible. SDK `createInstaller()` is exercised in
  `packages/sdk/tests/toolkit.test.ts`. See [AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md) §5.



---

## 4. Intended vs. actual

| Intended direction                    | Status in repo |
| ------------------------------------- | -------------- |
| **A. Context Engine** (scan → parse → graph → store → search → feed AI) | ~90% implemented; context ranking is deterministic (ADR-001, no AI); `search` + `mcp` are CLI-wired |
| **B. Unified AI CLI Orchestrator** (`/claude`, `/gemini`, …) | Partial — the connection layer (`@atlas/agents` behind `AgentPort`), the session manager (`SessionManager`, `atlas sessions`, interactive `stdio: "inherit"` launches), and the **multi-agent plan orchestrator** (`createOrchestrator` in `@atlas/sdk`) are implemented; **standalone launch commands** (`atlas claude`/`gemini`/`codex`/`opencode` `<prompt...>` with `--ai` briefing) are implemented; the **`atlas tui` slash surface** (`/claude`–`/opencode` launch/install, `/cursor` `/grok` guidance, `/agents`, `/toolkit`) is **v2 / not shipped** (untracked); the plan-executing standalone router / `atlas agents` CLI remains planned |
| **C. Agent Toolkit** (curated tool registry → assess → install → configure → verify) | ~65% — Tasks 19–25 implemented: Registry, Manifest, Compatibility Engine, Installer, Configurator, Security/Trust, and the thin SDK-backed Toolkit CLI; `/tools` slash integration and `atlas setup` remain planned |

The existing code fully implements **Direction A's pipeline layers** but stops
at: (1) the **standalone router** of the orchestrator (the plan-executing
orchestrator itself exists in `@atlas/sdk`, and the TUI slash surface that
covered agent launch/install is v2/untracked), and (2) any editor integrations
beyond VS Code.
MCP (`@atlas/mcp`) and the VS Code extension (`@atlas/extension`)
are thin consumers of the SDK; JetBrains/other editor integrations are still
absent.

---

## 5. Cross-cutting facts & known inconsistencies

1. **Engine floor.** All packages and the root require Node `>=22.5.0`
   (`node:sqlite` in `storage`/`usage`). Running on Node <22.5 breaks the
   storage layer and anything that reads the context database.
2. **Provider default model ids are best-effort current values** — verified
    against vendor docs as of 2026-08 (`claude-sonnet-5`, `gemini-2.5-pro`,
    `gpt-5.6`, `deepseek-v4-flash`, `llama3.2`), not live-checked; always
    overridable per request.
3. **Git history exists.** The repository is a git repo (branch `main`) with a
   full Conventional-Commits history; `.husky`/`commitlint`/`.gitignore` are
   configured and active.
4. **CI/CD**: `.github/workflows/ci.yml` runs `pnpm check`-style gates (Node 22,
   pnpm 9.15.0) on push/PR to `main`.
5. **`.codeatlas/`**: `atlas init`/`build`/`update` (SDK-owned `indexProject`)
   write `manifest.json` and `context.db`; `@atlas/usage` writes `usage.db`; the
   Toolkit writes `tools/<name>.json`. See [CONTEXT_STORAGE.md](./CONTEXT_STORAGE.md).
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
