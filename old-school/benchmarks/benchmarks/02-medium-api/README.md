# Benchmark: 02-medium-api

## Repository Profile

- **Files:** 405
- **Lines:** 30,448
- **Type:** Medium production API
- **Language:** TypeScript

## Scan Results

| Metric | Value |
|--------|------:|
| First scan | 12,264ms |
| Incremental update | 3,786ms |
| Files indexed | 395 |
| Symbols indexed | 5,363 |
| Dependencies indexed | 7,407 |
| Index size | 8.9 MB |

## Task Results

| Task | Category | Latency | Files Returned |
|------|----------|--------:|---------------:|
| Find auth flow | search | 2,433ms | 20 |
| Trace payment | search | 1,895ms | 20 |
| Find authz middleware | search | 1,896ms | 20 |
| Add endpoint context | context | 11,263ms | 20 |
| Fix validation bug | context | 11,445ms | 20 |
| Find payment tests | search | 1,711ms | 20 |

## Key Findings

1. Search latency: 1.7–2.4s for 405 files
2. Context build: ~11s (includes search + assembly)
3. All search tasks returned 20 results
4. Context packages include relevant files

## Results File

See `results/medium-api.json` for raw data.
