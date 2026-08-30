# Implementation Roadmap

Principle: evolution, not rewrite. New ports in `@atlas/core`, implementations
composed in `@atlas/sdk`, ADR per architectural change, `pnpm check` green per
phase, docs updated per `AGENTS.md` §4.12.

## Phase 0 — Baseline benchmark
- **Goal:** measure today's 3-arm capability before touching anything.
- **New components:** evaluator v2 (hidden tests, hallucination/wrong-file
  metrics); task definitions per category in `packages/benchmark` +
  `benchmark-repos` fixtures; model matrix config (Ollama + API).
- **Changed:** `packages/benchmark/src/evaluator.ts`, `metrics.ts`, task
  schema in `packages/core` (`TaskDefinition` extension).
- **Dependencies:** none. **Complexity:** Medium. **Risk:** Low.
- **Quality improvement:** none directly (enabler).
- **Benchmark required:** this IS the benchmark.
- **DoD:** baseline report for ≥3 models × 3 arms × 6 categories stored via
  benchmark store; evaluator detects hallucinated paths in a seeded test.

## Phase 1 — Context intelligence
- **Goal:** right files, right ranges, right order.
- **Files affected:** `packages/context/src/context-builder.service.ts`,
  `packages/sdk/src/context/sdk.ts` (`getRelevantContext` v2),
  `packages/sdk/src/context-integration/{assemble,render,slice}.ts`,
  `packages/search/src` (closure helpers over `ContextSnapshot`),
  `packages/graph` consumers in SDK.
- **New:** task profiles (extend `ContextTaskCategory`), dependency-closure
  expansion, tiered `ContextItem` (tier, ranges, reason annotations),
  sufficiency gate.
- **Dependencies:** Phase 0 (measurement). **Complexity:** Medium.
- **Risk:** ranking regressions → keep ADR-001 seam; golden tests for ranking.
- **Expected improvement:** wrong-file rate −50%; cross-file task success up.
- **DoD:** closure expansion unit tests (callers/callees/tests pinned);
  benchmark: context-quality ratio + wrong-file rate improve vs Phase 0.

## Phase 2 — Planning layer
- **Goal:** every code task gets a deterministic plan skeleton.
- **New:** `PlannerPort` + `TaskClassifierPort` in `packages/core`; impl in
  `@atlas/sdk` (`context-integration/planner.ts`); ADR.
- **Changed:** `ask.ts`, `context.ts` CLI (new flags `--plan`),
  `assemble.ts` (plan section in package), MCP `analyze_task`/`create_plan`.
- **Dependencies:** Phase 1. **Complexity:** Medium. **Risk:** wrong plans →
  mitigations in risks.md.
- **Expected improvement:** premature-answer and wrong-file reductions.
- **DoD:** plan generated for all benchmark tasks; plan files = gold impact
  set recall improves vs raw search; benchmark shows premature-answer drop.

## Phase 3 — MCP high-level tools
- **Goal:** weak-model-friendly tool surface.
- **Files affected:** `packages/mcp/src/{tools,handlers}.ts`, docs/MCP.md.
- **New tools:** `analyze_task`, `find_relevant_context`, `create_plan`,
  `inspect_symbol`, `verify_change` (last depends on Phase 4 — ship last or
  behind flag). Total ≤ 12; every result gets `next_steps`.
- **Dependencies:** Phases 1–2. **Complexity:** Medium. **Risk:** tool
  overload → hard cap, ablation benchmark on tool count.
- **DoD:** weak-model tool-call count per task ↓; task success ↑ on MCP arm.

## Phase 4 — Verification
- **Goal:** deterministic check of every answer.
- **New:** `VerifierPort` in `core`; `packages/verifier` (new feature pkg):
  path/symbol claim checks, typecheck/tests/lint runners (allow-listed,
  argv-array, opt-in, timeouts), verification report model; ADR.
- **Changed:** `tool-loop.ts` (verify stage), CLI `ask`/`context` output,
  MCP `verify_change`, benchmark evaluator uses VerifierPort.
- **Complexity:** Medium-High. **Risk:** command execution (strict security
  review; `docs/SECURITY.md`); false positives (baseline-run classification).
- **Expected improvement:** largest single gain — hallucinations become
  retryable failures.
- **DoD:** seeded-bug benchmark tasks show detection + successful retry;
  all checks unit-tested without network.

## Phase 5 — Iterative loop + structured state
- **Goal:** understand→plan→act→inspect→verify→correct cycle.
- **Files affected:** `packages/sdk/src/context-tools/tool-loop.ts`,
  `packages/core` (`ChatAgentPort` extension), new `AgentState` module in SDK.
- **Components:** state JSON, per-step rounds, ResultInspector, error-recovery
  menu, bounded loops with stopping conditions (risks.md table).
- **Complexity:** Medium. **Risk:** loop pathology → global budget + report.
- **DoD:** multi-step benchmark category success ↑; zero runaway loops in a
  100-run soak (bounded by budget); state compaction tested.

## Phase 6 — Critic / reviewer
- **Goal:** checklist-bounded review pass.
- **New:** `CriticPort` in `core`; impl in SDK via `ProviderPort`;
  deterministic checklist module; config `critic.model` (same/stronger/none).
- **Complexity:** Medium. **Risk:** critic hallucination (advisory only),
  latency (≤1 revision).
- **DoD:** ablation experiment shows ≥ measurable gain on feature/refactor
  categories, or the feature is cut (Rule 8).

## Phase 7 — Repository memory
- **Goal:** persistent repo knowledge.
- **Files affected:** `packages/summary` (digest kind),
  `packages/sdk/src/context-integration/instructions.ts`, indexer
  (`indexProject`) triggers refresh on update; stored in existing summary
  storage (no new DB).
- **Auto-generated:** architecture map, entry points, conventions (from
  manifest + graph + lint-ish signals); **maintained dynamically:**
  decisions/known problems (AGENTS.md remains human-owned; memory links it).
- **Complexity:** Medium. **Risk:** staleness → hash-keyed cache invalidation.
- **DoD:** digest present in slices; comprehension-category scores improve;
  cache hit on unchanged repos.

## Phase 8 — Benchmark & optimization
- **Goal:** prove and tune.
- **Activities:** full matrix (3 arms × models × categories), ablations,
  token-quality tuning, latency tuning for local models, report generation
  (`atlas benchmark report`), update FEATURE_STATUS/docs.
- **DoD:** success criteria in benchmark-plan.md met or gaps documented in
  this folder; docs/FEATURE_STATUS.md updated.

## Cross-phase requirements (every phase)

- Tests: unit + regression per `docs/TESTING.md`; no network/credentials.
- Architecture: ADRs for new ports (`docs/decisions/`); dependency matrix
  respected (`docs/DEPENDENCIES.md`).
- Preserve all existing CLI/MCP/SDK behavior (see risks + Phase-0 baseline
  suite as regression guard).
