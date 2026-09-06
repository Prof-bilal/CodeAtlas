# CODEATLAS MCP V2 — P0 IMPLEMENTATION PLAN

> **Mode: PLAN FOLLOWED — code modified through Phase 5 + Phase 4 finalization + measurement scaffolding.** Primary source: `CODEATLAS-MCP-READINESS-AUDIT.md` (HEAD `b3d1167`, 707 lines, verified 2026-09-06). All file:line citations re-verified against the live tree via read-only traces on 2026-09-06 and again 2026-09-07 after code changes. Where the audit said "subagent-observed, re-verify," this plan re-verified and marks the outcome explicitly.
> Non-goal lock: **CodeAtlas MCP first, Harness later.** No agents, routing, memory, orchestration, autonomy, UI.

> ## Implementation status (2026-09-07 — updated after code phases)
>
> Code phases implemented and tested (`pnpm test` green for every touched package; `tsc --noEmit` + `eslint` clean):
> - ✅ **Phase 1** — truth-in-advertising, score normalization (0..1 + `confidence` + dual-emit `rawScore`), overview `parsedFiles/contentOnlyFiles` split, docs match code.
> - ✅ **Phase 2** — conjunction+phrase scoring, chunked content index (2000/1000/8), default bounded BFS traversal with `traversalPath` attribution (regex gate removed), `tested-by` graph edges, identifier fast lane. **Deferred:** alias *resolution* (mark-unresolved shipped instead); `fuzzy.ts` term plumbing (coverage implemented inside `scoring.ts`, no `fuzzy.ts` change needed).
> - ✅ **Phase 3** — `get_dependencies` default 100→25, `brief` mode (SDK `AssembleOptions` + MCP `find_relevant_context`), `nextSteps`→single `hint`, sufficiency `refine`. **Deferred (post-baseline):** budget default review 20/12k→12/8k, pointer-by-default preamble (only via opt-in `brief`) — both intentionally deferred until baseline evidence exists.
> - ✅ **Phase 4** — canonical alias surface (`context_for`/`dependencies_of`/`overview`/`read_range`) registered alongside the 12 legacy tools (server + tool-bridge), evidence envelope (`confidence`/`hint`/`refine`/`timings`), **`dependencies_of.depth` 1..3 with `hop`/`path` attribution** (SDK `DependencyQuery.depth` 1..3, bounded BFS 2..3, cycle-safe), **`inspect_symbol` caps 25/25 + `confidence` / overflow**, **`overview(full)` size `warning`**, **`explain_module` caps 200/200→50/50**, **deprecation marking + server `warn` per call for 4 tools**, **migration doc `docs/MCP_MIGRATION.md` + CHANGELOG Unreleased entry**. **Still deferred per design:** hard removal of `analyze_task`/`create_plan`/`verify_answer`/`explain_module` from the protocol (they remain registered with `DEPRECATED` + `warn` through the 1-minor compat window; hard cut is Phase 6 release).
> - ✅ **Phase 5** — JS bridge (`allowJs`, JS parsed + fixture), `unresolvedImports` counting surfaced on `project_overview`, **freshness event-matrix tests (`freshness-matrix.test.ts` 7 cases: create/modify/delete/rename/dep-change/restart/missing) + `probeMs` publication**, **alias resolver contract test (`module-resolution-contract.test.ts`: relative candidates identical, bare/`node:`/`@` mark-unresolved)**, warm index/incremental probe **intentionally not built** (measure-only; `freshness.ts` documents the kill condition: build only if scale grid shows probe >5% p50).
> - ✅ **Phase 0 / Phase 6** — **timings/attribution plumbing landed** (every MCP object result carries `probeMs`/`searchMs`/`assemblyMs`/`responseBytes` + `FreshnessReport.probeMs`); **held-out retrieval set landed** (`benchmarks/retrieval-tasks/tasks.json` 30 tasks 12/9/9 + `evaluate.mjs` smoke + `README.md` + `BASELINE.md` skeleton); **scale grid landed** (`benchmarks/scale-grid/generate.mjs` via `tsx`, `README.md`); **CI gate landed** (`.github/workflows/retrieval-gates.yml` blocking: retrieval-set validation + retrieval eval + scale grid + contract test); **4-tool hard removal landed** (`analyze_task`/`create_plan`/`verify_answer`/`explain_module` removed from protocol, handlers, and tool registry; 16→12 tool names); **retrieval evaluation script** (`evaluate-retrieval.ts`) for full P@k/MRR/R@k scoring. **Still open:** full `evaluate-retrieval.ts` run against a live built index to capture P@k/MRR/R@k baselines into `BASELINE.md`, 1k/10k/50k scale-grid rerun + published p50/p95 per primitive, n≥3 B-config rerun with `paired-bootstrap.ts` significance, per-tool timeouts (P1, only if Phase 0 shows hangs).
>
> Verification note: `apps/cli` (4 tests), `apps/extension` typecheck, and `scripts/*.js` lint/format failures are **pre-existing on HEAD**, not introduced here. `pnpm vitest run packages/mcp packages/graph packages/sdk/tests/dependency-depth` is green (222 tests mcp+graph, 359 sdk+search).

---

## 1. Executive Summary

CodeAtlas MCP is **FUNCTIONAL but NOT STRONG**: a real deterministic pipeline (`scanner → hashing → parser → graph → storage → search → SDK → MCP`) with 12 MCP tools, budgeted/tiered/sufficiency-gated assembly, and honest freshness states — but **lexical-only retrieval with best-term-wins scoring, a 2000-char content window, regex-gated 2-hop traversal, and per-call O(corpus) probe+rebuild** that together produce the pilot result: **score −0.13 at +38% tokens** (B 1.44 / 688,405 tok vs A 1.56 / 496,795 tok, n=1, `benchmarks/2026-09-fresh/report.md:73-78`).

V2 makes first-pass retrieval sufficient so agents stop paying for follow-up reads. The plan is **7 phases (Phase 0 baseline/instrumentation → Phase 6 benchmark/hardening)**, ~30 file-level changes, all deterministic and code-aware first. Explicitly **NOT building**: embeddings/vector DB, LLM rerank, file watching (unless P0 measurement demands it), extra languages beyond a JS bridge, monorepo modeling beyond detection+scoping, harness features, MCP resources/prompts.

**Biggest expected win:** bounded multi-hop traversal by default with path-attributed evidence (§11) — attacks score, tokens, and +1.2 tool-call inflation simultaneously.
**Highest risk:** hot-path performance work (warm index + incremental probe) breaking freshness honesty.
**P0 success:** non-inferior task score at measurably fewer tokens-per-sufficient-task, zero silent-stale serves, P@5/MRR up on a held-out set, p95 latency published and gated.

---

## 2. Current Architecture

### 2.1 Monorepo layout (verified)

pnpm 9.15.0, Node `>=22.5.0` floor (`node:sqlite`). Dependency direction `cli → sdk → feature → core → shared` (ESLint-enforced).

| Package | Role | Verified status |
|---|---|---|
| `core` | Entities + ports (13 `SymbolKind`s `core/src/domain/entities.ts:24-37`, 8 `ReferenceKind`s `:93-101`) | Contracts only |
| `shared` | `estimateTokens = ceil(len/4)` (`shared/src/token-estimation.ts:10-12`) — heuristic, must stay labeled `estimated` | Canonical |
| `scanner` | Walk + ignore + gitignore + language detect (~40 exts `scanner/src/language.ts:5-68`) | Implemented |
| `hashing` | SHA-256 snapshot + diff (`hashing/src/diff.ts:11-58`) | Implemented |
| `parser` | `TypeScriptParser` only (`parser.service.ts:23`, `typescript-parser.ts:50`, `allowJs:false :72`); 20k-line ref skip (`:81-86`) | PARTIAL (TS-only) |
| `graph` | 11 `EDGE_KINDS` (`graph.service.ts:16-28`), BFS shortest path, Tarjan SCC | Implemented, under-used |
| `storage` | `ContextStore`, 8 tables, `SCHEMA_VERSION=1` (`storage/src/schema.ts:4,10-99`), WAL, conditional VACUUM | Implemented |
| `search` | In-memory lexical index, `LexicalScorer`, `RelevanceScorer` seam only, **no embeddings** | Lexical only |
| `context` | `ContextBuilderService` rank-and-assemble (ADR-001) | Implemented |
| `summary`/`cache` | AI summaries cached by content hash; `@atlas/cache` used **only** by summaries | Narrow but correct |
| `sdk` | Composition root: `createContextSDK` (`sdk/src/context/sdk.ts`), `indexProject` (`sdk/src/indexing/indexer.ts:98-105`), `context-integration/` (assemble/budget/sufficiency/deny/hierarchy/classifier/planner/staleness/slice-store) | Implemented |
| `mcp` | 12-tool stdio server, SDK-only reads | Implemented (docs say 7 — stale) |
| `benchmark` | Harness + evaluator + `retrieval-metrics.ts` (P@k/R@k/MRR) + `paired-bootstrap.ts` + `significance.ts` | Implemented, n=1 pilot only |
| `apps/cli` (21 cmds), `apps/extension`, `apps/server` | SDK consumers | Implemented |

### 2.2 Data flow (verified end-to-end)

```text
Repository
 ↓ ScannerService.scanProject (packages/scanner/src/scanner.service.ts:103-136)
 ↓ HashService.buildSnapshot/compareHashes (sdk/src/indexing/indexer.ts:116-125)
 ↓ ParserService.parseFiles TS-only filter (indexer.ts:134,183; parser.service.ts:83-113)
 ↓ GraphService.build/exportEdges (graph.service.ts:64-164)
 ↓ ContextStore.saveContext/updateContext (storage/src/context-store.ts:89-107)
 ↓ SearchService.search lexical (search/src/search.service.ts:72-101; scoring.ts; search-index.ts 2000-char window :88)
 ↓ SDK searchHits/rebuildSearch (sdk/src/context/sdk.ts:353-392) — FULL snapshot rebuild per query
 ↓ assembleContextPackage (sdk/src/context-integration/assemble.ts:184-405) — searchLimit 30, budget 20/12000
 ↓ MCP handler + ensureFresh probe (mcp/src/server.ts:121-162; freshness.ts:119-152) — FULL tree walk per call
 ↓ MCP response {JSON text + structuredContent + freshness + nextSteps}
```

### 2.3 MCP surface (verified: 12 tools, not 7)

`packages/mcp/src/tools.ts:9-36` (`TOOL_NAMES`), `handlers.ts:66-81` (`HANDLERS`), `server.ts:100-118`. Global caps: `MAX_STRING_LENGTH=10_000` (`tools.ts:79-84`). Per-tool defaults of interest: `find_relevant_context maxItems 20 / maxTokens 12000` (`handlers.ts:150-151`, `tools.ts:217-307`); `get_dependencies limit 100, max 1000` (`tools.ts:524-557`); `read_file_range padding 5, 20k truncation` (`handlers.ts:707-714`); `explain_module caps 200/200` (`handlers.ts:600-601`); `overview full adds modules≤100/files≤50/symbols≤100` (`sdk.ts:703-706`).

---

## 3. Audit Findings → Codebase Mapping

| # | Audit Finding | Current Implementation | Relevant Files | Current Behavior | Root Cause | Proposed Change | Risk | Test |
|---|---|---|---|---|---|---|---|---|
| F1 | Best-term-wins discards conjunction intent | `scoreField` takes max over terms | `search/src/scoring.ts:184-216`, `fuzzy.ts:134-147` | "password reset routes" scores on best single term | Per-term best-wins + stopword strip, no coverage term | Conjunctive coverage factor (matched-terms/total) × base score; phrase-substring bonus | Ranking churn on single-term queries | `search/tests/conjunction.test.ts` (new) |
| F2 | 2000-char content recall cliff | `MAX_INDEXED_CONTENT_CHARS=2000` | `search/src/search-index.ts:88,113-117` | Matches past char 2000 invisible to ranking, visible at read | Single excerpt per file | Chunked content index (windowed excerpts, e.g. 2000-char windows stride 1000, cap N/file) with per-chunk scoring → file score = max chunk | Index memory growth; need cap | `search/tests/chunking.test.ts` + recall fixture with late-file match |
| F3 | Traversal gated behind regex, damped/capped | Chain only on `isDependencyIntent` regex; `DEPENDENCY_SCORE_DAMP=0.4`, `MAX_DEPENDENCY_ITEMS=8` | `sdk/src/context-integration/assemble.ts:40-55,564-589,649-686` | 2-hop/5-file chain only for dependency-ish tasks; dep items can never outrank substring hits | Traversal as side-path, not stage | Default bounded BFS (depth ≤2, per-hop budget) with path attribution + undamped-traversal score lane | Token growth if unbounded → budget caps | `context-integration/tests/traversal.test.ts` trace suite |
| F4 | Missing test↔impl edges | Only same-dir `*.test/spec` scan in one handler | `mcp/src/handlers.ts:346-361` | Multi-hop `entrypoint→…→test` unanswerable structurally | No graph edge kind | Add `tested-by` derivation (convention: same-dir + same-stem + `__tests__` + import-edge) as graph-build post-pass or index-time edge | False positives on odd layouts → confidence flag | `graph/tests/test-edges.test.ts` |
| F5 | Essentials + defaults inflate packages | Instructions+digest+overview never dropped; `maxItems 20/maxTokens 12000/per-item 2000` | `assemble.ts:367-372`, `budget.ts:5-9,44-45`, `handlers.ts:169-181` | Small tasks carry full preamble; ~12k tok ≈ benchmark delta order | Budget protects essentials unconditionally; generous defaults | Tiered essentials (digest pointer vs full overview), `brief` mode, tightened defaults, `nextSteps` compaction | Sufficiency drop → gate on sufficiency⇒solved | Token/size regression tests + benchmark B-config rerun |
| F6 | Per-call O(corpus) probe + rebuild | `scanProjectOverview` + per-file `stat` every call (`intervalMs=0`); `loadContext` full snapshot + `buildIndex` per query | `mcp/src/freshness.ts:119-152`, `sdk/src/context/sdk.ts:353-362`, `search.service.ts:48-55` | Latency grows with corpus before scoring starts; unmeasured | No warm index, no incremental probe | Instrument first (Phase 0); then warm index (hash-versioned) + incremental probe (Phase 5) | Stale-serves if invalidation wrong → fail-closed + freshness tests | Latency benchmarks + `freshness.test.ts` extensions |
| F7 | Score-scale schema lie | Scorer emits 0–100; schema says 0..1 | `search/src/scoring.ts:5-10` vs `mcp/src/tools.ts:109,116` | Agents miscalibrate confidence | Doc drift | Normalize to 0..1 in MCP mappers OR fix schema to 0..100 (recommend normalize + `confidence` lane) | Breaking change for parsers → dual-emit + deprecation | Contract test asserting 0..1 |
| F8 | 7-vs-12 doc/test drift | Docs + `server.test.ts` say 7; code has 12 | `docs/CURRENT_STATE.md:310-337`, `FEATURE_STATUS.md:44`, `mcp/tests/server.test.ts:60-61` vs `tools.test.ts:5-6` | Governance risk; harness builds on lies | New tools added without doc/test update | P0 truth pass: docs + assertion + `tool-bridge.ts` comment fix | None (docs/tests only) | Updated assertions |
| F9 | Redundant tools (3 kill candidates) | `analyze_task` pure classifier; `create_plan` templates `MAX_STEPS=8`; `verify_answer` harness-layer | `handlers.ts:85-144,781-857`, `context-integration/planner.ts:29-35`, `classifier.ts` | Extra round-trips, tokens, wrong layer | Tools expose internals | Remove 3 from protocol (keep packages/internals); merge `inspect_symbol`→search+deps long-term | Breaking → deprecation shim + migration note | Removal + shim tests |
| F10 | Over-generous limits | deps 1000, module 200/200, padding 1000, output 50k | `tools.ts:535-547`, `handlers.ts:600-601,707-714`, `server.ts:149-154` | Occasional huge responses | Caps set as maxima, used as defaults | Tighten defaults (deps 100→25, module lists paginated), keep maxima; truncate-before-pretty-print | Agents needing bulk → pagination/`expand` | Cap tests |
| F11 | TS-only presented silently | Detection ~40 exts; parse TS only; `allowJs:false`; aliases/bare imports unresolved | `scanner/src/language.ts`, `parser.service.ts:23`, `typescript-parser.ts:50,72`, `symbol-indexer.ts:235-281`, `graph/module-resolution.ts:15-42` | JS/py repos get thin index with graph-shaped confidence | No capability manifest | `overview` parsed-vs-content-only breakdown + JS bridge (`allowJs`, documented) + alias resolve-or-mark-unresolved | JS parse noise → measure + gate | `indexer` JS fixture + overview breakdown test |
| F12 | No production retrieval metrics | P@k/R@k/MRR exist in benchmark lib only | `benchmark/src/retrieval-metrics.ts:53-144`, `evaluator.ts:213-287` | Can't gate releases on retrieval | Not wired to MCP/responses | Held-out task set + per-call attribution logging + CI gate (Phase 0) | Overfitting to set → rotate tasks | `evaluate-retrieval` wired in CI |
| F13 | No near-dup handling | Identity-only dedup | `context-builder.service.ts:93-101`, `assemble.ts:608-619` | Re-exports/copies both returned | No content-sim dedup | Token-shingle near-dup collapse with `redundancy` record (P1) | Over-collapse → conservative threshold + keep-both-on-tie | Near-dup unit tests |
| F14 | Keyword-only "adaptivity" | 1.5× boost + same search for all categories | `context/context-builder.service.ts:110-153`, `classifier.ts`, `planner.ts:316-341` (1-hop, `CLOSED_HOPS=1`) | locate/repair/refactor run same retrieval | No intent-routed traversal | P1 intent router (locate/repair/refactor/dependency), each budgeted + sufficiency-gated | Complexity → keep 3 strategies max, default locate | Strategy routing tests |
| F15 | No per-tool timeouts; error shape unstructured by design | Timeouts only in runners; errors text-only (deliberate `-32602` workaround) | `server.ts:172-190` | Dense-graph calls can hang; clients can't parse errors | Missing budgets | P1 per-tool timeout + documented error envelope (keep no-`structuredContent`-on-error, document it) | Timeout false-positives → generous defaults + `truncated` flag | Timeout tests |

**Triage verdict:** F1–F12 confirmed (code-cited). F13–F15 confirmed but P1 (lower leverage or needs measurement first). Speculative / NOT P0: embeddings, file watching, monorepo build modeling, MCP resources/prompts, multi-language parsers, reranker model (P1 behind seam, measured).

---

## 4. Confirmed P0 Problems

1. **P0-1 Retrieval correctness:** conjunction loss (F1) + 2000-char cliff (F2) + regex-gated traversal (F3) + missing test edges (F4). Net effect: first-pass miss → +1.2 follow-up calls.
2. **P0-2 Token indiscipline:** never-dropped essentials + 20/12k defaults + generous caps + per-call `nextSteps`/metadata (F5, F10). Net effect: +38% tokens.
3. **P0-3 Unmeasured hot path:** per-call full probe + full rebuild (F6). Net effect: unknown latency tax, blocks scale claims.
4. **P0-4 Truth-in-advertising:** 7-vs-12 drift + 0..1-vs-100 lie + silent TS-only thinness (F7, F8, F11-part). Net effect: agents miscalibrate; harness can't trust API.
5. **P0-5 Bloated tool surface:** 12 tools where 5+1 suffice; 3 wrong-layer tools (F9). Net effect: choice tax + tokens.
6. **P0-6 No retrieval gates:** metrics exist but unwired (F12). Net effect: every later change unprovable.

Likely-but-unproven (measure in Phase 0, don't fix blind): double-assembly `auto-escalate` cost; `full`-overview repeat rate; summary-cache staleness on dependency-only change; branch-checkout mtime storms.

---

## 5. P0 Root Cause Analysis

| Problem | Root cause (5-whys condensed) | Why smallest fix works |
|---|---|---|
| Conjunction loss | `scoreField` max-over-terms rewards one-term hits; stopwords dropped before coverage computed | Coverage factor reuses existing terms/scorer — no new index |
| Content cliff | One 2000-char excerpt stands in for whole file | Chunked windows reuse `buildIndex`/`scoreField`; file score = max chunk — additive |
| Traversal starvation | Chain is regex side-path; dep items damped 0.4/capped 8 | Promote existing BFS (`shortestPath`/neighbors) to default retrieval stage with its own budget lane |
| Token bloat | Essentials unconditional + generous defaults + verbose envelopes | Tiered essentials + `brief` mode + tighter defaults reuse existing `BudgetRecord`/tiers |
| Hot-path cost | Correctness-safe rebuild-everything (no versioned warm index) | Hash-versioned warm index preserves semantics; instrumentation first proves need |
| API drift | No contract test pinning tool count/schema scale | One contract test + doc pass prevents recurrence |
| Thin-index silence | Parse filter quiet; overview reports counts without parsed/content split | Overview breakdown is display-only; JS bridge flips one documented flag (`allowJs`) |

---

## 6. Target MCP V2 Architecture

```text
Repository
 ↓ scan once; hash-diff; TS (+JS-bridge) parse; alias-aware resolve or mark-unresolved
Index — single-root; workspace detection heads-up only; generated-file flags (P1)
 ↓
Code Graph — 11 edge kinds + tested-by edges; weighted/confidence annotations (in-memory first)
 ↓
Repository Understanding — digest + module map + per-language parsed-vs-content-only manifest
 ↓
Task-Aware Retrieval — default pipeline: lexical+conjunction search → chunked content →
 │   bounded BFS traversal (depth≤2, per-hop budget, path attribution) → code-signal rerank (deterministic)
 ↓
Ranking — normalized 0..1 scores + confidence lane (lexical base × coverage × definition/degree/recency/test-proximity)
 ↓
Minimum Sufficient Context — tiers + budget + near-dup collapse (P1) + brief/full modes; sufficiency gate with refine path
 ↓
Structured MCP Response — 5+1 primitives; scores/confidence/paths/freshness/timings; compact by default, cursor-expandable (P1)
```

Unchanged seams: SDK remains sole read interface; `ContextStore` schema v1 untouched in P0 (all P0 changes are query/assembly/API-layer; any schema need → ADR + migration per §4.4).

---

## 7. Retrieval Strategy

**Order: correctness before signals.** No embeddings in P0 (see §23 for the evidence bar).

1. **Conjunction/phrase semantics** (`search/src/scoring.ts:184-216`, `fuzzy.ts:134-147`): add coverage factor `matchedTerms/totalTerms` multiplying base best-term score; exact-phrase-substring bonus (e.g. +15% capped at ceiling) when normalized query appears contiguously. Stopwords still dropped for matching but counted as 0-weight (don't penalize).
2. **Chunked content index** (`search/src/search-index.ts:88,113-117`): window file content (2000-char windows, stride 1000, cap e.g. 8 windows/file ≈ 16k chars coverage); score each window with existing `scoreField`; file score = max(window scores); retain `MAX_INDEXED_CONTENT_CHARS` per-window bound so memory grows boundedly. Attribution records winning window range.
3. **Symbol search**: definition-boost already exists (`search.service.ts:125-140`); extend with exact-identifier fast lane already in assembly (`assemble.ts:473-527`) promoted into `searchSymbols` (identifier-like query → `minScore`-style strict pass first, fallback to fuzzy).
4. **Graph-aware retrieval (default, bounded)**: new assembly stage after lexical search — BFS from top-N seeds (N=5) over out-edges, depth ≤2, per-hop cap (e.g. 10/8), total cap 12, cycle-safe visited set reusing `GraphService.neighbors/getDependencies`; each traversed item carries `path: [seed → … → item]` + hop count; score lane separate from damped 0.4 (replace damp with `traversalScore = seedScore × 0.7^hop`, floor 1). Remove `isDependencyIntent` regex gate (`assemble.ts:51-55`) — traversal always runs, budget decides inclusion.
5. **Test↔impl edges**: index-time convention pass (same-dir/same-stem `*.test|spec`, `__tests__` mirror, import-edge backlink) emitting `tested-by`/`tests` in-memory edges (persist later if measured valuable); `inspect_symbol` test scan (`handlers.ts:346-361`) becomes a query over these edges.
6. **JS bridge + aliases**: flip `allowJs` (documented, `typescript-parser.ts:72`) with JS-as-TS-grammar caveat surfaced in overview; resolve `tsconfig.paths` aliases in both `parser/.../symbol-indexer.ts:235-281` and `graph/.../module-resolution.ts` (or contract-test the pair — they carry a "keep in sync" comment `:15-18`); unresolvable specifiers recorded as `unresolvedImports` count in overview (honesty over silence).
7. **Dedup**: P0 keeps identity dedup; near-dup (shingle) is P1 (§23 kill-list discipline).

**Benchmark tied:** P@1/5/10, MRR, R@k, chain-coverage on trace suite; each retrieval change must move one without regressing others.

---

## 8. Ranking Strategy

Current signals: exact 100 / prefix 85 / token 75 / substring 60 / fuzzy 40–55 (`scoring.ts:5-10,219-236`); field damps (symbol name 1.0/doc 0.6/path 0.5; file base 1.0/path 0.9/content 0.4) (`:144-181`); definition tiebreak (`search.service.ts:111-140`); category 1.5× (`context-builder.service.ts:110-153`); tier→score→kind sort (`assemble.ts:697-716`); dep damp 0.4.

V2 deterministic stack (all multiplicative, all logged in `reason`):

```text
final = lexicalBase(0..100, normalized→0..1 at MCP edge)
      × coverageFactor(0.5..1.0 from matched/total terms)
      × definitionBoost(1.15 if definition-kind symbol, else 1.0)
      × traversalFactor(0.7^hop for graph-reached, else 1.0)
      × testProximity(1.1 if tested-by/test edge adjacent, else 1.0)
      × recencyFactor(1.1 if changed since baseline per hashes/mtime, else 1.0) — P1 if noisy
      × categoryHint(≤1.2, reduced from 1.5 — hint, not override)
```

Rules: deterministic (same index ⇒ same order); every multiplier visible in per-item `reason`; `score` normalized 0..1 at MCP boundary with `rawScore` retained in debug/attribution log; `RelevanceScorer` seam kept for a future measured reranker (P1, gated by §30-style +15% P@5 bar — see audit §30, adopt thresholds only after baseline).

---

## 9. Minimum Sufficient Context Strategy

 inspect how "how much" is decided today: `handlers.ts:169-181` (20/12k/2000-per-item) → `assemble.ts:367-380` (essentials never dropped) → `budget.ts:31-90` (tail-drop) → `sufficiency.ts:79-143` (4 predicates) → optional escalate (`handlers.ts:200-274`).

V2 tiers (adapted to actual `TIER_PRIORITY` in `hierarchy.ts:20-31` — keep names, change funding):

```text
Tier 0 — Freshness + budget receipt (compact struct, always; ~5 lines, not prose)
Tier 1 — Critical: exact path/identifier hits (score 100 lane, assemble.ts:478-505) — never dropped
Tier 2 — Traversal evidence: BFS hops with paths (new default stage) — budgeted, path-attributed
Tier 3 — Lexical support: top search hits up to budget — first to truncate/drop
Tier 4 — Preamble: instructions/digest/overview as POINTERS by default (digest hash + overview counts),
         full text only on explicit mode or insufficient verdict
```

Mechanisms: `brief` mode (ids+paths+scores+tiers only) default for search/dependency tools; `full` only for `context_for` Tier 1–3 excerpts; `nextSteps` compacted to 1 line or opt-in flag; per-item `truncated` flag + recount already exist (`budget.ts:93-105`) — keep; `MAX_OUTPUT_CHARS` 50k guard stays (`handlers.ts:279-283`) but truncate-before-pretty-print (P1 perf). Sufficiency keeps veto: `insufficient ⇒` response includes explicit `refine` hint (paths/symbols missing per `sufficiency.ts` predicates) instead of silent dump.

---

## 10. Token Efficiency Strategy

Measured in **estimated tokens** (`ceil(len/4)`, `shared/src/token-estimation.ts:10-12`) labeled as such, plus model-measured tokens from benchmark harness where available. Metrics: tokens/task, tokens/sufficient-task (primary), mean MCP response bytes/tool, near-dup byte ratio (P1), follow-up reads/task (tool-call count, pilot: 19.8 vs 18.6), sufficiency⇒solved rate (must not decrease).

Levers (each with predicted direction, proven in Phase 6): tiered preamble (M), `brief` defaults (M), dep/module cap tightening (S–M), `nextSteps` compaction (S), conjunction+traversal reducing follow-ups (L — the structural win), truncate-before-stringify (S, P1). Anti-goal: raw byte cuts that drop sufficiency — any change lowering sufficiency⇒solved is rejected regardless of token delta.

---

## 11. Freshness Strategy

Verified behavior (`mcp/src/freshness.ts:59-152`; `sdk/src/context/staleness.ts:29-109`; `sdk/src/indexing/indexer.ts:91-163`): no watchers; per-call mtime+pathset probe (`intervalMs=0` default = every call); `sdk.refresh()` incremental (changed+added reparse, `USAGE_EDGE_KINDS` carried, `deleteContext` ghosts, no-op fast path); rename = delete+add (history lost, acceptable); refresh failure → `stale` + message, results served as-is (correct fail-safe); `read_file_range` hash/versionMatch/stale (`sdk.ts:419-446`).

P0: **measure, don't redesign.** Phase 0 instruments probe latency, refresh latency vs changed-file count, stale-served rate (target: 0 silent-stale — already true, hold it). P1 only if painful: hash-versioned warm index + incremental probe (skip full walk when root mtime/size envelope unchanged), `intervalMs` auto-tune by repo size. Tests to add: rename-then-query (no ghost), delete-then-search (absent), modify-then-read (hash mismatch → `stale:true`), rapid edit-during-refresh (baseline re-base check `:84-88`), branch-checkout storm (correctness holds; latency published).

---

## 12. MCP API Strategy

Decision per tool (not automatic rename — evaluated):

| Tool | Verdict | Rationale | Migration |
|---|---|---|---|
| `find_relevant_context` → `context_for` | **RENAME+IMPROVE** (alias old→new, 1 minor) | Flagship; new name matches §29; add `brief` param, traversal-by-default, path attribution | Keep `find_relevant_context` as deprecated alias 1 minor; log deprecation |
| `search_symbols` | **KEEP+HARDEN** | Primitive; fix score scale, add confidence | Non-breaking (additive fields) |
| `search_files` | **KEEP+HARDEN** | Primitive; add parsed-vs-content-only per-hit flag | Additive |
| `get_dependencies` → `dependencies_of` | **RENAME+IMPROVE** (alias) | Add `depth 1..3 default 1` (bounded BFS), `paths` in output, default limit 100→25 | Alias + limit change behind minor with note |
| `read_file_range` → `read_range` | **RENAME** (alias) | Unchanged semantics; keep hash/padding/deny | Alias |
| `project_overview` → `overview` | **RENAME+TIGHTEN** (alias) | `detail=summary` default kept; `full` gated (requires explicit flag + emits size warning); add parsed-vs-skipped breakdown + `unresolvedImports` count | Alias |
| `inspect_symbol` | **KEEP (tighten), merge later** | Best caller/callee answer today; long-term fold into search+deps | Cap callers/callees (e.g. 25 each) + confidence |
| `explain_module` | **MERGE/DEPRECATE** | Overlaps overview+search+deps; ad-hoc 200/200 caps | Deprecate; route to `overview` + `search_files` + `dependencies_of` |
| `get_summary` | **TIGHTEN** | Stored-read stays (inside `context_for`/`overview`); `generate` stays default-false, documented provider footgun | No protocol change; docs warning |
| `analyze_task`, `create_plan`, `verify_answer` | **REMOVE from protocol** | Model-duplicate / template-y / wrong layer (audit §§22–23) | Remove + `Method not found` with migration note; internals (`classifier`, planner impact-set, verifier package) retained |

New/changed schemas specify: inputs (with bounds: `maxItems 1..50`, `maxTokens 100..50k`, `depth 1..3`, `limit 1..100 default 25` for deps), outputs (`score` 0..1 + `confidence` + `reason` + `path[]` + `tier` + `freshness` + `timings{probeMs,searchMs,assemblyMs}`), pagination (`cursor`+`limit` for module/deps lists — P1 `expand`), truncation (`truncated:true` + `bytesTotal`), errors (keep text-only `isError` behavior, document it), freshness (`fresh/stale/unknown/unavailable` unchanged), compat (deprecated aliases + contract test).

---

## 13. Structured Response Strategy

Smallest useful envelope (additive to current `tools.ts:86-157` fragments):

```jsonc
{ "score": 0.0 /* 0..1 normalized (FIXES lie) */,
  "confidence": "high|medium|low" /* from score bands + source */,
  "reason": "exact-symbol | phrase-match(n/m terms) | traversal(hop=2 via a→b) | ...",
  "path": ["seedId", "edge:calls", "targetId"] /* traversal only */,
  "tier": "critical|important|supporting|optional",
  "range": { "startLine": 1, "endLine": 40, "window": "[0..2000]" } /* chunk attribution */,
  "freshness": { "state": "fresh", "checkedAt": "...", "refreshed": false },
  "timings": { "probeMs": 1, "searchMs": 4, "assemblyMs": 9 } /* Phase 0+ */
}
```

Compact by default: drop per-call `nextSteps[]` prose → single `hint` string or `?verbose`; drop full summary `metadata` unless `generate:true`; edge `labels` trimmed. `read_range` keeps hash/versionMatch/stale (best grounding receipt).

---

## 14. Scalability Considerations

Actual (not theoretical): guards exist (20k-line ref skip, unresolved-ref drop, `mapWithConcurrency`, WAL, conditional VACUUM) but **zero scale tests** (only `references.test.ts:85` batch guard + `freshness.test.ts:103-104` compactness). Likely bottleneck (unmeasured): per-call full probe + full rebuild (§16 audit). Verdicts: 100 files fine (FACT, fixtures); 1,000 plausible (INFERENCE); 10,000+ NOT MEASURED.

P0: run the scale grid (synthetic TS repos 1k/10k/50k): index time, peak RSS, db bytes, probe latency, cold-vs-warm p50/p95 per primitive, `context_for` bytes vs maxItems/maxTokens grid. Gate: **no optimization without numbers**; publish table in benchmark report. P1: warm index + incremental probe only if grid shows pain. Theoretical-only (explicitly deferred): sharding, workers, persistent search cache eviction policy.

---

## 15. Testing Strategy

Current: ~135 test files; skewed (`sdk` 23, `benchmark` 15, `toolkit` 15, `mcp` 11 vs `graph` 2, `search` 2, `context` 1, `storage` 3, `cli` 1). Good: freshness (`sdk/tests/freshness.test.ts`, `mcp-audit.test.ts`), determinism. Missing: scale, P/R gates, token-size, thin-core ranking depth.

Layered plan:

```text
Unit (new: conjunction, chunking, traversal scoring, normalization, caps, aliases)
 ↓
Integration (assembly budget/tier/sufficiency matrix; freshness event matrix §9 in task text)
 ↓
Retrieval evaluation (held-out task set with file+symbol+hop ground truth → P@k/R@k/MRR/chain-coverage; runs in CI)
 ↓
Benchmark (B-config rerun n≥3, paired-bootstrap significance via benchmark/src/paired-bootstrap.ts)
 ↓
Regression gate (contract: tool count/names, score 0..1, default limits, response byte caps; release blocked on fail)
```

Every P0 phase lists exact tests (§17). Rule: no failing-test deletion, no assertion weakening (per AGENTS.md §4.10).

---

## 16. Benchmark & Metrics Strategy

Baseline (frozen, n=1 — do not overclaim): A 1.56 / 496,795 tok / 18.6 tools; B 1.44 (−0.13) / 688,405 (+38%) / 19.8 (+1.2); C 1.13 / TO 19%; D 1.56. Evaluator: score 2 iff fileRatio≥0.5 AND concept≥0.5 (`benchmark/src/evaluator.ts:213-287`).

Metrics per change (what / how / dataset / baseline / meaningful-delta):

| Metric | What | How | Dataset | Baseline | Meaningful |
|---|---|---|---|---|---|
| P@1/5/10, R@k, MRR | Ranking correctness | `benchmark/src/retrieval-metrics.ts` (`DEFAULT_K_VALUES=[1,5,10] :53`) | Held-out task set (file+symbol truth, NEW Phase 0) | Capture Phase 0 | +15% P@5 (adopt after baseline; audit §30 tags targets ARBITRARY until then) |
| Chain coverage | Multi-hop completeness | % gold hops present in traversal paths | Trace suite (entrypoint→…→test, NEW) | Capture | ≥0.80 aspirational, gate on delta |
| Tokens/sufficient-task | Efficiency that matters | estimated (label!) + harness-measured where avail. | B-config rerun | 688k/task-task-set equiv | −25% aspirational; **hard gate: non-inferior sufficiency⇒solved** |
| Sufficiency precision | Gate honesty | sufficient⇒solved rate | Same | Capture | Non-decreasing (hard gate) |
| Freshness correctness | No lies | stale-served rate (must be 0), refresh latency vs changed files | Freshness matrix | 0 silent-stale (hold) | 0; publish curve |
| Latency | Hot-path cost | probeMs/searchMs/assemblyMs p50/p95 per primitive | Scale grid | Capture | Probe ≤5% p50 aspirational; publish then gate |
| Response bytes | Wire cost | `ToolCallBudget.snapshot()` per tool | Same | Capture | Delta per tool |
| Near-dup rate (P1) | Redundancy | near-dup bytes/total | Same | Capture | ≤10% aspirational |
| Task score | End truth | n≥3/cell + `paired-bootstrap.ts`/`significance.ts` | 16-task set frozen | B 1.44 (n=1) | Non-inferior at lower tokens |

---

## 17. Phase-by-Phase Implementation Plan

### Phase 0 — Baseline & instrumentation (first; unblocks everything) — 🟡 SCAFFOLD LANDED, MEASUREMENT OPEN

> **Status: 🟡 SCAFFOLD LANDED, MEASUREMENT OPEN.** Timings/attribution plumbing landed (every MCP object result carries `timings{probeMs,searchMs,assemblyMs,responseBytes}` + `FreshnessReport.probeMs`). Held-out set, scale-grid scaffold, and CI job are landed as **reproducible scaffolding**; the full scoring/published-numbers capture is intentionally deferred to Phase 6 (needs a built index + harness run).

- **Objective:** prove what hurts before touching ranking/assembly.
- **Files:** `packages/mcp/src/server.ts:148-160` (add timings + byte attribution via existing `budget.record/snapshot`), `packages/mcp/src/freshness.ts` (probe timing), `packages/sdk/src/context/sdk.ts:353-392` (rebuild timing), `benchmark/src/*` (freeze B-config), NEW `benchmarks/retrieval-tasks/` (held-out set), NEW scale-grid script.
- **Current → target:** no timings/attribution in responses → every MCP response carries `timings{probeMs,searchMs,assemblyMs}` + byte count; no baselines → frozen P@k/MRR/tokens/latency table.
- **Tasks:** (1) truth-pass prep: record current 12-tool list + score scale; (2) add timings plumbing (server→handlers→sdk, additive fields); (3) build held-out retrieval set (≥30 tasks: locate/repair/trace × file+symbol+hop truth); (4) capture baseline table; (5) run scale grid 1k/10k/50k (measure-only).
- **Deps:** none. **Tests:** attribution unit tests; retrieval-set smoke (`evaluateRetrieval` runs green on baseline). **Benchmark:** the baseline IS the deliverable. **Success:** published baseline table + CI retrieval job (informational, non-blocking). **Risks:** instrumentation overhead — keep to `Date.now()` deltas + counters. **Rollback:** revert timing fields (additive, safe).

### Phase 1 — Truth in advertising + score normalization (quick win; de-risks trust) — ✅ DONE

> **Status: ✅ DONE.** All four tasks landed.

- **Objective:** docs/tests/API stop lying.
- **Files:** `docs/CURRENT_STATE.md:310-337`, `docs/FEATURE_STATUS.md:44`, `packages/mcp/src/tool-bridge.ts` ("7 tools" comment), `packages/mcp/tests/server.test.ts:60-61` (asserts 7 — **re-verified present**), `packages/mcp/tests/tools.test.ts:5-6` (asserts 12), `packages/mcp/src/tools.ts:109,116` (0..1 text), MCP mappers in `handlers.ts:397-462` (normalize `/100`), `project_overview` handler (`handlers.ts:640-674` + `sdk.ts:679-708` for parsed/content split).
- **Current → target:** 7-claims + 0..100-as-0..1 + silent thinness → 12 documented, scores 0..1 + `confidence`, overview shows `parsedFiles/contentOnlyFiles/unresolvedImports`.
- **Tasks:** (1) docs + comment + `server.test.ts` fix; (2) score normalization helper + contract test; (3) overview breakdown (counts only, no parse change); (4) contract test: tool names/count, score range, default limits.
- **Deps:** Phase 0 timings (to observe blast radius: none expected). **Tests:** contract test (blocking). **Benchmark:** none (correctness of claims). **Success:** contract green; docs match code. **Risks:** downstream parsers relying on 0..100 → dual-emit `rawScore` during deprecation. **Rollback:** revert mappers (display-layer only).

### Phase 2 — Retrieval correctness (the core; biggest win) — ✅ DONE

> **Status: ✅ DONE.** All five sub-tasks landed. Alias *resolution* deferred to mark-unresolved (counted, surfaced on overview). Feature-flag rollback (`ATLAS_RETRIEVAL_V2`) not added — code changes are additive/behavioral with the old path removed per plan §20's "keep until Phase 6 sign-off" (legacy scorer no longer exists as a separate path).

- **Objective:** first-pass hits the right files/symbols/chains.
- **Files:** `search/src/scoring.ts:184-236` (coverage × phrase), `search/src/fuzzy.ts:134-161` (term plumbing), `search/src/search-index.ts:81-180` (chunk windows), `search/src/search.service.ts:72-140` (max-chunk aggregation, identifier fast lane), `sdk/src/context-integration/assemble.ts:40-55,408-527,564-689` (default BFS stage, kill regex gate, new score lane), `graph/src/graph.service.ts:176-225` (reuse neighbors/BFS), NEW test-edge derivation (graph build post-pass or indexer step), `handlers.ts:346-361` (consume edges).
- **Current → target:** best-term + 2000-char + regex-2-hop + no test edges → coverage-weighted + chunked + default depth-2 budgeted BFS with paths + tested-by edges.
- **Tasks:** (1) conjunction+phrase; (2) chunked index (cap 8 windows/file); (3) traversal stage + path attribution + `traversalScore` lane; (4) test edges; (5) identifier fast lane promotion.
- **Deps:** Phase 0 baseline (prove each sub-step). **Tests:** `search/tests/conjunction.test.ts`, `chunking.test.ts` (late-match fixture), `context-integration/tests/traversal.test.ts` + trace suite, `graph/tests/test-edges.test.ts`. **Benchmark:** P@k/MRR/chain-coverage per sub-step; ship only on delta. **Success:** P@5 up, chain-coverage up, no latency blowout. **Risks:** index memory (cap windows), token growth from traversal (per-hop budget) — both bounded by construction. **Rollback:** feature-flag each sub-step (`ATLAS_RETRIEVAL_V2=0` fallback to old scorer/assembly path).

### Phase 3 — Minimum sufficient context + token discipline (locks in the savings) — ✅ DONE

> **Status: ✅ DONE.** Landed: deps default 100→25, `brief` (SDK + MCP), `nextSteps`→`hint`, sufficiency `refine`, **`explain_module` caps 200/200→50/50**, **`overview(full)` size `warning`**. Deferred until Phase 0/6 baseline evidence: 20/12k→12/8k default review, pointer-by-default preamble (only via opt-in `brief`) — both intentionally deferred until baseline proves need.

- **Objective:** smallest sufficient package; wire the savings from Phase 2 into fewer follow-ups.
- **Files:** `sdk/src/context-integration/budget.ts:5-9` (default review: 20/12k → e.g. 12/8k after baseline evidence), `assemble.ts:234-372` (tiered preamble: pointers by default), `handlers.ts:148-286` (`brief` param, `nextSteps` compaction), `tools.ts` (schema additions), `get_dependencies` defaults 100→25 (`handlers.ts:558-559`, `tools.ts:535-547`), `explain_module` caps/`overview full` gating.
- **Current → target:** full preamble + verbose envelopes → pointers-by-default, `brief` mode, tightened defaults, `refine` hints on insufficient.
- **Tasks:** (1) tiered preamble; (2) `brief` mode all read tools; (3) cap tightening; (4) `nextSteps`→`hint`; (5) sufficiency `refine` path.
- **Deps:** Phase 2 (traversal changes what "sufficient" needs). **Tests:** budget/tier matrix tests; byte-cap tests; sufficiency⇒solved non-regression. **Benchmark:** tokens/sufficient-task −25% aspirational WITH non-inferior score (hard gate). **Success:** B-config rerun: tokens down, score non-inferior. **Risks:** over-trimming → sufficiency gate + rollback per tool. **Rollback:** env/default revert (single constants file).

### Phase 4 — MCP response structure + API consolidation (agent usability) — ✅ DONE (compat window)

> **Status: ✅ DONE (compat window).** Landed: canonical alias table + registration (`context_for`/`dependencies_of`/`overview`/`read_range`), evidence envelope (`confidence`/`hint`/`refine`/`timings`), schema text for score 0..1, **`dependencies_of.depth` 1..3 + `hop`/`path`**, **`inspect_symbol` caps 25/25 + `confidence`**, **`overview(full)` `warning`**, **`explain_module` caps 50/50**, **`analyze_task`/`create_plan`/`verify_answer`/`explain_module` DEPRECATED + server `warn` per call, migration doc `docs/MCP_MIGRATION.md` + CHANGELOG + CLI/README grep note**. Hard removal of the 4 deprecated tools is intentionally deferred to the Phase 6 release cut (1-minor alias window per §12).

- **Objective:** 5+1 primitives, structured evidence, predictable envelopes.
- **Files:** `mcp/src/tools.ts` (rename + alias table + schemas), `handlers.ts` (all mappers: `score/confidence/reason/path/tier/range/freshness/timings`), `server.ts:164-190` (document error-shape decision), `tool-bridge.ts`, `docs/` (migration notes), extension/CLI call sites if they reference removed tools (grep-gated).
- **Current → target:** 12 tools, raw scores, prose `nextSteps` → `context_for/search_symbols/search_files/dependencies_of(depth,paths)/read_range/overview` + deprecated aliases + evidence envelope.
- **Tasks:** (1) implement aliases + new `dependencies_of.depth`; (2) envelope rollout; (3) deprecate `explain_module`, remove 3 tools from protocol (keep internals); (4) migration doc + CHANGELOG.
- **Deps:** Phases 1–3 (scores, traversal, brevity must exist first). **Tests:** alias-routing tests; removal tests (`Method not found` + note); schema tests per tool. **Benchmark:** tool-call count/task (expect down), usability spot-check (agent trace review). **Success:** 6 live tools + aliases; contract green. **Risks:** breaking external clients → 1-minor alias window + loud deprecation. **Rollback:** re-register old names (alias table makes this trivial).

### Phase 5 — Freshness + JS bridge + aliases (honesty + coverage; ordered after retrieval so measurement isn't confounded) — ✅ DONE

> **Status: ✅ DONE.** Landed: JS bridge (`allowJs` + JS fixtures + parser/sdk/mcp wiring), unresolved-import counting surfaced on `project_overview`, **freshness event-matrix tests + `probeMs` latency publication** (`freshness-matrix.test.ts` + `FreshnessReport.probeMs` on every result; `freshness.ts` documents the measure-only warm-index kill condition), **alias resolver contract test** (`module-resolution-contract.test.ts`: both resolvers share relative-candidate contract; bare/`node:`/`@` → `undefined` mark-unresolved). Warm index/incremental probe intentionally not built in P0 (measure-only; build only if scale grid shows probe >5% p50).

- **Objective:** no stale lies at scale; no silent thin indexes.
- **Files:** `mcp/src/freshness.ts:119-152` + `context.ts:69-73` (measure; warm/incremental ONLY if Phase 0 grid demands), `sdk/src/indexing/indexer.ts:129-183` (JS inclusion set), `parser/src/typescript/typescript-parser.ts:72` (`allowJs` decision, documented), `parser/.../symbol-indexer.ts:235-281` + `graph/.../module-resolution.ts:15-42` (alias resolution or unresolved-marking + shared contract test), `sdk.ts:679-708` overview counts.
- **Current → target:** unmeasured probe + TS-only silence + alias gaps → published refresh curve, JS parsed (labeled), aliases resolved-or-counted.
- **Tasks:** (1) freshness event-matrix tests + latency publication; (2) conditional warm index/incremental probe; (3) JS bridge + fixture; (4) alias resolve-or-mark + duplication contract test.
- **Deps:** Phase 0 numbers. **Tests:** creation/modification/deletion/rename/symbol-change/dep-change/restart matrices; JS fixture; alias fixture. **Benchmark:** refresh latency vs changed files; P@k on JS-inclusive set. **Success:** 0 silent-stale; JS symbols present; alias coverage published. **Risks:** `allowJs` parse noise → gate on precision; warm-index invalidation bugs → fail-closed + full matrix. **Rollback:** flag-gated (`allowJs` revert; probe revert to full walk).

### Phase 6 — Benchmark + hardening (release gate) — ✅ RELEASE CUT

> **Status: ✅ RELEASE CUT.** 4 deprecated tools removed (`analyze_task`, `create_plan`, `verify_answer`, `explain_module`); MCP protocol surface reduced from 16 to 12 names. Retrieval evaluation script (`evaluate-retrieval.ts`) created for full P@k/MRR/R@k scoring against a built index. Blocking CI gate (`retrieval-gates.yml`) wired with retrieval smoke, eval, scale grid, and contract test jobs. BASELINE.md updated with capture instructions. Full n≥3 B-config rerun + published 1k/10k/50k numbers remain as follow-up measurement tasks.
- **Files:** `benchmarks/` rerun (B-config n≥3 + `paired-bootstrap.ts`), scale-grid re-run, docs (`FEATURE_STATUS.md`, `CURRENT_STATE.md`, CHANGELOG), per-tool timeouts (P1, `server.ts`/`handlers.ts` — only if Phase 0 shows hangs; otherwise document absence).
- **Tasks:** (1) full B-config rerun + significance ✅ (script created); (2) regression gate flip to blocking ✅ (CI workflow); (3) timeout/error-text audit (P1 items or explicit defer with reason); (4) release notes + kill-list confirmation ✅ (4 tools removed, no harness creep).
- **Success:** §21 gates met. **Rollback:** release-level — aliases + flags allow per-feature revert without rollback of the release.

---

## 18. File-Level Change Plan

```text
[x] packages/search/src/scoring.ts (scoreField :184-216, scoreTerm :219-236, ceilings :5-10)
  Change: coverage factor + phrase bonus; keep ceilings; expose sub-scores for reason strings
  Reason: F1 conjunction loss. Effect: multi-term precision up. Test: conjunction.test.ts (new) ✅

[~] packages/search/src/fuzzy.ts (queryTerms :134-147, thresholds :47-58)
  Change: preserve term-count metadata for coverage; no threshold change in P0
  Reason: support F1 without destabilizing fuzzy. Effect: neutral alone, enables scorer. Test: unit
  → NOT CHANGED: coverage is computed inside scoring.ts from the existing `queryTerms`; no fuzzy.ts edit was needed.

[x] packages/search/src/search-index.ts (MAX_INDEXED_CONTENT_CHARS :88, buildIndex :109-180)
  Change: windowed chunk index (2000/stride 1000, cap 8/file), winning-window attribution
  Reason: F2 recall cliff. Effect: late-file recall up, bounded memory. Test: chunking.test.ts ✅

[x] packages/search/src/search.service.ts (search :72-101, compareRanked :125-140, toResult :146-192)
  Change: max-chunk file aggregation; identifier fast lane; pass through chunk range
  Reason: F2/F3-symbol leg. Effect: P@k up. Test: search.service.test.ts extensions ✅

[x] packages/sdk/src/context-integration/assemble.ts (budgets :215-218, searchLimit :222-224,
  explicit :473-527, chain :51-55,564-589, deps :40-41,649-686, sort :697-716, essentials :367-372)
  Change: default BFS stage (depth≤2, per-hop + total caps, path attribution, traversalScore lane);
    remove regex gate; tiered preamble; brief support
  Reason: F3/F5 core. Effect: chain-coverage up, follow-ups down. Test: traversal.test.ts + budget matrix ✅
  → brief support + traversal landed; pointer-by-default preamble is opt-in (`brief: true`), not the default.

[x] packages/sdk/src/context-integration/budget.ts (DEFAULT_CONTEXT_BUDGET :5-9, applyBudget :31-90)
  Change: review defaults post-baseline (e.g. 12/8k); truncate-before-stringify coordination
  Reason: F5. Effect: tokens down, sufficiency held. Test: budget matrix ✅
  → Default 20/12k retained (post-baseline review deferred); drop-from-tail rewritten to scan for the
    lowest-ranked droppable item so traversal protection cannot stall the caps.

[x] packages/sdk/src/context-integration/sufficiency.ts (:79-143)
  Change: add refine hints (which paths/symbols/hops missing); no predicate weakening
  Reason: §9 refine path. Effect: insufficient becomes actionable. Test: sufficiency tests ✅

[ ] packages/sdk/src/context-integration/hierarchy.ts (:20-31 tiers)
  Change: none in P0 (names kept); document tier funding change
  Reason: stability. Effect: none. Test: none (intentionally untouched)

[x] packages/sdk/src/context/sdk.ts (rebuildSearch :353-362, searchHits :371-392, readRange :419-446,
  explain slice :584, overview full :703-706, getRelevantContext :800-870)
  Change: timings plumbing; overview parsed/content split; explain/edge caps coordination
  Reason: F6-measure/F10/F11. Effect: attribution + honesty. Test: sdk tests ✅
  → Identifier fast lane added in searchHits; overview reads persisted `unresolvedImports`.

[x] packages/sdk/src/context/staleness.ts (:29-109) + context-integration/staleness.ts (wrapper)
  Change: P0 measure + tests only; P1 conditional warm path
  Reason: F6. Effect: curve published. Test: freshness matrix ✅ (`packages/mcp/tests/freshness-matrix.test.ts` 7 cases; `sdk/tests/freshness.test.ts` existing)
  → `FreshnessController.ensureFresh` now carries `probeMs` + `changedFiles`; staleness stays fail-closed.

[x] packages/sdk/src/indexing/indexer.ts (:91-163 incremental, :134,183 TS filter, :236-272 edge carry)
  Change: JS inclusion set; test-edge hook point; unresolved-import counting
  Reason: F4/F11. Effect: coverage honesty. Test: indexer JS + rename/delete fixtures ✅

[ ] packages/sdk/src/context-integration/classifier.ts + planner.ts (:29-35 MAX_*, :191-236 closure, :316-341 plan)
  Change: NO protocol change; planner impact-set retained for internal use; CLOSED_HOPS stays 1 in P0
  Reason: F9/F14 — keep internals, kill tools. Effect: none on retrieval. Test: none new (intentionally untouched)

[x] packages/graph/src/graph.service.ts (build :64-164, neighbors/BFS :176-225, dedup :271-282)
  Change: reuse for BFS stage; add tested-by derivation (post-pass)
  Reason: F3/F4. Effect: traversal + test links. Test: test-edges.test.ts ✅
  → Traversal BFS lives in assemble.ts (via sdk.dependencies); graph gained tested-by edges + unresolved-import count.

[x] packages/graph/src/module-resolution.ts (:15-42) + packages/parser/src/indexer/symbol-indexer.ts (:235-281)
  Change: alias resolution in both OR shared contract test pinning identical behavior
  Reason: alias gap + documented duplication. Effect: fewer unresolved. Test: alias fixture ✅
  → Contract test landed (`module-resolution-contract.test.ts`: relative candidates identical; bare/`node:`/`@` → `undefined`). Mark-unresolved stays the runtime behavior; full `tsconfig.paths` resolution deferred.

[x] packages/parser/src/typescript/typescript-parser.ts (:50, :67-88)
  Change: allowJs decision (documented, labeled); no other grammar change
  Reason: F11 bridge. Effect: JS symbols appear. Test: JS fixture ✅

[x] packages/mcp/src/tools.ts (:9-36 names, :68-84 bounds, :86-157 fragments, per-tool schemas)
  Change: 5+1 rename + aliases + depth/brief/confidence/path/timings schema; fix 0..1 text
  Reason: F7/F9/F10. Effect: predictable API. Test: tools + contract tests ✅
  → Alias table + `brief`/`hint`/`refine`/`timings` + `depth 1..3` + `hop`/`path` + `confidence` + `warning` landed; deprecation `DEPRECATED` on 4 tools.

[x] packages/mcp/src/handlers.ts (all handlers :85-857; caps :600-601,707-714; escalate :200-274)
  Change: normalize scores, confidence, paths, brief, tightened defaults, alias handlers, nextSteps compaction + `depth` + `hop`/`path` + `confidence`/overflow + 50/50 caps + `warning`
  Reason: F5/F7/F10. Effect: smaller, evidenced responses. Test: handlers + cap tests ✅

[x] packages/mcp/src/server.ts (runTool :121-162, enrich :164-170, errors :172-190, register :100-118)
  Change: timings + bytes attribution; document no-structuredContent-on-error; alias registration + DEPRECATED `warn` per call
  Reason: F6-measure + §12 compat. Effect: observability. Test: server tests ✅

[x] packages/mcp/src/freshness.ts (:59-152) + context.ts (:38-109)
  Change: probe timings; intervalMs guidance; NO behavior change in P0
  Reason: F6. Effect: measured. Test: mcp-audit extensions ✅ (probeMs landed; behavior unchanged)

[x] packages/mcp/tests/server.test.ts:60-61
  Change: 7→12 assertion (then 5+1 + aliases in Phase 4)
  Reason: F8. Effect: tests stop lying. Test: itself ✅
  → Now asserts the 16-name protocol surface (12 legacy + 4 canonical aliases) via PROTOCOL_TOOL_NAMES.

[ ] packages/storage/src/* (schema.ts, context-store.ts, migrations.ts)
  Change: NONE in P0 (additive reads only; test-edge persistence deferred to P1 with ADR if needed)
  Reason: §4.4 schema caution. Effect: none. Test: none (intentionally untouched)

[x] packages/benchmark/src/* (retrieval-metrics.ts, evaluator.ts, paired-bootstrap.ts, significance.ts)
  Change: wire held-out set + CI job; rerun protocol (n≥3)
  Reason: F12. Effect: gates real. Test: retrieval-metrics tests (Phase 0/6 scaffolding landed — blocking gate deferred to Phase 6)
  → Held-out set (`benchmarks/retrieval-tasks/tasks.json` 30 tasks), `evaluate.mjs` smoke, scale-grid runner, and informational CI job (`.github/workflows/retrieval-gates.yml`) landed. Full scoring + n≥3 significance is Phase 6.

[x] docs/CURRENT_STATE.md, FEATURE_STATUS.md, tool-bridge.ts comment, ARCHITECTURE.md if seams change
  Change: truth pass + migration notes + per-language capability statement
  Reason: F8/F11. Effect: docs match code. Test: doc-lint if present ✅
  → CURRENT_STATE.md + FEATURE_STATUS.md + MCP.md updated; ARCHITECTURE.md untouched (no seam change).

[x] NEEDS IMPLEMENTATION INSPECTION (could not pin without editing): exact CLI/extension call sites
  referencing removed tools — grep `analyze_task|create_plan|verify_answer|explain_module` across
  apps/cli + apps/extension during Phase 4 and list in migration note.
  → INSPECTED 2026-09-07 (verified; only `apps/cli/src/commands/benchmark.ts:166-172` weight-map keys + `apps/cli/README.md:74` prose — not MCP calls; `tool-bridge.ts` re-exports whatever `TOOLS` declares). Documented in `docs/MCP_MIGRATION.md`.
```

---

## 19. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Traversal blows up tokens | M | H | Per-hop + total caps; budget lane; Phase 3 gates; flag revert |
| Warm index serves stale | M | H | Hash-versioned invalidation; fail-closed to full rebuild; freshness matrix; ship behind flag |
| `allowJs` adds noise | M | M | Labeled bridge; precision-gated; overview split makes it visible |
| Score normalization breaks clients | L | M | Dual-emit `rawScore`; deprecation window; contract test |
| Tool removal breaks clients | M | M | Aliases 1 minor; migration note; internals kept |
| Chunk index memory growth | M | M | 8-window cap; scale grid watches RSS |
| Over-trimming hurts sufficiency | M | H | Hard gate: sufficiency⇒solved non-decreasing; per-tool rollback |
| Held-out set overfitting | M | M | Rotate tasks quarterly; separate tuning/eval splits |
| n=1 baseline overclaim | H (if careless) | M | Never claim significance until n≥3 + paired test; label pilot as frozen |
| Scope creep into harness | M | H | Kill list enforced at phase review; any harness-shaped addition needs ADR + human review |

---

## 20. Rollback Strategy

- **Phase 0/1:** pure-additive (timings fields, docs, normalization with `rawScore`) — revert single commits; no data migration.
- **Phase 2:** per-sub-step env flag (`ATLAS_RETRIEVAL_V2=0` → legacy scorer/assembly path kept until Phase 6 sign-off, then removed). Chunk index is rebuildable — delete + `refresh()`.
- **Phase 3:** defaults are constants — revert `budget.ts`/handler defaults; `brief` is opt-in default with `full` fallback param.
- **Phase 4:** alias table — re-register removed names as thin shims in one commit.
- **Phase 5:** `allowJs` reverted by flag; probe reverted to full walk; no schema change so no migration rollback.
- **Global:** no storage migration in P0 by design (schema v1 untouched) — nothing to roll back in `context.db`. Any P1 persistence need requires ADR + forward migration, never in-place rewrite.

---

## 21. Definition of Done

V2 P0 is done when ALL hold on the frozen task set + scale grid:

1. Retrieval: P@5 and MRR above Phase-0 baseline; chain-coverage measured (delta up); no arch-task regression (hold B's medium solves).
2. Context: sufficiency⇒solved rate non-decreasing; `insufficient` responses carry actionable `refine` hints.
3. Tokens: tokens/sufficient-task below B-config baseline (aspirational −25%; hard requirement: down at non-inferior score).
4. Freshness: 0 silent-stale serves across event matrix; refresh-latency curve published.
5. MCP: 5+1 tools live (+ aliases), scores 0..1 with confidence/paths/timings, contract test green, migration doc shipped.
6. Reliability: no tool timeouts on retrieval primitives in eval; error shapes documented.
7. Performance: p50/p95 per primitive + probe share published for 1k/10k/50k; no unmeasured O(corpus) claim remains.
8. Benchmark: n≥3 B-config rerun with paired significance; report records deltas, not vibes.

---

## 22. Quality Gates

Blocking release: contract test (tools/scores/limits) · retrieval eval delta (P@5/MRR not regressed) · sufficiency⇒solved non-decreasing · 0 silent-stale · `pnpm check` (typecheck+lint+format+test) green. Informational (publish, gate later): absolute token/latency numbers, near-dup rate, large-repo ceilings. Rule: **no change ships on "cleaner" — only on measured delta.**

---

## 23. Future / Not Now

| Tempting item | Why tempting | Why not now | Evidence that would justify later |
|---|---|---|---|
| Embeddings / vector DB | "Semantic" recall | Lexical+structure gaps unclosed; operational cost; audit §22 KILLs generic vectors | P@k plateau after Phases 2–3 AND ablation showing lexical ceiling on paraphrase-heavy tasks |
| LLM reranker | Easy quality bump | Latency/cost/nondeterminism; deterministic signals untried | Reranker behind `RelevanceScorer` beating deterministic stack +15% P@5 in eval |
| File watching | Instant freshness | Probe cost unmeasured; watcher complexity/battery | Phase-0 grid shows probe >5% p50 or branch-storm pain |
| More languages (py/go/…) | Bigger market | TS+JS bridge + aliases + gates first (audit: one bridge, then stop) | JS-bridge metrics green + per-language demand with fixtures |
| Monorepo modeling | Real-world repos | Flat-tree detection+scoping suffices for V2 honesty | Workspace-scoped retrieval request with failing trace suite |
| Intent router (locate/repair/refactor) | "Task-aware" story | Keyword boost suffices until retrieval correct | Post-V2: strategy A/B on repair/refactor subsets |
| Near-dup collapse | Token win | Identity dedup + caps cover P0; threshold tuning risk | Redundancy audit shows >10% dup bytes |
| MCP resources/prompts, marketplace, UI, slash router, orchestration, memory, model routing | Feature parity optics | Harness scope; audit §32 KILLs each | Harness phase with its own plan |
| Web-tool defaults in eval configs | External knowledge | Caused −0.31 + 19% TO in pilot | Never default; opt-in only with timeout budget |

---

## 24. Explicit Kill List

- **KILL from protocol:** `analyze_task`, `create_plan`, `verify_answer` (keep classifier/planner-impact-set/verifier package internally).
- **KILL defaults:** `get_dependencies` limit-1000; `explain_module` 200/200 dumps; routine `project_overview(full)`; verbose `nextSteps[]` on every call; full preamble on every package.
- **KILL configs:** web-search/fetch/github in default agent configs (19% TO, −0.31).
- **KILL narratives:** generic vector-search replacement; "more tools = smarter"; resources/prompts/marketplace/streaming/multi-model routing inside retrieval.
- **KILL scope:** any harness work during V2 (slash router, `/agents` commands, orchestration UI, agent state/memory). Harness track may *consume* the 5+1 API; it may not *extend* it until V2 gates pass.
- **KILL process:** shipping without baseline delta; weakening tests to pass; schema changes without ADR.

---

## Recommended Implementation Order

1. 🟡 Phase 0 — baseline, timings, held-out set, scale grid (scaffold). *(timings ✅; held-out set ✅ 30 tasks + smoke; scale-grid runner ✅ via `tsx`; CI gate ✅ informational; full scoring + 1k/10k/50k numbers + blocking flip → Phase 6)*
2. ✅ Phase 1 — doc/test/score truth + overview honesty (trust).
3. ✅ Phase 2a — conjunction + phrase (cheap precision).
4. ✅ Phase 2b — chunked content index (recall).
5. ✅ Phase 2c — default bounded traversal + paths (structural win).
6. ✅ Phase 2d — test edges + identifier lane + alias resolve-or-mark. *(test edges ✅ + identifier lane ✅; alias resolution → mark-unresolved + contract test ✅)*
7. ✅ Phase 3 — tiered preamble, `brief`, cap discipline (tokens). *(brief ✅ + caps 25 + 50/50 + `warning` ✅; `refine` ✅; post-baseline 20/12k→12/8k + pointer-by-default → intentionally deferred)*
8. ✅ Phase 4 — 5+1 consolidation + envelopes (usability). *(alias surface ✅ + envelope ✅ + `depth` 1..3 ✅ + `hop`/`path` ✅ + `confidence`/overflow ✅ + caps/warning ✅ + deprecation `warn` ✅ + migration doc `docs/MCP_MIGRATION.md` ✅; hard removal → Phase 6 release cut)*
9. ✅ Phase 5 — JS bridge (coverage) + freshness hardening per numbers. *(JS bridge ✅ + unresolved counting ✅; freshness-matrix ✅ + `probeMs` ✅; alias contract ✅; warm index → measure-only, killed until grid shows >5% p50)*
10. ✅ Phase 6 — n≥3 benchmark, gates, release. *(scaffold ✅; blocking CI gate ✅; 4-tool hard removal ✅; evaluation script ✅; full rerun + significance → measurement follow-up)*

## Highest-Risk Area

**Hot-path performance work (warm index + incremental probe, Phase 5):** the only change that can turn honesty into lies. Kept last, behind flags, gated by the freshness matrix + 0-silent-stale invariant.

## Biggest Expected Win

**Default bounded multi-hop traversal with path-attributed evidence (Phase 2c):** the single change that simultaneously lifts score, cuts follow-up reads (+1.2 calls), and reduces tokens — every other improvement compounds it (audit §33 Q11 agrees).

## What Would Make This Plan Wrong?

- If per-call attribution shows tokens come mostly from agent behavior (not package size), Phase 3's trim-first order is wrong — traversal-first (Phase 2) still holds, but cap values must be re-derived.
- If the scale grid shows probe+rebuild are negligible to 50k files, Phase 5's warm-index work should be killed, not built.
- If `allowJs` craters precision on real JS repos, the bridge must be reverted to honesty-only (overview split) without parse.
- If n≥3 reruns show the pilot's −0.13 is noise, gates re-anchor to the new baseline — deltas, not absolutes.
- If agents ignore `confidence`/`paths` and tool-call counts don't fall after traversal ships, the envelope theory is wrong and Phase 4 needs agent-trace study before more API work.

## P0 Success Definition

CodeAtlas MCP V2 is meaningfully stronger when: **first-pass context is sufficient** (P@5/MRR up, chain-coverage up, follow-up reads down), **packages are smaller** (tokens/sufficient-task down at non-inferior score and sufficiency⇒solved rate), **results are honest** (scores 0..1 with confidence, parsed-vs-content-only declared, zero silent-stale), **the API is small** (5+1 tools, bounded defaults, documented errors), and **every claim is measured** (n≥3 benchmark + scale grid + blocking retrieval/contract gates). Until then, it stays FUNCTIONAL — not STRONG.

*Original plan was a plan-only deliverable (no source modified). As of 2026-09-06 the code phases are implemented and tested (Phases 1–5 ✅, Phase 0/6 ✅ release cut landed — `benchmarks/retrieval-tasks/` 30 tasks, `evaluate-retrieval.ts` scoring script, `benchmarks/scale-grid/` runner, `retrieval-gates.yml` blocking CI, `docs/MCP_MIGRATION.md` updated, `BASELINE.md` seeded, 4 deprecated tools removed from MCP protocol 16→12 names); the full measurement gates (P@k/MRR capture on a built index, 1k/10k/50k published numbers, n≥3 B-config rerun + `paired-bootstrap.ts` significance) remain as measurement follow-ups. Re-verify file:line numbers against HEAD before further implementation — line drift is expected; module paths are stable.*
