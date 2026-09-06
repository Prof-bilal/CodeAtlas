# CodeAtlas MCP V2 Readiness Audit

> **Mode: AUDIT ONLY — no code was modified.** All findings below are read-only traces of the repository at `/home/abdullah/Projects/CodeAtlas` (git `main`, HEAD `b3d1167`). Every important finding follows the evidence standard: Finding / Evidence / Location / Impact / Confidence / Recommendation / Priority, with FACT vs INFERENCE vs HYPOTHESIS separated. File citations are `path:line`.
> Docs were **not trusted**: `docs/CURRENT_STATE.md` (2026-08-12) and `docs/FEATURE_STATUS.md` are stale in at least one material respect (they claim 7 MCP tools; the code exposes 12).

---

## 1. Executive Verdict

**FACT:** CodeAtlas today is a deterministic, local-first, TypeScript-only repository-intelligence MCP with a real pipeline (`scanner → hashing → parser → graph → storage → search → SDK → MCP`), 12 MCP tools, a budgeted task-aware context assembler with a sufficiency gate, mtime-probed auto-refresh, and a 64-cell pilot benchmark showing **score −0.13 with +38% tokens** for the CodeAtlas-only config vs baseline.

**INFERENCE:** The MCP is **FUNCTIONAL but NOT STRONG**. Its foundation (deterministic graph + SDK seam + budget/deny/sufficiency/freshness machinery) is genuinely better than grep/ripgrep/filesystem tools for one job — *attributable structural retrieval over TypeScript* — but retrieval itself is lexical-only with no semantic layer, no reranker, no measured precision/recall in production, and the benchmark suggests current packaging **costs more tokens than it saves** while slightly hurting average task score.

**HYPOTHESIS (needs measurement, not asserted as fact):** The token regression is driven by a combination of (a) whole-file/large-excerpt assembly defaults, (b) instruction+overview+digest essentials prepended to every package, (c) agents issuing more follow-up reads (`read_file_range`, `inspect_symbol`, `get_dependencies`) because first-pass ranking is lexical and often misses, and (d) per-call full-tree freshness probes + full-snapshot search rebuilds that encourage chatty-but-shallow querying. Only (a)/(b) are directly visible in code defaults; (c)/(d) are strongly supported by code shape plus benchmark deltas, not proven per-call.

**Bottom line:** Keep the deterministic core. Fix retrieval quality and context efficiency before anything else. Kill or merge redundant tools. Do not build harness features.

---

## 2. What CodeAtlas Actually Is

### What problem does CodeAtlas solve?

**Finding:** CodeAtlas solves "give an AI agent a queryable, persistent, structured model of a repository" — files, symbols, dependencies, summaries, and ranked context — instead of forcing the agent to reconstruct that model from raw filesystem/grep output on every turn.
**Evidence:** End-to-end pipeline is wired: `packages/sdk/src/indexing/indexer.ts:98-105` (`indexProject`: Scanner → Hash → Parser → Graph → ContextStore → digest), read path `createContextSDK` (`packages/sdk/src/context/sdk.ts`), MCP thin consumer (`packages/mcp/src/context.ts:46-54` "never DB-direct"), CLI `init/build/update/search/mcp` wired through the SDK (`docs/CURRENT_STATE.md:263-308`, verified against `apps/cli/src/commands/`).
**Location:** `packages/sdk/src/indexing/indexer.ts`, `packages/sdk/src/context/sdk.ts`, `packages/mcp/src/`, `apps/cli/src/commands/`.
**Impact:** Real product, not a wrapper. The pipeline exists and is tested.
**Confidence:** HIGH. **Recommendation:** Keep positioning as intelligence layer, not harness. **Priority:** P0 (positioning constraint).

### Who is the actual consumer?

**Finding:** The real consumers are (1) AI coding agents via MCP stdio tools, (2) the `atlas` CLI user, (3) the VS Code extension tree views. The MCP path is the strategically important one.
**Evidence:** MCP consumes only SDK (`packages/mcp/src/context.ts:46-54`); extension reads only via `createContextSDK` (`docs/CURRENT_STATE.md:339-358`); CLI imports only `sdk (+mcp)` per ESLint matrix (`docs/DEPENDENCIES.md`, `apps/cli/package.json` deps `@atlas/sdk,@atlas/mcp,@atlas/benchmark`).
**Impact:** Any V2 change must keep the SDK as the single read seam. **Confidence:** HIGH. **Priority:** P0.

### What does the MCP provide that ordinary filesystem/search tools do not?

**FACT:**
1. Persistent normalized symbol table + typed dependency graph (11 edge kinds) with callers/callees, inheritance, imports/exports, containment — grep cannot answer "who calls X" structurally.
2. Ranked, fuzzy-tolerant search across files/symbols/modules/dependencies/summaries in one call (`packages/search/src/search.service.ts:72-101`, `packages/search/src/scoring.ts`).
3. Task-aware budgeted assembly (`ContextPackage` with score/source/reason/tier per item, `BudgetRecord`, `ExclusionRecord`, sufficiency verdict) — filesystem tools return bytes, not attributed evidence (`packages/sdk/src/context-integration/assemble.ts`, `budget.ts`, `sufficiency.ts`, `deny.ts`).
4. Freshness reporting + auto-refresh on every tool call (`packages/mcp/src/freshness.ts`, `packages/mcp/src/server.ts:143-148`).
5. Deterministic planning/classification/sufficiency/verification helpers agents otherwise improvise (`classifier.ts`, `planner.ts`, `sufficiency.ts`, `packages/verifier/`).
**INFERENCE:** Items 1–4 are the defensible moat; item 5 is partially harness-adjacent and lower value (see §23).

### Strongest unique capability

Deterministic, budgeted, deny-filtered, freshness-stamped structural retrieval over a real symbol graph, exposed through one SDK seam — when the repo is TypeScript. No grep/ripgrep/LSP replacement claim is credible beyond that sentence.

### Redundant / incomplete / unreliable (summary; detail in §§22–23, 5–7)

- **Redundant:** 12 tools where ~5 primitives would do; `search_symbols`/`search_files` overlap `find_relevant_context`; `project_overview`/`explain_module` overlap; `analyze_task`/`create_plan` duplicate what the agent's own model does.
- **Incomplete:** single-language parsing (TS only), no embeddings/reranker, no measured retrieval metrics in production, no workspace/monorepo model, no file watching, no multi-hop-by-default traversal.
- **Unreliable (adversarial lens):** lexical ranking misses force extra reads (token cost); per-call full-tree probe + full-snapshot rebuild unmeasured at scale; stale-test + stale-doc drift (7-vs-12 tools) signals governance risk.

### Why would an agent prefer CodeAtlas over grep/ripgrep/LSP/plain search?

**Brutally honest answer:** Today, only for three queries: (a) "who calls / what does X depend on" (graph), (b) "give me the minimal attributed set of files/symbols for this task with a sufficiency verdict" (assembly), (c) "is my context fresh" (freshness stamp). For everything else — exact string search, go-to-definition in an open editor, broad cross-language search — ripgrep/LSP/plain search wins on recall, latency, or language coverage. V2 must widen (a)–(c) from "true for TS" to "true and measured."

---

## 3. Repository Architecture Map

**FACT — monorepo layout** (`package.json`: pnpm `9.15.0`, Node `>=22.5.0` floor everywhere for `node:sqlite`; `pnpm-workspace.yaml:3` `packages/*`):

| Package | Role | Status (code-verified) |
|---|---|---|
| `core` | Entities + ports (type-only) | Contracts only |
| `shared` | `Result`, branded types, `estimateTokens` (`shared/src/token-estimation.ts:10-12` `ceil(len/4)` heuristic), `mapWithConcurrency` | Canonical impl |
| `scanner` | Walk + ignore + language/framework/manifest | Implemented |
| `hashing` | SHA-256 snapshots + diff | Implemented |
| `parser` | TS-only (`TypeScriptParser`, `parser.service.ts:23` registers only TS) | PARTIAL |
| `graph` | 11 edge kinds, BFS shortest path, Tarjan SCC | Implemented |
| `storage` | `ContextStore`, 8 tables, `SCHEMA_VERSION=1` (`storage/src/schema.ts:4,10-99`), migrations, transactions, WAL | Implemented |
| `search` | In-memory lexical index + `LexicalScorer`; `RelevanceScorer` seam, **no embeddings** | Implemented (lexical only) |
| `context` | `ContextBuilderService` deterministic rank-and-assemble (ADR-001) | Implemented |
| `summary` | AI summaries, content-hash cached via `CachePort` | Implemented |
| `cache` | In-memory + TTL + optional JSON persist; **sole consumer is summaries** (`summary.service.ts:2,27,42`) | Implemented, narrow use |
| `providers` | Adapters quarantined behind `ProviderPort`; default service wires **zero** providers (`CURRENT_STATE.md:165-167`) | PARTIAL (by design) |
| `agents` | CLI detection/run, `ProcessRunner` argv-only spawns, `SessionManager` behind `SessionPort` | Implemented |
| `usage`/`metrics` | Tri-state tokens/cost, budgets/limits; local analytics | Implemented |
| `toolkit` | Registry/manifest/compat/installer/configurator/security + `catalog.json` | Implemented (Tasks 19–24) |
| `benchmark` | Harness + evaluator + retrieval-metrics + reporters + runners | Implemented |
| `verifier` | Claim-checks + `verify.json` command policy (ADR-018) | Implemented |
| `mcp` | 12-tool stdio server, SDK-only reads | Implemented |
| `sdk` | Composition root + `createContextSDK` + `indexProject` + context-integration + orchestrator | Implemented |
| `apps/cli` | 21 top-level commands via SDK | Implemented (TUI v2 unshipped/untracked) |
| `apps/extension` | 5 tree views, SDK-only | Implemented |
| `apps/server` | Benchmark HTTP API `127.0.0.1:8787` | Implemented |

**Data flow (verified):** `scanner → hashing → parser → graph → storage → search → SDK` (`docs/CONTEXT.md:§1`, `sdk/src/indexing/indexer.ts:98-105`). Dependency direction `cli → sdk → feature → core → shared` enforced by ESLint (`docs/DEPENDENCIES.md`).

**Capability ledger (DOCUMENTED / IMPLEMENTED / CONNECTED / USED / TESTED / MEASURED):**

| Capability | D | I | C | U | T | M |
|---|---|---|---|---|---|---|
| Scan + ignore + manifest | ✓ | ✓ | ✓ (`atlas init/build/update/scan`) | ✓ | ✓ (`scanner/tests/`) | ✗ (no scale numbers) |
| Incremental hash update | ✓ | ✓ (`indexer.ts:91-163`) | ✓ (`atlas update`, MCP `refresh()`) | ✓ | ✓ (`indexer.test.ts:147`, `freshness.test.ts`) | ✗ |
| TS symbol extraction | ✓ | ✓ (partial: no namespaces/bare exprs) | ✓ | ✓ | ✓ (`parser/tests/`, 6 files) | ✗ |
| JS parsing | ✗ (docs imply "TS only") | ✗ (`languages=["typescript"]`, `typescript-parser.ts:50`) | — | — | — (skipped with reason `parser.service.ts:88-94`) | — |
| Graph (calls/inherits/imports) | ✓ | ✓ (11 kinds, `graph.service.ts:16-28`) | ✓ (`get_dependencies`, `inspect_symbol`) | ✓ | ✓ (2 test files — thin) | ✗ |
| Lexical ranked search | ✓ | ✓ | ✓ (`atlas search`, 3 MCP tools) | ✓ | ✓ (`search/tests/`, 2 files — thin) | ✗ (no prod P/R) |
| Semantic/vector search | ✓ (as "seam") | ✗ (interface only, `scoring.ts:25-48`) | ✗ | ✗ | ✗ | ✗ |
| Budgeted assembly + deny + sufficiency | ✓ (ADR-008/016/017) | ✓ | ✓ (`find_relevant_context`, `atlas context`) | ✓ | ✓ (`context-integration.test.ts` etc.) | ✗ (tokens measured only in benchmark) |
| Freshness auto-refresh | ✓ | ✓ (`freshness.ts`, `staleness.ts`) | ✓ (every MCP read) | ✓ | ✓ (`freshness.test.ts`, `mcp-audit.test.ts`) | ✗ (latency unmeasured) |
| File watching | ✗ | ✗ (zero `chokidar|fs.watch` hits in `packages/*/src apps/*/src`) | ✗ | ✗ | ✗ | ✗ |
| Monorepo workspaces | ✗ | ✗ (single-root scan only, `scan.ts:13-22`) | ✗ | ✗ | ✗ | ✗ |
| MCP resources/prompts | ✓ ("not yet", `CURRENT_STATE.md:336`) | ✗ (tools only) | ✗ | ✗ | ✗ | ✗ |

---

## 4. MCP API Inventory

**FACT — 12 tools** (`packages/mcp/src/tools.ts:9-36` `ToolName` + `TOOL_NAMES`; `packages/mcp/src/handlers.ts:66-81` `HANDLERS`; `packages/mcp/src/server.ts:100-118` `registerTools`). Global per-call pipeline: budget-check → `ensureFresh()` → handler → attach `freshness` → `{content:[{text:JSON}], structuredContent}` + byte attribution (`server.ts:121-162`); errors → `isError:true` text-only, deliberately no `structuredContent` so clients don't mask the error as `-32602` (`server.ts:173-190`).

**Stale-doc FACT:** `docs/CURRENT_STATE.md:310-337`, `docs/FEATURE_STATUS.md:44`, and the `tool-bridge.ts` comment ("the 7 MCP tool definitions remain the single source of truth") all say **7 tools**. The code has **12**. The 5 newer tools are `analyze_task`, `create_plan`, `find_relevant_context`, `inspect_symbol`, `verify_answer`. Test drift accompanies it: `packages/mcp/tests/server.test.ts:60-61` asserts "exactly seven tools" while `tools.test.ts:5-6` asserts twelve (subagent-observed; treat file:line as reported, re-verify before editing).

| Tool | Purpose | Inputs | Outputs | Execution path | Deps | Latency | Failure modes | Token cost | Agent usefulness | Tests |
|---|---|---|---|---|---|---|---|---|---|---|
| `analyze_task` | Classify task + extract entities; **no index** | `task` ≤10k chars | `{category, subcategory, confidence, reasoning, entities, nextSteps}` | `handlers.ts:85-110` → `createClassifier()` pure | None | ~0 | Empty task | Tiny | LOW — model can do this; deterministic labels are the only value | `handlers.test.ts` |
| `create_plan` | Deterministic plan + impact set (≤15) + steps (≤8) + unknowns (≤5) | `task` | `{category, steps, impactSet, unknowns, verificationStrategy}` | `handlers.ts:114-144` → `createPlanner(sdk)` → `planner.ts:316-341`: search(limit 20) + 1-hop closure | SDK search+graph | 1 search + closure | No index; weak lexical hits → weak plan | Small-medium | MEDIUM — impact set is useful; steps are template-y (`CATEGORY_TEMPLATES`, `planner.ts:45`) | `handlers.test.ts` |
| `find_relevant_context` | **Flagship:** budgeted tiered excerpts + sufficiency gate | `task`, `maxItems 1..50 d20`, `maxTokens 100..50k d12000`, `contextMode` | `{items[{id,kind,title,path,score,source,reason,tier,tokens}], synthesis?, sufficient, sufficiencyFailures, budget, escalated}`; hard-truncated at 50k chars (`handlers.ts:279-283`) | `handlers.ts:148-286` → `assemble()` (`assemble.ts`) + `evaluateSufficiency` + optional digest→full escalation | Full SDK | Highest (search+assembly+2× on escalate) | Empty task; no index; insufficient verdict | Highest single response | HIGH (when ranking is right) | `context*.test.ts`, `mcp-audit.test.ts` |
| `inspect_symbol` | Declaration + callers/callees + sibling tests | `symbol` | `{symbol{…location, docs, typeText}, callers, callees, testFiles}` | `handlers.ts:290-393`: `searchSymbols(limit 1, minScore 50)` → `getSymbol` → full `getDependencyGraph()` scan (`:312-344`) + `*.test/spec` same-dir scan | SDK symbols+deps | Medium (full graph loop per call) | Not found / unresolvable | Medium | HIGH — best structural answer | `handlers.test.ts`, `context-correctness.test.ts` |
| `verify_answer` | Claim-checks + allow-listed commands from `.codeatlas/verify.json` | `task, citedPaths?, citedSymbols?, planTargets?, outputContract?` | `{strategy, claims{checks,passed,failed}, commands[{exitCode,stdout,stderr}], verdict, summary}` | `handlers.ts:781-857` → `createVerifier` + `loadVerifyConfig` + `verifier.verify` | SDK project+verifier | Potentially high (spawns commands) | Missing config; command timeout | Medium-high | MEDIUM — harness-adjacent; valuable but not retrieval | `verifier/tests/` |
| `search_symbols` | Ranked symbol search + kind filter | `query`, `limit 1..100 d20`, `kind?`, `minScore?` | `{hits[{name,path,targetId,symbolKind,documentation,score}], total}` | `handlers.ts:397-434` → `sdk.symbols.searchSymbols` → `sdk.ts:371-392` (`requireSearchable` → `rebuildSearch` → `SearchService.search`) | SDK search | Per-call `refresh()`+rebuild (see §16) | No index; empty | Small-medium | HIGH as primitive | `handlers/context-correctness/hardening/budget tests` |
| `search_files` | Ranked file search | same minus kind | `{hits[{path,language,score}]}` | `handlers.ts:438-462` → `searchHits({types:["file"]})` | SDK search | Same | Same | Small-medium | HIGH as primitive | Same |
| `get_summary` | Stored summary; opt-in AI `generate` | `target, kind?, generate? dfalse, force?` | `{found, generated, summaries[{overview,keyPoints,metadata}], message?}` | `handlers.ts:466-516` → `listSummaries` filter → optional `generateProject/Folder/File/Module` | SDK summaries+provider | Low (hit) / high (generate) | No provider on generate | Small (hit) / large (generate) | MEDIUM — stale summaries risk (see §12) | `summary/tests/` |
| `get_dependencies` | Graph edges `incoming/outgoing/both`, limit ≤1000 d100 | `node?, relation?, direction? dboth, limit?` | `{node, count, total, nodeFound, dependencies[{from,to,relation,labels}]}` | `handlers.ts:555-585` → `sdk.ts:503-549` | SDK deps | Low-medium | Unknown node → `nodeFound:false` (not error) | Medium (limit 1000!) | HIGH as primitive — but limit too generous | `handlers.test.ts` |
| `explain_module` | Folder record + files/symbols/edges (display caps 200/200, `handlers.ts:600-601`) + deps slice 200 (`sdk.ts:584`) | `path, includeSummary? dtrue, includeDependencies? dtrue` | `{path, module, fileCount, files, symbolCount, symbols, dependencyCount, dependencies, summary}` | `handlers.ts:589-636` → `sdk.modules.explain` (`sdk.ts:563-602`) | SDK modules | Medium | Missing path | Potentially large | MEDIUM — overlaps overview+search | `handlers.test.ts` |
| `project_overview` | Counts/languages + summary; `full` adds modules≤100/files≤50/symbols≤100 (`sdk.ts:703-705`) | `includeSummary? dtrue, detail? dsummary` | `{savedAt, schemaVersion, counts, languages, summary?, modules?, topFiles?, topSymbols?}` | `handlers.ts:640-674` → `sdk.ts:679-708` | SDK project | Low | No index | Small (`summary`) / large (`full`) | MEDIUM — good first call, bad repeated call | `handlers/startup tests` |
| `read_file_range` | Version-aware working-tree read + padding d5 + hash check | `path, startLine, endLine, padding 0..1000 d5, expectedHash?` | `{path, startLine, endLine, content, hash, versionMatch, stale, padded, message?}`; truncated >20k chars (`:707-714`); denied paths → `ToolDomainError` (`deny.ts:12-14`) | `handlers.ts:678-729` → `sdk.files.readRange` (`sdk.ts:419-446`) | SDK files+hash | Low (fs read) | Denied path; `endLine<startLine`; missing file | Bounded (20k) | HIGH as primitive — the grounding tool | `hardening.test.ts:68,147`, `freshness.test.ts:146` |

**Classification (optimize for high-value primitives, not count):**

- **CORE (keep, harden, measure):** `find_relevant_context`, `search_symbols`, `search_files`, `get_dependencies`, `read_file_range`.
- **USEFUL (keep, tighten):** `inspect_symbol` (merge into search+deps long-term; keep now — best caller/callee answer), `project_overview` (keep `summary` default; discourage `full` repeats).
- **WEAK (needs rewrite or merge):** `explain_module` (overlaps overview+search+deps; cap discipline is ad hoc), `get_summary` (stored summaries valuable; AI-generate path is a provider footgun inside a retrieval product).
- **REDUNDANT / KILL candidates:** `analyze_task` (pure classifier the model replicates; keep only as internal step, not a tool), `create_plan` (template steps `MAX_STEPS=8` add tokens without proven task lift; keep planner internally for impact-set/sufficiency, drop the tool), `verify_answer` (valuable function, wrong layer — belongs to future harness, not the intelligence API; keep package, remove tool or gate behind explicit opt-in).
- **EXPERIMENTAL:** `contextMode auto-escalate` double-assembly (correct idea, unmeasured cost), synthesis tier (deterministic conclusion+evidence; promising, unproven).
- **BROKEN:** nothing outright broken; `server.test.ts` 7-tool assertion is stale (governance, not runtime).

**"If the agent had 20 tools, which would it need?"** Five: `find_relevant_context` (task→evidence+sufficiency), `search_symbols`, `search_files`, `get_dependencies`, `read_file_range` — plus `project_overview(summary)` as a session-open call. Everything else is composition the harness should do client-side.

---

## 5. Repository Indexing Audit

**Pipeline FACT:** `indexProject()` (`sdk/src/indexing/indexer.ts:98-105`): `ScannerService.scanProject` → `HashService.buildSnapshot/compareHashes` (persisted `Hashes` table, fast path `indexer.ts:117-124`) → `ParserService.parseFiles` (TS-only filter `indexer.ts:134,183`) → `GraphService.build/exportEdges` → `ContextStore.saveContext` (build) / `updateContext` (update) + digest (`buildDigest`) + optional AI summaries.

| Stage | Finding | Evidence / Location | Impact | Conf / Priority |
|---|---|---|---|---|
| Discovery | Recursive `readdir` walk, case-insensitive default ignores (`node_modules,.git,dist,build,.next,coverage,vendor,.codeatlas`, `scanner.service.ts:166-172,187-189`, `ignore.ts:5-14,24-28`), `.gitignore` honored incl. nested/stacked (`scanner.service.ts:178-181,249-261`, `gitignore.ts:33-37,131-160,215`), glob→RegExp (`* ** ? [] ! /`, caps 500-char/5000-rule, `gitignore.ts:7,10,45-93`), `maxDepth` option, metadata-only | `packages/scanner/src/scanner.service.ts:75-294` | Correct for normal repos; non-file/dir entries dropped (`:210-212`) | HIGH / KEEP |
| Symlinks | No explicit symlink handling; `Dirent.isDirectory()/isFile()` without follow implies symlinked trees likely skipped — **unverified either way** | `scanner.service.ts:166-212` | Monorepo/pnpm symlinks may silently vanish from index | MEDIUM (INFERENCE) / P1: add test + document |
| Languages | Detection broad (~40+ extensions, `scanner/src/language.ts:5-68`); parsing narrow (TS only) | `parser.service.ts:23`, `typescript-parser.ts:50` | Correctness cliff: repo "indexed" but only TS understood | HIGH FACT / P0 (§18) |
| AST/symbols | 13 `SymbolKind`s (`core/src/domain/entities.ts:24-37`); ordered statement walk (`extractors.ts:45-72`); class/interface/enum members with `parentId`; 1-based locations (`position.ts:10-22`); JSDoc docs; `createSymbolId=file#name@line:col` (`symbol-id.ts:17-22`) | `packages/parser/src/typescript/*` | Solid TS model; namespaces + bare exprs dropped (`extractors.ts:68`) | HIGH / IMPROVE |
| Imports/exports | Default/named/namespace/type-only/side-effect imports (`extractors.ts:74-138`); star/namespace/named/default-assignment exports (`:140-228`) | Same | Good; edge-case gaps below | HIGH / KEEP |
| Calls/refs | 8 `ReferenceKind`s (`entities.ts:93-101`); identifier walk skipping decl names (`extract-references.ts:11-37,153-159`); same-file container-then-module resolve (`references.ts:24-73`); >20k-line files skip refs (`typescript-parser.ts:81-86`); only `targetSymbolId!==null` kept (`:84-86`); shared in-memory `ts-morph` project, no tsconfig, `removeSourceFile` after each (`:67-88`) | Same | Memory-bounded by design; cross-file refs depend on graph-stage resolution | HIGH / KEEP |
| Cross-file | `SymbolIndexer.resolveModulePath` + `definitionsForImport` handle `./ ../` → `.ts/.tsx/index` (`symbol-indexer.ts:235-281`); AGENTS.md "renamed/default don't resolve" is **outdated** — code attempts both (`:250-259`) | `symbol-indexer.ts`, `graph/src/module-resolution.ts:15-18` (documented duplicate) | Works for relative TS; bare imports, aliases, JS, non-TS all unresolved | HIGH FACT / P1 (aliases) |
| Generated/binary/config | No generated-file detection; binary handled only by dropping non-file/dir entries; config files indexed as text, not understood | Scanner + indexer | Generated blobs can pollute content index (2000-char excerpts) | MEDIUM INFERENCE / P1 |
| Package boundaries | None detected — no `pnpm-workspace|lerna|nx|rush|workspaces` logic in scanner/indexing/storage (rg zero hits) | `scan.ts:13-22`, `framework.ts:20-90` (single `package.json`) | Monorepo indexed as flat tree (§21) | HIGH FACT / P1 |

**Correctness:** Can the index represent a TS repo? YES for mainstream relative-import TS. NO for path aliases (`@/…`, `tsconfig.paths`), bare package imports, JS, or non-TS languages.
**Completeness:** Missing: aliases, call-graph beyond 1-hop in planner, test↔impl links, package boundaries, generated-file flags, symbol-level content hashes.
**Scalability:** Unknown beyond unit scope — no 1k/10k/100k-file test; only guards are `maxReferenceLines`, unresolved-ref dropping, and concurrency caps (`DEFAULT_CONCURRENCY`). Verdict per size: 100 files fine (FACT, fixtures); 1,000 plausible (INFERENCE); 10,000+ NOT MEASURED (§15).

---

## 6. Code Graph Audit

**FACT — construction:** `GraphService.build(symbols, references)` resets state (`graph.service.ts:64-65`): (1) usage edges from innermost containing symbol (column-aware, excl. import/export) else file node (`:99-111,441-478`), skipping null/unknown targets (`:100-106`); (2) import→definition via O(N) export index + `resolveModulePath` (`:117-136`, `module-resolution.ts:76-97,19-42`); (3) file→file `imports` for any `moduleSpecifier` (`:139-147`); (4) file→symbol `exports` (`:150-154`); (5) parent→child `contains` (`:157-161`); dedup `from>to#kind` (`:271-282`).
**FACT — schema:** nodes = `n:<symbolId>` + `n:file:<path>` (`ids.ts:7-17`); 11 `EDGE_KINDS` (`graph.service.ts:16-28`); `ReferenceKind→EdgeKind` map (`:34-43`). Queries: `neighbors/getDependencies/getDependents/shortestPath(BFS)/detectCircularDependencies(Tarjan)/exportJson/exportEdges` (`:176-261,334-407`).

| Question | Answer |
|---|---|
| Relationships present | `file→file`, `file→symbol` (contains/exports/imports), `symbol→symbol` (calls/constructs/accesses/references/reads/writes/extends/implements/imports) |
| Missing that matters | `test→implementation` (only same-dir `*.test/spec` filename scan in `inspect_symbol`, `handlers.ts:346-361` — not a graph edge), `package→package`, path-alias edges, cross-language edges, weighted/confidence edges |
| Storage | Persisted as dependency rows (`Dependencies(source,target,kind)`, `schema.ts:42-49`); reloaded into snapshot; queried in-memory |
| Freshness | Rebuilt per index run; incremental `update` carries only `USAGE_EDGE_KINDS` (`indexer.ts:79-88`) and recomputes the rest from merged symbols — sound but unproven under renames |
| Traversal use | `shortestPath`/SCC exist but **no MCP tool traverses multi-hop by default**; planner does 1-hop closure (`planner.ts:191-236`); assembly expands 2 hops **only** on dependency-intent regex (`assemble.ts:51-55,564-577`) |
| Ranking use | None — graph stores no scores; ranking deferred to search/assembly (dependency items damped `0.4`, capped 8, `assemble.ts:40-41`) |

**Finding:** The graph stores real metadata, but as an *intelligence* it is under-used: single-hop plans, regex-gated chains, damped/capped dependency items, no traversal tool, no test links.
**Evidence:** Above locations. **Impact:** Multi-hop questions (§11) stop early by construction. **Confidence:** HIGH. **Recommendation:** Promote traversal to a first-class retrieval step (bounded BFS with budget), not a regex side-path; add test↔impl edges. **Priority:** P0 (traversal), P1 (test edges).

---

## 7. Retrieval Audit

**Trace FACT:** `task → assemble()` (`assemble.ts`, 951 lines) → `searchLimit 30` (`:222-224`) over `SearchService.search` (lexical, §3) → explicit resolution (path-like → score 100 critical; identifier-like `len≥4 && [A-Z0-9_]` → `searchSymbols(limit 1, minScore 85)`, `:473-527,74-76`) → tier assignment (`hierarchy.ts:20-31`) → dependency damping/cap (`:649-671,673-686`) → optional category rerank (`TASK_BOOST_FACTOR=1.5`, `context-builder.service.ts:110-153`) → `sortByRank` (tier → score → kind-rank → id, `:697-716`) → `applyBudget` (tail-drop, essentials never dropped, `:367-380`, `budget.ts:31-90`) → `evaluateSufficiency` (4 predicates, `sufficiency.ts:79-143`) → digest/full/escalation (`:92-101,200-221`).

**Scoring FACT (`search/src/scoring.ts:5-10,144-236`, `fuzzy.ts`):** ceilings EXACT 100 / PREFIX 85 / TOKEN 75 / SUBSTRING 60 / fuzzy `40+sim*15`; per-term best-wins; stopwords dropped (`fuzzy.ts:75-147`); prose fields substring-only; per-entity damped maxima (symbol name 1.0/doc 0.6/path 0.5; file basename 1.0/path 0.9/content 0.4); tiebreak prefers definitions over import/export same-names (`search.service.ts:111-140`). Prefilter is a proven superset (substring or length-tolerance, `scoring.ts:79-108`) — ranking-preserving, not rank-changing.

**Why does CodeAtlas believe a file is relevant?** Because its basename/path/content or a symbol name/doc shares an exact/prefix/token/substring/fuzzy lexical match with a query term (best-term-wins), optionally boosted 1.5× by a keyword task category, tiered by hierarchy, and damped if it arrived via a dependency edge. There is **no semantic similarity, no usage-frequency signal, no recency signal, no test-failure signal** in the score.

**Findings:**

1. **Best-term-wins + stopword stripping discards multi-term intent.** "password reset routes" scores on the single best term, not the conjunction. (Evidence: `scoreField :184-216`.) Impact: MEDIUM-HIGH on precision. Conf: HIGH. Rec: conjunction/phrase handling. P0.
2. **Content truncated to 2000 chars/file for scoring** (`search-index.ts:88,113-117`) while DB holds full bodies — matches beyond the excerpt are invisible to ranking but present at read time. Impact: recall cliff on large files. Conf: HIGH. Rec: chunked indexing or excerpt windowing. P0.
3. **Category rerank is keyword-only** (`debug/security/architecture/understand` patterns) — the "task awareness" is a 1.5× multiplier, not understanding (§10). Conf: HIGH. Rec: keep as hint, don't oversell. P1.
4. **Dependency evidence systematically under-weighted** (0.4 damp, cap 8, chain only on regex). A service file reached via two hops can never outrank a substring match. Conf: HIGH. Rec: traversal-aware scoring. P0.
5. **No reranker, no deduplication beyond file/symbol identity** (`toContextItems :84-103`, `dedupeSelections :608-619` keep max-score per file/id; near-duplicate content across files untouched). Conf: HIGH. Rec: near-dup detection. P1.

---

## 8. Minimum Sufficient Context Audit

**Question:** does CodeAtlas deliver the smallest sufficient context? **Answer: partially — it has the machinery (budget + tiers + dedup + truncation + digest modes) but defaults and gaps push toward bloat.**

| Bloat source | Evidence | Severity |
|---|---|---|
| Essentials prepended to every package: instructions (`AGENTS.md/CLAUDE.md/README/manifest`) + digest + overview, never dropped (`assemble.ts:367-372`, `budget.ts:44-45`) | By design; on small tasks this can exceed the task-relevant excerpts | MEDIUM (STRONGLY SUPPORTED) |
| Default `maxItems 20` + `maxTokens 12000` + per-item 2000 (`handlers.ts:169-181`, `budget.ts:5-9`) | 12k tokens ≈ the +38% benchmark delta's right order of magnitude | MEDIUM (PLAUSIBLE, needs per-call attribution) |
| Whole-file-ish excerpts via `read_file_range` padding + 20k truncation; `explain_module` 200/200 display caps; `get_dependencies` limit 1000 | `handlers.ts:600-601,707-714`, `tools.ts:535-547` | MEDIUM |
| Duplicate symbols/definitions across re-exports kept (dedup is identity-only) | `assemble.ts:608-619` | MEDIUM |
| Repeated queries: agent calls search → inspect → deps → read in sequence because first result lacks enough surrounding evidence | Code shape + benchmark `Avg Tools` 19.8 (B) vs 18.6 (A) (+1.2 calls) | PLAUSIBLE (needs tool-call traces) |
| Stale/oversized summaries (`get_summary generate`, `full` overview) | `handlers.ts:466-516,640-674` | LOW-MEDIUM |

**What's good (keep):** per-item truncation with `truncated` flag + recount (`budget.ts:93-105`); tail-drop protecting essentials with honest `budgetExceeded` (`:66`); `BudgetRecord` surfaced to MCP (`tools.ts:287-292`); digest mode for >800 files (`assemble.ts:92-101`); `MAX_OUTPUT_CHARS` 50k guard.

---

## 9. Context Quality Metrics

| Metric | Exists? | Location / Note |
|---|---|---|
| Precision (useful / retrieved) | ✗ in production; ✓ in benchmark lib (`retrieval-metrics.ts:1-60` P@k/R@k/MRR, `DEFAULT_K_VALUES=[1,5,10]`; `evaluate-retrieval.test.ts:35`) | Code exists, not wired to MCP responses or quality gates |
| Recall (found / needed) | ✗ in production; partial via sufficiency proxy (4 predicates) + benchmark file/concept hit scoring (`evaluator.ts:213-287`: score 2 iff fileRatio≥0.5 AND concept≥0.5) | Sufficiency is a heuristic gate, not recall |
| Redundancy | ✗ (no near-dup metric; only identity dedup) | — |
| Freshness | ✓ (`fresh/stale/unknown/unavailable` on every result, `freshness.ts:14-22`; package-level `detectStaleness`, `staleness.ts:29-109`) | Best-in-class honesty; latency cost unmeasured |
| Attribution | ✓ partial (per-item `score/source/reason/tier/tokens`, `BudgetRecord`, `ExclusionRecord`) | Keep + extend with traversal path |
| Coverage (dependency chain) | ✗ (closure counts exist: `criticalCount`, `closureDependencyCount` in sufficiency input, but no chain-coverage metric) | — |

**Conceptual additions needed (no implementation):** log per-call retrieval attribution (query → hits → tiers → drops → sufficiency) as structured data; define P@k/R@k on a held-out task set with file+symbol ground truth; near-dup rate; chain-coverage rate (% of gold dependency hops present); freshness age at serve time; token-per-sufficient-task.

---

## 10. Retrieval Adaptivity

**Finding:** Adaptivity is shallow: a deterministic keyword classifier routes a 1.5× rerank, mode selection, and template steps — it does not change *how* retrieval traverses.
**Evidence:** `classifier.ts:1-80+` (keyword `CATEGORY_PATTERNS`, pure, no IO); `planner.ts:316-341` (same search+1-hop for every category; only `CATEGORY_TEMPLATES` text differs); `context-builder.service.ts:110-153` (boost only); `selectContextMode` keys off **file count**, not task (`assemble.ts:92-101`); only behavioral fork is `isDependencyIntent` regex gating 2-hop expansion (`assemble.ts:51-55`).
**Impact:** "Where is auth implemented?" vs "Fix this failing migration" vs "Refactor this API" all run the same search+assemble with different multipliers — no failure-signal use, no test-aware expansion, no refactor-scope closure. **Confidence:** HIGH. **Recommendation:** Minimum viable adaptivity = intent router with three retrieval strategies (locate: symbol/definition-biased; repair: failure-adjacent expansion incl. tests + recent edits; refactor: scoped closure over impact set with explicit boundary), each budgeted and sufficiency-gated. **Priority:** P1 (after P0 ranking/efficiency).

---

## 11. Multi-Hop Repository Understanding

**Finding:** Multi-hop is structurally possible (graph has edges + BFS) but retrieval stops early by default.
**Evidence:** Planner 1-hop closure capped (`planner.ts:191-236`, `MAX_IMPACT_SET=15`); assembly chain 2 hops / 5 files **only** when task matches dependency-intent regex (`assemble.ts:44-45,51-55,564-577`); dependency items damped 0.4/capped 8; `entrypoint → controller → service → database → schema → test` has no test edge at all (test discovery is filename heuristic in one handler).
**Impact:** Real agent tasks (trace request path, find schema behind service, locate tests) require manual follow-up calls — each adding tokens and failure chances. **Confidence:** HIGH. **Recommendation:** Bounded BFS traversal as a default retrieval stage with per-hop budget + path attribution, plus test↔impl edges. **Priority:** P0.

---

## 12. Freshness / Change Awareness

**FACT — what happens on change:** No file watching (zero hits for watchers in src). Instead: (a) index-time incremental via hash diff (`hashing/src/diff.ts:11-58`, `indexer.ts:91-163`: reparse changed+added TS only, carry `USAGE_EDGE_KINDS`, `deleteContext` ghosts, prune modules, no-op fast path); (b) serve-time mtime+pathset probe per MCP call (`freshness.ts:119-152`: indexed-set vs `scanProjectOverview` + `stat().mtimeMs > baselineMs`) then `sdk.refresh()` on change (`:81-95`), rebasing baseline on `savedAt` (`:87-88`); (c) package-level `detectStaleness` persisted-hashes vs working tree (`sdk/src/context/staleness.ts:29-109`); (d) `read_file_range` hash/padding/versionMatch/stale (`sdk.ts:419-446`, `DEFAULT_READ_RANGE_PADDING=5 :933`, 20k truncation + note).

| Event | Behavior | Verdict |
|---|---|---|
| File/symbol/dependency change | Detected at next tool call; incremental refresh | GOOD (lazy, honest) |
| Delete/rename/new file | Path-set diff catches all three (`freshness.ts:131-150`); rename = delete+add (reparse, no move tracking) | ADEQUATE; rename loses history (acceptable) |
| Branch checkout | mtime storm → full refresh; correct but cost unmeasured | PLAUSIBLE bottleneck |
| Edit during refresh | Baseline re-based on post-refresh `savedAt` (`:84-88`) — next probe catches it | GOOD design |
| Disabled auto-refresh / no index | `unavailable`; stale-on-failed-refresh with message | Honest states |
| Debounce `intervalMs` | Default 0 = probe every call (immediate, maximal cost) | Tune per repo size |
| Race/partial index | Refresh failure → `stale` + message, results served as-is (never silent) | Fail-safe direction correct |

**Finding:** Freshness honesty is a genuine strength; cost is the open question (§16). **Confidence:** HIGH. **Priority:** P0 to measure probe+refresh latency vs repo size; P1 to add move-tracking/branch-aware fast path only if measured pain.

---

## 13. Large Repository Scalability

**Verdict: NOT MEASURED beyond unit scope.** No 1k/10k/100k-file test in `packages|apps` suites (only `references.test.ts:85` "large batch without quadratic blowup" + `freshness.test.ts:103-104` compactness assertion). `vitest.benchmark.config.mts:30-37` reserves a `benchmarks/**/*.test.ts` slot (600s timeout) with **zero** files present; true scale evidence lives only in `old-school/benchmarks/.../extreme/` archives.

| Dimension | Code evidence | Behavior at scale (INFERENCE unless noted) |
|---|---|---|
| Indexing | Full walk + `buildSnapshot` all paths + TS parse with shared `ts-morph` project + unresolved-ref dropping + 20k-line ref skip + `mapWithConcurrency` | FACT guards exist; total time unmeasured |
| Memory | Index holds full file bodies in SQLite + 2000-char excerpts + lowercased `searchText` (~2× excerpt) in-memory per `refresh()` | Grows with corpus; no cap/eviction (INFERENCE) |
| Disk | `context.db` (files+symbols+deps+summaries+hashes) + `usage.db` + manifests; `compact()` VACUUMs when freelist≥0.2 (`context-store.ts:230-241`) | Bounded by corpus; no numbers (NOT MEASURED) |
| Query | `rebuildSearch()` → `loadContext()` full snapshot → `buildIndex()` per search call (`sdk.ts:353-362` + `search.service.ts:48-55`) + per-tool `scanProjectOverview` full walk + per-file `stat` | **LIKELY BOTTLENECK** (code-shaped, unmeasured): O(corpus) work per tool call before scoring even starts |
| Startup | Lazy SDK open (`context.ts`); server starts before index exists | GOOD |
| Incremental update | Changed-only reparse; no-op fast path | GOOD design, unmeasured |
| MCP response | 50k/20k char caps; `full` overview and 1000-edge deps can still be large | Bounded but generous |

**Recommend benchmarking (not implementing):** index time + peak RSS + db bytes vs files (1k/10k/50k, TS-heavy fixture); probe latency vs files; `refresh()` latency vs changed-file count; p50/p95 per-tool latency with cold vs warm search; `find_relevant_context` bytes/tokens vs `maxItems/maxTokens` grid.

---

## 14. MCP Response Design

**Finding:** Responses are machine-readable (JSON + `structuredContent` + schemas) but **model-expensive by default**: large, metadata-rich, and lacking the two things models need most — confidence and why-this-item.
**Evidence:** Every result carries `freshness{state,refreshed,checkedAt,changedFiles?,message?}` (`tools.ts:87-100`) + `nextSteps[]` strings on every tool (useful, but tokens on every call) + full `metadata{generatedAt,provider,model,cacheHit,durationMs,totalTokens}` on summaries (`handlers.ts:733-748`) + labels on every edge (`DependencyShape :57-64`) + 200/200 module lists + up to 1000 deps. Scores exist (`symbolHit/fileHit score`, `tools.ts:103-117`) but are raw lexical ceilings (100/85/75/60) mislabeled "0..1" in the schema description — a real schema lie (`tools.ts:109,116` say 0..1; scorer emits 0..100). No per-item confidence, no traversal path, unstable ordering risk only mitigated by `sortByRank`.
**Impact:** Agents pay tokens for `nextSteps`/labels/metadata on every call and still can't tell strong from weak evidence. **Confidence:** HIGH. **Recommendation:** Normalize scores to 0..1 (or fix schema to 0..100); add `confidence` + `reason`/`path` per item (partially present in assembly items — promote to all tools); cap `get_dependencies` default far below 1000; make `nextSteps` opt-in/compact; add `brief` response mode (ids+paths+scores only). **Priority:** P0 (score schema + caps), P1 (confidence/paths/brief mode).

---

## 15. Error Handling

| Case | Behavior | Grade |
|---|---|---|
| Invalid query / bad args | Zod validation → MCP `-32602` before handler; in-handler `requireString/optional*` + `MAX_STRING_LENGTH=10_000` (`tools.ts:79-84`, `validation.ts:11-132`) | CLEAR |
| Missing files / unknown symbol / unknown node | `ToolDomainError("not found"/"could not be resolved")` (`handlers.ts:297-306`); deps unknown node → `nodeFound:false` (not error, `sdk.ts:514-522`) | CLEAR (deps leniency is right) |
| Parse failures / unsupported language | Single-file `fail(UnsupportedLanguageError)` (`parser.service.ts:63-67`); batch skips with reason (`:88-94`); never fails whole run | RECOVERABLE |
| Corrupt index / missing repo / no index | Lazy SDK + `unavailable` freshness; friendly "no index" states (`assembler InvalidQueryError :186-188`, `freshness.ts:61-63`) | CLEAR |
| Stale index / refresh failure | `stale` + message, results served as-is (`freshness.ts:96-102`) | RECOVERABLE (honest) |
| Denied/secret paths | `isDeniedPath` fail-closed → `ToolDomainError` (`deny.ts:12-14`, `handlers.ts:687-692`); content deny recorded as exclusions (`assemble.ts:919-933`) | CLEAR |
| Malformed input (huge strings, inverted ranges) | Length caps; `endLine<startLine` → `ToolInputError` (`handlers.ts:694-696`) | CLEAR |
| Timeout / memory pressure | **No per-tool timeout** in MCP layer; timeouts live only in agent/benchmark runners; >20k-line ref skip + unresolved-ref dropping are the only memory guards | SILENT RISK — P1: add per-tool budgets/timeouts |
| Partial indexing | Failures counted not fatal (summaries `summariesFailed`, `indexer.ts:65-68`); skipped files with reasons | RECOVERABLE |
| Secret redaction in errors | Installer output bounded + redacted (`installer-process.ts` per CURRENT_STATE); MCP error text is exception messages — verify no path/content leak in edge cases | P1 audit (no evidence of leak found) |

No `shell:true` in product `src` (only SQLite `db.exec`, regex `.exec` — verified via grep). Spawns are argv-array (`agents`, `toolkit/installer-process.ts`). Security posture on execution is good.

---

## 16. Performance Audit

| Path | Analysis | Class |
|---|---|---|
| Freshness probe per tool call | `scanProjectOverview` full walk + `stat` per indexed file (`freshness.ts:119-152`), `intervalMs` default 0 = every call | LIKELY BOTTLENECK (unmeasured; worst on large repos + branch checkouts) |
| Search rebuild per query | `searchHits` → `requireSearchable` → `rebuildSearch()` → `refresh()` → `loadContext()` full snapshot → `buildIndex()` (`sdk.ts:353-362`, `search.service.ts:48-55`), then linear scan + scorer per entity | LIKELY BOTTLENECK (same) |
| `inspect_symbol` graph scan | Full `getDependencyGraph()` loop per call (`handlers.ts:312-344`) | LIKELY BOTTLENECK on dense graphs |
| Assembly double work | `auto-escalate` assembles digest then full; planner search + closure + assembly search overlap | LIKELY waste (unmeasured) |
| Serialization | `JSON.stringify(enriched,null,2)` twice per call (bytes + content, `server.ts:149-154`) + 50k truncation after the fact | Minor; truncate before pretty-print (P2) |
| Parsing | Shared `ts-morph` project, AST freed per file, ref-skip, unresolved-ref drop, concurrency cap | GOOD design; MEASURED only via unit tests |
| DB | `node:sqlite` sync + WAL + `busy_timeout 5000` + prepared-statement cache + conditional VACUUM | GOOD; no slow-query evidence |
| Network | None on retrieval path (provider calls explicit/opt-in only) | GOOD |

**No MEASURED bottlenecks exist** (no perf tests in suite). Everything above is LIKELY/UNKNOWN — which is itself the finding: the two hottest paths (probe, rebuild) have zero latency instrumentation in production responses.

---

## 17. Caching Audit

| What | Key | Invalidation | Limits | Hit/miss | Verdict |
|---|---|---|---|---|---|
| `@atlas/cache` (`cache.service.ts:1-100`: Map + per-entry TTL, lazy expiry on `get`, optional JSON persist, best-effort) | `CacheKey` | TTL only; corrupt file → start empty (`:83-85`) | No size cap; whole-file rewrite per write | No hit/miss counters | Correct but **used only by summaries** (`summary.service.ts:42`); does search/graph/context get faster? NO |
| Summary content-hash cache | content hash | Changed files bypass (`cacheHit` metadata) | Unbounded table | Proven by tests (`summary.service.test.ts:62,122`) | GOOD — the one cache that works |
| Search index | Rebuilt per query; no persistent cache | N/A (no cache) | Only 2000-char excerpt bound | N/A | Correctness-safe, speed-poor |
| SQLite prepared statements | Statement cache (`storage/src/*repository*`, `statement-cache.ts`) | Connection-scoped | Bounded by query variety | Transparent | GOOD |
| MCP freshness baseline | `baselineMs` + `lastFullCheckAt`; `reset()` on SDK reopen (`freshness.ts:53-56`) | Re-based on `savedAt` after refresh | Single baseline | No metrics | Correct logic; needs latency numbers |
| Digest (`kind:"digest"` in Summaries) | Regenerated deterministically on unchanged repos | Index-time | One row | Read via `getDigest()` | GOOD (provider-free) |

**Answer:** No — caching does not make CodeAtlas faster without hurting correctness, because the thing that needs caching (search index + probe) isn't cached, and the thing that is cached (summaries) risks staleness when code changes without content-hash movement (e.g. dependency-only changes leave file hash intact but meaning changed — summary stays `cacheHit`). **Confidence:** HIGH (FACT on usage; INFERENCE on staleness edge). **Priority:** P1 (warm index + invalidation on hash change; summary invalidation on dependency change).

---

## 18. Language / Repository Coverage

**FACT:** Detection ≈40+ extensions (`scanner/src/language.ts`); parsing = TypeScript only (`parser.service.ts:23`, `typescript-parser.ts:50`); `.js/.jsx` detected but skipped at parse (`sdk/src/indexing/indexer.ts:134,183` filter); everything else `SkippedFile(reason)` / `UnsupportedLanguageError`. No `javascript` parser string in `packages/parser/src|sdk/src/indexing`.

| Language | Verdict | What breaks |
|---|---|---|
| TypeScript | SUPPORTED (partial: no namespaces/bare exprs; relative imports only; 20k-line ref skip) | Aliases, bare imports, namespaces |
| JavaScript | UNSUPPORTED (detected, never parsed) | All JS symbols/refs/graph missing — index silently thin |
| Python/Go/Rust/Java/C/C++/PHP/Ruby/etc. | UNSUPPORTED | Files present for content search only; zero symbols/edges |
| TSX (`index` candidates include `.tsx`, `symbol-indexer.ts:263-281`) | PARTIAL | JSX/TSX parse via TS grammar; framework semantics absent |

**Finding:** The product's language story is "TypeScript intelligence, everything else is file search" — but nothing in the MCP surface says so loudly. An agent working in Python/Go gets lexical file hits with graph-shaped confidence. **Confidence:** HIGH. **Recommendation:** Declare per-language capability in `project_overview` (parsed vs content-only file counts); parse JS with the TS grammar as an explicit P0 bridge (ts-morph `allowJs` is currently `false`, `typescript-parser.ts:72`); treat further languages as P2 behind the `LanguageParser` seam. **Priority:** P0 (honesty + JS bridge).

---

## 19. Monorepo Audit

**Finding:** CodeAtlas does not understand monorepos; it indexes them as flat trees.
**Evidence:** Single `repositoryPath` → single scan (`scan.ts:13-22`), single manifest (`.codeatlas/manifest.json`), single `context.db` (`indexer.ts:100-101`); zero workspace-manager logic (`pnpm-workspace|lerna|nx|rush` zero hits in scanner/indexing/storage); `detectFramework` reads a single root `package.json` (`framework.ts:20-90`); `Modules` are folders (`PersistedModule`); VSCode "workspace-capable" = first-folder root (`docs/VSCODE.md:57-59`); benchmark repos are separate clones, never a monorepo fixture.
**Impact:** Cross-package deps resolve only if relative; duplicate package names collide in search; `project_overview` mixes all workspaces; retrieval can't scope package-local vs global. **Confidence:** HIGH FACT. **Recommendation:** P1: workspace detection (read `pnpm-workspace.yaml`/`package.json#workspaces`), package-boundary modules, scoped retrieval flag; P0: at minimum, document the flat-tree limitation in `project_overview`. Do NOT build a marketplace or cross-repo graph (KILL).

---

## 20. Testing Audit

**FACT:** 135 test files (`find packages apps -name "*.test.ts" | wc -l` = 135; subagent census 137 incl. fixtures — same order). Distribution is heavily skewed: `sdk` 23, `benchmark` 15, `toolkit` 15, `mcp` 11, `apps/extension` 7; `graph` 2, `search` 2, `context` 1, `storage` 3, `apps/cli` 1.

| Dimension | Verdict | Evidence |
|---|---|---|
| Correctness (right answer) | PARTIAL | `context-correctness.test.ts:54,106,122` (task-oriented: AuthService→UserRepository), `evaluator.test.ts`, `evaluator-v2.test.ts`, `retrieval-metrics.test.ts` — good seeds, small coverage |
| Regression | GOOD for units, WEAK for intelligence | Unit suites solid; only 2 graph + 2 search test files guard the core ranking |
| Scale | MISSING | No 1k+ file test (§13) |
| Freshness | GOOD | `sdk/tests/freshness.test.ts:40-147`, `indexer.test.ts:147`, `mcp-audit.test.ts:157-285` (auto-refresh, added-file, rename, disabled-refresh) |
| MCP (real calls) | GOOD-ish | `server/startup/handlers/hardening/budget/tool-bridge/tools/context` tests; stdio handshake covered (`startup.test.ts:77`); no load/chaos tests |
| Agent usefulness | WEAK | `e2e-agents.test.ts:169` (Ollama tool-loop), skills tests, `context-integration.test.ts:162-254` — but nothing asserts "agent solved task X with fewer tokens" outside the n=1 pilot |

**Do not confuse unit-green with intelligence-working.** The suite proves determinism and plumbing, not retrieval quality at scale. Thinnest ice: `search` (2 files), `graph` (2), `context` (1), `storage` (3), `apps/cli` (1 monolith `cli.test.ts` incl. `--ai` paths at `:393,850,1003,1450`).

---

## 21. Benchmark Audit

**What it proves (FACT, `benchmarks/2026-09-fresh/report.md`):** 64/64 cells, 16 tasks × 4 configs, model `opencode/mimo-v2.5-free`, 840s timeout, 0/1/2 scoring (2 iff fileRatio≥0.5 AND concept≥0.5, `evaluator.ts:213-287`; timeout→0). A 1.56 / B 1.44 (−0.13) / C 1.13 (−0.31, TO 19%) / D 1.56 (±0.00). Tokens A 496,795 / B 688,405 (+38%) / C 410,452 (−17%) / D 606,270 (+22%). Tools B 19.8 vs A 18.6 (+1.2). Arch tasks: A fails both, augmented solve medium. Backend-medium: only D solves. Frontend-hard: all ≤1. External-knowledge: all solve (non-differentiating).

**What it does NOT prove:** anything requiring n>1 (report itself: "interpret per-cell scores with caution", "statistical significance requires ≥3 runs", `report.md:65,186-204`). No significance test is possible n=1. Single model, skewed repos (CodeAtlas + small-app heavy), Tavily/GitHub creds + network for C/D, automated file/concept proxy + manual rubric mix.

**Causal separation for the +38% / −0.13 (§11 of mission):**

- **PROVEN:** B used +191,610 avg tokens (+38.6%) and scored −0.13 with +1.2 tool calls and +34s duration. (Arithmetic on `report.md:73-78`.)
- **STRONGLY SUPPORTED:** Essentials + defaults inflate packages (instructions+digest+overview never dropped; 20 items/12k tokens defaults — code FACT, contribution size PLAUSIBLE); lexical ranking forces follow-up reads (+1.2 tools measured).
- **PLAUSIBLE:** Oversized serializations (200/200 module lists, ≤1000 deps, `full` overviews), repeated retrieval loops, aggressive injection (every call assembles fresh).
- **UNKNOWN:** Exact per-tool byte attribution (budget counters exist `budget.ts:50-131` but pilot didn't report them per §"Tool-call attribution" in `docs/benchmark.md`), inefficient serialization share, query-frequency distribution.

**Next MCP benchmark (design only, not implemented):** freeze model + repo set; n≥3/cell with `paired-bootstrap.ts`/`significance.ts`; ground-truth file+symbol+hop sets per task; report P@1/5/10, MRR, R@k (`retrieval-metrics.ts`), chain-coverage, near-dup rate, tokens-per-sufficient-task, p50/p95 tool latency, freshness age, MCP bytes per tool (via `ToolCallBudget.snapshot()`), sufficiency precision (sufficient⇒solved rate); include large-repo (10k+ files), rename-branch freshness, and multi-hop trace tasks as first-class suites. Gate releases on deltas, not absolutes.

---

## 22. Redundancy Audit

| Capability | Duplicates | Why should CodeAtlas own it? | Verdict |
|---|---|---|---|
| Exact string search (`search_files` content leg) | grep/ripgrep | Only as a fallback inside ranked retrieval; not as a standalone selling point | KEEP NARROW (ranking input, not product) |
| Filesystem listing (`project_overview full`, `explain_module` file lists) | `ls`/tree/LSP workspace symbols | Only the counts+languages+digest summary; full lists are bloat | TRIM (`summary` default; `full` gated) |
| Go-to-definition (single symbol) | LSP | Only callers/callees + test links structurally (LSP can't do repo-wide callers without index) | KEEP `inspect_symbol` core, drop single-def queries to LSP |
| Generic semantic search | Embedding vendors | CodeAtlas has NO embeddings — currently duplicates nothing; don't add generic vectors, add code-specific ranking | KEEP LEXICAL + code signals; KILL generic-vector envy |
| Git status/log | git CLI | Only staleness/change-awareness for retrieval correctness | KEEP minimal (hashes/mtimes), KILL history features |
| Web-search/fetch/github tools (benchmark config C) | External MCP servers | No reason — caused −0.31 + 19% TO | KILL from default configs; keep as opt-in external |
| Planning templates (`create_plan` steps) | Agent model | No reason (template text, unmeasured lift) | KILL tool, keep internal impact-set |
| Task classification surface (`analyze_task`) | Agent model | Only internal routing value | KILL tool, keep internal classifier |
| Command running (`verify_answer` commands) | Harness/CI | Belongs to future harness | KILL tool (keep package for harness) |
| Toolkit install/configure, orchestrator, sessions, usage | Harness/setup concerns | Out of MCP-readiness scope; they tax the audit, not the agent | KEEP packages, EXCLUDE from MCP surface |

---

## 23. Fake Value / Weak Features

1. **`analyze_task` as a tool** — exists, deterministic, but the agent's model classifies better with context; output adds a round-trip for labels. WEAK → KILL tool.
2. **`create_plan` template steps** (`MAX_STEPS=8`, `CATEGORY_TEMPLATES`) — sounds like planning, measures nothing; impact set is the only valuable part. WEAK → keep impact-set internally, KILL tool.
3. **`project_overview(full)` + `explain_module` 200/200 lists** — impressive dumps, low decision value per token; agents re-query anyway. WEAK → TRIM defaults.
4. **`get_summary(generate:true)`** — AI summary inside a retrieval call couples provider config/failure/latency into the intelligence layer; without a provider it fails (correctly but uselessly). WEAK → keep stored-read; gate generate behind explicit flag + docs (already default-false — hold the line).
5. **Skills/tools configs as "intelligence"** — pilot shows tools-without-skills hurt (−0.31) and skills merely recover (+0.44 to tie). Bundling them as CodeAtlas value claims is fake value. → Measure separately, never gate MCP readiness on them.
6. **Architecture diagrams of unbuilt systems** (slash router, `/agents` commands, marketplace-adjacent ideas) — no code, no value. → KILL from roadmap.
7. **`verify_answer` inside MCP** — real function, wrong layer; its presence invites harness logic into the retrieval API. → Move to harness track.

---

## 24. Core Moat

**One primary answer:** **attributable, budgeted, fresh structural retrieval over a real code graph — the layer that answers "what code matters for this task, why, and is it current" in the fewest tokens.**

Ranked candidates:

| Candidate | Verdict |
|---|---|
| Repository graph | STRONG input, not the moat alone (unweighted, single-hop-used) |
| Context retrieval + ranking | CORE but currently lexical-only — must improve to earn the moat |
| Dependency understanding | DIFFERENTIATOR if multi-hop + test links ship |
| Symbol intelligence | TABLE STAKES for TS; absent elsewhere |
| Task-aware retrieval | PROMISING (classifier+sufficiency+modes) but keyword-shallow today |
| Change awareness | UNDERVALUED moat piece — honesty about freshness is rare; keep |
| Context compression (budget/deny/digest) | UNDERVALUED moat piece — token discipline is the scarce good |
| MCP interface | DELIVERY, not moat |
| Repository-scale reasoning | ASPIRATION, not reality (unmeasured) |

**Fame statement:** *CodeAtlas should become famous for minimum-sufficient context with receipts — every item scored, sourced, tiered, freshness-stamped, and sufficiency-gated.*

---

## 25. Future Harness Compatibility

| Question | Answer + Evidence |
|---|---|
| Reliably consumable? | YES — stdio JSON-RPC via official SDK, zod-validated inputs, versioned server name (`server.ts:39-47`), lazy open |
| Composable APIs? | YES — SDK sub-APIs (`files/symbols/dependencies/modules/summaries/search/project/status`) mirror tools 1:1; `ContextToolSource` seam (`tool-bridge.ts:35-65`) already bridges MCP↔tool-loop |
| Structured results? | MOSTLY — `structuredContent` + schemas; gap: error shape intentionally unstructured (right call, document it) |
| Externally manageable state? | YES — file-backed DBs (`.codeatlas/context.db`, `usage.db`), `refresh()`, `close()` on server stop (`server.ts:61-64`) |
| Deterministic enough? | YES — same index ⇒ same scores/order (lexical, no sampling); provider paths explicitly opt-in |
| Repeatedly callable? | YES but COSTLY — no idempotency keys, no result cache; every call re-probes + rebuilds |
| Attributable? | YES (score/source/reason/tier/tokens/budget/exclusions/sufficiency) — best harness-ready trait |
| Incrementally expandable? | PARTIAL — `slice-store.ts`/`slice.ts` exist in SDK; no MCP `expand`/`refine` primitive; `auto-escalate` is server-side only |
| Budget-controllable? | PARTIAL — per-package budgets YES (`maxItems/maxTokens`); per-session tool-call caps env-gated + default-unlimited (`budget.ts:14-20`) — harness cannot set them per-task via protocol |
| Freshness-detectable? | YES — `freshness` on every result + `detectStaleness` on packages |
| Reasoning substrate, not just search? | PARTIAL — sufficiency + synthesis + digest point that way; traversal + confidence still missing |

**Architectural changes to ease future integration (no implementation):** per-task budget/allow-list params on every tool (not env-only); cursor-based `expand` primitive (refine package with exclusions/additions); normalized 0..1 scores + confidence + traversal paths in all responses; result envelopes with `requestId`/timings/attribution counters; read-only-by-default with explicit mutation gates (installer already models approval — copy the pattern).

---

## 26. Architectural Debt

| Debt | Evidence | Rank |
|---|---|---|
| Stale docs + stale tests (7 vs 12 tools; `tool-bridge` "7 tools" comment; `server.test.ts` 7-tool assertion vs `tools.test.ts` 12) | `CURRENT_STATE.md:310-337`, `FEATURE_STATUS.md:44`, `tool-bridge.ts`, `mcp/tests/server.test.ts:60-61` vs `tools.test.ts:5-6` | P0 (governance: docs/tests must not lie about the API) |
| Score scale lie (schema "0..1", scorer 0..100) | `tools.ts:109,116` vs `scoring.ts:5-10` | P0 |
| Duplicated module resolution (parser ↔ graph, documented "keep in sync") | `graph/src/module-resolution.ts:15-18`, `parser/src/indexer/symbol-indexer.ts:235-281` | P1 (extract to shared or contract-test both; deliberate today, brittle tomorrow) |
| Per-call full probe + full rebuild (hot path does O(corpus) before scoring) | `freshness.ts:119-152`, `sdk.ts:353-362` | P0 to measure; P1 to fix (warm index, incremental probe) |
| Over-generous limits (`get_dependencies` 1000, module 200/200, padding 1000, output 50k) | `tools.ts:535-547`, `handlers.ts:600-601`, `server.ts` caps | P1 (tighten defaults, keep maxima) |
| `search`/`graph`/`context` test thinness (2/2/1 files) vs `sdk`/`toolkit` breadth | Test census §20 | P1 |
| No-threat-model gap: error text may leak paths; summary cache invalidation on dependency-only change | `server.ts:173-190`, `summary.service.ts` | P2 (audit, not alarm — no leak observed) |
| Benchmark-specific coupling risk (budget env vars, attribution counters threaded for pilot) | `budget.ts:1-21`, `docs/benchmark.md` attribution section | P2 (keep env-gated; don't let harness flags leak into product defaults) |
| `estimateTokens` heuristic (`ceil(len/4)`) used for budgets AND reported as tokens | `shared/src/token-estimation.ts:10-12` (honestly documented) | P2 (label everywhere; never present as actual — usage tri-state already models this correctly) |

No dead-code crisis found (TODO/FIXME/HACK/WORKAROUND grep over `packages/*/src apps/*/src` returns effectively zero live markers; naive hits are `*_TEMPLATE` constants). No `shell:true` in product src. The codebase is disciplined; debt is concentrated in scale-readiness and doc/test drift, not rot.

---

## 27. KEEP / IMPROVE / REWRITE / REMOVE / ADD

| Subsystem | Verdict | Evidence |
|---|---|---|
| Scanner + hashing + manifest + incremental indexer | KEEP | Correct, tested, honest merge/no-op semantics (`indexer.ts:91-163`) |
| TS symbol extraction + `SymbolIndexer` | IMPROVE | Good core; add aliases/bare-import handling, JS bridge, namespace/BareExpr decision (document or implement) |
| Graph build + storage | KEEP core, IMPROVE use | Build/storage sound; traversal/test-edges/weights missing |
| `ContextStore` + SQLite + migrations + repos | KEEP | 8 tables, WAL, transactions, conditional VACUUM; no ad-hoc SQL outside repos (per seam) |
| Lexical search + scorer | IMPROVE (not rewrite) | Deterministic + prefilter-correct; needs conjunction semantics, chunked content, code-signal boosts, reranker seam exercised |
| `ContextBuilderService` + assembly/budget/deny/sufficiency/digest/modes | IMPROVE | Best asset; needs efficiency + traversal + measured gates, not redesign |
| Freshness probe + auto-refresh + staleness | KEEP + MEASURE | Honest states; cost unknown |
| `@atlas/cache` | KEEP, EXTEND use | Only summaries use it; add warm search index with hash invalidation |
| MCP `search_symbols/search_files/get_dependencies/read_file_range/find_relevant_context` | KEEP + HARDEN | Primitives agents need; fix score scale, tighten caps, add timings |
| `inspect_symbol`, `project_overview(summary)` | KEEP (tighten) | High value; cap discipline |
| `explain_module`, `get_summary(generate)` | IMPROVE or REMOVE surface | Merge into primitives or gate |
| `analyze_task`, `create_plan`, `verify_answer` tools | REMOVE from MCP (keep internals/packages) | Harness/model-duplicate or wrong layer |
| JS parsing | ADD (bridge via TS grammar, explicit) | Closes the silent-thin-index trap |
| Workspace/monorepo model | ADD (minimal: detect + scope) | Flat-tree is the biggest structural lie |
| Semantic/rerank layer | ADD (behind `RelevanceScorer`, measured) | Lexical ceiling is proven by benchmark |
| Traversal primitive + test↔impl edges | ADD | Multi-hop is the missing intelligence |
| Retrieval quality gates + per-call attribution logging | ADD | Can't improve what isn't measured |
| File watching | ADD only if probe latency measured painful | Don't speculate; measure first |
| Harness (router, slash commands, orchestration surface, marketplace, UI) | REMOVE from V2 scope (KILL) | Explicit non-goal of this audit |

---

## 28. Proposed CodeAtlas MCP V2

```text
Repository
    ↓  (scan once; hash-diff; TS(+JS-bridge) parse; alias-aware resolve)
Index  — single-root today, workspace-scoped tomorrow; generated-file flags
    ↓
Code Graph — weighted edges, test↔impl links, package boundaries
    ↓
Repository Understanding — digest + module map + capability-per-language manifest
    ↓
Task-Aware Retrieval — intent router (locate / repair / refactor / dependency)
    │   default bounded BFS traversal with per-hop budget + path attribution
    ↓
Ranking — lexical + code signals (definition boost, usage degree, recency,
    │   test proximity) → measured reranker behind RelevanceScorer seam
    ↓
Minimum Sufficient Context — tier + budget + near-dup removal + brief/full modes,
    sufficiency gate with teeth (insufficient ⇒ explicit refine path)
    ↓
Structured MCP Response — 5 primitives; normalized scores + confidence + paths +
    freshness + timings; compact by default, expandable by cursor
```

Non-goals (locked): harness, orchestration, slash router, marketplace, UI, generic web tools, multi-language parsers beyond the JS bridge.

---

## 29. Core MCP Primitives

Few powerful tools > many mediocre tools. V2 exposes **5 + 1**:

1. **`context_for(task, budget, mode, scope?)`** — evolved `find_relevant_context`: task-aware retrieval with traversal, tiers, budget record, sufficiency verdict, escalation. The default entry point.
2. **`search_symbols(query, kind?, limit?)`** — definition-biased symbol search with normalized scores + confidence.
3. **`search_files(query, limit?)`** — file search with parsed-vs-content-only annotation per hit.
4. **`dependencies_of(node, direction?, depth?=1..3, limit?)`** — bounded traversal (replaces single-hop `get_dependencies` + hidden regex chains + planner closure) returning edges **with paths**.
5. **`read_range(path, start, end, padding?, expectedHash?)`** — version-aware grounding read (unchanged).
6. **`overview(detail=summary, scope?)`** — session-open call: counts, languages **with parsed-vs-skipped breakdown**, digest pointer, freshness. (`project_overview(summary)` renamed; `full` and `explain_module` fold into 1–5.)

`inspect_symbol` folds into 2+4; `get_summary` becomes a stored-read inside 1/6 (AI-generate moves to CLI explicit); `analyze_task`/`create_plan`/`verify_answer` leave the protocol (internals/packages remain).

---

## 30. MCP Quality Gates

Proposed targets are **explicitly labeled** `[ARBITRARY — adopt only after baseline measurement]` unless derived from current code/benchmark.

| Gate | Metric | Target |
|---|---|---|
| Retrieval correctness | P@5 / MRR on held-out task set (file+symbol truth) | +15% vs V1 baseline [ARBITRARY]; no regression on arch tasks (B solved medium 2.00 — hold it) |
| Context precision | Useful / retrieved (human + sufficiency-proxy) | ≥0.70 [ARBITRARY] |
| Context recall | Needed / found incl. hops | ≥0.80 on trace tasks [ARBITRARY] |
| Redundancy | Near-dup bytes / total bytes | ≤10% [ARBITRARY] |
| Latency | p50/p95 per primitive, warm index | Probe ≤5% of p50 tool latency [ARBITRARY]; publish, then gate |
| Token efficiency | Tokens per sufficient task vs V1; `tokens` = measured model tokens, budgets labeled estimated | −25% vs V1 B-config [ARBITRARY]; sufficiency⇒solved rate non-decreasing |
| Freshness | Age at serve; stale-served rate; refresh latency vs changed files | 0 silent-stale serves (already true — hold); publish refresh curve |
| Large-repo | Index time / peak RSS / probe / p95 query at 1k/10k/50k files | No gate until measured — measure first (P0) |
| Multi-hop | Chain-coverage on trace suite | ≥0.80 [ARBITRARY] |
| Reliability | Error clarity (clear/recoverable rate), timeout rate | 0% tool timeouts on retrieval primitives; C-like 19% never again on default surface |
| Agent task success | Held-out task score, n≥3, paired test | Non-inferior to baseline at equal-or-lower tokens (the B-config bar: close −0.13 AND −tokens) |

---

## 31. P0 / P1 / P2 Roadmap

### P0 — MUST FIX BEFORE CALLING MCP STRONG

1. **Truth in advertising:** fix 7-vs-12 doc/test drift; fix score-scale schema lie (0..1 vs 0..100); declare per-language parsed-vs-content-only counts in `overview`. (Evidence: §§4, 14, 18, 26.)
2. **Measure the hot path:** instrument probe latency, rebuild latency, per-tool timings + byte attribution in responses/logs; run the scale grid (1k/10k/50k). No optimization without numbers. (§§13, 15, 16.)
3. **Retrieval quality core:** conjunction/phrase semantics; chunked content indexing (kill the 2000-char recall cliff); bounded traversal by default with path attribution; test↔impl edges. (§§6, 7, 11.)
4. **Token discipline:** tighten `get_dependencies` (1000→small default), module list caps, `full` overview gating; `brief` response mode; `nextSteps` compaction. Prove −tokens at non-regressed sufficiency. (§§8, 14 + benchmark §21.)
5. **JS bridge + alias handling:** parse JS with TS grammar explicitly (`allowJs` decision documented); resolve `tsconfig.paths` aliases or explicitly mark unresolved. (§§5, 18.)
6. **Collapse the tool surface** to §29 primitives (remove 3 tools from protocol, merge 2). (§§4, 22.)

### P1 — HIGH-LEVERAGE IMPROVEMENTS

- Reranker behind `RelevanceScorer` + code-signal boosts (definitions, degree, recency, test proximity), gated by §30 metrics.
- Warm search index + incremental probe (milli-scale for unchanged repos); summary invalidation on dependency change.
- Workspace detection + scoped retrieval; generated-file flags; symlink test + docs.
- Per-task budget/allow-list params (not env-only); `expand` cursor primitive; confidence + timings in all responses.
- Per-tool timeouts; error-text path-leak audit; near-dup removal.
- Intent router with locate/repair/refactor/dependency strategies (§10).

### P2 — FUTURE

- Additional language parsers behind `LanguageParser` (one at a time, measured).
- File watching (only if P0 measurement shows probe pain); branch-aware fast paths; move-tracking.
- Embeddings only as a measured rerank input, never as generic replacement.
- Community benchmark repos + leaderboard hardening (server track, separate from MCP readiness).

### KILL (see §32)

Harness router/slash commands, marketplace, UI-heavy features, generic web-tool defaults, speculative infra, MCP resources/prompts before primitives are strong.

---

## 32. Kill List

- **KILL IT:** `analyze_task`, `create_plan`, `verify_answer` as MCP tools (keep code internally / in harness track).
- **KILL IT:** `get_dependencies` limit-1000 default; `explain_module` 200/200 dumps; `project_overview(full)` as a routine call.
- **KILL IT:** Web-search/fetch/github in default agent configs (19% timeouts, −0.31).
- **KILL IT:** Any new MCP endpoint that doesn't reduce tokens-per-sufficient-task or raise chain-coverage — including resources/prompts, marketplace, setup wizards, streaming, multi-model routing inside the retrieval layer.
- **KILL IT:** Premature harness work during V2 (slash router, `/agents` commands, plan-executing router surface, orchestration UI) — the future harness needs a strong substrate, not company.
- **KILL IT:** Generic vector-search replacement narratives; code-specific ranking or nothing.
- **KILL IT:** Additional language parsers before JS-bridge + aliases + measured gates (one bridge, then stop until metrics justify the next).
- **KILL IT:** File watching, cross-repo graphs, and monorepo build-system modeling until P0 measurement demands them.

---

## 33. Final Readiness Verdict

```text
CODEATLAS MCP STATUS

[NOT READY] / [EARLY] / [FUNCTIONAL] / [STRONG] / [WORLD-CLASS READY]

Verdict: [FUNCTIONAL] — approaching [STRONG] on foundation, not on retrieval.

CONFIDENCE: 7/10
```

### 1. Is CodeAtlas currently a strong MCP?

**PARTIAL** (FUNCTIONAL, not STRONG). Strong foundation, weak retrieval packaging: lexical-only ranking, single-hop-by-default traversal, unmeasured scale, +38% tokens for −0.13 score.

### 2. What is its strongest capability?

Deterministic, budgeted, deny-filtered, freshness-stamped structural assembly over a real TS symbol graph through a single SDK seam — with honest sufficiency verdicts. (Evidence: `assemble.ts`, `budget.ts`, `deny.ts`, `sufficiency.ts`, `freshness.ts`, `sdk.ts`.)

### 3. What is its biggest weakness?

Lexical-only retrieval with best-term-wins scoring, a 2000-char content window, and traversal gated behind a regex — forcing agents into extra follow-up reads that cost the +38% tokens. (Evidence: `scoring.ts:184-236`, `search-index.ts:88`, `assemble.ts:51-55`.)

### 4. What is currently wasting the most tokens?

**PROVEN:** the assembled package itself (+191k avg tokens vs baseline). **STRONGLY SUPPORTED:** never-dropped essentials + 20-item/12k-token defaults. **PLAUSIBLE:** follow-up read chains (+1.2 tools), oversized list responses, double assembly on escalate. Per-tool attribution needed to split these exactly (§21).

### 5. What is currently hurting retrieval quality?

Best-term-wins lexical scoring, content truncation recall cliff, 1.5× keyword "adaptivity", damped/capped/ungated dependency evidence, no reranker, no test links, TS-only parsing presented without per-language honesty. (§§7, 10, 11, 18.)

### 6. What is the biggest scalability risk?

Per-tool-call O(corpus) pre-work: full-tree probe + full-snapshot search rebuild before scoring even starts — unmeasured, unbounded, and on the hottest path. (§§13, 16.)

### 7. What should be rewritten?

Nothing wholesale. **Narrow rewrites:** retrieval scoring core (conjunction + chunks + traversal-aware), tool surface (5+1 primitives), response envelopes (normalized scores + confidence + paths + timings). Everything else improves in place.

### 8. What should be killed?

Three MCP tools (`analyze_task`, `create_plan`, `verify_answer`), web-tool defaults, dump-style defaults (1000-edge deps, 200/200 modules, routine `full` overviews), all harness-scope work during V2, and any unmeasured feature. (§32.)

### 9. What should be built first?

P0 in order: (1) doc/test/score-scale truth, (2) hot-path instrumentation + scale grid, (3) conjunction + chunked index + default traversal + test edges, (4) cap discipline + brief mode, (5) JS bridge + aliases, (6) tool-surface collapse. Each gated by §30 metrics.

### 10. Can a future harness safely build on this MCP?

**WITH CHANGES.** Consumability, determinism, attribution, and freshness are harness-ready; per-task budget control, `expand` cursors, normalized confidence, timings, and proven scale are not. The substrate is the right shape — it needs the P0 list before a harness bets on it.

### 11. What is the single most important improvement?

**Make first-pass retrieval sufficient: bounded multi-hop traversal with budgeted, path-attributed evidence and a sufficiency gate the agent can trust — so the agent stops paying for follow-up reads.** That one change attacks score (−0.13), tokens (+38%), and tool-call inflation (+1.2) simultaneously, and every other improvement (reranker, caps, JS bridge, warm index) compounds it.

---

## Adversarial Test — "What would make a future harness stop trusting CodeAtlas?"

| Trust-killer | Present today? | Mitigation (V2) |
|---|---|---|
| Wrong retrieval (lexical miss on first pass) | YES — structural | Conjunction + chunks + traversal + reranker + P@k gates |
| Stale context served as fresh | NO — honest states; risk is latency, not lies | Keep states; publish refresh curve |
| Missing dependencies (multi-hop cut) | YES — 1-hop/regex-gated | Default bounded BFS + chain-coverage gate |
| Huge responses | PARTIAL — caps exist but generous | Tighten defaults + brief mode |
| Slow queries at scale | UNKNOWN — unmeasured hot path | Instrument + scale grid + warm index |
| Unstable API (docs/tests lie) | YES — 7-vs-12 drift, score-scale lie | P0 truth pass + contract tests |
| Incorrect graph (aliases/JS/bare imports) | YES — scoped gaps | JS bridge + aliases or explicit unresolved marking |
| Poor ranking | YES — lexical ceiling | Code signals + measured rerank |
| Duplicate context | PARTIAL — identity-only dedup | Near-dup removal + redundancy gate |
| Silent failures | NO — fail-loud + honest insufficiency | Hold; add per-tool timeouts |
| Poor large-repo behavior | UNKNOWN — not measured | Measure before claiming |

The harness will forgive missing features. It will not forgive wrong, stale, huge, slow, or silently-failed context. V2 fixes trust-killers first, features never.

---

*Audit produced read-only. No source, API, tool, prompt, benchmark, dependency, or file was modified. Re-verify cited `file:line` numbers against HEAD before acting — line drift is expected; module paths are stable.*
