# CodeAtlas — Hardening, Multi-Language Support & Next-Gen Features

> **Status (updated 2026-10-05): PARTIALLY IMPLEMENTED.** Landed so far:
> **P0** (all of Part A — A1 fail-closed HTTP, A2 resolver sync, A3 MCP
> truncation, A4 SDK repo guard, A5 git timeout, A6 skipped-ref reporting, A7
> doc-truth), **P1** (tree-sitter foundation + Python + Go + kind-union
> extension + resolver injection + B.5 framework detection), **P2** (Java, C#,
> Rust + resolvers), **P4** (`atlas watch` via `createWatcher`), **P5**
> (`computePageRank` + `sdk.project.repoMap()` + `codeatlas://repo-map`
> resource), and **most of P6** (MCP resources, `atlas usage budget/limit set`,
> `atlas doctor` per-language grammar check, corrected `inspect`/`evaluate`
> claims). **P3 (embeddings + hybrid search) is NOT implemented** — it needs a
> new package, a storage migration, and a local embedding model/provider, and
> is deferred. Everything below stays the design record; where the code landed,
> the implementation is the source of truth (per `AGENTS.md` §4.12).

Repo: `/home/abdullah/Projects/CodeAtlas` · pnpm+TS monorepo · 19 packages + 3 apps · v0.5.2 ·
Node `>=22.5.0` · `node:sqlite`.

---

## 0. Scope & research basis

**Codebase inspected (verified against source + tests, not docs):** the parser plugin seam
(`LanguageParser`, `ParserRegistry`, `ParserService`), the scanner's language map +
`supportedLanguages` filter, the indexer pipeline (`packages/sdk/src/indexing/indexer.ts`), the
graph module resolver, the SDK context ranking, the search scorer seam, the CLI/MCP/extension
surface, and the storage/usage DBs.

**3 rounds of web research:**

- **Round 1 — parsing engines.** Tree-sitter (fast, error-tolerant, 50+ grammars, no type checker)
  vs LSP (precise semantics, heavy per-language servers, needs valid code) vs SCIP/LSIF (precomputed
  cross-repo index, per-language indexer binaries). Consensus: tree-sitter for broad, fast,
  syntax-level symbol graphs — the same model the current parser already uses (name-based, no full
  type checker). `treesitter-symbols` proves one API across 17 languages.
- **Round 2 — retrieval & ranking.** Aider's repo map uses tree-sitter + a **PageRank** pass over the
  symbol/dependency graph to pick the most important code under a token budget. Semantic search =
  **hybrid BM25 + dense vectors**, with **AST-aware chunking** (chunk per symbol, not per line) as the
  key token-efficiency insight; local embedding models keep it private. MCP best practices: small,
  goal-oriented tool surfaces; prefer resources for read-only projections.
- **Round 3 — graph-RAG & the landscape.** A 2026 benchmark finds **deterministic AST-derived knowledge
  graphs beat LLM-extracted graphs** for code retrieval. Competitor split: structural (Sourcegraph/SCIP,
  CodeGraph) vs semantic (Claude Context, CocoIndex). CodeAtlas already sits in the structural+local
  camp — the gap is breadth (languages) and a semantic rerank layer.

**Sources:**
- [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) · [treesitter-symbols](https://github.com/richardwooding/treesitter-symbols)
- [Tree-sitter vs LSP](https://automadocs.com/blog/tree-sitter-vs-lsp-code-analysis) · [SCIP](https://scip-code.org/)
- [Aider repo map](https://aider.chat/2023/10/22/repomap.html) · [Aider PageRank](https://anishgandhi.com/aider-pagerank-codebase-ranking/)
- [AI code-index MCP comparison 2026](https://baeseokjae.github.io/posts/ai-coding-agent-code-index-mcp-comparison-2026/)
- [AST-derived Graph-RAG beats LLM graphs (arXiv)](https://arxiv.org/pdf/2601.08773) · [MCP Best Practices](https://mcp-best-practice.github.io/mcp-best-practice/best-practice/)

---

## Part A — Audit: bugs, loopholes & weak seams

Triaged by severity. Each item lists the exact location and the intended fix. The `AGENTS.md` rule
"if an existing abstraction can solve the problem, extend it" governs every fix.

### A1 — SECURITY · HTTP plugin fails open (HIGH)
`apps/chatgpt-plugin/src/http.ts:64-68` only **warns** when binding a non-loopback host with no token;
auth is enforced only when a token exists (`:110`). CORS defaults to `*` (`:59`), and DNS-rebinding
protection is opt-in (`:155-157`). Net effect: `--host 0.0.0.0` with no token = unauthenticated MCP
server exposing repository source reads — contradicting the module docstring (`:15-17`) which says a
token is *required* off-loopback.
**Fix:** refuse to start (throw) when `!isLoopback(host)` and no token; default CORS to loopback
(allow-list), enable `allowedHosts` by default. Add a startup-failure test.

### A2 — CORRECTNESS · Resolver divergence between parser and graph (MEDIUM)
`packages/graph/src/module-resolution.ts:29-36` includes `jsToTsCandidates()` (`.js → .ts/.tsx`);
`packages/parser/src/indexer/symbol-indexer.ts:268-274` does **not**. Both files carry a "keep the two
in sync" comment that is already violated. Result: ESM-style `import "./foo.js"` where only `foo.ts`
exists resolves in the graph but not in the symbol indexer → cross-file references/`findReferences`
disagree with graph edges. The contract test (`packages/graph/tests/module-resolution-contract.test.ts:42-49`)
only covers the literal-`.js`-present case.
**Fix:** consolidate into one resolver (see Part B.4) or, minimally, add `jsToTsCandidates` to the
indexer and extend the contract test to the `.js`-absent case.

### A3 — CORRECTNESS · MCP output truncation can turn success into failure (MEDIUM)
`packages/mcp/src/handlers.ts:280-285` slices serialized JSON at the last comma and appends `}` — not
structure-aware. When the cut lands mid-string/nested value, `JSON.parse` throws, `executeHandler`
returns a **failure envelope**, so an oversized `find_relevant_context` degrades to an error instead of
a truncated result.
**Fix:** budget/truncate on the object model (drop/trim items) *before* `JSON.stringify`; add a test
with a >50k result that must still return `ok`.

### A4 — CORRECTNESS · SDK "repo hole" defeats the type system (MEDIUM)
`packages/sdk/src/context/sdk.ts:314-315`: `reads = undefined as unknown as ReadRepositories`. Any
pre-`requireAvailable()` access throws a raw `TypeError`.
**Fix:** replace with an explicit throwing proxy (or `assertAvailable()` guard) so misuse is a typed,
predictable error.

### A5 — ROBUSTNESS · `git pull` with no timeout (LOW/MEDIUM)
`packages/sdk/src/toolkit/facade.ts:331`: `execFileAsync("git", [...])` with no timeout — unlike every
other spawn in the repo (scanner 3s, update-checker 5s, verifier `DEFAULT_TIMEOUT_MS`). A stalled network
hangs `atlas tools update` forever. (argv-array is fine — already `shell:false`.)
**Fix:** pass a timeout.

### A6 — ROBUSTNESS · Silent thin index for large files (LOW)
`packages/parser/src/typescript/typescript-parser.ts:86-91`: files over `maxReferenceLines` (20k) keep
symbols but get `references = []`, silently dropping cross-file edges with no surfaced warning.
**Fix:** surface skipped-ref files via `ParseBatch.skipped`/a warning counter into `IndexResult` +
`atlas doctor`.

### A7 — DOCS · Claims contradict code (LOW but trust-critical)
`README.md:269-270`, `docs/guides/troubleshooting.md:90-91`, `docs/CLEANUP_REPORT.md:124` and
`AGENTS.md` still say renamed imports and `export default <expr>` do **not** resolve cross-file. The
code + tests (`packages/parser/tests/symbol-indexer.test.ts:182-267`) show they **do**. The only real
remaining TS parser gaps are namespaces and bare expressions (`extractors.ts:68`).
**Fix:** correct those docs. Also `packages/mcp/README.md` lists 6 tools while 11 (+4 aliases) are
registered; `atlas inspect` description claims "network capture" but only `http` exists; `atlas
evaluate` hardcodes `tests.count = 0`. Fix all claims (honesty rule).

### A8 — Verified clean (record for confidence)
No `shell: true`, no `exec(shellString)`, no `eval`/`new Function` in product `src`; all process spawns
are argv-array `shell:false`. No direct SQLite access outside `packages/storage` + `packages/usage`; no
Context-SDK bypass in apps. Zero `TODO`/`FIXME`/`@ts-ignore`/`as any` in `src`. Full test coverage
exists for every package. No ReDoS found.

---

## Part B — Multi-language support (tree-sitter)

**Decision:** add tree-sitter-based parsers behind the existing `LanguageParser` seam.
**Wave 1 languages: Python, Java, C#, Go, Rust.** The scanner **already** maps their extensions
(`packages/scanner/src/language.ts`: `py→python, java→java, cs→csharp, go→go, rs→rust`), so no scanner
change is needed for detection.

### B.1 Why this fits
- `ParserService` already embraces plugins: `registerParser()` + `ParserRegistry`; downstream consumers
  only see normalized `Symbol`/`Reference`/`ParsedFile` (`packages/parser/src/language-parser.ts:13`,
  `packages/core/src/domain/entities.ts`). No consumer needs to learn a new language.
- The indexer's filter is **already** `parser.supportedLanguages()` (`indexer.ts:142-145`), and the
  scanner drops files whose language isn't in that set (`scanner.service.ts:229-235`). So **registering a
  parser automatically opts that language into scanning + indexing** — zero pipeline edits.
- The parser is already name-based (no full type checker), exactly matching the tree-sitter model.

### B.2 Where the code goes (reuse the parser package — no new package)
Add a tree-sitter subtree inside `@prof-bilal/atlas-parser`:

```
packages/parser/src/treesitter/
  grammars.ts            # lazy web-tree-sitter Language loader + cache
  language-config.ts     # TreeSitterLanguageConfig type (node-kind → SymbolKind/ReferenceKind rules)
  tree-sitter-parser.ts  # generic LanguageParser impl driven by a config
  symbols.ts             # generic AST walk → Symbol[]
  references.ts          # generic identifier/usage walk → Reference[]
  languages/
    python.ts  java.ts  csharp.ts  go.ts  rust.ts
  resolvers/
    module-resolver.ts      # ModuleResolver interface + registry (see B.4)
    typescript-resolver.ts  # extracted from SymbolIndexer (consolidation)
    python.ts java.ts csharp.ts go.ts rust.ts
```

**Engine:** `web-tree-sitter` + **WASM grammars** (pure WASM, no `node-gyp`/native build) — critical for
a package users install on arbitrary platforms. Grammars delivered as assets; evaluate the
`tree-sitter-wasms` npm package (one dep, many grammars) vs vendoring per-language `.wasm` files under
`packages/parser/assets/grammars/` with licenses recorded in a `NOTICE`. **Load lazily** so a
missing/failed grammar degrades to "language skipped" (already the parser's contract) instead of
crashing the build — and surface the skipped count honestly.

**Registration** (`packages/parser/src/parser.service.ts` constructor): extend the default registry to
register `TypeScriptParser` + the five tree-sitter parsers. `supportedLanguages()` stays synchronous
(language *names* are static); only grammar bytes load lazily on first `parse()`.

### B.3 Normalized IR mapping (`SymbolKind`/`ReferenceKind`)
The union in `packages/core/src/domain/entities.ts` is TS-tuned. Two-part approach:
1. **Map aggressively to existing kinds:** Go/Rust/C# `struct` → `class`; Python/C#/Java `class` →
   `class`; `def`/`func` → `function` or `method` (with `parentId`); `interface`/`trait` → `interface`;
   `enum` → `enum`; `const`/`val`/`let` → `constant`/`variable`; `impl`-method → `method` parented to
   the type. `Visibility`: `pub`/`public` → `public`, `private`/`_`-prefix → `private`, Go capitalised
   → `exported`.
2. **Additively extend the union** with `"struct"`, `"trait"`, `"namespace"`, `"macro"` — these are
   real, common constructs, and collapsing them to `class`/`interface` would make `explain`/`search`
   output **misleading** (violates the honesty rule). `Symbols.kind` is stored as TEXT with no enum
   constraint → **no DB migration**. Must update every kind gate:
   - `packages/search/src/search.service.ts:112` `DEFINITION_KINDS`
   - `packages/sdk/src/context/sdk.ts:1123` `definitionKinds` (+ `:436` scoring)
   - graph edge building (`packages/graph/src/graph.service.ts`) + `USAGE_EDGE_KINDS` in `indexer.ts`
   - digest/context ranking consumers of `symbol.kind`
   - `ReferenceKind`: existing set already covers call/construct/property/type/read/write/extends/
     implements and is sufficient (Rust `impl Trait for T` → `implements`; `use`/`import` → import
     symbol → module edge). No change needed.

### B.4 Cross-file import resolution (the hard, language-specific part)
Today `@prof-bilal/atlas-graph` resolves imports with a TS-only pure function, and the parser's
`SymbolIndexer` duplicates it (A2). Different languages need different rules (Python dotted/relative,
Go module paths from `go.mod`, Java packages under a source root, C# namespaces, Rust `mod`/`crate::`).

**Design:**
- Define a **contract in `core`** (interface only — stays architecture-clean):
  `ModuleResolver { readonly languages: readonly string[]; resolve(fromFile, specifier, knownFiles): FilePath | undefined }` plus any extra inputs (e.g. detected source roots / module name).
- Implement resolvers **in `@prof-bilal/atlas-parser`** (feature package). A `ModuleResolverRegistry`
  keys them by language.
- **Inject** the registry from the SDK composition root into both `ParserService` and `GraphService`
  (mirrors the existing `ContainerOptions` override seam, `packages/sdk/src/container.ts`). This keeps
  `graph` importing only `core`+`shared`, as ESLint enforces.
- Resolver rules (best-effort, honest about unresolved — `unresolvedImportCount` already exists):
  - **TypeScript/JS** — existing candidates (+ `jsToTsCandidates`, fixing A2, consolidated).
  - **Python** — `from .a.b import x` / `import a.b`; dotted → `a/b.py` or `a/b/__init__.py`; handle
    relative level dots; detect `src/` layout.
  - **Go** — read `go.mod` module path once; `modulePath/pkg` → `<root>/pkg/` (package/dir-level edges).
  - **Java** — strip package, map `a.b.C` → `**/a/b/C.java` under a detected source root
    (`src/main/java`, `src/test/java`, or the first path segment).
  - **C#** — build a namespace→file index from parsed `namespace` symbols; `using A.B;` resolves to the
    files declaring that namespace under the repo.
  - **Rust** — `mod x;` → `x.rs` or `x/mod.rs`; `crate::`/`self::`/`super::` mapped against the crate
    root (`src/lib.rs`/`src/main.rs` parent).
- **Honesty:** per-language unresolved counts, plus a documented note that Java/C#/Go resolution is
  source-layout heuristic (no build-system/type resolution). Callers/callees are exact within a file and
  best-effort across files for the new languages.

### B.5 Framework & manifest detection (small, high-value)
`packages/scanner/src/scanner.service.ts` already collects `hasGoMod`, `hasCargoToml`, `hasPomXml`,
`hasRequirementsFile`, `hasPyprojectFile`, `.csproj`, but `packages/scanner/src/framework.ts` is
JS/TS-centric. Extend `detectFramework` so `atlas scan`/`project_overview`/`buildDigest` report
Django/Flask/FastAPI, Spring/Maven/Gradle, .NET/ASP.NET, Go modules, and Cargo — matching the new
language support.

### B.6 Phase split for languages
- **Wave 1:** tree-sitter infra + Python + Go (simplest resolvers) + kind extension + consumer updates.
- **Wave 2:** Java + C# + Rust + their resolvers.
Each language ships with fixtures + resolver tests before the next.

---

## Part C — New features to make CodeAtlas stronger

Ordered by leverage. All reuse existing seams; no parallel implementations.

### C1 — Hybrid semantic search with local embeddings (biggest UX gain)
Search is lexical+fuzzy only today, but the seam exists: `RelevanceScorer`
(`packages/search/src/scoring.ts:25`, default `LexicalScorer`, injected at `search.service.ts:45`).
- **New `EmbeddingPort` in `core`**; implementation in a new small package
  `@prof-bilal/atlas-embeddings` (keeps `search` focused). Provider options: **Ollama embeddings**
  (`nomic-embed-text`) reusing the existing Ollama support, plus a bundled **ONNX / transformers.js**
  local model as fallback. Local-only by default → **no code leaves the machine**; degrade to lexical
  when no model is available (never block).
- **AST-aware chunking:** embed **one vector per `Symbol`** (name + signature + doc + body span) rather
  than line windows — the structural info is what makes code searchable. This composes directly with the
  multi-language work: symbols are already the normalized unit.
- **Storage:** additive migration in `packages/storage` (new `Embeddings(target_id, model, dim, vector BLOB)`
  table + index); content-hash cached so unchanged code is never re-embedded. Additive + backward
  compatible (`AGENTS.md` §4.4).
- **Retrieval:** hybrid = lexical candidate prefilter → vector rerank, fused (RRF/weighted) behind a
  `HybridScorer implements RelevanceScorer`. Wire into `SearchService`, `find_relevant_context`, `ask`.
- **New `EmbeddingPort`/factory in SDK** (`createEmbeddingService`), exposed via `ContainerOptions`.

### C2 — Live/auto-refresh indexing (`atlas watch` daemon)
Freshness is modeled (`ContextSDK.freshness()`) but only updates on manual `build`/`update`.
- New `atlas watch` CLI command + SDK `createWatcher()`: file-watch the repo (respect `.gitignore` via
  the scanner), debounce, and run the existing incremental `indexProject` (`.update`) on change; also
  refresh the digest. Reuses hashing + the no-op fast path already in the indexer.
- A single shared daemon (lock/socket under `.codeatlas/`) so CLI and MCP/`atlas mcp` share one watcher
  instead of racing. Emit staleness events so MCP `freshness` reflects live state.
- Dependency: a maintained watcher lib (e.g. `chokidar`) added to the CLI/SDK.

### C3 — PageRank repo-map ranking (aider-style)
Context assembly currently ranks by lexical score + bounded graph traversal. Add a **global symbol
importance** pass computed once per index: PageRank over the dependency graph weighted by reference
counts/damping, persisted in a new `SymbolMetrics`/`Metadata` entry. Use it to (a) boost
`find_relevant_context`/`ask` ranking on large repos and (b) generate a compact, token-budgeted **repo
map** (top-N symbols by importance per module) as a new context item / MCP resource. Reuses the existing
graph + storage; no new engine.

### C4 — MCP surface: resources + honest docs
Tools-only today; best practice is resources for read-only projections. Add a handful of **resources**
(`codeatlas://overview`, `codeatlas://symbol/{id}`, `codeatlas://module/{path}`, `codeatlas://skills/{id}`)
rather than piling on more tools (keep the tool surface small). Fix `packages/mcp/README.md` tool list
(6 → 11 + 4 aliases) and add `prompts` only if a real recurring prompt emerges.

### C5 — Close CLI/UX gaps
- **`atlas usage budget set|limit set`** — budgets/limits are implemented in the service but there is
  **no CLI to author them** (read-only `usage` today).
- **`atlas evaluate`** — actually run the configured test/build commands (opt-in, argv-array, timeout),
  or remove the misleading "tests" claim.
- **`atlas impact --breaking`** — implement the snapshot-diff breaking-change check (currently a stub,
  `apps/cli/src/commands/impact.ts:181`).
- **`atlas inspect`** — either implement the advertised "network capture" or correct the description.

### C6 — Multi-language lifecycle polish
`atlas doctor` should report per-language grammar availability; `project_overview`/`scan` already group
by language and will light up automatically; add a `--languages` hint to `atlas init`. Add per-language
unresolved-import reporting to `buildDigest`/`IndexResult` (honesty).

---

## Part D — Sequencing

| Phase | Scope | Depends on | Acceptance |
|------|-------|-----------|-----------|
| **P0 — Hardening** | A1 (fail-closed HTTP), A2 (resolver sync), A3 (MCP truncation), A4 (repo guard), A5 (timeout), A6 (skip warning), A7 (doc truth) | — | Security test: off-loopback+no-token refuses; MCP >50k returns ok; contract test covers `.js`-absent |
| **P1 — Multi-lang core** | B.1–B.3, B.5, B.6 Wave 1 (Python, Go) + resolver injection | P0 (for resolver consolidation) | Fixtures for py/go produce expected `Symbol`/`Reference`; graph edges resolve; `pnpm check` green |
| **P2 — Multi-lang breadth** | B.6 Wave 2 (Java, C#, Rust) + resolvers | P1 | Per-language fixtures + resolver tests; unresolved counts reported |
| **P3 — Semantic search** | C1 (embeddings + hybrid + AST chunks) | P1 (symbol IR stable) | Embedding cached by hash; hybrid rerank measurably improves a fixture query set; degrades to lexical offline |
| **P4 — Live index** | C2 (`atlas watch`) | P0 | Watch mode re-indexes only changed files; MCP freshness reflects it |
| **P5 — Ranking** | C3 (PageRank + repo map) | P2 | Deterministic importance scores; repo map fits a token budget |
| **P6 — Surface** | C4, C5, C6 | P1–P3 | New CLI/MCP surfaces; docs updated; no stale claims |

---

## Part E — Verification strategy

1. **`pnpm check`** (typecheck + lint + format + test) after each phase; no weakened assertions.
2. **Parser fixtures:** `packages/parser/tests/fixtures/<lang>/` — each language asserts symbol names,
   kinds, visibility, parents, and reference kinds; plus a malformed-file case (must not throw).
3. **Resolver contract tests:** extend `packages/graph/tests/module-resolution-contract.test.ts` so
   parser and graph resolvers agree for every language and every candidate class (incl. `.js`→`.ts`).
4. **Mixed-language golden repo:** a small repo with py/java/cs/go/rs/ts; assert counts, no crash,
   per-language unresolved reporting, and that `supportedLanguages()` gates scan+index correctly.
5. **Incremental correctness:** change one file per language → assert only those are re-parsed and edges
   stay complete (extend existing indexer tests).
6. **Search:** a query set where hybrid beats lexical-only (recall@k); assert offline fallback.
7. **MCP/CLI:** >50k `find_relevant_context` returns `ok`; `atlas watch` updates freshness; budgets
   authoring round-trips.
8. **Security:** off-loopback-without-token startup refusal; no `shell:true` regressions (keep the audit
   grep in CI).

---

## Part F — Risks & non-goals

**Risks**
- **WASM grammar size/licensing** — vendor only the needed grammars, record licenses in `NOTICE`, keep
  lazy loading so size doesn't hit startup.
- **Heuristic Java/C#/Go resolution** — no build-system/type awareness; mitigate with honest per-language
  unresolved counts and documented limits. Full precision would require LSP/SCIP.
- **Embedding download/offline** — model fetch is opt-in and cached; degrade to lexical silently-but-logged.
- **Kind-union churn** — new kinds ripple to a handful of gates; enumerated in B.3 so nothing is missed.
- **Daemon complexity** — keep `atlas watch` a thin loop over existing incremental indexing; single shared
  instance via lock.

**Non-goals (explicit)**
- Type-resolved precision (compiler front ends / full LSP integration) — out of scope; the name-based
  tree-sitter model is the chosen trade-off.
- Cross-repo/org-wide intelligence (Sourcegraph/SCIP territory).
- Replacing the existing TS parser or any working module (reuse/extend only).
- Any cloud service; CodeAtlas stays local-first and privacy-preserving.

---

## Critical files to touch (summary)

- **Hardening:** `apps/chatgpt-plugin/src/http.ts`, `packages/mcp/src/handlers.ts`,
  `packages/sdk/src/context/sdk.ts`, `packages/sdk/src/toolkit/facade.ts`,
  `packages/parser/src/indexer/symbol-indexer.ts`, `packages/graph/src/module-resolution.ts`,
  `packages/parser/src/typescript/typescript-parser.ts`, `README.md`, `docs/guides/troubleshooting.md`,
  `docs/CLEANUP_REPORT.md`, `AGENTS.md`, `packages/mcp/README.md`.
- **Languages:** `packages/parser/src/language-parser.ts` (seam, unchanged), `parser.service.ts`
  (registration), new `packages/parser/src/treesitter/**`, `packages/core/src/domain/entities.ts`
  (kind union), `packages/core/src/domain/module-resolution.ts` (new contract),
  `packages/search/src/search.service.ts`, `packages/sdk/src/context/sdk.ts`,
  `packages/sdk/src/indexing/indexer.ts`, `packages/graph/src/graph.service.ts`,
  `packages/scanner/src/framework.ts`, `packages/sdk/src/container.ts` (injection).
- **Features:** new `packages/embeddings/**`, `packages/storage/src/{schema,migrations}.ts` (additive),
  `packages/search/src/scoring.ts` (hybrid scorer), `packages/sdk/src/**` (factories: embeddings,
  watcher, PageRank), `apps/cli/src/commands/{watch,usage,evaluate,impact}.ts`,
  `packages/mcp/src/**` (resources).
