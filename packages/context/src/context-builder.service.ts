import type {
  ContextBuilderPort,
  ContextDatabasePort,
  ContextItem,
  ContextTaskCategory,
  SearchPort,
  SearchResult,
} from "@atlas/core";
import type { FilePath, Result } from "@atlas/shared";
import { ok } from "@atlas/shared";

/** Options for {@link ContextBuilderService}. */
export interface ContextBuilderServiceOptions {
  /** Ranked project search; defaults to the deterministic lexical scorer. */
  readonly search: SearchPort;
  /** Backing context database used to resolve hit content. */
  readonly db: ContextDatabasePort;
}

/**
 * Deterministic context ranking and assembly behind {@link ContextBuilderPort}.
 *
 * `build` runs a ranked search over the indexed context, resolves each hit to
 * the source file that carries it, and returns the surviving files as ranked
 * `ContextItem`s (source + content + score). `sourceFile` returns one file's
 * content as a single item. No AI is involved — this is the deterministic
 * rank-and-assemble step (ADR-001 "Deterministic Before AI").
 */
export class ContextBuilderService implements ContextBuilderPort {
  private readonly search: SearchPort;
  private readonly db: ContextDatabasePort;

  public constructor(options: ContextBuilderServiceOptions) {
    this.search = options.search;
    this.db = options.db;
  }

  public async build(
    query: string,
    limit?: number,
    taskCategory?: ContextTaskCategory,
  ): Promise<Result<readonly ContextItem[]>> {
    const refreshed = this.search.refresh();
    if (!refreshed.ok) {
      return refreshed;
    }
    let hits = this.search.search(query, {
      ...(limit === undefined ? {} : { limit }),
    });
    if (taskCategory !== undefined) {
      // Rerank over a wider pool so boosted hits outside the original limit
      // can still surface, then cut back to the requested limit.
      const pool = limit === undefined ? undefined : limit * 3;
      const wide = this.search.search(query, {
        ...(pool === undefined ? {} : { limit: pool }),
      });
      hits = rerankByContextTaskCategory(wide, taskCategory).slice(0, limit ?? wide.length);
    }
    return ok(toContextItems(hits, this.db));
  }

  public async sourceFile(path: FilePath): Promise<Result<ContextItem | undefined>> {
    const file = this.db.loadContext().files?.find((candidate) => candidate.path === path);
    if (file === undefined) {
      return ok(undefined);
    }
    return ok({ source: file.path, content: file.content, score: 1 });
  }
}

/** Map search hits to context items, resolving file content from the store. */
function toContextItems(
  hits: readonly SearchResult[],
  db: ContextDatabasePort,
): readonly ContextItem[] {
  const files = db.loadContext().files ?? [];
  const byPath = new Map<string, { readonly content: string }>();
  for (const file of files) {
    byPath.set(file.path, file);
  }

  // One item per source file — a file and a symbol hit for the same file are
  // deduplicated, keeping the highest relevance score.
  const bySource = new Map<FilePath, ContextItem>();
  for (const hit of hits) {
    if (hit.path === null) {
      continue;
    }
    const file = byPath.get(hit.path);
    if (file === undefined) {
      continue;
    }
    const existing = bySource.get(hit.path);
    if (existing !== undefined && existing.score >= hit.score) {
      continue;
    }
    bySource.set(hit.path, {
      source: hit.path,
      content: file.content,
      score: hit.score,
    });
  }
  return [...bySource.values()];
}

/**
 * Category-relevant boost patterns (beta audit Fix 4). Each match multiplies
 * the hit's score by {@link TASK_BOOST_FACTOR}; "understand" gets no boosting.
 */
const TASK_BOOST_PATTERNS: Readonly<Record<ContextTaskCategory, readonly RegExp[]>> = {
  debug: [
    /error|catch|throw|exception|middleware|handler|validation/i,
    /config|auth|permission|role|token|secret|encrypt|hash/i,
  ],
  security: [
    /config|auth|permission|role|token|secret|encrypt|hash/i,
    /validation|sanitize|escape|xss|csrf|cors/i,
  ],
  architecture: [/export|import|module|index|barrel/i, /interface|type|abstract|port|adapter/i],
  understand: [],
};

const TASK_BOOST_FACTOR = 1.5;

/** The multiplicative score boost for a hit text under a task category. */
export function taskCategoryBoost(text: string, category: ContextTaskCategory): number {
  let boost = 1;
  for (const pattern of TASK_BOOST_PATTERNS[category]) {
    if (pattern.test(text)) {
      boost *= TASK_BOOST_FACTOR;
    }
  }
  return boost;
}

/**
 * Re-rank search hits for a task category. A ranking hint, never a filter:
 * every hit survives, only the ordering (and scores) change.
 */
export function rerankByContextTaskCategory(
  hits: readonly SearchResult[],
  category: ContextTaskCategory,
): readonly SearchResult[] {
  if (category === "understand" || hits.length === 0) {
    return hits;
  }
  return hits
    .map((hit) => {
      const boost = taskCategoryBoost(`${hit.path ?? ""} ${hit.title}`, category);
      return boost === 1 ? hit : { ...hit, score: hit.score * boost };
    })
    .sort((a, b) => b.score - a.score);
}
