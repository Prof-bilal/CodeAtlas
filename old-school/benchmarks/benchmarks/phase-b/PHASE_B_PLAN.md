# Phase B Plan

**Date:** 2026-09-01
**Status:** DRAFT — requires human approval of Phase A Decision + open product decisions
**Depends on:** Phase A Decision (Section 4 open decisions must be resolved)

---

## 1. Prerequisites (BLOCKING — must complete before Phase B work begins)

| Task | Owner | Effort | Evidence |
|------|-------|--------|----------|
| Fix evaluation score persistence in `BenchmarkService.runTask()` | Engineer | S (2h) | Evaluator output exists in tests but not in persisted task JSON |
| Set `runsPerTask: 3` for all future benchmark suites | Config | S (1h) | Single-run data has no statistical significance |
| Decide open product decisions (max overhead, min accuracy, etc.) | Product | M (meeting) | PHASE_A_DECISION.md §4 |
| Retire `codeatlas-intel` as a benchmark arm | Config | S (30m) | Same agent as codeatlas per ollama.ts:157 |
| Start Ollama instance for new benchmark runs | Infra | S (setup) | localhost:11434 not running |

---

## 2. Phase B Tasks (ordered by evidence from Phase A)

### B1. Budget/Truncation Policy Fix — Effort M, P0

**Evidence from Phase A:** 10 budget_truncation failures (53% of all failures). The 10-round MAX_TOOL_ROUNDS cap terminates the loop before complex tasks produce a final answer.

**What to do:**
1. Protect Critical-tier content from truncation in `packages/sdk/src/context-integration/budget.ts`
2. Degrade Supporting/Optional tiers first
3. Emit an explicit `truncated: true` signal in the rendered package so the model knows context was cut
4. Consider adaptive round limits based on task category (bug-investigation needs more rounds than file-discovery)

**Files:** `packages/sdk/src/context-integration/budget.ts`, `assemble.ts`, `render.ts`
**Tests:** Existing context-integration tests (additive)

**Acceptance:** Complex tasks (bug-investigation, feature-planning) stop hitting max-rounds exhaustion.

---

### B2. Regime-Aware Context Modes — Effort M, P0

**Evidence from Phase A:** axios (466 files) shows +220% token overhead with flat accuracy. The model doesn't benefit from context on this repo size. Small repos (winston, 116 files) show smaller overhead.

**What to do:**
1. Implement automatic mode selection: `digest` (one-shot repo digest + targeted retrieval) vs `full` package
2. Choose from measured thresholds (repo size vs configured model window)
3. Expose as `contextMode: auto | digest | full | off` with `auto` default
4. `auto` = full for large repos (>500 files), digest for small repos (<200 files)

**Files:** `packages/core` (additive `ContextMode` type), `packages/sdk/src/context-integration/` (mode selection)
**Tests:** New tests for mode selection logic

**Acceptance:** Small-repo cells stop adding +200K–800K tokens. Digest-mode runs on winston/commander with token delta ≤ +10% of baseline.

**ADR required:** Small — additive option, no schema break.

---

### B3. Retrieval Improvement (CONDITIONAL) — Effort L, P1

**Evidence from Phase A:** Cannot assess — retrieval metrics not measured in existing data.

**What to do (only if A3 metrics show recall is the bottleneck):**
1. Graph-aware candidate expansion: use `@atlas/graph` to add 1-hop callers/callees of top lexical hits
2. Query-term expansion: entity extraction already yields symbols; expand with imported-name aliases
3. Embedding scorer — only if 1–2 fail

**Files:** `packages/sdk/src/context-integration/`, `packages/graph/`
**Tests:** Retrieval quality tests with precision@k, recall@k

**Acceptance:** recall@k measurably improves on the pinned repos.

**Condition:** This task is BLOCKED until retrieval quality is measured. Do not start without evidence.

---

### B4. Sufficiency-Gate Tuning — Effort S, P1

**Evidence from Phase A:** Unknown false-positive rate. The gate may be blocking tasks that would have succeeded, or allowing tasks that fail.

**What to do:**
1. Using Phase A logs, check gate false-positive rate (blocks tasks that would have succeeded)
2. Check false-negative rate
3. Tune `minScore` and predicate thresholds
4. Add gate verdicts to benchmark results for analysis

**Files:** `packages/sdk/src/context-integration/sufficiency.ts` + benchmark plumbing
**Tests:** Gate decision recording per task

**Acceptance:** Gate decisions recorded per task; tuning justified by numbers.

---

### B5. MCP Output Token-Efficiency Audit — Effort S, P1

**Evidence from Phase A:** Tool output tokens dominate cache-read volume (~70% of total tokens). `read_file_range` and `find_relevant_context` are the worst offenders.

**What to do:**
1. Cap and compact high-level tool outputs (`analyze_task`, `find_relevant_context`)
2. Measure rendered bytes per tool call from Phase A logs
3. Target the worst offenders
4. Every result keeps the `next_steps` convention

**Files:** `packages/mcp/src/handlers.ts`, `tools.ts`
**Tests:** Tool output size tests

**Acceptance:** Tool output tokens reduced by ≥30% without accuracy loss.

---

## 3. Execution Order

```
Prerequisites (§1)
    │
    ├─→ B1 (budget fix) ────┐
    │                        │
    ├─→ B2 (context modes) ─┼─→ Re-run benchmark (3 runs/task)
    │                        │
    ├─→ B5 (token efficiency)┤
    │                        │
    └─→ B4 (gate tuning) ───┘
                                │
                                ├─→ Measure accuracy + tokens
                                │
                                ├─→ B3 (retrieval, if needed)
                                │
                                └─→ Phase C
```

**Parallelizable:** B1, B2, B4, B5 can be developed in parallel. They touch different files.
**Must complete before re-benchmark:** B1, B2, B5 (they change runtime behavior).
**Can complete after re-benchmark:** B3 (conditional on retrieval metrics).

---

## 4. Benchmark Re-Run Plan

After Phase B changes are implemented:

### 4.1 Configuration

```yaml
runsPerTask: 3
models:
  - opencode/mimo-v2.5-free  # strong free model
  - opencode/nemotron-3.5-lightning-free  # strong free model
modes:
  - baseline
  - codeatlas
# codeatlas-intel retired — same agent as codeatlas
repos:
  - winston   # 116 files (small)
  - commander # 216 files (medium)
  - axios     # 466 files (medium-large)
  - rxjs      # 1,288 files (large)
```

### 4.2 Expected Outcomes

| Repo | Current Verdict | Expected After B1+B2 |
|------|----------------|---------------------|
| winston | ACCEPTABLE | WIN (overhead reduced further) |
| commander | REGRESSION | ACCEPTABLE or WIN (budget fix helps complex tasks) |
| axios | INSUFFICIENT | ACCEPTABLE (digest mode reduces overhead) |
| rxjs | ACCEPTABLE | WIN (budget fix + token efficiency) |

### 4.3 Success Criteria

For each cell after Phase B:
1. Accuracy ≥ baseline
2. Token overhead ≤ 2x (from current 1.5-2.2x)
3. Latency overhead ≤ 1.5x (currently faster, should stay faster)
4. No timeouts on strong models
5. Evaluation scores persisted and available

---

## 5. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Budget fix causes accuracy regression on simple tasks | Medium | High | A/B test on simple vs complex tasks separately |
| Digest mode misses critical context for medium repos | Medium | Medium | Measure recall@k before/after; fallback to full mode |
| Token efficiency changes break MCP tool contracts | Low | High | Existing 99 tests must pass; add tool output tests |
| Ollama not available for re-benchmark | High | High | Use API models (mimo, nemotron) as primary; Ollama as secondary |
| Evaluation persistence fix reveals low accuracy across all cells | Medium | Critical | That's the honest answer — report it and narrow scope |

---

## 6. Phase B Exit Gate

| Criterion | How Measured |
|-----------|-------------|
| Accuracy ≥ baseline on ≥2 repos | Evaluation scores in benchmark results |
| Token overhead ≤ 2x on ≥3 repos | Token metrics in benchmark results |
| No timeouts on strong models | Timeout count in benchmark results |
| Evaluation scores persisted | Task JSON files contain `evaluation` field |
| 3 runs per cell completed | `runsPerTask: 3` in suite config |
| Statistical significance assessed | Paired bootstrap test on 3-run data |
| Phase B report published | `benchmarks/phase-b/PHASE_B_REPORT.md` |

---

## 7. What Phase B Does NOT Do

- No new intelligence features (planner, critic, verifier) — measure existing ones first
- No embedding retrieval — only if B3's cheap ladder fails
- No new parsers — TypeScript-only is the current wedge
- No orchestrator/slash-commands — that's Phase C+
- No changes to `MAX_TOOL_ROUNDS` without measured justification
- No prompt engineering without A/B testing

---

## 8. Timeline

| Week | Focus | Deliverable |
|------|-------|------------|
| Week 3 | Prerequisites + B1 + B2 + B5 | Code ready for testing |
| Week 4 | B4 + re-benchmark (3 runs/task) | New benchmark data |
| Week 5 | Analysis + B3 (if needed) + Phase B report | Decision: proceed to C or iterate |
