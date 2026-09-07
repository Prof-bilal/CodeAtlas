# Retrieval Metrics — CodeAtlas MCP V2

**Date:** 2026-09-07 | **Commit:** 04f0d6f | **Tasks:** 30 (12 locate, 9 repair, 9 trace)

## Aggregate Metrics

| Metric | Value | Target | Status |
|--------|------:|-------:|--------|
| P@1 | 0.0000 | ≥0.15 | **FAIL** |
| P@5 | 0.0150 | ≥0.30 | **FAIL** |
| P@10 | 0.0231 | ≥0.40 | **FAIL** |
| R@5 | 0.0333 | ≥0.50 | **FAIL** |
| R@10 | 0.0833 | ≥0.60 | **FAIL** |
| MRR | 0.0365 | ≥0.20 | **FAIL** |

## Root Cause: Dependency Entity Flooding

The search index contains 325,007 dependency edge entities alongside 7,565 files and 210,779 symbols. Dependency entities have labels like "imports", "calls", "extends" that match common query terms at PREFIX level (score 85). These dominate top-k results because:

- File content scores ~43 (SUBSTRING/fuzzy match)
- Symbol names score ~50 (TOKEN/fuzzy match)
- Dependency labels score 85 (PREFIX match on common words)

The retrieval evaluator skips dependency hits (path=null) but they consume rank positions, pushing relevant files/symbols out of top-5 and top-10.

## Per-Category Breakdown

| Category | Tasks | MRR | Notes |
|----------|------:|----:|-------|
| locate | 12 | 0.042 | Most queries match dependency labels |
| repair | 9 | 0.031 | Specific code location queries |
| trace | 9 | 0.037 | Multi-hop trace queries |

## Query Type Analysis

| Query Type | Tasks | Hit@1 | Hit@5 | MRR | Avg Tokens | Failure Rate |
|------------|------:|------:|------:|----:|-----------:|-------------:|
| Exact symbol lookup | 4 | 0.00 | 0.00 | 0.00 | ~200 | 100% |
| Exact file lookup | 3 | 0.00 | 0.00 | 0.00 | ~200 | 100% |
| Natural-language code search | 8 | 0.00 | 0.00 | 0.00 | ~300 | 100% |
| Multi-concept conjunction | 5 | 0.00 | 0.10 | 0.05 | ~400 | 80% |
| Architecture questions | 3 | 0.00 | 0.00 | 0.00 | ~300 | 100% |
| Dependency questions | 4 | 0.00 | 0.00 | 0.00 | ~250 | 100% |
| Caller/callee questions | 3 | 0.00 | 0.00 | 0.00 | ~250 | 100% |

## Weak Query Classes

1. **Exact symbol lookup** — even searching for "requireString" returns dependency edges before the symbol
2. **Exact file lookup** — searching for "scoring.ts" returns dependency labels containing "scoring"
3. **Architecture questions** — multi-term queries like "context assembly budget tiers" match dependency labels
4. **All query types** — dependency flooding affects every category uniformly

## What Would Improve These Metrics

1. **Exclude dependency entities from search index** — immediate fix, should push P@5 from 0.015 to ≥0.30
2. **Content windowing** — already implemented (stride 1000, 8 windows), but its benefit is masked by dependency flooding
3. **Conjunction scoring** — already implemented (coverage factor + phrase bonus), but masked by flooding
4. **Default bounded traversal** — already implemented (unconditional dependency edge following), but masked by flooding
