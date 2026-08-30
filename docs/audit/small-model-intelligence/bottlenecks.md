# Quality Bottlenecks — Ranked

P0 = Critical, P1 = High, P2 = Medium, P3 = Low.
"Small Model Impact" = how much a 3B–14B model's output quality is affected.

| Priority | Problem | Location | Impact | Small Model Impact | Difficulty |
|---|---|---|---|---|---|
| P0 | No runtime verification of model output (tests/typecheck/path checks/graph consistency) | nowhere; nearest `packages/benchmark/src/evaluator.ts` (offline only) | Hallucinations and broken code ship silently | Critical — no correction signal exists | Medium-High |
| P0 | No planning/task decomposition; raw task string is the plan | `apps/cli/src/commands/ask.ts`, `packages/sdk/src/context-integration/assemble.ts` | Premature, unfocused answers | Critical — weak models cannot self-plan | Medium |
| P0 | Flat, whole-file context; no symbol ranges, no hierarchy | `packages/context/src/context-builder.service.ts` (`toContextItems`) | Context bloat, buried signal | Critical — overload and objective loss | Medium |
| P0 | No dependency-closure retrieval (callers/callees/tests/config) | `packages/sdk/src/context/sdk.ts` `getRelevantContext` (edges only for selected nodes); `@atlas/graph` unused for retrieval | Missing deps → wrong edits | Critical — cross-file reasoning fails | Medium |
| P0 | Benchmark evaluator scores substring overlap; cannot detect hallucination or measure task completion | `packages/benchmark/src/evaluator.ts` | Improvements unmeasurable | Critical enabler — no proof of progress otherwise | Medium |
| P1 | MCP exposes only low-level tools; orchestration left to the model | `packages/mcp/src/tools.ts` | Tool misuse/underuse | High — the exact skill weak models lack | Medium |
| P1 | Task-aware retrieval = 3 regex boost lists | `packages/context/src/context-builder.service.ts` (`TASK_BOOST_PATTERNS`) | Wrong files per task type | High | Low-Medium |
| P1 | Tool loop has no structured state; objective drifts over rounds | `packages/sdk/src/context-tools/tool-loop.ts` | Multi-step degradation | High on multi-step tasks | Medium |
| P1 | No context sufficiency gate | nowhere | Answers from nothing | High | Low-Medium |
| P1 | Generic prompt construction; no per-task template or output contract | `packages/sdk/src/context-integration/{assemble,render,instructions}.ts` | Unstructured answers | High | Medium |
| P2 | No critic/reviewer pass | nowhere | Plausible-but-wrong drafts | Medium-High | Medium |
| P2 | No persistent repository memory (architecture/conventions/entry points) | `packages/summary`, `context-integration/instructions.ts` (instruction files only) | Model re-derives orientation per task | Medium | Medium |
| P2 | Static tool-loop guidance text; no adaptive guidance | `tool-loop.ts` `CONTEXT_GUIDANCE` | Weak models ignore or over-follow it | Medium | Low |
| P2 | Parser gaps: renamed imports, `export default <expr>` unresolved | `packages/parser` | Incomplete graph → wrong dependency context | Medium | Medium-High |
| P2 | No embeddings/semantic retrieval (seam only) | `packages/search` `RelevanceScorer` | Lexical misses on paraphrased queries | Medium (large for natural-language tasks) | Medium-High |
| P3 | Whole-file items with no per-file truncation policy | `context-builder.service.ts` | Token waste (acceptable but improvable) | Low | Low |
| P3 | Tool results returned raw, no normalization/inspector | `tool-loop.ts` | Model misreads results | Low-Medium | Low |
| P3 | Single `estimateTokens` (~4 chars/token) heuristic | `tool-loop.ts`, `packages/metrics/src/token-estimation.ts` | Budget inaccuracy | Low | Low |

## Category assessment (audit questions)

- **A. Context selection**: partial — right files sometimes; related files,
  tests, config, schemas NOT systematically included.
- **B. Context ordering**: absent — flat score order only.
- **C. Context hierarchy**: absent — no critical/important/supporting/optional.
- **D. Task decomposition**: absent.
- **E. Planning**: absent.
- **F. Verification**: absent (offline benchmark only).
- **G. Iterative reasoning**: partial — bounded tool loop exists, no
  understand→plan→act→inspect→verify→correct cycle.
- **H. Tool orchestration**: absent — model must decide what to fetch.
- **I. Error recovery**: minimal — error text returned to model, no strategy.
- **J. Confidence/sufficiency**: absent.
