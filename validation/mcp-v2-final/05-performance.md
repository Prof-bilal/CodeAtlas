# Performance — CodeAtlas MCP V2

**Date:** 2026-09-07 | **Commit:** 04f0d6f | **Index:** 7,565 files, 443MB

## Tool Latency (SDK direct, 3 runs)

| Operation | Avg (ms) | Min (ms) | Max (ms) | Notes |
|-----------|---------:|---------:|---------:|-------|
| read_file_range | 1.6 | 0.4 | 3.5 | Sub-ms; filesystem read + hash check |
| search_files | 114 | 111 | 121 | Stable after index build |
| get_dependencies | 508 | 445 | 573 | Loads + filters full edge list |
| search_symbols | 2,329 | 458 | 6,062 | Cold includes index rebuild |
| project_overview | 1,520 | 0.4 | 4,558 | Cold loads full snapshot |

## Warm vs Cold

| Operation | Cold (first call) | Warm (subsequent) | Ratio |
|-----------|------------------:|-------------------:|------:|
| search_symbols | 2,329 ms | ~460 ms | 5x |
| project_overview | 4,558 ms | <1 ms | >4500x |
| search_files | ~120 ms | ~110 ms | 1.1x |
| get_dependencies | ~500 ms | ~450 ms | 1.1x |
| read_file_range | ~2 ms | ~1 ms | 2x |

## Index Build Time (scale-grid)

| Files | Index Time | DB Size | Peak RSS |
|------:|-----------:|--------:|---------:|
| 100 | 2,065 ms | 377 KB | 68 MiB |
| 1,000 | 1,775 ms | 2.9 MB | 256 MiB |
| 10,000 | NOT MEASURED | — | — |
| 50,000 | NOT MEASURED | — | — |

## Hot Paths (Unmeasured at Scale)

1. **Freshness probe:** `scanProjectOverview` → `readdir` + `stat` per file + `mtime` comparison per indexed file. Double-stat per file. Default `intervalMs=0` = every call.
2. **Search rebuild:** `requireSearchable` → `rebuildSearch()` → `refresh()` → `loadContext()` full snapshot → `buildIndex()`. O(corpus) before scoring.
3. **inspect_symbol graph:** Full `getDependencyGraph()` loop per call.

## Scalability Assessment

| Size | Classification | Evidence |
|------|---------------|----------|
| 100 files | FAST | 2s index, sub-ms read |
| 1,000 files | FAST | 1.8s index, ~120ms search |
| 10,000 files | UNKNOWN | Not measured |
| 50,000 files | UNKNOWN | Not measured |

## Recommendations

1. **Measure 10k/50k:** Run full scale-grid before claiming scalability
2. **Warm search index:** Cache rebuilt index in memory with hash invalidation
3. **Freshness debounce:** Increase intervalMs for large repos
4. **Per-tool timeouts:** Add to prevent hanging on large graphs
