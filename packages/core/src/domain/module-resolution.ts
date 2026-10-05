import type { FilePath } from "@prof-bilal/atlas-shared";

/**
 * Resolves a language-specific import specifier to a file in the indexed
 * corpus, or `undefined` when it does not match a known file.
 *
 * Implementations live in `@prof-bilal/atlas-parser` (one per language family) and are
 * injected into the graph and symbol indexer from the SDK composition root, so
 * `@prof-bilal/atlas-graph` stays decoupled from any parser.
 *
 * Resolution is deliberately best-effort and name-based: unresolved specifiers
 * are marked unresolved (and counted), never guessed.
 */
export interface ModuleResolver {
  /** Stable identifier for the language family (e.g. `"typescript"`, `"python"`). */
  readonly id: string;
  /**
   * Resolve `specifier` as written in `fromFile` against the corpus.
   *
   * @param knownFiles - forward-slash normalized path → original {@link FilePath}.
   */
  resolve(
    fromFile: FilePath,
    specifier: string,
    knownFiles: ReadonlyMap<string, FilePath>,
  ): FilePath | undefined;
}
