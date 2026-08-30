# Task-Level Execution Plan — Small-Model Intelligence Upgrade

> Operational companion to `implementation-roadmap.md`. Every task is small,
> testable, and ordered. Tasks reference real files. `ADR` tasks block their
> implementation tasks. All work must keep `pnpm check` green
> (typecheck + lint + format + tests) per `AGENTS.md` §4.10.

## Legend

- ID format: `P<phase>.<n>` — phases may overlap only where no dependency.
- Every task lists: Files, DoD (definition of done), Tests.
- Milestones M0–M4 gate progress (see end).

## ADRs required (write early, review before code)

| ADR | Decision | Blocks |
|---|---|---|
| ADR-013 | New core ports: `TaskClassifierPort`, `PlannerPort`, `VerifierPort`, `CriticPort` (type-only, in `packages/core`) | P2, P4, P6 |
| ADR-014 | Package placement: implementations in `@atlas/sdk` for classifier/planner/state; new `@atlas/verifier` feature package for command execution | P2, P4 |
| ADR-015 | Verification command policy: per-project allow-list, opt-in, argv-array spawn, timeouts, user-visible | P4 |
| ADR-016 | `ContextItem` evolution: additive fields (`tier`, `ranges`, `reason`, `annotations`) — no breaking change | P1 |
| ADR-017 | MCP high-level tool surface (5 tools, ≤12 total, `next_steps` convention) | P3 |

## Phase 0 — Baseline benchmark

> **Status: implemented (P0.1–P0.5), 2026-08-30.** Evaluator v2 + hidden-test
> runner + exemplar tasks shipped; `core` + `benchmark` typecheck clean; 49/49
> benchmark tests and 5/5 core tests pass. **P0.6 (live baseline matrix run)
> is pending** — it requires explicit model runs (Ollama / API, network) and
> must be user-invoked per `docs/TESTING.md`.

- **P0.1** ✅ Extend `TaskDefinition` in `packages/core` with `hidden_tests`,
  `forbidden_changes`, `gold_impact_files`, `category`. Files: `packages/core/src`.
  DoD: type compiles; old task data still validates. Tests: unit on schema.
- **P0.2** Evaluator v2 in `packages/benchmark/src/evaluator.ts`: keep
  `fileHits`/`conceptHits`/`citedPaths`; add path-existence hallucination
  metric, wrong-file metric vs `gold_impact_files`, forbidden-change flag.
  DoD: seeded-answer fixture scores correctly. Tests: pure functions, no IO.
- **P0.3** Hidden-test runner (opt-in, argv-array spawn, timeout): new
  `packages/benchmark/src/test-runner.ts`. DoD: runs vitest in a fixture repo
  and reports pass/fail counts. Tests: local fixture only, no network.
- **P0.4** Author task definitions (6 categories × 5 fixture repos, ≥2 tasks
  each) under `benchmark-repos/`. DoD: `atlas benchmark status` lists them.
- **P0.5** Model matrix config + 3-arm runner flags (raw / today / new-off).
  Files: `packages/benchmark/src/runner/`, `benchmarks/run-benchmark.ts`.
  DoD: one end-to-end run against a stub provider records results in the
  benchmark store.
- **P0.6** Run baseline matrix (Ollama 7B/8B + 1 API model), store report.
  DoD: baseline numbers in `benchmarks/results/` referenced by all later DoD.

## Phase 1 — Context intelligence

> **Status: partial, 2026-08-30.** P1.1 shipped as ADR-014 (`tier`, `reason`,
> plus `ranges` and `annotations` folded in); P1.2 `entities.ts`, P1.4
> `closure.ts`, and P1.6 `sufficiency.ts` are implemented with pure unit +
> adversarial tests. P1.5 (tier-first budget consumption in `applyBudget`,
> symbol line-ranges + compact tier/range render annotations, hierarchy
> helpers) is implemented and wired through `assemble.ts`/`render.ts`; new
> `hierarchy.ts` covers tier ordering, symbol outlines, and line-range slicing.
> P1.3 is partially covered by category-boost re-ranking in
> `context-builder.service.ts` (beta audit Fix 4) — ordered retrieval *slots*
> per category remain an extension. **Remaining: P1.7** (benchmark rerun —
> blocked on the P0.6 live baseline).

- **P1.1** ADR-016 (additive `ContextItem` fields).
- **P1.2** Entity extraction util (deterministic): file paths, symbol-name
  candidates from task text. Files: new `packages/sdk/src/context-integration/entities.ts`.
  Tests: pure unit, adversarial inputs.
- **P1.3** Task profiles: extend `ContextTaskCategory` retrieval policy —
  ordered retrieval slots per category (see `context-strategy.md` §1).
  Files: `packages/context/src/context-builder.service.ts` (keep ADR-001 seam),
  `packages/core` (category type). Tests: ranking golden tests per category.
- **P1.4** Dependency-closure expansion: helpers over `ContextSnapshot` +
  graph edges — callers/callees 1 hop (option 2 with budget), tests-by-file
  (`*.test.ts` convention + reference edges), config touchpoints.
  Files: new `packages/sdk/src/context/closure.ts` (reads via SDK only).
  Tests: unit on fixture snapshot; every expanded item carries `reason`.
- **P1.5** Hierarchy + tiers in `getRelevantContext` v2 and
  `context-integration/{assemble,render,slice}.ts`: symbol outlines, line
  ranges for Critical tier, tier-first budget consumption.
  Tests: budget consumption order; render snapshot tests.
- **P1.6** Sufficiency gate (`packages/sdk/src/context-integration/sufficiency.ts`):
  the 4 deterministic predicates from `context-strategy.md` §7.
  Tests: each predicate true/false cases; gate blocks slice when insufficient.
- **P1.7** Benchmark: rerun context-arm; compare wrong-file rate and token
  quality ratio vs P0.6. Gate: wrong-file rate −50% or investigate.

## Phase 2 — Planning layer

- **P2.1** ADR-013 + ADR-014.
- **P2.2** `TaskClassifierPort` impl (deterministic keyword/graph scoring,
  confidence; model refinement hook stubbed). Files:
  `packages/core/src` (port), `packages/sdk/src/context-integration/classifier.ts`.
  Tests: fixture tasks classify ≥95% agreement with labels.
- **P2.3** `PlannerPort` impl: skeleton from classifier + closure + search;
  steps, impact set, unknowns, verification strategy. Files:
  `packages/sdk/src/context-integration/planner.ts`.
  Tests: plan files ⊇ gold impact set on benchmark tasks; unknowns detected.
- **P2.4** CLI: `atlas ask --plan`, plan section in `atlas context` output.
  Files: `apps/cli/src/commands/ask.ts`, `context.ts`. Tests: CLI unit tests
  (existing pattern in `apps/cli/tests/`).
- **P2.5** Plan-authority guard: model annotations additive-only; conflicts
  escalate to re-retrieval. Tests: annotation-conflict unit test.
- **P2.6** Benchmark arm with planner. Gate: premature-answer and wrong-file
  metrics improve vs P1.7.

## Phase 3 — MCP high-level tools

- **P3.1** ADR-017.
- **P3.2** `analyze_task` + `create_plan` tools (wrap P2.2/P2.3).
  Files: `packages/mcp/src/{tools,handlers}.ts`, `docs/MCP.md`.
  Tests: handler unit tests (existing mcp test pattern); schema round-trip.
- **P3.3** `find_relevant_context` tool (wraps slice v2 + gate) with
  `next_steps` on all results. Tests: next_steps present on each handler.
- **P3.4** `inspect_symbol` tool (symbol + callers/callees + tests payload).
- **P3.5** Tool-count + ordering audit: total ≤12, high-level first in
  `tools/list`. Tests: registry count assertion.
- **P3.6** Benchmark via MCP arm with a small model. Gate: tool calls/task ↓
  and task success ↑ vs today-arm.

## Phase 4 — Verification

- **P4.1** ADR-015 (command policy) — security review required before code.
- **P4.2** `VerifierPort` in `packages/core`; claim checks first (path
  existence, symbol existence via SDK, plan-coverage, output contract).
  Files: `packages/core/src`, new `packages/verifier/src/claims.ts`.
  Tests: seeded hallucinated answers are detected 100%.
- **P4.3** Command runners (typecheck/tests/lint) in `packages/verifier`:
  per-project allow-list config (`.codeatlas/verify.json`, validated),
  argv-array spawn, timeout, output captured. Files: `packages/verifier/src/runners.ts`.
  Tests: no shell strings (adversarial test like toolkit installer pattern);
  timeout + denial cases; no network.
- **P4.4** Baseline-diff classification (pre-existing vs introduced failure):
  run checks on untouched baseline once, cache result. Tests: flaky-failure
  classification unit test.
- **P4.5** Verification report model + integration into `tool-loop.ts`
  (post-answer verify stage) and CLI/MCP outputs. Files:
  `packages/sdk/src/context-tools/tool-loop.ts`, `apps/cli/src/commands/ask.ts`,
  `packages/mcp` (`verify_change` tool, depends on ADR-015 decision).
- **P4.6** Benchmark: seeded-bug tasks show detect + retry success. Gate:
  hallucination rate <5% on tasks with indexed targets.

## Phase 5 — Iterative loop + structured state

- **P5.1** `AgentState` module in `packages/sdk/src/context-tools/state.ts`:
  the JSON model from `proposed-architecture.md`; bounded, compacted
  (facts merged, old tool payloads dropped). Tests: compaction bounds.
- **P5.2** Per-step rounds in `tool-loop.ts`: plan step per round, objective
  restatement, state summary in prompt. Keep `MAX_TOOL_ROUNDS`. Tests:
  multi-round fixture with stub provider.
- **P5.3** ResultInspector: normalize tool results, flag empty/failed,
  update state, generate deterministic recovery menu on failures.
  Tests: each failure type yields the expected menu.
- **P5.4** Global budget + stop-reason reporting for every loop (expansion,
  rounds, verify-fix, critic, global). Tests: each bound aborts with reason.
- **P5.5** Benchmark multi-step category. Gate: success ↑, zero runaway in a
  100-run soak (bounded by budget).

## Phase 6 — Critic / reviewer

- **P6.1** `CriticPort` in `packages/core`; SDK impl via `ProviderPort`;
  deterministic checklist module (cited paths exist, plan files addressed,
  contract satisfied, verification claims match actual runs).
  Files: `packages/core/src`, `packages/sdk/src/context-integration/critic.ts`.
  Tests: checklist is pure/deterministic; critic output schema validated.
- **P6.2** Config: `critic.model` (same | stronger | none); ≤1 revision.
  Files: `packages/sdk/src/container.ts`, docs/configuration.md.
- **P6.3** Ablation benchmark (same-model / stronger-critic / none) on
  feature + refactor categories. Gate: keep only if ≥ measurable gain
  (threshold set in `open-questions.md` Q14), else cut feature.

## Phase 7 — Repository memory

- **P7.1** Digest generation (architecture map, entry points, conventions)
  from manifest + graph + scanner signals, as a new summary kind.
  Files: `packages/summary/src`, `packages/sdk/src/indexing` (refresh on
  `updateContext`), `packages/sdk/src/context-integration/instructions.ts`.
  Tests: digest stable on unchanged repo (hash cache hit); updates on change.
- **P7.2** Digest in slices/packages (Supporting tier). Tests: render tests.
- **P7.3** Benchmark comprehension category. Gate: scores improve vs P0.6.

## Phase 8 — Benchmark & optimization

- **P8.1** Full matrix: 3 arms × all models × all categories.
- **P8.2** Ablations: toggle planner / hierarchy / verification / critic.
- **P8.3** Token-quality + latency tuning for local models (per-provider
  default budgets from `open-questions.md` Q8).
- **P8.4** `atlas benchmark report` additions; update `docs/FEATURE_STATUS.md`,
  `docs/CURRENT_STATE.md`, `docs/MCP.md`, `docs/AI_WORKFLOW.md`.
- **Gate:** success criteria in `benchmark-plan.md` met or gaps documented
  here; cut any feature failing its ablation.

## Milestones

| Milestone | Contains | Exit criterion |
|---|---|---|
| M0 | P0.1–P0.6 | Baseline report stored; evaluator detects seeded hallucination |
| M1 | P1.* | Wrong-file rate −50% vs baseline; `pnpm check` green |
| M2 | P2.*, P3.* | Plan recall on gold impact sets; MCP arm improves small-model success |
| M3 | P4.*, P5.* | Hallucination rate <5% (indexed targets); zero runaway loops in soak |
| M4 | P6.*, P7.*, P8.* | Feature-level ablation verdicts; docs updated; final report |

## Regression / test checklist (every phase)

- [ ] `pnpm check` green (typecheck + lint + format + all tests).
- [ ] Existing CLI behavior unchanged: `atlas search/ask/context/explain/mcp`
      output schemas backward-compatible (snapshot tests).
- [ ] MCP `tools/list` schema round-trip tests pass; error results keep
      text-only shape (no `structuredContent`).
- [ ] No DB schema change without additive migration + repository tests.
- [ ] No `shell: true` anywhere; adversarial spawn tests for new runners.
- [ ] Deny-list honored for all new file reads (`packages/mcp/src/deny.ts` +
      `context-integration/deny.ts`).
- [ ] ADR-001 seam intact: `@atlas/context` ranking remains AI-optional.
- [ ] New code consumes context only via `createContextSDK` (ESLint matrix
      passes — `docs/DEPENDENCIES.md`).
- [ ] Provider logic stays in adapters; no provider switches elsewhere.
- [ ] No network / no provider credentials in unit tests (`docs/TESTING.md`).
- [ ] Docs updated for any status change (`docs/FEATURE_STATUS.md`).

## Suggested sequence & staffing

- Serial spine: M0 → M1 → M2 → M3 → M4 (each gate depends on the prior).
- Parallelizable after M0: P3.1–P3.4 can start once P2.2/P2.3 exist;
  P7 (repo memory) is independent and can run any time after M1.
- ADRs (013–017) should be drafted during M0/M1 so reviews don't block M2+.
