import type { FilePath, Result } from "@atlas/shared";
import type { ContextItem } from "../domain/entities";

/** Ranks and assembles the context to feed to a language model. */
export interface ContextBuilderPort {
  /** Build the most relevant context for `query`. */
  build(query: string, limit?: number): Promise<Result<readonly ContextItem[]>>;

  /** Retrieve the context item for a specific file, if present. */
  sourceFile(path: FilePath): Promise<Result<ContextItem | undefined>>;
}
