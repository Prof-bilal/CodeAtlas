# Missing Measurements — CodeAtlas MCP V2

**Date:** 2026-09-07 | **Commit:** 04f0d6f

## Measurements That Could Not Be Collected

| Measurement | Why Missing | Impact |
|-------------|-------------|--------|
| Large-repo scale (10k/50k files) | Scale grid only ran 100/1000; larger sizes not executed | Cannot assess scalability beyond 1000 files |
| n≥3 statistical significance | Pilot is n=1 per cell; no reruns performed | -0.13 score delta and +38% token delta could be noise |
| Context efficiency (tokens per sufficient task) | Requires agent loop measurement with task completion tracking | Cannot prove token savings |
| Per-tool byte attribution | Timings added but byte counters not wired into responses | Cannot identify largest token waste sources |
| Near-duplication rate | No near-dup detection implemented | Cannot measure redundancy |
| Chain-coverage on trace tasks | Graph traversal metrics not computed | Cannot measure multi-hop retrieval quality |
| Freshness probe latency at scale | Only measured at 100/1000 files | Unknown if probe becomes bottleneck |
| Search rebuild latency at scale | Only measured via SDK calls at current repo size | Unknown if rebuild becomes bottleneck |
| Agent task success with improved retrieval | Requires re-run after dependency flooding fix | Cannot prove fix improves task outcomes |
| Stale-result rate | Requires controlled change experiments | Cannot measure freshness correctness |
| Token-per-correct-answer | Requires task scoring with token attribution | Cannot prove efficiency |
| Graph correctness (false positives/negatives) | Requires ground-truth edge validation | Cannot measure graph quality |

## Why These Matter

- **Large-repo scale:** The hot paths (freshness probe, search rebuild) do O(corpus) work. Without measuring at 10k+, we cannot claim scalability.
- **Statistical significance:** The pilot's n=1 means any single-cell conclusion is unreliable. The -0.13 delta could be 0 with n≥3.
- **Context efficiency:** The +38% token regression is measured but the cause is inferred, not proven per-tool.
- **Chain-coverage:** Multi-hop retrieval is a key differentiator but unmeasured.

## What Was Measured

| Measurement | Method | Result |
|-------------|--------|--------|
| Test suite | vitest run | 151/151 MCP, 1484/1488 total |
| Index size | SQLite queries | 7,565 files, 210K symbols, 325K deps, 443MB |
| Tool latency | SDK direct calls, 3 runs | readRange 1.6ms to searchSymbols 2.3s cold |
| Scale (100/1000) | scale-grid/generate.mjs | 100=2s, 1000=1.8s index |
| Retrieval quality | evaluate-retrieval.ts, 30 tasks | P@1=0.00, P@5=0.015, MRR=0.037 |
| Pilot scores | 2026-09 benchmark report | A=1.56, B=1.44, C=1.13, D=1.56 |
| Audit compliance | git diff b3d1167..04f0d6f | 11/11 P0 items IMPLEMENTED |
| Tool surface | code inspection | 8 tools + 4 aliases |
