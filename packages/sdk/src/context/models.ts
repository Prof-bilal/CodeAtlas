import type { PersistedModule, SearchResult, Summary, Symbol } from "@atlas/core";
import type { FilePath, SymbolId } from "@atlas/shared";

/**
 * Normalized, serializable context models for the CodeAtlas Context SDK.
 *
 * These are the stable, consumer-facing shapes. Where a normalized domain
 * entity already exists in `@atlas/core` (`Symbol`, `Summary`, `SearchResult`,
 * `PersistedModule`) it is reused as-is; the SDK adds only the aggregates it
 * needs on top of the persisted snapshot. Raw SQLite rows are never exposed.
 */

/** A file in the index, without its content (cheap to enumerate). */
export interface FileContext {
  readonly path: FilePath;
  readonly language: string;
  /** Byte length of the indexed content. */
  readonly size: number;
  /** The stored file summary, when one exists. */
  readonly summary?: Summary;
}

/** A file including its indexed content (used by `getFile`). */
export interface FileContentContext extends FileContext {
  readonly content: string;
}

/** A normalized symbol (reuses the core {@link Symbol} entity). */
export type SymbolContext = Symbol;

/** A normalized dependency edge with human-readable endpoints. */
export interface DependencyContext {
  readonly from: string;
  readonly to: string;
  readonly kind: string;
  readonly fromLabel: string;
  readonly toLabel: string;
}

/** A normalized module (reuses the core {@link PersistedModule} type). */
export type ModuleContext = PersistedModule;

/** A normalized summary (reuses the core {@link Summary} entity). */
export type SummaryContext = Summary;

/** A normalized search hit (reuses the core {@link SearchResult} type). */
export type SearchResultContext = SearchResult;

/** Aggregate counts of the indexed entities. */
export interface ProjectCounts {
  readonly files: number;
  readonly symbols: number;
  readonly modules: number;
  readonly dependencies: number;
  readonly summaries: number;
}

/** A human-readable overview of the whole indexed project. */
export interface ProjectOverview {
  readonly repositoryPath: string;
  readonly savedAt: string;
  readonly schemaVersion: number;
  readonly languages: Readonly<Record<string, number>>;
  readonly counts: ProjectCounts;
  /** The stored project summary, when one exists. */
  readonly summary?: Summary;
  /** Included when the overview is requested with `detail: "full"`. */
  readonly modules?: readonly ModuleContext[];
  /** Included when the overview is requested with `detail: "full"`. */
  readonly topFiles?: readonly FileContext[];
  /** Included when the overview is requested with `detail: "full"`. */
  readonly topSymbols?: readonly SymbolContext[];
}

/** Metadata that lets an AI agent decide whether its context is stale. */
export interface ContextStatus {
  readonly repositoryPath: string;
  readonly dbPath: string;
  readonly schemaVersion: number;
  /** ISO timestamp of the last write, or `""` when the store was never written. */
  readonly lastUpdated: string;
  /** True when an index exists for the SDK's database file. */
  readonly available: boolean;
  readonly filesIndexed: number;
  readonly symbolsIndexed: number;
  readonly modulesIndexed: number;
  readonly dependenciesIndexed: number;
  readonly summariesIndexed: number;
}

/** The deterministic relevant-context assembly for a query. */
export interface RelevantContext {
  readonly query: string;
  readonly files: readonly FileContext[];
  readonly symbols: readonly SymbolContext[];
  readonly dependencies: readonly DependencyContext[];
  readonly modules: readonly ModuleContext[];
  readonly summaries: readonly SummaryContext[];
  readonly overview: ProjectOverview;
}

/** A symbol reference: the referencing symbol plus the edge that links it. */
export interface SymbolReference {
  /** The symbol that references `target`. */
  readonly symbol: SymbolContext;
  /** The graph edge kind (e.g. `"calls"`, `"imports"`). */
  readonly kind: string;
  /** The id of the referenced (target) symbol. */
  readonly targetId: SymbolId;
}

/** Which dependency edges to return for a {@link DependencyQuery}. */
export type DependencyDirection = "outgoing" | "incoming" | "both";

/** Filters for {@link DependencyContextAPI.query}. */
export interface DependencyQuery {
  /** A file path, symbol id, symbol name, or raw `n:…` node id. */
  readonly node?: string;
  /** Only edges of this kind (e.g. `"imports"`, `"calls"`). */
  readonly relation?: string;
  /** Which edges to return for `node` (default `"both"`). */
  readonly direction?: DependencyDirection;
  /** Maximum number of edges to return (default: all). */
  readonly limit?: number;
}

/** The result of a {@link DependencyQuery}. */
export interface DependencyQueryResult {
  readonly edges: readonly DependencyContext[];
  /** False when a `node` was supplied but nothing in the index matches it. */
  readonly nodeFound: boolean;
  /** Total dependency edges in the graph (before filtering). */
  readonly total: number;
}

/** A human-readable explanation of a module/folder. */
export interface ModuleExplanation {
  readonly path: string;
  /** The persisted module record, or `null` when it is not indexed. */
  readonly module: PersistedModule | null;
  readonly fileCount: number;
  readonly files: readonly FileContext[];
  readonly symbolCount: number;
  readonly symbols: readonly SymbolContext[];
  readonly dependencyCount: number;
  readonly dependencies: readonly DependencyContext[];
  /** The stored module summary, or `null`. */
  readonly summary: Summary | null;
}

/** The level of detail for {@link ProjectContextAPI.overview}. */
export type ProjectOverviewDetail = "summary" | "full";
