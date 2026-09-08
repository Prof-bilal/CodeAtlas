# Fresh Comprehensive Benchmark — Report (2026-09)

> **Status: pending · 10-cell matrix not yet executed.**
> This report will aggregate the 10-cell benchmark (5 curated tasks × Configs
> A/B) once a real run completes. The previous 64-cell pilot (16 tasks × 4
> configs) is archived under `old-school/` and deliberately not reused — its
> raw results were superseded by the lean single-run matrix. Raw results are
> preserved under `raw-results/` as cells complete.

---

## Executive Summary

_TBD — filled in after the first full 10-cell run._

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
cell matrix.