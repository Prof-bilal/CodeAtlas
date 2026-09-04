# Small-Model Failure Analysis (3B–14B, Ollama / local / cheap API)

Assumption: the model has significantly weaker reasoning, instruction
following, and tool discipline than frontier models. The goal is for the
**system** to compensate.

## Failure catalog

| # | Failure | Why it happens in CodeAtlas today | Current mitigation | Missing mitigation | Severity |
|---|---|---|---|---|---|
| 1 | **Poor repository understanding** | Only counts + top files/symbols (`project_overview`) and optional summaries; no architecture digest, no conventions | `instructions.ts` adds AGENTS.md/CLAUDE.md/README; `briefing.ts` AI briefing | Auto-generated repo memory (architecture, entry points, module purposes) refreshed on index update | High |
| 2 | **Wrong file edits / wrong-file rate** | Retrieval is lexical top-k with whole-file items; no caller/callee closure | Category regex boosts (3 lists) | Graph-driven dependency closure + test/config pinning; plan lists files deterministically | Critical |
| 3 | **Hallucinated APIs** | No verification at all; nothing compares model claims to indexed symbols | None | `VerifierPort`: resolve cited symbol/file names against `@atlas/search`/graph; typecheck/tests; reject-and-retry | Critical |
| 4 | **Hallucinated files/paths** | Model invents paths; nothing checks | `citedPaths` exists only in offline benchmark (`benchmark/evaluator.ts`) | Runtime path-existence check on the final answer + on tool-read results | Critical |
| 5 | **Hallucinated architecture** | Model must infer structure from flat file dumps | Summaries (opt-in) | Hierarchical context (repo→module→file→symbol) + repo memory digest | High |
| 6 | **Weak planning / premature answers** | No planning stage; task string goes straight to the model (`ask.ts`) | Static `CONTEXT_GUIDANCE` text | `PlannerPort`: deterministic plan skeleton (files, deps, unknowns, verification steps); model must fill it before answering | Critical |
| 7 | **Inability to connect files (cross-file reasoning)** | Context items are whole files with no relationship labels between them | `get_dependencies` MCP tool exists but the model must call it | Dependency closure with explicit relationship annotations ("A calls B", "A imports B") in the rendered package | Critical |
| 8 | **Poor tool selection / misuse** | 7 low-level MCP tools; descriptions already warn "Slow. Only call after a search narrows the target" — relies on model discipline | `CONTEXT_GUIDANCE`, `SearchMemory` dedup, per-tool caps, `MAX_TOOL_ROUNDS` | High-level MCP tools (`analyze_task`, `find_relevant_context`, `create_plan`, `verify_change`) that remove orchestration decisions | High |
| 9 | **Context overload / losing task objective** | Whole-file items; history grows across rounds with no re-statement of the objective | Token budgets (`budget.ts`), slice rendering | Hierarchical tiering (critical first), structured state JSON re-injected per round, objective restatement | Critical |
| 10 | **Inability to prioritize information** | Flat ranked list, one score | `rerankByContextTaskCategory` | Explicit tiers: Critical / Important / Supporting / Optional with per-tier budgets | High |
| 11 | **Failure to verify results** | Nothing verifies | None | Deterministic validator: run tests, typecheck, lint; graph consistency; expected-file-changes check | Critical |
| 12 | **Failure to recover from errors** | Tool errors are returned as text to the model; no retry strategy | Loop continues until round cap | Structured error taxonomy + guided recovery ("query failed → try these 3 alternatives generated deterministically") | High |
| 13 | **Inconsistent outputs / format drift** | JSON output only enforced for summaries/briefing (`parseSummaryContent`) | `SYSTEM_JSON_INSTRUCTION` | Output contracts per task type with schema validation + 1 repair round | Medium |
| 14 | **Multi-step task degradation** | One bounded loop, no plan/state | `MAX_TOOL_ROUNDS` cap (prevents runaway, not degradation) | Structured state + plan checklist; each round shows remaining steps | Critical (for multi-step) |
| 15 | **Answers from insufficient context** | No sufficiency gate | None | Deterministic gate: no hits above score threshold, or plan references unknown files → force retrieval | High |
| 16 | **Stale-context mistakes** | `read_file_range` has `expectedHash`/`stale` but model must use it | Freshness metadata on MCP results | Auto-refresh + refuse-to-answer-on-stale-critical-files policy | Medium |

## Why these are system failures, not model failures

Every failure above can be prevented or detected by information CodeAtlas
already has (the graph, hashes, symbol index, file lists) or by running a
command (tests, typecheck). The design principle: **the model should never be
asked for a fact the system can compute, and never trusted for a claim the
system can check.**

## Where hallucination can enter, concretely

1. Task string → search query (model paraphrases; no query normalization).
2. Search misses → model fills gaps from prior knowledge (no sufficiency gate).
3. Whole-file context truncated by budget (`budget.ts`) → model guesses the
   hidden part.
4. Tool results returned raw → model misreads; no inspector normalizes them.
5. Final answer → no validator → hallucination ships.
