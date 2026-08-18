import type { SymbolLocation } from "@atlas/core";
import { Node } from "ts-morph";
import type { Node as MorphNode, SourceFile as MorphSourceFile } from "ts-morph";

/**
 * Compute a 1-based source span for a node. `startColumn` is inclusive and
 * `endColumn` is exclusive (one past the last character), matching TypeScript
 * AST position semantics.
 */
export function locationOf(sourceFile: MorphSourceFile, node: MorphNode): SymbolLocation {
  const compiler = sourceFile.compilerNode;
  // getStart(compiler, false) returns the first token position, excluding
  // leading trivia and JSDoc comments.
  const start = compiler.getLineAndCharacterOfPosition(node.compilerNode.getStart(compiler, false));
  const end = compiler.getLineAndCharacterOfPosition(node.getEnd());
  return {
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
}

/**
 * The documentation comment (e.g. JSDoc) attached to a node, or `null` when
 * the node has no doc comment or cannot carry one.
 */
export function documentationOf(node: MorphNode): string | null {
  if (!Node.isJSDocable(node)) {
    return null;
  }
  const parts = node
    .getJsDocs()
    .map((doc) => doc.getComment())
    .filter(
      (comment): comment is string => typeof comment === "string" && comment.trim().length > 0,
    );
  return parts.length > 0 ? parts.join("\n\n") : null;
}
