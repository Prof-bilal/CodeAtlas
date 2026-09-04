# Benchmark: 01-small-app

## Repository Profile

- **Files:** 82
- **Lines:** 6,609
- **Type:** Small Express.js task management app
- **Language:** TypeScript

## Scan Results

| Metric | Value |
|--------|------:|
| First scan | 8,615ms |
| Incremental update | 3,109ms |
| Files indexed | 76 |
| Symbols indexed | 1,198 |
| Dependencies indexed | 1,788 |
| Index size | 1.9 MB |

## Task Results

| Task | Category | Latency | Files Returned |
|------|----------|--------:|---------------:|
| Find authentication | search | 1,292ms | 20 |
| Find user creation | search | 1,322ms | 20 |
| Explain request flow | explain | 1,370ms | 0 |
| Add endpoint context | context | 3,403ms | 20 |
| Find auth tests | search | 1,164ms | 20 |

## Key Findings

1. Search works well for small repos
2. Context build provides relevant files
3. Scan time is proportional to file count

## Results File

See `results/small-app.json` for raw data.
