# Small-Model Intelligence Benchmark — Phase 0 tasks

Exemplar task definitions using the extended `TaskDefinition` fields added in
Phase 0 (`gold_impact_files`, `forbidden_changes`, `hidden_tests`).

Three arms are planned (see `docs/audit/small-model-intelligence/benchmark-plan.md`):

1. `baseline` — no CodeAtlas.
2. `codeatlas` — CodeAtlas context as shipped today.
3. `codeatlas-intel` — reserved for the intelligence layer (Phases 2–5).
   The mode value already exists in `BenchmarkMode`; runner behavior for it
   lands with the planner (Phase 2).

`hidden_tests` are executed only via the explicit runner
(`runHiddenTests(..., { allowExecution: true })`) — never implicitly.
