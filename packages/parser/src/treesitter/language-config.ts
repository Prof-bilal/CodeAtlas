import type { ReferenceKind, SymbolKind, SymbolLocation, Visibility } from "@prof-bilal/atlas-core";
import type { Node } from "web-tree-sitter";

/** Where a declaration sits: module top level, a type body, or a function body. */
export type TreeSitterScope = "module" | "type" | "function";

/** An import binding extracted from a language's import syntax. */
export interface TreeSitterImport {
  /** Local binding name (what usages refer to). */
  readonly name: string;
  /** The module specifier as written (e.g. `"./a"`, `"a.b"`, `"fmt"`). */
  readonly specifier: string;
  /** Name in the imported module for `as`/renamed imports, else omitted. */
  readonly importedName?: string;
  /** The declaration node (used for location + id determinism). */
  readonly node: Node;
}

/**
 * A declarative description of one language's tree-sitter grammar: which nodes
 * are declarations, how to name them, and how to classify usages. The generic
 * {@link extractTreeSitterSymbols} / {@link extractTreeSitterReferences} walks
 * are driven entirely by this config, so adding a language is a config, not a
 * new parser.
 */
export interface TreeSitterLanguageConfig {
  /** Normalized language name emitted on `ParsedFile.language`. */
  readonly language: string;
  /** `tree-sitter-wasms` basename (`tree-sitter-<grammar>.wasm`). */
  readonly grammar: string;
  /**
   * The normalized kind for a declaration node, or `undefined` when the node is
   * not a declaration (the walk descends into it).
   */
  readonly kindFor: (node: Node, scope: TreeSitterScope) => SymbolKind | undefined;
  /** The declaration's name, or `null` when it is anonymous/skippable. */
  readonly nameFor: (node: Node) => string | null;
  /** Import bindings declared anywhere under `root`. */
  readonly imports: (root: Node) => readonly TreeSitterImport[];
  /** Kinds that open a type body (members are extracted with `scope: "type"`). */
  readonly typeKinds?: readonly SymbolKind[];
  /** Kinds that open a function body (locals are not extracted as declarations). */
  readonly functionKinds?: readonly SymbolKind[];
  /**
   * Node types that open a `"type"` scope without producing a symbol (e.g. a
   * Rust `impl` block, so its methods are classified as methods).
   */
  readonly typeScopeNodes?: readonly string[];
  readonly visibilityFor?: (node: Node, scope: TreeSitterScope) => Visibility;
  readonly modifiersFor?: (node: Node) => readonly string[];
  readonly exportedFor?: (node: Node, scope: TreeSitterScope) => boolean;
  readonly documentationFor?: (node: Node) => string | null;
  readonly typeTextFor?: (node: Node) => string | null;
  /** Node types treated as identifier usages (defaults to `["identifier"]`). */
  readonly identifierTypes?: readonly string[];
  /** Classify a usage; defaults to a `call`/`read` heuristic. */
  readonly referenceKindFor?: (node: Node, parent: Node | null) => ReferenceKind;
}

/** Convert a tree-sitter node span to a 1-based {@link SymbolLocation}. */
export function locationOf(node: Node): SymbolLocation {
  return {
    startLine: node.startPosition.row + 1,
    startColumn: node.startPosition.column + 1,
    endLine: node.endPosition.row + 1,
    endColumn: node.endPosition.column + 1,
  };
}

/** The text of the node's `name` field, or `null`. */
export function fieldName(node: Node, field = "name"): string | null {
  const nameNode = node.childForFieldName(field);
  return nameNode === null ? null : nameNode.text;
}

/** First named child whose type is one of `types`. */
export function firstChildOfType(node: Node, types: readonly string[]): Node | null {
  for (const child of node.namedChildren) {
    if (child !== null && types.includes(child.type)) {
      return child;
    }
  }
  return null;
}

/** Depth-first collect descendant nodes of the given types. */
export function collectDescendants(node: Node, types: ReadonlySet<string>): Node[] {
  const found: Node[] = [];
  const visit = (current: Node): void => {
    for (const child of current.namedChildren) {
      if (child === null) {
        continue;
      }
      if (types.has(child.type)) {
        found.push(child);
      }
      visit(child);
    }
  };
  visit(node);
  return found;
}
