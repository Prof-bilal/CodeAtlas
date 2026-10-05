import type { SourceFile } from "@prof-bilal/atlas-core";
import type { Result } from "@prof-bilal/atlas-shared";
import { fail, ok } from "@prof-bilal/atlas-shared";
import type { Parser } from "web-tree-sitter";
import type { LanguageParser } from "../language-parser";
import type { ParsedFile } from "../parsed-file";
import { resolveReferenceTargets } from "../references";
import { createGrammarParser } from "./grammars";
import type { TreeSitterLanguageConfig } from "./language-config";
import { extractTreeSitterReferences } from "./references";
import { extractTreeSitterSymbols } from "./symbols";

/**
 * A {@link LanguageParser} backed by a tree-sitter WASM grammar.
 *
 * One generic implementation drives every language: the grammar's declaration
 * and usage shapes are described by a {@link TreeSitterLanguageConfig}. The
 * grammar is loaded lazily and cached; when it is unavailable the file is
 * reported as a parse failure (surfaced as `skipped`, never a crash).
 */
export class TreeSitterParser implements LanguageParser {
  public readonly languages: readonly string[];
  private parserPromise: Promise<Parser | undefined> | undefined;

  public constructor(private readonly config: TreeSitterLanguageConfig) {
    this.languages = [config.language];
  }

  public async parse(file: SourceFile): Promise<Result<ParsedFile>> {
    if (file.language !== this.config.language) {
      return fail(
        new Error(`TreeSitterParser(${this.config.language}) received "${file.language}"`),
      );
    }
    const parser = await this.parser();
    if (parser === undefined) {
      return fail(new Error(`tree-sitter grammar unavailable for "${this.config.language}"`));
    }
    try {
      const tree = parser.parse(file.content);
      if (tree === null) {
        return fail(new Error(`tree-sitter failed to parse ${file.path}`));
      }
      try {
        const root = tree.rootNode;
        const { symbols, nameNodeIds, importNodeIds } = extractTreeSitterSymbols(
          root,
          file.path,
          this.config,
        );
        const references = resolveReferenceTargets(
          extractTreeSitterReferences(root, file.path, this.config, nameNodeIds, importNodeIds),
          symbols,
        ).filter((reference) => reference.targetSymbolId !== null);
        return ok({ path: file.path, language: file.language, symbols, references });
      } finally {
        tree.delete();
      }
    } catch (error) {
      return fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private parser(): Promise<Parser | undefined> {
    this.parserPromise ??= createGrammarParser(this.config.grammar);
    return this.parserPromise;
  }
}
