import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { CacheService } from "@atlas/cache";
import type {
  ContextData,
  ContextDatabasePort,
  ContextDeleteTarget,
  ContextSnapshot,
  PersistedDependency,
  Symbol as PersistedSymbol,
  SearchRequest,
  SearchResult,
  SourceFile,
  Summary,
  SummaryKind,
  SummaryOptions,
  SummaryPort,
} from "@atlas/core";
import { HashService, hashContent } from "@atlas/hashing";
import { ProviderService } from "@atlas/providers";
import { SearchService } from "@atlas/search";
import { type FilePath, type Result, type SymbolId, fail } from "@atlas/shared";
import { ContextStore } from "@atlas/storage";
import { SummaryService } from "@atlas/summary";
import {
  ContextUnavailableError,
  DependencyNotFoundError,
  FileNotFoundError,
  InvalidQueryError,
} from "./errors";
import type {
  ContextStatus,
  DependencyContext,
  DependencyQuery,
  DependencyQueryResult,
  FileContentContext,
  FileContext,
  FreshnessSignal,
  ModuleContext,
  ModuleExplanation,
  ProjectCounts,
  ProjectOverview,
  ProjectOverviewDetail,
  ReadRangeRequest,
  ReadRangeResult,
  RelevantContext,
  SymbolContext,
  SymbolReference,
} from "./models";
import { fileNodeId, isUnderOrEqual, symbolNodeId } from "./nodes";
import { ReadRepositories, WriteRepositories } from "./repositories";
import { type FreshnessInput, detectFreshness } from "./staleness";

/** Options accepted by {@link createContextSDK}. */
export interface ContextSDKOptions {
  /** Project root; resolves `.codeatlas/context.db` inside it. */
  readonly repositoryPath?: string;
  /** Explicit path to the on-disk context database. */
  readonly dbPath?: string;
  /** An open context-database port (overrides file resolution). */
  readonly contextDb?: ContextDatabasePort;
  /** Summary generation port (AI-optional); fails cleanly when absent. */
  readonly summary?: SummaryPort;
}

/** Resolved SDK configuration. */
export interface ContextSDKConfig {
  readonly repositoryPath: string;
  readonly dbPath: string;
}

/**
 * Derive the SDK configuration from explicit options, the `ATLAS_ROOT` /
 * `ATLAS_DB` env vars, or the current working directory.
 */
export function resolveContextConfig(options: ContextSDKOptions): ContextSDKConfig {
  const repositoryPath = resolve(
    options.repositoryPath ?? process.env["ATLAS_ROOT"] ?? process.cwd(),
  );
  const dbPath = resolve(
    options.dbPath ?? process.env["ATLAS_DB"] ?? join(repositoryPath, ".codeatlas", "context.db"),
  );
  return { repositoryPath, dbPath };
}

/** Opens the on-disk store, or `null` when the index file does not exist yet. */
function openStore(dbPath: string): ContextDatabasePort | null {
  return existsSync(dbPath) ? new ContextStore({ filePath: dbPath }) : null;
}

/**
 * The file sub-API of the Context SDK.
 */
export interface FileContextAPI {
  /** A file's content by path; throws `FileNotFoundError` when missing. */
  getFile(path: string): FileContentContext;
  /** File metadata (no content) for every indexed file. */
  listFiles(): readonly FileContext[];
  /** Search indexed files by a query. */
  searchFiles(query: string, options?: SearchRequest): readonly SearchResult[];
  /**
   * Version-aware line range read (see {@link ReadRangeResult}): returns a
   * padded range of the file's current working-tree content and validates it
   * against an optional expected hash so stale line numbers are never silently
   * trusted. Throws `FileNotFoundError` when the file is not indexed.
   */
  readRange(path: string, request: ReadRangeRequest): ReadRangeResult;
}

/**
 * The symbol sub-API of the Context SDK.
 */
export interface SymbolContextAPI {
  /** A symbol by id; throws `SymbolNotFoundError` when missing. */
  getSymbol(symbolId: string): SymbolContext;
  /** All indexed symbols. */
  listSymbols(): readonly PersistedSymbol[];
  /** Search indexed symbols by a query, optionally filtering by symbol kind. */
  searchSymbols(
    query: string,
    options?: SearchRequest & { readonly kind?: string },
  ): readonly SearchResult[];
  /** Resolve a symbol's declaration (definitions are the symbol rows). */
  findDefinition(symbolId: string): SymbolContext;
  /** Symbols that reference the given symbol. */
  findReferences(symbolId: string): readonly SymbolReference[];
}

/**
 * The dependency sub-API of the Context SDK.
 */
export interface DependencyContextAPI {
  /** Edges where `target` is the source (what it depends on). */
  getDependencies(target: string): readonly DependencyContext[];
  /** Edges where `target` is the destination (what depends on it). */
  getDependents(target: string): readonly DependencyContext[];
  /** Every dependency edge with resolved labels. */
  getDependencyGraph(): readonly DependencyContext[];
  /** Filter edges by node, direction, relation, and limit. */
  query(options?: DependencyQuery): DependencyQueryResult;
}

/**
 * The module sub-API of the Context SDK.
 */
export interface ModuleContextAPI {
  /** All indexed modules. */
  listModules(): readonly ModuleContext[];
  /** A module by path, or `undefined`. */
  getModule(path: string): ModuleContext | undefined;
  /** Explain a module: its record, files, symbols, dependencies, and summary. */
  explain(
    path: string,
    options?: { readonly includeSummary?: boolean; readonly includeDependencies?: boolean },
  ): ModuleExplanation;
}

/**
 * The summary sub-API of the Context SDK.
 */
export interface SummaryContextAPI {
  /** All stored summaries. */
  listSummaries(): readonly Summary[];
  /** A stored summary matching a target (with scope filtering), or `undefined`. */
  getSummary(target: string, scope?: SummaryKind): Summary | undefined;
  /** Stored summary for a file, or `undefined`. */
  getFileSummary(path: string): Summary | undefined;
  /** Stored summary for a module/folder path, or `undefined`. */
  getModuleSummary(path: string): Summary | undefined;
  /** The stored project summary, or `undefined`. */
  getProjectSummary(): Summary | undefined;
  /** Generate a fresh file summary (AI is optional; fails cleanly without a provider). */
  generateFile(path: string, options?: SummaryOptions): Promise<Result<Summary>>;
  /** Generate a fresh folder summary (AI is optional; fails cleanly without a provider). */
  generateFolder(target: string, options?: SummaryOptions): Promise<Result<Summary>>;
  /** Generate a fresh module summary (AI is optional; fails cleanly without a provider). */
  generateModule(target: string, options?: SummaryOptions): Promise<Result<Summary>>;
  /** Generate a fresh project summary (AI is optional; fails cleanly without a provider). */
  generateProject(options?: SummaryOptions): Promise<Result<Summary>>;
}

/**
 * The search sub-API of the Context SDK.
 */
export interface SearchContextAPI {
  /** Build the index, then run a ranked query across all indexed kinds. */
  search(query: string, options?: SearchRequest): readonly SearchResult[];
}

/**
 * The project sub-API of the Context SDK.
 */
export interface ProjectContextAPI {
  /** Counts per entity kind. */
  stats(): ProjectCounts;
  /**
   * A human-readable overview of the whole index. `detail: "full"` additionally
   * lists the modules, top files, and top symbols.
   */
  overview(detail?: ProjectOverviewDetail): ProjectOverview;
}

/**
 * The write edge of the SDK â€” read/write are deliberately separated. Consumers
 * should normally use the read APIs; the indexing pipeline owns writes.
 */
export interface ContextWriteAPI {
  /** Full replace of the stored context. */
  save(data: ContextData): number;
  /** Merge/upsert of the provided entities, keeping the rest. */
  update(data: ContextData): number;
  /** Delete a file, symbol, or the entire store. */
  delete(target: ContextDeleteTarget): number;
}

/**
 * The Context SDK faÃ§ade returned by {@link createContextSDK}. Consumers use the
 * sub-APIs and never touch the database port directly.
 */
export interface ContextSDK {
  readonly files: FileContextAPI;
  readonly symbols: SymbolContextAPI;
  readonly dependencies: DependencyContextAPI;
  readonly modules: ModuleContextAPI;
  readonly summaries: SummaryContextAPI;
  readonly search: SearchContextAPI;
  readonly project: ProjectContextAPI;
  /** Write access â€” owned by the indexing pipeline. */
  readonly write: ContextWriteAPI;
  /** Status metadata so agents can detect stale context. */
  status(): ContextStatus;
  /**
   * Compare the persisted per-file hashes against the current working tree and
   * report whether the index is fresh, stale, unknown, or unavailable. Callers
   * must never treat stale context as fresh.
   */
  freshness(): Promise<FreshnessSignal>;
  /** Persisted per-file hashes (path â†’ SHA-256), for working-tree staleness checks. */
  hashes(): Readonly<Record<string, string>>;
  /** Deterministic relevant-context assembly for a query. */
  getRelevantContext(query: string): RelevantContext;
  /** Whether an index currently exists for this SDK. */
  readonly isAvailable: boolean;
  /** The resolved repository/database paths. */
  readonly config: ContextSDKConfig;
  /** Release the underlying SQLite handle. */
  close(): void;
}

/**
 * The SDK implementation. Reads through `ReadRepositories`/`WriteRepositories`
 * (which wrap the `ContextDatabasePort`), and runs search through `@atlas/search`.
 */
class ContextSDKFacade implements ContextSDK {
  public readonly config: ContextSDKConfig;
  private readonly reads: ReadRepositories;
  private readonly writes: WriteRepositories;
  private readonly searchService: SearchService;
  private readonly summary: SummaryPort;
  private indexDirty = true;
  private closed = false;

  private constructor(
    private readonly port: ContextDatabasePort | null,
    config: ContextSDKConfig,
    summary: SummaryPort | undefined,
  ) {
    this.config = config;
    // AI summaries are optional; without a wired port or configured provider the
    // generation methods fail cleanly instead of crashing.
    this.summary =
      summary ??
      new SummaryService({
        provider: new ProviderService(),
        cache: new CacheService(),
        hash: new HashService(),
      });
    if (port !== null) {
      this.reads = new ReadRepositories(port);
      this.writes = new WriteRepositories(port);
      this.searchService = new SearchService({ db: port });
    } else {
      // Deliberately throw from any read/write call until an index exists.
      this.reads = undefined as unknown as ReadRepositories;
      this.writes = undefined as unknown as WriteRepositories;
      this.searchService = new SearchService();
    }
  }

  /** Create the faÃ§ade, wiring an on-disk store when one exists. */
  public static open(options: ContextSDKOptions): ContextSDKFacade {
    const config = resolveContextConfig(options);
    const port = options.contextDb ?? openStore(config.dbPath);
    return new ContextSDKFacade(port, config, options.summary);
  }

  public get isAvailable(): boolean {
    return this.port !== null && !this.closed;
  }

  // â”€â”€ internal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private requireAvailable(): void {
    if (!this.isAvailable) {
      throw new ContextUnavailableError(
        `No context index found at ${this.config.dbPath}. Build the CodeAtlas index first.`,
      );
    }
  }

  private requireSearchable(query: string): void {
    this.requireAvailable();
    if (query.trim() === "") {
      throw new InvalidQueryError("Search query must not be empty.");
    }
  }

  private snapshot(): ContextSnapshot {
    return this.reads.loadSnapshot();
  }

  /** Rebuild the search index when the underlying store changed. */
  private rebuildSearch(): void {
    if (!this.indexDirty) {
      return;
    }
    const result = this.searchService.refresh();
    if (!result.ok) {
      throw new InvalidQueryError(`Failed to build the search index: ${result.error.message}`);
    }
    this.indexDirty = false;
  }

  private markDirty(): void {
    this.indexDirty = true;
  }

  private searchHits(
    query: string,
    options?: SearchRequest & { readonly kind?: string },
  ): readonly SearchResult[] {
    this.requireSearchable(query);
    this.rebuildSearch();
    const hits = this.searchService.search(query, options);
    const kind = options?.kind;
    if (kind === undefined) {
      return hits;
    }
    const symbols = new Map<string, PersistedSymbol>();
    for (const symbol of this.reads.listSymbols()) {
      symbols.set(symbol.id, symbol);
    }
    return hits.filter((hit) => {
      const symbolId = symbolIdFromTarget(hit.targetId);
      return symbolId !== null && symbols.get(symbolId)?.kind === kind;
    });
  }

  /** All indexed source files, optionally restricted to one path subtree. */
  private filesUnder(target?: string): readonly SourceFile[] {
    const files = this.reads.listFiles();
    if (target === undefined) {
      return files;
    }
    return files.filter((file) => isUnderOrEqual(file.path, target));
  }

  // â”€â”€ files â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  public readonly files: FileContextAPI = {
    getFile: (path: string): FileContentContext => {
      this.requireAvailable();
      const source = this.reads.getFile(path as FilePath);
      const summary = this.reads.findSummary("file", source.path);
      return toFileContentContext(source, summary);
    },
    listFiles: (): readonly FileContext[] => {
      this.requireAvailable();
      return this.reads.listFiles().map(toFileContext);
    },
    searchFiles: (query: string, options?: SearchRequest): readonly SearchResult[] => {
      return this.searchHits(query, { ...options, types: ["file"] });
    },
    readRange: (path, request: ReadRangeRequest): ReadRangeResult => {
      this.requireAvailable();
      const lookupPath = isAbsolute(path) ? path : join(this.config.repositoryPath, path);
      const source = this.reads.getFile(lookupPath as FilePath);
      const disk = readWorkingFile(source.path);
      const persistedHash = this.hashes()[source.path];
      const hash = disk.readable ? hashContent(disk.content) : (persistedHash ?? "");
      const stale = !disk.readable || (persistedHash !== undefined && persistedHash !== hash);
      const versionMatch = request.expectedHash === undefined || request.expectedHash === hash;
      const padding = request.padding ?? DEFAULT_READ_RANGE_PADDING;
      const lines = (disk.readable ? disk.content : source.content).split("\n");
      const totalLines = lines.length;
      const first = Math.max(1, request.startLine - padding);
      const last = Math.min(totalLines, request.endLine + padding);
      const content = lines.slice(first - 1, last).join("\n");
      return {
        path: source.path,
        startLine: first,
        endLine: last,
        content,
        hash,
        versionMatch,
        stale,
        padded: padding > 0,
        ...(versionMatch ? {} : { message: "File changed since this context was generated." }),
      };
    },
  };

  // â”€â”€ symbols â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  public readonly symbols: SymbolContextAPI = {
    getSymbol: (symbolId: string): SymbolContext => {
      this.requireAvailable();
      return this.reads.getSymbol(symbolId as SymbolId);
    },
    listSymbols: (): readonly PersistedSymbol[] => {
      this.requireAvailable();
      return this.reads.listSymbols();
    },
    searchSymbols: (
      query: string,
      options?: SearchRequest & { readonly kind?: string },
    ): readonly SearchResult[] => {
      return this.searchHits(query, { ...options, types: ["symbol"] });
    },
    findDefinition: (symbolId: string): SymbolContext => {
      this.requireAvailable();
      return this.reads.getSymbol(symbolId as SymbolId);
    },
    findReferences: (symbolId: string): readonly SymbolReference[] => {
      this.requireAvailable();
      return this.reads.referencesTo(symbolId as SymbolId).map((reference) => ({
        symbol: reference.symbol,
        kind: reference.kind,
        targetId: symbolId as SymbolId,
      }));
    },
  };

  // â”€â”€ dependencies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  public readonly dependencies: DependencyContextAPI = {
    getDependencies: (target: string): readonly DependencyContext[] => {
      this.requireAvailable();
      const ids = new Set(this.reads.resolveNode(target).map((n) => n.nodeId));
      return this.reads
        .listDependencies()
        .filter(({ edge }) => ids.has(edge.from))
        .map(toDependencyContext);
    },
    getDependents: (target: string): readonly DependencyContext[] => {
      this.requireAvailable();
      const ids = new Set(this.reads.resolveNode(target).map((n) => n.nodeId));
      return this.reads
        .listDependencies()
        .filter(({ edge }) => ids.has(edge.to))
        .map(toDependencyContext);
    },
    getDependencyGraph: (): readonly DependencyContext[] => {
      this.requireAvailable();
      return this.reads.listDependencies().map(toDependencyContext);
    },
    query: (options?: DependencyQuery): DependencyQueryResult => {
      this.requireAvailable();
      const node = options?.node;
      const direction = options?.direction ?? "both";
      const relation = options?.relation;
      const limit = options?.limit;

      let nodeIds: ReadonlySet<string> | null = null;
      let nodeFound = true;
      if (node !== undefined) {
        try {
          nodeIds = new Set(this.reads.resolveNode(node).map((entry) => entry.nodeId));
        } catch (error) {
          if (error instanceof DependencyNotFoundError) {
            nodeIds = new Set();
            nodeFound = false;
          } else {
            throw error;
          }
        }
      }

      const allEdges = this.reads.listDependencies();
      const filtered = allEdges.filter(({ edge }) => {
        if (nodeIds === null) {
          return true;
        }
        const isFrom = nodeIds.has(edge.from);
        const isTo = nodeIds.has(edge.to);
        if (direction === "outgoing") {
          return isFrom;
        }
        if (direction === "incoming") {
          return isTo;
        }
        return isFrom || isTo;
      });
      const byRelation =
        relation === undefined ? filtered : filtered.filter(({ edge }) => edge.kind === relation);
      const selected = limit === undefined ? byRelation : byRelation.slice(0, limit);

      return {
        edges: selected.map(toDependencyContext),
        nodeFound,
        total: allEdges.length,
      };
    },
  };

  // â”€â”€ modules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  public readonly modules: ModuleContextAPI = {
    listModules: (): readonly ModuleContext[] => {
      this.requireAvailable();
      return this.reads.listModules();
    },
    getModule: (path: string): ModuleContext | undefined => {
      this.requireAvailable();
      return this.reads.listModules().find((module) => module.path === path);
    },
    explain: (path: string, options?): ModuleExplanation => {
      this.requireAvailable();
      const snapshot = this.snapshot();
      const files = (snapshot.files ?? []).filter((file) => isUnderOrEqual(file.path, path));
      const moduleRecord = this.reads.listModules().find((module) => module.path === path) ?? null;
      const filePaths = new Set(files.map((file) => file.path));
      const symbols = (snapshot.symbols ?? []).filter((symbol) => filePaths.has(symbol.filePath));

      const nodeIds = new Set<string>();
      for (const file of files) {
        nodeIds.add(fileNodeId(file.path));
      }
      for (const symbol of symbols) {
        nodeIds.add(symbolNodeId(symbol.id));
      }

      let dependencies: readonly DependencyContext[] = [];
      if (options?.includeDependencies !== false) {
        dependencies = this.reads
          .listDependencies()
          .filter(({ edge }) => nodeIds.has(edge.from) || nodeIds.has(edge.to))
          .slice(0, 200)
          .map(toDependencyContext);
      }

      const summary =
        options?.includeSummary === false ? null : (this.reads.findSummary("module", path) ?? null);

      return {
        path,
        module: moduleRecord,
        fileCount: files.length,
        files: files.map(toFileContext),
        symbolCount: symbols.length,
        symbols,
        dependencyCount: dependencies.length,
        dependencies,
        summary,
      };
    },
  };

  // â”€â”€ summaries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  public readonly summaries: SummaryContextAPI = {
    listSummaries: (): readonly Summary[] => {
      this.requireAvailable();
      return this.reads.listSummaries();
    },
    getSummary: (target: string, scope?: SummaryKind): Summary | undefined => {
      this.requireAvailable();
      const summaries = this.reads.listSummaries();
      const base =
        target === "project"
          ? summaries.filter((item) => item.kind === "project")
          : summaries.filter((item) => item.target === target);
      return scope === undefined ? base[0] : base.find((item) => item.kind === scope);
    },
    getFileSummary: (path: string): Summary | undefined => {
      this.requireAvailable();
      return this.reads.findSummary("file", path);
    },
    getModuleSummary: (path: string): Summary | undefined => {
      this.requireAvailable();
      return this.reads.findSummary("module", path);
    },
    getProjectSummary: (): Summary | undefined => {
      this.requireAvailable();
      return this.reads.findSummary("project", "");
    },
    generateFile: async (path: string, options?): Promise<Result<Summary>> => {
      this.requireAvailable();
      const file = this.reads.findFile(path as FilePath);
      if (file === undefined) {
        return fail(new FileNotFoundError(path));
      }
      return this.summary.summarizeFile(file, options);
    },
    generateFolder: async (target, options?): Promise<Result<Summary>> => {
      this.requireAvailable();
      const files = this.filesUnder(target);
      return this.summary.summarizeFolder(target, files, options);
    },
    generateModule: async (target, options?): Promise<Result<Summary>> => {
      this.requireAvailable();
      const files = this.filesUnder(target);
      return this.summary.summarizeModule(target, files, options);
    },
    generateProject: async (options?): Promise<Result<Summary>> => {
      this.requireAvailable();
      return this.summary.summarizeProject(this.filesUnder(undefined), options);
    },
  };

  // â”€â”€ search / project â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  public readonly search: SearchContextAPI = {
    search: (query: string, options?: SearchRequest): readonly SearchResult[] => {
      this.requireSearchable(query);
      this.rebuildSearch();
      return this.searchService.search(query, options);
    },
  };

  public readonly project: ProjectContextAPI = {
    stats: (): ProjectCounts => {
      this.requireAvailable();
      return this.reads.counts();
    },
    overview: (detail?: ProjectOverviewDetail): ProjectOverview => {
      this.requireAvailable();
      const snapshot = this.snapshot();
      const languages: Record<string, number> = {};
      for (const file of snapshot.files ?? []) {
        languages[file.language] = (languages[file.language] ?? 0) + 1;
      }
      const counts = this.reads.counts();
      const summary = this.reads.findSummary("project", "");
      const base: ProjectOverview = {
        repositoryPath: this.config.repositoryPath,
        savedAt: snapshot.savedAt,
        schemaVersion: snapshot.version,
        languages,
        counts,
        ...(summary !== undefined ? { summary } : {}),
      };
      if (detail !== "full") {
        return base;
      }
      const files = this.reads.listFiles();
      const symbols = this.reads.listSymbols();
      return {
        ...base,
        modules: this.reads.listModules().slice(0, 100),
        topFiles: files.slice(0, 50).map(toFileContext),
        topSymbols: symbols.slice(0, 100),
      };
    },
  };

  // â”€â”€ write (indexing pipeline) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  public readonly write: ContextWriteAPI = {
    save: (data: ContextData): number => {
      this.requireAvailable();
      const written = this.writes.save(data);
      this.markDirty();
      return written;
    },
    update: (data: ContextData): number => {
      this.requireAvailable();
      const written = this.writes.update(data);
      this.markDirty();
      return written;
    },
    delete: (target: ContextDeleteTarget): number => {
      this.requireAvailable();
      const removed = this.writes.deleteTo(target);
      this.markDirty();
      return removed;
    },
  };

  // â”€â”€ status / relevant context / close â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  public status(): ContextStatus {
    if (!this.isAvailable) {
      return {
        repositoryPath: this.config.repositoryPath,
        dbPath: this.config.dbPath,
        schemaVersion: 0,
        lastUpdated: "",
        available: false,
        filesIndexed: 0,
        symbolsIndexed: 0,
        modulesIndexed: 0,
        dependenciesIndexed: 0,
        summariesIndexed: 0,
      };
    }
    const counts = this.reads.counts();
    return {
      repositoryPath: this.config.repositoryPath,
      dbPath: this.config.dbPath,
      schemaVersion: this.snapshot().version,
      lastUpdated: this.snapshot().savedAt,
      available: true,
      filesIndexed: counts.files,
      symbolsIndexed: counts.symbols,
      modulesIndexed: counts.modules,
      dependenciesIndexed: counts.dependencies,
      summariesIndexed: counts.summaries,
    };
  }

  public async freshness(): Promise<FreshnessSignal> {
    const input: FreshnessInput = {
      config: this.config,
      status: () => this.status(),
      hashes: () => this.hashes(),
    };
    return detectFreshness(input);
  }

  public hashes(): Readonly<Record<string, string>> {
    if (!this.isAvailable) {
      return {};
    }
    return this.reads.hashes();
  }

  public getRelevantContext(query: string): RelevantContext {
    this.requireAvailable();
    if (query.trim() === "") {
      throw new InvalidQueryError("Query must not be empty.");
    }
    this.rebuildSearch();

    const fileHits = this.searchService.search(query, { types: ["file"], limit: 5 });
    const symbolHits = this.searchService.search(query, { types: ["symbol"], limit: 10 });

    const fileContexts: FileContext[] = [];
    for (const hit of fileHits) {
      if (hit.path === null || fileContexts.length >= 5) {
        continue;
      }
      const file = this.reads.findFile(hit.path as FilePath);
      if (file !== undefined) {
        fileContexts.push(toFileContext(file));
      }
    }

    const symbolContexts: SymbolContext[] = [];
    for (const hit of symbolHits) {
      const symbolId = symbolIdFromTarget(hit.targetId);
      if (symbolId === null) {
        continue;
      }
      try {
        symbolContexts.push(this.reads.getSymbol(symbolId as SymbolId));
      } catch {
        // PersistedSymbol removed from a concurrent index refresh â€” skip.
      }
    }

    const summaries: Summary[] = [];
    for (const file of fileContexts) {
      const summary = this.reads.findSummary("file", file.path);
      if (summary !== undefined) {
        summaries.push(summary);
      }
    }
    const projectSummary = this.reads.findSummary("project", "");
    if (projectSummary !== undefined) {
      summaries.push(projectSummary);
    }

    const relevantNodes = new Set<string>();
    for (const file of fileContexts) {
      relevantNodes.add(fileNodeId(file.path));
    }
    for (const symbol of symbolContexts) {
      relevantNodes.add(symbolNodeId(symbol.id));
    }
    const dependencies = this.reads
      .listDependencies()
      .filter(({ edge }) => relevantNodes.has(edge.from) || relevantNodes.has(edge.to))
      .map(toDependencyContext);

    return {
      query,
      files: fileContexts,
      symbols: symbolContexts,
      dependencies,
      modules: this.reads.listModules(),
      summaries,
      overview: this.project.overview(),
    };
  }

  public close(): void {
    if (!this.closed) {
      this.port?.close();
      this.closed = true;
    }
  }
}

/**
 * Create the CodeAtlas Context SDK.
 *
 * @example
 * ```ts
 * const context = createContextSDK({ repositoryPath: "/path/to/repo" });
 * const hits = context.search.search("authentication");
 * context.close();
 * ```
 */
export function createContextSDK(options: ContextSDKOptions = {}): ContextSDK {
  return ContextSDKFacade.open(options);
}

// â”€â”€ mapping helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function toFileContentContext(file: SourceFile, summary: Summary | undefined): FileContentContext {
  return {
    path: file.path,
    language: file.language,
    content: file.content,
    size: byteLength(file.content),
    ...(summary !== undefined ? { summary } : {}),
  };
}

function toFileContext(file: SourceFile): FileContext {
  return {
    path: file.path,
    language: file.language,
    size: byteLength(file.content),
  };
}

function toDependencyContext(input: {
  edge: PersistedDependency;
  fromLabel: string;
  toLabel: string;
}): DependencyContext {
  return {
    from: input.edge.from,
    to: input.edge.to,
    kind: input.edge.kind,
    fromLabel: input.fromLabel,
    toLabel: input.toLabel,
  };
}

function byteLength(content: string): number {
  return Buffer.byteLength(content, "utf8");
}

/** Default padding lines above/below a requested range (protects against drift). */
const DEFAULT_READ_RANGE_PADDING = 5;

/** Read a file from the working tree, reporting whether it is readable. */
function readWorkingFile(path: string): { readonly content: string; readonly readable: boolean } {
  try {
    return { content: readFileSync(path, "utf8"), readable: true };
  } catch {
    return { content: "", readable: false };
  }
}

/** Extract the symbol id from a `symbol:<id>` search-hit target. */
function symbolIdFromTarget(targetId: string | null): string | null {
  if (targetId === null || !targetId.startsWith("symbol:")) {
    return null;
  }
  return targetId.slice("symbol:".length);
}
