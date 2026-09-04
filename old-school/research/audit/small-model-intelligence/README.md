# Small-Model Intelligence Audit — CodeAtlas

> **PLAN ONLY.** This folder is a planning/audit deliverable. Nothing here
> changes any implementation. All file paths referenced were verified against
> the code on 2026-08-30 (branch `UI`, commit `039a3e`).

## Mission

Transform CodeAtlas from a context/token-optimization system ("use less
tokens") into an **agent intelligence layer** that makes small, cheap, or
locally hosted models (3B–14B, Ollama, low-cost APIs) produce high-quality,
reliable outputs. The optimization priority becomes:

1. Output quality → 2. Correctness → 3. Context quality → 4. Reasoning
reliability → 5. Task completion → 6. Tool usage → 7. Repository
understanding → 8. Verification → 9. Error recovery → 10. Token/cost
efficiency (last).

Using 2–5× more tokens for significantly better results is acceptable.

## Current state (audited)

Clean-architecture pnpm/TypeScript monorepo (19 packages + 3 apps).

| Capability | Status | Where |
|---|---|---|
| Scanning, hashing, incremental indexing | [IMPLEMENTED] | `packages/scanner`, `packages/hashing`, `packages/sdk/src/indexing` |
| TS parsing → symbol IR | [PARTIAL] (TS only; renamed imports & `export default <expr>` don't resolve) | `packages/parser` |
| Dependency graph (imports/calls/extends/…) | [IMPLEMENTED] | `packages/graph/src/graph.service.ts` |
| SQLite persistence (node:sqlite) | [IMPLEMENTED] | `packages/storage` |
| Lexical fuzzy ranked search (vector seam, no embeddings) | [IMPLEMENTED / seam only] | `packages/search/src/scoring.ts` |
| AI summaries (file/folder/module/project) | [IMPLEMENTED, opt-in] | `packages/summary/src/summary.service.ts` |
| Deterministic context rank/assemble | [IMPLEMENTED] | `packages/context/src/context-builder.service.ts` |
| Budgeted context package/slice assembly | [IMPLEMENTED] | `packages/sdk/src/context-integration/assemble.ts`, `slice.ts`, `budget.ts` |
| Bounded tool loop agent | [IMPLEMENTED] | `packages/sdk/src/context-tools/tool-loop.ts` |
| MCP server (7 low-level read tools) | [IMPLEMENTED] | `packages/mcp/src/tools.ts`, `handlers.ts` |
| Provider adapters (anthropic/gemini/ollama/openai-compatible) | [IMPLEMENTED] | `packages/providers/src/adapters/` |
| Agent CLI connection + session manager | [IMPLEMENTED] | `packages/agents`, `packages/sdk/src/sessions` |
| Usage/credits (tri-state tokens, budgets) | [IMPLEMENTED] | `packages/usage` |
| Benchmark framework (5 fixture repos, naive evaluator) | [PARTIAL] | `packages/benchmark/src/evaluator.ts`, `benchmark-repos/` |
| **Planning / task decomposition** | **MISSING** | — |
| **Verification layer** (tests/typecheck/graph checks) | **MISSING** | — |
| **Critic / reviewer pass** | **MISSING** | — |
| **Structured intermediate agent state** | **MISSING** | — |
| **Repository memory** | **PARTIAL** (summaries + instruction files) | `packages/summary`, `context-integration/instructions.ts` |
| **Confidence / sufficiency detection** | **MISSING** | — |
| **Hierarchical context** | **MISSING** (flat whole-file items) | — |
| **Task-aware retrieval** | **PARTIAL** (3 regex boost lists) | `packages/context/src/context-builder.service.ts` |

## Target state

```text
User task → Task classifier → Retrieval planner → Hierarchical context
   → Sufficiency gate → Model (plan→act) → Tool executor → Result inspector
   → Validator (tests/typecheck/graph) → Correct | Retry (bounded)
   → Final answer + verification report
```

Everything CodeAtlas can compute statically (graph, callers, deps, tests for a
file, config) it computes itself and hands to the model as **structured,
prioritized, hierarchical facts** — never asks the model to "figure out the
codebase".

## Major findings

1. **Biggest gap: no verification layer.** Model output is never checked
   against reality. A small model hallucinating an API gets no correction signal.
2. **No planning.** Nothing decomposes "fix authentication" into steps, files,
   risks; the raw string is the plan.
3. **Context is flat and file-granular.** `ContextItem` = whole file + score
   (`packages/context/src/context-builder.service.ts`). No ranges, no
   caller/callee expansion, no critical/important/supporting tiers.
4. **MCP tools are low-level.** 7 read tools; a 7B model must orchestrate them
   itself — the exact skill small models lack.
5. **Tool loop is round-bound** (`MAX_TOOL_ROUNDS`, `tool-loop.ts`) with static
   guidance and no inspect/verify/correct cycle.
6. **Task-aware retrieval is 3 regexes** (`TASK_BOOST_PATTERNS`).
7. **Benchmark evaluator measures substring overlap** — cannot detect
   hallucinated APIs or wrong-file edits (`packages/benchmark/src/evaluator.ts`).
8. **Strengths to build on (do not rebuild):** incremental hashing, graph with
   shortest path/cycles, deny-list + `expectedHash` freshness contracts,
   budgeted slice engine, usage tracking, provider quarantine.

## Biggest bottlenecks (P0)

- P0-1 No verification (deterministic check of model output).
- P0-2 No planning layer.
- P0-3 Flat file-granular context without dependency-closure expansion.
- P0-4 MCP exposes low-level tools only.

## Expected impact (targets for a 7B-class model, measured on the Phase-0 benchmark)

- Correct-task rate ≥2× baseline on bug-fix and feature tasks.
- Hallucinated-file rate ≈0 on tasks whose target files exist in the index.
- Wrong-file rate −50% (graph closure instead of lexical top-k).
- Tool-call discipline ≤5 calls/task retained.

## Roadmap

Phase 0 baseline benchmark → 1 context intelligence (hierarchy + expansion +
task profiles) → 2 planning → 3 MCP high-level tools → 4 verification →
5 iterative loop with structured state → 6 critic pass → 7 repository memory →
8 benchmark & tuning. Details + per-phase definition of done:
[implementation-roadmap.md](./implementation-roadmap.md).

## Important unanswered questions

See [open-questions.md](./open-questions.md). Critical ones: who executes
verification commands (sandboxing/security), single small model vs
planner+critic split, and MCP tool latency on large repos.

---

## The 10 Most Important Changes

| # | Change | Why it matters | Expected impact | Complexity | Priority |
|---|---|---|---|---|---|
| 1 | **Deterministic verification layer** (`VerifierPort`: run tests/typecheck, check cited files exist, graph consistency) | The only reliable correction signal for a weak model; converts hallucination into detectable failure + retry | Very high | Medium–High | P0 |
| 2 | **Planning layer** (`PlannerPort`): task → classified → planned (files, deps, unknowns, verification strategy) — deterministic skeleton, model fills reasoning | Small models cannot plan; a handed plan prevents wrong-file edits and premature answers | Very high | Medium | P0 |
| 3 | **Graph-driven context expansion** (caller/callee/import closure, 1–2 hops, tests+config pinned) replaces lexical top-k | Lexical top-k misses files a change actually touches; the graph already knows | High | Medium | P0 |
| 4 | **High-level MCP intelligence tools** (`analyze_task`, `find_relevant_context`, `create_plan`, `verify_change`, `inspect_symbol`); keep low-level tools with tightened descriptions | Each high-level tool removes an orchestration decision the weak model would get wrong | High | Medium | P1 |
| 5 | **Hierarchical context rendering** (repo→module→file→symbol; ranges not whole files; critical/important/supporting/optional tiers) | Flat whole-file dumps overflow and bury the signal a weak model can't dig out | High | Medium | P1 |
| 6 | **Structured intermediate agent state** (JSON: task, plan, known_facts, unknowns, files_inspected, verification) re-injected per round | Weak models lose the objective across rounds; external state replaces fragile in-context memory | High on multi-step tasks | Medium | P1 |
| 7 | **Context sufficiency gate** (deterministic: no hits above threshold, plan references unknown files → retrieve first) | Small models answer from nothing; the gate forces retrieval before answering | Medium–High | Low–Medium | P1 |
| 8 | **Realistic benchmark evaluator** (test-pass scoring, exact-file expectations, hallucination metrics, per-model matrix incl. Ollama) | Without a real evaluator no improvement is provable | High (enabler) | Medium | P0 |
| 9 | **Critic/reviewer pass** (same-model self-check against a deterministic checklist; optional second model; bounded to 1 revision) | Catches plausible-but-wrong drafts; checklist keeps a weak critic honest | Medium–High | Medium | P2 |
| 10 | **Repository memory** (auto-generated architecture/conventions/entry-points digest refreshed on index update, cached like summaries) | Instant orientation instead of re-deriving per task | Medium | Medium | P2 |

Each change has a benchmark in [benchmark-plan.md](./benchmark-plan.md) and a
phase in [implementation-roadmap.md](./implementation-roadmap.md).

## Document map

| Document | Content |
|---|---|
| [architecture-audit.md](./architecture-audit.md) | Repo architecture, components, data flow, exact paths |
| [current-pipeline.md](./current-pipeline.md) | Real request lifecycle today, with code refs |
| [small-model-failure-analysis.md](./small-model-failure-analysis.md) | Where 3B–14B models fail and why |
| [bottlenecks.md](./bottlenecks.md) | Ranked P0–P3 bottleneck table |
| [proposed-architecture.md](./proposed-architecture.md) | Target architecture, components, loops, stopping conditions |
| [intelligence-layer.md](./intelligence-layer.md) | Deterministic vs model-based intelligence |
| [mcp-strategy.md](./mcp-strategy.md) | MCP tool surface redesign |
| [context-strategy.md](./context-strategy.md) | Retrieval, hierarchy, expansion, sufficiency |
| [planning-and-verification.md](./planning-and-verification.md) | Plan/execute/inspect/verify/correct loop |
| [benchmark-plan.md](./benchmark-plan.md) | How we prove small models improve |
| [risks.md](./risks.md) | Risks + mitigations |
| [implementation-roadmap.md](./implementation-roadmap.md) | Phased plan with DoD per phase |
| [execution-plan.md](./execution-plan.md) | Task-level WBS, ADRs, milestones, regression checklist |
| [open-questions.md](./open-questions.md) | Decisions required before implementation |
