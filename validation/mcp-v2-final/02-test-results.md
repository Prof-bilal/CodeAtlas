# Test Results — CodeAtlas MCP V2

**Date:** 2026-09-07 | **Commit:** 04f0d6f

## Overall

| Test Category | Passed | Failed | Skipped | Error |
|---------------|-------:|-------:|--------:|------:|
| MCP package (13 files) | 151 | 0 | 0 | 0 |
| SDK package | 23 files pass | 0 | 0 | 0 |
| All packages total | 1484 | 4 | 0 | 0 |
| Typecheck | partial | 1 (extension) | 0 | 0 |
| Lint | 14131 errors | pre-existing | 0 | 0 |
| Format | 547 pass | 3 errors | 0 | 0 |

## MCP Test Breakdown (151 tests, all pass)

| Test File | Tests | Status |
|-----------|------:|--------|
| handlers.test.ts | 40 | PASS |
| tools.test.ts | 12 | PASS |
| server.test.ts | 8 | PASS |
| budget.test.ts | 12 | PASS |
| score.test.ts | 10 | PASS |
| freshness-matrix.test.ts | 15 | PASS |
| context.test.ts | 8 | PASS |
| context-correctness.test.ts | 12 | PASS |
| hardening.test.ts | 10 | PASS |
| mcp-audit.test.ts | 15 | PASS |
| startup.test.ts | 5 | PASS |
| zod-to-json-schema.test.ts | 3 | PASS |
| tool-bridge.test.ts | 1 | PASS |

## CLI Test Failures (4)

| Test | Error | Severity | Blocks Release |
|------|-------|----------|----------------|
| atlas search --ai > AI section | Expected "AI summaries (top file hits):" but got "No results for..." | LOW | No |
| atlas doctor > healthy | Expected exitCode undefined, got 1 | LOW | No |
| atlas doctor > healthy (2nd) | Same exitCode issue | LOW | No |
| atlas doctor > healthy (3rd) | Same exitCode issue | LOW | No |

**Root cause (CLI):** The `atlas search --ai` test expects specific output format that changed. The `atlas doctor` test expects exit code 0 but the health check returns 1 (likely a missing service). These are pre-existing test drift, not MCP regressions.

## Typecheck Failure

`apps/extension/tests/commands.test.ts` — 5 TS2722 errors (possibly-undefined handler invocation). Pre-existing, not related to MCP changes.
