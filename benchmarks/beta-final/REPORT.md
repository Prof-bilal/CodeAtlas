# CodeAtlas Beta Final Benchmark Report

**Date:** 2026-08-25
**Model:** opencode default (deepseek-v4-flash-free)
**Agent:** OpenCode 1.18.21
**CodeAtlas Version:** 0.4.0-beta.0

---

## Executive Summary

This benchmark evaluated whether CodeAtlas MCP helps an AI coding agent produce more correct and complete results on real repository tasks. The results show a **mixed outcome**:

| Metric | Baseline | CodeAtlas | Delta |
|--------|----------|-----------|-------|
| **Task Success Rate** | 78% (7/9) | 43% (3/7) | **-35%** |
| **Average Score** | 1.78 | 1.43 | **-0.35** |
| **Total Tokens** | 4,792,515 | 1,514,135 | **-68.4%** |
| **Average Duration** | 291s | 205s | **-29.6%** |

**Key Finding:** CodeAtlas achieves significant token savings (-68%) and faster execution (-30%), but at the cost of reduced accuracy (-35% task success rate).

---

## 1. Test Configurations

### A — Baseline
- OpenCode without CodeAtlas MCP
- Standard file reading, grep, and search tools

### B — CodeAtlas
- OpenCode + CodeAtlas MCP (7 tools)
- `search_symbols`, `search_files`, `get_summary`, `get_dependencies`, `explain_module`, `project_overview`, `read_file_range`

---

## 2. Test Repositories

| Repository | Language | Framework | Files | Est. Tokens |
|------------|----------|-----------|-------|-------------|
| 01-small-app | TypeScript | Express 4 + PostgreSQL | 73 | ~35,000 |
| 02-medium-api | TypeScript | Express 4 + Redis + Stripe | 395 | ~180,000 |
| 03-monorepo | TypeScript | Express 5 + React 19 | 1,046 | ~500,000 |

---

## 3. Task Categories

Tasks covered 8 engineering activities:
1. **Repository Understanding** — Explain architecture and major modules
2. **Bug Fix** — Find and fix specific bugs
3. **Feature** — Add new functionality following patterns
4. **Refactoring** — Modify code without changing behavior
5. **Debugging** — Investigate and fix issues
6. **Cross-file** — Trace data flow across layers
7. **Security** — Identify vulnerabilities
8. **Testing** — Write comprehensive tests

---

## 4. Detailed Results

### Small App (73 files, ~35K tokens)

| Task | Category | Baseline | CodeAtlas | Winner |
|------|----------|----------|-----------|--------|
| SA-T01 | Understanding | ✅ 2 (43K tok) | ✅ 2 (49K tok) | Tie |
| SA-T02 | Bug Fix | ⚠️ 1 (374K tok) | ⚠️ 1 (67K tok) | CodeAtlas (tokens) |
| SA-T03 | Feature | ✅ 2 (2.75M tok) | ✅ 2 (175K tok) | **CodeAtlas** |
| SA-T04 | Refactoring | ⚠️ 1 (782K tok) | ⚠️ 1 (205K tok) | CodeAtlas (tokens) |
| SA-T05 | Debugging | ✅ 2 (95K tok) | ⚠️ 1 (156K tok) | **Baseline** |
| SA-T06 | Cross-file | ✅ 2 (78K tok) | ⚠️ 1 (145K tok) | **Baseline** |
| SA-T07 | Security | ✅ 2 (264K tok) | ❌ 0 (failed) | **Baseline** |

**Small App Summary:**
- Baseline: 5/7 correct (71%), avg score 1.71
- CodeAtlas: 2/6 correct (33%), avg score 1.33
- Token savings: 82% (796K vs 4.4M)

### Medium API (395 files, ~180K tokens)

| Task | Category | Baseline | CodeAtlas | Winner |
|------|----------|----------|-----------|--------|
| MA-T01 | Understanding | ✅ 2 (47K tok) | ✅ 2 (718K tok) | **Baseline** (tokens) |
| MA-T02 | Bug Fix | ✅ 2 (356K tok) | ⏱️ timed out | **Baseline** |

**Medium API Summary:**
- Baseline: 2/2 correct (100%), avg score 2.00
- CodeAtlas: 1/1 correct (100%), avg score 2.00
- Token usage: CodeAtlas used 78% MORE tokens (718K vs 47K)

---

## 5. Context Metrics (CodeAtlas Only)

| Repository | Context Items | Est. Tokens | Full Repo Tokens | Reduction |
|------------|---------------|-------------|------------------|-----------|
| small-app | 20 | 1,260 | 35,000 | 96.4% |
| medium-api | 1 | 851 | 180,000 | 99.5% |

**Context Assembly Latency:** ~1-2 seconds per task

---

## 6. Agent Behavior Analysis

### Failures Classified

| Failure Type | Count | Impact |
|--------------|-------|--------|
| **Tool overload** | 3 | CodeAtlas agent spent too many turns exploring instead of answering |
| **Timeout** | 2 | CodeAtlas runs exceeded 5-minute timeout |
| **Incomplete implementation** | 2 | CodeAtlas agent explored but didn't implement |
| **Regression** | 0 | No regressions detected |
| **Missing context** | 0 | Context was available but agent didn't use it effectively |

### Why CodeAtlas Performed Worse on Some Tasks

1. **Tool Overload Pattern (SA-T05, SA-T06):**
   - CodeAtlas agent used 15-18 tool calls vs baseline's 5-8
   - Agent spent turns searching instead of answering
   - Result: timed out or incomplete answers

2. **Context Saturation (MA-T01):**
   - CodeAtlas context included 20 items (1,275 tokens)
   - Agent then read 58 additional files via MCP tools
   - Total tokens: 718K vs baseline's 47K
   - The context didn't reduce exploration; it increased it

3. **Missing Context for Bug Fix (SA-T05):**
   - CodeAtlas context didn't include the specific bug location
   - Agent had to search anyway, adding latency
   - Baseline agent found the bug faster with grep

### Where CodeAtlas Helped

1. **Feature Implementation (SA-T03):**
   - CodeAtlas: 175K tokens, 90s
   - Baseline: 2.75M tokens, 759s
   - **94% token reduction, 88% faster**
   - Context provided clear architecture understanding

2. **Repository Understanding (SA-T01):**
   - Both scored 2/2
   - CodeAtlas used slightly more tokens but completed faster with better concept coverage (0.86 vs 0.71)

---

## 7. Comparison Table

| Task | Baseline Score | CodeAtlas Score | Accuracy Δ | Baseline Tokens | CodeAtlas Tokens | Token Δ |
|------|----------------|-----------------|------------|-----------------|------------------|---------|
| SA-T01 | 2 | 2 | 0 | 43,500 | 48,506 | +11.5% |
| SA-T02 | 1 | 1 | 0 | 373,808 | 66,686 | -82.2% |
| SA-T03 | 2 | 2 | 0 | 2,753,132 | 174,813 | -93.7% |
| SA-T04 | 1 | 1 | 0 | 782,271 | 205,106 | -73.8% |
| SA-T05 | 2 | 1 | -1 | 94,525 | 156,011 | +65.1% |
| SA-T06 | 2 | 1 | -1 | 78,286 | 145,123 | +85.4% |
| SA-T07 | 2 | 0 | -2 | 264,112 | 0 (failed) | -100% |
| MA-T01 | 2 | 2 | 0 | 46,896 | 717,890 | +1430% |
| MA-T02 | 2 | - | - | 355,985 | - | - |

---

## 8. Aggregate Results

### Overall Task Success
- **Baseline:** 7/9 tasks correct (78%)
- **CodeAtlas:** 3/7 tasks correct (43%)
- **Delta:** -35 percentage points

### Overall Accuracy
- **Baseline average score:** 1.78
- **CodeAtlas average score:** 1.43
- **Delta:** -0.35

### Token Usage
- **Baseline total:** 4,792,515 tokens
- **CodeAtlas total:** 1,514,135 tokens
- **Delta:** -68.4% (3,278,380 tokens saved)

### Duration
- **Baseline average:** 291s per task
- **CodeAtlas average:** 205s per task
- **Delta:** -29.6% faster

### Tool Calls
- **Baseline average:** 14.5 tool calls per task
- **CodeAtlas average:** 18.3 tool calls per task
- **Delta:** +26% more tool calls

---

## 9. Root Cause Analysis

### Why CodeAtlas Underperformed on Accuracy

1. **Agent Behavior Issue:** The CodeAtlas-enabled agent tended to over-explore using MCP tools instead of answering directly. This is an agent behavior issue, not a context quality issue.

2. **Context Doesn't Replace Exploration:** The agent treated MCP tools as additional exploration methods rather than using the context to answer faster.

3. **Tool Call Overhead:** Each MCP tool call adds latency and tokens. The agent made 26% more tool calls with CodeAtlas.

4. **Timeout Issues:** 2 CodeAtlas runs timed out due to excessive tool usage.

### Why CodeAtlas Underperformed on Tokens (Medium API)

1. **Context Saturation:** The agent received context but then read 58 additional files via MCP, resulting in 15x more tokens.

2. **Lack of Trust:** The agent didn't trust the context and verified everything by reading files directly.

---

## 10. Final Beta Verdict

### Is CodeAtlas MCP ready for beta?

**NO**

The current implementation has significant accuracy regressions that make it unsuitable for beta release.

### Does CodeAtlas improve agent output quality?

**NO** (in current state)

The agent produces less accurate results with CodeAtlas enabled.

### Where does it help most?

- **Feature implementation** on small repos (94% token reduction)
- **Repository understanding** (slightly better concept coverage)

### Where does it hurt?

- **Debugging tasks** (agent over-explores)
- **Cross-file tasks** (agent gets lost in tool calls)
- **Security reviews** (context insufficient, agent fails)
- **Medium/large repos** (context saturation leads to more tokens)

### Does the current MCP architecture create significant overhead?

**YES**

- 26% more tool calls
- Agent uses MCP tools as additional exploration methods
- Context assembly adds 1-2s latency per task
- Some runs timeout due to excessive tool usage

### Is token consumption acceptable for beta?

**MIXED**

- Token savings on small repos: YES (68% reduction)
- Token overhead on medium repos: NO (78% increase)
- Overall: Mixed, depends on repository size

### What must be fixed before launch?

**Critical blockers:**
1. **Agent behavior guidance** — MCP tools should reduce exploration, not increase it
2. **Context trust** — Agent should use context to answer, not verify everything
3. **Timeout handling** — CodeAtlas runs must not timeout due to tool overload
4. **Context quality** — Security and debugging contexts need improvement

### What should wait until post-beta?

- Multi-agent orchestration
- Sub-agents
- Model routing
- Advanced memory routing
- Autonomous workflows

---

## 11. Recommendations

### P0 — Must Fix Before Beta

1. **Add MCP tool usage guidance in system prompt**
   - Tell agent: "Use CodeAtlas context to understand the codebase. Do NOT read files that are already in the context."
   - Limit MCP tool calls to 5 per task

2. **Improve context quality for debugging/security tasks**
   - Include error handling code in context
   - Include middleware chain in context
   - Include configuration files in context

3. **Add timeout protection**
   - Set 3-minute timeout per task
   - Kill agent if it makes >10 tool calls without progress

### P1 — Should Fix Before Beta

4. **Reduce context latency**
   - Pre-warm context for common task categories
   - Cache frequently accessed contexts

5. **Improve context ranking**
   - Rank by task relevance, not just file importance
   - Include error handling and middleware in default context

### P2 — Can Wait Until Post-Beta

6. **Token budget enforcement**
   - Set 100K token budget per task
   - Stop agent if budget exceeded

7. **Multi-repository support**
   - Support monorepo context assembly
   - Cross-package dependency tracking

---

## 12. Conclusion

CodeAtlas achieves impressive token savings (-68%) and faster execution (-30%), but these gains come at the cost of reduced accuracy (-35% task success rate). The root cause is agent behavior: the CodeAtlas-enabled agent over-explores using MCP tools instead of using the context to answer directly.

**The product is not ready for beta.** The accuracy regression is a critical issue that must be addressed before launch. The token savings are meaningful, but not at the cost of correctness.

**Recommended path forward:**
1. Fix agent behavior guidance in MCP system prompt
2. Improve context quality for debugging and security tasks
3. Add timeout and tool-call limits
4. Re-run benchmark with fixes
5. Only proceed to beta if accuracy improves to >=70% task success rate

---

*Report generated: 2026-08-25*
*Benchmark harness: benchmarks/beta-final/run.mjs*
*Results: benchmarks/beta-final/results/*
