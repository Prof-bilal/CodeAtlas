# CodeAtlas Context Storage

How CodeAtlas persists project context, and the on-disk `.codeatlas/` layout.

> **Status:** the `.codeatlas/` directory is created by the Scanner manifest
> step; **`manifest.json`** is written today ([IMPLEMENTED]) and the
> **`tools/`** directory — one Tool Manifest per installed tool — is written by
> `@atlas/toolkit`'s `saveToolManifest` ([IMPLEMENTED], Task 20). The
> **`context.db`** file is *read* by `atlas search`, the MCP server, and the VS
> Code extension (via `createContextSDK`), and is **written by the SDK-owned
> incremental indexer** that `atlas init`/`build`/`update` run ([IMPLEMENTED]).
> The rest of the layout is **target** ([PLANNED]). See
> [CURRENT_STATE.md](./CURRENT_STATE.md).

---

## 1. Location & identity

- Every indexed repository gets a **`.codeatlas/`** directory at its root —
  gitignored (see `.gitignore`: `.codeatlas/`).
- It is local, per-project, and can be rebuilt from source at any time (it is a
  **cache/index of the repo**, not an authoritative store).

### Target layout

```text
.codeatlas/
├── manifest.json       # repo metadata + context versioning   [IMPLEMENTED]
├── context.db          # SQLite context database        [READ now][no CLI writer yet]
├── tools/              # per-installed-tool manifests          [IMPLEMENTED]
├── graph.json          # exported dependency graph (optional)   [PLANNED]
├── symbols.json        # exported symbol index (optional)       [PLANNED]
├── usage.db            # local AI usage store                   [IMPLEMENTED]
└── metadata/           # run logs, migration versions, etc.     [PLANNED]
```

> **Do not** assume `context.db` exists in a project yet: nothing shipped
> *creates* it (the CLI `build`/`update` pipeline is still stubbed). But it is
> **read** by `atlas search`, the MCP tools, and the VS Code extension when
> present. The other files are target — [CURRENT_STATE.md](./CURRENT_STATE.md).

---

## 2. Currently implemented

| Piece | Where | Notes |
| ----- | ----- | ----- |
| `manifest.json` | `packages/scanner/src/manifest.ts` | Written by `generateManifest(scan)`. Schema versioned; `createdAt` preserved, `updatedAt` refreshed, rest recomputed from the scan. |
| Versioned hash snapshots | `@atlas/hashing` (JSON snapshots) | These live wherever the caller chooses (`saveSnapshot(path)`), not yet standardized under `.codeatlas/`. |
| SQLite context DB | `@atlas/storage` (`ContextStore`) | Backed by `node:sqlite` (Needs Node ≥22.5.0). `ContextStoreOptions.filePath` selects the file (default `:memory:`); WAL for file-backed stores. Written via `saveContext`/`updateContext`; read by the SDK/CLI/MCP/extension. |

---

## 3. Target properties (the non-negotiable invariants)

Context storage must be:

- **Local** — on the user's machine; never uploaded implicitly
  ([PRIVACY.md](./PRIVACY.md)).
- **Versioned** — `manifest.json` schema + migration system (an error to open a
  DB with a newer schema than the app understands).
- **Incrementally updateable** — hashes detect `changed`/`added`/`deleted`
  files; persistence merges (`updateContext`) rather than full rewrites where
  possible.
- **Inspectable** — humans can open the files and understand the project state
  (`graph.json` and `symbols.json` are plain JSON; `manifest.json` is plain JSON;
  `context.db` is standard SQLite).
- **Recoverable** — if `.codeatlas/` is corrupted or deleted, `atlas build` must
  recreate it from the source tree. It is never the only store of any fact.

---

## 4. Ownership

| Concern | Owner |
| ------- | ----- |
| Manifest write/read | `@atlas/scanner` (`manifest.ts`) |
| Tool manifests (`tools/`) | `@atlas/toolkit` (`manifest.ts`) — installed-tool state, not context |
| Change detection / snapshots | `@atlas/hashing` |
| Context database (files, symbols, deps, summaries, relationships, hashes, metadata) | `@atlas/storage` |
| Graph/symbol JSON exports | `@atlas/graph` / `@atlas/parser` (future) |

Persistence **belongs to `storage`** for the context DB; other `.codeatlas/`
files are owned by the package that defines them (scanner manifest, toolkit
tool manifests, `@atlas/usage`'s `usage.db`).

---

## 5. Security & privacy

- `.codeatlas/` is gitignored and should stay out of source control.
- It may contain AI summaries (derived content) — if the user runs with a
  provider. Keep it on disk, never sync to a remote unless the user opts in.
- Never commit `.codeatlas/`; treat it as a build cache. See [SECURITY.md](./SECURITY.md).
