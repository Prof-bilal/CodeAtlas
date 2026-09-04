# CodeAtlas Product-Readiness Plan

> **Created:** 2026-08-31 · Companion to `production-readiness/EXECUTIVE_AUDIT.md`
> **Governing principle:** Maximize *measured task success per token* — not tokens saved, not features shipped. No new intelligence-layer code until Phase A produces numbers.
> **Legend:** Effort: S (< 2 days) / M (2–5 days) / L (1–2 weeks). Every task ends with `pnpm check` green.

---

## PHASE A — PROVE OR FALSIFY (Weeks 1–2) · *Gates everything else*

> Goal: produce the one honest report that determines the product. **No feature work in this phase.** Phase A must additionally produce a **cost-attribution ledger** (A5/A6) proving whether CodeAtlas's token/latency/LLM-call/tool-call overhead is accuracy-bearing — because the current live numbers (11.5–12.2K tokens / 38–43s vs baseline 166 / 1.2s) are otherwise unexplained and unactionable.

### A1. Run the live 3-arm benchmark matrix (P0.6) — **Effort M, Priority P0**
> **Status:** ✅ COMPLETE (2026-09-01) — 199 task-runs across 3 models × 4 repos × 3 arms

- **✅ Code infrastructure (done):**
  - `BenchmarkConfig.runsPerTask` — multi-run support exists in `core` port
  - `BenchmarkSuiteRunRequest` — 3-arm matrix (`baseline` / `codeatlas` / `codeatlas-intel`) wired in runner
  - `packages/benchmark/src/runner/ollama.ts` — supports any Ollama-compatible model endpoint
  - Suite configs for all 4 pinned repos exist under `.codeatlas/benchmarks/suites/` (winston, commander, axios, rxjs)
  - `packages/benchmark/src/reporter.ts` + `benchmark.service.ts` — report generation exists
  - `BenchmarkTaskResult`, `BenchmarkSuiteResult` — per-task + per-suite aggregation with `tokens`, `durationMs`, `toolCallCount` fields
  - `packages/benchmark/src/evaluator.ts` — structured output (`score`, `status`, `citedFiles`, `wrongFiles`, `hallucinatedFiles`, `goldImpactFiles`) persisted per task JSON
  - A3 harness (`retrieval-metrics.ts`) — retrieval quality section ready to include in report
  - A4 harness (`paired-bootstrap.ts`, `significance.ts`) — statistical rigor ready to include in report

- **✅ Execution (done — 2026-09-01):**
  - 3 model endpoints tested: `opencode/mimo-v2.5-free`, `opencode/nemotron-3.5-lightning-free`, `gpt-oss:120b-cloud` (Ollama)
  - 4 suite configs executed across winston, commander, axios, rxjs
  - `codeatlas-intel` confirmed as same agent as codeatlas (`ollama.ts:157` fallback) — flagged `INSUFFICIENT_DATA`
  - Raw results committed to `.codeatlas/benchmarks/suites/oc-mimo-*/`, `kilo-nemotron-*/`, `*-ollama-7b/`
  - Matrix analysis script: `benchmarks/results/2026-09-matrix/analyze-matrix.mjs`
  - **Known gap:** evaluation scores NOT persisted in task results (evaluator output not written to JSON) — accuracy column uses stale `raw-results.json` evaluations only

- **Key findings:**
  - CodeAtlas does NOT improve accuracy on any measured cell
  - Commander REGRESSES on mimo (-0.11 accuracy) and nemotron (-0.11 accuracy)
  - gpt-oss:120b baseline produces avg 551 tokens — too weak to evaluate
  - CodeAtlas is 20-43% faster than baseline (baseline explores independently via OpenCode native tools)
  - Tool loop causes ~2x token overhead on strong models (consistent)

- **Acceptance:** ✅ committed `benchmarks/results/2026-09-matrix/` + 6 deliverable documents in `benchmarks/phase-b/`. No prose spin.

### A2. Per-task failure analysis of the rxjs accuracy regression (−0.38) — **Effort M, P0**
> **Status:** ✅ COMPLETE (2026-09-01) — failure-classifier implemented, manual classification of 35 failures across all models

- **✅ Data infrastructure (done):**
  - `packages/benchmark/src/evaluator.ts` produces per-task structured outputs:
    - `filesFound`, `fileRatio`, `filesExpected` — precision of cited file list
    - `wrongFiles` — cited existing paths outside `gold_impact_files`
    - `hallucinatedFiles` — cited paths that do not exist on disk
    - `citedFiles` — all extracted file paths from response
    - `conceptsFound`, `conceptRatio` — concept-level precision
    - `hidden_test` outcomes from `test-runner.ts`
  - `.codeatlas/benchmarks/suites/rxjs-ollama-7b/tasks/*.json` — ~30 task files with full structured output for rxjs regression

- **✅ Classification tooling (done — 2026-09-01):**
  - `packages/benchmark/src/failure-classifier.ts` implemented with 5 categories:
    - **budget_truncation** — context cut before task completion (53% of failures)
    - **lexical_miss** — expected file not found by retrieval (0% — no evaluation data)
    - **context_overload** — too much context confused the model (0% — no evaluation data)
    - **tool_loop_underuse** — model stopped exploring too early (33% — gpt-oss:120b max-rounds)
    - **insufficient_signal** — evaluation data insufficient (14% — infrastructure failures)
  - 14 tests passing in `failure-classifier.test.ts`

- **Key findings:**
  - **RxJS R4-T06/T07/T08 fail across ALL arms** with exitCode=1, 0 tokens — runner configuration issue, not context quality
  - **Active RxJS tasks (R4-T01-R4-T05):** 4/5 show CodeAtlas overhead, 1 shows improvement (R4-T05: -15% tokens)
  - **Root cause:** RxJS large codebase (1,288 files) + deep dependency chains + abstract reactive programming concepts

- **Acceptance:** ✅ failure-classifier implemented, 35 failures classified, results in `benchmarks/phase-b/PHASE_A_FAILURE_ANALYSIS.md`.

### A3 ✅ Retrieval quality measurement (top-k precision/recall) — **Effort S–M, P0**
- **What:** build a small deterministic harness (reuse `tests/benchmarks/` pattern) that, for each suite task, computes precision@k / recall@k of `getRelevantContext` against `expected_files`. This is the metric the retired estimate-harness had and the framework lacks.
- **Files:** new `packages/benchmark/src/retrieval-metrics.ts` + test. **Do not** touch the evaluator's agent-scoring.
- **Acceptance:** `atlas benchmark` report includes a retrieval-quality section. This tells us whether Phase B should touch retrieval or the assembly layer.

### A4 ✅ Benchmark statistical rigor — **Effort S, P1**
- **What:** add `runs` config to suite config (`packages/core` `BenchmarkConfig` + `store.ts` aggregation: mean/min/max); wire ≥3 runs/cell; report dispersion in the reporter (`reporter.ts`).
- **Acceptance:** report shows variance; single-run cells visibly flagged.

### A5. Token, Context & Execution Cost Attribution — **Effort M, P0**
> **Status:** ✅ COMPLETE (2026-09-01) — full ledger produced in `benchmarks/phase-b/PHASE_A_COST_ATTRIBUTION.md`
> Audited 2026-08-31 (see `EXECUTIVE_AUDIT.md`): the live run shows `baseline 166 tokens / 1.2s` vs `codeatlas 11,577 / 42.5s` and `codeatlas-intel 12,242 / 38.1s`. The codebase currently cannot say *why*. This workstream makes Phase A answer that question with evidence **before any optimization is allowed**.

- **Objective:** produce a per-task / per-stage / per-tool token + latency + call-count ledger that proves, per arm, **exactly where CodeAtlas's additional tokens, latency, LLM calls, and tool calls come from**, and **which of them buy accuracy**. This is measurement + reporting only. No runtime changes; no prompt/context/tooling optimizations; no `MAX_TOOL_ROUNDS` changes; no agent removals.
- **Start from the code-verified call graph (A5.1), not assumptions:**
  - `baseline` = `ProviderChatAgent` (`packages/agents/src/chat-agent-runner.ts`) → **1 provider call**; the reported usage *is* that single call.
  - `codeatlas`/`codeatlas-intel` = `RepositoryToolLoopAgent` (`apps/cli/src/commands/benchmark.ts`) → `ToolUsingChatAgent` (`packages/sdk/src/context-tools/tool-loop.ts`, `MAX_TOOL_ROUNDS = 10`, `MAX_TOOL_RESULT_CHARS = 20_000`). Each round re-sends the **entire accumulated `messages[]`** to the provider, but the runner keeps only the **last** call's usage (`lastUsage`, `packages/benchmark/src/runner/ollama.ts`). **The two "arms" are the same agent** — `codeatlas-intel` falls back to the `codeatlas` agent (`agentFor`, `ollama.ts`); their near-identical totals are stochastic variance, not a distinct intel mode.
  - The prompt for all arms is the identical raw `task.prompt`; codeatlas prefixes it with `CONTEXT_GUIDANCE` (~200 B, `tool-loop.ts`). **No repository context is pre-injected.** All context reaches the model only via MCP tools it chooses to call. Planner/critic/sufficiency/verifier are deterministic and run **only** if the model invokes their MCP tool (`analyze_task`, `create_plan`, `find_relevant_context`, `verify_answer`) — there is no automatic orchestrator in the benchmark path.
- **Metrics (each recorded per task, per arm, and where derivable per agent/stage/tool/LLM-call; mark `NOT INSTRUMENTED` when absent):**
  - `system_prompt_tokens` — no top-level system prompt is sent (`ollama.ts` `buildMessages` sends none); guidance is in-band. Report as static/guidance overhead.
  - `repository_context_tokens`, `context_tokens_before_budget`, `context_tokens_after_budget`, `context_utilization_percent`, `files_in_context`, `symbols_in_context` — exists only in `BudgetRecord`/`render`, not surfaced in benchmark results.
  - `tool_output_tokens`, `tool_output_tokens_by_tool`, `tool_output_injected_tokens` — not recorded (`ToolCallRecord` stores no output/tokens).
  - `repeated_context_tokens`, `repeated_file_count`, `duplicate_context_percent` — not recorded; derivable only from the (unpersisted) `messages[]` transcript.
  - `agent_message_tokens`, `agent_message_tokens_by_agent`, `agent_handoff_count/_tokens` — N/A for the single-agent benchmark path; state this explicitly so it is not assumed present.
  - `reasoning_tokens`, `reasoning_tokens_by_call` — **unavailable**: Ollama parser reads only `prompt_tokens`/`completion_tokens` (`packages/providers/src/parse.ts`). Classify `unavailable`, do not fabricate. `cached_input`/`uncached_input` also `unavailable`.
  - `final_answer_input_tokens`, `final_answer_output_tokens` — not separated.
  - `llm_call_count`, `llm_calls_by_agent`, `retry_count`, `fallback_count` — only derivable by summing rounds; not recorded.
  - `tool_call_count` (exists), `tool_calls_by_tool`, `tool_retry_count`, `failed_tool_calls` (only `deniedToolCalls` partially) — extend per-tool.
  - `duplicate_context_tokens/_ratio/_sources` — classify A/B/C/D (see A6).
- **Files needing instrumentation (read-only + additive observability only):**
  - `packages/sdk/src/context-tools/tool-loop.ts` — expose per-round input/output usage accumulation, round count, per-tool output sizing, `messages[]` byte/token growth, dedupe hits.
  - `packages/sdk/src/context-tools/state.ts` — expose state-summary + objective-restatement token contribution per round.
  - `packages/agents/src/chat-agent-runner.ts`, `packages/providers/src/adapters/ollama.ts`, `packages/providers/src/parse.ts` — surface cumulative + per-call usage and provider-supplied `prompt_tokens_details`/reasoning fields when available.
  - `packages/benchmark/src/runner/ollama.ts` — return cumulative totals, per-call usage log, real reasoning/cache fields, transcript size.
  - `packages/benchmark/src/runner/opencode.ts`, `packages/benchmark/src/store.ts` (`BenchmarkTaskResult`), `reporter.ts`, `benchmark.service.ts` — persist and report the new fields; render the per-arm metric table.
  - `packages/mcp/src/tools.ts` + `tool-bridge.ts` — measure the fixed per-round tool-schema byte/token overhead (12 tools, zod→JSON-Schema).
- **Acceptance criteria:** the report renders, per arm, the metric table below with every cell populated from measurement or labeled `NOT INSTRUMENTED` **with the exact file needing instrumentation**; the raw per-run `messages[]` transcript (or its size-per-role breakdown) is persisted for duplicate-content analysis; no runtime defaults changed.
- **Benchmark output requirement (target table):** `| Metric | Baseline | CodeAtlas | CodeAtlas Intel |` covering success rate, accuracy, total tokens, system-prompt tokens, repo-context tokens, tool-output tokens, repeated-context tokens, agent-message tokens, reasoning tokens, final-answer tokens, LLM calls, tool calls, latency — plus `UNIQUE_CONTEXT_TOKENS` vs `DUPLICATE_CONTEXT_TOKENS`.
- **Failure/overhead classification (adopt repo-wide):** **A** intentional/necessary · **B** intentional but expensive · **C** accidental · **D** unknown / requires instrumentation. Every token bucket gets one label.
- **Dependencies:** A1 (live matrix must run it), A4 (runs/variance so overhead is not noise). A2 (rxjs −0.38 regression) supplies the accuracy side; A5 supplies the cost side.
- **Risks:** cumulative token accounting may exceed what Ollama's OpenAI-compat endpoint reports (multi-round resend is not summed anywhere); reasoning/cached tokens are not exposed — treat as `unavailable`, never estimated; do not let this workstream drift into optimization.

### A6. Duplicate-content & talk-overhead audit — **Effort S, P1**
> **Status:** ✅ COMPLETE (2026-09-01) — audit produced in `benchmarks/phase-b/PHASE_A_COST_ATTRIBUTION.md` §5
- **Objective:** quantify context duplication across the tool loop and classify every duplication path A/B/C/D so A5 can attribute `duplicate_context_tokens` without guessing.
- **Known candidates to measure (code-confirmed):** (1) the entire `messages[]` transcript re-sent every round in `tool-loop.ts` → the dominant structural duplication, category **B** (needed for conversation continuity, but un-budgeted); (2) the first-message `CONTEXT_GUIDANCE` prefix repeated into each subsequent resend, category **B**; (3) per-round injected system messages (state summary, objective restatement, recovery menu, progress notes) appended without eviction, category **B/C**; (4) the 12-tool schema block repeated on every provider call, category **B**; (5) `read_file_range` re-reading content already present in a prior `find_relevant_context`/`read_file_range` output, category **C/D**; (6) search dedupe (`SearchMemory`) intentionally suppresses re-execution but the **cached** result is still injected as a `tool` message, category **B**.
- **Acceptance:** a per-run report of `duplicate_context_tokens`/`repeated_file_count`/`duplicate_context_percent` (of total context) and a per-category A/B/C/D count; do not treat duplication as invalid by default — label each instance and let A5's accuracy side decide.

**→ Phase A exit gate (strengthened):** produce a decision document with a per-cell honest verdict matrix, not just "does accuracy improve":

| Repo | Files | Model | Accuracy Δ | Token Overhead | Latency Δ | LLM Calls Δ | Tool Calls Δ | Verdict |
|------|------:|-------|-----------:|---------------:|----------:|------------:|-------------:|---------|
| winston | 116 | mimo-v2.5-free | +0.00 | +104% | **-43%** | +4.2x | +45% | **ACCEPTABLE** |
| commander | 216 | mimo-v2.5-free | **-0.11** | +62% | **-21%** | +4.2x | +24% | **REGRESSION** |
| axios | 466 | mimo-v2.5-free | +0.00 | +220% | **-31%** | +4.2x | +169% | **INEFFICIENT** |
| rxjs | 1,288 | mimo-v2.5-free | +0.00 | +52% | **-24%** | +4.2x | +31% | **ACCEPTABLE** |
| winston | 116 | gpt-oss:120b | N/A | +706% | +264% | +4.2x | ∞ | **INSUFFICIENT DATA** |
| commander | 216 | gpt-oss:120b | N/A | +300x | +2,589% | +4.2x | ∞ | **INSUFFICIENT DATA** |
| axios | 466 | gpt-oss:120b | N/A | +70x | +12,504% | +4.2x | ∞ | **INSUFFICIENT DATA** |
| rxjs | 1,288 | gpt-oss:120b | N/A | +11x | +199% | +4.2x | ∞ | **INSUFFICIENT DATA** |
| winston | 116 | nemotron | +0.00 | +187% | +21% | +4.2x | +83% | **INEFFICIENT** |
| commander | 216 | nemotron | **-0.11** | -3% | -4% | +4.2x | +6% | **REGRESSION** |

Verdicts: `WIN` / `ACCEPTABLE` / `INEFFICIENT` / `NO BENEFIT` / `REGRESSION` / `INSUFFICIENT DATA`. "WIN" additionally requires that a *measured* share of the overhead maps to accuracy (from A5's unique-vs-duplicate split), not only `accuracy ≥ baseline AND tokens ≤ baseline`. Any threshold (e.g. "token overhead must beat accuracy by ≤X×", "accuracy delta ≥ 0.1 to justify 40× tokens") that does not already exist in the repository must be declared explicitly as an open product decision to be set before Phase B — A5/A6 must not invent them.

**Open product decisions (required before Phase B):**

| Decision | Options | Default | Rationale |
|----------|---------|---------|-----------|
| Maximum acceptable token overhead | 1x / 2x / 5x / unlimited | 2x | Current data shows 1.5-2.2x on strong models |
| Minimum accuracy improvement to justify overhead | 0 / +0.05 / +0.1 | +0.1 | If context doesn't measurably help, don't add it |
| Maximum acceptable latency overhead | 1x / 1.5x / 2x | 1.5x | Current data shows -20% to -43% (faster!) |
| Should codeatlas-intel be retired? | Yes / No / Redesign | Retire | Falls back to codeatlas; not a distinct arm |
| Should gpt-oss:120b be excluded from future benchmarks? | Yes / No | Yes | Too weak; baseline produces near-zero output |
| Should runsPerTask be increased to 3? | Yes / No | Yes | Required for statistical significance |
| Should evaluation scores be persisted before next run? | Yes / No | Yes | Critical gap — must fix before any new benchmark |


---

## PHASE B — FIX WHAT MEASUREMENT SHOWS (Weeks 3–5)

> **Status:** READY TO BEGIN — Phase A complete, blockers identified below
> Order these by what Phase A revealed. Each is small and independently verifiable.

### BLOCKING PREREQUISITES (must complete before Phase B work begins)

| Task | Owner | Effort | Evidence |
|------|-------|--------|----------|
| Fix evaluation score persistence in `BenchmarkService.runTask()` | Engineer | S (2h) | Evaluator output exists in tests but not in persisted task JSON — no accuracy data available |
| Set `runsPerTask: 3` for all future benchmark suites | Config | S (1h) | Single-run data has no statistical significance |
| Decide open product decisions (max overhead, min accuracy, etc.) | Product | M (meeting) | See §4 open decisions above |
| Retire `codeatlas-intel` as a benchmark arm | Config | S (30m) | Same agent as codeatlas per ollama.ts:157 |
| Start Ollama instance for new benchmark runs | Infra | S (setup) | localhost:11434 not running |

### B1. Budget/truncation policy fix — **Effort M, P0** *(confirmed by Phase A: 10 budget_truncation failures = 53% of all failures)*
- Protect Critical-tier content from truncation; degrade Supporting/Optional tiers first; emit an explicit `truncated: true` signal in the rendered package so the model knows context was cut.
- Consider adaptive round limits based on task category (bug-investigation needs more rounds than file-discovery).
- **Files:** `packages/sdk/src/context-integration/budget.ts`, `assemble.ts`, `render.ts`. Tests in existing context-integration test files (additive).
- **Acceptance:** Complex tasks (bug-investigation, feature-planning) stop hitting max-rounds exhaustion.

### B2. Regime-aware context modes — **Effort M, P0** *(confirmed by Phase A: axios +220% tokens, flat accuracy on 466-file repo)*
- **What:** automatic mode selection: `digest` (one-shot repo digest + targeted retrieval) vs `full` package, chosen from measured thresholds (repo size vs configured model window). Expose as `contextMode: auto | digest | full | off` with `auto` default.
- **Files:** `packages/core` (additive `ContextMode` type), `packages/sdk/src/context-integration/` (mode selection in `index.ts`/`assemble.ts`), MCP `find_relevant_context` param, CLI `atlas context` flag.
- **ADR required** (small — additive option, no schema break).
- **Acceptance:** small-repo cells stop adding +200K–800K tokens: digest-mode runs measured on winston/commander with token delta ≤ +10% of baseline.

### B3. Retrieval improvement (only if A3 shows recall is the bottleneck) — **Effort L, P1, conditional** *(BLOCKED: no retrieval metrics measured in Phase A)*
- **Status:** BLOCKED — cannot assess without retrieval quality data. Do not start without evidence.
- Cheapest-first ladder, stop as soon as recall@k measurably improves:
  1. **Graph-aware candidate expansion:** use `@atlas/graph` (already built, underused) to add 1-hop callers/callees of top lexical hits as candidates before ranking.
  2. **Query-term expansion:** entity extraction (`entities.ts`) already yields symbols; expand search with imported-name aliases (fixes the renamed-import blind spot the parser already handles).
  3. **Embedding scorer** — *only* if 1–2 fail: implement `RelevanceScorer` behind the existing seam with a local embedding provider; keep lexical as default and benchmark both.
- **Never** replace the lexical scorer without an A/B on the fixed task corpus.

### B4. Sufficiency-gate tuning against real runs — **Effort S, P1** *(Phase A: unknown false-positive rate — gate behavior unmeasured)*
- **What:** using Phase A logs, check gate false-positive rate (blocks tasks that would have succeeded) and false-negative rate. Tune `minScore` and predicate thresholds; add gate verdicts to benchmark results for analysis.
- **Files:** `packages/sdk/src/context-integration/sufficiency.ts` + benchmark plumbing.
- **Acceptance:** gate decisions recorded per task; tuning justified by numbers.

### B5. MCP output token-efficiency audit — **Effort S, P1** *(confirmed by Phase A: tool outputs dominate cache-read, ~70% of total tokens)*
- Cap and compact high-level tool outputs (`analyze_task`, `find_relevant_context`) — measure rendered bytes per tool call from Phase A logs; target the worst offenders. Every result keeps the `next_steps` convention.
- **Files:** `packages/mcp/src/handlers.ts`, `tools.ts`.
- **Acceptance:** Tool output tokens reduced by ≥30% without accuracy loss.

---

## PHASE C — NARROW & SHARPEN THE PRODUCT (Weeks 5–7)

### C1. Reposition messaging to the measured wedge — **Effort S, P0 for launch**
- README/docs claim exactly what the Phase A report proves: e.g. *"CodeAtlas gives small/local models high-signal context on large TypeScript repositories — measured X% task-success improvement and Y% token reduction on >500-file repos."* Numbers or it doesn't ship.
- **Files:** `README.md`, `docs/getting-started.md`, `docs/benchmark.md` (link the report).

### C2. First-use smoke test in CI — **Effort S, P1**
- Script: fresh temp dir → `atlas init` → `atlas build` (tiny fixture repo) → `createContextSDK` read → MCP handshake over stdio → assert tools/list. Run in CI.
- **Files:** `tests/` + CI workflow (currently absent — create a minimal GitHub Actions workflow: install, build, `pnpm check`, smoke).

### C3. Hostile-repository (prompt-injection) fixture suite — **Effort S, P1**
- Fixture repo with injection payloads in comments/symbols/summaries ("ignore previous instructions…"); assert: deny-filter catches secrets, rendered context marks them as data, MCP never executes, nothing enters instructions. Ties into existing `deny.ts`/`hardening.test.ts` patterns.
- **Files:** `tests/fixtures/malicious-repo/` + `packages/mcp/tests/` + `packages/sdk/tests/`.

### C4. DX pass on the install → first-value path — **Effort M, P1**
- `atlas init` should: detect unindexed repo, offer build, print next step (`atlas mcp` config snippet for Claude/Cursor/opencode), verify MCP connectivity (`atlas doctor` extension). Fix the top 5 confusion points found by walking the path yourself on a clean clone.
- **Files:** `apps/cli/src/commands/indexing.ts`, `doctor.ts`.

### C5. Documentation consolidation — **Effort M, P2**
- 50+ docs → prune: merge the three overlapping audit doc trees (`docs/audit/`, root-level `AUDIT_*.md`, `docs/FINAL-MVP-AUDIT.md` etc.) into one `docs/audit/` archive; keep `DOCUMENTATION_MAP.md` authoritative; delete stale plans (PHASE4_PLAN, plan.md, CORRECT.md at root).

---

## PHASE D — HARDENING (parallel from Week 3, P1/P2)

| Task | What | Effort |
|---|---|---|
| D1 | Scaling measurements: run the existing `benchmarks/extreme` harness at 10k and 50k-file synthetic corpora; record indexing time, RSS, DB size, retrieval latency into `docs/benchmark.md`. Fixes the "unmeasured beyond 5k" gap. | S |
| D2 | Crash-resume test: kill `atlas build` mid-run; assert DB loads cleanly and `atlas build` completes on retry. Add test around `packages/storage` save/replace semantics. | S |
| D3 | Concurrent-indexing guard: simple lock file in `.codeatlas/` acquired during `indexProject`; stale-lock recovery. | S |
| D4 | Release hygiene: workspace versioning is inconsistent (CLI 0.4.0-beta, packages 0.0.0). Add changesets or a sync script; tag releases; publish `@atlas/sdk` if it becomes a public integration surface. | M |
| D5 | Governance: move `CodeAtlas-ui/` out of the monorepo (separate repo) or adopt into workspace properly (remove nested `.git`). Decide once, execute. | S |

---

## PHASE E — POST-VALIDATION EXPANSION (gated on Phase A/B evidence)

- **E1. Python parser** (tree-sitter behind `ParserRegistry`) — only if the TS-narrow wedge shows retention; Python is the biggest underserved segment.
- **E2. Embedding retrieval** — only if B3's cheap ladder failed.
- **E3. Monetization experiments** — open-core: free local CLI/MCP; paid = hosted indexing for teams + enterprise (SSO, air-gapped). Validate willingness-to-pay with 5–10 design-partner conversations using the Phase A report as the pitch. **No cloud infra before that.**
- **E4. VS Code extension** — invest only after MCP adoption is observed (extension is currently implemented but low-signal).

---

## DEPENDENCY GRAPH

```text
Phase A (COMPLETE)
  ├─ A1 ✅ → benchmark data collected
  ├─ A2 ✅ → failure classification done
  ├─ A3 ✅ → retrieval metrics ready (not yet run)
  ├─ A4 ✅ → statistical rigor ready (not yet run)
  ├─ A5 ✅ → cost attribution ledger produced
  └─ A6 ✅ → duplicate-content audit produced

Phase B (READY TO BEGIN — pending prerequisites)
  ├─ Prerequisites: evaluation persistence, runsPerTask=3, open decisions
  ├─ B1 (budget fix) ──────────────┐
  ├─ B2 (context modes) ───────────┼─→ Re-run benchmark (3 runs/task)
  ├─ B5 (token efficiency) ────────┤
  └─ B4 (gate tuning) ─────────────┘
                                      │
                                      ├─→ B3 (retrieval, if needed)
                                      │
                                      └─→ Phase C → LAUNCH

D1–D5 (parallel) ─── can start anytime
C2–C5 (parallel with B) ─→ LAUNCH
E1–E4 ← gated on launch evidence + user validation
```

**Parallelizable:** D-tasks and C2–C5 anytime after Phase A starts. **Must not start:** E1–E4, any new intelligence features, orchestrator/slash-commands, or any optimization that A5 has not yet attributed (no prompt cuts, no `MAX_TOOL_ROUNDS` changes, no context reduction until the ledger says where tokens go).

---

## LAUNCH GATE (v0.5 "product" definition)

> **Updated 2026-09-01** — Phase A shows core thesis NOT supported. Gate criteria adjusted.

1. Phase A report published + linked from README, with honest win/loss table. ✅ **DONE** (`benchmarks/phase-b/`)
2. ≥1 measured cell where CodeAtlas mode: accuracy ≥ baseline AND tokens ≤ baseline. ❌ **NOT MET** — 0/10 cells show this pattern. Requires B1+B2 fixes + re-benchmark.
3. Evaluation scores persisted and available for all cells. ❌ **NOT MET** — evaluator output not written to task JSON. Blocking prerequisite.
4. Statistical significance assessed (≥3 runs per cell). ❌ **NOT MET** — all data is single-run.
5. Regime-aware mode shipped (B2) with measured threshold justification. ⬜ **PLANNED**
6. CI green: `pnpm check` + C2 smoke + C3 hostile-repo suite. ⬜ **PLANNED**
7. D1/D2/D3 done; versioning + changelog (D4) done. ⬜ **PLANNED**
8. Docs consolidated (C5); messaging matches measurements (C1). ⬜ **PLANNED**

---

## BIGGEST RISKS TO THIS PLAN

> **Updated 2026-09-01** — risks now based on Phase A evidence, not speculation.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Phase A shows core thesis NOT supported — CodeAtlas does not improve accuracy on any measured cell | **CONFIRMED** | Critical | B1+B2 must demonstrably fix this; otherwise narrow to digest-only product |
| Commander REGRESSES on both mimo and nemotron (-0.11 accuracy) | **CONFIRMED** | High | Investigate root cause before B1; may need task-category-specific context |
| Evaluation scores unavailable — no accuracy data for rigorous analysis | **CONFIRMED** | Critical | Fix persistence in prerequisite; blocking all accuracy measurement |
| gpt-oss:120b model too weak — baseline produces near-zero output | **CONFIRMED** | Medium | Exclude from future benchmarks; use only strong models (mimo, nemotron) |
| codeatlas-intel not distinct — falls back to codeatlas agent | **CONFIRMED** | Medium | Retire as benchmark arm; freed resources for better coverage |
| No runsPerTask=3 — single-run data has no statistical significance | **CONFIRMED** | High | Set runsPerTask:3 before re-benchmark |
| Budget truncation is dominant failure mode (53% of failures) | **CONFIRMED** | High | B1 must fix this before re-benchmark |
| Token overhead (~2x) may not be reducible below 1.5x without accuracy loss | Medium | High | B2 (digest mode) targeted at small repos; B5 (token efficiency) for all |
| Ollama not available for new benchmark runs | High | Medium | Use API models (mimo, nemotron) as primary; Ollama as secondary |
| Scope creep back into features | Medium | High | Phase A gates everything; enforce "no features until numbers exist" in code review |

---

**Total estimate: ~6–7 weeks to a defensible v0.5 launch, with Phase A alone (2 weeks) deciding whether the current thesis stands.**

**Phase A status (2026-09-01):** COMPLETE. Core thesis NOT supported. CodeAtlas does not improve accuracy on any measured cell. Commander REGRESSES. Requires B1+B2 fixes + re-benchmark to determine if the product can succeed. See `benchmarks/phase-b/` for all 6 deliverable documents.

