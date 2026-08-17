import type { SourceFile } from "@atlas/core";
import type { Result } from "@atlas/shared";
import { fail, ok } from "@atlas/shared";
import { Project } from "ts-morph";
import type { LanguageParser } from "../language-parser";
import type { ParsedFile } from "../parsed-file";
import { resolveReferenceTargets } from "../references";
import { extractReferences } from "./extract-references";
import { extractSymbols } from "./extractors";

/** Default line cap above which a file's reference graph is skipped. */
const DEFAULT_MAX_REFERENCE_LINES = 20_000;

export interface TypeScriptParserOptions {
  /**
   * Files with more than this many lines keep their extracted symbols but
   * skip the (expensive) identifier-walk + reference resolution pass.
   * Huge generated/monolith files are rare; degrading gracefully — symbols
   * only, no reference graph — beats spending minutes and gigabytes on a
   * single file. Defaults to {@link DEFAULT_MAX_REFERENCE_LINES}.
   */
  readonly maxReferenceLines?: number;
}

/**
 * Parses TypeScript source with `ts-morph` into the normalized
 * {@link ParsedFile} representation.
 *
 * TypeScript is the first supported language. Additional languages are added
 * by implementing {@link LanguageParser} and registering the implementation
 * with a {@link ParserRegistry} — no changes are needed here.
 *
 * Performance: the ts-morph {@link Project} is created once and reused for
 * every file (parsing in-memory with no tsconfig/lib loading), and each parsed
 * {@link SourceFile} is removed from the project afterwards so the AST does not
 * accumulate across a large corpus. This avoids constructing a new compiler
 * host per file, which dominates parse time at repository scale. Files above
 * `maxReferenceLines` skip reference extraction entirely (see
 * {@link TypeScriptParserOptions}) so a single huge file cannot balloon CPU or
 * memory — symbols are still indexed.
 *
 * Memory: only references that **resolved to a symbol in the same file** are
 * kept on the parsed output. Unresolved identifier usages were never consumed
 * by the dependency graph (they carry no target) and were never persisted, but
 * at repository scale they dominated peak memory (every identifier usage became
 * a retained object). Dropping them keeps the build's peak memory proportional
 * to the symbol + resolved-edge count instead of the raw identifier count.
 */
export class TypeScriptParser implements LanguageParser {
  public readonly languages = ["typescript"] as const;

  private readonly maxReferenceLines: number;
  private project: Project | undefined;

  public constructor(options: TypeScriptParserOptions = {}) {
    this.maxReferenceLines = options.maxReferenceLines ?? DEFAULT_MAX_REFERENCE_LINES;
  }

  public async parse(file: SourceFile): Promise<Result<ParsedFile>> {
    if (file.language !== "typescript") {
      return fail(new Error(`TypeScriptParser received unsupported language: ${file.language}`));
    }

    try {
      // Parse in-memory: no tsconfig, lib files, or file-system access is
      // needed because only the AST structure is extracted, not type-checked.
      const project = (this.project ??= new Project({
        useInMemoryFileSystem: true,
        skipFileDependencyResolution: true,
        skipLoadingLibFiles: true,
        compilerOptions: {
          allowJs: false,
          noResolve: true,
          strict: false,
        },
      }));
      const sourceFile = project.createSourceFile(file.path, file.content, {
        overwrite: true,
      });
      const symbols = extractSymbols(sourceFile, file.path);
      const references =
        countLines(file.content) > this.maxReferenceLines
          ? []
          : resolveReferenceTargets(extractReferences(sourceFile, file.path), symbols).filter(
              (reference) => reference.targetSymbolId !== null,
            );
      // Free the AST so a large corpus does not retain every parsed file.
      project.removeSourceFile(sourceFile);
      return ok({ path: file.path, language: file.language, symbols, references });
    } catch (error) {
      return fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/** Count newlines in a content string (avoids splitting a huge string). */
function countLines(content: string): number {
  let lines = 1;
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10 /* \n */) {
      lines += 1;
    }
  }
  return lines;
}
