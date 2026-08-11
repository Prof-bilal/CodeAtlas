import type { Result } from "@atlas/shared";
import type { SearchHitKind, SearchResult } from "./context-db.port";

/** Options for {@link SearchPort.search}. */
export interface SearchRequest {
  /** Maximum number of ranked hits to return (default 20). */
  readonly limit?: number;
  /** Restrict the search to these kinds (default: all five). */
  readonly types?: readonly SearchHitKind[];
  /** Enable typo-tolerant fuzzy matching (default `true`). */
  readonly fuzzy?: boolean;
  /** Drop hits with a score below this threshold (default 0). */
  readonly minScore?: number;
}

/**
 * Ranked, deterministic search over the indexed context.
 *
 * Implemented by `@atlas/search`, which builds an in-memory index from a
 * `ContextSnapshot` (files, symbols, modules, dependencies, summaries) and
 * scores every kind against the query. Ranking is lexical today; an embedding
 * scorer can be plugged in behind the search service's scorer seam without
 * touching this contract.
 */
export interface SearchPort {
  /** Search every enabled kind and return hits ranked by relevance. */
  search(query: string, options?: SearchRequest): readonly SearchResult[];

  /**
   * Rebuild the in-memory index from the configured backing store.
   * `fail` when no store is configured or loading throws.
   */
  refresh(): Result<void>;
}
