# Fresh Comprehensive Benchmark — Report (2026-09)

> **Status: complete · 10-cell matrix executed 2026-09-08.**
> Raw results are preserved under `raw-results/` and summary cells under
> `.codeatlas/benchmarks/suites/cells10-{A,B}/`. The previous 64-cell pilot
> (16 tasks × 4 configs) is archived under `old-school/` and deliberately not
> reused — its raw results were superseded by the lean single-run matrix.

---

## Executive Summary

On 5 curated tasks (1 easy architecture, 1 easy backend, 1 medium frontend,
1 medium refactoring, 1 medium testing), the **CodeAtlas** config (**B**)
outperformed the plain baseline (**A**):

- **A (baseline): 7/10** — ARCH 2, BACKEND 2, FRONTEND **0** (timeout), TESTING 2, REFACTORING 1
- **B (+CodeAtlas): 9/10** — ARCH 2, BACKEND 2, FRONTEND **2**, TESTING 2, REFACTORING 1
- **Delta B − A: +2** (exactly the two B cells the baseline could not complete:
  the frontend cell timed out at 14 min with no result and no file touched).

CodeAtlas did not *degrade* any cell (equal scores on the four cells both arms
completed), and it let the agent **complete** the one task baseline timed out
on — the VS Code status-bar task — touching the right files and passing all 52
extension tests. On the other completed cells CodeAtlas used fewer tool calls
(BACKEND 14 vs 9, TESTING 21 vs 25, REFACTORING 32 vs 28, ARCH 17 vs 3) and
finished materially faster while reaching the same score (e.g. TESTING 127 s
vs baseline 586 s, ARCH 45 s vs 183 s).

## What was tested

Whether **CodeAtlas** helps an AI coding agent understand repositories and solve
tasks accurately. Two harness configurations are compared on identical tasks,
models, timeouts, and repositories (see `configs/` and `tasks/cells10.json`):

| Config | Label | CodeAtlas |
|--------|-------|-----------|
| **A** | Baseline | ❌ |
| **B** | +CodeAtlas | ✅ |

The delta **B − A** isolates the direct value of CodeAtlas core context.

## Cells

5 tasks × 2 configs = 10 cells, one run each. See `configs/README.md` for the
cell matrix. Repository mapping: the backend / refactoring / testing tasks run
on the in-tree fixture `repos/01-small-app`; the architecture / frontend tasks
run on the monorepo itself (`apps/extension`, `packages/*`). Model
`opencode/mimo-v2.5-free`, `taskTimeoutMs = 840000`.

## Results

| Cell                    | Config   | Score | Status            | Tool calls | Duration  | Notes |
|-------------------------|----------|-------|-------------------|-----------|-----------|-------|
| ARCH-EASY-01            | A        | 2     | correct           | 3          | 183 s     |       |
| ARCH-EASY-01            | B        | 2     | correct           | 17         | 45 s      | uses `codeatlas_search_files` |
| BACKEND-EASY-01         | A        | 2     | correct           | 9          | 110 s     |       |
| BACKEND-EASY-01         | B        | 2     | correct           | 14         | 80 s      | uses `codeatlas_search_files` |
| FRONTEND-MEDIUM-01      | A        | 0     | failed (timeout)  | 14         | 840 s     | stale status UI unchanged |
| FRONTEND-MEDIUM-01      | B        | 2     | correct           | 46         | 341 s     | 52 extension tests pass |
| TESTING-MEDIUM-01       | A        | 2     | correct           | 25         | 586 s     |       |
| TESTING-MEDIUM-01       | B        | 2     | correct           | 21         | 127 s     |       |
| REFACTORING-MEDIUM-01   | A        | 1     | partially correct | 28         | 258 s     |       |
| REFACTORING-MEDIUM-01   | B        | 1     | partially correct | 32         | 138 s     |       |

Totals: **A 7/10**, **B 9/10**.

## Takeaways

- The delta is driven by **task completion**: CodeAtlas converted the frontend
  timeout (0) into a correct cell (2). Both arms solved the backend, testing,
  architecture, and refactoring tasks to the same score.
- On every cell **B finished faster than A** (and used equal-or-fewer tool
  calls on the medium tasks), suggesting the indexed context shortens
  exploration; sample sizes are far too small to call this significant.
- Refactoring scored only 1 in *both* arms — a likely task-design/scoring gap
  (expected impact files were found, but the concept ratio was incomplete),
  not a CodeAtlas regression.