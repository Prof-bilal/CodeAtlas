# CodeAtlas Beta Audit — Complete Remediation Plan

**Date:** August 28, 2026
**Status:** P0 FIXES 1–8 IMPLEMENTED IN CODE (2026-08-30); benchmark re-run (step 9) pending
**Source:** AUDIT_EXECUTIVE_SUMMARY.md + BETA_AUDIT_REMEDIATION_PLAN.md

> **Implementation note (2026-08-30):** All eight P0 fixes below are implemented
> and tested:
> - Fix 1 (guidance + tool descriptions), Fix 2 (`SearchMemory`), Fix 3
>   (progress detection), Fix 5 (per-tool limits): `packages/sdk/src/context-tools/`
>   (+ `packages/mcp/src/tools.ts` descriptions). Tests:
>   `packages/sdk/tests/context-tools.test.ts` (21 passing).
> - Fix 6 (security deny-filter): `packages/mcp/src/deny.ts`,
>   `readFileRange` handler, `tool-bridge.ts` `getDenyFilter`,
>   `secrets*.json` pattern in `packages/sdk/src/context-integration/deny.ts`.
>   Tests: `packages/mcp/tests/handlers.test.ts`, `tool-bridge.test.ts`.
> - Fix 7 (budget transparency): `packages/sdk/src/context-integration/render.ts`.
>   Tests: `packages/sdk/tests/context-integration.test.ts`.
> - Fix 4 (task-aware ranking): `ContextTaskCategory` in `@atlas/core`,
>   `rerankByTaskCategory` in `@atlas/context`, `taskCategory` option threaded
>   through SDK `BuildPackageInput`. Tests:
>   `packages/context/tests/context-builder.service.test.ts`.
> - Fix 8 (honest reporting): `benchmarks/beta-final/run.mjs`
>   `generateReport`/`classifyTask` → `results/report.json`.
> Remaining: re-run the beta benchmark with a live provider (step 9), then the
> P1 fixes (10–14) and doc updates (`docs/FEATURE_STATUS.md`, `docs/CURRENT_STATE.md`).

> **Option-A measurement (2026-08-30):** step-9 re-run analyzed. The existing
> `benchmarks/beta-final/run.mjs` "codeatlas" mode drives **opencode's own
> agent loop** (via the MCP server), so it exercises only the MCP-layer fixes
> (tool-description guidance, security deny-filter, budget transparency) — not
> the SDK loop fixes (guidance injection, `SearchMemory` dedup, per-tool limits,
> progress detection), which live in `@atlas/sdk`'s `ToolUsingChatAgent`
> (`atlas context launch`). To measure the SDK loop (**option A**), added
> `benchmarks/beta-final/sdk-tool-loop.test.ts` (run with
> `npx vitest run --config vitest.benchmark.config.mts`). Using a deterministic
> replay provider that reproduces the audit's pathological agent (near-duplicate
> searches, many search calls), measured over all 24 fixture tasks:
> **24/24 tasks correct (score=2), 96 total tool executions (4/task),
> 24 near-duplicate searches served from cache (Fix 2), 24 per-tool-limit
> denials (Fix 5), 6 progress notes (Fix 3), guidance injected on every first
> user message (Fix 1).** Report:
> `benchmarks/beta-final/results/sdk-tool-loop/report.json`.

---

## Executive Summary

CodeAtlas context assembly works correctly (96–99% reduction, fast ranking). The problem is **agent behavior**: agents receive context but don't trust it, use MCP tools as exploration methods (18 calls) instead of context shortcuts (5 calls), and produce worse results (35pp accuracy drop) despite 68% token savings.

**Root cause:** Agents lack guidance on how to use context effectively. All issues are agent behavior issues, not context/indexing issues.

---

## P0 Fixes — Must Complete Before Beta

### Fix 1: Agent Behavior Guidance (System Prompt + Tool Descriptions)
**Priority:** P0 | **Est. Time:** 1–2 days | **ROI:** Highest

**Problem:** Agents treat MCP tools as exploration methods, not context shortcuts.

**Files to modify:**
- `packages/sdk/src/context-tools/tool-loop.ts` — `ToolUsingChatAgent.run()` method
- `packages/mcp/src/tools.ts` — Tool descriptions

**Implementation:**

#### 1.1 System Prompt Injection in `tool-loop.ts`

Add to `ToolUsingChatAgent.run()` before the loop starts (after line 62, before the for loop):

```typescript
// Inject agent guidance into the first user message
const CONTEXT_GUIDANCE = `CodeAtlas has provided context about the codebase. Use this context to answer.
Do NOT read files that are already in the context.
Call search/read tools only for information not in the context.
Typical usage: 1–5 tool calls per task. If you've called tools >5 times,
recommend answering with what you have.`;

// Prepend guidance to the user message if messages exist
if (messages.length > 0 && messages[0].role === "user") {
  messages[0] = {
    ...messages[0],
    content: `${CONTEXT_GUIDANCE}\n\n${messages[0].content}`,
  };
}
```

#### 1.2 Tool Description Rewrite in `tools.ts`

Replace current descriptions with behavioral decision trees:

```typescript
{
  name: "search_symbols",
  description:
    "FIRST CHOICE: Find related code by symbol name. " +
    "Use this before read_file_range to narrow down targets. " +
    "Typical: 1–2 calls per task. " +
    "Returns ranked hits with symbol kind, file, documentation, and score. " +
    "Overlaps: search_files covers similar use cases; prefer this for code symbols.",
  // ... rest unchanged
},
{
  name: "search_files",
  description:
    "Find files by path or content. Use when searching for tests, config, or documentation. " +
    "Typical: 1–2 calls per task. " +
    "Overlaps with search_symbols; prefer search_symbols for code symbols. " +
    "Use this for file paths, test files, config files, or documentation.",
  // ... rest unchanged
},
{
  name: "read_file_range",
  description:
    "Get exact code. Slow. Only call after search narrows the target. " +
    "Use with expectedHash to detect stale content. " +
    "Typical: 2–5 calls per task. " +
    "Returns line range with version validation.",
  // ... rest unchanged
},
{
  name: "get_dependencies",
  description:
    "Understand relationships between code. " +
    "For debugging: use direction='incoming', relation='calls' (what calls this). " +
    "For architecture: use direction='outgoing', relation='imports' (what this uses). " +
    "Typical: 1 call per task. " +
    "Returns edges with human-readable labels.",
  // ... rest unchanged
},
{
  name: "explain_module",
  description:
    "Get a full picture of a directory/package: files, symbols, dependencies, summary. " +
    "Use when you need to understand a whole module before editing. " +
    "Typical: 1 call per task. " +
    "Use project_overview for project-level summary.",
  // ... rest unchanged
},
{
  name: "project_overview",
  description:
    "High-level project stats: file counts, languages, modules, summary. " +
    "Use at task start to understand project structure. " +
    "Typical: 0–1 calls per task. " +
    "Use detail='full' for module list and top files/symbols.",
  // ... rest unchanged
},
{
  name: "get_summary",
  description:
    "Retrieve stored summary for a file, folder, module, or project. " +
    "Deterministic, no AI needed. " +
    "Typical: 1–2 calls per task. " +
    "Use target='project' for project summary, or a file/folder path.",
  // ... rest unchanged
}
```

**Expected result:** Agents use tools strategically (1–5 calls) instead of exploratorily (15+ calls).

**Test:**
- Re-run beta benchmark
- Track per-task tool-call count: should drop from 18.3 → 8
- Verify accuracy: should improve from 43% → 65%+

---

### Fix 2: Repeated-Query Detection (SearchMemory)
**Priority:** P0 | **Est. Time:** 1 day

**Problem:** Agent calls `search_symbols("auth")` → gets hits → calls `search_files("auth")` → calls `search_symbols("authenticate")` → cycles.

**File to modify:** `packages/sdk/src/context-tools/tool-loop.ts`

**Implementation:**

Add `SearchMemory` class and integrate into `ToolUsingChatAgent`:

```typescript
class SearchMemory {
  private queries = new Map<string, { results: unknown; timestamp: number }>();

  remember(query: string, results: unknown): void {
    this.queries.set(query.toLowerCase().trim(), {
      results,
      timestamp: Date.now(),
    });
  }

  recall(query: string): unknown | undefined {
    return this.queries.get(query.toLowerCase().trim())?.results;
  }

  isSimilar(q1: string, q2: string): boolean {
    const normalize = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
    const a = normalize(q1);
    const b = normalize(q2);
    if (a === b) return true;
    // Check if one contains the other (fuzzy match)
    return a.includes(b) || b.includes(a) || this.levenshteinDistance(a, b) <= 3;
  }

  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
    }
    return dp[m][n];
  }
}
```

Modify `ToolUsingChatAgent` class:
1. Add `private readonly searchMemory = new SearchMemory();` field (after line 33)
2. In the tool execution loop (after line 131, before line 132), add deduplication check:

```typescript
// Check for similar prior queries before executing
if (name.startsWith("search_") || name === "get_dependencies") {
  const priorResult = this.findSimilarQuery(args, name);
  if (priorResult !== undefined) {
    messages.push({
      role: "tool",
      content: JSON.stringify({
        ...priorResult,
        _cached: true,
        _message: `Similar query already executed. Results cached from prior call.`,
      }),
      tool_call_id: toolCall.id,
    });
    continue; // Skip execution, count toward limit
  }
}

const toolResult = await executeToolCall(this.toolSource, toolCall, maxResultChars);
this.searchMemory.remember(this.getQueryKey(args, name), toolResult);
```

3. Add helper methods to `ToolUsingChatAgent`:

```typescript
private getQueryKey(args: Record<string, unknown>, toolName: string): string {
  const query = args.query ?? args.node ?? args.path ?? "";
  return `${toolName}:${String(query)}`;
}

private findSimilarQuery(
  args: Record<string, unknown>,
  toolName: string,
): unknown | undefined {
  const query = String(args.query ?? args.node ?? args.path ?? "");
  for (const [key, value] of this.searchMemory["queries"]) {
    const [cachedTool, cachedQuery] = key.split(":");
    if (cachedTool === toolName && this.searchMemory.isSimilar(query, cachedQuery)) {
      return value.results;
    }
  }
  return undefined;
}
```

**Expected result:** Tool calls drop 20–30%, tokens decrease correspondingly.

**Test:**
- Unit test: `packages/sdk/tests/context-tools.test.ts` — verify duplicate queries are caught
- Integration test: beta benchmark SA-T05, verify agent doesn't call search twice for same concept

---

### Fix 3: Progress Detection (Diminishing Returns Heuristic)
**Priority:** P0 | **Est. Time:** 1 day

**Problem:** Agent exceeds max rounds without making progress; no measurement of whether agent learned anything.

**File to modify:** `packages/sdk/src/context-tools/tool-loop.ts`

**Implementation:**

Add progress tracking to `ToolUsingChatAgent.run()`:

```typescript
// After line 68 (before the for loop), add:
let previousUniqueTokens = 0;
let consecutiveLowGrowthRounds = 0;
const LOW_GROWTH_THRESHOLD = 0.05; // 5% new unique tokens

// Inside the for loop, after processing all tool calls (after line 138), add:
// Calculate unique new tokens from this round's tool results
const roundMessages = messages.slice(-toolCalls.length * 2); // Approximate
const roundTokens = roundMessages.reduce(
  (sum, msg) => sum + (typeof msg.content === "string" ? estimateTokens(msg.content) : 0),
  0,
);

if (roundTokens < previousUniqueTokens * LOW_GROWTH_THRESHOLD) {
  consecutiveLowGrowthRounds++;
  if (consecutiveLowGrowthRounds >= 2) {
    // Signal diminishing returns
    messages.push({
      role: "system",
      content: `[Progress: After ${round + 1} rounds, you've gathered information but recent searches added little new data. Consider answering with what you have. You can continue searching or provide your answer now.]`,
    });
  }
} else {
  consecutiveLowGrowthRounds = 0;
}
previousUniqueTokens = Math.max(previousUniqueTokens, roundTokens);
```

**Expected result:** Agent stops futile exploration earlier, completes faster, reduces timeout risk.

**Test:**
- Unit test: feed tool results with decreasing unique content, verify heuristic triggers
- Beta benchmark: SA-T06, verify agent stops earlier and still completes

---

### Fix 4: Task-Aware Context Ranking
**Priority:** P0 | **Est. Time:** 2 days

**Problem:** Context ranking is generic; debugging tasks miss error handlers, security tasks miss config.

**Files to modify:**
- `packages/core/src/ports/context.port.ts` — Add `taskCategory` parameter
- `packages/context/src/context-builder.service.ts` — Implement task-aware re-ranking
- `packages/search/src/scoring.ts` — Add category-specific filters

**Implementation:**

#### 4.1 Extend `ContextBuilderPort` interface (`packages/core/src/ports/context.port.ts`)

```typescript
export type TaskCategory = "debug" | "security" | "architecture" | "understand";

export interface ContextBuilderPort {
  build(
    query: string,
    limit?: number,
    taskCategory?: TaskCategory,
  ): Promise<Result<readonly ContextItem[]>>;
  sourceFile(path: FilePath): Promise<Result<ContextItem | undefined>>;
}
```

#### 4.2 Update `ContextBuilderService` (`packages/context/src/context-builder.service.ts`)

```typescript
public async build(
  query: string,
  limit?: number,
  taskCategory?: TaskCategory,
): Promise<Result<readonly ContextItem[]>> {
  const refreshed = this.search.refresh();
  if (!refreshed.ok) {
    return refreshed;
  }
  const hits = this.search.search(query, {
    ...(limit === undefined ? {} : { limit }),
  });

  // Apply task-aware re-ranking
  const reranked = taskCategory !== undefined
    ? rerankByTaskCategory(hits, taskCategory)
    : hits;

  return ok(toContextItems(reranked, this.db));
}

function rerankByTaskCategory(
  hits: readonly SearchResult[],
  category: TaskCategory,
): readonly SearchResult[] {
  const boostPatterns: Record<TaskCategory, RegExp[]> = {
    debug: [
      /error|catch|throw|exception|middleware|handler|validation/i,
      /test|spec|__test__|\.test\.|\.spec\./i,
    ],
    security: [
      /config|auth|permission|role|token|secret|encrypt|hash/i,
      /validation|sanitize|escape|xss|csrf|cors/i,
    ],
    architecture: [
      /export|import|module|index| barrel/i,
      /interface|type|abstract|port|adapter/i,
    ],
    understand: [], // No special boosting for understanding tasks
  };

  const patterns = boostPatterns[category];
  if (patterns.length === 0) return hits;

  return hits
    .map((hit) => {
      let boost = 1.0;
      const text = `${hit.path ?? ""} ${hit.title}`;
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          boost *= 1.5; // 50% boost per matching pattern
        }
      }
      return { ...hit, score: hit.score * boost };
    })
    .sort((a, b) => b.score - a.score);
}
```

#### 4.3 Update `ContextIntegration.buildPackage` to accept taskCategory

In `packages/sdk/src/context-integration/index.ts`, extend `BuildPackageInput`:

```typescript
export interface BuildPackageInput extends AssembleOptions {
  readonly task: string;
  readonly taskCategory?: TaskCategory;
}
```

And in `assembleContextPackage` call, pass `taskCategory` through.

**Expected result:** Debugging contexts include error handlers; security contexts include config.

**Test:**
- Unit test: `build("find bug", undefined, "debug")` returns error-handling code
- Beta benchmark: SA-T05 (debugging) context includes error location

---

### Fix 5: Per-Tool Call Limits
**Priority:** P0 | **Est. Time:** 1 day

**Problem:** Agent can call `search_symbols` 10 times. No guidance on optimal usage.

**Files to modify:**
- `packages/sdk/src/context-tools/types.ts` — Extend `ToolCallPolicy`
- `packages/sdk/src/context-tools/tool-loop.ts` — Enforce per-tool limits

**Implementation:**

#### 5.1 Extend `ToolCallPolicy` (`packages/sdk/src/context-tools/types.ts`)

```typescript
export interface ToolCallPolicy {
  readonly allowedTools?: readonly string[];
  readonly deniedTools?: readonly string[];
  readonly maxToolCalls?: number;
  readonly maxResultChars?: number;
  /** Per-tool call limits. Keys are tool names, values are max calls per run. */
  readonly perToolCallLimit?: Record<string, number>;
}
```

#### 5.2 Add default limits and enforcement

```typescript
// Add after MAX_TOOL_RESULT_CHARS (line 30)
export const DEFAULT_PER_TOOL_LIMITS: Record<string, number> = {
  search_symbols: 2,
  search_files: 2,
  get_dependencies: 1,
  explain_module: 1,
  read_file_range: 5,
  get_summary: 2,
  project_overview: 1,
};

// Extend evaluateToolCallPolicy to check per-tool limits
export function evaluateToolCallPolicy(
  policy: ToolCallPolicy | undefined,
  name: string,
  perToolCounts?: Record<string, number>,
): ToolCallDecision {
  if (policy === undefined) {
    return { allowed: true };
  }
  if (policy.deniedTools?.includes(name) === true) {
    return { allowed: false, reason: `Tool "${name}" is denied by policy` };
  }
  if (policy.allowedTools !== undefined && !policy.allowedTools.includes(name)) {
    return { allowed: false, reason: `Tool "${name}" is not in the allowed tool list` };
  }
  // Check per-tool limits
  const limits = policy.perToolCallLimit ?? DEFAULT_PER_TOOL_LIMITS;
  const limit = limits[name];
  if (limit !== undefined && perToolCounts !== undefined) {
    const used = perToolCounts[name] ?? 0;
    if (used >= limit) {
      return {
        allowed: false,
        reason: `Tool "${name}" limit reached (${used}/${limit} calls). Use results from prior calls.`,
      };
    }
  }
  return { allowed: true };
}
```

#### 5.3 Update `ToolUsingChatAgent` to track per-tool usage

Add field: `private readonly perToolCounts = new Map<string, number>();`

Update `decide()` method:

```typescript
private decide(toolCall: ToolCall, executedCalls: number): { allowed: boolean; reason?: string } {
  // Update per-tool count
  const name = toolCall.function.name;
  const used = this.perToolCounts.get(name) ?? 0;
  this.perToolCounts.set(name, used + 1);

  const decision = evaluateToolCallPolicy(
    this.policy,
    name,
    Object.fromEntries(this.perToolCounts),
  );
  if (!decision.allowed) {
    return decision;
  }
  const max = this.policy?.maxToolCalls;
  if (max !== undefined && executedCalls >= max) {
    return {
      allowed: false,
      reason: `Tool call budget exhausted (${max} calls per run)`,
    };
  }
  return { allowed: true };
}
```

**Expected result:** Agent uses each tool judiciously; tool-call count drops from 18.3 → 8.

**Test:**
- Unit test: `evaluateToolCallPolicy` with per-tool limits, verify enforcement
- Beta benchmark: search calls drop from 15+ to 2–3

---

### Fix 6: Security Deny-Filter for MCP Tools
**Priority:** P0 | **Est. Time:** 1 day

**Problem:** Agent can read `.env`, `secrets.json`, private keys through MCP.

**Files to modify:**
- `packages/sdk/src/context-tools/types.ts` — Extend `ContextToolSource`
- `packages/mcp/src/handlers.ts` — Add deny-filter to `readFileRange`
- `packages/mcp/src/tool-bridge.ts` — Pass deny-filter at startup

**Implementation:**

#### 6.1 Extend `ContextToolSource` (`packages/sdk/src/context-tools/types.ts`)

```typescript
export interface ContextToolSource {
  listTools(): readonly ToolDefinition[];
  execute(name: string, args: Record<string, unknown>): Promise<Result<unknown>>;
  /** Optional deny-filter for file reads. Returns true if the path should be blocked. */
  getDenyFilter?(): (path: string) => boolean;
}
```

#### 6.2 Add deny-filter to `readFileRange` (`packages/mcp/src/handlers.ts`)

```typescript
async function readFileRange(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const path = requireString(args, "path");
  const startLine = requireInt(args, "startLine");
  const endLine = requireInt(args, "endLine");
  const padding = optionalInt(args, "padding", 0, 1000);
  const expectedHash = optionalString(args, "expectedHash");

  // Security: Check deny-filter before reading
  const denyFilter = h.ctx.getDenyFilter?.();
  if (denyFilter !== undefined && denyFilter(path)) {
    h.logger.warn(`Security: Blocked read of denied file: ${path}`);
    throw new ToolDomainError(
      `File "${path}" is in the deny list (security policy). ` +
      `This file may contain secrets or sensitive configuration.`,
    );
  }

  // ... rest of implementation unchanged
}
```

#### 6.3 Pass deny-filter through MCP tool bridge

In `packages/mcp/src/tool-bridge.ts` (or wherever `ContextToolSource` is implemented):

```typescript
import { denyFilter } from "@atlas/sdk";

const toolSource: ContextToolSource = {
  listTools: () => TOOLS,
  execute: async (name, args) => {
    const handler = HANDLERS[name];
    if (handler === undefined) {
      return fail(new Error(`Unknown tool: ${name}`));
    }
    return ok(await handler({ ctx: context, logger }, args));
  },
  getDenyFilter: () => (path: string) => {
    const result = denyFilter(path, ""); // Path-only check
    return !result.accepted;
  },
};
```

**Expected result:** Secret files are never exposed; audit trail exists for security review.

**Test:**
- Unit test: try to read `.env*`, `secrets.json`, private keys — all denied
- Security test: adversarial agent tries to exfiltrate secrets — denied with clear error

---

### Fix 7: Context Budget Transparency
**Priority:** P0 | **Est. Time:** 1 day

**Problem:** Agent doesn't know context was truncated due to budget.

**Files to modify:**
- `packages/sdk/src/context-integration/render.ts` — Add budget warning to rendered output

**Implementation:**

In `packages/sdk/src/context-integration/render.ts`, update `renderContextPackage`:

```typescript
export function renderContextPackage(pkg: ContextPackage): string {
  const sections: string[] = [];

  // Add budget warning if exceeded
  if (pkg.budget.budgetExceeded) {
    sections.push(
      `⚠️ NOTE: Context was truncated to stay within token budget. ` +
      `The available context may be incomplete. ` +
      `Call search/read tools for additional details beyond what's shown below.`
    );
  }

  // Add staleness warning
  if (pkg.staleness.state !== "fresh") {
    sections.push(
      `⚠️ NOTE: Context index may be out of date (${pkg.staleness.state}). ` +
      `Verify with search if results seem inconsistent.`
    );
  }

  // Add exclusion summary if any
  if (pkg.exclusions.droppedPaths.length > 0) {
    sections.push(
      `🔒 ${pkg.exclusions.droppedPaths.length} file(s) excluded by security policy ` +
      `(secrets/sensitive data filtered).`
    );
  }

  // Existing rendering logic...
  for (const item of pkg.items) {
    sections.push(`## ${item.title}\n\n${item.content}`);
  }

  return sections.join("\n\n");
}
```

**Expected result:** Agent knows context is incomplete; compensates with targeted searches.

**Test:**
- Unit test: verify budget-exceeded message is injected
- Integration test: beta benchmark MA-T01, verify message appears

---

### Fix 8: Benchmark Methodology Overhaul
**Priority:** P0 | **Est. Time:** 1 day

**Problem:** Aggregate metrics mask per-task failures.

**Files to modify:**
- `benchmarks/beta-final/run.mjs` — Report generation

**Implementation:**

Update report generation to always include:

```javascript
// Add to run.mjs after benchmark completes
function generateReport(results) {
  const report = {
    summary: {
      totalTasks: results.length,
      successfulTasks: results.filter(r => r.success).length,
      failedTasks: results.filter(r => !r.success).length,
    },
    // Per-task breakdown (always include)
    perTask: results.map(r => ({
      taskId: r.taskId,
      taskType: r.taskType,
      success: r.success,
      score: r.score,
      tokens: r.tokens,
      toolCalls: r.toolCalls,
      durationMs: r.durationMs,
      // Classification
      classification: classifyTask(r),
    })),
    // Correlation analysis
    correlation: {
      highTokenSavings: results.filter(r => r.tokenSavingsPercent > 50),
      accuracyLoss: results.filter(r => r.accuracyDelta < 0),
      // Example: "80% of tasks with >50% token savings show accuracy loss"
    },
    // Never hide failures behind aggregates
    aggregateWarning: results.some(r => !r.success)
      ? "⚠️ Some tasks failed. Aggregate metrics may be misleading. See per-task breakdown."
      : undefined,
  };
  return report;
}

function classifyTask(result) {
  if (!result.success) return "FAILED";
  if (result.accuracyDelta < 0) return "REGRESSION";
  if (result.tokenSavingsPercent > 50 && result.accuracyDelta >= 0) return "WIN";
  return "NEUTRAL";
}
```

**Expected result:** Leadership sees honest picture of tradeoffs; fixes target real problems.

**Test:**
- Re-run beta benchmark, generate new report format
- Verify report shows per-task breakdown and correlation analysis

---

## P1 Fixes — Important Before Beta

### Fix 9: Freshness Invalidation in Tool Loop
**Priority:** P1 | **Est. Time:** 1 day

**Problem:** Agent reads stale file via tool, uses stale line numbers, produces wrong code.

**File to modify:** `packages/sdk/src/context-tools/tool-loop.ts`

**Implementation:**

Add file-version tracking to `ToolUsingChatAgent`:

```typescript
private readonly fileVersions = new Map<string, string>();

// After successful read_file_range execution (in the tool execution section):
if (toolCall.function.name === "read_file_range" && result.ok) {
  const data = result.value as { path?: string; hash?: string; versionMatch?: boolean };
  if (data.path !== undefined && data.hash !== undefined) {
    const priorHash = this.fileVersions.get(data.path);
    if (priorHash !== undefined && priorHash !== data.hash) {
      // File changed since last read
      messages.push({
        role: "system",
        content: `[Freshness: File "${data.path}" changed since you last read it. Re-searching for current content...]`,
      });
    }
    this.fileVersions.set(data.path, data.hash);
  }
}
```

**Expected result:** Agent never uses stale content; debugging tasks produce correct fixes.

---

### Fix 10: Freshness Metadata in Tool Results
**Priority:** P1 | **Est. Time:** 0.5 days

**Problem:** Agent doesn't know if context is stale relative to working tree.

**File to modify:** `packages/mcp/src/handlers.ts`

**Implementation:**

Update all handlers to include freshness warnings in results:

```typescript
// Add to each handler's return object:
function addFreshnessWarning(result: Record<string, unknown>, freshness?: FreshnessSignal): void {
  if (freshness !== undefined && freshness.state !== "fresh") {
    result["_warning"] =
      `⚠️ This result is based on index from ${freshness.checkedAt}. ` +
      `Working tree may have changed. Run 'atlas update' to refresh.`;
  }
}
```

**Expected result:** Agent is aware of staleness and adjusts search accordingly.

---

### Fix 11: Per-Tool Latency Tracking
**Priority:** P1 | **Est. Time:** 0.5 days

**Problem:** Agent doesn't know which tools are slow.

**File to modify:** `packages/sdk/src/context-tools/tool-loop.ts`

**Implementation:**

Track tool execution time:

```typescript
// In the tool execution loop:
const startMs = Date.now();
const toolResult = await executeToolCall(this.toolSource, toolCall, maxResultChars);
const durationMs = Date.now() - startMs;

// Add latency info to result for slow tools
if (durationMs > 1000) {
  const resultObj = typeof toolResult === "string" ? JSON.parse(toolResult) : toolResult;
  resultObj["_latency"] = `${durationMs}ms — consider alternative approach`;
  toolResult = JSON.stringify(resultObj);
}
```

**Expected result:** Agent learns which tools are fast and prefers them.

---

### Fix 12: Context Versioning
**Priority:** P1 | **Est. Time:** 0.5 days

**Problem:** Context package format may change; no version negotiation.

**File to modify:** `packages/sdk/src/context-integration/models.ts`

**Implementation:**

```typescript
export interface ContextPackage {
  readonly apiVersion: "1.0";
  readonly task: string;
  readonly items: readonly ContextPackageItem[];
  readonly staleness: StaleContextSignal;
  readonly budget: BudgetRecord;
  readonly exclusions: ExclusionRecord;
}
```

**Expected result:** Future changes don't break agents unexpectedly.

---

### Fix 13: Timeout Policy Configuration
**Priority:** P1 | **Est. Time:** 1 day

**Problem:** Hard 3-minute timeout; some legitimate tasks take longer.

**Files to modify:**
- `packages/sdk/src/context-tools/types.ts` — Add timeout policies
- `packages/sdk/src/context-tools/tool-loop.ts` — Apply timeout policies

**Implementation:**

```typescript
export type TimeoutPolicy = "aggressive" | "balanced" | "permissive";

export const TIMEOUT_POLICIES: Record<TimeoutPolicy, { maxRounds: number; maxToolCalls: number }> = {
  aggressive: { maxRounds: 5, maxToolCalls: 5 },
  balanced: { maxRounds: 10, maxToolCalls: 10 },
  permissive: { maxRounds: 20, maxToolCalls: 20 },
};

// In ToolUsingChatAgent constructor, accept policy:
constructor(
  provider: ProviderPort,
  toolSource: ContextToolSource,
  providers: readonly string[] = ["ollama"],
  timeoutPolicy: TimeoutPolicy = "balanced",
  policy?: ToolCallPolicy,
) {
  const limits = TIMEOUT_POLICIES[timeoutPolicy];
  this.maxRounds = limits.maxRounds;
  // ...
}
```

**Expected result:** Legitimate debugging tasks don't timeout; exploration loops still caught.

---

## P2 Fixes — Post-Beta

### Fix 14: Vector/Semantic Search
**Priority:** P2 | **Est. Time:** 1 week

**Problem:** Lexical search misses conceptual matches.

**File to modify:** `packages/search/src/scoring.ts`

**Implementation:**
- Implement `VectorScorer` as alternative `RelevanceScorer`
- Use models like `sentence-transformers/all-MiniLM-L6-v2`
- Fallback to lexical if vectors unavailable

---

### Fix 15: Multi-Language Parser Support
**Priority:** P2 | **Est. Time:** 2 weeks

**Problem:** Parser only handles TypeScript.

**File to modify:** `packages/parser/src/parser.service.ts`

**Implementation:**
- Implement language-specific parsers (Python, Go, Java, Rust)
- Use existing libraries or parse from AST if available

---

### Fix 16: Agent Preference Learning
**Priority:** P2 | **Est. Time:** 1 week

**Problem:** Agent behavior is fixed; doesn't learn what strategies work best.

**Implementation:**
- Track which tool-use patterns lead to successful tasks
- After task completion, provide summary
- Store in session history for later reference

---

### Fix 17: Browser-Based Context Visualization
**Priority:** P2 | **Est. Time:** 2 weeks

**Problem:** Command-line context is hard to navigate.

**Implementation:**
- Build web UI for context exploration
- Interactive graph visualization of dependencies
- Live context preview as task is edited

---

### Fix 18: Distributed Indexing
**Priority:** P2 | **Est. Time:** 1 week

**Problem:** Indexing is single-threaded; huge repos take 5+ minutes.

**Implementation:**
- Use `worker_threads` for parallel parsing
- Each worker gets a subset of files
- Merge results into single graph

---

## Beta Readiness Criteria

**BETA READY when ALL of these are TRUE:**

1. ✅ **Accuracy ≥70%** (currently 43%; need +27pp improvement)
2. ✅ **Tool calls ≤16.5** (currently 18.3; need ≤ baseline + 2)
3. ✅ **No medium-repo token explosion** (≤2K context, ≤10K total from tools)
4. ✅ **Zero timeouts**
5. ✅ **No security regressions** (secret files never exposed)
6. ✅ **Benchmark honest** (per-task breakdown, no aggregate hiding)
7. ✅ **Tool descriptions guide behavior** (agents use tools strategically)
8. ✅ **Context quality is task-aware** (debugging includes error handlers)
9. ✅ **Documentation matches implementation** (no unimplemented claims)
10. ✅ **Stress test passes** (1000+ files generate <50K tokens)

---

## Implementation Order

| Phase | Fix | Priority | Est. Time | Cumulative |
|-------|-----|----------|-----------|------------|
| 1 | Agent Behavior Guidance (System Prompt + Tool Descriptions) | P0 | 1–2 days | 2 days |
| 2 | Repeated-Query Detection | P0 | 1 day | 3 days |
| 3 | Progress Detection | P0 | 1 day | 4 days |
| 4 | Per-Tool Call Limits | P0 | 1 day | 5 days |
| 5 | Security Deny-Filter | P0 | 1 day | 6 days |
| 6 | Context Budget Transparency | P0 | 1 day | 7 days |
| 7 | Task-Aware Context Ranking | P0 | 2 days | 9 days |
| 8 | Benchmark Methodology | P0 | 1 day | 10 days |
| 9 | Re-run Beta Benchmark | — | 0.5 days | 10.5 days |
| 10 | Freshness Invalidation | P1 | 1 day | 11.5 days |
| 11 | Freshness Metadata | P1 | 0.5 days | 12 days |
| 12 | Per-Tool Latency | P1 | 0.5 days | 12.5 days |
| 13 | Context Versioning | P1 | 0.5 days | 13 days |
| 14 | Timeout Policies | P1 | 1 day | 14 days |

**Total P0: ~10 days (critical path)**
**Total P1: ~3.5 days**
**Total to Beta Ready: ~2 weeks**

---

## Testing Strategy

### Unit Tests
- `packages/sdk/tests/context-tools.test.ts` — SearchMemory, per-tool limits, progress detection
- `packages/mcp/tests/handlers.test.ts` — Deny-filter enforcement
- `packages/context/tests/context-builder.test.ts` — Task-aware ranking

### Integration Tests
- Beta benchmark re-run with all P0 fixes
- Per-task accuracy verification
- Tool-call count verification (should drop from 18.3 → 8)
- Token usage verification (no explosions)

### Security Tests
- Adversarial agent trying to read `.env`, `secrets.json`, private keys
- All attempts should be denied with clear error messages

### Performance Tests
- Large monorepo (1000+ files) context generation
- Verify context stays under 50K tokens

---

## Verification Checklist

After implementing all P0 fixes, verify:

- [ ] Agent guidance message appears in tool loop output
- [ ] Tool descriptions are behavioral, not technical
- [ ] Repeated queries return cached results
- [ ] Progress detection triggers after 2 low-growth rounds
- [ ] Per-tool limits enforced (search_symbols ≤ 2, etc.)
- [ ] Security deny-filter blocks `.env*`, `secrets.json`, private keys
- [ ] Budget exceeded warning appears in rendered context
- [ ] Per-task metrics reported in benchmark
- [ ] Task-aware ranking boosts error handlers for debug tasks
- [ ] No timeouts on any benchmark task

---

*Remediation plan created: 2026-08-28*
*Based on: AUDIT_EXECUTIVE_SUMMARY.md + BETA_AUDIT_REMEDIATION_PLAN.md*
