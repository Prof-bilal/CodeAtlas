# @atlas/hashing

SHA-256 hashing and change detection for CodeAtlas. This module powers
**incremental updates**: it hashes every file, persists the hashes as a JSON
snapshot, and can tell you exactly which files **changed**, were **deleted**, or
are **new** between runs.

Implements `HashPort` from `@atlas/core`.

## Features

- **SHA-256** digest for every file (`getHash`) and for raw strings
  (`hashContent`).
- **Snapshots** — persist hashes to a versioned JSON file
  (`saveSnapshot` / `loadSnapshot`).
- **Change detection** — `compareHashes` classifies every known path as
  `changed`, `added`, `deleted`, or `unchanged`.
- `getChangedFiles` returns the paths needing re-processing (changed + added).

## Usage

```ts
import { HashService } from "@atlas/hashing";

const hasher = new HashService();

// 1. Hash all current files into a snapshot.
const current = await hasher.buildSnapshot(["/repo/a.ts", "/repo/b.ts"]);
await hasher.saveSnapshot(current.value, "/repo/.codeatlas/hashes.json");

// 2. On a later run, compare with the stored snapshot.
const previous = await hasher.loadSnapshot("/repo/.codeatlas/hashes.json");
const diff = hasher.compareHashes(previous.value, current.value);
```

## Storage

Hashes are stored as **JSON** (`.codeatlas/hashes.json`), with a `version`
field for future migrations. SQLite can be added later behind the same port.

## Public API

- `hashContent(content)` — SHA-256 hex of a string.
- `getHash(path)` — SHA-256 hex of a file on disk.
- `buildSnapshot(paths)` — build a snapshot from a set of file paths.
- `compareHashes(previous, current)` — classify changed/added/deleted/unchanged.
- `getChangedFiles(previous, current)` — list of files to re-process.
- `saveSnapshot(snapshot, path)` / `loadSnapshot(path)` — JSON persistence.
- `HashService` — the `HashPort` implementation.
