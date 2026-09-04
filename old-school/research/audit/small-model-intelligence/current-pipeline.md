# Current Intelligence Pipeline — Real Request Lifecycle

Traced through code, 2026-08-30. Each stage: what happens, where, and where
context/quality is lost.

## Stage-by-stage trace

### 1. User Request → Request Understanding
**What happens:** Nothing. The raw string is the task.
- CLI `atlas ask <question>` (`apps/cli/src/commands/ask.ts`) passes the
  string straight to `integration.buildSlice({ task: question })`.
- CLI `atlas context build/explain` (`apps/cli/src/commands/context.ts`)
  passes it to the context-integration assembler.
- MCP tools receive a `query` string (`packages/mcp/src/handlers.ts`).

**Missing:** task classification (bug/feature/refactor/explain), entity
extraction, ambiguity detection.
**Small-model risk:** a weak model receives the task verbatim and must decide
everything itself.

### 2. Repository Understanding
**What happens:** Only what was pre-computed at index time.
- `packages/sdk/src/indexing` (`indexProject`) → scanner/hashing/parser/graph.
- Orientation material = `project_overview` (counts, languages, top files/
  symbols), stored AI summaries (`packages/summary`), instruction files
  (`packages/sdk/src/context-integration/instructions.ts`: AGENTS.md,
  CLAUDE.md, README capped 4000 chars, manifest summary).

**Missing:** architecture digest, conventions, entry points, module purpose map.
**Loss point:** small models get counts, not comprehension.

### 3. Context Retrieval
**What happens:** Lexical search.
- `@atlas/search`: `search-index.ts` refresh over snapshot; `scoring.ts` +
  `fuzzy.ts` typo-tolerant scoring. No embeddings (seam only).
- SDK `getRelevantContext` (`packages/sdk/src/context/sdk.ts`): top files +
  symbols + summaries for those files + dependency edges touching selected
  nodes + overview.

**Missing:** query expansion, dependency closure, test/config file pinning.
**Loss point:** the right files exist in the index but are not retrieved —
a lexical miss becomes a wrong-file answer.

### 4. Context Selection / Ranking
**What happens:**
- `packages/context/src/context-builder.service.ts`: `build(query, limit,
  taskCategory)` → search → optional category rerank (3 regex lists ×1.5,
  lines 117–135) → resolve hits to **whole file contents** (`toContextItems`:
  one item per file, dedup by highest score).
- Budgeted variant: `packages/sdk/src/context-integration/assemble.ts` +
  `budget.ts` (token budgets), `slice.ts` (ranked slice with budget metadata).

**Missing:** symbol-level granularity, hierarchy tiers, expansion to
 callers/callees/tests, per-file truncation policy is crude.
**Loss point:** whole-file items bloat context; supporting files (deps, tests,
config) rank below the cutoff and are silently dropped.
### 5. Prompt Construction
**What happens:**
- `assemble.ts` builds `ContextPackage`; `render.ts` renders it;
  `briefing.ts` optionally produces an AI briefing (JSON, cached by content
  hash); `instructions.ts` injects repo instructions.
- Tool-loop preamble: static `CONTEXT_GUIDANCE` (`tool-loop.ts` ~line 25) —
  "use the context, 1–5 tool calls".

**Missing:** task-type-specific prompt templates, plan section, output
contract (required answer shape), few-shot anchors.
**Small-model risk:** one generic prompt shape for all tasks.

### 6. Model
**What happens:** `ProviderPort` (`packages/providers/src/provider.service.ts`)
→ adapter (`ollama.ts` / `openai-compatible.ts` / `anthropic.ts` / `gemini.ts`)
→ `retry.ts`. Tool loop = `ToolUsingChatAgent` (`tool-loop.ts`).

**Missing:** structured intermediate state, per-round re-briefing.
**Loss point:** history grows; small models drift from the objective.

### 7. Tool Calls
**What happens:**
- Loop tools come from `ContextToolSource` (`context-tools/types.ts`), backed
  by SDK reads (search/dependencies/read ranges).
- Termination: no tool calls (final answer), `MAX_TOOL_ROUNDS` cap (returns
  last content + note), unknown tool → error result to model.
- Dedup: `SearchMemory` (Levenshtein ≤3 / containment); per-tool call caps.
- Policy: `ToolCallPolicy` deny list (advisory; denied calls get an error
  result the model can react to).

**Missing:** purpose tracking, retry-on-failed-tool strategy, ordering guidance.
**Small-model risk:** tools are low-level (search/read) — the model must
orchestrate; a weak model either under-calls (answers blind) or thrashes
(18+ calls — the reason `CONTEXT_GUIDANCE` exists).

### 8. Additional Context
**What happens:** only via the model's own tool calls. The system never
proactively fetches dependencies/tests after seeing a plan or draft.
**Loss point:** expansion depends on the weakest component — the model.

### 9. Output
**What happens:** last model content returned. MCP results carry `freshness`
metadata; `read_file_range` returns `versionMatch`/`stale`
(`packages/mcp/src/tools.ts`, `read_file_range` definition).

### 10. Validation
**What happens:** **None at runtime.** No test run, no typecheck, no
 cited-path existence check, no graph consistency check.
Only the offline benchmark (`packages/benchmark/src/evaluator.ts`) scores
outputs — and only by substring overlap of expected file basenames/concepts
(`fileHits`/`conceptHits`), plus `citedPaths` existence check (regex over
final text). It cannot detect hallucinated APIs, logic errors, or unnecessary
changes.

### 11. Final Response
Delivered as-is. No verification report, no confidence annotation.

## Where the pipeline loses quality (summary)

| # | Loss point | Consequence for small models |
|---|---|---|
| 1 | No request understanding stage | Model must infer intent from raw string |
| 2 | Flat whole-file context (`toContextItems`) | Overload; important symbol buried |
| 3 | No dependency-closure retrieval | Missing deps → wrong edits |
| 4 | Category boosts = 3 regexes | Wrong files for task type |
| 5 | Generic prompt, no plan/output contract | Premature, unstructured answers |
| 6 | Tool orchestration left to model | Under-use or thrash |
| 7 | No proactive expansion loop | One retrieval shot |
| 8 | Zero runtime validation | Hallucinations ship |
| 9 | No state externalization | Objective drift over rounds |
| 10 | Benchmark can't detect hallucination | Improvements unmeasurable |
