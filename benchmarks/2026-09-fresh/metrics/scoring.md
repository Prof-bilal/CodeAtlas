# Correctness rubric & optional overall score — 2026-09 Fresh

## Correctness rubric (0–4 per run)

Applied by an evaluator (human + automated signals: score, tests, git diff).
The agent never sees this rubric.

| Score | Description |
|---|---|
| 0 | Wrong or no solution; hallucinated files; task not addressed |
| 1 | Partial: touched relevant files but solution incomplete or behavior not fixed |
| 2 | Working: behavior fixed/implemented correctly and tests pass, but wasteful (extra files, over-broad changes) or fragile |
| 3 | Correct, focused, minimal change; tests pass; no `forbidden_change` touched |
| 4 | Correct + provably safe: minimal, tested, parity shown, no regressions, clear reasoning |

Rubric rules:
- A run that reaches the intended behavior but modifies a `forbidden_change`
  file caps at **2** (regression-safety penalty).
- A run that solves the task but cites/reads mostly irrelevant context does not
  lose correctness points — that is captured in **Context Efficiency**, not
  correctness, keeping the dimensions independent (Phase 10 separation).

## Reliability per cell

```
reliability(cell) = successful_runs / total_runs
```
where "successful" = correctness ≥ 2. Reported as a fraction; significance
between configs uses the paired bootstrap/t-test helpers.

## Optional overall score

```
overall = 0.40·normalized_correctness + 0.20·reliability
        + 0.20·context_efficiency + 0.20·test_pass_rate
```
with each term in [0,1] over a cell's runs, and `context_efficiency` from
Phase-12 precision only when measured (else the term is dropped and remaining
weights renormalized). The raw per-dimension values are **always** reported
alongside; the aggregate never hides them (Phase 11).

## Regression-safety checks (Phase 10)

Per successful run, automate where possible:
- `forbidden_changes` diff non-empty → regression risk.
- `regression_tests` still green after the change.
- Appended tests actually run (not skipped).

A run is "regression-free" only when all three hold.