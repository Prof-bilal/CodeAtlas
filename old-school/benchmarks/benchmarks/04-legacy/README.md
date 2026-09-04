# Benchmark: 04-legacy

## Repository Profile

- **Files:** 715
- **Lines:** 66,972
- **Type:** Legacy codebase with duplicate implementations
- **Language:** TypeScript + JavaScript

## Scan Results

| Metric | Value |
|--------|------:|
| First scan | 14,591ms |
| Incremental update | 6,594ms |
| Files indexed | 699 |
| Symbols indexed | 9,677 |
| Dependencies indexed | 18,852 |
| Index size | 18.6 MB |

## Task Results

| Task | Category | Latency | Files Returned |
|------|----------|--------:|---------------:|
| Find active auth | search | 2,636ms | 20 |
| Find deprecated code | search | 2,111ms | 20 |
| Explain auth wrapper | explain | 3,598ms | 0 |
| Find active payment | search | 2,674ms | 20 |
| Find duplicates | search | 2,730ms | 20 |
| Explain dependency cycle | explain | 3,448ms | 0 |

## Key Findings

1. Search works despite messy codebase
2. Legacy naming (authenticateUserV2, authenticateUserLegacy) handled by fuzzy search
3. Dependency count is high (18,852) due to duplicates
4. Explain tasks returned 0 results (benchmark script issue)

## Results File

See `results/legacy.json` for raw data.
