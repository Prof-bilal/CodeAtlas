import type { LanguageParser } from "./language-parser";

/**
 * Maps languages to the {@link LanguageParser} that handles them.
 *
 * The registry is the plugin container for parsers: adding a new language is a
 * matter of registering an implementation here — no other code changes.
 */
export class ParserRegistry {
  private readonly parsers = new Map<string, LanguageParser>();

  /**
   * Register a parser for each language it claims. A parser registered for an
   * already-registered language replaces the previous one.
   *
   * @returns `this`, so registrations can be chained.
   */
  public register(parser: LanguageParser): this {
    for (const language of parser.languages) {
      this.parsers.set(language, parser);
    }
    return this;
  }

  /** The parser registered for `language`, or `undefined`. */
  public get(language: string): LanguageParser | undefined {
    return this.parsers.get(language);
  }

  /** Every language with a registered parser. */
  public supportedLanguages(): readonly string[] {
    return [...this.parsers.keys()];
  }
}
