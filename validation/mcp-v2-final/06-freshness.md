# Freshness — CodeAtlas MCP V2

**Date:** 2026-09-07 | **Commit:** 04f0d6f

## Freshness Architecture

| Layer | Mechanism | Location |
|-------|-----------|----------|
| Index-time | Hash diff (SHA-256) → reparse changed+added TS only | sdk/src/indexing/indexer.ts |
| Serve-time | mtime + pathset probe per MCP call | mcp/src/freshness.ts |
| Package-level | Persisted hashes vs working tree | sdk/src/context/staleness.ts |
| Read-level | Content hash + versionMatch + stale flag | sdk/src/context/sdk.ts |

## Freshness States

| State | Meaning | Behavior |
|-------|---------|----------|
| fresh | Index matches working tree | Serve normally |
| stale | Changes detected, refresh attempted | Serve with stale flag + message |
| unknown | No index exists | Return unavailable |
| unavailable | Index unavailable or refresh failed | Return unavailable with message |

## Event Handling

| Event | Detection | Response | Verdict |
|-------|-----------|----------|---------|
| File edit | mtime > baseline at next call | Auto-refresh | GOOD |
| File add | Path-set diff | Auto-refresh | GOOD |
| File delete | Path-set diff | Auto-refresh | GOOD |
| File rename | Delete + add (no move tracking) | Auto-refresh | ADEQUATE |
| Branch checkout | mtime storm → full refresh | Auto-refresh (cost unmeasured) | PLAUSIBLE bottleneck |
| Edit during refresh | Rebased on post-refresh savedAt | Next probe catches it | GOOD |
| Disabled refresh | Explicit flag | Return unavailable | Honest |

## What's Good

- Never serves stale data silently
- Auto-refresh on every MCP call
- Stale + message when refresh fails (fail-safe)
- Content hash on read_file_range for version awareness

## What's Missing

- Move tracking (rename = delete + add, loses history)
- Branch-aware fast path
- File watching (relies on per-call probe)
- Probe latency measurement at scale
- Refresh cost measurement

## Audit Assessment

Freshness is a genuine strength. The honesty (never silent stale) is rare. Cost is the open question — probe does double-stat per file, unmeasured at scale.
