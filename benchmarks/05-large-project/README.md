# Benchmark: 05-large-project

## Repository Profile

- **Files:** 5,199
- **Lines:** 409,448
- **Type:** Large multi-package project (stress test)
- **Language:** TypeScript

## Scan Results

| Metric | Value |
|--------|------:|
| First scan | 300,227ms (~5 min) |
| Incremental update | 167,928ms (~2.8 min) |
| Files indexed | 5,151 |
| Symbols indexed | 143,226 |
| Dependencies indexed | 210,099 |
| Index size | 535.3 MB |

## Task Results (Partial — benchmark timed out)

| Task | Category | Latency | Files Returned |
|------|----------|--------:|---------------:|
| Find auth | search | 38,362ms | 20 |
| Find shared types | search | 30,586ms | 20 |
| Trace payment flow | context | 300,057ms | 0 (timeout) |

## Key Findings

1. **CRITICAL:** Scan takes ~5 minutes for 5,199 files
2. **CRITICAL:** Incremental update takes ~2.8 minutes
3. Search latency: 30–38s (unacceptable for interactive use)
4. Context build timed out at 5 minutes
5. Index size: 535 MB (very large)

## Scaling Analysis

| Metric | small-app | medium-api | monorepo | large-project |
|--------|----------:|-----------:|---------:|--------------:|
| Files | 82 | 405 | 1,291 | 5,199 |
| Scan (ms) | 8,615 | 12,264 | 71,775 | 300,227 |
| Scan/file (ms) | 105 | 30 | 56 | 58 |
| Search (ms) | 1,292 | 1,895 | 7,261 | 34,474 |
| Index (MB) | 1.9 | 8.9 | 93.5 | 535.3 |

**Observation:** Scan time scales super-linearly. Search latency scales linearly with index size.

## Results File

Partial results — benchmark timed out before completion.
