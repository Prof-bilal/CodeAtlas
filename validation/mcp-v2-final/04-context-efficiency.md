# Context Efficiency — CodeAtlas MCP V2

**Date:** 2026-09-07 | **Commit:** 04f0d6f

## Token Usage (from 2026-09 Pilot, n=1)

| Config | Avg Tokens | vs Baseline | Avg Tools | vs Baseline |
|--------|-----------|------------|----------|------------|
| A (Baseline) | 496,795 | — | 18.6 | — |
| B (+CodeAtlas) | 688,405 | +38% | 19.8 | +1.2 |
| C (+Tools) | 410,452 | -17% | 15.0 | -3.6 |
| D (+Skills) | 606,270 | +22% | 21.0 | +2.4 |

## Context Size Defaults

| Parameter | Value | Token Estimate |
|-----------|-------|---------------|
| maxItems (find_relevant_context) | 20 | ~20 items |
| maxTokens (find_relevant_context) | 12,000 | ~12k tokens |
| maxTokensPerItem | 2,000 | ~2k tokens/item |
| MAX_OUTPUT_CHARS | 50,000 | ~12.5k tokens |
| read_file_range max | 20,000 chars | ~5k tokens |
| get_dependencies default | 25 edges | ~500 tokens |
| project_overview (summary) | varies | ~500-2k tokens |
| project_overview (full) | modules≤100, files≤50, symbols≤100 | ~5k tokens |

## Budget Mechanics

- **Essentials never dropped:** instructions, digest, critical-tier items
- **Tail-drop:** lowest-ranked droppable items removed when budget exceeded
- **Per-item truncation:** content capped at maxTokensPerItem (2000 tokens)
- **Truncated flag:** + recount to keep budget accurate
- **BudgetRecord:** surfaced to MCP response (maxItems, maxTokens, totalItems, totalTokens, budgetExceeded)
- **Digest mode:** used when >800 files (deterministic summary, no provider)

## Bloat Sources (Unchanged from Audit)

| Source | Impact |
|--------|--------|
| Essentials prepended every call (instructions + digest + overview) | MEDIUM — 500-2k tokens per call |
| Default maxItems=20 + maxTokens=12000 | MEDIUM — 12k tokens is the +38% right order |
| Dependency entities in search results | HIGH — 325K entities inflate search results |
| Repeated search→inspect→deps→read chains | MEDIUM — +1.2 tools vs baseline |
| full overview + explain_module dumps | LOW-MEDIUM — opt-in only |

## What's Good

- brief mode available (one-line pointers)
- per-item truncation with honest flags
- BudgetRecord exposed for agent awareness
- digest mode for large repos
- MAX_OUTPUT_CHARS 50k hard cap

## Missing

- Per-tool byte attribution in responses (timings added, bytes not)
- Near-duplication detection (identity-only dedup)
- Actual tokens-per-sufficient-task metric (requires agent loop)
- Irrelevant-token percentage measurement
