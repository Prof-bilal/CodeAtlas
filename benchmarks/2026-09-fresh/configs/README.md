# Benchmark Configuration — 2026-09 Fresh (10-cell)

Two configurations, differing **only** in harness composition. Model, task, task
prompt, repository + commit, machine/environment, timeout, and evaluator are
identical across configs (Phase 4 / Phase 15 anti-gaming rule).

| Config | CodeAtlas | External tools | Skills | Purpose |
|---|---|---|---|---|
| **A — Baseline** | off | off | off | Agent without CodeAtlas (true baseline; comparison floor) |
| **B — CodeAtlas Simple** | on | off | off | Direct value of CodeAtlas core context |

## Cell layout (10 total)

```
Config A × 5 tasks  =  5 cells  (baseline)
Config B × 5 tasks  =  5 cells  (codeatlas)
                       ─────────
                       10 cells  total
```

## Tasks selected (one per domain)

| ID | Domain | Difficulty | Repository |
|---|---|---|---|
| BACKEND-EASY-01 | backend | easy | repos/01-small-app |
| ARCH-EASY-01 | architecture | easy | codeatlas (monorepo) |
| FRONTEND-MEDIUM-01 | frontend | medium | codeatlas (monorepo) |
| TESTING-MEDIUM-01 | testing | medium | repos/01-small-app |
| REFACTORING-MEDIUM-01 | refactoring | medium | repos/01-small-app |

## What is held constant

| Axis | Value |
|---|---|
| Model | `opencode/mimo-v2.5-free` |
| Task prompt | Identical user-facing prompt per task (no solution leakage) |
| Repository + commit | Same pinned repo per task |
| Environment / hardware | Same runner machine for a given run cycle |
| Timeout | `taskTimeoutMs` = 840s |
| Evaluator / success criteria | Same evaluator (see `metrics/`) |
| Runs per config × task | 1 (single-run accuracy snapshot) |

Only the harness composition changes between **A → B**.
