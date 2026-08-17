import type { DatabaseSync } from "node:sqlite";
import type {
  ContextData,
  ContextDatabasePort,
  ContextDeleteTarget,
  ContextSearchKind,
  ContextSnapshot,
  SearchOptions,
  SearchResult,
} from "@atlas/core";
import type { FilePath, SymbolId } from "@atlas/shared";
import { openDatabase } from "./db";
import { type Migration, lastAppliedVersion, runMigrations } from "./migrations";
import { DependencyRepository } from "./repository/dependency.repository";
import { FileRepository } from "./repository/file.repository";
import { HashRepository } from "./repository/hash.repository";
import { MetadataRepository } from "./repository/metadata.repository";
import { ModuleRepository } from "./repository/module.repository";
import { RelationshipRepository } from "./repository/relationship.repository";
import { type Row, colString } from "./repository/row";
import { SummaryRepository } from "./repository/summary.repository";
import { SymbolRepository } from "./repository/symbol.repository";
import { inTransaction } from "./transaction";

export interface ContextStoreOptions {
  /** Database file path, or `":memory:"` for a throwaway store. */
  readonly filePath?: string;
  /** Custom migrations; defaults to the built-in schema migrations. */
  readonly migrations?: readonly Migration[];
}

/** Metadata key recording the last write, surfaced as `ContextSnapshot.savedAt`. */
const SAVED_AT_KEY = "atlas.saved_at";

/**
 * A synchronous SQLite-backed context database behind the `ContextDatabasePort`
 * contract. Owns the repositories for all eight tables and exposes
 * `saveContext` / `loadContext` / `updateContext` / `deleteContext` /
 * `searchContext`. No AI logic lives here — persistence only.
 */
export class ContextStore implements ContextDatabasePort {
  private readonly db: DatabaseSync;
  private readonly dbFilePath: string;
  private readonly files: FileRepository;
  private readonly symbols: SymbolRepository;
  private readonly dependencies: DependencyRepository;
  private readonly modules: ModuleRepository;
  private readonly summaries: SummaryRepository;
  private readonly relationships: RelationshipRepository;
  private readonly hashes: HashRepository;
  private readonly metadata: MetadataRepository;

  public constructor(options: ContextStoreOptions = {}) {
    const dbPath = options.filePath ?? ":memory:";
    const db = openDatabase(dbPath);
    try {
      runMigrations(db, options.migrations);
    } catch (error) {
      db.close();
      throw error;
    }
    this.db = db;
    this.dbFilePath = dbPath;
    this.files = new FileRepository(this.db);
    this.symbols = new SymbolRepository(this.db);
    this.dependencies = new DependencyRepository(this.db);
    this.modules = new ModuleRepository(this.db);
    this.summaries = new SummaryRepository(this.db);
    this.relationships = new RelationshipRepository(this.db);
    this.hashes = new HashRepository(this.db);
    this.metadata = new MetadataRepository(this.db);
  }

  /** The latest applied schema version. */
  public get version(): number {
    return lastAppliedVersion(this.db);
  }

  /** Run `fn` inside a transaction (nested calls reuse the open one). */
  public transaction<T>(fn: () => T): T {
    let result!: T;
    inTransaction(this.db, () => {
      result = fn();
    });
    return result;
  }

  /** Full replace: persist `data`, removing anything absent from it. */
  public saveContext(data: ContextData): number {
    let count = 0;
    inTransaction(this.db, () => {
      this.clearAll();
      count = this.upsertContext(data);
      this.metadata.set(SAVED_AT_KEY, new Date().toISOString());
    });
    return count;
  }

  /** Merge: upsert the entities in `data`, keeping everything else. */
  public updateContext(data: ContextData): number {
    let count = 0;
    inTransaction(this.db, () => {
      count = this.upsertContext(data);
      this.metadata.set(SAVED_AT_KEY, new Date().toISOString());
    });
    return count;
  }

  /** Remove persisted modules whose path is not in the given set. */
  public pruneModules(paths: readonly string[]): number {
    const keep = new Set(paths);
    let count = 0;
    for (const module of this.modules.all()) {
      if (!keep.has(module.path)) {
        count += this.modules.deleteByPath(module.path);
      }
    }
    return count;
  }

  /** Remove a file/symbol (with dependent cleanup) or the whole store. */
  public deleteContext(target: ContextDeleteTarget): number {
    let count = 0;
    inTransaction(this.db, () => {
      if (target.kind === "all") {
        count = this.clearAll();
        return;
      }
      if (target.kind === "file") {
        count += this.deleteFile(target.path);
        return;
      }
      count += this.deleteSymbol(target.symbolId);
    });
    return count;
  }

  /** Read back the entire stored context. */
  public loadContext(): ContextSnapshot {
    return {
      version: this.version,
      savedAt: this.metadata.get(SAVED_AT_KEY) ?? "",
      files: this.files
        .all()
        .map((row) => ({ path: row.path, language: row.language, content: row.content })),
      symbols: this.symbols.all(),
      dependencies: this.dependencies.all(),
      modules: this.modules.all(),
      summaries: this.summaries.all(),
      relationships: this.relationships.all(),
      hashes: this.hashes.all(),
      metadata: this.metadata.all(),
    };
  }

  /**
   * Read back only the persisted path → hash map. This is the indexer's
   * change-detection fast path: on a large corpus it avoids materializing
   * every row of every table (including full file bodies) just to diff
   * hashes, which is gigabytes of allocations on a no-op `update`.
   */
  public loadHashes(): Readonly<Record<string, string>> {
    return this.hashes.all();
  }

  /**
   * Lightweight entity counts (single `COUNT` queries, no row bodies) used to
   * report accurate stats on the incremental no-op fast path.
   */
  public stats(): {
    readonly files: number;
    readonly symbols: number;
    readonly dependencies: number;
  } {
    return {
      files: this.files.count(),
      symbols: this.symbols.count(),
      dependencies: this.dependencies.count(),
    };
  }

  /** Search files, symbols, summaries, and modules by query text. */
  public searchContext(query: string, options: SearchOptions = {}): readonly SearchResult[] {
    // SQLite LIKE is ASCII case-insensitive; an empty query would match every
    // row. Guard against it so callers get no hits rather than a full dump.
    if (query.length === 0) {
      return [];
    }
    const types = options.types;
    const limit = options.limit ?? 25;
    const like = `%${escapeLike(query)}%`;
    const results: SearchResult[] = [];
    if (types === undefined || types.includes("file")) {
      results.push(...this.searchFiles(query, like));
    }
    if (types === undefined || types.includes("symbol")) {
      results.push(...this.searchSymbols(query, like));
    }
    if (types === undefined || types.includes("summary")) {
      results.push(...this.searchSummaries(query, like));
    }
    if (types === undefined || types.includes("module")) {
      results.push(...this.searchModules(query, like));
    }
    results.sort((left, right) => right.score - left.score);
    return results.slice(0, limit);
  }

  public close(): void {
    // Checkpoint any pending WAL frames into the main database file so a
    // file-backed store does not leave a large `-wal` sibling behind (which
    // bloats `.codeatlas/` when a process exits without a clean `close`, and
    // makes directory-size measurements count both files).
    if (this.dbFilePath !== ":memory:") {
      this.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    }
    this.db.close();
  }

  /**
   * Reclaim unused pages and refresh query plans after bulk writes.
   *
   * VACUUM is **conditional**: a full `VACUUM` rewrites the entire database
   * file and takes seconds on a large corpus, yet incremental updates free
   * only a few pages. It runs only when free pages are a meaningful share of
   * the file, so the steady-state `atlas update` no longer pays a full rewrite
   * every run. The WAL checkpoint and `optimize` run unconditionally (cheap).
   */
  public compact(): void {
    if (this.dbFilePath !== ":memory:") {
      this.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
      this.db.exec("PRAGMA optimize;");
      const pageCount = pragmaNumber(this.db, "page_count");
      const freePages = pragmaNumber(this.db, "freelist_count");
      if (pageCount > 0 && freePages / pageCount >= 0.2) {
        this.db.exec("VACUUM;");
      }
    } else {
      this.db.exec("PRAGMA optimize;");
    }
  }

  // -- writes ---------------------------------------------------------------

  private clearAll(): number {
    let count = 0;
    count += this.relationships.clear();
    count += this.dependencies.clear();
    count += this.summaries.clear();
    count += this.modules.clear();
    count += this.hashes.clear();
    count += this.metadata.clear();
    count += this.symbols.clear();
    count += this.files.clear();
    return count;
  }

  private upsertContext(data: ContextData): number {
    let count = 0;
    for (const file of data.files ?? []) {
      this.files.upsert(file);
      count += 1;
    }
    for (const symbol of data.symbols ?? []) {
      const fileId =
        this.files.idByPath(symbol.filePath) ??
        this.files.upsert({ path: symbol.filePath, language: "", content: "" });
      this.symbols.upsert(symbol, fileId);
      count += 1;
    }
    for (const summary of data.summaries ?? []) {
      this.summaries.upsert(summary);
      count += 1;
    }
    for (const module of data.modules ?? []) {
      this.modules.upsert(module);
      count += 1;
    }
    for (const dependency of data.dependencies ?? []) {
      this.dependencies.upsert(dependency);
      count += 1;
    }
    for (const relationship of data.relationships ?? []) {
      this.relationships.upsert(relationship);
      count += 1;
    }
    for (const [path, hash] of Object.entries(data.hashes ?? {})) {
      this.hashes.upsert(path, hash);
      count += 1;
    }
    for (const [key, value] of Object.entries(data.metadata ?? {})) {
      this.metadata.set(key, value);
      count += 1;
    }
    return count;
  }

  private deleteFile(path: FilePath): number {
    let count = 0;
    const file = this.files.findByPath(path);
    const fileId = file?.id;

    // Resolve the file's symbol node ids BEFORE the file row is deleted: the
    // `Files → Symbols` ON DELETE CASCADE removes the symbol rows, so querying
    // them after the delete returns nothing and their graph edges would be
    // left dangling. Collect them first so every touching edge is cleaned up.
    const symbolNodeIds =
      fileId === undefined
        ? []
        : this.symbols.byFile(fileId).map((symbol) => symbolNodeId(symbol.id));

    count += this.files.deleteByPath(path); // cascades symbol rows
    count += this.summaries.deleteByTarget(path);
    count += this.modules.deleteByPath(path);
    count += this.hashes.deleteByPath(path);

    const nodeIds = [fileNodeId(path), ...symbolNodeIds];
    for (const nodeId of nodeIds) {
      count += this.dependencies.deleteByNodeId(nodeId);
      count += this.relationships.deleteByNodeId(nodeId);
    }
    return count;
  }

  private deleteSymbol(symbolId: SymbolId): number {
    let count = 0;
    count += this.symbols.deleteBySymbolId(symbolId);
    count += this.dependencies.deleteByNodeId(symbolNodeId(symbolId));
    count += this.relationships.deleteByNodeId(symbolNodeId(symbolId));
    return count;
  }

  // ── search helpers ───────────────────────────────────────────────────────

  private searchFiles(query: string, like: string): SearchResult[] {
    const rows = this.db
      .prepare("SELECT * FROM Files WHERE path LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\'")
      .all(like, like) as Row[];
    return rows.map((row) => {
      const path = colString(row, "path") as FilePath;
      const content = colString(row, "content") ?? "";
      const snippet = makeSnippet(content, query);
      return searchResult(
        "file",
        path,
        path,
        path,
        Math.max(
          matchScore(path, query),
          content.toLowerCase().includes(query.toLowerCase()) ? 40 : 0,
        ),
        snippet,
      );
    });
  }

  private searchSymbols(query: string, like: string): SearchResult[] {
    const rows = this.db
      .prepare(
        `SELECT s.symbol_id, s.name, s.kind, f.path AS file_path
         FROM Symbols s JOIN Files f ON f.id = s.file_id
         WHERE s.name LIKE ? ESCAPE '\\'`,
      )
      .all(like) as Row[];
    return rows.map((row) => {
      const name = colString(row, "name") ?? "";
      const symbolId = colString(row, "symbol_id") ?? "";
      const filePath = colString(row, "file_path") as FilePath;
      return searchResult("symbol", name, filePath, `symbol:${symbolId}`, matchScore(name, query));
    });
  }

  private searchSummaries(query: string, like: string): SearchResult[] {
    const rows = this.db
      .prepare(
        `SELECT kind, target, overview FROM Summaries
         WHERE overview LIKE ? ESCAPE '\\' OR target LIKE ? ESCAPE '\\'`,
      )
      .all(like, like) as Row[];
    return rows.map((row) => {
      const target = colString(row, "target") ?? "";
      const overview = colString(row, "overview") ?? "";
      const kind = colString(row, "kind") ?? "";
      const snippet = makeSnippet(overview, query);
      return searchResult(
        "summary",
        target,
        target as FilePath,
        `summary:${kind}:${target}`,
        Math.max(matchScore(target, query), matchScore(overview, query)),
        snippet,
      );
    });
  }

  private searchModules(query: string, like: string): SearchResult[] {
    const rows = this.db
      .prepare(
        "SELECT path, name FROM Modules WHERE name LIKE ? ESCAPE '\\' OR path LIKE ? ESCAPE '\\'",
      )
      .all(like, like) as Row[];
    return rows.map((row) => {
      const name = colString(row, "name") ?? "";
      const path = colString(row, "path") ?? "";
      return searchResult(
        "module",
        name,
        path as FilePath,
        `module:${path}`,
        matchScore(name, query),
      );
    });
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

/** Graph node id for a file (mirrors `@atlas/graph` without importing it). */
function fileNodeId(path: FilePath): string {
  return `n:file:${path.replace(/\\/g, "/")}`;
}

/** Graph node id for a symbol (mirrors `@atlas/graph` without importing it). */
function symbolNodeId(symbolId: SymbolId): string {
  return `n:${symbolId}`;
}

/** Read a numeric `PRAGMA` value (e.g. `page_count`, `freelist_count`). */
function pragmaNumber(db: DatabaseSync, name: string): number {
  const row = db.prepare(`PRAGMA ${name}`).get() as Row | undefined;
  if (row === undefined) {
    return 0;
  }
  const value = row[name as keyof Row];
  return typeof value === "number" ? value : typeof value === "bigint" ? Number(value) : 0;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** 100 = exact, 80 = prefix, 50 = substring, 0 = no match. Case-insensitive
 *  (matches the ASCII case-insensitivity of the SQLite LIKE filter). */
function matchScore(text: string, query: string): number {
  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  if (normalizedText === normalizedQuery) {
    return 100;
  }
  if (normalizedText.startsWith(normalizedQuery)) {
    return 80;
  }
  return normalizedText.includes(normalizedQuery) ? 50 : 0;
}

/** A ~60-char excerpt around the first occurrence of `query` (case-insensitive). */
function makeSnippet(text: string, query: string, radius = 30): string | undefined {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) {
    return undefined;
  }
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + query.length + radius);
  const excerpt = text.slice(start, end);
  const ellipsisStart = start > 0 ? "…" : "";
  const ellipsisEnd = end < text.length ? "…" : "";
  return `${ellipsisStart}${excerpt}${ellipsisEnd}`;
}

function searchResult(
  kind: ContextSearchKind,
  title: string,
  path: FilePath | null,
  targetId: string | null,
  score: number,
  snippet?: string,
): SearchResult {
  return {
    kind,
    title,
    path,
    targetId,
    score,
    ...(snippet !== undefined ? { snippet } : {}),
  };
}
