import type { Symbol } from "@prof-bilal/atlas-core";
import type { FilePath } from "@prof-bilal/atlas-shared";
import type { Node } from "web-tree-sitter";
import { createSymbolId } from "../symbol-id";
import { type TreeSitterLanguageConfig, type TreeSitterScope, locationOf } from "./language-config";

/** Symbols plus the name nodes to exclude from the usage walk. */
export interface TreeSitterSymbolResult {
  readonly symbols: readonly Symbol[];
  /** `node.id` of every declaration/import name node (not a usage). */
  readonly nameNodeIds: ReadonlySet<number>;
  /** Root `node.id` of every import declaration (its subtree is not usages). */
  readonly importNodeIds: ReadonlySet<number>;
}

/**
 * Walk a tree-sitter tree into normalized {@link Symbol}s using `config`.
 *
 * Declarations are recognized by `config.kindFor`; a type-kind declaration
 * opens a `"type"` scope (members become methods/properties) and a
 * function-kind declaration opens a `"function"` scope (locals are ignored).
 * Import bindings are appended as `import` symbols.
 */
export function extractTreeSitterSymbols(
  root: Node,
  filePath: FilePath,
  config: TreeSitterLanguageConfig,
): TreeSitterSymbolResult {
  const symbols: Symbol[] = [];
  const nameNodeIds = new Set<number>();
  const importNodeIds = new Set<number>();
  const typeKinds = config.typeKinds ?? [];
  const functionKinds = config.functionKinds ?? [];
  const typeScopeNodes = new Set(config.typeScopeNodes ?? []);

  const walk = (node: Node, parentId: Symbol["id"] | null, scope: TreeSitterScope): void => {
    const kind = config.kindFor(node, scope);
    if (kind !== undefined) {
      const name = config.nameFor(node);
      if (name === null) {
        for (const child of node.namedChildren) {
          if (child !== null) {
            walk(child, parentId, scope);
          }
        }
        return;
      }
      const location = locationOf(node);
      const symbol: Symbol = {
        id: createSymbolId(filePath, name, location),
        name,
        kind,
        filePath,
        location,
        parentId,
        visibility: config.visibilityFor?.(node, scope) ?? (scope === "type" ? "public" : "local"),
        exported: config.exportedFor?.(node, scope) ?? false,
        modifiers: config.modifiersFor?.(node) ?? [],
        moduleSpecifier: null,
        typeText: config.typeTextFor?.(node) ?? null,
        documentation: config.documentationFor?.(node) ?? null,
      };
      symbols.push(symbol);
      const nameNode = node.childForFieldName("name");
      if (nameNode !== null) {
        nameNodeIds.add(nameNode.id);
      }
      const nextScope: TreeSitterScope = typeKinds.includes(kind)
        ? "type"
        : functionKinds.includes(kind)
          ? "function"
          : scope;
      for (const child of node.namedChildren) {
        if (child !== null) {
          walk(child, symbol.id, nextScope);
        }
      }
      return;
    }
    const childScope: TreeSitterScope =
      typeScopeNodes.has(node.type) && scope === "module" ? "type" : scope;
    for (const child of node.namedChildren) {
      if (child !== null) {
        walk(child, parentId, childScope);
      }
    }
  };

  walk(root, null, "module");
  for (const imported of config.imports(root)) {
    importNodeIds.add(imported.node.id);
    const location = locationOf(imported.node);
    symbols.push({
      id: createSymbolId(filePath, imported.name, location),
      name: imported.name,
      kind: "import",
      filePath,
      location,
      parentId: null,
      visibility: "local",
      exported: false,
      modifiers: [],
      moduleSpecifier: imported.specifier,
      ...(imported.importedName === undefined ? {} : { importedName: imported.importedName }),
      typeText: null,
      documentation: null,
    });
    const nameNode = imported.node.childForFieldName("name");
    if (nameNode !== null) {
      nameNodeIds.add(nameNode.id);
    }
  }

  return { symbols, nameNodeIds, importNodeIds };
}
