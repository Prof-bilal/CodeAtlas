# CodeAtlas Context SDK

Provider-independent, stable programmatic API for reading (and, for the
indexing pipeline, writing) a project's indexed context. **This is the single
interface consumers use to access repository context** — CLI, MCP, editors, and
agents must not touch the SQLite database directly.

The database is an implementation detail, hidden behind repositories.

---

## 1. Purpose

The Context SDK exists so that consumers depend on **interfaces, not database
implementation details**:

```text
Consumer (CLI / MCP / editor / agent)
        │
        ▼
  Context SDK  (@atlas/sdk → createContextSDK)
        │
        ▼
  Repositories  (ReadRepositories / WriteRepositories → ContextDatabasePort)
        │
        ▼
  Context Database (SQLite, owned by @atlas/storage)
```

- Every `@atlas/*` import a consumer would otherwise reach for
  (`@atlas/search`, `@atlas/storage`, `@atlas/summary`) stays internal.
- Consumers never see SQL, table names, or raw rows.
- `atlas search` already routes through this SDK (see `docs/CLI.md`).

> **Why not `@atlas/context`?** That package is the *ranking/assembly* stub
> behind `ContextBuilderPort` (see [ADR-001](./decisions/ADR-001.md)). The SDK
> is a different concern — a read/write query façade — and lives in
> `@atlas/sdk` (see [ADR-005](./decisions/ADR-005.md)).

---

## 2. Quick start

```ts
import { createContextSDK } from "@atlas/sdk";

const context = createContextSDK({ repositoryPath: "/path/to/repo" });
// or: createContextSDK({ dbPath: "/path/to/repo/.codeatlas/context.db" });

const hits = context.search.search("authentication");
for (const hit of hits) {
  console.log(hit.kind, hit.title, hit.score);
}

const overview = context.project.overview();
console.log(`${overview.counts.files} files indexed`);

context.close(); // releases the SQLite handle
```

The resolved database path honours `ATLAS_ROOT`/`ATLAS_DB`, or defaults to
`<repositoryPath>/.codeatlas/context.db`.

---

## 3. Architecture

`packages/sdk/src/context/`:

| File | Role |
| ---- | ---- |
| `models.ts` | Normalized, serializable context models |
| `errors.ts` | Typed SDK errors (never leak raw driver errors) |
| `nodes.ts` | Graph node-id helpers + label resolution |
| `repositories.ts` | `ReadRepositories` / `WriteRepositories` over the port |
| `sdk.ts` | `createContextSDK`, the sub-API interfaces, the façade |

Layering is strict:

```text
Consumer
   ↓  (imports only @atlas/sdk)
ContextSDK  (sdk.ts — application-level operations)
   ↓
ReadRepositories / WriteRepositories (repositories.ts — persistence boundary)
   ↓
ContextDatabasePort (the only way data is read/written)
```

---

## 4. Public API

`createContextSDK(options)` returns a single façade with these sub-APIs:

### `context.files`

| Method | Returns | Notes |
| ------ | ------- | ----- |
| `getFile(path)` | `FileContentContext` | throws `FileNotFoundError` when missing |
| `listFiles()` | `readonly FileContext[]` | metadata + size, no content |
| `searchFiles(query, opts?)` | `readonly SearchResult[]` | ranked file hits |
| `readRange(path, request)` | `ReadRangeResult` | version-aware line range read — see below |

### `context.symbols`

| Method | Returns | Notes |
| ------ | ------- | ----- |
| `getSymbol(id)` | `SymbolContext` | throws `SymbolNotFoundError` |
| `listSymbols()` | `readonly Symbol[]` | |
| `searchSymbols(query, opts?)` | `readonly SearchResult[]` | `opts.kind` filters by symbol kind |
| `findDefinition(id)` | `SymbolContext` | the declaration |
| `findReferences(id)` | `readonly SymbolReference[]` | incoming persistent edges |

### `context.dependencies`

| Method | Returns | Notes |
| ------ | ------- | ----- |
| `getDependencies(target)` | `readonly DependencyContext[]` | what `target` depends on |
| `getDependents(target)` | `readonly DependencyContext[]` | what depends on `target` |
| `getDependencyGraph()` | `readonly DependencyContext[]` | all edges, labels resolved |
| `query({node?, relation?, direction?, limit?})` | `{ edges, nodeFound, total }` | filter by node, relation, direction (`outgoing`/`incoming`/`both`), limit |

`target`/`node` accepts a file path, symbol id, symbol name, or raw `n:…` node id.

### `context.modules`

| Method | Returns |
| ------ | ------- |
| `listModules()` | `readonly ModuleContext[]` |
| `getModule(path)` | `ModuleContext \| undefined` |
| `explain(path, {includeSummary?, includeDependencies?})` | `ModuleExplanation` |

### `context.summaries`

| Method | Returns |
| ------ | ------- |
| `listSummaries()` | `readonly Summary[]` |
| `getSummary(target, scope?)` | `Summary \| undefined` |
| `getFileSummary(path)` | `Summary \| undefined` |
| `getModuleSummary(path)` | `Summary \| undefined` |
| `getProjectSummary()` | `Summary \| undefined` |
| `generateFile(path, opts?)` | `Promise<Result<Summary>>` (AI, optional) |
| `generateFolder(target, opts?)` | `Promise<Result<Summary>>` (AI, optional) |
| `generateModule(target, opts?)` | `Promise<Result<Summary>>` (AI, optional) |
| `generateProject(opts?)` | `Promise<Result<Summary>>` (AI, optional) |

Summary generation is **AI-optional**: it fails cleanly (a `fail` `Result`)
when no provider is configured, and the SDK is fully usable for reads without
one.

### `context.search`

| Method | Returns |
| ------ | ------- |
| `search(query, opts?)` | `readonly SearchResult[]` (ranked, fuzzy-aware) |

`opts` supports `types`, `limit`, `fuzzy`, `minScore` — all relayed to
`@atlas/search`'s `SearchPort`, so fuzzy/vector behavior and scoring stay
identical to `atlas search`.

### `context.project`

| Method | Returns | Notes |
| ------ | ------- | ----- |
| `stats()` | `ProjectCounts` | files/symbols/modules/dependencies/summaries |
| `overview(detail?)` | `ProjectOverview` | counts + languages + schema version + summary; `detail: "full"` also lists modules/topFiles/topSymbols |

### `context.write`  (indexing pipeline only)

| Method | Returns | Notes |
| ------ | ------- | ----- |
| `save(data)` | `number` | full replace |
| `update(data)` | `number` | merge/upsert |
| `delete(target)` | `number` | file / symbol / store |

**Read/write separation is deliberate.** Consumers (CLI, MCP, editors, agents)
should normally use the read APIs; the indexing pipeline owns writes so no
random component can corrupt the context database.

### Status & relevant context

| Method | Returns | Notes |
| ------ | ------- | ----- |
| `status()` | `ContextStatus` | version, `lastUpdated`, `available`, indexed counts |
| `freshness()` | `Promise<FreshnessSignal>` | `fresh`/`stale`/`unknown`/`unavailable` vs the working tree, with `changed`/`added`/`deleted` file lists — compares persisted hashes against on-disk files |
| `getRelevantContext(query)` | `RelevantContext` | deterministic assembly for an AI task |
| `config` | `ContextSDKConfig` | resolved repository/db paths |
| `isAvailable` | `boolean` | false when `.codeatlas/context.db` is missing |
| `close()` | `void` | release the SQLite handle |

#### Version-aware range reads

`files.readRange(path, { startLine, endLine, padding?, expectedHash? })` reads a
line range from the **working tree** and compares it against the persisted
version, so an agent never acts on context that is no longer current:

- `padding` (default `5`) widens the range to give the LLM surrounding lines;
  `padded: false` when `padding: 0`.
- `hash` is the SHA-256 of the current file; `versionMatch: false` (plus a
  `message`) when `expectedHash` was supplied but the file changed since it was
  generated — the content returned is the **current** on-disk text, never stale.
- `stale: true` when the file is not on disk (the read falls back to indexed
  content) or the persisted hash no longer matches.
- `path` may be absolute or relative to `config.repositoryPath`.

---

## 5. Data models

The SDK returns **normalized, serializable models**, never raw rows:

- `FileContext` / `FileContentContext` — path, language, size, (content), optional summary.
- `SymbolContext` — reuses the core `Symbol` entity.
- `DependencyContext` — `from`/`to` node ids + resolved `fromLabel`/`toLabel`/`kind`.
- `ModuleContext` — `path`/`name`/`moduleType`.
- `SummaryContext` — the core `Summary` entity.
- `SearchResult` — the core `SearchResult` shape (ranked).
- `ProjectCounts` / `ProjectOverview` / `ContextStatus` / `RelevantContext` —
  aggregates computed by the SDK.

Where a stable entity already exists in `@atlas/core`, it is reused instead of
reinvented.

---

## 6. Error handling

All SDK operations surface **typed** errors (see `packages/sdk/src/context/errors.ts`):

| Error | When |
| ----- | ---- |
| `ContextUnavailableError` | no `.codeatlas/context.db` (or the SDK is closed) |
| `FileNotFoundError` | `files.getFile()` on an unindexed path |
| `SymbolNotFoundError` | `symbols.getSymbol()` / `findDefinition()` on unknown id |
| `DependencyNotFoundError` | a dependency `target` resolves to no node |
| `InvalidQueryError` | empty search/relevant-context query |
| `DatabaseError` | the underlying driver failed ("cause" is preserved) |

Every error extends `ContextError` (which extends `Error`) and keeps a stable
`name`. Raw SQLite/driver errors are never thrown at consumers.

---

## 7. Search

`context.search.search(query, { types, limit, fuzzy, minScore })` delegates to
`@atlas/search`'s ranked, typo-tolerant index over files, symbols, modules,
dependencies, and summaries. It returns normalized `SearchResult` hits
(`kind`, `title`, `path`, `targetId`, `score`, optional `relation`/`snippet`),
so callers do not need to know which table produced a hit.

---

## 8. Relevant context

`getRelevantContext(query)` deterministically assembles:

- the top matching **files** and **symbols** (via search),
- stored **summaries** for those files plus the project summary,
- the **dependency edges** touching the selected nodes,
- all modules and the **project overview**.

```ts
const relevant = context.getRelevantContext("fix login bug");
for (const symbol of relevant.symbols) console.log(symbol.name, symbol.filePath);
```

This is **not** the `@atlas/context` ranking stub (ADR-001 stays untouched).
Assembly is deterministic and vector-free today.

---

## 9. Future vector-search compatibility

`getRelevantContext` and `search` both route through `@atlas/search`'s
`RelevanceScorer` seam. A future embedding scorer can be added **inside
`@atlas/search`** without changing the SDK: callers keep calling
`context.search.search(...)` / `context.getRelevantContext(...)` and
automatically get semantic ranking. No vector database, embeddings, or
provider integration ships with this SDK.

---

## 10. MCP / VS Code / Agent mapping

The sub-APIs map one-to-one onto the MCP tools and the VS Code extension
(`@atlas/mcp` and `@atlas/extension`, both thin SDK consumers):

```text
MCP tool: search_symbols     → context.symbols.searchSymbols(...)
MCP tool: search_files       → context.files.searchFiles(...)
MCP tool: get_dependencies   → context.dependencies.getDependencies(...)
MCP tool: get_summary        → context.summaries.getFileSummary / getModuleSummary...
MCP tool: explain_module     → context.modules.getModule + context.modules.listModules
MCP tool: project_overview   → context.project.overview() + context.project.stats()
MCP tool: read_file_range    → context.files.readRange(...)
```

Consumers never learn the underlying package layout or SQLite schema.