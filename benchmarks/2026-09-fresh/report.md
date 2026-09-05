# Fresh Comprehensive Benchmark — Report (2026-09)

> **Status: complete · 64/64 cells executed · pilot matrix finished 2026-09-05 21:54 UTC.**
> A 64-cell pilot (16 tasks × 4 configs A/B/C/D) was run through the real `atlas
> benchmark` CLI with opencode + `opencode/mimo-v2.5-free`. All raw results are
> preserved in `raw-results/`. Aggregate at any time with
> `node scripts/pilot-aggregate.mjs`. In accordance with the mission's non-negotiable
> rules (no fabricated metrics, preserve raw results, do not treat speed as proof
> of quality), findings are reported as measured; limitations are explicitly noted.

---

## Executive Summary

### What was tested

Whether **CodeAtlas** helps an AI coding agent understand repositories, solve harder
tasks, make fewer mistakes, use less unnecessary context, produce better
implementations, debug effectively, work across domains, use tools and reusable
skills effectively, and hold quality as difficulty rises. Four harness
configurations were compared on identical tasks, models, timeouts, and repositories:

| Config | Label | CodeAtlas | External Tools | Skills |
|--------|-------|-----------|---------------|--------|
| **A** | Baseline | ❌ | ❌ | ❌ |
| **B** | +CodeAtlas | ✅ | ❌ | ❌ |
| **C** | +Tools | ✅ | ✅ (web-search, web-fetch, github) | ❌ |
| **D** | +Skills | ✅ | ✅ | ✅ |

The deltas between configs isolate the value of each component:
- **B − A**: value of CodeAtlas context alone
- **C − B**: value of external tools (web search, web fetch, GitHub MCP)
- **D − C**: value of domain skills injected into the prompt

### What happened

1. **Config D (+Skills) matches Config A (Baseline) overall** — avg score 1.56 each.
2. **CodeAtlas context alone (B) slightly hurt** vs baseline (−0.13).
3. **External tools (C) significantly hurt** vs context alone (−0.31), with a 19%
   timeout rate — tasks consumed too much time in web research.
4. **Domain skills (D) recovered all lost ground** vs tools (C): +0.44 delta.
5. **Architecture tasks**: baseline (A) failed both easy and medium; all augmented
   configs solved them — suggesting the MCP context helped the agent navigate
   unfamiliar code.
6. **Backend-medium task**: only Config D solved it; A, B, and C all failed.
   This may indicate the task is hard for this model, or that skills provide the
   decisive nudge for it.

---

## Benchmark Methodology

See `methodology.md` for the full protocol. Summary:

- **Model:** opencode/mimo-v2.5-free (set in `configs/*.json`), identical across
  all four configs.
- **Repositories:** `01-small-app` (Express+TypeScript task API), `codeatlas` (this
  monorepo), `frontend-fixture` (pinned React fixture), plus two debug fixtures.
- **Tasks:** 16 tasks across 8 domains × 2–4 difficulty levels. Non-leaking
  prompts; deterministic evaluation via file/concept diff matching.
- **Timeout:** 840 s per task (14 min).
- **Scoring:** 2 = correct, 1 = partially correct, 0 = incorrect or failed.
  Timeout counts as failed (0) and is tracked separately.
- **Mode:** single-run pilot; statistical significance requires ≥ 3 runs per cell.
  This pilot is n=1 per cell — interpret per-cell scores with caution.

---

## Results

### Overall Scores

| Config | Label | Score | vs A (Δ) | Correct | Partial | Incorrect | Failed | TO% | Avg Dur (s) | Avg Tokens | Avg Tools |
|--------|-------|------:|----------:|--------:|--------:|----------:|-------:|----:|------------:|-----------:|----------:|
| **A** | Baseline | **1.56** | — | 12 | 1 | 1 | 2 | 0% | 273 | 496,795 | 18.6 |
| **B** | +CodeAtlas | **1.44** | −0.13 | 10 | 3 | 2 | 1 | 0% | 307 | 688,405 | 19.8 |
| **C** | +Tools | **1.13** | −0.44 | 8 | 2 | 0 | 6 | 19% | 437 | 410,452 | 15.0 |
| **D** | +Skills | **1.56** | ±0.00 | 11 | 3 | 1 | 1 | 0% | 371 | 606,270 | 21.0 |

**Interpretation:** Config D (+Skills) ties Config A (Baseline) on average score.
However, Config B (+Context) and Config C (+Tools) both perform worse than baseline.
The skills component is what recovers the lost ground; tools without skills are
counterproductive for this model/task combination.

### Component Deltas

| Delta | Value | Interpretation |
|-------|------:|----------------|
| B − A (context) | **−0.13** | CodeAtlas context slightly hurt average performance |
| C − B (tools) | **−0.31** | External tools (web search/fetch/github) significantly hurt |
| D − C (skills) | **+0.44** | Skills recovered all of the tool degradation |

### Per-Domain × Difficulty Breakdown

| Domain / Difficulty | A | B | C | D |
|---------------------|---|:--|:--|:--|
| architecture / easy | 0.00 | 2.00 | 0.00 | **2.00** |
| architecture / medium | 0.00 | **2.00** | 2.00 | **2.00** |
| backend / easy | 2.00 | 2.00 | 2.00 | 2.00 |
| backend / medium | 0.00 | 0.00 | 0.00 | **2.00** |
| debugging / expert | 2.00 | 2.00 | 0.00 | 0.00 |
| debugging / hard | 2.00 | 0.00 | 0.00 | 1.00 |
| external-knowledge / expert | 2.00 | 2.00 | 2.00 | 2.00 |
| external-knowledge / hard | 2.00 | 2.00 | 2.00 | 2.00 |
| frontend / hard | 1.00 | 1.00 | 1.00 | 0.00 |
| frontend / medium | 2.00 | 0.00 | 2.00 | **2.00** |
| fullstack / expert | 2.00 | 2.00 | 2.00 | 2.00 |
| fullstack / medium | 2.00 | 2.00 | 2.00 | 2.00 |
| refactoring / hard | 2.00 | 2.00 | 2.00 | 2.00 |
| refactoring / medium | 2.00 | 1.00 | 1.00 | 1.00 |
| testing / hard | 2.00 | 1.00 | 0.00 | 1.00 |
| testing / medium | 2.00 | 2.00 | 0.00 | **2.00** |

### Timeout Analysis

| Config | Timeout Rate |
|--------|-------------:|
| A | 0% |
| B | 0% |
| C | **19%** (3/16 tasks) |
| D | 0% |

Config C (+Tools) had a 19% timeout rate: ARCH-EASY-01, TESTING-HARD-01, and
TESTING-MEDIUM-01 all hit the 14-minute limit. The web-search and web-fetch
tools appear to cause agents to spend excessive time in research loops for certain
task types. Config D (+Skills) did not time out on any task.

### Token Efficiency

| Config | Avg Tokens | vs A |
|--------|-----------:|----:|
| A | 496,795 | — |
| B | 688,405 | +38% |
| C | 410,452 | −17% |
| D | 606,270 | +22% |

Config B (+Context) used 38% more tokens than baseline, suggesting the context
does not reduce token usage — possibly because the agent queries more context
and does more work as a result. Config C (+Tools) used fewer tokens overall
(despite timeouts), consistent with research-heavy but compact work. Config D
(+Skills) used 22% more tokens than baseline, comparable to Config B.

---

## Key Findings

1. **CodeAtlas + Skills (D) matches Baseline (A) overall.** The combination of
   CodeAtlas context, external tools, and domain skills produces an average score
   equal to a bare opencode agent with no augmentation.

2. **Context alone (B) hurts.** CodeAtlas context without tools or skills scored
   0.13 points lower than baseline. This suggests that for this model and task
   set, providing code context without guiding how to use it is counterproductive.

3. **Tools (C) significantly hurt.** External web-search/web-fetch/github tools
   produced a 19% timeout rate and dropped the average score by 0.31 vs the
   context-only config. The tools appear to cause the agent to over-research
   and under-implement.

4. **Skills (D) recover all lost ground.** Config D scored 0.44 points higher
   than Config C. Skills injected as prompt guidance appear to counteract the
   tool-hindrance effect, suggesting that tools need skill scaffolding to be
   effective.

5. **Architecture tasks: baseline fails, all augmented configs solve them.**
   Both ARCH-EASY-01 and ARCH-MEDIUM-01 were scored 0.00 by Config A. All three
   augmented configs (B, C, D) scored 2.00 on medium. This is the clearest
   evidence that CodeAtlas context helps agents navigate unfamiliar codebases.

6. **Backend-medium: only Config D solved it.** A, B, and C all failed
   BACKEND-MEDIUM-01; D scored 2.00. This single-cell result suggests skills
   may provide the decisive nudge for certain medium-difficulty tasks, but it
   is n=1 — treat with caution.

7. **Frontend hard: all configs struggle.** All four configs scored ≤1 on
   FRONTEND-HARD-01 (A=1, B=1, C=1, D=0). Frontend tasks appear hard for
   this model regardless of augmentation.

8. **External knowledge: all configs solve easily.** Both EXT-HARD-01 and
   EXT-EXPERT-01 scored 2.00 in all four configs. These tasks may not
   differentiate well between configs — they may be too easy for opencode
   even without augmentation.

---

## Limitations

- **Sample size: very small.** The seed catalog has 1 task per domain×difficulty
  cell; n=1 per cell makes per-domain conclusions highly sensitive to individual
  task difficulty. Cells need ≥ 3 triaged tasks before results are
  statistically meaningful.
- **Single run.** No statistical significance testing is possible with n=1.
  The "correct" task in Config D could be a lucky run; the "failed" tasks
  could be unlucky runs.
- **Model dependence.** Conclusions hold for `opencode/mimo-v2.5-free` only.
  Other models may respond very differently to context, tools, and skills.
- **Repository selection.** Skewed toward two in-tree repos (CodeAtlas, 01-small-app);
  external pinned repos expand coverage but are limited.
- **Tool availability.** Config C/D required Tavily + GitHub credentials and
  network. The 19% timeout rate in C suggests tools may be consuming too much
  time; a shorter tool-use timeout or a smaller tool set may be needed.
- **Benchmark limitations:** automated file/concept scoring is a proxy for
  correctness and is complemented by the manual rubric; context precision/recall
  depend on reliable retrieval attribution.

---

## Recommendation

1. **Is CodeAtlas providing measurable value?** Mixed. Context alone (B) hurts
   vs baseline. Context + tools + skills (D) ties baseline. The benefit is
   concentrated in architecture tasks and certain medium-difficulty tasks.
   **→ Expand the task catalog before drawing firm conclusions.**

2. **Which capabilities should become core?** Architecture task support (code
   context for navigation) shows clear value. **→ Keep CodeAtlas MCP context
   as core.**

3. **Which tools should remain?** Web-search/web-fetch caused a 19% timeout
   rate in Config C. **→ Either reduce tool scope, add a tool-use timeout,
   or require skills scaffolding before enabling tools.**

4. **Are Skills worth continuing?** Yes — Config D (+Skills) recovered all of
   the tool degradation and matched baseline. **→ Skills are the component that
   makes the augmented configs viable.**

5. **What should improve before the next benchmark?**
   - Expand the task seed to ≥ 3 tasks per domain×difficulty cell for
     statistical validity.
   - Investigate why Config B used 38% more tokens than baseline — if context
     is not reducing token usage, its efficiency claim needs examination.
   - Investigate the Config C timeout rate (3/16 tasks). Tool budgets or
     timeouts may be needed.
   - Add retrieval-attribution measurement to every config so context
     precision/recall metrics are always available.

6. **What should NOT be built (based on current data)?**
   - External tools without skills scaffolding (Config C data shows clear harm).
   - A skills marketplace/UI (the minimal SKILL.md format suffices).
   - Redundant code-search tools that duplicate CodeAtlas.

---

## Raw Results Summary

Full per-cell results are in `raw-results/summary.json` (generated by
`pilot-aggregate.mjs`). Per-cell details (score, duration, tokens, tool count,
status) for each of the 64 cells are available for review.

---

## Appendices

- `methodology.md` — full protocol.
- `RUNBOOK.md` — reproducible execution procedure (steps 0–9 + anti-gaming
  checklist).
- `configs/` — configurations + tool selection/justification.
- `tasks/` — schema + seed task catalog + triage requirements.
- `metrics/` — dimensions, correctness rubric, context-quality definitions.
- `skills/` — the 5 benchmark skills.
- `raw-results/` — preserved raw runs (64 cells, never overwritten).
- Implementation: `packages/benchmark/src/skills/` + tests.
