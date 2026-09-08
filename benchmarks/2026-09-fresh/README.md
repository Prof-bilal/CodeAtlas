# 2026-09 Fresh — 10-Cell Benchmark

A lean, reproducible measurement of **CodeAtlas as an agent aid**, comparing two
harness configurations (baseline vs CodeAtlas) across five curated tasks — one
run each, **10 cells total**. This is a new cycle: historical 64-cell 5x
matrices and reports live under `old-school/` and are not reused or modified.

## Status

- **Framework: built.** Configurations (A/B), methodology, metrics/scoring, and
  the 5-task curated catalog are in place.
- **Execution: pending.** Running the matrix requires a configured runner
  (opencode/kilo/ollama) and pinned repos. See `RUNBOOK.md`. No benchmark
  numbers are presented as results until a real run is complete — the framework
  does not fabricate numbers.

## What this determines

Incremental value, on identical tasks/models/timeouts:

| Question | Comparison |
|---|---|
| Does CodeAtlas help? | Config B (CodeAtlas) vs A (Baseline) |

Plus: which domains benefit most, failure modes, and context efficiency.

## Layout

```
2026-09-fresh/
├── README.md            ← this file
├── methodology.md        ← protocol
├── RUNBOOK.md           ← how to execute a matrix run
├── configs/             ← Config A + B (runsPerTask=1)
├── skills/              ← benchmark skills (SKILL.md)
├── tasks/               ← task manifests + schema (cells10.json = 5 tasks)
├── metrics/             ← metrics + scoring rubric
├── repos/               ← disposable clones for testing
├── scripts/             ← suite creator + 10-cell orchestrator
└── raw-results/         ← preserved raw runs (never replaced)
```

## Cell matrix (10)

| Config | BACKEND-EASY-01 | ARCH-EASY-01 | FRONTEND-MEDIUM-01 | TESTING-MEDIUM-01 | REFACTORING-MEDIUM-01 |
|---|---|---|---|---|---|
| **A — Baseline** | cell | cell | cell | cell | cell |
| **B — CodeAtlas** | cell | cell | cell | cell | cell |

- 5 tasks span 5 domains × 2 difficulty levels (easy/medium).
- Repos: `repos/01-small-app` (backend, testing, refactoring) and the
  CodeAtlas monorepo itself (architecture, frontend).
- Same model (`opencode/mimo-v2.5-free`), timeout (840s), evaluator, and
  machine across all cells.

## Repositories under test

- `01-small-app` (Express+TS task API) — backend, testing, refactoring cells.
- `codeatlas` (this monorepo) — architecture and frontend cells.

## Ground rules

- Only triaged tasks enter published results (`tasks/README.md`).
- Same model/prompt/repo/timeout/evaluator across both configs.
- Raw results are preserved; aggregation is derived and raw values stay visible.
- Context precision/recall are reported only when reliably measurable.
- If CodeAtlas shows no measurable benefit, the report says so honestly.

## Running it

```bash
# 1. Build the CLI, index the repos
pnpm build  # or build the cli app
atlas build --repo benchmarks/2026-09-fresh/repos/01-small-app
atlas build --repo .          # for the monorepo itself

# 2. Create the suites (cells10-A, cells10-B)
node benchmarks/2026-09-fresh/scripts/create-cells10-suites.mjs

# 3. Run all 10 cells (resumable; see RUNBOOK)
bash benchmarks/2026-09-fresh/scripts/orchestrator-cells10.sh
```