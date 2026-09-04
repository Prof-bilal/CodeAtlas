# Phase A Implementation Audit

**Date:** 2026-09-01
**Auditor:** Phase A Validation Engineer
**Scope:** Complete inventory of what is implemented, missing, broken, or unmeasurable.

---

## 1. Tool-Loop Instrumentation (`packages/sdk/src/context-tools/tool-loop.ts`)

| Item | Status | Evidence |
|------|--------|----------|
| Cumulative input tokens | ✅ IMPLEMENTED | `cumulativeInputTokens` accumulated per round (line ~458-460), stored on `callTraces` |
| Cumulative output tokens | ✅ IMPLEMENTED | `cumulativeOutputTokens` accumulated per round (line ~461-463), stored on `callTraces` |
| Round duration | ✅ IMPLEMENTED (just added) | `roundStartMs = performance.now()` before provider call, delta stored as `roundDurationMs` on call trace |
| Round count | ✅ IMPLEMENTED | `roundCount: round + 1` on final-answer return; `callTraces.length` on max-rounds return |
| Dedupe hit count | ✅ IMPLEMENTED | `dedupeHitCount` incremented in dedup cache-hit branch, returned on both paths |
| Per-tool output chars | ✅ IMPLEMENTED (just added) | `outputChars` passed to `recordToolUsage()` for both cached and real results |
| Cached vs real output sizing | ✅ IMPLEMENTED | `cachedText.length` for cached, `toolResult.length` for real |
| Execution trace population | ✅ IMPLEMENTED | `callTraces` and `messageTraces` populated throughout the loop |

**Remaining gap:** `roundDurationMs` is now populated but not surfaced in `BenchmarkCallUsage` type (the type lacks the field). The data is in the execution trace but not in the phase-a observability output.

---

## 2. Ollama Runner (`packages/benchmark/src/runner/ollama.ts`)

| Item | Status | Evidence |
|------|--------|----------|
| Cumulative usage from execution traces | ✅ IMPLEMENTED | `lastCall?.cumulativeInputTokens ?? cr.tokenUsage?.inputTokens` (line ~117) |
| Fallback to token usage | ✅ IMPLEMENTED | Falls back to `cr.tokenUsage` when trace unavailable |
| Stop reason captured | ✅ IMPLEMENTED | `cr.stopReason` surfaced in return (line ~146) |
| Round count captured | ✅ IMPLEMENTED | `cr.roundCount` surfaced in return (line ~147) |
| Dedupe hits captured | ✅ IMPLEMENTED | `cr.dedupeHitCount` surfaced in return (line ~148) |
| Tool calls associated with rounds | ⚠️ PARTIAL | Tool calls extracted from messages but `round` field on `ToolCallRecord` is NOT populated (type exists but runner doesn't set it) |
| Cumulative usage not replaced by last-call | ✅ IMPLEMENTED | Uses `lastCall?.cumulativeInputTokens` (cumulative), not `lastCall?.reportedInputTokens` (per-call) |
| `cumulativeUsage()` removed | ✅ IMPLEMENTED | Comment confirms removal (line ~204-206) |

---

## 3. Benchmark Service (`packages/benchmark/src/benchmark.service.ts`)

| Item | Status | Evidence |
|------|--------|----------|
| Matrix execution (tasks × modes × models) | ✅ IMPLEMENTED | `runSuite()` iterates `matrixModels` when `models.length > 1` (line ~221-258) |
| Model override per task | ✅ IMPLEMENTED | `request.model` passed to `runner.execute()` (line ~114) |
| `BenchmarkRunRequest.model` field | ✅ IMPLEMENTED | Optional `model` field on request type |
| Resume support | ✅ IMPLEMENTED | Skips existing results unless `--force` |
| Failure classification | ✅ IMPLEMENTED | `classifyFailure()` called per task (line ~131-149) |
| Observability persisted | ✅ IMPLEMENTED | `rr.observability` spread into result (line ~165) |

---

## 4. CLI (`apps/cli/src/commands/benchmark.ts`)

| Item | Status | Evidence |
|------|--------|----------|
| `--models <list>` on `init` | ✅ IMPLEMENTED | Parsed as comma-separated, stored in `config.models` |
| `--models <list>` on `run` | ✅ IMPLEMENTED | Parsed and passed to `service.runSuite()` |
| Modes flag | ✅ IMPLEMENTED | `--modes` on init, `--mode` on run |
| Auto-indexing | ✅ IMPLEMENTED | `ensureIndexed()` called before codeatlas runs |
| Tool policy | ✅ IMPLEMENTED | `BENCHMARK_TOOL_POLICY` with per-tool limits |

---

## 5. Phase-A Observability (`packages/benchmark/src/phase-a.ts`)

| Item | Status | Evidence |
|------|--------|----------|
| `buildObservability()` | ✅ IMPLEMENTED | Comprehensive function with all metric buckets |
| Duplicate bucket tracking | ✅ IMPLEMENTED | A/B/C/D classification per source |
| Provider call breakdown | ✅ IMPLEMENTED | `BenchmarkCallUsage[]` from execution trace |
| Tool calls by tool | ✅ IMPLEMENTED | `groupToolCalls()` counts and output tokens by tool |
| Repeated file count | ✅ IMPLEMENTED | Tracks duplicate tool outputs |
| Transcript message count | ✅ IMPLEMENTED | `trace.messages.length` |

**Gap:** `per_round_duration_avg` metric mentioned in PRODUCT_PLAN.md is not computed or surfaced.

---

## 6. Reporter (`packages/benchmark/src/reporter.ts`)

| Item | Status | Evidence |
|------|--------|----------|
| Attribution ledger | ✅ IMPLEMENTED | `renderAttributionLedger()` with 16 metrics |
| Failure classification table | ✅ IMPLEMENTED | `renderFailureClassification()` with per-task and aggregate |
| Duplicate content audit | ✅ IMPLEMENTED | `renderDuplicateAudit()` with per-bucket breakdown |
| Tool loop diagnostics | ✅ IMPLEMENTED | `renderToolLoopDiagnostics()` with rounds, dedup, stop reasons |
| HTML report | ✅ IMPLEMENTED | `renderHtml()` mirrors markdown |

---

## 7. Evaluator (`packages/benchmark/src/evaluator.ts`)

| Item | Status | Evidence |
|------|--------|----------|
| File hit detection | ✅ IMPLEMENTED | `fileHits()` with basename, token, and path matching |
| Concept hit detection | ✅ IMPLEMENTED | `conceptHits()` with phrase and token matching |
| Cited path extraction | ✅ IMPLEMENTED | `citedPaths()` with disk verification |
| Hallucination detection | ✅ IMPLEMENTED | `hallucinatedPaths()` |
| Wrong file detection | ✅ IMPLEMENTED | `wrongFiles()` against gold impact set |
| Scoring (0/1/2) | ✅ IMPLEMENTED | File ratio + concept ratio thresholds |

---

## 8. Retrieval Metrics (`packages/benchmark/src/retrieval-metrics.ts`)

| Item | Status | Evidence |
|------|--------|----------|
| `scoreTaskRetrieval()` | ✅ IMPLEMENTED | SDK search + expected_files comparison |
| `evaluateRetrieval()` | ✅ IMPLEMENTED | Aggregated precision@k, recall@k, MRR |
| Default k values | ✅ IMPLEMENTED | `[1, 5, 10]` |

---

## 9. Failure Classifier (`packages/benchmark/src/failure-classifier.ts`)

| Item | Status | Evidence |
|------|--------|----------|
| `classifyFailure()` | ✅ IMPLEMENTED | 5 categories: budget_truncation, lexical_miss, context_overload, tool_loop_underuse, insufficient_signal |
| `classifyAllFailures()` | ✅ IMPLEMENTED | Batch classification with aggregate counts |

---

## 10. Store (`packages/benchmark/src/store.ts`)

| Item | Status | Evidence |
|------|--------|----------|
| JSON persistence | ✅ IMPLEMENTED | All CRUD operations for suites, tasks, reports |
| Task result persistence | ✅ IMPLEMENTED | Per-task per-mode JSON files |

---

## 11. Core Ports (`packages/core/src/ports/`)

| Item | Status | Evidence |
|------|--------|----------|
| `ChatAgentCallTrace.roundDurationMs` | ✅ IMPLEMENTED | Optional field on type |
| `ChatAgentResult.roundCount` | ✅ IMPLEMENTED | Optional field on type |
| `ChatAgentResult.dedupeHitCount` | ✅ IMPLEMENTED | Optional field on type |
| `ToolCallRecord.round` | ✅ IMPLEMENTED | Optional field on type |
| `RunnerResult.stopReason` | ✅ IMPLEMENTED | Optional field on type |
| `RunnerResult.roundCount` | ✅ IMPLEMENTED | Optional field on type |
| `RunnerResult.dedupeHitCount` | ✅ IMPLEMENTED | Optional field on type |
| `ToolUsage.outputChars` | ✅ IMPLEMENTED | Optional field on type |
| `BenchmarkConfig.models` | ✅ IMPLEMENTED | `readonly string[]` field |
| `BenchmarkRunRequest.model` | ✅ IMPLEMENTED | Optional field |
| `BenchmarkObservability` | ✅ IMPLEMENTED | Full type with metrics, providerCalls, duplicateBuckets |
| `FailureClassification` | ✅ IMPLEMENTED | 5 categories |

---

## 12. Known Issues

| Issue | Severity | Impact |
|-------|----------|--------|
| **codeatlas-intel resolves to codeatlas agent** | CRITICAL | `ollama.ts:157`: `return this.agents["codeatlas-intel"] ?? this.agents.codeatlas;` — no separate intel agent exists. The two arms are functionally identical. |
| **No evaluation scores in existing results** | CRITICAL | Task result files from oc-mimo, ollama-7b, kilo-nemotron do not contain `evaluation` field — the evaluator output is not persisted. |
| **No observability in existing results** | HIGH | Existing task results lack `observability`, `failureClassification`, `stopReason`, `roundCount`, `dedupeHitCount` fields. |
| **roundDurationMs not in BenchmarkCallUsage** | MEDIUM | The field is populated in execution trace but the `BenchmarkCallUsage` type doesn't include it, so phase-a observability doesn't surface per-round latency. |
| **ToolCallRecord.round not populated by runner** | MEDIUM | The `round` field exists on the type but `ollama.ts` doesn't set it when building tool call records from messages. |
| **RxJS R4-T06/T07/T08 all fail** | HIGH | All 9 runs produced zero tokens with exitCode=1 — likely a model/agent configuration issue. |
| **Ollama not running** | BLOCKER | Cannot execute new benchmark runs without a running Ollama instance. |

---

## 13. Summary

**Implemented and working:**
- Tool-loop instrumentation (cumulative tokens, round count, dedupe, output chars, round duration)
- Ollama runner with cumulative usage, stop reason, round count
- Benchmark service with matrix expansion (tasks × modes × models)
- CLI with --models flag
- Phase-a observability with duplicate tracking
- Reporter with attribution ledger, failure classification, duplicate audit, tool loop diagnostics
- Evaluator with file/concept/hallucination detection
- Retrieval metrics (precision@k, recall@k, MRR)
- Failure classifier (5 categories)
- All core port types

**Missing or broken:**
- `codeatlas-intel` is not a distinct agent (falls back to `codeatlas`)
- Existing benchmark results lack evaluation scores and observability data
- `roundDurationMs` not surfaced in `BenchmarkCallUsage`
- `ToolCallRecord.round` not populated by runner
- RxJS tasks R4-T06/T07/T08 fail across all arms
- No Ollama instance available for new runs
