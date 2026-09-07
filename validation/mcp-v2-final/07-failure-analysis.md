# Failure Analysis — CodeAtlas MCP V2

**Date:** 2026-09-07 | **Commit:** 04f0d6f

## Failure Taxonomy

### DEPENDENCY_FLOODING (Critical — affects all queries)

| Task | Query | Expected | Top Results | Root Cause |
|------|-------|----------|-------------|------------|
| LOC-01 | "where is MCP tool input validation enforced" | validation.ts, tools.ts | Dependency edges matching "input" | 325K dep entities score 85 |
| LOC-03 | "lexical scorer exact prefix token substring fuzzy" | scoring.ts | Dependency edges matching "prefix" | Same |
| LOC-09 | "tool registry catalog overlay provenance" | catalog.json, registry.service.ts | Dependency edges matching "catalog" | Same |
| TRACE-01 | "trace entrypoint through calls to test file" | graph.service.ts, assemble.ts | Dependency edges matching "calls" | Same |

**Pattern:** Every query that contains a word matching dependency labels (imports, calls, extends, etc.) gets flooded. This affects 100% of the 30 test tasks.

**Fix:** Exclude dependency edge entities from the search index. They are queried via `get_dependencies`, not via search.

### RANKING_ERROR (Moderate — affects conjunction queries)

Even without dependency flooding, the best-term-wins scoring would still struggle with multi-concept queries. The conjunction coverage factor helps but doesn't fully solve it.

### CLI_TEST_DRIFT (Low — 4 failures)

| Test | Error | Root Cause |
|------|-------|------------|
| atlas search --ai | Output format mismatch | Test expects old format |
| atlas doctor (x3) | Exit code 1 instead of undefined | Health check fails in test env |

These are pre-existing test drift, not MCP regressions.

### NO_LARGE_REPO_EVIDENCE (Unknown)

No measurements exist for 10k+ files. The hot paths (freshness probe, search rebuild) do O(corpus) work per call. Unknown whether this becomes a bottleneck.

### NO_STATISTICAL_SIGNIFICANCE (Unknown)

Pilot is n=1 per cell. No confidence intervals possible. The -0.13 score delta and +38% token delta could be noise.

## Failure Severity Ranking

1. **DEPENDENCY_FLOODING** — CRITICAL, blocks all retrieval quality
2. **NO_LARGE_REPO_EVIDENCE** — HIGH, unknown scalability
3. **NO_STATISTICAL_SIGNIFICANCE** — MEDIUM, pilot conclusions are weak
4. **CLI_TEST_DRIFT** — LOW, pre-existing, not MCP-related
