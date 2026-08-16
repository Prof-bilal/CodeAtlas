import type { SourceFile } from "@atlas/core";
import type { Result } from "@atlas/shared";
import { fail, ok } from "@atlas/shared";
import { Project } from "ts-morph";
import type { LanguageParser } from "../language-parser";
import type { ParsedFile } from "../parsed-file";
import { resolveReferenceTargets } from "../references";
import { extractReferences } from "./extract-references";
import { extractSymbols } from "./extractors";

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
 * host per file, which dominates parse time at repository scale.
 */
export class TypeScriptParser implements LanguageParser {
  public readonly languages = ["typescript"] as const;

  private project: Project | undefined;

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
      const references = resolveReferenceTargets(extractReferences(sourceFile, file.path), symbols);
      // Free the AST so a large corpus does not retain every parsed file.
      project.removeSourceFile(sourceFile);
      return ok({ path: file.path, language: file.language, symbols, references });
    } catch (error) {
      return fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
