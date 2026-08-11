import type { FilePath, NodeId, SymbolId } from "@atlas/shared";
import type { SourceFile, Symbol } from "../domain/entities";
import type { Summary } from "./summary.port";

/** The kinds of entity `searchContext` can match. */
export type ContextSearchKind = "file" | "symbol" | "summary" | "module";

/**
 * Every kind the search pipeline can return. Extends the database's own match
 * kinds with `"dependency"`, which the `@atlas/search` service resolves from the
 * context snapshot rather than from `searchContext` (the DB port keeps
 * `ContextSearchKind` as its narrower contract).
 */
export type SearchHitKind = ContextSearchKind | "dependency";

/** A persisted code-dependency edge (opaque node ids supplied by the caller). */
export interface PersistedDependency {
  readonly from: NodeId;
  readonly to: NodeId;
  readonly kind: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** A persisted generic entity link. */
export interface PersistedRelationship {
  readonly type: string;
  readonly sourceId: NodeId;
  readonly targetId: NodeId;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** A persisted module (package/folder) record. */
export interface PersistedModule {
  readonly path: string;
  readonly name: string;
  readonly moduleType: string;
}

/** The entities a {@link ContextDatabasePort} can persist. Absent fields are
 * treated as empty for `saveContext` and as "no change" for `updateContext`. */
export interface ContextData {
  readonly files?: readonly SourceFile[];
  readonly symbols?: readonly Symbol[];
  readonly dependencies?: readonly PersistedDependency[];
  readonly modules?: readonly PersistedModule[];
  readonly summaries?: readonly Summary[];
  readonly relationships?: readonly PersistedRelationship[];
  readonly hashes?: Readonly<Record<string, string>>;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** Everything currently stored, plus snapshot bookkeeping. */
export interface ContextSnapshot extends ContextData {
  readonly version: number;
  readonly savedAt: string;
}

/** What `deleteContext` should remove. */
export type ContextDeleteTarget =
  | { readonly kind: "all" }
  | { readonly kind: "file"; readonly path: FilePath }
  | { readonly kind: "symbol"; readonly symbolId: SymbolId };

/** Options for {@link ContextDatabasePort.searchContext}. */
export interface SearchOptions {
  readonly limit?: number;
  /** Restrict matches to these kinds. */
  readonly types?: readonly ContextSearchKind[];
}

/** A single search match (`searchContext` or the `@atlas/search` service). */
export interface SearchResult {
  readonly kind: SearchHitKind;
  readonly title: string;
  readonly path: FilePath | null;
  /** The stored id of the match (file path, symbol id, `module:path`, …). */
  readonly targetId: string | null;
  /** For dependency hits: the relationship kind (e.g. `"imports"`, `"calls"`). */
  readonly relation?: string;
  /** A short contextual excerpt; present only when the match text is available. */
  readonly snippet?: string;
  /** Relevance heuristic: higher is better. */
  readonly score: number;
}

/**
 * Synchronous SQLite-backed persistence for a project context, exposed so
 * callers can save, load, update, delete, and search all indexed data.
 *
 * Deliberately synchronous: the underlying driver is `node:sqlite`'s
 * `DatabaseSync`, and reads are optimized for speed. Wrappers that need async
 * `Result` shapes re-emit these methods (see `@atlas/storage`'s
 * `StorageService`). No AI logic lives here.
 */
export interface ContextDatabasePort {
  /** Full replace: persists all provided entities, removing what is absent. */
  saveContext(data: ContextData): number;
  /** Merge: upserts only the provided entities, keeping the rest. */
  updateContext(data: ContextData): number;
  /** Remove targeted entities (files/symbols cascade and clean up dependents). */
  deleteContext(target: ContextDeleteTarget): number;
  /** Read back the whole stored context. */
  loadContext(): ContextSnapshot;
  /** Search files, symbols, summaries, and modules by query text. */
  searchContext(query: string, options?: SearchOptions): readonly SearchResult[];
  /** Close the underlying database. */
  close(): void;
}
