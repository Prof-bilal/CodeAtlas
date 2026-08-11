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
