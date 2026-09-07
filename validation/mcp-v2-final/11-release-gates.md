# Release Gates — CodeAtlas MCP V2

**Date:** 2026-09-07 | **Commit:** 04f0d6f

## Gate Scorecard

| # | Gate | Status | Evidence | Severity |
|---|------|--------|----------|----------|
| 1 | Correctness | **PASS** | 151/151 MCP tests pass; no runtime errors; zod validation on all tools | — |
| 2 | Retrieval | **FAIL** | P@5=0.015, MRR=0.037; dependency entity flooding starves relevant results | P0 |
| 3 | Context Sufficiency | **CONDITIONAL** | Assembly machinery correct (budget, tiers, sufficiency, freshness) but operates on garbage retrieval; cannot assess sufficiency when P@5=0.015 | P0 (blocked by Gate 2) |
| 4 | Token Efficiency | **FAIL** | +38% tokens vs baseline (pilot n=1); likely caused by poor retrieval forcing follow-up reads | P0 (blocked by Gate 2) |
| 5 | Attribution | **PASS** | Per-item score/source/reason/tier/tokens + confidence bands; BudgetRecord + ExclusionRecord exposed | — |
| 6 | Freshness | **PASS** | mtime probe, auto-refresh, honest stale/unavailable states; never serves stale silently | — |
| 7 | Performance | **CONDITIONAL** | readRange 1.6ms excellent; searchSymbols 2.3s cold/460ms warm acceptable; overview 4.5s cold/<1ms warm; probe+rebuild unmeasured at scale | P1 |
| 8 | MCP API | **PASS** | 8 tools + 4 aliases; zod schemas; structured responses; brief mode; score normalization 0..1; timings metadata | — |
| 9 | Scalability | **UNKNOWN** | Only tested to 1000 files; 10k+ unmeasured; hot paths do O(corpus) work | P1 |
| 10 | Differentiation | **CONDITIONAL** | Budget/dedup/sufficiency/freshness are genuine moat; but retrieval quality negates their value today | P0 (blocked by Gate 2) |

## Summary

- **PASS:** 4 gates (Correctness, Attribution, Freshness, MCP API)
- **CONDITIONAL:** 3 gates (Context Sufficiency, Performance, Differentiation)
- **FAIL:** 2 gates (Retrieval, Token Efficiency)
- **UNKNOWN:** 1 gate (Scalability)

## Blocking Relationships

- Gate 3 (Context Sufficiency) is blocked by Gate 2 (Retrieval)
- Gate 4 (Token Efficiency) is blocked by Gate 2 (Retrieval)
- Gate 10 (Differentiation) is blocked by Gate 2 (Retrieval)

**One fix (dependency entity flooding) unblocks 3 gates.**

## Pass Conditions

| Gate | Pass Condition | Current | Gap |
|------|---------------|---------|-----|
| Retrieval | P@5 >= 0.30 AND MRR >= 0.20 | P@5=0.015, MRR=0.037 | 20x improvement needed |
| Token Efficiency | Non-inferior to baseline at equal-or-lower tokens | +38% tokens | Blocked by retrieval |
| Context Sufficiency | Sufficiency => solved rate non-decreasing | Unknown | Blocked by retrieval |
| Performance | Probe <= 5% of p95 tool latency | Unknown | Needs measurement |
| Scalability | No regression at 10k files | Unknown | Needs measurement |
