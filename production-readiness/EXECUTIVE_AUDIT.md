# CodeAtlas — Production Readiness, Architecture, AI Performance & Strategic Repositioning Audit

> **Audit date:** 2026-08-31 · **Branch:** `main` · **Commit:** `7677afe`
> **Method:** full-tree inspection, source tracing of every intelligence-critical path, live test run (`vitest run`: 124 files / 1,293 tests — all passing, ~20s), benchmark-evidence review.
> **Mode:** plan-only audit. No repository files were modified to produce these findings.
>
> Evidence tags used throughout: **FACT** (confirmed by source/evidence), **INFERENCE**, **ASSUMPTION**, **RECOMMENDATION**, **REQUIRES VALIDATION**.

---

## EXECUTIVE SUMMARY

**What CodeAtlas is today (FACT):** A clean-architecture pnpm/TypeScript monorepo (20 packages, 3 apps) that indexes TypeScript repositories into SQLite and delivers budgeted, deterministic context to AI agents via CLI, MCP (12 tools), and agent sessions. 1,293 passing tests. An ambitious "small-model intelligence" plan (documented in `docs/audit/small-model-intelligence/`, 2026-08-30) has been **largely implemented in the last week of commits** — planner, critic, verifier, sufficiency gate, repository digest, hierarchical context, 5 high-level MCP tools, 3-arm benchmark framework.

**The blunt verdict: `YES, AFTER SPECIFIC FIXES` — but the fixes are not the ones most audits would list.** The codebase is unusually healthy for a beta. The actual blockers are:

1. **The core product thesis is not yet proven by benchmark evidence — and the existing measured evidence partially *contradicts* it.** FACT: the only complete live benchmark run (`docs/benchmark.md`, opencode/nemotron-3-ultra-free, 4 real repos) shows CodeAtlas context **adds** 206K–882K tokens on small/medium repos with flat accuracy, and on the one large repo (rxjs, ~1,288 files) saves 911K tokens (−22%) **while accuracy drops 0.38**. There is currently no measured configuration where CodeAtlas produces *higher accuracy per token* end-to-end. The honest disclosure in the docs is commendable, but this is the single most important fact about the product.
2. **The newly built intelligence layer (planner → hierarchy → sufficiency gate → verifier → critic) has zero live end-to-end validation.** FACT: `execution-plan.md` P0.6 ("Run baseline matrix… DoD: baseline numbers referenced by all later DoD") is explicitly pending. Phases 1–8 shipped code; Phase 0's live run never happened. This is the biggest waste-of-time risk right now: **more intelligence code is being written on top of an unmeasured layer.**
3. **Language support is TypeScript-only** (parser via ts-morph), which caps the addressable market severely (FACT).

**Strongest thesis (RECOMMENDATION, evidence-supported):** narrow the wedge from "AI context engine for everyone" to **"context layer for large repositories where small/cheap models fail due to context-window and navigation pressure"** — the rxjs result is the only regime where the product demonstrated its value, and it was also the only regime where the baseline model was actually struggling. That is the honest product.


---

## 1. CURRENT ARCHITECTURE (evidence-based map)

```text
Developer / Agent
   ↓
CLI (apps/cli, 16 commands) · MCP over stdio (packages/mcp, 12 tools)
   · VS Code ext (apps/extension) · HTTP server (apps/server, benchmark dashboard)
   ↓  — all consumers touch only @atlas/sdk (ESLint-enforced) —
createContextSDK (packages/sdk/src/context) → SQLite context DB (.codeatlas/context.db)
   ↑ written by:
Indexing (packages/sdk/src/indexing/indexProject):
   scanner (walk, ignore rules, manifest) → hashing (SHA-256 snapshots, incremental)
   → parser (ts-morph → Symbol IR; TS ONLY) → symbol-indexer (cross-file refs)
   → graph (calls/imports/extends/cycles) → storage (8 tables, migrations)
   ↓
Retrieval: lexical fuzzy index (@atlas/search, RelevanceScorer seam, no embeddings)
   ↓
Rank-and-assemble (@atlas/context: 3 regex category boosts → whole-file items)
   → context-integration (sdk): entity extraction → classifier → planner [D]
   → hierarchy tiers (Critical/Important/Supporting/Optional) → graph closure
   → budget → deny-filter → sufficiency gate [D] → slice/package render
   → ToolUsingChatAgent (bounded tool loop, dedup memory) → verifier [D] → critic [M]
   ↓
Sessions (@atlas/agents, AgentPort/SessionPort) · usage (tri-state tokens/cost)
```

### Component health

| Component | Status | Evidence |
|---|---|---|
| scanner/hashing/storage/graph | Production-quality | FACT — deterministic, tested, incremental works (measured: 530ms full scan, 97–114ms incremental on 30-file fixture) |
| parser | **[PARTIAL]** — TS only; namespaces/bare expressions not extracted | FACT |
| search | Solid lexical; **no semantic/embedding retrieval** | FACT — `RelevanceScorer` seam exists but nothing else implements it |
| ranking | Heuristic: lexical scores + 3 regex boost lists (`context-builder.service.ts`) | FACT |
| context-integration intelligence layer | Implemented, unit-tested, **never validated live end-to-end** | FACT — planner/critic/verifier/sufficiency/digest all pure+deterministic, 1293 tests pass, but P0.6 pending |
| MCP | 12 tools (7 low-level: `search_symbols`, `search_files`, `get_summary`, `get_dependencies`, `explain_module`, `project_overview`, `read_file_range`; 5 high-level: `analyze_task`, `create_plan`, `find_relevant_context`, `inspect_symbol`, `verify_answer`), freshness + deny-list + output caps | FACT |
| benchmark framework | Implemented: 2 real runners (opencode child-process, ollama in-process tool loop), real token/cost capture, evaluator v2 with hallucination/wrong-file/hidden-test metrics, 3-arm support, HTML/MD/JSON reports, localhost dashboard | FACT |
| Direction B orchestrator / slash router | **[PLANNED]** — do not build | FACT |
| `CodeAtlas-ui/` directory | Nested separate Vite app **inside the monorepo root with its own `.git`** — not part of the workspace | FACT — governance smell; decide its fate |
| Legacy benchmark harnesses | Correctly quarantined as historical | FACT |

### Dead / duplicated (FACT)

- `run-benchmark.ts` / `run-single.ts` (char/4 token estimates, explicitly "do not extend")
- `StorageService` legacy `StoragePort` wrapper
- `ComingSoonError` scaffolding

All small; none urgent.

---

## 2. CONTEXT ENGINEERING AUDIT — where the thesis actually stands

**Retrieval is lexical-only, symbol/path-matching based (FACT).** False-positive risk: common-token matches (e.g. "user") flood top-k. False-negative risk: paraphrased task language never matches identifiers — no semantic bridge. The graph is built at index time but only used for 1-hop closure in the new planner (`CLOSED_HOPS = 1`, `planner.ts`).

**What the model receives (FACT):** a rendered, budgeted package: overview → digest → tiered items (raw source only for Critical tier) → dependency edges with reasons → instructions → bounded tool loop for more.

**What it does not receive:** type information (parser does no type-check), call-site frequency, runtime behavior, historical signals, test-outcome linkage beyond names.

**Honest assessment against the central design question ("can CodeAtlas turn repository understanding into a structured high-signal problem small models can solve?"):** the *architecture now plausibly supports it* — the tiered hierarchy + sufficiency gate + planner skeleton is exactly the right shape. **INFERENCE:** but the weak link is upstream: retrieval quality (lexical top-k) determines what the planner has to plan with. Garbage top-k → the gate correctly says "insufficient" → the bounded loop thrashes. Improving retrieval relevance is worth more than any further intelligence-layer code.

---

## 3. BENCHMARK AUDIT — the critical section

**What exists is better than most pre-launch products:** real token/cost/latency (not estimates) via opencode JSONL and provider usage; baseline vs codeatlas vs intel 3-arm; evaluator v2 (file hits, concept hits, on-disk citation verification, hallucinated-path detection, wrong-file vs gold impact, forbidden changes, hidden-test runner); resumable suites; pinned repos; transparent display-score formula. **FACT.**

### Weaknesses (each: problem → why → fix → priority)

1. **P0 — Live validation matrix never run.** The entire intelligence layer is unbenchmarked against the *already measured* baseline. Evidence: `execution-plan.md` P0.6 pending; no intel-arm results in `benchmarks/`. Fix: run the 3-arm × model-matrix (e.g. a 7–8B Ollama model + one mid-tier API model) on the 4 pinned repos before writing any more feature code. This is the single highest-value action available.
2. **P0 — Accuracy vs token trade-off unresolved.** rxjs: −22% tokens, **−0.38 accuracy**. A context layer that loses accuracy while saving tokens fails the "better reasoning per token" bar. Fix: diagnose the regression per task (evaluator v2 records wrong-file/hallucination — use it); hypothesis: budget truncation drops needed Critical content or the tool loop under-retrieves. **REQUIRES VALIDATION.**
3. **P1 — Small-repo regime adds tokens with no benefit.** The product must *detect* the regime where it helps (repo size vs model window) and either decline to inject or degrade to a one-shot digest. A `context-mode: off | digest | full` recommendation from measured thresholds is a feature, not an apology.
4. **P1 — Evaluator is substring-based.** Concept/file-name hits can be gamed by output formatting; hidden tests exist but are opt-in and rarely populated in shipped task files. Fix: make `hidden_tests` mandatory for ≥50% of tasks per suite; treat fileHits as secondary.
5. **P2 — Single model family, free-tier, n=16–18 tasks, no repeated runs, no variance.** Results cannot support statistical claims. Fix: ≥3 seeds/runs per cell before any marketing claim; report dispersion.
6. **P2 — Suite tasks authored by the CodeAtlas author.** Cherry-picking risk is structural, not observed. Fix: accept external task PRs; include at least one adversarial task per repo.
7. **P3 — Cost is $0 by construction (local/free models)**, so "success per dollar" is currently unmeasurable. Acceptable for now; one paid-model cell is needed before pricing claims.

### Measured live results (2026-08, opencode/nemotron-3-ultra-free, from `docs/benchmark.md`)

| Suite | Repo (files) | Tokens (baseline → codeatlas) | Accuracy (baseline → codeatlas) |
|---|---|---|---|
| winston-bench | ~116 | 2,735,932 → 2,941,986 (+206K) | 1.56 → 1.44 (−0.11) |
| commander-bench | ~216 | 2,339,524 → 2,628,181 (+289K) | 1.22 → 1.67 (+0.44) |
| axios-bench | ~466 | 3,854,613 → 4,736,871 (+882K) | 1.50 → 1.75 (+0.25) |
| rxjs-bench | ~1288 | 4,125,016 → 3,214,095 (−911K, −22%) | 1.63 → 1.25 (−0.38) |

---

## 4. SECURITY & RELIABILITY

### Strong (FACT)

Argument-array spawns throughout (installer adversarially tested), shell:false policy enforced, deny-filter for secrets in context, MCP freshness + output caps + validation, untrusted tool-manifest loading (prototype-pollution safe), `.env` respected by scanner, localhost-only server. Prompt-injection separation is *architecturally present* (context is rendered data, never executed) — though **no systematic prompt-injection test suite exists** (gap, P1: add malicious-repo fixtures with injection payloads in comments/symbols and assert they are inert data).

### Reliability gaps (FACT / INFERENCE)

- Synchronous `node:sqlite` — fine to ~50k files, unproven beyond (extreme harness covers 5,000-file corpora; **measurements at 10k–50k are missing**).
- Interrupted-indexing recovery relies on replace-on-save semantics (reasonable) but no crash-resume test exists (P2).
- No lockfile against concurrent CLI indexing of the same repo (P2).

---

## 5. LANGUAGE SUPPORT

- **Tier 1:** TypeScript/TSX (production, with known gaps: namespaces, bare-expression defaults, no type-checker integration). FACT.
- **Tier 2:** none. **Tier 3:** none. **Tier 4:** everything else.
- **RECOMMENDATION:** do not broaden languages pre-validation. The parser-registry plugin seam (`ParserRegistry`) means Python (tree-sitter) is the only language worth adding *after* benchmark validation, because Python+AI-tooling is the largest underserved segment. Everything else: explicitly do not claim.


---

## 6. KILL / REMOVE / DEFER LIST

- **KILL IT:** any further intelligence-layer features until P0.6's live matrix run exists. Opportunity cost is total — every addition is currently unmeasured.
- **KILL IT (eventually):** `run-benchmark.ts`/`run-single.ts` legacy harnesses and `benchmarks/results/legacy.json` — retain only until docs are updated to reference framework suites; then delete.
- **KILL IT:** the "Unified AI CLI Orchestrator" (Direction B router/slash-commands) as a near-term ambition — zero evidence of demand, huge surface, and MCP already achieves the integration. **DEFER** indefinitely.
- **DEFER:** VS Code extension investment, `@atlas/metrics` beyond benchmark needs, toolkit expansion (registry/installer/configurator is complete and good — freeze it).
- **DECIDE:** `CodeAtlas-ui/` nested app — extract to its own repo or adopt into the workspace; the current half-state will cause CI/versioning pain.
- **DO NOT ADD:** embeddings/vector DB *yet*. The `RelevanceScorer` seam is the correct placeholder; add semantic retrieval only when lexical retrieval recall is *measured* as the bottleneck on the benchmark corpus (P1 diagnostic task first).

---

## 7. LAUNCH BLOCKERS (P0/P1 only)

| ID | Problem | Evidence | Type | Fix | Complexity |
|---|---|---|---|---|---|
| B1 | Intelligence layer has no live benchmark validation | P0.6 pending; no intel-arm results | Product-validation | Run 3-arm × 2-model matrix on 4 pinned repos | Low (code exists) |
| B2 | rxjs accuracy regression (−0.38) with token savings | docs/benchmark.md table | AI-quality | Per-task failure analysis using evaluator v2 metrics; fix budget/truncation policy | Medium |
| B3 | Small-repo regime: token overhead, no gain | +206K/+289K/+882K on 3 suites | AI-quality | Regime detection + digest-only mode with measured thresholds | Medium |
| B4 | TS-only parser | `packages/parser` | Market | Blocker only for "launch as broad product"; not a blocker for TS-narrowed wedge launch | High (defer) |
| B5 | No prompt-injection/malicious-repo test suite | Absence of fixtures | Security | Add hostile fixtures + assertions | Low |
| B6 | Benchmark statistical rigor (n, seeds, one model family) | results tables | Product-validation | ≥3 runs/cell, add one mid-tier API model | Low |
| B7 | DX: first-value path untested on fresh machines | no onboarding smoke test | DX | `atlas init && atlas build && MCP config` smoke in CI | Low |

Everything else (docs consolidation, legacy harness removal, UI governance, crash-resume tests) is P2/P3.

---

## 8. IMPLEMENTATION ROADMAP (resequenced from evidence)

**Phase A — Prove or falsify (1–2 weeks, highest value):** B1, B6, then B2/B3 diagnosis. No new features. Deliverable: one honest benchmark report stating where CodeAtlas wins, loses, and by how much, per repo size × model size.

**Phase B — Fix what Phase A shows broken:** budget/truncation policy, retrieval recall diagnostics (measure top-k precision/recall properly — currently only the legacy estimate harness computes these), sufficiency-gate tuning (is it firing too early/late on real tasks?).

**Phase C — Narrow & sharpen:** regime-aware context modes; small-model packaging ("connect your Ollama 7B, get X% more solved tasks on >500-file repos" — only if X is measured); MCP tool-description polish with `next_steps` audit; DX smoke test (B7).

**Phase D — Hardening:** B5, crash-resume, 10k/50k-file scaling measurements via the existing extreme harness.

**Phase E — Expansion (only post-validation):** Python parser (tree-sitter behind `ParserRegistry`), embedding scorer behind `RelevanceScorer` if recall is the proven bottleneck, monetization experiments (hosted indexing for teams; open-core with enterprise SSO/air-gapped indexing as the natural paid tier — **REQUIRES VALIDATION** with users, not before).

**Hard dependency chain:** Phase A → B → C; D parallelizable from Phase B onward; E gated on A/B/C outcomes.

---

## 9. DEFINITION OF LAUNCH-READY (measurable gates)

1. Zero unresolved P0 blockers; full `pnpm check` green (already true — FACT).
2. A published benchmark report: ≥2 model sizes, ≥4 repos, ≥3 runs/cell, hidden tests on ≥50% of tasks, with an explicit **success-per-token** comparison where CodeAtlas mode ≥ baseline accuracy AND ≤ baseline tokens on at least the large-repo regime.
3. Regime guidance shipped (when to enable CodeAtlas, derived from measured thresholds).
4. Security: hostile-repo fixture suite green; secrets deny-filter covered by tests (exists).
5. DX: fresh-machine smoke test in CI; troubleshooting docs match actual errors.

---

## 10. FINAL STRATEGIC ANSWERS (blunt)

- **Ready?** `YES, AFTER SPECIFIC FIXES` — and the fixes are measurement + regression fixes, not rewrites.
- **Strongest thesis:** context layer that makes *small/cheap models viable on large repos* — the only regime where measured benefit exists.
- **Good at today:** engineering hygiene (architecture, tests, security posture, honest benchmarking) is genuinely top-decile for a beta.
- **Pretending to be but isn't:** a general-purpose, multi-language, always-beneficial context engine.
- **Should NOT become:** an agent framework, an orchestrator, a 20-language parser project, or a cloud platform pre-validation.
- **Biggest technical weakness:** lexical-only retrieval bounding everything downstream.
- **Biggest product risk:** the measured evidence currently shows net-negative on 3 of 4 suites; if the intel layer doesn't flip that, the small-model thesis needs narrowing further (digest-only product).
- **Biggest opportunity:** the intelligence layer just built is the right architecture — it's one benchmark run away from either vindication or a clear fix list.
- **Build next:** the P0.6 live matrix. Nothing else first.
- **Delete:** legacy harnesses (post-doc-update). **Defer:** orchestrator, UI decisions, multi-language. **Preserve:** the ports/SDK architecture, the benchmark framework's honesty, the deny/freshness security work.
- **Shortest path to value:** "CodeAtlas for large TypeScript repos + local/small models" with one published, reproducible, honest benchmark proving it.

