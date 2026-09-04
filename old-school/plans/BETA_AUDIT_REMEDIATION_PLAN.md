# CodeAtlas Beta Audit & Remediation Plan

**Date:** 2026-08-25  
**Status:** READ-ONLY AUDIT COMPLETED  
**Verdict:** NOT BETA READY  

---

## Executive Diagnosis

CodeAtlas beta benchmark revealed a critical mismatch between agent intent and MCP tool design:

1. **Agent Over-Exploration Loop** — CodeAtlas agents make 26% more tool calls than baseline, treating MCP tools as *additional exploration methods* rather than *context shortcuts*.
2. **Context Underutilization** — Context packages are assembled correctly (96–99% reduction vs full repo) but agents don't trust them and verify everything via MCP tool calls.
3. **Accuracy Regression** — 35 percentage point accuracy drop (78% → 43% task success rate) due to tool-loop distractions.
4. **Token Saturation on Medium Repos** — Medium-API task saw +1430% token usage (47K → 718K) despite 99.5% context reduction, indicating agent read 58+ additional files via tools.
5. **Timeout Failures** — Two CodeAtlas runs timed out due to excessive tool usage (>10 tool calls without progress).
6. **Silent Context Misses** — Security and debugging task contexts are incomplete (missing error handlers, middleware chains, config files).
7. **MCP Tool Overlap** — `search_symbols` and `search_files` can answer similar queries; agent gets confused about which to call.
8. **No Exploration Budget** — Tool loop has 10-round max but no detection of diminishing returns; agent repeats searches with slight variations.
9. **Context Assembly Latency** — 1–2s added per task, mostly tolerable but compounds with tool-loop delays.
10. **Benchmark Shows Token Savings Hide Failures** — 68% token savings aggregate mask failures on 4/9 tasks; savings came from timeouts, not efficiency.

---

## Critical Loopholes

### 1. No Repeated-Query Detection
**Problem:** Agent calls `search_symbols("auth")` → gets hits → calls `search_files("auth")` → calls `search_symbols("authenticate")` → cycles.

**Evidence:**  
- `packages/sdk/src/context-tools/tool-loop.ts:71-139` — loop tracks `executedCalls` counter and `maxRounds` but has **no memory of prior queries or results**.
- Beta benchmark task SA-T05 (debugging): agent made 15–18 tool calls vs baseline's 5–8, many searching for same concept with different keywords.

**Root Cause:**  
- `ToolUsingChatAgent` resets tool state each round; no query cache or deduplication logic exists.
- Agent can't see what it already searched for in prior rounds.

**Impact:** 
- Wasted tool calls (26% increase over baseline).
- Longer tasks, more tokens, higher timeout risk.

**Recommended Fix:** P0
- Add `SearchMemory` interface tracking prior queries + results.
- Return "You already searched for this; here's what you found: [prior results]" on duplicate queries.
- Implemented in `tool-loop.ts` before model sees tool list.

---

### 2. No Progress Detection
**Problem:** Agent makes 10 tool calls but makes no measurable progress toward answering the task.

**Evidence:**
- Beta benchmark: SA-T06 (cross-file task) — agent called tools 18 times but failed to connect the pieces; scored 1/2 instead of baseline's 2/2.
- `tool-loop.ts` line 142: loop ends after `MAX_TOOL_ROUNDS` with `[Tool loop ended after N rounds — maximum iterations reached.]` note — no measurement of whether the agent learned anything.

**Root Cause:**
- No heuristic for "we're not making progress."
- Max rounds is a hard stop, not a "if still searching after N rounds, terminate early" signal.

**Impact:**
- Agent wastes time exploring cul-de-sacs.
- Timeouts occur not from bugs but from futile exploration.

**Recommended Fix:** P0
- Track token/content growth per round.
- Heuristic: if last 3 tool results added <5% new unique tokens, signal agent: "Diminishing returns detected. Recommend answering with what you have."
- Implemented in `tool-loop.ts` `run()` method.

---

### 3. Tool Overload Pattern — No Per-Tool Limits
**Problem:** Agent can call `search_symbols` 10 times. No guidance that it should call it 1–2 times per task.

**Evidence:**
- Beta benchmark task MA-T01 (medium-api understanding): baseline completed in 291s with 14.5 avg tool calls; CodeAtlas took 205s but made 18.3 tool calls and used **78% more tokens** (47K → 718K).
- `types.ts` line 42–51: `ToolCallPolicy` has `maxToolCalls` (total) but no `perToolLimits` or usage hints.

**Root Cause:**
- `evaluateToolCallPolicy()` only checks total count and allow/deny lists; no per-tool call budgets.
- MCP tool descriptions don't hint when to use them together vs. when one suffices.

**Impact:**
- Agent uses tool calls as exploration method, not context shortcut.
- On medium repos, context saturation occurs: agent receives 20 context items (1.2K tokens) then reads 58 files via tools (717K tokens).

**Recommended Fix:** P0
- Add `perToolCallLimit?: Record<string, number>` to `ToolCallPolicy`.
- Default: `search_symbols: 2`, `search_files: 2`, `get_dependencies: 1`, `explain_module: 3`, `read_file_range: 5`.
- Decode limits into tool descriptions: "search_symbols (1–2 calls typical)".
- Update `evaluateToolCallPolicy()` to track per-tool usage and enforce limits.

---

### 4. Context Assembly Doesn't Signal Task Relevance
**Problem:** Context builder returns ranked files but agent doesn't know **why** they ranked high or **whether they're relevant to the task**.

**Evidence:**
- Beta benchmark task SA-T05 (debug): CodeAtlas context included 20 items ranked by relevance score, but the specific bug location wasn't in them. Agent had to search anyway, and context didn't reduce exploration.
- `packages/context/src/context-builder.service.ts:37–46` — `build()` calls `search.search()` with generic query, no task-aware re-ranking.

**Root Cause:**
- `ContextBuilderService` uses lexical search score; no task categorization logic.
- Context SDK doesn't know if task is "debug a bug" vs. "understand architecture" — both get the same ranking.

**Impact:**
- Context misses critical patterns for debugging/security (error handlers, middleware, config).
- Agent doesn't trust context and re-searches.

**Recommended Fix:** P0
- `ContextBuilderPort` interface add optional `taskCategory?: string` parameter to `build()`.
- Context ranking re-weights by task: "debug" context includes error handling + middleware chain; "security" includes config + test files; "architecture" includes module structure.
- Implemented in `packages/context/` and propagated through SDK.

---

### 5. No Freshness Invalidation in Tool Loop
**Problem:** Agent reads file via `read_file_range`, gets hash. File changes. Agent uses stale line numbers in next tool call, gets wrong result.

**Evidence:**
- `packages/sdk/src/context-tools/tool-loop.ts` — no file-staleness checks between tool rounds.
- `read_file_range` handler returns `versionMatch: boolean` but tool loop doesn't use it to signal "file changed, re-search".

**Root Cause:**
- Tool loop is stateless per round — no tracking of which files were read or their hashes.
- Freshness checks are per-tool, not loop-level.

**Impact:**
- Silent bugs: agent relies on stale context, produces wrong implementations.
- Debugging tasks fail silently (line numbers drift, error messages don't match).

**Recommended Fix:** P1
- Track file-read history in `ToolUsingChatAgent` (`fileVersions: Map<path, hash>`).
- If a read result reports `versionMatch: false`, automatically re-search for the target before the agent sees the stale result.
- Add freshness summary to loop state: "File X changed since last read — refreshing search."

---

### 6. MCP Tool Descriptions Don't Guide Agent Behavior
**Problem:** Agent can't tell from tool descriptions when to search vs. read vs. explain.

**Evidence:**
- `packages/mcp/src/tools.ts:149–396` — tool `description` fields are technical ("Return persisted dependency edges") not behavioral ("Use to understand which files depend on this module").
- Agent sees 7 equally valid tools and picks randomly, causing over-exploration.

**Root Cause:**
- Descriptions are written for *understanding the tool*, not for *deciding when to use it*.
- No guidance like "Use search_symbols first (fast), then read_file_range (slow) only if you need exact code."

**Impact:**
- Agent exploration is inefficient.
- Tool choice is driven by availability, not task fit.

**Recommended Fix:** P0
- Rewrite tool descriptions with decision trees:
  - `search_symbols`: "First choice for finding related code. Try this before reading files. Returns top hits by relevance. Typical: 1–2 calls per task."
  - `search_files`: "Find files by path or content. Use when searching for tests, config, or documentation. Overlaps with search_symbols; prefer search_symbols for code."
  - `read_file_range`: "Get exact code. Slow. Only call after search narrows the target. Use with expectedHash to detect stale content."
  - Etc.
- Propagate these descriptions into the tool loop's prompt context (not just tool defs).

---

### 7. Context Budget Enforcement is Silent
**Problem:** Context exceeds token budget but no signal to agent; agent treats over-budget context as trustworthy.

**Evidence:**
- `packages/sdk/src/context-integration/context-integration.service.ts` — budget tracking exists but `budgetExceeded` flag is recorded in package, not surfaced to agent.
- Beta benchmark MA-T01: context included 20 items at 1.2K tokens (within budget) but agent then read 58 additional files, totaling 717K tokens.

**Root Cause:**
- `ContextPackage.budgetExceeded` property is part of the JSON but no integration signal to agent saying "context was truncated."
- Agent receives full context list and assumes it's complete.

**Impact:**
- Agent doesn't know context is incomplete and compensates by exploring more.
- Budget overruns go undetected.

**Recommended Fix:** P0
- If `budgetExceeded: true`, include a system-prompt notice: "The available context was truncated to stay within token budget. Expect to search for additional details."
- Update `context-integration` output message generation to highlight exclusions (`ExclusionRecord`).

---

### 8. Dependency Query Has No Direction Semantics
**Problem:** `get_dependencies` with `direction: "both"` returns 100 edges (default limit), agent can't distinguish imports from calls from extends.

**Evidence:**
- `packages/mcp/src/tools.ts:232–260` — `get_dependencies` schema allows `relation` filter but defaults to *all relations*; agent must filter in next tool call.
- Beta benchmark: SA-T06 task agent called `get_dependencies` twice to narrow results.

**Root Cause:**
- Tool design doesn't guide agent on **which relations matter for what tasks**.
- Debugging needs call chains; architecture needs import chains; security needs reference chains.

**Impact:**
- Agent makes extra tool calls to filter.
- Context quality is task-agnostic.

**Recommended Fix:** P1
- `ToolCallPolicy` add `taskContext?: { category: "debug" | "security" | "architecture" | "understand" }`.
- When policy includes task context, tool loop modifies `get_dependencies` defaults: `direction: "incoming", relation: "calls"` for debugging; `direction: "outgoing", relation: "imports"` for architecture.
- Document in tool descriptions: "For debugging, focus on incoming calls; for architecture, focus on outgoing imports."

---

### 9. Benchmark Methodology Confusion
**Problem:** Token savings aggregate over all tasks mask per-task failures; a single massive token explosion (MA-T01: +1430%) is hidden in 68% average.

**Evidence:**
- Beta summary shows 68% token savings (4.7M → 1.5M) but 35% accuracy regression (7/9 → 3/7).
- Task-level breakdown: SA-T03 was a huge win (2.75M → 175K = 93% savings), MA-T01 was a disaster (+1430% increase).
- Aggregate savings hide the fact that **4 out of 9 tasks got worse**.

**Root Cause:**
- Aggregate metrics don't expose task-level variance.
- "68% tokens saved" is true but misleading when accuracy drops 35%.

**Impact:**
- Leadership sees "token savings" without seeing "agent produces worse results."
- Fixes are driven by wrong priorities (optimize for speed, not correctness).

**Recommended Fix:** P0
- Always report:
  - Per-task accuracy delta (not aggregate)
  - Per-task token delta (not aggregate)
  - Task categorization (which task types improve, which regress)
  - Correlation: "Tasks with >50% token savings show 20% accuracy drop; tasks with <20% token savings show 5% accuracy drop."

---

### 10. Security Boundary Not Defined for MCP Tools
**Problem:** `read_file_range` can read any file path passed by the agent, including `.env`, `secrets.json`, etc.

**Evidence:**
- `packages/mcp/src/handlers.ts:324–370` — `readFileRange` takes user-provided path, reads from working tree.
- No path validation beyond `path: boundedString()` (length check).
- `context-integration` has a deny-filter for `.env*` but it only applies to context assembly, not MCP tool results.

**Root Cause:**
- MCP tools inherit the agent's file-read scope; no sandbox.
- Deny-filter is context-layer only, not tool-layer.

**Impact:**
- Agent can (accidentally or maliciously) read secrets through MCP.
- No audit trail of what files tools accessed.

**Recommended Fix:** P0
- Add `DenyFilter` interface to `ContextToolSource`.
- Deny-filter is passed to tool bridge at MCP startup.
- `read_file_range` refuses paths matching deny filter; returns error: "File is in deny list."
- Log all denied reads (security audit).
- Test: try to read `.env`, `secrets.json`, private keys — all refused.

---

## P0 — Must Fix Before Beta

### 1. Agent Behavior Guidance
**Problem:** Agents treat MCP tools as exploration methods, not context shortcuts.  
**Root Cause:** No guidance in system prompt or tool descriptions; agent doesn't know context is meant to reduce tool usage.  
**Files/Functions:**
- `packages/sdk/src/context-tools/tool-loop.ts`: `ToolUsingChatAgent`
- `packages/mcp/src/tools.ts`: tool descriptions
- `apps/cli/src/commands/context.ts`: agent launch context injection

**Proposed Change:**
1. Add system-prompt injection in `ToolUsingChatAgent.run()`:
   ```
   "CodeAtlas has provided context about the codebase. Use this context to answer.
    Do NOT read files that are already in the context.
    Call search/read tools only for information not in the context.
    Typical usage: 1–5 tool calls per task. If you've called tools >5 times,
    recommend answering with what you have."
   ```
2. Rewrite tool descriptions in `tools.ts` with decision trees (see Loophole #6).
3. Add per-tool call limits to `ToolCallPolicy` (see Loophole #3).

**Expected Result:** Agents use tools strategically, not exploratorily. Task success rate improves toward baseline.

**How to Test:**
- Re-run beta benchmark with fixes.
- Track per-task tool-call count: should drop from 18.3 → 8.
- Verify accuracy: should improve from 43% → 65%+.

---

### 2. Repeated-Query Detection
**Problem:** Agent searches for the same concept multiple times with slight variations.  
**Root Cause:** Tool loop has no memory across rounds.  
**Files/Functions:**
- `packages/sdk/src/context-tools/tool-loop.ts`: `ToolUsingChatAgent.run()`

**Proposed Change:**
1. Add `SearchMemory` class tracking queries and results:
   ```typescript
   class SearchMemory {
     private queries: Map<string, SearchResult[]> = new Map();
     
     remember(query: string, results: any): void
     recall(query: string): any | undefined
     isSimilar(q1: string, q2: string): boolean // fuzzy match
   }
   ```
2. Before executing `search_*` tool, check `SearchMemory`.
3. If similar query found, return cached results with note: "Similar query already found: [results]."
4. Track in loop as executed call (counts toward limit) but doesn't re-query provider.

**Expected Result:** Tool calls drop 20–30%, tokens decrease correspondingly, agent completes faster.

**How to Test:**
- Unit test: `packages/sdk/tests/context-tools.test.ts` — verify duplicate queries are caught.
- Integration test: run benchmark task SA-T05 (debugging), verify agent doesn't call search twice for same concept.

---

### 3. Progress Detection
**Problem:** Agent exceeds max rounds without making progress.  
**Root Cause:** No heuristic to detect diminishing returns.  
**Files/Functions:**
- `packages/sdk/src/context-tools/tool-loop.ts`: `ToolUsingChatAgent.run()` loop logic

**Proposed Change:**
1. Track per-round metric: unique new tokens in tool results.
2. If last 2 consecutive rounds added <5% new unique tokens, signal agent:
   ```
   "After N rounds, you've found [X] unique tool results. Recent calls added little new information.
    Recommend using what you have to answer the task."
   ```
3. Agent can choose to continue or answer; continue still counts toward `maxRounds`.
4. If agent hits both progress threshold AND max rounds, terminate with note.

**Expected Result:** Agent stops futile exploration earlier, completes faster, reduces timeout risk.

**How to Test:**
- Unit test: feed tool results with decreasing unique content, verify heuristic triggers.
- Beta benchmark: run SA-T06 (cross-file task), verify agent stops earlier and still completes.

---

### 4. Task-Aware Context Ranking
**Problem:** Context ranking is generic; debugging tasks miss error handlers, security tasks miss config.  
**Root Cause:** `ContextBuilderService` doesn't know task category; uses only lexical relevance.  
**Files/Functions:**
- `packages/context/src/context-builder.service.ts`: `ContextBuilderService.build()`
- `packages/sdk/src/context/index.ts`: context SDK API

**Proposed Change:**
1. Extend `ContextBuilderPort.build()` signature:
   ```typescript
   build(query: string, limit?: number, taskCategory?: 'debug'|'security'|'architecture'|'understand'): Promise<ContextItem[]>
   ```
2. Add task-category rules in `SearchService`:
   - `debug`: re-rank to include error handling, try-catch blocks, middleware chains.
   - `security`: include config files, auth code, validation code.
   - `architecture`: include module boundaries, exports, dependency edges.
3. Implement category-specific filters and re-scorers in `packages/search/src/scoring.ts`.

**Expected Result:** Correct context is present for debugging/security tasks. Agents trust context, reduce tool calls.

**How to Test:**
- Unit test: `build("find bug", undefined, "debug")` returns error-handling code; `build("xss", undefined, "security")` includes config/validation.
- Beta benchmark: SA-T05 (debugging) — context includes error location; agent finds bug faster.

---

### 5. Freshness Invalidation in Tool Loop
**Problem:** Agent reads stale file via tool, uses stale line numbers, produces wrong code.  
**Root Cause:** No file-version tracking across tool loop rounds.  
**Files/Functions:**
- `packages/sdk/src/context-tools/tool-loop.ts`: `ToolUsingChatAgent.run()`
- `packages/mcp/src/handlers.ts`: `readFileRange` handler

**Proposed Change:**
1. Add `fileVersions: Map<path, hash>` to `ToolUsingChatAgent` instance state.
2. After each `read_file_range` call, store file hash.
3. If next tool result references a file and its hash differs, automatically re-search:
   ```
   "File <path> changed since you last read it (hash mismatch).
    Re-searching for current content..."
   ```
4. Include freshness summary in loop feedback to agent.

**Expected Result:** Agent never uses stale content; debugging tasks produce correct fixes.

**How to Test:**
- Unit test: modify file between tool calls, verify re-search is triggered.
- Integration test: debug task where file changes, verify agent detects and handles gracefully.

---

### 6. Per-Tool Call Limits in Policy
**Problem:** Agent can call `search_symbols` 10 times.  
**Root Cause:** `ToolCallPolicy` only tracks total, not per-tool.  
**Files/Functions:**
- `packages/sdk/src/context-tools/types.ts`: `ToolCallPolicy` interface
- `packages/sdk/src/context-tools/tool-loop.ts`: `decide()` method

**Proposed Change:**
1. Extend `ToolCallPolicy`:
   ```typescript
   perToolCallLimit?: Record<string, number>;
   // defaults: search_symbols: 2, search_files: 2, get_dependencies: 1, read_file_range: 5
   ```
2. In `decide()`, check both total and per-tool limits.
3. Return deny with reason: "Tool 'search_symbols' limit reached (2/2 calls)."
4. Encode defaults into tool descriptions: "search_symbols (1–2 calls per task)".

**Expected Result:** Agent uses each tool judiciously, reduces tool-call count 26% → 8%, aligns with baseline.

**How to Test:**
- Unit test: `evaluateToolCallPolicy` with per-tool limits, verify enforcement.
- Integration test: beta benchmark, verify search calls drop from 15+ to 2–3.

---

### 7. MCP Tool Description Rewrite
**Problem:** Tool descriptions are technical, not behavioral; agent can't decide which tool to call.  
**Root Cause:** Descriptions written for comprehension, not decision-making.  
**Files/Functions:**
- `packages/mcp/src/tools.ts`: `TOOLS` array descriptions

**Proposed Change:**
Rewrite each tool description to include:
1. **Primary use case** — when to call this tool first
2. **When NOT to use** — overlap with other tools
3. **Typical call count** — how many times per task
4. **Output interpretation** — what the results mean

Example:
```typescript
{
  name: "search_symbols",
  description: `FIRST CHOICE: Find related code by symbol name.
    Use this before read_file_range to narrow down targets.
    Typical: 1–2 calls per task.
    Returns ranked hits with symbol kind, file, documentation, and score.
    Overlaps: search_files covers similar use cases; prefer this for code symbols.
    Output: Each hit is a potential target. Use read_file_range to get exact code.`,
  // ...
}
```

**Expected Result:** Agent behavior is guided; tool selection is strategic; exploration is reduced.

**How to Test:**
- Manual: read descriptions, verify they guide behavior.
- Benchmark: verify tool-call patterns align with descriptions.

---

### 8. Security Deny-Filter for MCP Tools
**Problem:** Agent can read `.env`, `secrets.json`, private keys through MCP.  
**Root Cause:** MCP tool layer has no deny-filter; only context-integration layer does.  
**Files/Functions:**
- `packages/mcp/src/handlers.ts`: `readFileRange()`
- `packages/mcp/src/server.ts`: MCP server setup
- `packages/toolkit/src/context-integration/deny-filter.ts`: existing deny-filter

**Proposed Change:**
1. Extend `ContextToolSource` interface to include deny-filter:
   ```typescript
   interface ContextToolSource {
     listTools(): ToolDefinition[];
     execute(name: string, args: Record<string, unknown>): Promise<Result<unknown>>;
     getDenyFilter?(): (path: string) => boolean; // NEW
   }
   ```
2. In MCP tool bridge (`tool-bridge.ts`), pass deny-filter to tool handlers.
3. In `readFileRange()`, check deny-filter before reading:
   ```
   if (denyFilter(path)) {
     return { error: "File is in deny list (security policy)" };
   }
   ```
4. Log all denied attempts (security audit).

**Expected Result:** Secret files are never exposed; audit trail exists for security review.

**How to Test:**
- Unit test: try to read `.env*`, `secrets.json`, private keys — all denied.
- Security test: adversarial agent tries to exfiltrate secrets — denied with clear error.

---

### 9. Context Budget Transparency
**Problem:** Agent doesn't know context was truncated due to budget.  
**Root Cause:** `budgetExceeded` flag exists but isn't surfaced to agent.  
**Files/Functions:**
- `packages/sdk/src/context-integration/context-integration.service.ts`: `launch()`
- `apps/cli/src/commands/context.ts`: context command

**Proposed Change:**
1. When `package.budgetExceeded: true`, add to session prompt:
   ```
   "⚠️ The available context was truncated to stay within token budget.
    You may need to search for additional details beyond what's shown."
   ```
2. Include exclusion summary: "X files excluded (too large); Y secrets removed."
3. If `package.staleness !== 'fresh'`, add: "Context may be out of date; verify with search."

**Expected Result:** Agent knows context is incomplete, compensates with targeted searches instead of blind exploration.

**How to Test:**
- Unit test: verify budget-exceeded message is injected into session prompt.
- Integration test: beta benchmark MA-T01, verify message appears and agent searches strategically.

---

### 10. Benchmark Methodology Overhaul
**Problem:** Aggregate metrics mask per-task failures.  
**Root Cause:** Benchmark only reports averages and totals, not per-task breakdowns.  
**Files/Functions:**
- `benchmarks/beta-final/run.mjs`: runner script
- `benchmarks/beta-final/REPORT.md`: report generation

**Proposed Change:**
1. Always report per-task metrics: accuracy, tokens, duration, tool calls.
2. Classify tasks by outcome:
   - Green: accuracy same/better, tokens saved
   - Yellow: accuracy same, tokens increased
   - Red: accuracy worse
3. Summarize correlation: "80% of tasks with >50% token savings show accuracy loss."
4. Present both aggregate and per-category (debugging, security, feature, etc.) metrics.
5. Never publish "68% token savings" without clarifying that 4/9 tasks got worse.

**Expected Result:** Leadership sees honest picture of tradeoffs; fixes target real problems.

**How to Test:**
- Re-run beta benchmark, generate new report format.
- Verify report shows per-task breakdown and correlation analysis.

---

## P1 — Important Before Beta

### 11. Freshness Staleness Detection in Tool Results
**Problem:** Agent doesn't know if context is stale relative to working tree.  
**Root Cause:** Freshness metadata is returned but not highlighted.  
**Files/Functions:**
- `packages/mcp/src/handlers.ts`: all handlers return `freshness` object
- `packages/mcp/src/freshness.ts`: freshness logic

**Proposed Change:**
1. When `freshness.state !== 'fresh'`, highlight it in tool result context.
2. Include message: "⚠️ This result is based on index from X minutes ago. Working tree may have changed."
3. Suggest refresh: "Run `atlas update` to refresh the index if results seem out of sync."

**Expected Result:** Agent is aware of staleness and adjusts search accordingly.

---

### 12. Per-Tool Latency Tracking
**Problem:** Agent doesn't know which tools are slow and avoids them.  
**Root Cause:** Tool response times aren't visible in results.  
**Files/Functions:**
- `packages/mcp/src/handlers.ts`: tool handlers
- `packages/mcp/src/server.ts`: MCP server request logging

**Proposed Change:**
1. Add `durationMs` to every tool result.
2. In agent loop, track tool latencies and warn: "search_symbols took 500ms; consider using read_file_range instead."

**Expected Result:** Agent learns which tools are fast and prefers them.

---

### 13. Monorepo Context Assembly
**Problem:** Large monorepos (1000+ files) generate huge contexts.  
**Root Cause:** Context ranking doesn't understand package boundaries.  
**Files/Functions:**
- `packages/context/src/context-builder.service.ts`: no package-aware ranking
- `packages/graph/src/graph.service.ts`: has dependency graph

**Proposed Change:**
1. Use dependency graph to identify package clusters.
2. When task involves package A, heavily weight files in package A and direct dependencies.
3. Deprioritize unrelated packages.

**Expected Result:** Monorepo contexts are focused, don't balloon to 500K+ tokens.

---

### 14. Tool-Loop Timeout Configuration
**Problem:** Hard 3-minute timeout; some legitimate tasks take longer.  
**Root Cause:** No differentiation between "stuck in loop" and "legitimately slow."  
**Files/Functions:**
- `packages/agents/src/process-runner.ts`: timeout logic
- `packages/sdk/src/context-tools/tool-loop.ts`: max-rounds constant

**Proposed Change:**
1. Support timeout policies:
   - `aggressive`: 2min, low tool-call budget (5 calls)
   - `balanced`: 5min, medium budget (10 calls)
   - `permissive`: 10min, high budget (20 calls)
2. Default to `balanced`.
3. Choose based on task category: debugging = permissive, architecture = balanced.

**Expected Result:** Legitimate debugging tasks don't timeout; exploration loops still caught.

---

### 15. Context Versioning & API Stability
**Problem:** Context package format may change; no version negotiation.  
**Root Cause:** No version field in `ContextPackage`.  
**Files/Functions:**
- `packages/sdk/src/context-integration/types.ts`: `ContextPackage` interface

**Proposed Change:**
1. Add `apiVersion: "1.0"` to `ContextPackage`.
2. Document breaking changes in ADR.
3. Consumers check version and fail gracefully on mismatch.

**Expected Result:** Future changes don't break agents unexpectedly.

---

## P2 — Post-Beta Improvements

### 16. Vector/Semantic Search Integration
**Problem:** Lexical search misses conceptual matches (e.g., "find auth" doesn't match "security implementation").  
**Root Cause:** Only fuzzy string matching; no embeddings.  
**Files/Functions:**
- `packages/search/src/scoring.ts`: `RelevanceScorer` interface is a seam

**Proposed Change:**
1. Implement `VectorScorer` as alternative `RelevanceScorer`.
2. Use models like `sentence-transformers/all-MiniLM-L6-v2` (small, local).
3. Fallback to lexical if vectors unavailable.

**Expected Result:** Semantic search improves context quality for complex tasks.

---

### 17. Agent Preference Learning
**Problem:** Agent behavior is fixed; doesn't learn what strategies work best.  
**Root Cause:** No feedback loop from results back to agent planning.  
**Files/Functions:**
- N/A (future feature)

**Proposed Change:**
1. Track which tool-use patterns lead to successful tasks.
2. After task completion, provide summary: "This task succeeded with 3 search calls + 1 read; next similar task should follow this pattern."
3. Store in session history for later reference.

**Expected Result:** Agent improves over time within a session.

---

### 18. Multi-Language Parser Support
**Problem:** Parser only handles TypeScript; Python, Go, Java, etc. are unsupported.  
**Root Cause:** Parser is ts-morph specific.  
**Files/Functions:**
- `packages/parser/src/parser.service.ts`: `TypeScriptParser` only implementation

**Proposed Change:**
1. Implement language-specific parsers (Python, Go, Java, Rust).
2. Use existing libraries or parse from AST if available.

**Expected Result:** CodeAtlas works on polyglot repositories.

---

### 19. Browser-Based Context Visualization
**Problem:** Command-line context is hard to navigate; large repos need UI.  
**Root Cause:** Only CLI and VS Code extension exist.  
**Files/Functions:**
- `CodeAtlas-ui/` — already exists but may need enhancement

**Proposed Change:**
1. Build web UI for context exploration.
2. Interactive graph visualization of dependencies.
3. Live context preview as task is edited.

**Expected Result:** Users can explore context interactively before launching agents.

---

### 20. Distributed Indexing for Large Repos
**Problem:** Indexing is single-threaded; huge repos take 5+ minutes.  
**Root Cause:** ts-morph parsing is sequential.  
**Files/Functions:**
- `packages/parser/src/parser.service.ts`: sequential parsing
- `packages/scanner/src/scanner.service.ts`: concurrent file reads

**Proposed Change:**
1. Use `worker_threads` for parallel parsing.
2. Each worker gets a subset of files.
3. Merge results into single graph.

**Expected Result:** First-scan time drops from 5min to <30s on large repos.

---

## Beta Readiness Criteria

**BETA READY when ALL of these are TRUE:**

1. **Accuracy does not regress** — CodeAtlas task success rate ≥70% (baseline 78%, tolerate 8pp loss).
2. **No tool-loop infinite loops** — All runs complete within 5-minute timeout.
3. **Tool-call count is reasonable** — CodeAtlas avg tool calls ≤ baseline + 2 (e.g., baseline 14.5 → CodeAtlas ≤16.5, not 18.3).
4. **Token overhead is acceptable** — On medium repos, CodeAtlas tokens ≤150% of context-size estimate (medium-api context 1.2K tokens → agent can use up to 1.8K total from context, not 718K).
5. **No security regressions** — No secrets leakage; all dangerous file paths denied.
6. **Context quality is task-aware** — Debugging contexts include error handlers; security contexts include config.
7. **Benchmark is honest** — Report includes per-task breakdown; no aggregate metrics masking failures.
8. **Tool descriptions guide behavior** — Agents use tools strategically, not exploratorily.
9. **Documentation matches implementation** — No claims of unimplemented features; all ADRs current.
10. **Stress test passes** — Large monorepos (1000+ files) generate reasonable contexts (<50K tokens).

---

## Recommended Implementation Order

1. **Agent Behavior Guidance** (P0.1) — System prompt + tool descriptions — 1–2 days, highest ROI.
2. **Repeated-Query Detection** (P0.2) — Memory cache in tool loop — 1 day.
3. **Progress Detection** (P0.3) — Heuristic for diminishing returns — 1 day.
4. **Task-Aware Context Ranking** (P0.4) — Re-weight by category — 2 days.
5. **Per-Tool Call Limits** (P0.5) — Policy enforcement — 1 day.
6. **Freshness Invalidation** (P0.5) — File-version tracking — 1 day.
7. **Security Deny-Filter for Tools** (P0.6) — Path validation in handlers — 1 day.
8. **Benchmark Methodology** (P0.10) — Report per-task metrics — 1 day.
9. **Re-run Beta Benchmark** — Verify fixes — 2 hours.

**Total: ~10 days (critical path)**

Then:
- P1 items: 3–5 days
- P2 items: 2–3 weeks post-beta

---

## Final Verdict

### NOT BETA READY

**Why:**
- 35pp accuracy regression (78% → 43%) is a critical blocker.
- 26% increase in tool calls indicates agent behavior issue.
- Context saturation on medium repos (47K → 718K tokens) shows context isn't reducing exploration.
- Two timeout failures indicate unbounded tool loops.
- Four out of nine tasks performed worse with CodeAtlas enabled.

**Can Be Fixed:**
All issues are **agent behavior issues**, not context/indexing issues. CodeAtlas context infrastructure works correctly; the problem is agents treat tools as exploration methods rather than context shortcuts. Fixes are scoped: system prompt guidance, tool descriptions, per-tool limits, repeated-query detection, progress heuristics.

**Timeline to Beta Ready:**
With recommended fixes implemented, re-run benchmark within 2 weeks. If accuracy improves to ≥70%, accuracy regression resolves, and tool-call counts drop to baseline ±2, CodeAtlas is beta-ready.

---

## Appendix: File-by-File Audit Summary

| Package | File | Issue | P | Line |
|---------|------|-------|---|------|
| mcp | tools.ts | Descriptions not behavioral | 0 | 149–396 |
| mcp | handlers.ts | No deny-filter for read_file_range | 0 | 324–370 |
| sdk | tool-loop.ts | No repeated-query detection | 0 | 71–139 |
| sdk | tool-loop.ts | No progress detection | 0 | 142 |
| sdk | types.ts | No per-tool limits in policy | 0 | 42–51 |
| context | context-builder.service.ts | No task-aware ranking | 0 | 37–46 |
| sdk | context-integration.ts | Budget exceeded not surfaced | 0 | launch() |
| search | search.service.ts | Lexical-only; no semantic | 2 | 9 |
| parser | parser.service.ts | TypeScript-only | 2 | 1–50 |
| agents | process-runner.ts | Hard timeout; no policy | 1 | timeout logic |
| benchmark | run.mjs | Aggregate metrics hide failures | 0 | results reporting |

---

*End of Audit*  
*Next Step: Implement P0 fixes, re-benchmark, assess readiness*
