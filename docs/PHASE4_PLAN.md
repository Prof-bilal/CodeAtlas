# Phase 4 — `atlas benchmark` Implementation Plan

> **Status:** All tasks completed. This document is a historical reference.
> Canonical status: `docs/CURRENT_STATE.md` § Benchmark Framework.
> Decision record: `docs/decisions/ADR-012-benchmark-framework.md`.

## Context

CodeAtlas has **four independent benchmark harnesses** that are fragmented and hard to maintain:
- `tests/benchmarks/mcp-benchmark.ts` — in-process MCP performance
- `benchmarks/run-benchmark.ts` — multi-repo CLI-based scan/search
- `benchmarks/run-single.ts` — single-repo runner
- `benchmarks/final-2026-08/` — the most sophisticated: real agent (opencode) vs baseline, with token/cost/accuracy evaluation

The goal is to consolidate these into a single `atlas benchmark` command with `init/run/status/report` subcommands, living in a new `@atlas/benchmark` package behind a `BenchmarkPort` in core.

## Architecture

```
packages/core/src/ports/benchmark.port.ts   ← Port contract
packages/benchmark/src/                     ← Implementation
  benchmark.service.ts                      ← BenchmarkPort impl
  runner/
    opencode.ts                             ← opencode CLI runner
    ollama.ts                               ← Ollama direct runner (Phase 3 ToolUsingChatAgent)
  evaluator.ts                              ← Automated scoring (file/concept hits)
  reporter.ts                               ← Markdown report generation
  store.ts                                  ← JSON persistence (.codeatlas/benchmarks/)
packages/sdk/src/benchmark/index.ts          ← SDK composition (createBenchmarkService)
apps/cli/src/commands/benchmark.ts           ← CLI command
```

### Dependency direction (respected):
```
cli → sdk → @atlas/benchmark → core (+ shared)
                                ↑
                          @atlas/usage (metrics)
                          @atlas/agents (process spawning)
                          @atlas/sdk (context assembly, tool loop)
```

## Tasks

### Task 1: `BenchmarkPort` in core
**File:** `packages/core/src/ports/benchmark.port.ts`

Define the contract:
```typescript
interface BenchmarkPort {
  // Lifecycle
  initSuite(config: BenchmarkConfig): Promise<Result<BenchmarkSuite>>
  loadSuite(suiteId: string): Promise<Result<BenchmarkSuite>>
  listSuites(): Promise<Result<BenchmarkSuite[]>>
  
  // Execution
  runTask(request: BenchmarkRunRequest): Promise<Result<BenchmarkTaskResult>>
  runSuite(request: BenchmarkSuiteRunRequest): Promise<Result<BenchmarkSuiteResult>>
  
 // Status
  getStatus(suiteId: string): Promise<Result<BenchmarkStatus>>
  
  // Reporting
  generateReport(suiteId: string, options?: ReportOptions): Promise<Result<BenchmarkReport>>
  
  // Cleanup
  close(): void
}
```

Key types:
- `BenchmarkConfig` — agent, model, modes, repositories, task file path
- `BenchmarkSuite` — config + metadata (created timestamp, status)
- `BenchmarkRunRequest` — suiteId, taskId, mode (`baseline` | `codeatlas`), timeout
- `BenchmarkTaskResult` — task metrics (tokens, cost, latency, accuracy, tool calls)
- `BenchmarkSuiteResult` — aggregate across tasks
- `BenchmarkStatus` — suite progress (completed/total tasks, current state)
- `BenchmarkReport` — Markdown content + metadata
- `ReportOptions` — format (`markdown` | `json`), sections to include

Export from `packages/core/src/index.ts`.

### Task 2: `@atlas/benchmark` package scaffold
**New package:** `packages/benchmark/`

- `package.json` with deps: `@atlas/core`, `@atlas/shared`, `@atlas/usage`, `@atlas/agents`, `@atlas/sdk`
- `tsconfig.json` following existing package patterns
- `src/index.ts` barrel export

### Task 3: JSON store for benchmark data
**File:** `packages/benchmark/src/store.ts`

Persists benchmark data as JSON files in `.codeatlas/benchmarks/`:
```
.codeatlas/benchmarks/
  suites/<suite-id>.json          ← BenchmarkSuite metadata
  suites/<suite-id>/tasks/<task-id>-<mode>.json  ← per-task results
  suites/<suite-id>/raw-results.json              ← aggregated raw results
  suites/<suite-id>/report.md                     ← generated report
```

Functions:
- `saveSuite(suite)` / `loadSuite(suiteId)` / `listSuites()`
- `saveTaskResult(suiteId, result)` / `loadTaskResult(suiteId, taskId, mode)`
- `saveRawResults(suiteId, raw)` / `loadRawResults(suiteId)`
- `saveReport(suiteId, report)` / `loadReport(suiteId)`

### Task 4: Declarative task format + init scaffolder
**File:** `packages/benchmark/src/scaffold.ts`

The task format reuses the existing JSON schema from `benchmarks/final-2026-08/tasks/`:
```json
{
  "repository": "repo-01",
  "name": "winston",
  "version": "3.19.0",
  "files": 116,
  "tasks": [
    {
      "id": "R1-T01",
      "category": "repository-understanding",
      "prompt": "...",
      "expected_files": [...],
      "expected_concepts": [...],
      "evaluation_method": "..."
    }
  ]
}
```

`init` scaffolder:
- Creates `.codeatlas/benchmarks/` directory structure
- Generates a default `benchmark.json` config file with agent/model/modes settings
- Optionally generates a starter task file from a template
- Supports `--agent opencode|ollama`, `--model <model>`, `--repo <path>`

### Task 5: OpenCode runner
**File:** `packages/benchmark/src/runner/opencode.ts`

Spawns `opencode run --format json` as a child process (via `@atlas/agents` `ProcessRunner`):
- Writes per-repo `opencode.json` to enable/disable MCP
- Parses `step_finish` events for token/cost/latency
- Parses `tool_use` events for tool call tracking
- Parses `text` events for final answer capture
- Timeout enforcement via ProcessRunner
- Returns `BenchmarkRunMetrics` (tokens, cost, duration, tool calls, tool errors)

Pattern: reuse `parseRunEvents()` logic from `run-benchmark.mjs` (lines 281-332).

### Task 6: Ollama runner
**File:** `packages/benchmark/src/runner/ollama.ts`

Uses `ToolUsingChatAgent` (from Phase 3) directly — no child process:
- Constructs `ChatAgentRequest` with the task prompt + tool definitions
- The tool loop runs automatically via `ToolUsingChatAgent.run()`
- Captures token usage from `ProviderResponse.usage`
- Captures tool calls and results from the message history
- Timeout via provider adapter timeout config
- Returns same `BenchmarkRunMetrics` interface as the opencode runner

### Task 7: Automated evaluator
**File:** `packages/benchmark/src/evaluator.ts`

Ported from `run-benchmark.mjs` lines 383-685:
- `evaluateTask(task, finalText, toolCalls, repoPath)` — computes:
  - `fileRatio` = files found / files expected
  - `conceptRatio` = concepts found / concepts expected
  - `score` (0/1/2) based on thresholds (>=0.5 → 2, >=0.2 → 1, else 0)
  - `status` ("correct" | "partially_correct" | "incorrect" | "failed")
  - `citedFiles` — paths cited by the agent that actually exist in the repo
- `fileHits(expectedFiles, haystack)` — matches file basenames in text
- `conceptHits(concepts, finalText)` — normalized substring matching
- `citedPaths(text, repoPath)` — regex extraction + existence verification

### Task 8: Metrics capture via `@atlas/usage`
**File:** `packages/benchmark/src/metrics.ts`

Integrates with the existing metrics infrastructure:
- After each task run, calls `MetricsPort.recordTokenEstimate()` with benchmark-specific data
- Records benchmark-specific events: `recordBenchmarkRun({ suiteId, taskId, mode, tokens, cost, latency, accuracy })`
- Extends `UsagePort` recording with benchmark task context (`taskId`, `taskRef`)
- Provides aggregate statistics: token savings (baseline vs codeatlas), cost savings, accuracy delta

### Task 9: Markdown report generator
**File:** `packages/benchmark/src/reporter.ts`

Ported from `generate-reports.mjs` (625 lines):
- `renderRepoReport(raw, tasksDef, config, env)` — per-repository Markdown:
  - Environment snapshot (CPU, RAM, OS, tool versions)
  - Indexing performance
  - Task results table (category, score, tokens, cost, latency)
  - Token/cost/accuracy analysis
  - Context assembly analysis
- `renderSummary(allRaw, config)` — cross-repository comparison:
  - Aggregate token/cost/accuracy tables
  - Scaling analysis by repo size
  - Final verdict
- `renderFailures(allRaw)` — failure log for tasks with score=0 or status="failed"

### Task 10: Benchmark service implementation
**File:** `packages/benchmark/src/benchmark.service.ts`

Implements `BenchmarkPort`:
- `initSuite()` — validates config, creates suite metadata, persists
- `runTask()` — loads suite, finds task, runs through appropriate runner (opencode/ollama), evaluates, persists result
- `runSuite()` — iterates all tasks in both modes, runs each, aggregates
- `getStatus()` — reads persisted results, computes progress
- `generateReport()` — calls reporter, persists report

### Task 11: SDK composition
**File:** `packages/sdk/src/benchmark/index.ts`

```typescript
export function createBenchmarkService(options?: BenchmarkServiceOptions): BenchmarkPort
```

Wires: `BenchmarkService` + `UsageStore` + `MetricsService` + `PricingSource`

### Task 12: CLI command
**File:** `apps/cli/src/commands/benchmark.ts`

```
atlas benchmark init [--agent opencode|ollama] [--model <model>] [--repo <path>]
atlas benchmark run <suite-id> [--task <task-id>] [--mode baseline|codeatlas|both] [--force]
atlas benchmark status <suite-id>
atlas benchmark report <suite-id> [--json] [--format markdown|json]
```

Pattern: follows `metrics.ts` structure with `registerBenchmark(program)`.

### Task 13: Register command in CLI
**File:** `apps/cli/src/commands/index.ts`

Add `registerBenchmark(program)` to the command registry.

### Task 14: Tests
- `packages/benchmark/tests/evaluator.test.ts` — evaluator scoring logic
- `packages/benchmark/tests/store.test.ts` — JSON persistence
- `packages/benchmark/tests/reporter.test.ts` — Markdown generation
- `packages/benchmark/tests/benchmark.service.test.ts` — integration tests with mock runners
- `packages/sdk/tests/benchmark.test.ts` — SDK composition
- `apps/cli/tests/cli.test.ts` — add benchmark subcommand tests

### Task 15: Docs + status updates
- Update `docs/CURRENT_STATE.md` — add benchmark section
- Update `docs/FEATURE_STATUS.md` — mark benchmark as implemented
- Update `docs/MODULES.md` — add `@atlas/benchmark` ownership
- Create `docs/decisions/ADR-012-benchmark.md` — architecture decision record

## Acceptance Criteria
- [ ] `atlas benchmark init` scaffolds a benchmark suite
- [ ] `atlas benchmark run <suite-id>` runs all tasks in both modes
- [ ] `atlas benchmark status <suite-id>` shows progress
- [ ] `atlas benchmark report <suite-id>` generates Markdown
- [ ] OpenCode runner works (spawns `opencode run --format json`)
- [ ] Ollama runner works (uses `ToolUsingChatAgent`)
- [ ] Baseline + CodeAtlas modes both function
- [ ] Token/cost/latency/accuracy metrics captured
- [ ] Reproducible (same config → same results)
- [ ] `pnpm check` passes (typecheck + lint + format + test)

## Risk: medium | Complexity: high

## Dependencies
- Phases 1–3 (context engine, usage tracking, Ollama tool loop)
- `@atlas/agents` ProcessRunner for opencode spawning
- `@atlas/usage` for metrics persistence
- `@atlas/sdk` ToolUsingChatAgent for Ollama runner
