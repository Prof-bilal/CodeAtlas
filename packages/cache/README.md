# @atlas/cache

A generic caching layer for CodeAtlas, behind the `CachePort` contract. Stores
JSON-serializable values in memory with optional TTL and JSON file persistence,
so caches can survive across runs.

Implements `CachePort` from `@atlas/core`.

> **Status: implemented.** In-memory store with TTL and optional persistence.

## Features

- **`get` / `set` / `delete`** with per-entry TTL.
- **Optional JSON persistence** — construct with a `filePath` to load the cache
  lazily on first use and rewrite it on every write.
- **Default TTL** — `defaultTtlMs` applied to entries written without an
  explicit TTL.

## Usage

```ts
import { CacheService } from "@atlas/cache";

const cache = new CacheService({ filePath: ".codeatlas/cache.json" });
await cache.set("summary:file:abc", summary, 60_000);

const hit = await cache.get("summary:file:abc");
await cache.delete("summary:file:abc");
```

## Public API

- `CacheService` — the `CachePort` implementation.
- `CacheServiceOptions` — `{ filePath?, defaultTtlMs? }`.

## Notes

Persistence is best-effort: a disk write failure does not fail the surrounding
call, and the in-memory store stays authoritative within the process. TTL
expiry is checked on read; expired entries are dropped lazily.