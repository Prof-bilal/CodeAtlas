# Phase B: Fix What Measurement Shows

Read `production-readiness/PRODUCT_PLAN.md` (Phase B section) and
`benchmarks/phase-b/PHASE_B_PLAN.md` for full context.

## Context

Phase A benchmarking (199 task-runs across 3 models × 4 repos × 3 arms) found:
- CodeAtlas does NOT improve accuracy on any measured cell
- Commander REGRESSES (-0.11 accuracy) on both mimo and nemotron
- 10 budget_truncation failures (53% of all failures) — max-rounds exhaustion
- axios (466 files) shows +220% token overhead, flat accuracy
- Tool outputs dominate cache-read volume (~70% of total tokens)
- `codeatlas-intel` falls back to `codeatlas` agent (ollama.ts:157) — not distinct
- Evaluation scores are NOT persisted in task results — accuracy data unavailable

## Prerequisites (BLOCKING — complete first)

### P1. Fix evaluation score persistence

In `packages/benchmark/src/benchmark.service.ts`, the `runTask()` method calls
`evaluateTask()` but does NOT persist the result into the per-task JSON file.
The evaluation is only re-computed in batch by `runSuite()`/`generateReport()`.

Fix: after `evaluateTask()` in `runTask()`, spread the evaluation result into
the saved `BenchmarkTaskResult`. The `BenchmarkTaskResult` type in
`packages/core/src/ports/benchmark.port.ts` needs an optional `evaluation` field
of type `BenchmarkEvaluation` if it doesn't already have one.

Verify: `pnpm --filter @atlas/benchmark typecheck` + `pnpm test -- packages/benchmark/tests/`

### P2. Retire codeatlas-intel as a benchmark arm

In `packages/benchmark/src/runner/ollama.ts:157`:
```
return this.agents["codeatlas-intel"] ?? this.agents.codeatlas;
```
This means codeatlas-intel IS codeatlas. Remove the fallback line. If any
suite configs reference `codeatlas-intel` in their modes array, remove it.

Verify: `pnpm --filter @atlas/benchmark typecheck`

## B1. Budget/Truncation Policy Fix (P0)

**Problem:** 53% of failures are budget_truncation — the 10-round MAX_TOOL_ROUNDS
cap terminates the loop before complex tasks produce a final answer.

**Files to modify:**
- `packages/sdk/src/context-integration/budget.ts`
- `packages/sdk/src/context-integration/assemble.ts`
- `packages/sdk/src/context-integration/render.ts`

**What to implement:**

1. In `budget.ts`, the `applyBudget()` function already protects `critical` tier
   items from being dropped. Verify this works correctly — the tier priority
   ordering should be: `critical > supporting > optional`. If an item's tier
   is not recognized, it should be treated as `optional` (degrade worst first).

2. In `render.ts`, `renderContextPackage()` should emit a `truncated: true`
   signal when the budget record shows any items were dropped. Currently the
   budget summary is rendered but there's no explicit boolean flag. Add one:
   - Add `truncated: boolean` to the `ContextPackage` type (in `./models.ts`)
   - Set it to `true` when `budgetRecord.droppedCount > 0`
   - Render it as a visible note: "[Context was truncated — some lower-priority
     items were dropped to fit within budget]"

3. In `assemble.ts`, review the `sortByRank()` function. Items are sorted by
   tier priority then score. The budget then drops tail items. Ensure that
   when critical-tier items exist, they are NEVER dropped regardless of score.

**Tests:** Add tests in `packages/sdk/tests/context-integration/` (or the
existing test file for budget) that verify:
- Critical-tier items survive budget truncation
- Supporting-tier items are dropped before critical
- Optional-tier items are dropped first
- `truncated: true` is set when items are dropped
- `truncated: false` when no items are dropped

**Acceptance:** `pnpm test -- packages/sdk/tests/` passes. Critical-tier items
are never truncated.

## B2. Regime-Aware Context Modes (P0)

**Problem:** axios (466 files) shows +220% token overhead with flat accuracy.
The model doesn't benefit from context on medium repos. Small repos (winston,
116 files) show smaller overhead.

**Files to modify:**
- `packages/core/src/ports/context.port.ts` (or a new types file) — add
  `ContextMode` type
- `packages/sdk/src/context-integration/index.ts` — mode selection logic
- `packages/sdk/src/context-integration/assemble.ts` — mode-aware assembly
- `packages/mcp/src/handlers.ts` — `find_relevant_context` param
- `apps/cli/src/commands/context.ts` — CLI flag

**What to implement:**

1. Define `ContextMode` type in core:
   ```typescript
   type ContextMode = "auto" | "digest" | "full" | "off";
   ```

2. In `assemble.ts`, add a `contextMode` parameter to `AssembleOptions`:
   - `"auto"` (default): select mode based on repo size
     - < 200 files → `"digest"` (one-shot overview + targeted retrieval)
     - 200-800 files → `"full"` (standard assembly)
     - > 800 files → `"digest"` (prevent token explosion on large repos)
   - `"digest"`: include only the digest item + top-5 search results (skip
     dependency chains, skip full overview)
   - `"full"`: current behavior (all items, dependency chains, full assembly)
   - `"off"`: return empty package (baseline mode)

3. The `"digest"` mode should:
   - Include the project digest item (already built by `digestItem()` in assemble.ts)
   - Include top-5 search hits (instead of top-20)
   - Skip dependency chain expansion
   - Skip project overview
   - Apply a tighter budget: 10 items, 8000 tokens total

4. Wire `contextMode` through:
   - `ContextIntegration.buildPackage()` → `assembleContextPackage()`
   - `find_relevant_context` MCP handler → accept `contextMode` param
   - `atlas context` CLI → `--mode` flag

5. Add an ADR in `docs/decisions/` explaining the regime-aware context mode
   (short, ~30 lines).

**Tests:** Add tests that verify:
- `"auto"` selects digest for repos < 200 files
- `"auto"` selects full for repos 200-800 files
- `"auto"` selects digest for repos > 800 files
- `"digest"` mode produces fewer items than `"full"` mode
- `"off"` returns empty package

**Acceptance:** `pnpm test -- packages/sdk/tests/` passes. Digest-mode produces
≤10 items and ≤8000 tokens.

## B4. Sufficiency-Gate Tuning (P1)

**Problem:** The sufficiency gate's false-positive and false-negative rates are
unknown. It may be blocking tasks that would have succeeded.

**Files to modify:**
- `packages/sdk/src/context-integration/sufficiency.ts`
- `packages/mcp/src/handlers.ts` (findRelevantContext)

**What to implement:**

1. In `handlers.ts`, the `findRelevantContext` handler already calls
   `evaluateSufficiency()`. Add the gate's verdict to the tool output so it's
   visible in benchmark results:
   - Include `sufficiency: { sufficient: boolean, failures: [...], nextSteps: [...] }`
     in the response shape
   - This makes gate decisions visible in task transcripts for analysis

2. In `sufficiency.ts`, the four predicates use hardcoded thresholds. Make
   `minScore` configurable (it already is via `SufficiencyInput`). Review the
   default value — if it's too high, the gate will have high false-positive
   rate. Current default appears to be 0.3 based on the input type. Consider
   lowering to 0.1 for initial testing.

3. Add a `sufficiencyVerdict` field to the benchmark task result so gate
   decisions are persisted per task. In `packages/core/src/ports/benchmark.port.ts`,
   add to `BenchmarkTaskResult`:
   ```typescript
   readonly sufficiencyVerdict?: {
     readonly sufficient: boolean;
     readonly failures: readonly { readonly predicate: string; readonly message: string }[];
   };
   ```
   In `benchmark.service.ts`, capture the sufficiency verdict from the tool
   output and persist it.

**Tests:** Add tests in `packages/benchmark/tests/` that verify:
- Sufficiency verdict is persisted in task results
- Gate decisions are visible in benchmark output

**Acceptance:** Gate decisions are recorded per task in benchmark results.

## B5. MCP Output Token-Efficiency Audit (P1)

**Problem:** Tool outputs dominate cache-read volume (~70% of total tokens).
`find_relevant_context` and `read_file_range` are the worst offenders.

**Files to modify:**
- `packages/mcp/src/handlers.ts`
- `packages/mcp/src/tools.ts`

**What to implement:**

1. In `handlers.ts`, the `findRelevantContext` handler calls
   `assembleContextPackage()` which returns a full `ContextPackage` with all
   item content. The rendered output includes every item's full text. Cap the
   total output size:
   - Add a `MAX_CONTEXT_OUTPUT_CHARS = 50_000` constant
   - When rendering the context package for the tool response, truncate at
     this limit
   - Add a `[Context truncated at 50K chars — ${remaining} chars omitted]`
     footer

2. In `handlers.ts`, the `readFileRange` handler returns the full file content
   for the requested range. The `MAX_TOOL_RESULT_CHARS = 20_000` limit exists
   in the tool loop but the MCP handler doesn't enforce it. Add enforcement:
   - If the file content exceeds 20K chars, truncate and add a note

3. In `tools.ts`, review the tool descriptions. The Phase A audit found that
   tool descriptions are "technical, not behavioral" — agents can't decide
   which tool to call. Improve descriptions for the top-3 most-used tools:
   - `find_relevant_context`: add "Use this FIRST when you need to understand
     code. Returns ranked file excerpts relevant to the task."
   - `search_symbols`: add "Use this to find specific function/class/variable
     definitions and their locations."
   - `read_file_range`: add "Use this to read specific lines from a file you
     already know about. Prefer find_relevant_context for discovery."

4. Keep the `next_steps` convention in all tool outputs.

**Tests:** Add tests that verify:
- `find_relevant_context` output is capped at 50K chars
- `read_file_range` output is capped at 20K chars
- Truncation notices are present in capped output

**Acceptance:** `pnpm test -- packages/mcp/tests/` passes. Tool outputs are
capped at the specified limits.

## Verification

After all changes, run:
```
pnpm check
```
This runs typecheck + lint + format + test across all packages.

Also run specifically:
```
pnpm --filter @atlas/benchmark typecheck
pnpm test -- packages/benchmark/tests/
pnpm test -- packages/sdk/tests/
pnpm test -- packages/mcp/tests/
```

## Rules

- Do NOT change runtime defaults (MAX_TOOL_ROUNDS, MAX_TOOL_RESULT_CHARS)
  without measured justification
- Do NOT add new intelligence features (planner, critic, verifier)
- Do NOT modify the scanner, parser, graph, or storage packages
- Do NOT touch the evaluator scoring logic
- Preserve all existing tests — do not delete or weaken any assertions
- Follow existing code conventions (Result types, port patterns, Zod schemas)
- Every new type goes in the appropriate core port file
- Every new function gets a JSDoc comment
- Run `pnpm check` before considering the task done
