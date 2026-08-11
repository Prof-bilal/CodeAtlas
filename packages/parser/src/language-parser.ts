import type { SourceFile } from "@atlas/core";
import type { Result } from "@atlas/shared";
import type { ParsedFile } from "./parsed-file";

/**
 * A parser plugin for one or more programming languages.
 *
 * This is the extension seam for adding languages. Implement it and register
 * the instance with a {@link ParserRegistry} (or {@link ParserService}).
 * Downstream code only ever sees the normalized {@link ParsedFile} /
 * {@link Symbol} output, so no consumer needs to know the source language.
 */
export interface LanguageParser {
  /** Languages handled by this parser, e.g. `["typescript"]`. */
  readonly languages: readonly string[];

  /** Parse a source file into its normalized symbols. */
  parse(file: SourceFile): Promise<Result<ParsedFile>>;
}
