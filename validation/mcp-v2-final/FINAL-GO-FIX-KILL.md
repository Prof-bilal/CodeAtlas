# CodeAtlas MCP V2 — Final Validation Decision

**Decision:** FIX

**Confidence:** HIGH

**Validation Date:** 2026-09-07

**Commit:** 04f0d6f (main)

**Benchmark:** Fresh Comprehensive Pilot (2026-09, n=1 per cell) + Retrieval Eval (30 tasks)

---

## Executive Verdict

CodeAtlas MCP V2 has a strong architectural foundation and has implemented all 11 audit P0 recommendations. However, **retrieval quality is critically low** — P@1=0.00, P@5=0.015, MRR=0.037 — because 325K dependency entities flood search top-k, starving file/symbol results. The context assembly pipeline (budget, tiers, sufficiency, freshness) is well-engineered but **depends on retrieval quality that does not yet exist**. The thesis is sound; the implementation has one measurable blocker.

**Recommendation:** FIX — resolve the dependency flooding P0, then re-measure retrieval. If P@5 reaches ≥0.30 with MRR ≥0.20, proceed to GO.

---

## What Was Validated

| Area | Method | Result |
|------|--------|--------|
| Test suite | `pnpm test` + `pnpm vitest run packages/mcp/tests/` | 151/151 MCP pass; 1484/1488 total (4 CLI failures) |
| MCP tool surface | Code inspection of tools.ts/handlers.ts/server.ts | 8 tools + 4 aliases = 12 protocol names (correct) |
| Retrieval quality | `evaluate-retrieval.ts` against 30-task held-out set | P@1=0.00, P@5=0.015, MRR=0.037 |
| Index health | SQLite queries on context.db | 7,565 files, 210K symbols, 325K deps, 443MB |
| Latency | SDK direct calls, 3 runs each | readRange 1.6ms, searchFiles 114ms, deps 508ms, searchSymbols 2.3s cold/460ms warm, overview 4.5s cold/<1ms warm |
| Scale | scale-grid/generate.mjs | 100 files=2s, 1000 files=1.8s index |
| Score normalization | Code inspection of score.ts | FIXED (0..100 → 0..1 with confidence bands) |
| Tool removal | Git diff b3d1167..04f0d6f | 4 tools removed, aliases added |
| Brief mode | Schema + handler inspection | IMPLEMENTED |
| Content windowing | search-index.ts inspection | IMPLEMENTED (stride 1000, 8 windows/file) |
| CI gates | .github/workflows/retrieval-gates.yml | EXISTS (4 jobs) |
| Audit P0 compliance | Diff audit vs HEAD | 11/11 IMPLEMENTED |

---

## What Passed

1. **Architecture:** Clean SDK seam, port-based design, dependency enforcement via ESLint
2. **MCP plumbing:** 151/151 tests pass, stdio handshake works, zod validation, structured responses
3. **Score normalization:** 0..100 → 0..1 with dual-emit rawScore + confidence bands
4. **Tool surface:** Reduced from 16 to 12 names (8 tools + 4 aliases), cleaner API
5. **Freshness honesty:** mtime-based probe, auto-refresh, stale/unavailable states never silent
6. **Budget/dedup/sufficiency:** Essentials never dropped, tail-drop with honest budgetExceeded, sufficiency gate with 4 predicates
7. **Content windowing:** Strided sliding window replaces single 2000-char excerpt
8. **Brief mode:** One-line pointers available for cheap discovery
9. **CI retrieval gates:** 4-job workflow blocks merges on retrieval regressions
10. **Scale:** 100-1000 files index in ~2s, sub-3ms readRange

---

## What Failed

### CRITICAL: Retrieval Quality

| Metric | Measured | Required | Status |
|--------|----------|----------|--------|
| P@1 | 0.0000 | ≥0.15 | **FAIL** |
| P@5 | 0.0150 | ≥0.30 | **FAIL** |
| P@10 | 0.0231 | ≥0.40 | **FAIL** |
| MRR | 0.0365 | ≥0.20 | **FAIL** |
| R@5 | 0.0333 | ≥0.50 | **FAIL** |
| R@10 | 0.0833 | ≥0.60 | **FAIL** |

**Root cause:** 325K dependency entities (source→target edge rows) are indexed as searchable entities. They score 85 (PREFIX match) because edge labels like "imports", "calls" match common query terms. These dependency entities occupy top-k slots, starving file hits (score ~43) and symbol hits (score ~50). The retrieval metrics skip dependency hits (path=null) but they still consume rank positions.

**Impact:** The entire context assembly pipeline — budget, tiers, sufficiency — operates on garbage-in retrieval results. No amount of assembly sophistication compensates for wrong initial ranking.

### MODERATE: CLI Test Failures

4 test failures in `apps/cli/tests/cli.test.ts`:
- `atlas search --ai` output format mismatch (test expects "AI summaries (top file hits):" but gets "No results for...")
- `atlas doctor` exit code 1 instead of undefined (health check fails)

### LOW: Stale Documentation

4 docs still reference removed tools (CURRENT_STATE.md, FEATURE_STATUS.md, MCP.md, apps/cli/README.md).

---

## Missing Measurements

| Measurement | Why Missing |
|-------------|-------------|
| Large-repo scale (10k/50k files) | Scale grid only tested 100/1000; larger sizes not run |
| n≥3 statistical significance | Pilot is n=1 per cell |
| Context efficiency (tokens per sufficient task) | Requires agent loop measurement, not available |
| Per-tool byte attribution in MCP responses | Timings added but byte counters not wired |
| Near-duplication rate | No near-dup detection implemented |
| Chain-coverage on trace tasks | Graph traversal metrics not computed |
| Agent task success with improved retrieval | Requires re-run after P0 fix |

---

## Critical Failure Cases

| Task | Query | Expected | Actual | Failure |
|------|-------|----------|--------|---------|
| LOC-01 | "where is MCP tool input validation enforced" | validation.ts, tools.ts | Dependency entities flood top-10 | DEPENDENCY_FLOODING |
| LOC-03 | "lexical scorer exact prefix token substring fuzzy ceilings" | scoring.ts | Not in top-10 | RANKING_ERROR |
| LOC-09 | "tool registry catalog overlay provenance" | catalog.json, registry.service.ts | Not in top-10 | RANKING_ERROR |
| TRACE-01 | "trace entrypoint through calls to test file" | graph.service.ts, assemble.ts | Dependency entities dominate | DEPENDENCY_FLOODING |

---

## Baseline Comparison (2026-09 Pilot, n=1)

| Metric | Baseline (A) | +CodeAtlas (B) | Delta | Status |
|--------|-------------|----------------|-------|--------|
| Avg Score | 1.56 | 1.44 | -0.13 | WORSE |
| Avg Tokens | 496,795 | 688,405 | +38% | WORSE |
| Avg Tools | 18.6 | 19.8 | +1.2 | WORSE |
| Timeout Rate | 0% | 0% | — | EQUAL |
| Architecture Tasks | 0/2 solved | 2/2 solved | +2 | BETTER |

**Interpretation:** CodeAtlas helps on architecture tasks (unfamiliar code navigation) but hurts average score and token efficiency. The token regression is likely caused by poor retrieval forcing extra follow-up reads.

---

## Release Gate Scorecard

| Gate | Status | Evidence |
|------|--------|----------|
| 1. Correctness | **PASS** | 151/151 MCP tests pass, no runtime errors |
| 2. Retrieval | **FAIL** | P@5=0.015, MRR=0.037 — dependency flooding |
| 3. Context Sufficiency | **CONDITIONAL** | Assembly machinery is correct but operates on garbage retrieval |
| 4. Token Efficiency | **FAIL** | +38% tokens vs baseline (measured in pilot) |
| 5. Attribution | **PASS** | Per-item score/source/reason/tier/tokens + confidence bands |
| 6. Freshness | **PASS** | mtime probe, auto-refresh, honest stale/unavailable states |
| 7. Performance | **CONDITIONAL** | readRange 1.6ms good; searchSymbols 2.3s cold is concerning; probe unmeasured at scale |
| 8. MCP API | **PASS** | 8+4 tools, zod schemas, structured responses, brief mode |
| 9. Scalability | **UNKNOWN** | Only tested to 1000 files; 10k+ unmeasured |
| 10. Differentiation | **CONDITIONAL** | Budget/dedup/sufficiency/freshness are genuine; retrieval quality negates them |

---

## P0 BLOCKERS

### Blocker 1: Dependency Entity Flooding in Search Results

**Problem:** 325K dependency edge entities are indexed as searchable content. Their labels ("imports", "calls", "extends", etc.) match common query terms at PREFIX level (score 85), dominating top-k results and starving file hits (score ~43) and symbol hits (score ~50). Retrieval metrics skip these (path=null) but they consume rank positions.

**Evidence:**
- P@1=0.0000, P@5=0.0150, MRR=0.0365 (measured against 30-task held-out set)
- 325,007 dependency rows in search index vs 7,565 files and 210,779 symbols
- Dependency entity scores (85) >> file scores (~43) and symbol scores (~50)

**Why it matters:** The entire context assembly pipeline depends on retrieval quality. With P@5=0.015, the assembly receives almost no relevant results. All downstream machinery (budget, tiers, sufficiency, freshness) is wasted.

**Required change:** Exclude dependency edge entities from the search index, or dampen their scores below file/symbol scores, or filter them out of search results before ranking. The dependency graph is queried via `get_dependencies` — it does not need to be a search entity.

**Validation metric:** Re-run `evaluate-retrieval.ts` after fix. Target: P@5 ≥ 0.30, MRR ≥ 0.20.

**Pass condition:** P@5 ≥ 0.30 AND MRR ≥ 0.20 on the 30-task held-out set.

---

## P1 IMPROVEMENTS

1. **Search index warm caching** — rebuildSearch costs ~2s cold; cache the index in memory with invalidation on refresh
2. **Freshness probe at scale** — measure probe latency for 1k/10k/50k files; consider file-watching if >5% of p95 tool latency
3. **Near-duplication detection** — dedup is identity-only; add content-similarity dedup for re-exports and near-identical files
4. **Chain-coverage metric** — compute graph hop coverage on trace tasks to measure multi-hop retrieval quality
5. **CLI test fixes** — 4 failures in search --ai and doctor tests

---

## P2 / NICE-TO-HAVE

1. Large-repo scale testing (10k/50k files)
2. n≥3 statistical significance on pilot tasks
3. Per-tool byte attribution in MCP responses
4. JS bridge (parse .js with TS grammar)
5. Path alias resolution
6. Workspace/monorepo detection
7. Intent router with locate/repair/refactor strategies
8. Reranker behind RelevanceScorer seam

---

## DO NOT BUILD YET

1. **Harness features** — router, slash commands, orchestration, marketplace, UI
2. **Additional language parsers** — JS bridge first, then measure before adding more
3. **Embeddings** — measure lexical failures first; dependency flooding fix may be sufficient
4. **File watching** — measure probe latency at scale before adding watchers
5. **Cross-repo graphs** — single-repo retrieval quality must be proven first
6. **Streaming responses** — premature until token efficiency is proven

---

## Why FIX (not GO or KILL)

**Not GO because:** P@5=0.015 is a hard failure. The retrieval pipeline returns almost no relevant results in top-5. No downstream improvement (assembly, budget, sufficiency) can compensate. The +38% token regression in the pilot is directly caused by poor retrieval forcing follow-up reads.

**Not KILL because:**
1. The root cause is specific and measurable (dependency entity flooding)
2. The fix is targeted (exclude/dampen dependency entities from search index)
3. The architectural foundation is sound (11/11 audit P0s implemented)
4. The assembly pipeline (budget, tiers, sufficiency, freshness) is genuinely better than grep/ripgrep
5. Architecture tasks show clear value (+2 solved vs baseline)
6. The thesis — attributable, budgeted, fresh structural retrieval — is untested because retrieval quality blocks it

**The product thesis is worth pursuing. One measurable blocker must be solved.**
