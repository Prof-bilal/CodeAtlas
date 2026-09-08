# RUNBOOK — 2026-09 Fresh 10-Cell Benchmark

How to execute the 10-cell matrix (2 configs × 5 tasks, 1 run each).

## Before you start

- [ ] `pnpm install && pnpm build` (or at least build `apps/cli`).
- [ ] Repos indexed with CodeAtlas:
  - `atlas build --repo benchmarks/2026-09-fresh/repos/01-small-app`
  - `atlas build --repo .` (monorepo root, for architecture/frontend cells)
- [ ] `opencode` CLI on `PATH` (or the runner configured in the configs).
- [ ] Enough disk/quota for 10 model runs (each up to 840s).

## Steps

```bash
B=benchmarks/2026-09-fresh

# 1. Create suites cells10-A (baseline) + cells10-B (codeatlas)
node $B/scripts/create-cells10-suites.mjs

# 2. Run the matrix (resumable)
bash $B/scripts/orchestrator-cells10.sh
```

Each cell spawns a detached `atlas benchmark run` process. The orchestrator
polls for exit and copies the result to `raw-results/<CONFIG>-<TASK>/result.json`.
A `copied` marker means the cell is done and it will be skipped on re-run.

## Manual single-cell run

```bash
suite=cells10-B
repo=benchmarks/2026-09-fresh/repos/01-small-app
task=BACKEND-EASY-01
mode=codeatlas
node apps/cli/dist/index.js benchmark run "$suite" --repo "$repo" --task "$task" --mode "$mode"
```

## After the run

- Generate the summary: `atlas benchmark report <suite-id>`.
- Score retrieval accuracy: see `metrics/` + `benchmarks/retrieval-tasks/`.
- Publish results only for triaged tasks (`tasks/README.md`).

## Status

Use to check progress:

```bash
tail -f $B/orchestrator-cells10.log    # live log
ls $B/raw-results/                     # per-cell dirs (copied marker = done)
```