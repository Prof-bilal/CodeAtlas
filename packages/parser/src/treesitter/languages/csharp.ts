import type { ReferenceKind, SymbolKind, Visibility } from "@prof-bilal/atlas-core";
import type { Node } from "web-tree-sitter";
import {
  type TreeSitterImport,
  type TreeSitterLanguageConfig,
  type TreeSitterScope,
  collectDescendants,
  fieldName,
} from "../language-config";

const TYPE_KINDS: readonly SymbolKind[] = ["class", "interface", "struct", "enum"];
const FUNCTION_KINDS: readonly SymbolKind[] = ["method", "constructor"];

function hasModifier(node: Node, name: string): boolean {
  return node.children.some((child) => child?.type === "modifier" && child.text === name);
}

function fieldNameOf(node: Node): string | null {
  const declarators = collectDescendants(node, new Set(["variable_declarator"]));
  const first = declarators[0];
  if (first === undefined) {
    return null;
  }
  return (
    first.childForFieldName("name")?.text ?? first.descendantsOfType("identifier")[0]?.text ?? null
  );
}

function nameFor(node: Node): string | null {
  switch (node.type) {
    case "class_declaration":
    case "interface_declaration":
    case "struct_declaration":
    case "enum_declaration":
    case "record_declaration":
    case "method_declaration":
    case "constructor_declaration":
    case "property_declaration":
    case "enum_member_declaration":
    case "namespace_declaration":
    case "file_scoped_namespace_declaration":
      return fieldName(node);
    case "field_declaration":
      return fieldNameOf(node);
    default:
      return null;
  }
}

function kindFor(node: Node, scope: TreeSitterScope): SymbolKind | undefined {
  switch (node.type) {
    case "class_declaration":
    case "record_declaration":
      return "class";
    case "interface_declaration":
      return "interface";
    case "struct_declaration":
      return "struct";
    case "enum_declaration":
      return "enum";
    case "enum_member_declaration":
      return "enum-member";
    case "method_declaration":
      return "method";
    case "constructor_declaration":
      return "constructor";
    case "property_declaration":
      return "property";
    case "namespace_declaration":
    case "file_scoped_namespace_declaration":
      return "namespace";
    case "field_declaration":
      return scope === "type" ? "property" : undefined;
    default:
      return undefined;
  }
}

function visibilityFor(node: Node, scope: TreeSitterScope): Visibility {
  if (hasModifier(node, "private")) {
    return "private";
  }
  if (hasModifier(node, "protected")) {
    return "protected";
  }
  return scope === "module" ? (hasModifier(node, "public") ? "exported" : "local") : "public";
}

function exportedFor(node: Node, scope: TreeSitterScope): boolean {
  return scope === "module" && hasModifier(node, "public");
}

function documentationFor(node: Node): string | null {
  const previous = node.previousNamedSibling;
  if (previous === null || previous.type !== "comment") {
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

function typeTextFor(node: Node): string | null {
  if (node.type === "method_declaration" || node.type === "property_declaration") {
    return node.childForFieldName("type")?.text ?? null;
  }
  if (node.type === "field_declaration") {
    const declaration = collectDescendants(node, new Set(["variable_declaration"]))[0];
    return declaration?.childForFieldName("type")?.text ?? null;
  }
  return null;
}

function imports(root: Node): readonly TreeSitterImport[] {
  const result: TreeSitterImport[] = [];
  for (const node of root.descendantsOfType("using_directive")) {
    if (node === null) {
      continue;
    }
    const body = node.text
      .replace(/^using\s+/, "")
      .replace(/;$/, "")
      .trim();
    const equals = body.indexOf("=");
    const specifier = equals === -1 ? body : body.slice(equals + 1).trim();
    const name =
      equals === -1 ? (specifier.split(".").pop() ?? specifier) : body.slice(0, equals).trim();
    if (specifier.length > 0) {
      result.push({ name, specifier, node });
    }
  }
  return result;
}

function referenceKindFor(_node: Node, parent: Node | null): ReferenceKind {
  if (parent !== null && parent.type === "invocation_expression") {
    return "call";
  }
  if (parent !== null && parent.type === "object_creation_expression") {
    return "construct";
  }
  return "read";
}

/** C# grammar config for {@link TreeSitterParser}. */
export const CSHARP_CONFIG: TreeSitterLanguageConfig = {
  language: "csharp",
  grammar: "c_sharp",
  kindFor,
  nameFor,
  imports,
  typeKinds: TYPE_KINDS,
  functionKinds: FUNCTION_KINDS,
  visibilityFor,
  exportedFor,
  modifiersFor: (node) =>
    node.children.filter((child) => child?.type === "modifier").map((child) => child!.text),
  documentationFor,
  typeTextFor,
  identifierTypes: ["identifier"],
  referenceKindFor,
};
