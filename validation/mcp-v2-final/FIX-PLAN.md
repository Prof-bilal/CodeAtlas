# Fix Plan: Dependency Entity Flooding in Search Index

## Problem

325K dependency edge entities are indexed as searchable content in `buildIndex()`. Their labels ("imports", "calls", "extends") match common query terms at PREFIX level (score 85), dominating top-k results and starving file hits (~43) and symbol hits (~50). Measured impact: P@5=0.015, MRR=0.037.

## Root Cause

`packages/search/src/search-index.ts:192-206` — every dependency edge becomes a `DependencyEntry` in the search index:

```ts
for (const dependency of snapshot.dependencies ?? []) {
  entities.push({
    kind: "dependency",
    from: dependency.from,
    to: dependency.to,
    relation: dependency.kind,
    fromLabel, toLabel,
    searchText: normalize(`${fromLabel}\n${toLabel}\n${dependency.kind}`),
    ...
  });
}
```

## Why This Is Safe to Remove

**No production code depends on dependency entities in search results:**

| Caller | Filter | Evidence |
|--------|--------|----------|
| `assemble.ts:467` | `types: ["symbol", "file"]` | Assembly excludes deps from search |
| `planner.ts:178` | `types: ["file", "symbol"]` | Planner excludes deps from search |
| `sdk.ts:963` | `types: ["file"]` / `types: ["symbol"]` | SDK search methods exclude deps |
| MCP handlers | Delegates to assembly | No handler searches for deps |

Dependencies are fetched via the **graph API** (`getDependencies()`, `getDependencyGraph()`), not via search. The search index is the wrong layer for structural edge data.

## Changes (6 files)

### 1. `packages/search/src/search-index.ts`

**Remove dependency indexing loop** (lines 192-206):

```ts
// DELETE: lines 192-206 (the for-loop over snapshot.dependencies)
// KEEP: lines 192 (buildNodeLabels call) — still needed if other code uses it
//        Actually, buildNodeLabels is only used by the dependency loop,
//        so remove it too (lines 211-221).
```

Also remove:
- `DependencyEntry` interface (lines 61-70)
- `buildNodeLabels()` function (lines 211-221) — only used by dependency loop

### 2. `packages/search/src/scoring.ts`

**Remove dependency scoring** (lines 78-79, 182-187):

```ts
// DELETE: case "dependency": return this.scoreDependency(query, entity, fuzzy);
// DELETE: private scoreDependency(...) method (lines 182-187)
```

### 3. `packages/search/src/search.service.ts`

**Remove dependency result mapping** (lines 172-180):

```ts
// DELETE: case "dependency": return { kind: "dependency", ... };
```

### 4. `packages/search/tests/search.service.test.ts`

**Update test** (lines 127-134): Change from asserting dependency search works to asserting dependency entities are NOT in search results:

```ts
// BEFORE: "finds dependencies through resolved node labels"
// AFTER:  "does not include dependency entities in search results"
// Assert: service.search("math", { types: ["dependency"] }) returns []
// Or: remove the test entirely since the filter is now meaningless
```

### 5. `packages/search/src/search-index.ts` (export cleanup)

Check if `DependencyEntry` is exported and used elsewhere. If so, remove the export and update importers.

### 6. `packages/benchmark/tests/retrieval-metrics.test.ts`

Check if any benchmark tests assert on dependency search results. If so, update them.

## Files NOT Changed

- `packages/mcp/` — no changes needed (handlers don't search for deps)
- `packages/sdk/` — no changes needed (assembly uses graph API, not search)
- `packages/storage/` — no changes needed (Dependencies table untouched)
- `packages/graph/` — no changes needed (graph API untouched)
- `apps/cli/` — CLI test at line 1318 uses mock data, not search index

## Expected Impact

| Metric | Before | After (expected) |
|--------|--------|------------------|
| P@1 | 0.0000 | ≥0.15 |
| P@5 | 0.0150 | ≥0.30 |
| P@10 | 0.0231 | ≥0.40 |
| MRR | 0.0365 | ≥0.20 |
| Index size | 325K dep entities | 0 dep entities |
| Index memory | ~high | reduced |
| Search latency | same | slightly faster (fewer entities to score) |

## Verification

1. `pnpm --filter @atlas/search test` — all search tests pass
2. `pnpm --filter @atlas/mcp test` — all 151 MCP tests pass
3. `pnpm test` — full suite passes
4. `pnpm exec tsx benchmarks/retrieval-tasks/evaluate-retrieval.ts` — P@5 ≥ 0.30, MRR ≥ 0.20
5. `pnpm typecheck` — no new type errors

## Risk

**Low.** The change is subtractive (removing unused code). No production caller depends on dependency search results. The graph API (`getDependencies`) is unchanged. The only behavioral change is that `search("imports")` no longer returns dependency edges — which is the desired behavior.

## Outcome (2026-09-07, implemented)

**Implemented as specified.** All 5 file changes applied; `@atlas/search` rebuilt; `dist` verified free of dependency entities.

- Search tests: 44/44 pass. MCP+benchmark+SDK: 593/593 pass. Typecheck, biome format, eslint clean on all touched files.
- Live verification: `search("math", { types: ["dependency"] })` returns `[]`; top-5 results contain zero dependency hits.

**P@k did NOT improve** (P@5 0.0150 → 0.0133, MRR 0.0365 unchanged). The original root-cause claim was **wrong**: the evaluator (`retrieval-metrics.ts:82`) already skips `path === null` hits before top-k slicing, so dependency entities never consumed measured rank positions.

**Actual dominant factor (new evidence):** index pollution. Of 7,565 indexed files, **7,131 (94%) are benchmark fixtures, old-school archives, and test repos** checked into the working tree; only 434 are real source. For LOC-03, `scoring.ts` ranks below 200 while 199/200 top hits are fixture files. The eval measures retrieval against a junk-flooded index — a scanner scoping problem (no fixture/generated-dir exclusion), not a search-ranking problem.

**Status of this fix:** keep as hygiene (smaller index, dead code removed, zero regressions) but it is **not the P0 retrieval fix**. The P0 now splits into: (a) index scoping — exclude fixture/archive dirs from the default index or scope eval to real source; (b) lexical limits on natural-language trace queries with zero term overlap.

---

## Fix Plan: Index Scoping for Fixture/Archive Directories

### Problem (a)

94% of indexed files (7,131 of 7,565) are benchmark fixtures and old-school archives. Only ~434 files are real source. Search results are flooded with junk, pushing real hits below top-k.

### Root Cause

`packages/scanner/src/ignore.ts` `DEFAULT_IGNORED_DIRECTORIES` omitted `benchmarks` and `old-school`. The scanner indexes everything not in the ignore list.

### Changes

1. `packages/scanner/src/ignore.ts` — Added `benchmarks` and `old-school` to `DEFAULT_IGNORED_DIRECTORIES`.
2. `packages/scanner/tests/ignore.test.ts` — Added case-insensitive assertions for `Benchmarks` and `OLD-SCHOOL`.

### Verification (2026-09-07, implemented)

- Scanner tests: 46/46 pass.
- Typecheck: `packages/scanner` clean (extension errors pre-existing, unrelated).
- Build: scanner dist built with new entries confirmed.
- Pre-existing extension typecheck errors in `apps/extension` are unrelated to this change.

### Results (2026-09-07)

| Metric | Before (dep fix) | After (index scoping) | Delta |
|--------|------------------|-----------------------|-------|
| Indexed files | 7,565 | 526 | -93% |
| P@1 | 0.0000 | 0.0333 | +0.0333 |
| P@5 | 0.0133 | 0.0400 | +0.0267 (3x) |
| P@10 | 0.0231 | 0.0300 | +0.0069 |
| MRR | 0.0365 | 0.0895 | +0.0530 (2.5x) |

Test suite: 142/143 pass, 1484/1488 tests pass. 4 pre-existing failures in `cli.test.ts` (doctor + ollama provider tests) unchanged.

**Conclusion:** Index scoping is a real P0 fix. The dominant factor was junk flooding, not ranking quality. Remaining gap: lexical limits on zero-overlap natural-language queries (task (b) from the original plan).

---

## Fix (b): Lexical Limits on Natural-Language Queries

### Problem

Multi-term natural-language queries like "lexical scorer exact prefix token substring fuzzy ceilings" produce scores where files matching different terms tie at the same value. The old coverage dampening (`best * matched/terms`) penalizes queries with many terms, pushing relevant files below top-k.

### Root Cause

`packages/search/src/scoring.ts:216-224` — the `scoreField` function takes the MAX over all term scores, then multiplies by a coverage ratio. For an 8-term query matching 4 terms: `best * max(0.5, 4/8) = best * 0.5`. This creates massive ties and penalizes multi-term queries.

### Changes (2 files)

1. **`packages/search/src/scoring.ts`** — Replace coverage dampening with an overlap bonus:
   - OLD: `best = Math.round(best * Math.max(0.5, matched / terms.length))`
   - NEW: `best = best + Math.min(matched - 1, 4) * 5`
   - The bonus adds +5 per additional matching term (capped at +20), keeping the best single-term score intact while rewarding breadth.

2. **`packages/mcp/tests/context-correctness.test.ts`** — Update assertion for the new scoring behavior: an exact symbol match in a multi-term query now scores 100 (full score) instead of 50 (coverage-dampened).

### Results (2026-09-07)

| Metric | After index scoping | After overlap bonus | Total delta (from baseline) |
|--------|--------------------|--------------------|-----------------------------|
| P@1 | 0.0333 | 0.0667 | +0.0667 |
| P@5 | 0.0400 | 0.0467 | +0.0334 |
| MRR | 0.0895 | 0.1265 | +0.0900 |

Notable per-task improvements:
- LOC-03: null → rank 4 (scoring.ts found)
- LOC-05: rank 5-6 → rank 1-2 (freshness.ts + context.ts)
- LOC-10: null → rank 7 (installer.service.ts)

Test suite: 142/143 pass, 1484/1488 tests pass. 4 pre-existing failures unchanged.

### Remaining work

Many tasks still return null ranks for relevant files. The dominant remaining factor is that some queries contain terms with zero lexical overlap in the target files (e.g., "enforced", "circular detection"). This requires either:
- Semantic/vector search (future direction)
- Broader prefiltering with synonym expansion
- Or accepting that lexical search has a recall ceiling on natural-language queries
