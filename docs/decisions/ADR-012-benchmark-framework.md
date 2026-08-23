# ADR-012 — Benchmark Framework (Phase 4)

## Status

**Accepted** — 2026-08-22

## Context

Atlas has multiple ad-hoc evaluation harnesses scattered across `benchmarks/`:
`run-benchmark.mjs` (OpenCode CLI runner), `generate-reports.mjs` (Markdown
report generator), `run-all.sh` (shell orchestration), and per-repo task JSON
files. These are hard to maintain, hard to extend, and duplicated across
directories.

**Goal:** Consolidate into a single declarative `atlas benchmark` command with
`init/run/status/report` subcommands, living in a new `@atlas/benchmark` package
behind a `BenchmarkPort` in core.

## Decision

### 1. `BenchmarkPort` in core

A new port (`packages/core/src/ports/benchmark.port.ts`) defines the contract:
`BenchmarkConfig`, `BenchmarkSuite`, `TaskDefinition`, `TaskFile`,
`BenchmarkTaskResult`, `TokenMetrics`, `ToolCallRecord`, `BenchmarkEvaluation`,
`BenchmarkSuiteResult`, `BenchmarkStatus`, `ReportOptions`, `BenchmarkReport`,
`BenchmarkRunner`, `RunnerRequest`, `RunnerResult`.

### 2. `@atlas/benchmark` package

Owns the implementation. Components:

- **`BenchmarkStore`** — JSON-backed persistence under `.codeatlas/benchmarks/`.
  Suites, task results, task files, raw results, and reports stored per suite ID.
- **Scaffolding** — `scaffoldSuite()` creates a new benchmark suite directory;
  `scaffoldTaskFile()` creates task JSON files.
- **Runners** — `OpenCodeRunner` (spawns `opencode run --format json`, parses
  JSONL events for token/cost/latency) and `OllamaRunner` (uses `ChatAgentPort`
  in-process via `createContextIntegration` + `createSessionManager`).
- **Evaluator** — Automated scoring based on file/concept hit ratios:
  score 2 (correct, both ratios >= 0.5), score 1 (partial, one ratio >= 0.2),
  score 0 (incorrect/failed). Cited file extraction via regex.
- **Metrics** — Integrates `MetricsPort.recordTokenEstimate()` and
  `UsagePort.record()` for per-task token/cost tracking.
- **Reporter** — `renderReport()` (per-repo Markdown with token/cost/accuracy
  tables) and `renderSummary()` (cross-repo comparison).

### 3. SDK composition

`createBenchmarkService()` in `packages/sdk/src/benchmark/index.ts` wires
store, runners, evaluator, metrics, and reporter into the `BenchmarkService`.
Consumers (CLI, future agents) use only the SDK.

### 4. CLI command

`atlas benchmark init/run/status/report` with:
- `init` — scaffolds a benchmark suite with task files
- `run` — executes all tasks in both modes (baseline vs codeatlas)
- `status` — shows progress and task-level results
- `report` — generates Markdown report

### 5. Runners implement `BenchmarkRunner`

Both runners share the same interface (`BenchmarkRunner` from core), returning
`RunnerResult` with token metrics, duration, tool calls, and final text.

## Consequences

- Existing `benchmarks/final-2026-08/` harnesses remain as reference data; new
  benchmarks use the canonical `atlas benchmark` workflow.
- The evaluator is deterministic (no AI scoring); it can be extended with a
  future AI evaluator seam.
- `BenchmarkRunner` requires `ToolDefinition[]` (from core) so runners can
  inject context tools — no `import()` type hacks.
- The package follows the same dependency rules as all other packages: imports
  only `core`, `shared`, and `agents` (for `ChatAgentPort` in the Ollama runner).

## Alternatives considered

1. **Extend existing harnesses** — Rejected: too tightly coupled to OpenCode CLI
   output format; no standard interface for adding new runners.
2. **Separate runner packages** — Rejected: premature; a single package with
   runner adapters keeps the surface area manageable.
3. **AI-based evaluation** — Deferred: automated file/concept scoring covers the
   baseline; a future evaluator can be swapped in via the same port.
