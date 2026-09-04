# Open Questions — Decisions Required Before Implementation

1. **Verification execution policy.** Who runs tests/typecheck — CodeAtlas
   process directly (opt-in, allow-listed) or delegate to the host agent
   (MCP `verify_change` returns instructions only)? Security posture vs
   usefulness tradeoff. Blocks Phase 4 design.
2. **Single model vs split roles.** Default critic = same model? If a stronger
   critic model is configured, does the planner also upgrade, or only the
   critic? Needs the Phase-6 ablation to decide defaults.
3. **Scope of verification for external MCP hosts.** Claude/Cursor drive their
   own loops; can CodeAtlas enforce verification, or only offer it? (Likely:
   offer `verify_change` + make `find_relevant_context` return verification
   requirements.)
4. **Language scope.** Parser is TypeScript-only (`packages/parser`). Do
   intelligence features degrade gracefully per language (closure limited to
   indexed TS), and is multi-language parsing on the roadmap first?
5. **New package vs SDK placement.** Do `PlannerPort`/`VerifierPort`/
   `TaskClassifierPort` implementations live in `@atlas/sdk`, or in a new
   `@atlas/intel`/`@atlas/verifier` feature package? ADR needed; affects the
   dependency matrix (`docs/DEPENDENCIES.md`).
6. **Where structured state lives.** In-memory per session only, or persisted
   under `.codeatlas/` (like slices in `slice-store.ts`)? Persistence enables
   cross-session resume but adds staleness/cleanup concerns.
7. **Embeddings.** Invest in the `RelevanceScorer` embedding path now, or
   after deterministic closure proves insufficient on the benchmark?
   (Recommendation: benchmark first — Rule 8.)
8. **Budget defaults.** What are acceptable default budgets for small models
   (context-window 4k–32k)? Quality-first suggests generous, but Ollama
   default contexts are small — per-provider default budget table needed.
9. **MCP result payload size.** High-level tools return more context — what
   cap keeps hosts (Claude Desktop, Cursor) from truncating? Needs measurement
   on `benchmark-repos/03-monorepo` and `05-large-project`.
10. **Hidden-test benchmark licensing/authoring.** Who writes the hidden
   tests and gold patches for the 5 fixture repos, and how are they kept
   secret from the model (not in the repo under test at run time)?
11. **Parser gap priority.** Fix renamed-import / `export default` resolution
   before or after Phase 1? Wrong graph edges directly undermine closure.
12. **Back-compat of `ContextItem`.** Extending it with tier/ranges/reason —
   additive fields (preferred) vs a new `HierarchicalContextItem` type?
13. **Tool-loop guidance for non-CodeAtlas hosts.** `CONTEXT_GUIDANCE` is
   injected by `ToolUsingChatAgent`; external MCP hosts bypass it. Should
   high-level MCP tools carry equivalent guidance in descriptions/results
   instead? (Likely yes — affects Phase 3.)
14. **Success threshold for cutting features.** Confirm Rule 8 policy: any
   model-based component (critic, semantic retrieval) that does not beat its
   deterministic alternative on the Phase-0/8 benchmark is removed — agree on
   the statistical bar (e.g. ≥10% correct-rate gain, p<0.05, 3 seeds).
