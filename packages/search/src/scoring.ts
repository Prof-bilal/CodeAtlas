import { fuzzyThreshold, isFuzzyMatch, isTokenMatch, queryTerms, similarity } from "./fuzzy";
import type { DependencyEntry, FileEntry, IndexedEntity, SummaryEntry } from "./search-index";

/** Field-priority ceilings for the lexical scorer (higher = more important). */
const SCORE = {
  EXACT: 100,
  PREFIX: 85,
  TOKEN: 75,
  SUBSTRING: 60,
} as const;

/** Normalize a raw text field for comparison (lowercase + forward slashes). */
function normalize(text: string): string {
  return text.toLowerCase().replaceAll("\\", "/");
}

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

  /**
   * Optional candidate prefilter. When provided, `SearchService` runs the
   * query only over entities for which this predicate returns `true`, then
   * scores those candidates normally.
   *
   * The predicate MUST be a superset of everything {@link score} can return a
   * positive score for (never a false negative), so ranking is unchanged. The
   * lexical scorer's implementation is exactly that: it keeps an entity when
   * any query term is a substring of its precomputed lowercase text (covers
   * exact / prefix / token / substring matches) or, when fuzzy matching is on,
   * when an identifier field's length is within fuzzy tolerance of a term
   * (covers edit-distance matches, since `distance ≥ |len₁ − len₂|`). Scorers
   * without a prefilter score every entity, preserving the old behavior.
   */
  prefilter?(query: string, fuzzy: boolean): (entity: IndexedEntity) => boolean;
}

/**
 * The default, deterministic lexical scorer. Matches identifier fields
 * exactly, by prefix, by whole token, by substring, or (when fuzzy matching is
 * enabled) by typo-tolerant edit distance; long prose fields are matched by
 * substring only. Secondary fields are damped so the primary name/path decides.
 *
 * Entities built by {@link buildIndex} carry precomputed lowercase fields and
 * a concatenated `searchText`, which the scorer reuses to avoid re-lowercasing
 * large fields (file contents, summaries) on every query.
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

  public prefilter(query: string, fuzzy: boolean): (entity: IndexedEntity) => boolean {
    const q = normalize(query.trim());
    const terms = queryTerms(q);
    const needles = terms.length > 0 ? terms : q.length > 0 ? [q] : [];
    const fuzzyTerms = fuzzy
      ? needles.map((needle) => ({
          length: needle.length,
          threshold: fuzzyThreshold(needle.length),
        }))
      : [];

    return (entity: IndexedEntity): boolean => {
      for (const needle of needles) {
        const text = entity.searchText;
        if (text !== undefined ? text.includes(needle) : this.hasText(entity, needle)) {
          return true;
        }
      }
      if (fuzzyTerms.length > 0 && entity.identifierLengths !== undefined) {
        for (const { length, threshold } of fuzzyTerms) {
          for (const fieldLength of entity.identifierLengths) {
            if (Math.abs(fieldLength - length) <= threshold) {
              return true;
            }
          }
        }
      }
      return false;
    };
  }

  /** True when `needle` is a substring of any field of an entity without precomputed text. */
  private hasText(entity: IndexedEntity, needle: string): boolean {
    switch (entity.kind) {
      case "symbol":
        return (
          entity.name.toLowerCase().includes(needle) ||
          entity.filePath.toLowerCase().includes(needle) ||
          (entity.documentation ?? "").toLowerCase().includes(needle)
        );
      case "file":
        return (
          pathBasename(entity.path).toLowerCase().includes(needle) ||
          entity.path.toLowerCase().includes(needle) ||
          entity.content.toLowerCase().includes(needle)
        );
      case "module":
        return (
          entity.name.toLowerCase().includes(needle) || entity.path.toLowerCase().includes(needle)
        );
      case "dependency":
        return (
          entity.fromLabel.toLowerCase().includes(needle) ||
          entity.toLabel.toLowerCase().includes(needle) ||
          entity.relation.toLowerCase().includes(needle)
        );
      case "summary":
        return (
          entity.target.toLowerCase().includes(needle) ||
          entity.overview.toLowerCase().includes(needle) ||
          entity.keyPoints.some((point) => point.toLowerCase().includes(needle))
        );
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
    // Normalize path separators so forward-slash path queries match the
    // platform-native (Windows backslash) paths stored in the index.
    const q = normalize(query.trim());
    const t = normalize(text);
    if (q.length === 0 || t.length === 0) {
      return 0;
    }
    // Multi-term queries (natural-language tasks, word lists) score as the
    // best matching term, so a sentence like "where is authentication
    // implemented" retrieves entities that contain any meaningful term instead
    // of requiring the whole phrase as a substring. Single-term queries keep
    // the exact original semantics (exact → prefix → token → substring →
    // fuzzy), and stopwords are dropped from scoring.
    const terms = queryTerms(q);
    if (terms.length === 0) {
      // No meaningful terms (e.g. a content query like "x * 2" or a bare
      // stopword): fall back to matching the whole normalized query so
      // phrase-style content searches keep working.
      return this.scoreTerm(q, t, fuzzy);
    }
    let best = 0;
    for (const term of terms) {
      const score = this.scoreTerm(term, t, fuzzy);
      if (score > best) {
        best = score;
      }
      if (best === SCORE.EXACT) {
        break;
      }
    }
    return best;
  }

  /** Score one query term against a lowercased text field. */
  private scoreTerm(term: string, text: string, fuzzy: boolean): number {
    if (text === term) {
      return SCORE.EXACT;
    }
    if (text.startsWith(term)) {
      return SCORE.PREFIX;
    }
    if (isTokenMatch(term, text)) {
      return SCORE.TOKEN;
    }
    if (text.includes(term)) {
      return SCORE.SUBSTRING;
    }
    if (fuzzy && isFuzzyMatch(term, text)) {
      return Math.round(40 + similarity(term, text) * 15);
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
