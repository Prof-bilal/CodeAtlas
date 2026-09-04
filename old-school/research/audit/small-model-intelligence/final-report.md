# Final Audit Report — Small-Model Intelligence Upgrade

> Companion summary of the full audit in this folder. **Plan only — nothing
> implemented.** All findings verified against code on 2026-08-30 (branch
> `UI`, commit `039a3e`).

## 1. Repository size/structure inspected

Full monorepo audit: 19 `@atlas/*` packages, 3 apps (`apps/cli`,
`apps/server`, `apps/extension`), 5 benchmark fixture repos
(`benchmark-repos/01-small-app` … `05-large-project`), 50+ docs in `docs/`.
Read canonical docs (CURRENT_STATE, ARCHITECTURE, CONTEXT, CONTEXT_SDK, MCP)
plus the actual source of every intelligence-critical path.

## 2. Major architecture discovered

Clean-architecture pnpm/TypeScript monorepo, dependency direction
`cli → sdk → feature packages → core → shared` (ESLint-enforced). Indexing
pipeline: scanner → hashing → parser (ts-morph, TS only) → graph → SQLite
storage (`node:sqlite`) → search → SDK. All consumers (CLI, MCP, VS Code)
read only through `createContextSDK`. Ports live in `packages/core`;
composition in `packages/sdk/src/container.ts`.

## 3. Current intelligence pipeline

```text
Task string → lexical fuzzy search (@atlas/search)
  → flat whole-file ContextItems (3 regex category boosts,
    packages/context/src/context-builder.service.ts)
  → budgeted package/slice (packages/sdk/src/context-integration/assemble.ts, slice.ts)
  → model with bounded tool loop (packages/sdk/src/context-tools/tool-loop.ts:
    MAX_TOOL_ROUNDS, SearchMemory dedup, static CONTEXT_GUIDANCE)
  → NO validation
Delivered via: CLI (atlas ask/context), MCP (7 low-level read tools with
freshness/deny-list), agent sessions (@atlas/agents).
```

## 4. Top 10 weaknesses

1. No runtime verification of model output (tests/typecheck/paths/graph).
2. No planning or task decomposition — the raw task string is the plan.
3. Flat, whole-file context; no symbol ranges or hierarchy tiers.
4. No dependency-closure retrieval (`@atlas/graph` unused for retrieval).
5. Benchmark evaluator scores substring overlap; can't detect hallucination
   (`packages/benchmark/src/evaluator.ts`).
6. MCP exposes only low-level tools; orchestration left to the model.
7. Task-aware retrieval is 3 regex boost lists.
8. Tool loop has no structured state; objective drift across rounds.
9. No context sufficiency gate — small models answer from nothing.
10. Generic prompt construction; no per-task templates or output contracts.

## 5. Top 10 proposed improvements

1. Deterministic `VerifierPort` (tests, typecheck, path/symbol checks, graph
   consistency) — new package behind a core port.
2. `PlannerPort`: deterministic plan skeleton (files, dependency closure,
   tests, unknowns, verification strategy).
3. Graph-driven context expansion (callers/callees 1–2 hops, tests + config
   pinned, annotated with reasons).
4. 5 high-level MCP tools (`analyze_task`, `find_relevant_context`,
   `create_plan`, `inspect_symbol`, `verify_change`) with `next_steps`
   hints; total tools capped ≤ 12.
5. Hierarchical context (repo→module→file→symbol; ranges; tiers
   Critical/Important/Supporting/Optional).
6. Structured intermediate AgentState (task, plan, facts, unknowns,
   verification) re-injected each round.
7. Deterministic context sufficiency gate before answering.
8. Benchmark evaluator v2: hidden tests, hallucination/wrong-file metrics,
   3-arm × model-matrix experiments.
9. Checklist-bounded critic/reviewer pass (≤1 revision, advisory only).
10. Auto-generated repository memory (architecture, entry points,
    conventions), cached like summaries.

## 6. Biggest small-model failure modes

Wrong-file edits (lexical top-k), hallucinated APIs/paths (zero runtime
checks), cross-file reasoning failure (no relationship annotations in
context), premature answers (no plan), objective drift (no external state),
tool thrash or under-use (low-level tools), context overload (whole-file
dumps), answering with insufficient context (no gate). Full catalog:
`small-model-failure-analysis.md`.

## 7. Proposed future architecture

See `proposed-architecture.md`:

```text
Request Understanding [D] → Repository Intelligence (Repo Memory +
Retrieval Profile + Graph) → Hierarchical Context Builder → Sufficiency
Gate [D] → Task Planner [D skeleton + M annotations] → Small Model
(one plan step per round) → Tool Executor → Result Inspector [D] →
Validator [D] → pass → Final Answer + Verification Report
                         → fail → Critic [M, checklist] → revise → re-verify
```

`[D]` = deterministic, `[M]` = model. All loops bounded (expansion N≤2,
verification iterations ≤2, critic revisions ≤1, global token/wall-clock
budget); every abort emits a report.

## 8. MCP strategy

Keep all 7 existing low-level tools; add the 5 high-level tools above.
Every description states when NOT to call; every result carries
`next_steps`; sizes bounded; schemas stable. No generic
`read_file`/`write_file`/`run_command` tools (security). Full analysis:
`mcp-strategy.md`.

## 9. Context strategy

Quality-first: entity decomposition, per-task retrieval profiles, dependency
closure with annotations, tiered hierarchy consumed top-tier-first under
generous budgets, raw code only for Critical files (version-checked),
summaries for breadth, sufficiency gate + bounded expansion loop, token
quality ratio tracked per profile. Details: `context-strategy.md`.

## 10. Planning/verification strategy

Task Analysis [D-first] → Planning [D skeleton, model annotates] → Execution
(one step per round) → Inspection [D] → Verification [D, cheapest first] →
Correction (bounded). Deterministic findings are mandatory; critic findings
advisory. Verification commands allow-listed, opt-in, argv-array spawn.
Details: `planning-and-verification.md`.

## 11. Benchmark strategy

Three arms (raw / CodeAtlas today / CodeAtlas + intelligence layer) × model
matrix (Ollama 3B–14B, medium, frontier ceiling) × 6 task categories with
hidden tests and gold impact sets. Metrics: correctness, task completion,
hallucination rate, wrong-file rate, unnecessary changes, iterations, tool
calls, tokens, latency, cost, token quality ratio. Ablations attribute gains
per feature. Success: ≥2× correct-task rate for small models on bug-fix and
feature categories; hallucinated-file rate <5%; wrong-file rate −50%; no
regression for strong models. Details: `benchmark-plan.md`.

## 12. Phased implementation roadmap

Phase 0 baseline benchmark → 1 context intelligence → 2 planning → 3 MCP
high-level tools → 4 verification → 5 iterative loop + structured state →
6 critic → 7 repository memory → 8 benchmark & tuning. Each phase has files
affected, new/changed components, dependencies, complexity, risk, expected
improvement, benchmark requirement, and definition of done:
`implementation-roadmap.md`.

## 13. Highest-risk architectural changes

1. Verification command execution (security-critical; allow-list + argv
   spawn + opt-in; needs ADR + review).
2. Plan skeletons becoming authoritative despite parser gaps (renamed
   imports, `export default` don't resolve) — conflict escalation required.
3. Tool-surface growth (tool overload makes weak models worse) — hard cap
   ≤12 tools.
4. Iterative loop pathology (infinite loops, context explosion) — global
   budgets, bounded loops, every abort reports.
5. New package vs SDK placement of ports — affects the dependency matrix;
   ADR required.

## 14. Questions requiring decisions before implementation

14 open questions in `open-questions.md`; the blocking ones:

1. Who runs verification commands — CodeAtlas process (opt-in,
   allow-listed) or host agent?
2. Single model vs planner/critic split; when is a stronger critic model
   justified?
3. Can verification be enforced for external MCP hosts, or only offered?
4. New feature package (`@atlas/intel`/`@atlas/verifier`) vs implementation
   inside `@atlas/sdk`?
5. Fix parser gaps (renamed imports / `export default`) before or after
   Phase 1 (they directly undermine graph closure)?

## Status

**Plan only.** Nothing was implemented. The only repository change is this
new `docs/audit/small-model-intelligence/` directory (13 documents + this
report); no existing files were modified.
