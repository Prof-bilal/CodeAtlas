# CodeAtlas Beta Audit — Executive Summary

**Date:** August 25, 2026  
**Status:** AUDIT COMPLETE | NOT BETA READY  
**Model:** OpenCode 1.18.21 + deepseek-v4-flash-free  

---

## The Problem in One Sentence

CodeAtlas context is assembled correctly, but agents ignore it and over-explore with MCP tools, producing worse results (35pp accuracy drop) despite 68% token savings.

---

## The Numbers

| Metric | Baseline | CodeAtlas | Delta |
|--------|----------|-----------|-------|
| Task Success | 7/9 (78%) | 3/7 (43%) | **-35pp** |
| Avg Score | 1.78 | 1.43 | **-0.35** |
| Total Tokens | 4.79M | 1.51M | **-68%** (misleading) |
| Avg Duration | 291s | 205s | **-30%** |
| Tool Calls/Task | 14.5 | 18.3 | **+26%** |
| Task Failures | 2 | 4 | **+100%** |

**Key finding:** Aggregate token savings hide per-task explosions. Task MA-T01 used **+1,430% tokens** (47K → 718K) despite 99.5% context reduction.

---

## Why It Failed

### Root Cause: Agent Behavior, Not Context Quality

CodeAtlas does what it's supposed to do:
- ✅ Assembles focused context (96–99% reduction vs full repo)
- ✅ Finds relevant files quickly (1–2s per task)
- ✅ Ranks by relevance correctly

But agents:
- ❌ Receive context but don't trust it
- ❌ Use MCP tools as exploration methods (18 calls) instead of context shortcuts (5 calls)
- ❌ Read 58+ additional files after context is provided
- ❌ Spend time in tool loops instead of answering

### The Loop

```
Agent receives context → doesn't know if it's complete → 
searches anyway → finds similar results → searches again with different keywords → 
results are familiar → searches a 3rd time → 15+ calls later → times out or gives up
```

---

## What's Wrong (10 Critical Loopholes)

| # | Loophole | Impact | Fix Time |
|---|----------|--------|----------|
| 1 | No repeated-query detection | Agent searches same thing 3+ times | 1 day |
| 2 | No progress detection | Agent hits max rounds without learning | 1 day |
| 3 | No per-tool limits | Agent can call search_symbols 10 times | 1 day |
| 4 | Context doesn't signal task relevance | Debugging context misses error handlers | 2 days |
| 5 | No freshness invalidation | Agent uses stale line numbers | 1 day |
| 6 | Tool descriptions are technical, not behavioral | Agent can't decide which tool to call | 1 day |
| 7 | Context budget not surfaced | Agent doesn't know context is incomplete | 1 day |
| 8 | Tool overlap not documented | search_symbols + search_files confuse agent | 1 day |
| 9 | No MCP security deny-filter | Agent can read .env, secrets.json | 1 day |
| 10 | Benchmark hides failures | Leadership sees 68% savings, misses 4 failed tasks | 1 day |

---

## Where CodeAtlas Helped vs. Hurt

### ✅ CodeAtlas Wins (2/9 tasks)

**Task SA-T03 (Feature Implementation):**
- Baseline: 2.75M tokens, 759s
- CodeAtlas: 175K tokens, 90s
- **Result:** 94% fewer tokens, 88% faster, score 2/2
- **Why:** Clear architecture context + simple feature let agent implement directly

**Task SA-T01 (Repository Understanding):**
- Both scored 2/2
- CodeAtlas slightly faster with better concept coverage
- **Why:** Context gave full overview; agent didn't need to explore

### ❌ CodeAtlas Failures (4/9 tasks)

**Task SA-T05 (Debugging):**
- Baseline: 94K tokens, score 2/2
- CodeAtlas: 156K tokens, score 1/2
- **Why:** Bug wasn't in provided context; agent had to search anyway + spent 15+ tool calls in failed loops

**Task SA-T06 (Cross-file):**
- Baseline: 78K tokens, score 2/2
- CodeAtlas: 145K tokens, score 1/2
- **Why:** Agent over-explored, called tools 18 times, failed to connect pieces

**Task SA-T07 (Security):**
- Baseline: 264K tokens, score 2/2
- CodeAtlas: Failed/timeout
- **Why:** Security context insufficient (missing config, auth logic); agent explored without progress

**Task MA-T01 (Understanding, medium repo):**
- Baseline: 47K tokens, score 2/2
- CodeAtlas: 718K tokens, score 2/2
- **Why:** Context was only 1.2K tokens; agent then read 58 additional files via tools (15x explosion)

### 🟡 Tie (3/9 tasks)

Same accuracy, mixed tokens.

---

## The Fix (Priority Order)

### P0 — Must Do Before Beta (10 days total)

1. **Agent Behavior Guidance** (1–2 days)
   - System prompt: "Use provided context to answer. Call tools only for missing information."
   - Limit tool calls to 5 per task.
   - Rewrite tool descriptions with decision trees.

2. **Repeated-Query Detection** (1 day)
   - Track prior searches in tool loop.
   - Return "You already searched for this; here's what you found" on duplicates.

3. **Progress Detection** (1 day)
   - If last 2 rounds added <5% new tokens, signal: "Diminishing returns; recommend answering now."

4. **Task-Aware Context Ranking** (2 days)
   - Debug tasks include error handlers + middleware.
   - Security tasks include config + auth.
   - Architecture tasks include module structure.

5. **Per-Tool Call Limits** (1 day)
   - Extend `ToolCallPolicy`: `search_symbols: 2`, `search_files: 2`, `read_file_range: 5`.

6. **Freshness Invalidation** (1 day)
   - Track file hashes; detect staleness; re-search if needed.

7. **Security Deny-Filter for Tools** (1 day)
   - Refuse to read `.env*`, `secrets.json`, private keys.

8. **Benchmark Methodology** (1 day)
   - Report per-task metrics, not just aggregates.
   - Highlight failures, not just savings.

9. **Re-run Benchmark** (2 hours)
   - Verify fixes improve accuracy and reduce tool calls.

### P1 — Important Before Beta (3–5 days)

- Freshness metadata in tool results
- Per-tool latency tracking
- Monorepo context assembly
- Timeout policy configuration
- Context versioning

### P2 — Post-Beta (2–3 weeks)

- Vector/semantic search
- Multi-language parsers
- Browser-based UI
- Distributed indexing

---

## Success Criteria for Beta Ready

**ALL of these must be true:**

1. ✅ Accuracy ≥70% (currently 43%; need +27pp improvement)
2. ✅ Tool calls drop to baseline ±2 (currently 18.3; need ≤16.5)
3. ✅ No medium-repo token explosion (currently 718K; need ≤2K for context, ≤10K total from tools)
4. ✅ Zero timeouts
5. ✅ No security regressions (secret files never exposed)
6. ✅ Benchmark honest (per-task breakdown, no aggregate hiding)

---

## Timeline to Beta

| Phase | Duration | Outcome |
|-------|----------|---------|
| Implement P0 fixes | 10 days | Code ready for testing |
| Re-run beta benchmark | 1 day | Collect new metrics |
| Analysis & iteration | 3 days | Address any remaining issues |
| **Total to Beta Ready** | **~2 weeks** | Launch-ready CodeAtlas |

---

## What NOT to Do

❌ **Don't ignore the 35pp accuracy regression** — it's real and critical.  
❌ **Don't publish "68% token savings" without context** — 4/9 tasks got worse.  
❌ **Don't add more tools** — problem isn't tools, it's how agents use them.  
❌ **Don't hard-limit timeouts** — fix exploration loops first, then set reasonable timeouts.  
❌ **Don't ship with current agent behavior** — agents need guidance.

---

## Next Steps

1. **Share this audit with engineering** → Align on fixes
2. **Implement P0 fixes** → 10 days
3. **Re-benchmark** → 1 day
4. **Review results** → 1 day
5. **If success** → Ship beta
6. **If still issues** → Iterate on P1 items

---

## Files Changed (Proposed)

- `packages/mcp/src/tools.ts` — Rewrite descriptions
- `packages/mcp/src/handlers.ts` — Add deny-filter
- `packages/sdk/src/context-tools/tool-loop.ts` — Add memory, progress detection, limits
- `packages/sdk/src/context-tools/types.ts` — Extend `ToolCallPolicy`
- `packages/context/src/context-builder.service.ts` — Task-aware ranking
- `benchmarks/beta-final/run.mjs` — Report methodology
- `docs/CURRENT_STATE.md` — Update status
- `AGENTS.md` — Update guidance

---

**Bottom Line:** CodeAtlas works. Agents don't know how to use it. Fix the guidance, re-run benchmark, ship beta.

*Audit conducted: 2026-08-25*  
*Full remediation plan: BETA_AUDIT_REMEDIATION_PLAN.md*
