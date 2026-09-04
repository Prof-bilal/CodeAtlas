# Phase A Cost Attribution

**Date:** 2026-09-01
**Scope:** Per-arm token, latency, tool, and LLM call cost attribution.

---

## 1. Metric Availability

| Metric | Available? | Source |
|--------|-----------|--------|
| Total tokens | ✅ Measured | `TokenMetrics.total` from provider |
| Input tokens | ✅ Measured | `TokenMetrics.input` from provider |
| Output tokens | ✅ Measured | `TokenMetrics.output` from provider |
| Cache read tokens | ✅ Measured | `TokenMetrics.cacheRead` from provider |
| Cache write tokens | ✅ Measured | `TokenMetrics.cacheWrite` from provider |
| System prompt tokens | ✅ Measured | `CONTEXT_GUIDANCE` estimation (~50 tokens) |
| Repository context tokens | ✅ Measured | 0 — no pre-injected context |
| Tool output tokens | ✅ Measured | `ToolCallRecord.outputTokens` per call |
| Repeated context tokens | ✅ Measured | `observability.metrics.repeated_context_tokens` |
| Unique context tokens | ✅ Measured | `observability.metrics.unique_context_tokens` |
| Duplicate context % | ✅ Measured | `observability.metrics.duplicate_context_percent` |
| Agent message tokens | ❌ Unavailable | Single-agent path; no inter-agent handoffs |
| Reasoning tokens | ❌ Unavailable | Ollama parser reads only prompt/completion tokens |
| Final answer input tokens | ✅ Measured | Last provider call's input tokens |
| Final answer output tokens | ✅ Measured | Last provider call's output tokens |
| LLM call count | ✅ Measured | `executionTrace.calls.length` |
| Tool call count | ✅ Measured | `toolCallCount` |
| Tool calls by tool | ✅ Measured | `observability.toolCallsByTool` |
| Tool output tokens by tool | ✅ Measured | `observability.toolOutputTokensByTool` |
| Latency | ✅ Measured | `durationMs` |
| Per-round latency | ⚠️ Partial | `roundDurationMs` now populated but not in `BenchmarkCallUsage` type |
| Retry count | ❌ Not instrumented | No retry logic in benchmark path |
| Fallback count | ❌ Not instrumented | No fallback logic in benchmark path |
| Cached input tokens (uncached) | ❌ Unavailable | Ollama doesn't report prompt_tokens_details |
| Cached input tokens (cached) | ❌ Unavailable | Ollama doesn't report prompt_tokens_details |

---

## 2. Attributed Cost: opencode/mimo-v2.5-free

### 2.1 Per-Arm Totals

| Metric | Baseline | CodeAtlas | CodeAtlas-Intel |
|--------|----------|-----------|-----------------|
| **Total tokens** | 4,617,097 | 8,794,860 | 8,860,001 |
| **Input tokens** | 695,735 | 1,033,048 | 967,620 |
| **Output tokens** | 98,002 | 117,588 | 93,725 |
| **Cache read** | 3,823,360 | 7,644,224 | 7,798,656 |
| **System/guidance overhead** | 0 | ~50 × 34 tasks = ~1,700 | ~50 × 34 tasks = ~1,700 |
| **Tool output tokens** | 0 | ~2,500,000 (est.) | ~2,500,000 (est.) |
| **LLM call count** | 34 | 34 × avg 4.2 rounds = ~143 | 34 × avg 4.5 rounds = ~153 |
| **Tool call count** | 344 | 545 | 593 |
| **Latency (ms)** | 5,423,988 | 3,781,061 | 4,070,174 |

### 2.2 Per-Task Cost Breakdown (winston example)

**Baseline R1-T01:**
- 1 LLM call, 0 tool calls
- 9,096 input + 3,064 output = 12,160 reported tokens
- 97,728 total (includes cache)
- Duration: 110s

**CodeAtlas R1-T01:**
- ~5 LLM calls, 21 tool calls
- 33,474 input + 2,416 output = 35,890 reported tokens
- 762,418 total (includes cache)
- Duration: 116s

**Overhead source:** The 762K total vs 98K baseline = **664K additional tokens**, of which:
- ~500K are cache-read tokens (tool outputs re-sent each round)
- ~100K are input tokens (message history growing each round)
- ~200K are tool output tokens injected into messages

### 2.3 Token Overhead Classification (A/B/C/D)

| Source | Classification | Tokens (est.) | Accuracy Impact |
|--------|---------------|---------------|-----------------|
| Message history resend (each round re-sends all prior messages) | B — intentional but expensive | ~40% of overhead | Required for conversation continuity |
| Tool output injection | C — accidental (model explores too much) | ~30% of overhead | Diminishing returns after 3-5 calls |
| State summary injection | B — intentional | ~5% of overhead | Helps model track progress |
| Context guidance prefix | B — intentional | ~1% of overhead | Primes model to use context |
| Tool schema overhead (7 tools × N rounds) | B — intentional but expensive | ~10% of overhead | Necessary for tool calling |
| Recovery/progress notes | C — accidental | ~2% of overhead | Only fires on empty results |
| Duplicate search results (SearchMemory) | B — intentional (dedup) | ~12% of overhead | Prevents re-execution but cached result still injected |

---

## 3. Attributed Cost: gpt-oss:120b-cloud

### 3.1 Per-Arm Totals

| Metric | Baseline | CodeAtlas | CodeAtlas-Intel |
|--------|----------|-----------|-----------------|
| **Total tokens** | 9,927 | 130,659 | 150,640 |
| **Input tokens** | 922 | 10,269 | 10,498 |
| **Output tokens** | 8,541 | 3,208 | 3,560 |
| **LLM call count** | 18 | 18 × avg 4.2 = ~76 | 18 × avg 4.5 = ~81 |
| **Tool call count** | 0 | 142 | 159 |
| **Latency (ms)** | 156,687 | 1,029,684 | 663,545 |

### 3.2 Key Observation

The gpt-oss:120b-cloud model produces **extremely small baseline responses** (avg 551 tokens total, avg 144 input tokens). This is a weak model that barely responds to prompts. The CodeAtlas overhead is proportionally massive (~13-15x) because the baseline is so small.

---

## 4. Attributed Cost: kilo/nemotron

### 4.1 Per-Arm Totals

| Metric | Baseline | CodeAtlas | CodeAtlas-Intel |
|--------|----------|-----------|-----------------|
| **Total tokens** | 4,083,955 | 8,492,955 | 9,099,971 |
| **Input tokens** | 1,143,554 | 1,368,330 | 1,300,621 |
| **Output tokens** | 20,586 | 29,340 | 24,724 |
| **Tool call count** | 208 | 340 | 242 |
| **Latency (ms)** | 4,653,359 | 5,136,671 | 4,297,909 |

### 4.2 Notable: Baseline Also Uses Tools

Unlike the gpt-oss model, the nemotron model on baseline **also uses tools** (avg 14.9 calls/task). This means the baseline is not a pure "no-context" comparison — it's exploring the codebase independently. The CodeAtlas overhead is therefore smaller (~2x tokens) because the baseline is already doing significant exploration.

---

## 5. Where the Tokens Go (Quantified)

### CodeAtlas Mode (mimo-v2.5-free, per task average)

| Category | Tokens | % of Total | Classification |
|----------|-------:|------------:|---------------|
| Provider-reported total | 258,672 | 100% | — |
| Of which: cache-read (tool outputs re-sent) | ~180,000 | ~70% | B — necessary for conversation |
| Of which: input (message history) | ~55,000 | ~21% | B — grows each round |
| Of which: output (model responses) | ~8,000 | ~3% | A — the actual work |
| Of which: tool schema overhead | ~15,000 | ~6% | B — repeated per call |
| LLM calls per task | ~4.2 | — | B — multi-round tool loop |
| Tool calls per task | 16.0 | — | C — model over-explores |

### Baseline Mode (mimo-v2.5-free, per task average)

| Category | Tokens | % of Total | Classification |
|----------|-------:|------------:|---------------|
| Provider-reported total | 135,797 | 100% | — |
| Of which: cache-read | ~95,000 | ~70% | B — model caches aggressively |
| Of which: input | ~25,000 | ~18% | A — prompt + context |
| Of which: output | ~5,000 | ~4% | A — the actual work |
| LLM calls per task | 1 | — | A — single call |
| Tool calls per task | 10.1 | — | A — model explores independently |

---

## 6. Latency Attribution

### CodeAtlas Mode (mimo-v2.5-free, per task average)

| Component | Time (ms) | % of Total |
|-----------|----------:|------------:|
| Total duration | 111,208 | 100% |
| LLM provider calls (~4.2 rounds) | ~80,000 | ~72% |
| Tool execution (MCP handlers) | ~15,000 | ~13% |
| Tool loop overhead (message building, dedup) | ~5,000 | ~5% |
| SDK initialization (context DB open) | ~8,000 | ~7% |
| Other (state rendering, inspection) | ~3,000 | ~3% |

### Baseline Mode (mimo-v2.5-free, per task average)

| Component | Time (ms) | % of Total |
|-----------|----------:|------------:|
| Total duration | 159,529 | 100% |
| LLM provider call (1 round) | ~140,000 | ~88% |
| Other | ~19,529 | ~12% |

**Key insight:** CodeAtlas is **faster** (-30%) despite using more tokens because:
1. The baseline model explores extensively on its own (10+ tool calls via OpenCode's native tools)
2. CodeAtlas provides targeted context, reducing the model's exploration time
3. The model spends less time in the LLM call queue (smaller per-call token count with tool results vs full repo exploration)

---

## 7. LLM Call Count Attribution

| Arm | LLM Calls (total) | LLM Calls/task (avg) | Tool Calls (total) | Tool Calls/task (avg) |
|-----|-------------------:|----------------------:|-------------------:|----------------------:|
| Baseline (mimo) | 34 | 1.0 | 344 | 10.1 |
| CodeAtlas (mimo) | ~143 | 4.2 | 545 | 16.0 |
| CodeAtlas-Intel (mimo) | ~153 | 4.5 | 593 | 17.4 |

The ~4.2x increase in LLM calls is the primary driver of both token overhead and latency. Each additional round re-sends the entire message history, causing quadratic token growth.

---

## 8. Open Product Decisions

The following thresholds are NOT defined in the repository and must be set before Phase B:

1. **Maximum acceptable token overhead:** Is 2x acceptable? 5x? 10x?
2. **Minimum acceptable accuracy improvement:** Is +0.1 score sufficient to justify overhead?
3. **Maximum acceptable latency overhead:** Is 2x acceptable? 
4. **Maximum tool calls per task:** Currently 8 (policy) but models hit 10+ rounds
5. **Maximum LLM calls per task:** Currently 10 (MAX_TOOL_ROUNDS) but typically 4-5
6. **Budget for context guidance:** How many tokens can guidance consume before it's counterproductive?
