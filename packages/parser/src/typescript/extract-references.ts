import type { Reference, ReferenceKind } from "@atlas/core";
import type { FilePath } from "@atlas/shared";
import { Node, SyntaxKind } from "ts-morph";
import type { Identifier, SourceFile as MorphSourceFile } from "ts-morph";
import { locationOf } from "../position";

/**
 * Parent node kinds whose identifier child is a declaration *name*, not a
 * usage. These identifiers are the symbols themselves and are not references.
 */
const DECLARATION_NAME_PARENT_KINDS = new Set<SyntaxKind>([
  SyntaxKind.VariableDeclaration,
  SyntaxKind.Parameter,
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.MethodSignature,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
  SyntaxKind.PropertyDeclaration,
  SyntaxKind.PropertySignature,
  SyntaxKind.ClassDeclaration,
  SyntaxKind.ClassExpression,
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.EnumDeclaration,
  SyntaxKind.EnumMember,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.TypeParameter,
  SyntaxKind.ImportSpecifier,
  SyntaxKind.ImportClause,
  SyntaxKind.NamespaceImport,
  SyntaxKind.ExportSpecifier,
  SyntaxKind.BindingElement,
  SyntaxKind.ModuleDeclaration,
  SyntaxKind.ImportEqualsDeclaration,
  SyntaxKind.LabeledStatement,
]);

/** Whether an identifier sits inside a type annotation or heritage clause. */
function isTypeContext(kind: SyntaxKind): boolean {
  return (
    kind === SyntaxKind.TypeReference ||
    kind === SyntaxKind.ExpressionWithTypeArguments ||
    kind === SyntaxKind.TypeQuery
  );
}

/** Whether `id` is the declared name (not a usage) of its parent node. */
function isDeclarationName(id: Identifier): boolean {
  const parent = id.getParent();
  if (parent === undefined) {
    return false;
  }
  // Object literal keys are property definitions: `{ foo: 1 }`.
  if (Node.isPropertyAssignment(parent)) {
    return parent.getNameNode() === id;
  }
  return DECLARATION_NAME_PARENT_KINDS.has(parent.getKind());
}

/** Classify how an identifier is used in context. */
function referenceKind(id: Identifier): ReferenceKind {
  const parent = id.getParent();
  if (parent === undefined) {
    return "read";
  }

  // `foo.bar` / `foo.bar()`: the base object and the member name are both
  // usages. `foo.bar` is a member access; `foo.bar()` is a method call.
  if (Node.isPropertyAccessExpression(parent)) {
    if (parent.getNameNode() !== id) {
      return "read"; // the base object
    }
    const accessParent = parent.getParent();
    if (Node.isCallExpression(accessParent) && accessParent.getExpression() === parent) {
      return "call";
    }
    return "property";
  }

  if (Node.isElementAccessExpression(parent)) {
    return "read"; // base of `foo["key"]`
  }

  if (Node.isCallExpression(parent) && parent.getExpression() === id) {
    return "call";
  }
  if (Node.isNewExpression(parent) && parent.getExpression() === id) {
    return "construct";
  }
  // `class Foo extends Bar implements Baz`: the heritage identifier's token
  // distinguishes class inheritance from interface implementation.
  if (Node.isExpressionWithTypeArguments(parent)) {
    const heritage = parent.getParent();
    if (Node.isHeritageClause(heritage)) {
      const token = heritage.getToken();
      if (token === SyntaxKind.ExtendsKeyword) {
        return "extends";
      }
      if (token === SyntaxKind.ImplementsKeyword) {
        return "implements";
      }
    }
    return "type";
  }
  if (isTypeContext(parent.getKind())) {
    return "type";
  }
  if (
    Node.isBinaryExpression(parent) &&
    isAssignmentOperator(parent.getOperatorToken().getText())
  ) {
    return "write";
  }
  if (Node.isPrefixUnaryExpression(parent) || Node.isPostfixUnaryExpression(parent)) {
    return "write";
  }
  return "read";
}

/** Assignment operators whose left-hand identifier is written to. */
function isAssignmentOperator(operator: string): boolean {
  return (
    operator === "=" ||
    operator === "+=" ||
    operator === "-=" ||
    operator === "*=" ||
    operator === "/=" ||
    operator === "%=" ||
    operator === "**=" ||
    operator === "<<=" ||
    operator === ">>=" ||
    operator === ">>>=" ||
    operator === "&=" ||
    operator === "|=" ||
    operator === "^=" ||
    operator === "&&=" ||
    operator === "||=" ||
    operator === "??="
  );
}

/**
 * Extract every identifier usage in a source file as a raw {@link Reference}.
 *
 * Targets are left unresolved here; same-file targets are filled in by
 * {@link resolveReferenceTargets}, and cross-file targets by the symbol
 * indexer.
 */
export function extractReferences(sourceFile: MorphSourceFile, filePath: FilePath): Reference[] {
  const references: Reference[] = [];

  for (const id of sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)) {
    // Skip identifiers inside doc comments and declaration names.
    if (id.getFirstAncestor(Node.isJSDoc) !== undefined) {
      continue;
    }
    if (isDeclarationName(id)) {
      continue;
    }
    references.push({
      filePath,
      name: id.getText(),
      kind: referenceKind(id),
      location: locationOf(sourceFile, id),
      targetSymbolId: null,
    });
  }

  return references;
}
