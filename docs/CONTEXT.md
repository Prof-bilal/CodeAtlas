# CodeAtlas Context — How CodeAtlas Understands a Repository

This document explains the **context pipeline**: how CodeAtlas turns a source
tree into a persistent, queryable model of the repository, and how that model
stays fresh. It complements [ARCHITECTURE.md](./ARCHITECTURE.md) (structure),
[MODULES.md](./MODULES.md) (ownership), [CONTEXT_STORAGE.md](./CONTEXT_STORAGE.md)
(on-disk layout), and [CONTEXT_SDK.md](./CONTEXT_SDK.md) (the read API
consumers use).

> Everything here describes behavior verified against the code. Where a stage
> is only partially wired from the CLI, that is stated explicitly.

---

## 1. The pipeline at a glance

```text
Repository
   │  walk + ignore rules
   ▼
Scanner ────────► ProjectScan (files, folders, languages, framework) ──► manifest.json
   │
   │ read files (only the ones that changed)
   ▼
Hashing ────────► SHA-256 snapshots; classifies changed / added / deleted / unchanged
   │
   ▼
Parser ─────────► normalized Symbol[] per file (TypeScript via ts-morph)
   │
   ▼
Symbol Indexer ─► in-memory find/list/children + cross-file reference resolution
   │
   ▼
Graph ──────────► directed graph: imports, calls, extends, implements, references, contains, …
   │
   ▼
AI Summaries ───► optional; structured file/folder/module/project summaries (provider)
   │
   ▼
Context DB ─────► SQLite: Files, Symbols, Dependencies, Summaries, Modules,
   │               Relationships, Hashes, Metadata (8 tables, repositories,
   │               migrations, transactions)
   ▼
Search ─────────► in-memory ranked index over a ContextSnapshot (fuzzy, vector-ready seam)
   ▼
Context SDK ─────► createContextSDK (files/symbols/dependencies/modules/summaries/search/
                   project/status) — what consumers read
   ▼
Consumers: atlas search · MCP tools · VS Code extension · agents
```

Two important notes on what is wired **today**:

- Each layer is implemented and tested as a package, and the end-to-end
  indexing **CLI pipeline** is wired: `atlas init`/`build`/`update` run the
  SDK-owned incremental indexer (see §3), and `atlas scan` prints the
  `ProjectScan` overview. `createContextSDK` reads the resulting database,
  which is exactly how the CLI `atlas search` and the MCP tools work.
- `@atlas/context` (rank/assemble "the most relevant context for an LLM") is an
  **intentional stub** (ADR-001). The SDK's `getRelevantContext` is a
  *deterministic* assembly built from `@atlas/search` + stored data — it does
  not use the stub.

## 2. Layer by layer

### Scanner (`@atlas/scanner`)
Deterministic, read-only discovery. `scanProject(root)` produces a `ProjectScan`:
files with metadata (absolute path, name, extension, size, detected language),
a nested tree, folder/file totals, languages, and root markers (`package.json`,
`tsconfig`, `README`, `.git`, framework signals). It applies a built-in,
configurable, case-insensitive ignore list (`node_modules`, `.git`, `dist`,
`build`, `.next`, `coverage`, `vendor`). `readFile` decodes one file into a
`SourceFile` for the parser. It also generates
`.codeatlas/manifest.json` (repo metadata + context versioning) — see
[CONTEXT_STORAGE.md](./CONTEXT_STORAGE.md).

### File hashing (`@atlas/hashing`)
Hashing is what makes the pipeline **incremental**. `buildSnapshot` hashes every
path (SHA-256, hex). `compareHashes(previous, current)` classifies every known
path as `changed`, `added`, `deleted`, or `unchanged`. `getChangedFiles` returns
`changed` + `added` (deleted files cannot be re-processed). Snapshots are
versioned JSON (`SNAPSHOT_VERSION = 1`) so they can persist between runs — the
caller decides where. Hashing decides *what changed*, never *what to do*.

### Parsing & symbols (`@atlas/parser`)
The parser turns **only the files it is given** into a language-agnostic
intermediate representation — normalized `Symbol`s — so the rest of the
pipeline never depends on the source language. `LanguageParser`
(`typescript`) / `ParserRegistry` is the plugin seam for new languages.

A `Symbol` carries a normalized kind (class, interface, function, method,
property, variable, constant, constructor, import, export, enum, enum-member,
type-alias), a 1-based location, parent id, visibility, modifiers, type text,
documentation, and — for imports/exports — the module specifier. `SymbolIndexer`
indexes the session's symbols and resolves references across files
(`./x`/`../x` → `x.ts`/`x.tsx`/`x/index.ts`/`x/index.tsx`).

**Known parser gaps** (unchanged; tracked in `FEATURE_STATUS.md`):
- renamed imports (`import { a as b }`) and `export default <expression>` do
  **not** resolve cross-file;
- namespaces and bare expressions are not extracted.

### Dependency graph (`@atlas/graph`)
`GraphService.build(symbols, references)` turns symbols + resolved references
into a directed graph. Nodes are symbols plus one file pseudo-node per file.
Edges are categorized (`calls`, `constructs`, `accesses`, `references`, `reads`,
`writes`, `extends`, `implements`, `imports`, `exports`, `contains`). It answers
dependency/dependent queries, `shortestPath` (BFS), `detectCircularDependencies`
(Tarjan SCC), and `exportJson`. It keeps its **own copy of module-path
resolution** (`module-resolution.ts`) so it never imports the parser — a
deliberate, documented duplication.

### AI summaries (`@atlas/summary`) — optional
Deterministic analysis does not need AI. When a provider **is** configured,
`SummaryService` builds structured summaries (`overview` + `keyPoints`) for a
file, folder, module, or project from a single template, asks for strict JSON,
and **content-hash caches** so only changed files reach the model
(`metadata.cacheHit`). Without a provider, every summary call fails cleanly
with a `fail` `Result` — the pipeline never depends on AI.

### Context database (`@atlas/storage`)
Persists the analysis: eight tables (Files, Symbols, Summaries, Modules,
Dependencies, Relationships, Hashes, Metadata) behind `ContextStore`, which
implements `ContextDatabasePort`. Full replace (`saveContext`), merge
(`updateContext`), targeted deletes (`deleteContext`), full read
(`loadContext`), and a LIKE-based fallback search (`searchContext`, exact/prefix/
substring scoring with snippets). SQLite via `node:sqlite`
(Needs Node `>=22.5.0`), synchronous, migrations versioned in a `Migrations`
table, transactions, `.`, WAL for file-backed stores, foreign keys enforced.
A legacy `StorageService` satisfies the older `StoragePort` over the same store.

### Search (`@atlas/search`)
`SearchService` builds an **in-memory index** from a `ContextSnapshot` (loaded
through an injected `ContextDatabasePort`) and returns ranked hits across
**files, symbols, modules, dependencies, and summaries**. Default ranking is a
deterministic `LexicalScorer`: exact → prefix → whole-token → substring → fuzzy
(Levenshtein), with fields damped by type. `RelevanceScorer` is the seam where a
future embedding/vector scorer can be swapped in — **no embeddings today**.
(There is also the DB-level `searchContext` LIKE fallback in `@atlas/storage`.)
Search neither parses nor persists; it reads the snapshot only.

### Context API/SDK (`@atlas/sdk`)
The stable read (and write) façade — `[CONTEXT_SDK.md](./CONTEXT_SDK.md)`. It
hides the database behind repositories, returns normalized models, exposes
typed errors (`FileNotFoundError`, `SymbolNotFoundError`, …), and adds
deterministic `getRelevantContext(query)`. `atlas search`, the MCP tools, and
the VS Code extension read context **only** through this SDK.

---

## 3. Context lifecycle

```text
create → scan → hash → parse → graph → (summaries?) → store → query → serve
                           ▲
                           └── only changed/added files re-parsed
```

- **Index lifetime.** The context database (`<root>/.codeatlas/context.db`) is a
  **cache of the repository, not an authoritative store** — it can be deleted
  and rebuilt from source. `.codeatlas/` is gitignored.
- **Incremental updates.** Hash snapshots + `updateContext` (merge, not full
  replace) are the building blocks of an incremental `atlas update`. The
  hash diff classifies every path as `changed`/`added`/`deleted`/`unchanged`
  and drives the reported counters. **Verified behavior:** the SDK-owned
  indexer (`@atlas/sdk` `indexProject`, which `atlas init`/`build`/`update` run)
  is **incremental** — on `update` it re-reads and re-parses only
  `changed` + `added` TypeScript files, reuses the persisted snapshot
  (files/symbols/hashes) for `unchanged` files, carries over usage edges from
  untouched files, deletes `deleted` files via `deleteContext`, prunes removed
  folder modules, and merges the new state with `updateContext`. A full `build`
  still performs a complete replace (`saveContext`).
- **Trouble/fresh index.** When `.codeatlas/context.db` is missing,
  `atlas search`, the MCP server tools, and the Context SDK return a clean
  "no index" state; the SDK opens lazily so server code can wait for the index
  to appear.

## 4. Invariants (do not break)

- **Facts are deterministic-first.** Symbols, the graph, and search are computed
  statically; AI only *adds* summaries/explanation. Never use an LLM for a fact
  the parser/graph can compute.
- **Everything is local first.** No implicit network; AI provider calls are
  explicit and send narrow context (see [PRIVACY.md](./PRIVACY.md)).
- **No stale context being read as fresh.** Reads honour the persisted version;
  the SDK reports `status()` with the saved-at timestamp.
- **Incremental > wholesale.** Respect hashing; do not rescan/ re-parse the
  entire repository without a reason.
- **Persistence lives in `@atlas/storage`.** No other package writes the
  context database directly.

---

## 5. Feedback to the reader

| Question | Where the answer lives |
| -------- | ---------------------- |
| How is a file's language detected? | `@atlas/scanner` (`language.ts`) |
| How does change detection work? | `@atlas/hashing` (`diff.ts`, `hash.service.ts`) |
| What symbols does the parser emit and how? | `@atlas/parser` (`extractors.ts`, `symbol-indexer.ts`) |
| How is the graph built? | `@atlas/graph` (`graph.service.ts`) |
| What tables exist / what's stored? | `@atlas/storage` (`schema.ts`, `migrations.ts`) |
| How is search scored? | `@atlas/search` (`scoring.ts`, `fuzzy.ts`) |
| What is the stable read API? | [CONTEXT_SDK.md](./CONTEXT_SDK.md) |
| Where does data live on disk? | [CONTEXT_STORAGE.md](./CONTEXT_STORAGE.md) |

> **Ground truth:** [`CURRENT_STATE.md`](./CURRENT_STATE.md) and
> [`FEATURE_STATUS.md`](./FEATURE_STATUS.md) reflect what is actually
> implemented, and are authoritative over any description here.