import type { ReferenceKind, SymbolKind, Visibility } from "@prof-bilal/atlas-core";
import type { Node } from "web-tree-sitter";
import {
  type TreeSitterImport,
  type TreeSitterLanguageConfig,
  type TreeSitterScope,
  fieldName,
} from "../language-config";

/** Node types that open a type body (members become methods/properties). */
const TYPE_KINDS: readonly SymbolKind[] = ["class"];
/** Node kinds that open a function body (locals are not declarations). */
const FUNCTION_KINDS: readonly SymbolKind[] = ["function", "method"];

function nameFor(node: Node): string | null {
  switch (node.type) {
    case "function_definition":
    case "class_definition":
      return fieldName(node);
    case "assignment": {
      const left = node.childForFieldName("left");
      return left !== null && left.type === "identifier" ? left.text : null;
    }
    default:
      return null;
  }
}

function kindFor(node: Node, scope: TreeSitterScope): SymbolKind | undefined {
  switch (node.type) {
    case "function_definition":
      return scope === "type" ? "method" : "function";
    case "class_definition":
      return "class";
    case "assignment": {
      if (scope === "type") {
        return "property";
      }
      if (scope !== "module") {
        return undefined;
      }
      const left = node.childForFieldName("left");
      if (left === null || left.type !== "identifier") {
        return undefined;
      }
      return left.text === left.text.toUpperCase() ? "constant" : "variable";
    }
    default:
      return undefined;
  }
}

function isAsync(node: Node): boolean {
  return node.children.some((child) => child?.text === "async");
}

function visibilityFor(node: Node, scope: TreeSitterScope): Visibility {
  const name = nameFor(node) ?? "";
  if (scope === "type") {
    return name.startsWith("_") ? "private" : "public";
  }
  return name.startsWith("_") ? "local" : "exported";
}

function exportedFor(node: Node, scope: TreeSitterScope): boolean {
  return scope === "module" && !(nameFor(node) ?? "_").startsWith("_");
}

function documentationFor(node: Node): string | null {
  if (node.type !== "function_definition" && node.type !== "class_definition") {
    return null;
  }
  const body = node.childForFieldName("body");
  const first = body?.namedChildren[0];
  if (first === undefined || first === null || first.type !== "expression_statement") {
    return null;
  }
  const stringNode = first.namedChildren[0];
  if (stringNode === undefined || stringNode === null || stringNode.type !== "string") {
    return null;
  }
  return stripPythonString(stringNode.text);
}

function stripPythonString(text: string): string {
  const match = /^[rRbBuUfF]*("""|'''|"|')/.exec(text);
  if (match === null) {
    return text.trim();
  }
  const quote = match[1] ?? "";
  return text.slice(match[0].length, text.length - quote.length).trim();
}

function typeTextFor(node: Node): string | null {
  if (node.type !== "assignment") {
    return null;
  }
  return node.childForFieldName("type")?.text ?? null;
}

function imports(root: Node): readonly TreeSitterImport[] {
  const result: TreeSitterImport[] = [];
  for (const node of root.namedChildren) {
    if (node === null) {
      continue;
    }
    if (node.type === "import_statement") {
      for (const spec of node.namedChildren) {
        if (spec === null) {
          continue;
        }
        if (spec.type === "aliased_import") {
          const alias = spec.childForFieldName("alias")?.text;
          const original = spec.childForFieldName("name")?.text;
          if (alias !== undefined && original !== undefined) {
            result.push({ name: alias, specifier: original, importedName: original, node: spec });
          }
        } else {
          const text = spec.text;
          result.push({ name: text.split(".")[0] ?? text, specifier: text, node: spec });
        }
      }
    } else if (node.type === "import_from_statement") {
      const specifier = node.childForFieldName("module_name")?.text ?? "";
      for (const nameNode of node.namedChildren) {
        if (nameNode === null || nameNode.id === node.childForFieldName("module_name")?.id) {
          continue;
        }
        if (nameNode.type === "aliased_import") {
          const alias = nameNode.childForFieldName("alias")?.text;
          const original = nameNode.childForFieldName("name")?.text;
          if (alias !== undefined && original !== undefined) {
            result.push({
              name: alias,
              specifier,
              importedName: original,
              node: nameNode,
            });
          }
        } else if (nameNode.type === "dotted_name" || nameNode.type === "identifier") {
          const name = nameNode.text;
          result.push({ name, specifier, node: nameNode });
        }
      }
    }
  }
  return result;
}

function referenceKindFor(_node: Node, parent: Node | null): ReferenceKind {
  if (parent !== null && parent.type === "call") {
    return "call";
  }
  return "read";
}

/** Python grammar config for {@link TreeSitterParser}. */
export const PYTHON_CONFIG: TreeSitterLanguageConfig = {
  language: "python",
  grammar: "python",
  kindFor,
  nameFor,
  imports,
  typeKinds: TYPE_KINDS,
  functionKinds: FUNCTION_KINDS,
  visibilityFor,
  exportedFor,
  modifiersFor: (node) => (isAsync(node) ? ["async"] : []),
  documentationFor,
  typeTextFor,
  identifierTypes: ["identifier"],
  referenceKindFor,
};
