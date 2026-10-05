import type { ReferenceKind, SymbolKind, Visibility } from "@prof-bilal/atlas-core";
import type { Node } from "web-tree-sitter";
import {
  type TreeSitterImport,
  type TreeSitterLanguageConfig,
  type TreeSitterScope,
  collectDescendants,
  fieldName,
} from "../language-config";

const TYPE_KINDS: readonly SymbolKind[] = ["class", "interface", "enum"];
const FUNCTION_KINDS: readonly SymbolKind[] = ["method", "constructor"];

function modifiersNode(node: Node): Node | null {
  return node.children.find((child) => child?.type === "modifiers") ?? null;
}

function hasModifier(node: Node, name: string): boolean {
  const modifiers = modifiersNode(node);
  return modifiers !== null && new RegExp(`\\b${name}\\b`).test(modifiers.text);
}

function fieldNameOf(node: Node): string | null {
  const declarators = collectDescendants(node, new Set(["variable_declarator"]));
  const first = declarators[0];
  return first?.childForFieldName("name")?.text ?? null;
}

function nameFor(node: Node): string | null {
  switch (node.type) {
    case "class_declaration":
    case "interface_declaration":
    case "annotation_type_declaration":
    case "enum_declaration":
    case "method_declaration":
    case "constructor_declaration":
    case "enum_constant":
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
      return "class";
    case "interface_declaration":
    case "annotation_type_declaration":
      return "interface";
    case "enum_declaration":
      return "enum";
    case "enum_constant":
      return "enum-member";
    case "method_declaration":
      return "method";
    case "constructor_declaration":
      return "constructor";
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
  if (scope !== "module") {
    return false;
  }
  return !hasModifier(node, "private") && !hasModifier(node, "protected");
}

function documentationFor(node: Node): string | null {
  const previous = node.previousNamedSibling;
  if (previous === null || previous.type !== "block_comment") {
    return null;
  }
  return previous.text
    .replace(/^\/\*\*?/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*?\s?/, "").trimEnd())
    .join("\n")
    .trim();
}

function typeTextFor(node: Node): string | null {
  if (node.type === "field_declaration" || node.type === "method_declaration") {
    return node.childForFieldName("type")?.text ?? null;
  }
  return null;
}

function imports(root: Node): readonly TreeSitterImport[] {
  const result: TreeSitterImport[] = [];
  for (const node of root.namedChildren) {
    if (node === null || node.type !== "import_declaration") {
      continue;
    }
    const path = node.descendantsOfType(["scoped_identifier", "identifier"])[0];
    if (path === null || path === undefined) {
      continue;
    }
    const specifier = node.text
      .replace(/^import\s+(static\s+)?/, "")
      .replace(/;$/, "")
      .trim();
    const name = specifier.split(".").pop() ?? specifier;
    result.push({ name, specifier, node });
  }
  return result;
}

function referenceKindFor(node: Node, parent: Node | null): ReferenceKind {
  if (parent !== null && parent.type === "method_invocation") {
    return "call";
  }
  if (parent !== null && parent.type === "object_creation_expression") {
    return "construct";
  }
  if (node.type === "type_identifier") {
    return "type";
  }
  return "read";
}

/** Java grammar config for {@link TreeSitterParser}. */
export const JAVA_CONFIG: TreeSitterLanguageConfig = {
  language: "java",
  grammar: "java",
  kindFor,
  nameFor,
  imports,
  typeKinds: TYPE_KINDS,
  functionKinds: FUNCTION_KINDS,
  visibilityFor,
  exportedFor,
  modifiersFor: (node) => {
    const modifiers = modifiersNode(node);
    return modifiers === null ? [] : modifiers.text.split(/\s+/).filter(Boolean);
  },
  documentationFor,
  typeTextFor,
  identifierTypes: ["identifier", "type_identifier"],
  referenceKindFor,
};
