# @atlas/storage

The SQLite **Context Database** for CodeAtlas. Persists the whole project
context — files, symbols, dependencies, modules, summaries, relationships,
hashes, and metadata — behind the `ContextDatabasePort` contract, using the
repository pattern with migrations, versioning, and transaction support.

Implements `ContextDatabasePort` (and the legacy `StoragePort`) from
`@atlas/core`.

> **Status: implemented.** SQLite (via `node:sqlite`), 8 tables, repository
> pattern, migrations + versioning, transactions, search. No AI logic lives
> here — persistence only.

## Tables

`Files`, `Symbols`, `Dependencies`, `Modules`, `Summaries`, `Relationships`,
`Hashes`, `Metadata`, plus a `Migrations` table tracking applied schema
versions.

## Features

- **`saveContext` / `loadContext` / `updateContext` / `deleteContext` /
  `searchContext`** — full replace, snapshot read, incremental merge, targeted
  delete with dependent cleanup, and `LIKE`-based search across files, symbols,
  summaries, and modules.
- **Repository pattern** — one repository per table (`FileRepository` …);
  callers never write SQL.
- **Migrations + versioning** — an ordered `Migration[]` applied
  transactionally; idempotent across reopens.
- **Transactions** — `transaction(fn)` (BEGIN IMMEDIATE / COMMIT / ROLLBACK)
  wraps every public mutation; nested calls reuse the open transaction.
- **Fast reads** — WAL journaling (file-backed), indexes on the hot columns,
  and a synchronous driver.

## Usage

```ts
import { ContextStore } from "@atlas/storage";

const store = new ContextStore({ filePath: ".codeatlas/context.db" });

store.saveContext({
  files: [{ path: "/a.ts", language: "typescript", content: "…" }],
  symbols,
  dependencies: [{ from: "n:file:/a.ts", to: "n:s1", kind: "calls" }],
  summaries,
});

const snapshot = store.loadContext();
const matches = store.searchContext("Parser"); // ranked files/symbols/…
store.updateContext({ summaries: [newSummary] }); // merge
store.deleteContext({ kind: "file", path: "/a.ts" });
store.close();
```

## Public API

- `ContextStore` — the `ContextDatabasePort` implementation
  (`{ filePath?, migrations? }`; `":memory:"` for a throwaway store).
- `Transaction` support via `store.transaction(fn)`.
- `MIGRATIONS` / `runMigrations` / `Migration` — schema versioning.
- `StorageService` — the legacy `StoragePort` facade (projects, files, symbols)
  over an in-memory store by default.

## Notes

- `node:sqlite` requires Node ≥ 22.5 (the runtime here is Node 24).
- `searchContext` uses indexed `LIKE` queries for the identifier columns;
  FTS5 is the future upgrade path for full-text content search.