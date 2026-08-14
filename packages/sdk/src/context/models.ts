import type {
  PersistedModule,
  Symbol as PersistedSymbol,
  SearchResult,
  Summary,
} from "@atlas/core";
import type { FilePath, SymbolId } from "@atlas/shared";

/**
 * Normalized, serializable context models for the CodeAtlas Context SDK.
 *
 * These are the stable, consumer-facing shapes. Where a normalized domain
 * entity already exists in `@atlas/core` (`PersistedSymbol`, `Summary`, `SearchResult`,
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

/** A normalized symbol (reuses the core {@link PersistedSymbol} entity). */
export type SymbolContext = PersistedSymbol;

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

/**
 * Freshness state of the index relative to the working tree.
 *
 * - `"fresh"` â€” every persisted file still matches its on-disk hash,
 * - `"stale"` â€” at least one persisted file changed on disk (or was added/deleted),
 * - `"unknown"` â€” no persisted hashes or the files cannot be compared,
 * - `"unavailable"` â€” no context index exists.
 */
export type FreshnessState = "fresh" | "stale" | "unknown" | "unavailable";

/** Result of comparing the persisted hashes against the current working tree. */
export interface FreshnessSignal {
  readonly state: FreshnessState;
  /** Whether a context index exists at all. */
  readonly available: boolean;
  /** ISO timestamp of the last index write (`""` when unavailable). */
  readonly lastUpdated: string;
  /** Files whose on-disk content differs from the persisted hash. */
  readonly changed: readonly string[];
  /** Files on disk that are not in the persisted hashes. */
  readonly added: readonly string[];
  /** Persisted files that are no longer on disk. */
  readonly deleted: readonly string[];
}

/** Request a version-aware line range read via {@link FileContextAPI.readRange}. */
export interface ReadRangeRequest {
  /** First line to return (1-based; clamped to the file). */
  readonly startLine: number;
  /** Last line to return (1-based; clamped to the file). */
  readonly endLine: number;
  /** Lines of context to include above `startLine` and below `endLine` (default 5). */
  readonly padding?: number;
  /**
   * The file hash the caller's context was generated against. When it no longer
   * matches the on-disk file, the read reports a version mismatch so stale line
   * numbers are never silently trusted.
   */
  readonly expectedHash?: string;
}

/** The result of a version-aware line range read. */
export interface ReadRangeResult {
  readonly path: string;
  /** The effective range returned, after clamping and padding. */
  readonly startLine: number;
  readonly endLine: number;
  /** The range content (from the current working tree). */
  readonly content: string;
  /** SHA-256 of the current on-disk file. */
  readonly hash: string;
  /**
   * False when `expectedHash` was supplied and differs from the current hash â€”
   * the caller's line numbers may have drifted. The read still returns fresh
   * content, but the caller is told not to trust the old span.
   */
  readonly versionMatch: boolean;
  /** True when the on-disk file differs from the persisted index. */
  readonly stale: boolean;
  /** True when padding was applied around the requested range. */
  readonly padded: boolean;
  /** Human-readable note when the version does not match. */
  readonly message?: string;
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
  /** A file path, symbol id, symbol name, or raw `n:â€¦` node id. */
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
