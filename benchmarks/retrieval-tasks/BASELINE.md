# Retrieval baseline (Phase 0 Task 4 — frozen)

> Do not edit numbers in place after capture. New measurements go in dated
> rows below. Until n≥3 + paired significance (Phase 6), the pilot stays the
> only task-score baseline and must be labeled as such.

## Task-score pilot (frozen, n=1 — do not overclaim)

Source: `benchmarks/2026-09-fresh/report.md:73-78`.

| Arm | Score | Tokens/task | Tool calls/task |
|---|---|---|---|
| A (baseline) | 1.56 | 496,795 | 18.6 |
| B (codeatlas) | 1.44 (−0.13) | 688,405 (+38%) | 19.8 (+1.2) |
| C | 1.13 | TO 19% | — |
| D | 1.56 | — | — |

Evaluator: score 2 iff fileRatio≥0.5 AND concept≥0.5
(`packages/benchmark/src/evaluator.ts:213-287`).

## Retrieval metrics (held-out set — to capture)

| Metric | Method | Dataset | Baseline | Meaningful delta |
|---|---|---|---|---|
| P@1/5/10, R@k, MRR | `benchmark/src/retrieval-metrics.ts` | `benchmarks/retrieval-tasks/tasks.json` (30) | _capture Phase 0_ | +15% P@5 (adopt after baseline) |
| Chain coverage | % gold hops in traversal paths | trace subset (9) | _capture_ | delta up |
| Tokens/sufficient-task | estimated (label!) + harness where avail. | B-config rerun | 688k equiv | down at non-inferior score |
| Sufficiency⇒solved | sufficient⇒solved rate | same | _capture_ | non-decreasing (hard gate) |
| Stale-served rate | freshness matrix | `freshness-matrix.test.ts` | 0 silent-stale (hold) | 0 |
| Latency p50/p95 | probeMs/searchMs/assemblyMs per primitive | scale grid | _capture_ | publish then gate |

## Scale grid (to capture — see `benchmarks/scale-grid/`)

| Corpus | Index time | Peak RSS | DB bytes | Probe p50/p95 | `context_for` bytes |
|---|---|---|---|---|---|
| 1k files | _capture_ | _capture_ | _capture_ | _capture_ | _capture_ |
| 10k files | _capture_ | _capture_ | _capture_ | _capture_ | _capture_ |
| 50k files | _capture_ | _capture_ | _capture_ | _capture_ | _capture_ |

## Log

- 2026-09-06: set created (30 tasks), smoke `evaluate.mjs` green; metric
  baselines open pending a built index + harness run (Phase 6).
