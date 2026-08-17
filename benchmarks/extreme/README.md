# CodeAtlas Extreme-Repository Stress Benchmark

Deterministic stress test of CodeAtlas against large generated TypeScript
repositories. Run on a shared 7.2 GiB desktop machine.

## What is here

| Path | Purpose |
|---|---|
| `generate.mjs` | Deterministic, seeded repository generator (`--repo a|b`, `--scale`, `--lines`, `--count`, `--out`, `--verify`) |
| `run-monitored.mjs` | Memory-guarded runner: records wall time / peak RSS / min available RAM, kills the child before the machine OOM-freezes |
| `mcp-test.mjs` | MCP stdio driver: exercises all CodeAtlas tools + 5/10/25-way concurrency |
| `environment.json` | Machine / runtime / CodeAtlas snapshot |
| `benchmark.md` | Full benchmark report and verdict |
| `results.json` | Structured results (this directory) |
| `repo-1000/` | **Working corpus** — 1,000 files, 5.05M LOC (indexed; results in `repo-1000/results.json`) |
| `repo-5000/` | Full Repo A — 5,000 files, 25.2M LOC (generated fixture; not fully indexable on this hardware) |
| `repo-10000/` | Full Repo B — 10,005 files, 150.4M LOC (generator target; regenerated with `--repo b` when needed) |

The generated repositories are git-ignored (multi-GB, regenerable in ~1-2 min each).

## Reproduce

```bash
pnpm --filter codeatlas-cli build

# 1000-file working corpus (already generated):
node benchmarks/extreme/generate.mjs --repo a --scale 5 --out benchmarks/extreme/repo-1000

# Index it (monitored):
NODE_OPTIONS="--max-old-space-size=6144" node benchmarks/extreme/run-monitored.mjs \
  --label repo-1000 --max-rss 6200 --min-avail 80 -- \
  node apps/cli/dist/index.js init --repo benchmarks/extreme/repo-1000 --json

# Read-path tests:
node benchmarks/extreme/mcp-test.mjs --repo benchmarks/extreme/repo-1000
node apps/cli/dist/index.js search --repo benchmarks/extreme/repo-1000 --json "Validator"
node apps/cli/dist/index.js context build --repo benchmarks/extreme/repo-1000 --json "Debug the order processing pipeline"

# Full repos (hardware permitting):
node benchmarks/extreme/generate.mjs --repo a --out benchmarks/extreme/repo-5000
node benchmarks/extreme/generate.mjs --repo b --out benchmarks/extreme/repo-10000
```

## Result at a glance

CodeAtlas indexes, searches, retrieves context from, and incrementally updates
a **1,000-file / 5.05M-LOC** repository successfully on this machine
(~4.85 GiB peak build RSS, ~337 MB index, ~2 s searches, sub-100 ms MCP reads,
hash-based incremental skip). The **25M-LOC and 150M-LOC** targets are not
reachable on this 7.2 GiB machine: the full build holds the whole corpus in
memory and needs ~5-10+ GiB, which froze the machine three times. See
`benchmark.md` for the full report and **PASS WITH CONDITIONS** verdict.