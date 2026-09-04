# Phase A Benchmark Report

**Date:** 2026-09-01
**Scope:** Complete benchmark results from all available data sources.

---

## 1. Data Sources

| Source | Model | Agent | Repos | Tasks | Arms | Status |
|--------|-------|-------|-------|-------|------|--------|
| oc-mimo | opencode/mimo-v2.5-free | opencode | 4 | 34 | 3 | COMPLETE |
| ollama-7b | gpt-oss:120b-cloud | ollama | 4 | 18 | 3 | COMPLETE |
| kilo-nemotron | kilo/nvidia/nemotron-3.5-lightning:free | kilo | 2 | 14 | 3 | COMPLETE |
| oc-nemotron | opencode/nemotron-3.5-lightning-free | opencode | 1 | 1 | 3 | INCOMPLETE (1/27) |

**Total completed task-runs:** 162 (66 × 3 arms)

---

## 2. Matrix: opencode/mimo-v2.5-free (4 repos, 34 tasks)

### 2.1 Aggregate Per Arm

| Metric | Baseline | CodeAtlas | CodeAtlas-Intel |
|--------|----------|-----------|-----------------|
| Total tokens | 4,617,097 | 8,794,860 | 8,860,001 |
| Avg tokens/task | 135,797 | 258,672 | 260,588 |
| Total input tokens | 695,735 | 1,033,048 | 967,620 |
| Total output tokens | 98,002 | 117,588 | 93,725 |
| Total cacheRead | 3,823,360 | 7,644,224 | 7,798,656 |
| Total duration (ms) | 5,423,988 | 3,781,061 | 4,070,174 |
| Avg duration (ms) | 159,529 | 111,208 | 119,711 |
| Total tool calls | 344 | 545 | 593 |
| Avg tool calls/task | 10.1 | 16.0 | 17.4 |
| Timeouts | 1 | 0 | 2 |

### 2.2 Per-Repo Breakdown

| Repo | Tasks | Baseline Avg Tokens | CodeAtlas Avg Tokens | Delta | Baseline Avg ms | CodeAtlas Avg ms | Delta |
|------|-------|--------------------:|---------------------:|------:|----------------:|-----------------:|------:|
| winston | 9 | 141,989 | 289,893 | +104% | 161,834 | 92,409 | -43% |
| commander | 9 | 157,678 | 255,848 | +62% | 131,964 | 104,379 | -21% |
| axios | 8 | 72,247 | 230,944 | +220% | 176,487 | 121,898 | -31% |
| rxjs | 8 | 167,765 | 254,456 | +52% | 170,990 | 129,348 | -24% |

### 2.3 Per-Category Breakdown (All repos)

| Category | Tasks | Baseline Avg Tokens | CodeAtlas Avg Tokens | Delta | Baseline Avg ms | CodeAtlas Avg ms |
|----------|-------|--------------------:|---------------------:|------:|----------------:|-----------------:|
| repository-understanding | 4 | 70,239 | 232,415 | +231% | 91,952 | 81,384 |
| file-discovery | 4 | 19,708 | 163,873 | +732% | 122,084 | 73,267 |
| dependency-tracing | 4 | 63,807 | 333,780 | +423% | 204,648 | 148,463 |
| bug-investigation | 4 | 212,473 | 355,361 | +67% | 356,847 | 222,512 |
| feature-planning | 4 | 287,976 | 285,201 | -1% | 161,793 | 113,295 |
| code-modification | 4 | 182,515 | 279,998 | +53% | 223,961 | 170,958 |
| testing | 4 | 83,062 | 126,822 | +53% | 153,810 | 80,335 |
| cross-file-reasoning | 4 | 64,385 | 98,569 | +53% | 76,426 | 63,426 |

### 2.4 Token Overhead Classification

The ~90% token overhead breaks down as:
- **Tool output context**: Large `cacheRead` volumes (tool results injected into messages)
- **Message history resend**: Each round re-sends the entire `messages[]` array
- **Tool schema overhead**: 7 MCP tool definitions repeated per provider call
- **State summaries**: AgentState rendered into system messages each round
- **Context guidance**: ~200B prefix injected into first user message

---

## 3. Matrix: gpt-oss:120b-cloud (Ollama, 4 repos, 18 tasks)

### 3.1 Aggregate Per Arm

| Metric | Baseline | CodeAtlas | CodeAtlas-Intel |
|--------|----------|-----------|-----------------|
| Total tokens | 9,927 | 130,659 | 150,640 |
| Avg tokens/task | 551.5 | 7,258.8 | 8,368.9 |
| Total duration (ms) | 156,687 | 1,029,684 | 663,545 |
| Avg duration (ms) | 8,705 | 57,205 | 36,864 |
| Total tool calls | 0 | 142 | 159 |
| Avg tool calls/task | 0 | 7.9 | 8.8 |
| Tasks hitting max-rounds | 0 | 12/18 | 11/18 |
| Hard failures | 0 | 1 (timeout) | 0 |

### 3.2 Critical Finding: Baseline Produces Almost No Output

The gpt-oss:120b-cloud model on baseline produces **extremely small responses** (avg 551 tokens, mostly < 200 tokens). This model appears to be a type-definition-only or declaration-only model that doesn't generate substantive code answers. The baseline "accuracy" is artificially low because the model itself is weak, not because it lacks context.

### 3.3 Per-Repo Token Ratios (CodeAtlas / Baseline)

| Repo | Avg Token Ratio | Interpretation |
|------|----------------:|----------------|
| winston | ~30x | Massive overhead from tool loop |
| commander | ~75x | Even larger — baseline is tiny |
| axios | ~70x | Same pattern |
| rxjs | ~85x | Largest ratio |

### 3.4 Stop Reason Distribution

| Stop Reason | CodeAtlas | CodeAtlas-Intel |
|-------------|-----------|-----------------|
| max-rounds | 12 | 11 |
| final-answer | 5 | 6 |
| error | 1 | 1 |

**Key insight:** The majority of CodeAtlas runs hit `max-rounds` (10-round cap), meaning the agent exhausted its exploration budget without producing a final answer. This is the dominant failure mode on this model.

---

## 4. Matrix: kilo/nemotron (2 repos, 14 tasks)

### 4.1 Aggregate Per Arm

| Metric | Baseline | CodeAtlas | CodeAtlas-Intel |
|--------|----------|-----------|-----------------|
| Total tokens | 4,083,955 | 8,492,955 | 9,099,971 |
| Avg tokens/task | 291,711 | 606,640 | 649,998 |
| Total duration (ms) | 4,653,359 | 5,136,671 | 4,297,909 |
| Avg duration (ms) | 332,383 | 366,905 | 306,994 |
| Total tool calls | 208 | 340 | 242 |
| Avg tool calls/task | 14.9 | 24.3 | 17.3 |
| Timeouts | 3 | 1 | 3 |

### 4.2 Per-Repo Breakdown

| Repo | Tasks | Baseline Avg Tokens | CodeAtlas Avg Tokens | Delta | Baseline Avg ms | CodeAtlas Avg ms |
|------|-------|--------------------:|---------------------:|------:|----------------:|-----------------:|
| winston | 9 | 264,291 | 759,193 | +187% | 298,102 | 360,894 |
| commander | 5 | 341,067 | 332,044 | -3% | 394,088 | 377,724 |

### 4.3 Per-Task Token Deltas (CodeAtlas vs Baseline)

| Task | Category | Baseline | CodeAtlas | Delta |
|------|----------|----------|-----------|-------|
| R1-T01 | repo-understanding | 97,561 | 537,057 | +450% |
| R1-T02 | file-discovery | 122,965 | 1,248,262 | +915% |
| R1-T03 | dependency-tracing | 93,013 | 935,299 | +905% |
| R1-T04 | bug-investigation | 376,035 | 1,948,919 | +418% |
| R1-T05 | feature-planning | 486,662 | 1,027,861 | +111% |
| R1-T06 | code-modification | 594,836 | 1,446,918 | +143% |
| R1-T07 | testing | 443,871 | 449,371 | +1% |
| R1-T08 | cross-file-reasoning | 208,355 | 63,656 | **-69%** |
| R1-T09 | testing | 255,320 | 176,292 | **-31%** |
| R2-T01 | repo-understanding | 394,956 | 588,954 | +49% |
| R2-T02 | file-discovery | 53,148 | 82,080 | +54% |
| R2-T03 | dependency-tracing | 236,873 | 197,520 | **-17%** |
| R2-T04 | bug-investigation | 605,187 | 480,012 | **-21%** |
| R2-T05 | feature-planning | 415,173 | 311,654 | **-25%** |

**Notable wins:** R1-T08 (-69%), R1-T09 (-31%), R2-T03 (-17%), R2-T04 (-21%), R2-T05 (-25%) — 5/14 tasks show CodeAtlas using FEWER tokens than baseline.

---

## 5. codeatlas-intel vs codeatlas: Are They Distinct?

### Evidence

1. **`ollama.ts:157`:** `return this.agents["codeatlas-intel"] ?? this.agents.codeatlas;`
2. **`benchmark.ts:188-194`:** `createOllamaRunner()` only creates `baseline` and `codeatlas` agents — no `codeatlas-intel` agent.
3. **Token patterns:** codeatlas-intel and codeatlas show similar token profiles with stochastic variance, not systematic differences.

### Verdict

**INSUFFICIENT DATA — not a distinct experimental arm.** codeatlas-intel resolves to the same `RepositoryToolLoopAgent` as codeatlas. The observed differences are noise, not a treatment effect. Any Phase B plan must not treat them as separate systems.

---

## 6. Evaluation Scores

**CRITICAL GAP:** No existing benchmark task result files contain an `evaluation` field. The evaluator (`evaluateTask()`) is implemented and tested, but its output is not being persisted in the task result JSON files. This means:

- Accuracy scores are **unavailable** for all existing runs
- The Phase A decision matrix cannot include accuracy deltas
- Retrieval quality metrics cannot be correlated with accuracy

**Root cause:** The `BenchmarkService.runTask()` method calls `evaluateTask()` and stores the result in a local variable, but the evaluation is not spread into the persisted `BenchmarkTaskResult`. The `BenchmarkEvaluationEntry` is stored separately in the `evaluations` array but not in the per-task JSON file.

---

## 7. Summary Table

| Model | Repo | Arm | Avg Tokens | Avg Duration (ms) | Avg Tool Calls | Timeouts |
|-------|------|-----|----------:|-------------------:|---------------:|---------:|
| mimo-v2.5-free | winston | baseline | 141,989 | 161,834 | 10.8 | 1 |
| mimo-v2.5-free | winston | codeatlas | 289,893 | 92,409 | 17.7 | 0 |
| mimo-v2.5-free | winston | codeatlas-intel | 175,309 | 118,607 | 16.3 | 1 |
| mimo-v2.5-free | commander | baseline | 157,678 | 131,964 | 11.8 | 0 |
| mimo-v2.5-free | commander | codeatlas | 255,848 | 104,379 | 14.4 | 0 |
| mimo-v2.5-free | commander | codeatlas-intel | 376,693 | 139,382 | 18.4 | 1 |
| mimo-v2.5-free | axios | baseline | 72,247 | 176,487 | 6.5 | 0 |
| mimo-v2.5-free | axios | codeatlas | 230,944 | 121,898 | 17.5 | 0 |
| mimo-v2.5-free | axios | codeatlas-intel | 278,595 | 105,201 | 20.1 | 0 |
| mimo-v2.5-free | rxjs | baseline | 167,765 | 170,990 | 11.1 | 0 |
| mimo-v2.5-free | rxjs | codeatlas | 254,456 | 129,348 | 14.5 | 0 |
| mimo-v2.5-free | rxjs | codeatlas-intel | 207,903 | 113,333 | 14.9 | 0 |
| gpt-oss:120b | winston | baseline | 710 | 12,730 | 0 | 0 |
| gpt-oss:120b | winston | codeatlas | 5,718 | 24,660 | 9.3 | 0 |
| gpt-oss:120b | winston | codeatlas-intel | 6,314 | 35,095 | 9.3 | 0 |
| gpt-oss:120b | commander | baseline | 144 | 1,322 | 0 | 0 |
| gpt-oss:120b | commander | codeatlas | 11,075 | 35,500 | 8.7 | 0 |
| gpt-oss:120b | commander | codeatlas-intel | 10,716 | 49,926 | 9.3 | 0 |
| gpt-oss:120b | axios | baseline | 151 | 1,501 | 0 | 0 |
| gpt-oss:120b | axios | codeatlas | 6,747 | 199,623 | 6.7 | 1 |
| gpt-oss:120b | axios | codeatlas-intel | 11,199 | 32,543 | 10.0 | 0 |
| gpt-oss:120b | rxjs | baseline | 883 | 11,215 | 0 | 0 |
| gpt-oss:120b | rxjs | codeatlas | 8,576 | 34,124 | 4.0 | 0 |
| gpt-oss:120b | rxjs | codeatlas-intel | 9,357 | 33,426 | 5.7 | 0 |
| nemotron | winston | baseline | 264,291 | 298,102 | 14.1 | 1 |
| nemotron | winston | codeatlas | 759,193 | 360,894 | 28.2 | 1 |
| nemotron | winston | codeatlas-intel | 679,954 | 263,036 | 15.2 | 1 |
| nemotron | commander | baseline | 341,067 | 394,088 | 16.2 | 2 |
| nemotron | commander | codeatlas | 332,044 | 377,724 | 17.2 | 0 |
| nemotron | commander | codeatlas-intel | 596,078 | 386,118 | 21.0 | 2 |
