# Validation Summary — CodeAtlas MCP V2

**Decision:** FIX | **Confidence:** HIGH | **Date:** 2026-09-07

CodeAtlas MCP V2 is architecturally sound with all 11 audit P0 recommendations implemented. One critical blocker prevents GO: **retrieval quality is near-zero** (P@5=0.015, MRR=0.037) because 325K dependency edge entities flood search top-k, starving relevant file/symbol results. The fix is targeted — exclude dependency entities from the search index — and the measured impact should unlock the entire downstream pipeline (budget, tiers, sufficiency, freshness).

**Key numbers:**
- Tests: 151/151 MCP, 1484/1488 total
- Index: 7,565 files, 210K symbols, 325K dependencies, 443MB
- Retrieval: P@1=0.00, P@5=0.015, MRR=0.037
- Latency: readRange 1.6ms, searchFiles 114ms, overview 4.5s cold
- Pilot: B (CodeAtlas) = 1.44 vs A (Baseline) = 1.56, +38% tokens
- Tool surface: 8 tools + 4 aliases (reduced from 16)
- Audit compliance: 11/11 P0 items IMPLEMENTED
