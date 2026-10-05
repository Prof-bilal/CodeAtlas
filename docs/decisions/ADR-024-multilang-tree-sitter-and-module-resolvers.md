# ADR-024: Multi-language parsing via tree-sitter WASM + injected module resolvers

Status:     Accepted
Date:       2026-10-05

Context:
  The parser was TypeScript/JavaScript-only (`TypeScriptParser` via `ts-morph`),
  while the scanner already detected `py`/`go`/`java`/`cs`/`rs` extensions and the
  file filter was driven by `ParserService.supportedLanguages()`. Two problems
  fell out of that gap:

  - Non-TS/JS files were scanned but produced no symbols/edges, so search,
    graph, and context silently degraded to content-only for whole ecosystems.
  - Cross-file import resolution was implemented twice — once in
    `@prof-bilal/atlas-graph` (`module-resolution.ts`) and once in the parser's
    `SymbolIndexer` — with a "keep in sync" comment that had already drifted
    (the graph mapped explicit `.js` specifiers to `.ts`; the indexer did not).

  Requirements: pure-WASM (no `node-gyp`/native build, arbitrary platforms),
  lazy/degradable (a missing grammar must not crash the build), reuse the
  existing `LanguageParser` seam and normalized `Symbol`/`Reference` IR, keep
  `@prof-bilal/atlas-graph` importing only `core` + `shared`, and never guess an
  unresolved import.

Decision:
  Add tree-sitter parsers behind the existing `LanguageParser` seam and make
  cross-file resolution an injected contract.

  1. **Engine.** `web-tree-sitter` (WASM) + grammars from `tree-sitter-wasms`,
     loaded lazily and cached (`packages/parser/src/treesitter/grammars.ts`). A
     missing/failed grammar returns `undefined`; the file is reported as skipped
     (the parser's existing contract), never a crash. Registration in
     `createDefaultParserRegistry()` opts a language into scanning + indexing with
     no pipeline edits.
  2. **Config-driven parsers.** A generic `TreeSitterParser` walks a grammar per
     a declarative `TreeSitterLanguageConfig` (`packages/parser/src/treesitter/**`).
     Languages: **Python, Go, Java, C#, Rust**. Symbols flow through the existing
     normalize step; references reuse `resolveReferenceTargets`.
  3. **Kind union (additive).** `SymbolKind` gains `struct`, `trait`,
     `namespace`, `macro` so `explain`/`search` output stays honest instead of
     collapsing real constructs to `class`/`interface`. `Symbols.kind` is TEXT
     with no enum constraint — no DB migration. All kind gates were updated
     (search `DEFINITION_KINDS`, SDK `definitionKinds`, MCP `SYMBOL_KINDS`,
     graph/closure/digest consumers).
  4. **Resolver injection.** `ModuleResolver` (interface only) lives in `core`;
     implementations (`typescript`, `python`, `go`, `java`, `csharp`, `rust`) live
     in the parser. The SDK composition root builds them
     (`createDefaultModuleResolvers()`) and injects them into `GraphService` and
     `SymbolIndexer`. Resolution is best-effort/name-based; unresolved specifiers
     are counted (`unresolvedImports`), never guessed.
  5. **Honest reporting.** Files whose reference graph is skipped by the size cap
     set `ParsedFile.referencesSkipped`; the indexer counts them into
     `IndexResult.referencesSkipped` + metadata, surfaced on the SDK overview and
     `atlas doctor`.

Alternatives:
  - **LSP / SCIP / LSIF.** Rejected: heavy per-language servers/indexer binaries
    and a full build-system dependency; the product's model is name-based,
    syntax-level context, not type-resolved precision (an explicit non-goal).
  - **Native tree-sitter bindings.** Rejected: `node-gyp` builds break the
    "install anywhere" property; WASM is the trade-off.
  - **One bespoke walker per language.** Rejected: a single config-driven walker
    keeps the seam thin and testable; per-language files only describe grammar.
  - **Keep the two duplicated resolvers in sync.** Rejected: it had already
    drifted; one injected contract removes the class of bug.
  - **Collapse `struct`/`trait`/`namespace`/`macro` into existing kinds.**
    Rejected: it would make `explain`/`search` output misleading.

Consequences:
  - Python/Go/Java/C#/Rust files produce normalized symbols and same-file
    references; cross-file `imports` edges resolve (Python dotted/relative, Go
    package dirs, Java packages, C# namespaces, Rust `crate::`/`self::`).
  - `@prof-bilal/atlas-graph` stays decoupled: it accepts `ModuleResolver[]` from
    the composition root and keeps the built-in TS resolver as a fallback.
  - Java/C#/Go resolution is a **source-layout heuristic** (no build-system/type
    awareness) — documented in `docs/CURRENT_STATE.md`/`README.md` and mitigated
    by per-index unresolved-import counts.
  - New runtime dependencies: `web-tree-sitter` + `tree-sitter-wasms` (parser),
    `chokidar` (SDK, for `atlas watch`, a separate concern).
  - Tests: per-language fixtures (`packages/parser/tests/treesitter*.test.ts`),
    resolver tests, and an end-to-end multi-language index test
    (`packages/sdk/tests/multilang.test.ts`).
  - Deferred (tracked in `docs/HARDENING_MULTILANG_ROADMAP_2026-10-04.md`):
    semantic/embedding hybrid search (P3), and wiring PageRank importance into
    `find_relevant_context` ranking.
