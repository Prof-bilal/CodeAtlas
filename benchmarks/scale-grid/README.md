# Scale grid (Phase 0 Task 5 — measure-only)

> Plan §14: run the grid, publish the table, gate optimizations on numbers.
> No optimization without numbers. P1 warm-index work ships only if this grid
> shows pain (probe >5% of p50 read latency or branch-storm pain).

## Running

```bash
# Small default (fast, CI-safe): 100 + 1000 synthetic TS files.
# NOTE: run with tsx so the script can import the SDK-owned indexer from
# source (plain node cannot resolve the TS sources and prints an
# honest "SDK import skipped" row instead of fake numbers).
pnpm exec tsx benchmarks/scale-grid/generate.mjs

# Full grid (slower, manual): 1k / 10k / 50k
SCALE_GRID_SIZES="1000,10000,50000" pnpm exec tsx benchmarks/scale-grid/generate.mjs
```

The script synthesizes flat TS repos under `$(mktemp -d)`, runs the SDK-owned
`indexProject` in-process via `tsx` (dev) or against the built SDK, measures:

- index time (wall ms), peak RSS (process), db bytes
- cold probe latency (`ensureFresh` first call) + warm probe (second call)
- `context_for`-equivalent assembly bytes vs maxItems/maxTokens grid point

Results print as Markdown rows ready to paste into
`benchmarks/retrieval-tasks/BASELINE.md`. Temp repos are always cleaned up.
No network, no provider.

## Gates

- Publish p50/p95 per primitive + probe share for the largest size you ran.
- If probe+rebuild are negligible to 50k files, KILL the warm-index work
  (plan §"What Would Make This Plan Wrong?").
