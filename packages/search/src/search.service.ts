import type {
  ContextDatabasePort,
  ContextSnapshot,
  SearchPort,
  SearchRequest,
  SearchResult,
} from "@atlas/core";
import { type FilePath, type Result, fail, ok } from "@atlas/shared";
import { LexicalScorer, type RelevanceScorer } from "./scoring";
import type { IndexedEntity } from "./search-index";
import { buildIndex } from "./search-index";

/** Options for constructing a {@link SearchService}. */
export interface SearchServiceOptions {
  /**
   * Backing context database used by `refresh()` to (re)load the index.
   * Omit to search only snapshots loaded explicitly via `indexSnapshot`.
   */
  readonly db?: ContextDatabasePort;
  /** Relevance scorer; defaults to the deterministic lexical scorer. */
  readonly scorer?: RelevanceScorer;
  /** Maximum hits per search when the caller does not set `limit` (default 20). */
  readonly defaultLimit?: number;
}

/**
 * Ranked project search behind {@link SearchPort}.
 *
 * Builds an in-memory index from a `ContextSnapshot` (files, symbols, modules,
 * dependencies, summaries) and answers queries through its configured scorer.
 * The default lexical scorer offers typo-tolerant fuzzy matching; because
 * ranking flows through {@link RelevanceScorer}, a vector scorer can replace it
 * later with no caller-visible change.
 */
export class SearchService implements SearchPort {
  private readonly db: ContextDatabasePort | undefined;
  private readonly scorer: RelevanceScorer;
  private readonly defaultLimit: number;
  private entities: readonly IndexedEntity[] = [];

  public constructor(options: SearchServiceOptions = {}) {
    this.db = options.db;
    this.scorer = options.scorer ?? new LexicalScorer();
    this.defaultLimit = options.defaultLimit ?? 20;
  }

  /** Rebuild the index from the configured backing store. */
  public refresh(): Result<void> {
    if (this.db === undefined) {
      return fail(
        new Error("SearchService has no backing store; pass a `db` or call `indexSnapshot`."),
      );
    }
    return this.indexSnapshot(this.db.loadContext());
  }

  /** Rebuild the index directly from a context snapshot. */
  public indexSnapshot(snapshot: ContextSnapshot): Result<void> {
    try {
      this.entities = buildIndex(snapshot);
      return ok(undefined);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Number of entities currently indexed. */
  public get size(): number {
    return this.entities.length;
  }

  public search(query: string, options: SearchRequest = {}): readonly SearchResult[] {
    if (query.trim().length === 0) {
      return [];
    }
    const limit = options.limit ?? this.defaultLimit;
    const minScore = options.minScore ?? 0;
    const fuzzy = options.fuzzy ?? true;
    const types = options.types;

    const ranked: Array<{ hit: SearchResult; score: number; entity: IndexedEntity }> = [];
    const prefilter = this.scorer.prefilter?.(query, fuzzy);
    for (const entity of this.entities) {
      if (types !== undefined && !types.includes(entity.kind)) {
        continue;
      }
      // Skip entities that cannot match before invoking the (potentially
      // expensive, fuzzy-aware) scorer. The prefilter is a superset of the
      // scorer's matches, so ranking is unchanged.
      if (prefilter !== undefined && !prefilter(entity)) {
        continue;
      }
      const score = this.scorer.score(query, entity, fuzzy);
      if (score <= 0 || score < minScore) {
        continue;
      }
      ranked.push({ hit: toResult(entity, score), score, entity });
    }
    ranked.sort(compareRanked);
    return ranked.slice(0, limit).map(({ hit }) => hit);
  }
}

// ── ranking ─────────────────────────────────────────────────────────────────

/**
 * Symbol kinds that declare a definition. Used as a stable tiebreak so that,
 * at equal score, a definition outranks an import/re-export reference of the
 * same name (which would otherwise surface in arbitrary DB index order).
 */
const DEFINITION_KINDS = new Set([
  "class",
  "interface",
  "function",
  "method",
  "constructor",
  "property",
  "variable",
  "constant",
  "enum",
  "enum-member",
  "type-alias",
]);

function compareRanked(
  left: { score: number; entity: IndexedEntity },
  right: { score: number; entity: IndexedEntity },
): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  return definitionPreference(right.entity) - definitionPreference(left.entity);
}

function definitionPreference(entity: IndexedEntity): number {
  if (entity.kind === "symbol" && DEFINITION_KINDS.has(entity.symbolKind)) {
    return 1;
  }
  return 0;
}

// ── result mapping ──────────────────────────────────────────────────────────

/** Convert an indexed entity into the public {@link SearchResult} shape. */
function toResult(entity: IndexedEntity, score: number): SearchResult {
  switch (entity.kind) {
    case "file":
      return {
        kind: "file",
        title: entity.path,
        path: entity.path as FilePath,
        targetId: entity.path,
        score,
      };
    case "symbol":
      return {
        kind: "symbol",
        title: entity.name,
        path: entity.filePath as FilePath,
        targetId: `symbol:${entity.id}`,
        score,
      };
    case "module":
      return {
        kind: "module",
        title: entity.name,
        path: entity.path as FilePath,
        targetId: `module:${entity.path}`,
        score,
      };
    case "dependency":
      return {
        kind: "dependency",
        title: `${entity.fromLabel} → ${entity.toLabel}`,
        path: null,
        targetId: `dependency:${entity.from}::${entity.relation}::${entity.to}`,
        relation: entity.relation,
        score,
      };
    case "summary": {
      const snippet = makeSnippet(entity.overview);
      return {
        kind: "summary",
        title: entity.target,
        path: entity.target as FilePath,
        targetId: `summary:${entity.summaryKind}:${entity.target}`,
        ...(snippet !== undefined ? { snippet } : {}),
        score,
      };
    }
  }
}

/** A ~120-character excerpt of long prose (summary overviews). */
function makeSnippet(text: string, maxLength = 140): string | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}
