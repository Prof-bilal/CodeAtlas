# Benchmarks Directory — Scope & Status

> **For new benchmarking work, use `atlas benchmark`** (see
> `docs/benchmark.md`). The framework lives in `packages/benchmark`
> (`BenchmarkPort`, ADR-012) and covers init/run/status/report, OpenCode and
> Ollama runners, baseline vs CodeAtlas modes, real token/cost capture via
> `@atlas/usage`, automated accuracy evaluation, and Markdown/JSON/HTML
> reports. Data is persisted under `.codeatlas/benchmarks/`.

This directory contains the **pre-framework harnesses**. They are retained as
historical records and specialized tools — they are not the going-forward
benchmarking surface. Scope of each artifact:

| Artifact | Status | Scope |
|---|---|---|
| `final-2026-08/` | **Retained (historical + input)** | The August 2026 OpenCode end-to-end benchmark. Its `repos/` clones (winston/commander/axios/rxjs at pinned commits) and `tasks/*.json` task suites are the **inputs** the `atlas benchmark` suites (`winston-bench`, `commander-bench`, `axios-bench`, `rxjs-bench`) run against. Its `run-benchmark.mjs`/`generate-reports.mjs` are superseded by `atlas benchmark run/report`. |
| `run-benchmark.ts` / `run-single.ts` | **Superseded** (`pnpm benchmark`, `pnpm benchmark:single`) | Legacy estimate-based harness (char/4 token estimates, hard-coded baselines). Kept for reproducibility of the 2026-08-15 report in `docs/benchmark.md`; do not extend. |
| `extreme/` | **Retained (specialized)** | Memory/stress harness (RSS-guarded 1000/5000-file corpora). Measures indexing resource ceilings, not agent context quality — orthogonal to `atlas benchmark`. |
| `01-small-app` … `05-large-project` | **Retained (fixtures)** | Fixture repositories for the legacy harness and `extreme/`. |
| `../tests/benchmarks/mcp-benchmark.ts` | **Retained (micro-bench)** | MCP tool latency over in-memory transport (5× min/max/avg/median). Measures transport overhead, not agent performance. |

## Reproducing a suite run

```bash
atlas benchmark run winston-bench \
  --repo benchmarks/final-2026-08/repos/repo-01
atlas benchmark report winston-bench          # Markdown (also: --format json|html)
```

Suite configs and task files persist in `.codeatlas/benchmarks/` (suites,
task-files); results are JSON per task/mode. `--force` re-runs completed
tasks; omitting it resumes a partially completed suite.
