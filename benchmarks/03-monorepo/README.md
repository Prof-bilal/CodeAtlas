# Benchmark: 03-monorepo

## Repository Profile

- **Files:** 1,291
- **Lines:** 108,637
- **Type:** Multi-package monorepo
- **Language:** TypeScript

## Scan Results

| Metric | Value |
|--------|------:|
| First scan | 71,775ms |
| Incremental update | 19,254ms |
| Files indexed | 1,271 |
| Symbols indexed | 47,859 |
| Dependencies indexed | 78,491 |
| Index size | 93.5 MB |

## Task Results

| Task | Category | Latency | Files Returned |
|------|----------|--------:|---------------:|
| Find auth impl | search | 7,218ms | 20 |
| Find shared user type | search | 7,261ms | 20 |
| Explain shared types | explain | 10,023ms | 0 |
| Find payment validation | search | 7,633ms | 20 |
| Explain shared utils | explain | 10,368ms | 0 |
| Find shared tests | search | 5,989ms | 20 |

## Key Findings

1. Scan time: 72s for 1,291 files (scaling concern)
2. Search latency: 6–7.6s (linear with index size)
3. Index size: 93.5 MB (significant)
4. Symbol count: 47,859 (high due to generated files)

## Results File

See `results/monorepo.json` for raw data.
