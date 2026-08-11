import { isFuzzyMatch, isTokenMatch, similarity } from "./fuzzy";
import type { DependencyEntry, FileEntry, IndexedEntity, SummaryEntry } from "./search-index";

/** Field-priority ceilings for the lexical scorer (higher = more important). */
const SCORE = {
  EXACT: 100,
  PREFIX: 85,
  TOKEN: 75,
  SUBSTRING: 60,
} as const;

/**
 * The relevance seam of the search module.
 *
 * `SearchService` scores every indexed entity through this interface, so
 * ranking can evolve without touching callers: an embedding-based scorer
 * (vector search) can implement the same contract and be swapped in later,
 * while the deterministic lexical scorer remains the default.
 */
export interface RelevanceScorer {
  /**
   * Return a relevance score for `entity` against `query`, or `0` when the
   * entity does not match. Higher is better; scores are comparable across
   * entities because the interface is scoped to one query at a time.
   */
  score(query: string, entity: IndexedEntity, fuzzy: boolean): number;
}

/**
 * The default, deterministic lexical scorer. Matches identifier fields
 * exactly, by prefix, by whole token, by substring, or (when fuzzy matching is
 * enabled) by typo-tolerant edit distance; long prose fields are matched by
 * substring only. Secondary fields are damped so the primary name/path decides.
 */
export class LexicalScorer implements RelevanceScorer {
  public score(query: string, entity: IndexedEntity, fuzzy: boolean): number {
    switch (entity.kind) {
      case "symbol":
        return this.scoreSymbol(query, entity, fuzzy);
      case "file":
        return this.scoreFile(query, entity, fuzzy);
      case "module":
        return Math.max(
          this.scoreField(query, entity.name, fuzzy),
          this.scoreField(query, entity.path, fuzzy),
        );
      case "dependency":
        return this.scoreDependency(query, entity, fuzzy);
      case "summary":
        return this.scoreSummary(query, entity, fuzzy);
    }
  }

  private scoreSymbol(
    query: string,
    entity: Extract<IndexedEntity, { kind: "symbol" }>,
    fuzzy: boolean,
  ): number {
    const name = this.scoreField(query, entity.name, fuzzy);
    const documentation = entity.documentation
      ? this.scoreField(query, entity.documentation, false) * 0.6
      : 0;
    const filePath = this.scoreField(query, entity.filePath, false) * 0.5;
    return Math.max(name, documentation, filePath);
  }

  private scoreFile(query: string, entity: FileEntry, fuzzy: boolean): number {
    const basename = pathBasename(entity.path);
    const name = this.scoreField(query, basename, fuzzy);
    const path = this.scoreField(query, entity.path, fuzzy) * 0.9;
    const content =
      entity.content.length > 0 ? this.scoreField(query, entity.content, false) * 0.4 : 0;
    return Math.max(name, path, content);
  }

  private scoreDependency(query: string, entity: DependencyEntry, fuzzy: boolean): number {
    const from = this.scoreField(query, entity.fromLabel, fuzzy);
    const to = this.scoreField(query, entity.toLabel, fuzzy);
    const relation = this.scoreField(query, entity.relation, false) * 0.5;
    return Math.max(from, to, relation);
  }

  private scoreSummary(query: string, entity: SummaryEntry, fuzzy: boolean): number {
    const target = this.scoreField(query, entity.target, fuzzy);
    const overview = this.scoreField(query, entity.overview, false) * 0.7;
    let bestPoint = 0;
    for (const point of entity.keyPoints) {
      bestPoint = Math.max(bestPoint, this.scoreField(query, point, false) * 0.7);
    }
    return Math.max(target, overview, bestPoint);
  }

  /** Score one text field against the query; `0` when there is no match. */
  private scoreField(query: string, text: string, fuzzy: boolean): number {
    const q = query.trim().toLowerCase();
    const t = text.toLowerCase();
    if (q.length === 0 || t.length === 0) {
      return 0;
    }
    if (t === q) {
      return SCORE.EXACT;
    }
    if (t.startsWith(q)) {
      return SCORE.PREFIX;
    }
    if (isTokenMatch(q, t)) {
      return SCORE.TOKEN;
    }
    if (t.includes(q)) {
      return SCORE.SUBSTRING;
    }
    if (fuzzy && isFuzzyMatch(q, t)) {
      return Math.round(40 + similarity(q, t) * 15);
    }
    return 0;
  }
}

/** The final path segment of a path, split on either separator. */
function pathBasename(path: string): string {
  const separator = path.includes("\\") ? "\\" : "/";
  const segments = path.split(separator);
  return segments[segments.length - 1] ?? path;
}
