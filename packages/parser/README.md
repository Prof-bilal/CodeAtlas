# @atlas/parser

Implements `ParserPort` from `@atlas/core`: consumes a `SourceFile` and produces
a **language-agnostic intermediate representation** — a normalized list of
`Symbol`s — so the rest of the pipeline (graph, storage, context) never needs
to know the source language.

TypeScript is the first supported language (via `ts-morph`). Other languages
are added as plugins behind the [`LanguageParser`](#language-parser) seam.

> **Status: implemented.** The `ParserService` now parses real files. See the
> [extractions](#extractions) and [API](#api) sections below.

---

## Contents

- [The normalized IR](#the-normalized-ir)
- [Extractions](#extractions)
- [Usage](#usage)
- [Parsing only changed files](#parsing-only-changed-files)
- [Adding a language](#adding-a-language)
- [Symbol Indexer](#symbol-indexer)
- [API](#api)
- [Limitations](#limitations)

## The normalized IR

The parser's output is a `ParsedFile` — one per source file — that carries
normalized `Symbol`s.

```ts
interface ParsedFile {
  path: FilePath;       // absolute path of the parsed file
  language: string;     // e.g. "typescript"
  symbols: readonly Symbol[];
  references: readonly Reference[];  // identifier usages in the file
}
```

Every `Symbol` is independent of the source language:

| Field            | Meaning                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `id`             | Deterministic `SymbolId` derived from `path#name@startLine:startColumn`  |
| `name`           | The declared name (e.g. `"Service"`, `"start"`)                          |
| `kind`           | A [`SymbolKind`](#symbolkind) — the normalized "symbol type"             |
| `filePath`       | Absolute path of the containing file                                     |
| `location`       | 1-based `SymbolLocation` span (start inclusive, end exclusive)           |
| `parentId`       | `SymbolId` of the containing symbol, or `null` (e.g. method → its class) |
| `visibility`     | A [`Visibility`](#visibility)                                            |
| `exported`       | Whether the symbol is exported from its module                           |
| `modifiers`      | Declaration modifiers in source order (e.g. `["export", "abstract"]`)    |
| `moduleSpecifier`| Module string for `import`/`export` symbols, else `null`                 |
| `typeText`       | Type text for variables/aliases/members, else `null`                     |
| `documentation`  | JSDoc/doc comment attached to the declaration, else `null`               |

A `Reference` records one identifier usage — `{ filePath, name, kind,
location, targetSymbolId }`. Same-file targets are resolved by the parser;
cross-file targets (through imports) are resolved by the
[`SymbolIndexer`](#symbol-indexer).

### SymbolKind

```ts
type SymbolKind =
  | "class" | "interface" | "function" | "method" | "constructor"
  | "property" | "variable" | "constant" | "import" | "export" | "enum"
  | "enum-member" | "type-alias";
```

`const` declarations are `"constant"`; `let`/`var` declarations are
`"variable"`.

### Visibility

Class members use `"private"` / `"protected"` / `"public"` (default `public`);
module-level symbols use `"exported"` (has an `export` modifier) or `"local"`.

## Extractions

Given a TypeScript file, the parser extracts:

| Construct                          | Emitted symbols                                                        |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `class`                            | class + `constructor` + `method`s + `property`s (incl. parameter props) |
| `interface`                        | interface + `method`s + `property`s                                     |
| `function`                         | one `function` per declaration/overload                                 |
| `const` / `let` / `var`            | one `constant` / `variable` per declaration, with `modifiers` + `typeText` |
| `import`                           | default / named / renamed / namespace / type-only / side-effect         |
| `export`                           | named / renamed / `export *` / `export * as ns` / `export default`      |
| `enum`                             | enum + `enum-member`s (value in `typeText`)                             |
| `type X = ...`                     | `type-alias` with the type text                                         |
| identifier usages                  | `Reference`s: call / construct / property / type / read / write / extends / implements |

Overloaded functions/methods yield one symbol per overload (same name,
different locations). Class getters/setters are surfaced as `property` symbols.
Class and interface members are emitted in source order.

## Usage

```ts
import { ParserService } from "@atlas/parser";
import type { SourceFile } from "@atlas/core";

const service = new ParserService(); // TypeScript parser pre-registered

const file: SourceFile = {
  path: "/repo/src/index.ts",
  language: "typescript",
  content: "export class A { start(): void {} }",
};

// Single file → normalized output
const parsed = await service.parseFile(file);
if (parsed.ok) {
  for (const symbol of parsed.value.symbols) {
    console.log(symbol.kind, symbol.name, symbol.visibility, symbol.location);
  }
}

// Implement the port: flattened symbols for one file
const symbols = await service.parse(file);

// Look up a previously parsed symbol by id
const symbol = service.resolveSymbol(parsed.ok ? parsed.value.symbols[0].id : "…");
```

## Parsing only changed files

The parser never decides *what* to parse — its caller does. Feed it only the
files that changed since the last run (the scanner + hashing pipeline produces
those), and unchanged files are never touched:

```ts
import { getChangedFiles } from "@atlas/hashing";
// ... scanner walks the tree, hashing computes `previous`/`current` snapshots

const changedPaths = getChangedFiles(previous, current); // changed + added only

// Re-read only the changed paths and parse only those.
const changedSourceFiles: SourceFile[] = [];
for (const path of changedPaths) {
  const result = await scanner.readFile(path);
  if (result.ok) changedSourceFiles.push(result.value);
}

const batch = await service.parseFiles(changedSourceFiles);
// batch.parsed  → ParsedFile[] for every file that parsed
// batch.skipped → SkippedFile[] (no registered parser, or parse failure)
```

`parseFiles` is tolerant: files without a registered parser or that fail to
parse land in `batch.skipped` with a reason, never throwing or aborting the
batch. Symbol ids are deterministic, so re-parsing an unchanged file is
idempotent.

## Adding a language

1. Implement [`LanguageParser`](#language-parser) for the new language.
2. Register it with the service (or a `ParserRegistry`).

```ts
import { ParserService } from "@atlas/parser";
import { ok, type Result } from "@atlas/shared";
import type { SourceFile, Symbol } from "@atlas/core";
import type { LanguageParser, ParsedFile } from "@atlas/parser";

class PythonParser implements LanguageParser {
  readonly languages = ["python"];

  async parse(file: SourceFile): Promise<Result<ParsedFile>> {
    const symbols: Symbol[] = /* … translate Python AST → normalized Symbols … */;
    const references: Reference[] = /* … Python identifier usages … */;
    return ok({ path: file.path, language: file.language, symbols, references });
  }
}

const service = new ParserService().registerParser(new PythonParser());
service.supportedLanguages(); // ["typescript", "python"]
```

Nothing else changes: the graph, storage, and context packages consume the same
normalized `Symbol` shape regardless of language.

## Symbol Indexer

`SymbolIndexer` builds a searchable, in-memory index from parsed files and
answers symbol queries. Because it operates on the normalized IR, it works with
every language parser.

```ts
import { ParserService, SymbolIndexer } from "@atlas/parser";

const service = new ParserService();
const batch = await service.parseFiles(changedSourceFiles);

const indexer = new SymbolIndexer().index(batch.parsed);

// Every definition named "Counter" (case-insensitive by default).
const counters = indexer.findSymbol("counter");

// All symbols in a file, filtered by kind / export status / name.
const exported = indexer.listSymbols({ exported: true });
const constants = indexer.listSymbols({ kind: "constant" });

// Usages that resolve to a symbol — including across files via imports.
const format = indexer.findDefinitions("format")[0];
const usages = indexer.findReferences(format.id);

// Definitions by name (includes overloads) or by symbol id.
const defs = indexer.findDefinitions("parse");
```

| Method               | Returns                       | Notes                                        |
| -------------------- | ----------------------------- | -------------------------------------------- |
| `index(files)`       | `this`                        | Index a batch of `ParsedFile`s and resolve refs |
| `addFile(file)`      | `this`                        | Index one file (resolution runs lazily)       |
| `findSymbol(name)`   | `IndexedSymbol[]`             | Exact match; `{ matchCase, partial }` options |
| `listSymbols(filter)`| `IndexedSymbol[]`             | Filter by `kind`, `filePath`, `exported`, `name` |
| `findReferences(id)` | `Reference[]`                 | Usages targeting the symbol (same + cross-file) |
| `findDefinitions(q)` | `IndexedSymbol[]`             | By name (overloads included) or symbol id     |
| `getSymbol(id)`      | `IndexedSymbol \| undefined`  | Direct lookup, with `children` + `references` |

`IndexedSymbol` is a `Symbol` plus its `children` (direct members) and
`references` (usages that resolve to it).

### Reference resolution

References are resolved with deterministic, name-based heuristics — no AI, no
type checker:

1. **Same file** — a usage inside a class/interface/enum prefers a member of
   that container with the same name (so `this.start()` resolves to the class
   method); otherwise it matches a module-level symbol or import binding.
2. **Across files** — a usage of an imported name resolves to the definition in
   the imported module (via the import's `moduleSpecifier`). Usages in
   importing files therefore show up in `findReferences` for the definition.

Usages that match nothing (locals, unresolved names) stay unresolved and are
still recorded, but `findReferences` only returns usages that resolved.

## API

### `ParserService`

Implements `ParserPort`. Composes registered `LanguageParser`s behind a
language-neutral facade.

| Method                  | Returns                      | Notes                                            |
| ----------------------- | ---------------------------- | ------------------------------------------------ |
| `parse(file)`           | `Result<readonly Symbol[]>`  | `ParserPort`; flattened symbols for one file     |
| `parseFile(file)`       | `Result<ParsedFile>`         | Rich per-file output (indexed for `resolveSymbol`) |
| `parseFiles(files)`     | `Promise<ParseBatch>`        | Batch entry point for changed files               |
| `resolveSymbol(id)`     | `Result<Symbol \| undefined>`| `ParserPort`; previously parsed symbols           |
| `registerParser(parser)`| `this`                       | Register a `LanguageParser` plugin                |
| `supportedLanguages()`  | `readonly string[]`          | Languages with a registered parser                |

### `TypeScriptParser`

`LanguageParser` for `"typescript"` built on `ts-morph`. Parses in-memory (no
tsconfig, lib files, or disk access) and extracts the normalized IR above.

### `LanguageParser`

The plugin seam:

```ts
interface LanguageParser {
  readonly languages: readonly string[];
  parse(file: SourceFile): Promise<Result<ParsedFile>>;
}
```

### `ParserRegistry`

Maps languages to parsers. `register(parser)` replaces an existing registration
for the same language; `get(language)` returns the parser or `undefined`.

### Other exports

- `UnsupportedLanguageError` — the failure returned when a file's language has
  no registered parser.
- `createSymbolId(filePath, name, location)` — builds the deterministic
  `SymbolId` used across the IR.

## Limitations

- Namespace/module declarations (`namespace Foo { … }`) are not descended into.
- `typeText` prefers the explicit annotation; inferred types are best-effort
  and may be `null` for complex expressions.
- References are resolved by **name and scope, not by type**. For example, in
  `svc.start()` the base `svc` resolves but `start` only resolves when the
  member is referenced via `this` (or a same-name member is in scope). Use the
  type-level resolution of a future graph module when precision beyond that is
  needed.
- Cross-file reference resolution covers relative imports (named, renamed, and
  default). Bare `node:`/package specifiers and namespace imports resolve only
  to the local import binding.
- Renamed imports (`import { a as b }`) record the local binding name `b`; the
  original name is not stored.
