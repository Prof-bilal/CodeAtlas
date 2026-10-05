import type { Reference, ReferenceKind } from "@prof-bilal/atlas-core";
import type { FilePath } from "@prof-bilal/atlas-shared";
import type { Node } from "web-tree-sitter";
import { type TreeSitterLanguageConfig, locationOf } from "./language-config";

/**
 * Walk a tree-sitter tree into normalized {@link Reference}s (unresolved; the
 * caller resolves same-file targets). Identifier nodes that name a declaration
 * or live inside an import declaration are excluded — they bind, they are not
 * usages.
 */
export function extractTreeSitterReferences(
  root: Node,
  filePath: FilePath,
  config: TreeSitterLanguageConfig,
  nameNodeIds: ReadonlySet<number>,
  importNodeIds: ReadonlySet<number>,
): Reference[] {
  const identifierTypes = new Set(config.identifierTypes ?? ["identifier"]);
  const references: Reference[] = [];

  const walk = (node: Node): void => {
    if (importNodeIds.has(node.id)) {
      return;
    }
    if (identifierTypes.has(node.type) && !nameNodeIds.has(node.id)) {
      references.push({
        filePath,
        name: node.text,
        kind: kindOf(node, node.parent, config),
        location: locationOf(node),
        targetSymbolId: null,
      });
    }
    for (const child of node.namedChildren) {
      if (child !== null) {
        walk(child);
      }
    }
  };

  walk(root);
  return references;
}

function kindOf(node: Node, parent: Node | null, config: TreeSitterLanguageConfig): ReferenceKind {
  if (config.referenceKindFor !== undefined) {
    return config.referenceKindFor(node, parent);
  }
  if (parent !== null && parent.type.includes("call")) {
    return "call";
  }
  return "read";
}
