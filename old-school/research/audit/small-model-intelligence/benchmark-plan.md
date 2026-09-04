# Benchmark Plan — Proving Small Models Get Better

## The core question

> How much does CodeAtlas improve a weak model, and how much does the NEW
> intelligence layer add on top of today's CodeAtlas?

Three arms, same tasks, same models:

1. **Raw** — model + repo, no CodeAtlas.
2. **CodeAtlas today** — current context delivery (MCP tools / slices).
3. **CodeAtlas + intelligence layer** — planning, hierarchy, verification,
   high-level tools, state.

## Existing foundation (reuse, don't rebuild)

- `packages/benchmark` (runner, store, reporter, `BenchmarkPort`),
  `atlas benchmark init/run/status/report`.
- `benchmark-repos/`: 5 fixture repos (01-small-app … 05-large-project).
- `benchmarks/run-benchmark.ts`, `apps/server` HTTP runner.
- **Must replace/extend**: `packages/benchmark/src/evaluator.ts` (today it
  scores substring overlap of expected file basenames/concepts — it cannot
  detect hallucinations, wrong edits, or task completion).

## Datasets / task categories

| Category | Tasks (per fixture repo) | Scoring |
|---|---|---|
| Repository understanding | "where is X implemented?", architecture Qs, dependency Qs | exact-file recall, hallucinated-file count |
| Bug fixing | simple bug, cross-file bug, dependency bug, config bug | hidden unit tests pass (write-before) |
| Feature implementation | small feature, multi-file, architecture-dependent | tests written against spec |
| Refactoring | safe rename, cross-module move | tests still pass + API preserved |
| Debugging | runtime error, build error, integration error | error reproduced→fixed→tests pass |
| Agent tasks | multi-step, tool-required, iterative | step completion + final correctness |

Each task is defined as data (extend `TaskDefinition` in `@atlas/core`):
`{ id, category, prompt, expected_files[], expected_concepts[], hidden_tests,
  forbidden_changes[], gold_patch? }`.

## Metrics

| Metric | Source |
|---|---|
| correctness (0–2 today → binary+partial) | evaluator v2 |
| task completion (tests pass) | hidden test run |
| hallucination rate (files/APIs cited that don't exist) | index lookup + FS |
| wrong-file rate (touched files ∉ gold impact set) | gold patch diff |
| unnecessary changes | diff vs gold patch |
| iterations / tool calls / tool failures | loop telemetry |
| tokens (in/out), latency, cost | `@atlas/usage` (tri-state) |
| context quality ratio (useful/total tokens) | plan/answer citations vs slice |

Evaluator v2 keeps existing checks, adds: path-existence via `citedPaths`
(existing), symbol existence via index, hidden-test execution (opt-in,
argv-array, sandboxed), forbidden-change detection.

## Models (model-agnostic matrix)

| Class | Examples | Role |
|---|---|---|
| Small local | Ollama 3B/7B/8B (e.g. llama3.1-8b, qwen2.5-coder-7b) | primary target |
| Medium | 14B local / cheap API tier | primary target |
| Strong | frontier API model | ceiling reference |

Provider adapters already exist (`packages/providers/src/adapters/ollama.ts`).
Tests/benchmarks require no network by default; model runs are explicit,
user-invoked benchmark runs (consistent with `docs/TESTING.md`).

## Experiments

1. Baseline matrix (Phase 0): 3 arms × all models × all categories; persist
   via benchmark store for trend tracking.
2. Ablations: intelligence layer with each component toggled off (planner,
   hierarchy, verification, critic) — attribute gains per feature (Rule 11).
3. Critic-model study: same-model vs stronger-critic vs no-critic.
4. Token-quality study: quality vs token spend curves per profile.

## Success criteria

- Small model + new layer ≥ 2× correct-task rate vs small model + today, on
  bug-fix and feature categories.
- Hallucinated-file rate < 5% (from measurable baseline).
- Wrong-file rate −50%.
- No regression for strong models (ceiling arm stays within noise).
- Every proposed feature (Rule 11) ships with the experiment that validates it
  or is cut.
