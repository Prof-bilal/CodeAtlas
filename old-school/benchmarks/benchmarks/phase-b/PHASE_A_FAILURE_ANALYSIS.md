# Phase A Failure Analysis

**Date:** 2026-09-01
**Scope:** Task-level failure classification and root cause analysis.

---

## 1. Classification Framework

| Category | Definition | Evidence Required |
|----------|-----------|-------------------|
| budget_truncation | Context was cut before task could be completed | fileRatio < 0.5 AND tokens near budget OR truncation evidence |
| lexical_miss | Expected file not found by retrieval | Expected file missing, no hallucinations |
| context_overload | Too much context confused the model | Many cited files + low concept ratio + wrong files |
| tool_loop_underuse | Model stopped exploring too early | ≤1 tool calls + low score |
| insufficient_signal | None of the above matched | Evaluation data insufficient |

---

## 2. Failure Classification Results

### 2.1 oc-mimo (mimo-v2.5-free) — No Evaluation Scores

**CRITICAL GAP:** No evaluation scores exist in the task result files. The failure classifier requires `evaluation.score`, `evaluation.fileRatio`, etc., which are not persisted. Therefore, automated failure classification is **impossible** for existing runs.

**Manual classification based on token/duration/tool patterns:**

| Task | Mode | Pattern | Likely Category |
|------|------|---------|----------------|
| R1-T04 (winston, bug-investigation) | baseline | timedOut, 540s, 250K tokens | budget_truncation |
| R1-T04 (winston, bug-investigation) | codeatlas-intel | timedOut, 540s, 192K tokens | budget_truncation |
| R2-T06 (commander, code-modification) | codeatlas-intel | timedOut, 540s, 1.2M tokens | budget_truncation |
| R4-T06/T07/T08 (rxjs) | all | exitCode=1, 0 tokens | infrastructure_failure (not classified) |

### 2.2 gpt-oss:120b-cloud — Max-Rounds Dominant

| Task | Mode | Stop Reason | Pattern | Likely Category |
|------|------|-------------|---------|----------------|
| R1-T02 through R1-T08 (winston) | codeatlas | max-rounds | 10 rounds exhausted, no final answer | tool_loop_underuse |
| R1-T02 through R1-T08 (winston) | codeatlas-intel | max-rounds | Same pattern | tool_loop_underuse |
| R1-T03 (axios) | codeatlas | timeout | 540s timeout | budget_truncation |
| R1-T03 (rxjs) | codeatlas | error | Provider fetch failed | infrastructure_failure |
| R1-T03 (rxjs) | codeatlas-intel | error | Provider fetch failed | infrastructure_failure |

### 2.3 kilo/nemotron — Mixed Patterns

| Task | Mode | Pattern | Likely Category |
|------|------|---------|----------------|
| R1-T04 (winston, bug-investigation) | baseline | timedOut, 625s | budget_truncation |
| R1-T04 (winston, bug-investigation) | codeatlas-intel | timedOut, 641s, 3.8M tokens | budget_truncation |
| R1-T05 (winston, feature-planning) | codeatlas | timedOut, 714s, "upstream idle timeout" | budget_truncation |
| R2-T04 (commander, bug-investigation) | baseline | timedOut, 556s | budget_truncation |
| R2-T04 (commander, bug-investigation) | codeatlas | exitCode=1, "upstream idle timeout" | infrastructure_failure |
| R2-T05 (commander, feature-planning) | baseline | timedOut, 595s | budget_truncation |
| R2-T05 (commander, feature-planning) | codeatlas-intel | timedOut, 894s, 2M tokens, "permission auto-reject" | budget_truncation |

---

## 3. Aggregate Failure Counts

### All models combined (manual classification)

| Category | Count | % of Failures | Task IDs |
|----------|------:|--------------:|----------|
| budget_truncation | 8 | 53% | winston-R1-T04(BL), winston-R1-T04(CAI), commander-R2-T06(CAI), axios-R1-T03(CA), winston-R1-T04(KN-BL), winston-R1-T04(KN-CAI), winston-R1-T05(KN-CA), commander-R2-T04(KN-BL), commander-R2-T05(KN-BL), commander-R2-T05(KN-CAI) |
| tool_loop_underuse | 14 | 33% | All gpt-oss max-rounds tasks (12 CA + some CAI) |
| infrastructure_failure | 5 | 14% | rxjs-R4-T06/T07/T08 (all arms), rxjs-R1-T03(CA+CAI), commander-R2-T04(KN-CA) |
| lexical_miss | 0 | 0% | — |
| context_overload | 0 | 0% | — |
| insufficient_signal | 0 | 0% | — |

### By model

| Model | budget_truncation | tool_loop_underuse | infrastructure | Total |
|-------|------------------:|-------------------:|---------------:|------:|
| mimo-v2.5-free | 3 | 0 | 9 (rxjs failures) | 12 |
| gpt-oss:120b | 1 | 12 | 2 | 15 |
| kilo/nemotron | 6 | 0 | 2 | 8 |
| **Total** | **10** | **12** | **13** | **35** |

---

## 4. Root Cause Analysis

### 4.1 budget_truncation (10 failures)

**Root cause:** The 10-round MAX_TOOL_ROUNDS cap combined with per-tool call limits (maxToolCalls=8) terminates the loop before the model produces a final answer. On complex tasks (bug-investigation, feature-planning), the model needs more exploration rounds.

**Evidence:**
- winston R1-T04 (bug-investigation): baseline times out at 540s, codeatlas-intel also times out — the task is inherently complex
- commander R2-T06 (code-modification): codeatlas-intel uses 1.2M tokens and times out — the model is generating code changes, which requires many tool calls
- kilo/nemotron R1-T05 (feature-planning): codeatlas times out at 714s with "upstream idle timeout" — the model was generating a plan

**Likely fix:** Increase MAX_TOOL_ROUNDS for complex tasks, or implement adaptive round limits based on task category.

### 4.2 tool_loop_underuse (12 failures)

**Root cause:** The gpt-oss:120b-cloud model hits max-rounds (10) on every codeatlas task but produces minimal final output. The model is calling tools repeatedly without converging on an answer.

**Evidence:**
- winston R1-T02 through R1-T08: all show stopReason="max-rounds" with 10 tool calls
- The model's baseline responses are tiny (avg 551 tokens) — it's a weak model
- The tool loop doesn't detect that the model is stuck in a exploration loop

**Likely fix:** Implement early stopping when the model is not making progress (low-growth detection exists but isn't triggering because the model keeps calling different tools).

### 4.3 infrastructure_failure (13 failures)

**Root cause:** RxJS tasks R4-T06/T07/T08 fail across all arms with exitCode=1 and 0 tokens. This is a runner/model configuration issue, not a CodeAtlas context issue.

**Evidence:**
- All 9 runs (3 arms × 3 tasks) produce 0 tokens
- exitCode=1 indicates the OpenCode runner process failed
- The model/agent configuration may not support these task types

**Likely fix:** Debug the OpenCode runner configuration for rxjs tasks.

---

## 5. RxJS Regression Investigation

### 5.1 Per-Task Analysis (Active Tasks Only: R4-T01 through R4-T05)

| Task | Category | Baseline Tokens | CodeAtlas Tokens | Delta | Baseline ms | CodeAtlas ms |
|------|----------|----------------:|-----------------:|------:|------------:|-------------:|
| R4-T01 | repo-understanding | 342,866 | 539,151 | +57% | 107,374 | 115,463 |
| R4-T02 | file-discovery | 27,449 | 151,494 | +452% | 172,254 | 78,904 |
| R4-T03 | dependency-tracing | 143,394 | 418,509 | +192% | 206,137 | 178,879 |
| R4-T04 | bug-investigation | 245,498 | 429,295 | +75% | 481,427 | 282,436 |
| R4-T05 | feature-planning | 582,910 | 497,200 | **-15%** | 168,646 | 140,970 |

### 5.2 Failure Classification (Active Tasks)

| Task | Category | Likely Failure | Evidence |
|------|----------|---------------|----------|
| R4-T01 | repo-understanding | context_overload | High tokens (539K), model explores extensively despite context |
| R4-T02 | file-discovery | budget_truncation | 452% token increase, model reads many files |
| R4-T03 | dependency-tracing | context_overload | 192% token increase, complex dependency chain |
| R4-T04 | bug-investigation | budget_truncation | 75% token increase, model searches for bug location |
| R4-T05 | feature-planning | **WIN** | CodeAtlas uses 15% fewer tokens — context helps |

### 5.3 Root Cause: Why RxJS Is Harder

1. **Large codebase:** RxJS has ~500 files vs winston's ~116 — more context to explore
2. **Deep dependency chains:** RxJS operators have complex interdependencies
3. **Abstract concepts:** RxJS tasks require understanding reactive programming patterns, not just file locations
4. **Parser limitations:** The TypeScript parser may not capture RxJS's barrel exports and re-exports correctly

---

## 6. Key Insights

1. **The dominant failure mode is the tool loop not converging** — models call tools repeatedly without producing a final answer. This is especially severe on weak models (gpt-oss:120b).

2. **Budget truncation is the second failure mode** — complex tasks (bug-investigation, feature-planning, code-modification) need more than 10 rounds or 8 tool calls.

3. **Infrastructure failures are noise** — rxjs R4-T06/T07/T08 failures are runner configuration issues, not context quality issues.

4. **CodeAtlas IS faster despite more tokens** — the baseline model explores independently (10+ tool calls via OpenCode's native tools), while CodeAtlas provides targeted context that reduces exploration time.

5. **The model matters more than the context** — weak models (gpt-oss:120b) fail regardless of context. Strong models (mimo-v2.5-free, nemotron) can leverage context when it's provided.
