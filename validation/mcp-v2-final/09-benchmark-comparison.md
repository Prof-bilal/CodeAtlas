# Benchmark Comparison — CodeAtlas MCP V2

**Date:** 2026-09-07 | **Commit:** 04f0d6f

## 2026-09 Pilot (n=1, 16 tasks, 4 configs)

| Metric | A (Baseline) | B (+CodeAtlas) | C (+Tools) | D (+Skills) |
|--------|-------------|----------------|------------|-------------|
| Avg Score | 1.56 | 1.44 | 1.13 | 1.56 |
| Avg Tokens | 496,795 | 688,405 | 410,452 | 606,270 |
| Avg Tools | 18.6 | 19.8 | 15.0 | 21.0 |
| Timeout % | 0% | 0% | 19% | 0% |
| Correct | 12 | 10 | 8 | 11 |
| Failed | 2 | 1 | 6 | 1 |

## Component Deltas

| Delta | Score | Tokens | Interpretation |
|-------|------:|-------:|----------------|
| B - A (context) | -0.13 | +38% | Context alone hurts |
| C - B (tools) | -0.31 | -38% | Tools hurt more |
| D - C (skills) | +0.44 | +48% | Skills recover |

## Retrieval Eval (n=1, 30 tasks)

| Metric | Value | vs Target |
|--------|------:|----------:|
| P@1 | 0.0000 | FAIL (≥0.15) |
| P@5 | 0.0150 | FAIL (≥0.30) |
| P@10 | 0.0231 | FAIL (≥0.40) |
| MRR | 0.0365 | FAIL (≥0.20) |

## What the Numbers Mean

1. **CodeAtlas helps on architecture tasks** (+2 solved vs baseline). This is the clearest value signal.
2. **CodeAtlas hurts average score and tokens.** The -0.13 score and +38% tokens are caused by poor retrieval (dependency flooding) forcing follow-up reads.
3. **Skills recover lost ground** but only back to baseline — not above it.
4. **Retrieval quality is near-zero** — the assembly pipeline operates on garbage-in results.

## Statistical Limitations

- n=1 per cell: no confidence intervals possible
- Single model: opencode/mimo-v2.5-free only
- Skewed repos: CodeAtlas + small-app heavy
- Automated scoring: proxy for correctness

## What Would Change the Comparison

1. Fix dependency flooding → P@5 should jump from 0.015 to ≥0.30
2. Re-run pilot with fixed retrieval → expect B > A on score AND tokens
3. Add n≥3 per cell → enable statistical significance testing
