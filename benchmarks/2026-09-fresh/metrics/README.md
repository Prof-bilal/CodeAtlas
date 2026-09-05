# Metrics & Scoring — 2026-09 Fresh

Defines what is measured and how scores are computed. The benchmark records
**all raw metrics first**; aggregate scores are derived and always shown beside
the raw values (Phase 11: never reduce a benchmark to one meaningless number).

## Raw metrics collected per (config, task, run)

| Dimension | Metric | Source |
|---|---|---|
| Task success | `score` (0/1/2) + `status` correct / partially_correct / incorrect / failed | `evaluateTask` (existing) |
| Correctness | rubric score 0–4 (below) | `metrics/scoring.md` |
| Reliability | success-rate across runs (per config × cell) | multi-run aggregation |
| Time | `durationMs` (wall) | runner |
| Tokens | `input` / `output` / `total` (provider-reported when available, else estimate) | runner `TokenMetrics` |
| Cost | `cost` USD, `source: actual/estimated/unknown` | runner + `@atlas/usage` |
| Tool calls | `toolCallCount` + per-call records (name, status, output) | runner |
| Context efficiency | files retrieved, relevant/irrelevant, iterations | retrieval metrics (Phase 12) |
| Regression rate | tasks where `regression_tests`/forbidden changes regressed | evaluator + git diff audit |
| Test pass rate | `hidden_tests` / appended tests passing | explicit test runner (ADR-015) |

## Scoring dimensions (Phase 11 — reported separately)

1. **Task Success** — pass/fail per task per run.
2. **Correctness** — 0–4 rubric penalizing wrong-file selection, unnecessary
   changes, and incomplete fixes, not just eventual success.
3. **Reliability** — fraction of runs succeeding per configuration cell; used
   with `pairedBootstrap`/`pairedTTest` for significance.
4. **Time** — wall-clock per successful run (median preferred).
5. **Input / Output / Total tokens** — reported raw.
6. **Estimated cost** — summed provider cost per run.
7. **Tool calls** — count + quality classification (misuse captured as failure).
8. **Context Efficiency** — see below.
9. **Regression rate** — fraction of successful runs that nonetheless broke a
   `forbidden_change` or existing test.
10. **Test pass rate** — fraction of appended/regression tests green.

An **optional overall score** may be computed and is always accompanied by the
raw per-dimension values.

## Context quality (Phase 12 — CodeAtlas-specific)

Measured **only** when the harness can attribute retrieved context reliably (the
CodeAtlas modes log every retrieval and file read). Recorded per task:

- files yielded by retrieval (`getRelevantContext` / MCP reads),
- the task's relevant-file gold (`expected_files` / evaluator annotation),
- repeated/redundant retrieval (dedupe hits, duplicate reads),
- retrieval iterations (number of search/read rounds).

Then, with the gold set:

```
Context Precision = |retrieved ∩ relevant| / |retrieved|
Context Recall     = |retrieved ∩ relevant| / |relevant|
```

These are computed only when attribution is available and never filled in from
memory. If the harness cannot attribute retrieval for a config, that config's
context-efficiency row is reported as `not-measured`, not 0.

## Config × dimension significance

Incremental-value comparisons (Phase 13) are:

- B vs A (CodeAtlas), C vs B (tools), D vs C (skills), D vs A (complete).
- Each comparison re-uses the **same task set** and the same model; significance
  uses paired bootstrap / paired t-test (`packages/benchmark` helpers) over runs.

## Anti-gaming guardrails (Phase 15)

- Agent prompt = task `prompt` only; never `expected_*`, `files_likely_involved`,
  `gold_impact_files`, `hidden_tests`, `success_criteria`.
- All four configs share identical tasks, prompts, model, timeout, evaluator.
- Raw results are preserved in `raw-results/`; aggregations are derived.