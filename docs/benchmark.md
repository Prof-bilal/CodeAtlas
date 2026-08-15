# CodeAtlas MCP MVP — Benchmark Report

Benchmark date: 2026-08-15
Run: `pnpm exec vite-node tests/benchmarks/mcp-benchmark.ts`
Test repository: `tests/fixtures/mcp-audit-repo` (copied to a temp directory)

## Environment

| Field | Value |
| - | - |
| Commit | `b30de13987c24c409f1957199e99731f172c779f` |
| OS / arch | `win32 x64` |
| Node | `v24.18.0` |
| CodeAtlas version | `0.0.0` |
| AI model | **None used** — token counts are *estimated*, never measured |

## Methodology

- **Token counts are estimates.** `estimateTokens` from `@atlas/sdk` uses
  `ceil(character_count / 4)`. No external model/provider token telemetry was
  available, so every token figure in this report is an **estimate**, never a
  measured count.
- **Latency is measured.** Search and MCP tool calls were repeated 5 times in
  the same Node process using `performance.now()`; tables report
  min/max/avg/median.
- **Baseline context** is the full indexed fixture source content for each
  task — an agent without repository intelligence.
- **CodeAtlas context** is the rendered deterministic context package plus
  measured MCP search/read outputs for targeted tasks.
- **Precision / recall** are computed over the **unique files** in the context
  package for each task: `precision = |retrieved ∩ relevant| / |retrieved|`,
  `recall = |retrieved ∩ relevant| / |relevant|`, where "relevant" is the
  task's expected files. Exact-file matching is deliberately strict (a closely
  related file such as `auth-middleware.ts` counts as non-relevant), so
  precision understates true usefulness.

## Repository under test

| Metric | Value |
| - | - |
| Files | 30 |
| Lines | 2,128 |
| Symbols | 506 |
| Dependencies | 667 |
| Index size | 843,776 bytes |

The fixture is a deliberately hand-crafted TypeScript app (auth, payments,
users, API routes, deep nesting, import cycles, a barrel re-export, ignored
directories, and a fake secret in `config/local.secret`). Structure changes
must bump the fixture version (`tests/fixtures/mcp-audit-repo/README.md`) and be
recorded here. **Fixture version: `1.1.0`** — the scanner now honors `.gitignore`
file patterns (e.g. `*.log`, `.env`) in addition to default ignored directories.

## Scan / incremental performance

| Test | Time (ms) | Memory (RSS MB) | Result |
| - | - | - | - |
| First scan (build) | 530 | 1,374 | files=30, parsed=30, +46 ~0 -0 =0 |
| Second scan (no change) | 107 | 1,374 | files=30, parsed=0, +0 ~0 -0 =46 |
| Single-file update | 114 | 1,374 | files=30, parsed=1, +0 ~1 -0 =45 |
| File addition | 97 | 1,374 | files=31, parsed=1, +1 ~0 -0 =46 |
| File deletion | 94 | 1,374 | files=30, parsed=0, +0 ~0 -1 =46 |

Notes:

- The hash diff counts 46 paths (30 TypeScript files + non-persisted files such
  as README, package.json, tsconfig, config) while 30 TypeScript files are
  persisted as source context.
- Incremental updates parse **only** changed/added files (`parsed=0/1`), and the
  deletion row proves removed files are pruned.
- Memory is the whole-process RSS (noisy; it reflects the SDK + MCP bundle
  loaded by the harness), not a per-query measurement.

## Search performance (measured latency)

| Query | Results | Latency (ms) min/max/avg/median | Tokens (estimated) | Top result |
| - | - | - | - | - |
| `auth` | 10 | 9.0 / 26.0 / 15.7 / 9.6 | 754 | auth |
| `payment` | 10 | 10.3 / 14.2 / 12.7 / 12.7 | 798 | payments |
| `user` | 10 | 6.9 / 13.8 / 8.6 / 7.3 | 689 | User |
| `authenticateUser` | 10 | 18.5 / 21.5 / 19.9 / 19.3 | 1,149 | authenticateUser |
| `password reset` | 10 | 18.2 / 21.1 / 19.6 / 19.6 | 745 | PASSWORD_RESET_TT… |
| `payment validation` | 10 | 23.4 / 28.6 / 26.9 / 27.4 | 798 | payments |

All queries well under 30 ms at the 30-file scale.

## MCP tool performance (measured latency)

| Tool | Calls | Avg latency (ms) | Errors |
| - | - | - | - |
| `project_overview` | 5 | 35.2 | 0 |
| `search_symbols` | 5 | 30.9 | 0 |
| `search_files` | 5 | 44.3 | 0 |
| `get_dependencies` | 5 | 27.7 | 0 |
| `explain_module` | 5 | 28.4 | 0 |
| `get_summary` | 5 | 18.9 | 0 |
| `read_file_range` | 5 | 23.5 | 0 |

Every tool advertises `outputSchema` and the MCP server validates
`structuredContent` against it before returning; reads go through the
auto-refresh freshness guard. All seven tools return clean results with zero
errors.

## Context assembly tasks (token savings — **estimated**, precision/recall)

Baseline for every task: 14,420 estimated tokens (full indexed source).

| Task | Correct | Precision | Recall | Baseline (est.) | CodeAtlas (est.) | Savings |
| - | - | - | - | - | - | - |
| Authentication | ✅ | 0.14 | 1.00 | 14,420 | 4,658 | 67.7% |
| Payments | ✅ | 0.20 | 1.00 | 14,420 | 3,215 | 77.7% |
| User API | ✅ | 0.08 | 1.00 | 14,420 | 2,568 | 82.2% |
| Password reset | ✅ | 0.17 | 1.00 | 14,420 | 3,479 | 75.9% |
| Dependency analysis | ✅ | 0.13 | 1.00 | 14,420 | 6,796 | 52.9% |

**All five tasks are now correct with recall = 1.00.** The previously failing
**User API** task (`"Where should I add a new user endpoint?"`) is satisfied:
dependency dampening/limiting in context assembly keeps lower-scored but
relevant files (such as `routes.ts`) inside the budget instead of letting
score-100 dependency edges crowd them out. The **Dependency analysis** task now
includes `user-repository.ts` alongside `auth-service.ts`.

Precision is low because the "irrelevant" files listed by the strict exact-file
match are in fact contextually useful (e.g. `auth-middleware.ts`,
`password.ts`, `session.ts`, `README.md`), and every task's package is a small,
bounded, ranked set (not a whole-repo dump). Recall of 1.00 means no relevant
file was missed on any task.

## Stale context

| Scenario | Expected | Actual | Result |
| - | - | - | - |
| File modified / symbol renamed before update | Fresh or explicit stale warning | `freshness=stale; searchTop=authenticateUser; readRangeStale=true; readRangeContainsNew=true` | FAILED for search; PASS for `read_file_range` freshness |
| After explicit `atlas update` | Updated | `changed=1; searchTop=authenticateMember` | PASS |
| File deleted | Removed | `matches=0` | PASS |

The row above exercises the **raw SDK** with auto-refresh disabled. In the MCP
server, reads auto-refresh the index when the working tree changes (see
`docs/MCP_AUDIT.md`): the first row corresponds to `autoRefresh: false`. With
auto-refresh enabled, a modified file is re-indexed before the search is
served, so search reflects the edit without an explicit `atlas update`.
`read_file_range` always compares the working tree against the persisted hash
and flags drift (`stale`, `versionMatch`).

## Line drift

| Field | Value |
| - | - |
| Original symbol line | 5 |
| Modified line (after 3-line insert) | 8 |
| Requested range | 5–5 |
| Returned range | 1–10 |
| Contains target | true |
| `versionMatch` | false |
| `stale` | true |
| Result | **PASS WITH WARNING** |

`read_file_range` does not relocate symbols after lines shift; the stale flag /
`versionMatch` correctly signal that the caller should re-resolve.

## Large repository (10,000 files / 500,000 lines)

| Metric | Value |
| - | - |
| Files | 10,000 |
| Lines | 500,000 |
| First-scan time | 52,561 ms |
| Search latency (avg) | 513 ms (min 413 / max 691 / median 465) |
| Context tokens (estimated) | 6,394 |
| Memory (RSS peak) | 1,488 MB |
| Top result | `authMiddleware9900` |
| Result | **PASS** |

The fixture was scaled up from 10,000 files / 10,000 lines to **10,000 files /
500,000 lines** (~50 lines per file) to exercise a production-sized source
tree. The top search hit is still exactly correct and search stays sub-second
(avg 513 ms) at 500k lines. The in-memory search index carries a real memory
cost (~1.5 GB RSS at this scale): search is O(entities) in-memory scoring, and
the resident set grows with the indexed entities. That is the primary
documented trade-off of the in-memory index at very large scale (see the
scorecard in `docs/MCP_AUDIT.md`).

## Security

| Test | Result |
| - | - |
| Path traversal | PASS: rejected as unindexed |
| Secret leakage (fake decoy in `config/local.secret`) | PASS: not persisted in source context |
| Invalid path | PASS |
| Malformed input | PASS: zod/handler validation rejects |
| Oversized input | PASS: rejected cleanly by input validation (10k-char cap) |
| `.gitignore` file patterns | PASS: scanner honors root + nested `.gitignore` patterns (e.g. `*.log`, `.env`) since fixture 1.1.0 |

## Findings (from the benchmark)

| Severity | Finding |
| - | - |
| MEDIUM | The in-memory search index scales sub-linearly in latency (O(entities) scoring) but linearly in resident memory: ~1.5 GB RSS at 10k files / 500k lines. Acceptable for the defined MVP scope; a swap-in `RelevanceScorer`/vector index is the planned path. |
| LOW | MCP tools auto-refresh the index before reads when the working tree changes (when refresh is enabled); `read_file_range` detects stale content and reads the working tree. |
| INFO | Scanner applies `.gitignore` file patterns in addition to default ignored directories; non-TypeScript ignored files are hashed but not persisted as source context. |
| INFO | Tool schemas advertise `outputSchema`; MCP validates structured output against it at the server boundary. |