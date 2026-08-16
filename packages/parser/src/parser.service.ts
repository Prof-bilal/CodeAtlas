import type { ParserPort, SourceFile, Symbol } from "@atlas/core";
import type { Result, SymbolId } from "@atlas/shared";
import { DEFAULT_CONCURRENCY, fail, mapWithConcurrency, ok } from "@atlas/shared";
import { UnsupportedLanguageError } from "./errors";
import type { LanguageParser } from "./language-parser";
import type { ParseBatch, ParsedFile, SkippedFile } from "./parsed-file";
import { ParserRegistry } from "./parser-registry";
import { TypeScriptParser } from "./typescript/typescript-parser";

/**
 * Extracts language-agnostic symbols from source code.
 *
 * Implements {@link ParserPort} and composes registered {@link LanguageParser}
 * plugins behind a language-neutral facade. Only the files it is given are
 * parsed — callers pass the *changed* files produced by the scanner/hashing
 * pipeline, so unchanged files are never re-parsed.
 */
export class ParserService implements ParserPort {
  private readonly registry: ParserRegistry;
  private readonly symbolIndex = new Map<SymbolId, Symbol>();

  public constructor(
    registry: ParserRegistry = new ParserRegistry().register(new TypeScriptParser()),
  ) {
    this.registry = registry;
  }

  /**
   * Register an additional {@link LanguageParser} plugin. Existing registrations
   * for the same language are replaced.
   *
   * @returns `this`, so registrations can be chained.
   */
  public registerParser(parser: LanguageParser): this {
    this.registry.register(parser);
    return this;
  }

  /** Every language with a registered parser. */
  public supportedLanguages(): readonly string[] {
    return this.registry.supportedLanguages();
  }

  /**
   * Implements {@link ParserPort}: parse one file and return its flattened
   * symbols. Parsed symbols are indexed so they can be found later via
   * {@link resolveSymbol}.
   */
  public async parse(file: SourceFile): Promise<Result<readonly Symbol[]>> {
    const result = await this.parseFile(file);
    if (!result.ok) {
      return fail(result.error);
    }
    return ok(result.value.symbols);
  }

  /**
   * Parse a single file into its normalized {@link ParsedFile} output.
   *
   * @returns A failure when no parser is registered for the file's language or
   *   when the parser could not process the content.
   */
  public async parseFile(file: SourceFile): Promise<Result<ParsedFile>> {
    const parser = this.registry.get(file.language);
    if (parser === undefined) {
      return fail(new UnsupportedLanguageError(file.language, file.path));
    }
    const result = await parser.parse(file);
    if (result.ok) {
      this.indexSymbols(result.value.symbols);
    }
    return result;
  }

  /**
   * Parse only the supplied (changed) files in one batch. Files without a
   * registered parser, or that fail to parse, are reported in
   * {@link ParseBatch.skipped} instead of failing the whole batch.
   *
   * This is the intended entry point for the scanner → hashing → parser
   * pipeline: pass the `changed`/`added` paths re-read as {@link SourceFile}s.
   */
  public async parseFiles(files: readonly SourceFile[]): Promise<ParseBatch> {
    const parsed: ParsedFile[] = [];
    const skipped: SkippedFile[] = [];

    const results = await mapWithConcurrency(files, DEFAULT_CONCURRENCY, async (file) => {
      const parser = this.registry.get(file.language);
      if (parser === undefined) {
        return {
          ok: false as const,
          path: file.path,
          reason: `no parser registered for language "${file.language}"`,
        };
      }
      const result = await parser.parse(file);
      if (result.ok) {
        return { ok: true as const, path: file.path, value: result.value };
      }
      return { ok: false as const, path: file.path, reason: result.error.message };
    });

    for (const result of results) {
      if (result.ok) {
        this.indexSymbols(result.value.symbols);
        parsed.push(result.value);
      } else {
        skipped.push({ path: result.path, reason: result.reason });
      }
    }

    return { parsed, skipped };
  }

  /**
   * Implements {@link ParserPort}: locate a symbol previously parsed by this
   * service, or `undefined` when it has never been seen.
   */
  public resolveSymbol(id: SymbolId): Result<Symbol | undefined> {
    return ok(this.symbolIndex.get(id));
  }

  private indexSymbols(symbols: readonly Symbol[]): void {
    for (const symbol of symbols) {
      this.symbolIndex.set(symbol.id, symbol);
    }
  }
}
