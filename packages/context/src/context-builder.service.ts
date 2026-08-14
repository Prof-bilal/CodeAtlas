import type {
  ContextBuilderPort,
  ContextDatabasePort,
  ContextItem,
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

  public async build(query: string, limit?: number): Promise<Result<readonly ContextItem[]>> {
    const refreshed = this.search.refresh();
    if (!refreshed.ok) {
      return refreshed;
    }
    const hits = this.search.search(query, {
      ...(limit === undefined ? {} : { limit }),
    });
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
    bySource.set(hit.path, { source: hit.path, content: file.content, score: hit.score });
  }
  return [...bySource.values()];
}
