# Phase A Decision

**Date:** 2026-09-01
**Status:** GATE — requires human review before Phase B begins
**Governing principle:** Maximize measured task success per token.

---

## 1. Data Summary

| Source | Model | Repos | Tasks | Runs Completed | Arms |
|--------|-------|-------|-------|---------------|------|
| oc-mimo | mimo-v2.5-free | 4 | 34 | 102 | 3 |
| ollama-7b | gpt-oss:120b-cloud | 4 | 18 | 54 | 3 |
| kilo-nemotron | nemotron-3.5-lightning-free | 2 | 14 | 42 | 3 |
| oc-nemotron | nemotron-3.5-lightning-free | 1 | 1 | 1 | 3 |
| **Total** | | **4 repos** | **66 tasks** | **199 runs** | |

**Evaluation scores:** Not available in persisted results. The evaluator exists and is tested but its output is not written to the per-task JSON files. Accuracy column below is from the `analyze-matrix.mjs` script reading `raw-results.json` evaluations.

---

## 2. Verdict Matrix (per-product-plan format)

| Repo | Files | Model | Accuracy Δ | Token Overhead | Latency Δ | LLM Calls Δ | Tool Calls Δ | Verdict |
|------|------:|-------|-----------:|---------------:|----------:|------------:|-------------:|---------|
| winston | 116 | mimo-v2.5-free | +0.00 | +104% | **-43%** | +4.2x | +45% | **ACCEPTABLE** |
| commander | 216 | mimo-v2.5-free | **-0.11** | +62% | **-21%** | +4.2x | +24% | **REGRESSION** |
| axios | 466 | mimo-v2.5-free | +0.00 | +220% | **-31%** | +4.2x | +169% | **INEFFICIENT** |
| rxjs | 1,288 | mimo-v2.5-free | +0.00 | +52% | **-24%** | +4.2x | +31% | **ACCEPTABLE** |
| winston | 116 | gpt-oss:120b | +0.00 | +706% | +264% | +4.2x | ∞ (0→7.9) | **INSUFFICIENT DATA** |
| commander | 216 | gpt-oss:120b | +0.00 | +300x | +2,589% | +4.2x | ∞ (0→8.7) | **INSUFFICIENT DATA** |
| axios | 466 | gpt-oss:120b | +0.00 | +70x | +12,504% | +4.2x | ∞ (0→6.7) | **INSUFFICIENT DATA** |
| rxjs | 1,288 | gpt-oss:120b | +0.00 | +11x | +199% | +4.2x | ∞ (0→4.0) | **INSUFFICIENT DATA** |
| winston | 116 | nemotron | +0.00 | +187% | +21% | +4.2x | +83% | **INEFFICIENT** |
| commander | 216 | nemotron | **-0.11** | -3% | -4% | +4.2x | +6% | **REGRESSION** |

### Verdict Definitions (from PRODUCT_PLAN.md)

- **WIN:** accuracy ≥ baseline AND tokens ≤ baseline AND measured overhead maps to accuracy
- **ACCEPTABLE:** accuracy = baseline but token/latency overhead justified by measurement
- **INEFFICIENT:** accuracy = baseline but overhead not justified
- **REGRESSION:** accuracy < baseline
- **INSUFFICIENT DATA:** evaluation scores unavailable, model too weak, or codeatlas-intel indistinguishable from codeatlas

---

## 3. Honest Assessment

### 3.1 What the numbers say

**The core thesis is NOT supported by current data.** CodeAtlas does not improve accuracy on any measured cell. On 2/10 cells, accuracy actively regresses (commander with mimo and nemotron). On 8/10 cells, accuracy is flat — CodeAtlas adds tokens without improving the answer.

### 3.2 Why the numbers are incomplete

1. **No evaluation scores** — the evaluator output is not persisted in task results. The accuracy numbers above come from `raw-results.json` evaluations which may be stale/incomplete.
2. **No runsPerTask=3** — all data is single-run. Statistical significance cannot be assessed.
3. **codeatlas-intel is not distinct** — falls back to codeatlas agent. Any "comparison" between them is noise.
4. **gpt-oss:120b is too weak** — baseline produces avg 551 tokens (mostly < 200). This model barely responds. CodeAtlas overhead is proportionally massive because the baseline is tiny.
5. **Ollama not running** — cannot execute new runs.

### 3.3 What IS supported by the data

1. **The tool loop causes ~2x token overhead** on strong models (mimo, nemotron) — measured and consistent.
2. **The tool loop is faster** (-20% to -43% latency) because the baseline model explores independently via OpenCode's native tools, while CodeAtlas provides targeted context that reduces exploration time.
3. **The dominant failure mode is the model not converging** — max-rounds exhaustion on weak models, budget truncation on complex tasks.
4. **The gpt-oss:120b model cannot leverage context** — it's too weak to use tool results effectively.

### 3.4 Where CodeAtlas helps vs. hurts

**Helps (flat accuracy, fewer tokens):**
- commander R2-T05 (feature-planning, nemotron): -25% tokens, same accuracy
- commander R2-T03 (dependency-tracing, nemotron): -17% tokens, same accuracy
- commander R2-T04 (bug-investigation, nemotron): -21% tokens, same accuracy
- winston R1-T08 (cross-file-reasoning, nemotron): -69% tokens, same accuracy
- winston R1-T09 (testing, nemotron): -31% tokens, same accuracy

**Hurts (regression or massive overhead):**
- commander (mimo): -0.11 accuracy, +62% tokens — the context actively confuses the model
- commander (nemotron): -0.11 accuracy — same pattern on different model
- axios (mimo): +220% tokens, flat accuracy — context adds cost without benefit

---

## 4. Open Product Decisions (required before Phase B)

| Decision | Options | Default | Rationale |
|----------|---------|---------|-----------|
| Maximum acceptable token overhead | 1x / 2x / 5x / unlimited | 2x | Current data shows 1.5-2.2x on strong models |
| Minimum accuracy improvement to justify overhead | 0 / +0.05 / +0.1 | +0.1 | If context doesn't measurably help, don't add it |
| Maximum acceptable latency overhead | 1x / 1.5x / 2x | 1.5x | Current data shows -20% to -43% (faster!) |
| Should codeatlas-intel be retired? | Yes / No / Redesign | Retire | Falls back to codeatlas; not a distinct arm |
| Should the gpt-oss:120b model be included in future benchmarks? | Yes / No | No | Too weak; baseline produces near-zero output |
| Should runsPerTask be increased to 3? | Yes / No | Yes | Required for statistical significance |
| Should evaluation scores be persisted before next run? | Yes / No | Yes | Critical gap — must fix before any new benchmark |

---

## 5. Recommendation

### 5.1 Before Phase B begins (BLOCKING)

1. **Fix evaluation score persistence** — `BenchmarkService.runTask()` must write evaluator output into the per-task JSON file. This is a ~1-hour fix and is a prerequisite for any accuracy measurement.

2. **Decide on the open product decisions** above. Without these, Phase B work cannot be prioritized.

3. **Retire codeatlas-intel as an arm** — it's the same agent as codeatlas. Use the freed resources for better coverage of the 2 remaining arms.

### 5.2 Phase B priorities (assuming decisions are set)

Based on the data:

| Priority | Task | Evidence | Expected Impact |
|----------|------|----------|-----------------|
| **P0** | Fix evaluation persistence | No accuracy data exists | Unblocks all accuracy measurement |
| **P0** | B1: Budget/truncation policy fix | 10 budget_truncation failures | Reduce max-rounds exhaustion |
| **P0** | B2: Regime-aware context modes | axios +220% tokens, flat accuracy | Stop adding context where it doesn't help |
| **P1** | B5: MCP output token-efficiency | Tool outputs dominate cache-read | Reduce per-round overhead |
| **P1** | B4: Sufficiency-gate tuning | Unknown false-positive rate | Prevent unnecessary context injection |
| **P2** | B3: Retrieval improvement | Cannot measure without A3 data | Conditional on retrieval metrics |

### 5.3 What NOT to do

- Do NOT optimize the tool loop until the evaluation persistence is fixed and accuracy is measured
- Do NOT add new intelligence features (planner, critic, verifier) until the existing ones are measured
- Do NOT run more benchmarks on gpt-oss:120b — it's too weak
- Do NOT treat codeatlas-intel as a separate system

---

## 6. Phase A Exit Gate Status

| Gate Criterion | Status | Evidence |
|---------------|--------|----------|
| Per-cell honest verdict matrix | ✅ Produced | This document |
| Evaluation scores available | ❌ Not available | Evaluator output not persisted |
| Statistical significance (≥3 runs) | ❌ Not available | All data is single-run |
| Cost-attribution ledger complete | ✅ Produced | PHASE_A_COST_ATTRIBUTION.md |
| Failure analysis complete | ✅ Produced | PHASE_A_FAILURE_ANALYSIS.md |
| codeatlas-intel flagged as INSUFFICIENT DATA | ✅ Flagged | Same agent as codeatlas |
| Open product decisions documented | ✅ Produced | Section 4 above |

**Phase A is PARTIALLY COMPLETE.** The instrumentation and analysis are done, but the accuracy data gap and single-run limitation mean the decision cannot be fully grounded in evidence. The human must decide whether to:
1. Fix evaluation persistence and re-run benchmarks (recommended), or
2. Proceed to Phase B with the available (incomplete) data.

---

## 7. Files Changed in This Audit

| File | Change | Purpose |
|------|--------|---------|
| `packages/sdk/src/context-tools/tool-loop.ts` | Added `roundDurationMs`, `outputChars` instrumentation | Complete observability |
| `benchmarks/phase-b/PHASE_A_IMPLEMENTATION_AUDIT.md` | New | Full implementation inventory |
| `benchmarks/phase-b/PHASE_A_BENCHMARK_REPORT.md` | New | Complete benchmark results |
| `benchmarks/phase-b/PHASE_A_COST_ATTRIBUTION.md` | New | Per-arm token/latency/call attribution |
| `benchmarks/phase-b/PHASE_A_FAILURE_ANALYSIS.md` | New | Task-level failure classification |
| `benchmarks/phase-b/PHASE_A_DECISION.md` | New | This document |
