import type { EdgeId, FilePath, NodeId, ProjectId, SymbolId } from "@atlas/shared";

/** A codebase that CodeAtlas has been asked to index. */
export interface Project {
  readonly id: ProjectId;
  readonly name: string;
  readonly rootPath: FilePath;
}

/** A single source file discovered by the scanner and fed to the parser. */
export interface SourceFile {
  readonly path: FilePath;
  /** Detected language, e.g. `"typescript"` or `"python"`. */
  readonly language: string;
  readonly content: string;
}

/**
 * The kind of a language-agnostic {@link Symbol}.
 *
 * This is the normalized "symbol type" the parser emits, independent of the
 * source language.
 */
export type SymbolKind =
  | "class"
  | "interface"
  | "function"
  | "method"
  | "constructor"
  | "property"
  | "variable"
  | "constant"
  | "import"
  | "export"
  | "enum"
  | "enum-member"
  | "type-alias";

/**
 * Access level of a symbol.
 *
 * Class members use `private` / `protected` / `public`; module-level symbols
 * use `exported` (has an `export` modifier) or `local` (module-private).
 */
export type Visibility = "private" | "protected" | "public" | "exported" | "local";

/** A 1-based source span for a symbol declaration. */
export interface SymbolLocation {
  readonly startLine: number;
  readonly endLine: number;
  readonly startColumn: number;
  readonly endColumn: number;
}

/** A language-agnostic code unit produced by the parser. */
export interface Symbol {
  readonly id: SymbolId;
  readonly name: string;
  readonly kind: SymbolKind;
  readonly filePath: FilePath;
  /** 1-based source span of the declaration. */
  readonly location: SymbolLocation;
  /** Id of the containing symbol (e.g. a method's class), or `null`. */
  readonly parentId: SymbolId | null;
  /** Access level; module-level symbols are `exported` or `local`. */
  readonly visibility: Visibility;
  /** True when the symbol is exported from its module. */
  readonly exported: boolean;
  /**
   * Declaration modifiers in source order, e.g. `["export", "abstract"]` or
   * `["private", "static"]`.
   */
  readonly modifiers: readonly string[];
  /** Module specifier for `import` / `export` symbols, else `null`. */
  readonly moduleSpecifier: string | null;
  /**
   * For `import` symbols, the name the binding refers to **in the imported
   * module** — `"a"` for `import { a as b }` (where `name` is the local alias
   * `b`) and `"default"` for `import x from "..."`. `undefined` for named
   * imports without an alias and for every other kind.
   */
  readonly importedName?: string;
  /** Type text for variables, type aliases, and properties, else `null`. */
  readonly typeText: string | null;
  /**
   * Documentation (e.g. a JSDoc comment) attached to the declaration, or
   * `null` when the declaration has no doc comment.
   */
  readonly documentation: string | null;
}

/** The kind of a symbol usage (a reference). */
export type ReferenceKind =
  | "call"
  | "construct"
  | "property"
  | "type"
  | "read"
  | "write"
  | "extends"
  | "implements";

/**
 * A single usage of a symbol at a source location, produced by the parser and
 * resolved to a target by the symbol indexer.
 */
export interface Reference {
  readonly filePath: FilePath;
  /** The identifier text that was referenced. */
  readonly name: string;
  /** How the identifier was used. */
  readonly kind: ReferenceKind;
  /** 1-based source span of the usage. */
  readonly location: SymbolLocation;
  /** Id of the symbol this usage resolves to, or `null` when unresolved. */
  readonly targetSymbolId: SymbolId | null;
}

/**
 * A node in the code-dependency graph.
 *
 * `symbolId` is `null` for synthetic file nodes (one per source file), which
 * represent the module itself and anchor file-level edges.
 */
export interface GraphNode {
  readonly id: NodeId;
  readonly symbolId: SymbolId | null;
}

/** A typed relationship between two graph nodes. */
export interface GraphEdge {
  readonly id: EdgeId;
  readonly from: NodeId;
  readonly to: NodeId;
  /** e.g. `"calls"`, `"imports"`, `"extends"`. */
  readonly kind: string;
}

/** A ranked snippet of source code selected as prompt context. */
export interface ContextItem {
  readonly source: FilePath;
  readonly content: string;
  /** Relevance score; higher is better. */
  readonly score: number;
}
