import type { SymbolId } from "@atlas/shared";

/**
 * Returned as a failed {@link Result} when no {@link LanguageParser} is
 * registered for a file's language.
 */
export class UnsupportedLanguageError extends Error {
  /** The language for which no parser is registered. */
  public readonly language: string;
  /** Path of the file that could not be parsed. */
  public readonly path: string;

  public constructor(language: string, path: string) {
    super(`No parser is registered for language "${language}" (file: ${path})`);
    this.name = "UnsupportedLanguageError";
    this.language = language;
    this.path = path;
  }
}

/**
 * Thrown by the symbol indexer when an internal invariant is violated: a
 * symbol that must exist (per the index's own bookkeeping) is missing.
 * Signals an index corruption bug rather than a user-input problem.
 */
export class SymbolNotIndexedError extends Error {
  /** The symbol id that was expected to be present in the index. */
  public readonly id: SymbolId;

  public constructor(id: SymbolId) {
    super(`Symbol not in index: ${id}`);
    this.name = "SymbolNotIndexedError";
    this.id = id;
  }
}
