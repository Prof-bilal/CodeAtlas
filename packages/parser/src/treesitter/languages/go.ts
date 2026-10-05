import type { ReferenceKind, SymbolKind, Visibility } from "@prof-bilal/atlas-core";
import type { Node } from "web-tree-sitter";
import {
  type TreeSitterImport,
  type TreeSitterLanguageConfig,
  type TreeSitterScope,
  fieldName,
} from "../language-config";

const TYPE_KINDS: readonly SymbolKind[] = ["struct", "interface"];
const FUNCTION_KINDS: readonly SymbolKind[] = ["function", "method"];

function nameFor(node: Node): string | null {
  switch (node.type) {
    case "function_declaration":
    case "method_declaration":
    case "method_spec":
    case "type_spec":
    case "const_spec":
    case "var_spec":
    case "field_declaration":
      return fieldName(node);
    default:
      return null;
  }
}

function structOrInterface(node: Node): SymbolKind {
  const typeChild = node.childForFieldName("type");
  if (typeChild?.type === "struct_type") {
    return "struct";
  }
  if (typeChild?.type === "interface_type") {
    return "interface";
  }
  return "type-alias";
}

function kindFor(node: Node, scope: TreeSitterScope): SymbolKind | undefined {
  switch (node.type) {
    case "function_declaration":
      return "function";
    case "method_declaration":
    case "method_spec":
      return "method";
    case "type_spec":
      return structOrInterface(node);
    case "const_spec":
      return "constant";
    case "var_spec":
      return scope === "type" ? "property" : "variable";
    case "field_declaration":
      return scope === "type" ? "property" : undefined;
    default:
      return undefined;
  }
}

function isExported(name: string | null): boolean {
  return name !== null && name.length > 0 && name[0] === name[0].toUpperCase() && name[0] !== "_";
}

function visibilityFor(node: Node, scope: TreeSitterScope): Visibility {
  const exported = isExported(nameFor(node));
  if (scope === "type") {
    return exported ? "public" : "private";
  }
  return exported ? "exported" : "local";
}

function exportedFor(node: Node, scope: TreeSitterScope): boolean {
  return scope === "module" && isExported(nameFor(node));
}

function typeTextFor(node: Node): string | null {
  if (node.type === "var_spec" || node.type === "const_spec" || node.type === "field_declaration") {
    return node.childForFieldName("type")?.text ?? null;
  }
  return null;
}

function documentationFor(node: Node): string | null {
  const previous = node.previousNamedSibling;
  if (previous === null || previous.type !== "comment") {
    return null;
  }
  return previous.text.replace(/^\/\/\s?/, "").trim();
}

/** Last path segment of an import path (`"a/b/c"` → `"c"`). */
function lastSegment(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

function imports(root: Node): readonly TreeSitterImport[] {
  const result: TreeSitterImport[] = [];
  for (const node of root.namedChildren) {
    if (node === null || node.type !== "import_declaration") {
      continue;
    }
    const specs = node.descendantsOfType("import_spec");
    for (const spec of specs) {
      if (spec === null) {
        continue;
      }
      const rawPath = spec.childForFieldName("path")?.text ?? "";
      const specifier = rawPath.replace(/^"|"$/g, "");
      const alias = spec.childForFieldName("name")?.text;
      result.push({
        name: alias ?? lastSegment(specifier),
        specifier,
        ...(alias === undefined ? {} : { importedName: lastSegment(specifier) }),
        node: spec,
      });
    }
  }
  return result;
}

function referenceKindFor(node: Node, parent: Node | null): ReferenceKind {
  if (parent !== null && parent.type === "call_expression") {
    return "call";
  }
  if (parent !== null && parent.type === "composite_literal") {
    return "construct";
  }
  if (node.type === "type_identifier") {
    return "type";
  }
  return "read";
}

/** Go grammar config for {@link TreeSitterParser}. */
export const GO_CONFIG: TreeSitterLanguageConfig = {
  language: "go",
  grammar: "go",
  kindFor,
  nameFor,
  imports,
  typeKinds: TYPE_KINDS,
  functionKinds: FUNCTION_KINDS,
  visibilityFor,
  exportedFor,
  modifiersFor: () => [],
  documentationFor,
  typeTextFor,
  identifierTypes: ["identifier", "type_identifier", "field_identifier", "package_identifier"],
  referenceKindFor,
};
