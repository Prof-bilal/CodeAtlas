import type { ReferenceKind, SymbolKind, Visibility } from "@prof-bilal/atlas-core";
import type { Node } from "web-tree-sitter";
import {
  type TreeSitterImport,
  type TreeSitterLanguageConfig,
  type TreeSitterScope,
  fieldName,
} from "../language-config";

const TYPE_KINDS: readonly SymbolKind[] = ["struct", "trait", "enum"];
const FUNCTION_KINDS: readonly SymbolKind[] = ["function", "method"];

function hasPub(node: Node): boolean {
  return node.children.some((child) => child?.text === "pub");
}

function nameFor(node: Node): string | null {
  switch (node.type) {
    case "function_item":
    case "struct_item":
    case "enum_item":
    case "trait_item":
    case "mod_item":
    case "const_item":
    case "static_item":
    case "type_item":
    case "enum_variant":
    case "macro_definition":
      return fieldName(node);
    default:
      return null;
  }
}

function kindFor(node: Node, scope: TreeSitterScope): SymbolKind | undefined {
  switch (node.type) {
    case "function_item":
      return scope === "type" ? "method" : "function";
    case "struct_item":
      return "struct";
    case "trait_item":
      return "trait";
    case "enum_item":
      return "enum";
    case "enum_variant":
      return "enum-member";
    case "mod_item":
      return "namespace";
    case "const_item":
      return "constant";
    case "static_item":
      return "variable";
    case "type_item":
      return "type-alias";
    case "macro_definition":
      return "macro";
    default:
      return undefined;
  }
}

function visibilityFor(node: Node, scope: TreeSitterScope): Visibility {
  if (scope === "type") {
    return hasPub(node) ? "public" : "private";
  }
  return hasPub(node) ? "exported" : "local";
}

function exportedFor(node: Node): boolean {
  return hasPub(node);
}

function documentationFor(node: Node): string | null {
  const previous = node.previousNamedSibling;
  if (previous === null || previous.type !== "line_comment") {
    return null;
  }
  const text = previous.text;
  if (!text.startsWith("///")) {
    return null;
  }
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*\/\/\/\s?/, "").trimEnd())
    .join("\n")
    .trim();
}

function imports(root: Node): readonly TreeSitterImport[] {
  const result: TreeSitterImport[] = [];
  for (const node of root.descendantsOfType("use_declaration")) {
    if (node === null) {
      continue;
    }
    const body = node.text
      .replace(/^use\s+/, "")
      .replace(/;$/, "")
      .trim();
    if (body.length === 0) {
      continue;
    }
    const asIndex = body.indexOf(" as ");
    const specifier = (asIndex === -1 ? body : body.slice(0, asIndex)).trim();
    const alias = asIndex === -1 ? undefined : body.slice(asIndex + 4).trim();
    const lastSegment = specifier.split("::").pop() ?? specifier;
    const name = (alias ?? lastSegment).replace(/[{}]/g, "").trim();
    if (name.length === 0) {
      continue;
    }
    result.push({
      name,
      specifier,
      ...(alias === undefined ? {} : { importedName: lastSegment }),
      node,
    });
  }
  return result;
}

function referenceKindFor(node: Node, parent: Node | null): ReferenceKind {
  if (parent !== null && parent.type === "call_expression") {
    return "call";
  }
  if (parent !== null && parent.type === "struct_expression") {
    return "construct";
  }
  if (node.type === "type_identifier") {
    return "type";
  }
  return "read";
}

/** Rust grammar config for {@link TreeSitterParser}. */
export const RUST_CONFIG: TreeSitterLanguageConfig = {
  language: "rust",
  grammar: "rust",
  kindFor,
  nameFor,
  imports,
  typeKinds: TYPE_KINDS,
  functionKinds: FUNCTION_KINDS,
  typeScopeNodes: ["impl_item"],
  visibilityFor,
  exportedFor,
  modifiersFor: (node) => (hasPub(node) ? ["pub"] : []),
  documentationFor,
  typeTextFor: (node) => node.childForFieldName("return_type")?.text ?? null,
  identifierTypes: ["identifier", "type_identifier", "field_identifier"],
  referenceKindFor,
};
