import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  createContextSDK,
  type ContextSDK,
  type ContextSDKOptions,
  type ContextStatus,
  type DependencyContext,
  type ModuleContext,
  type ProjectOverview,
  type SearchResult,
  type Summary,
  type Symbol as AtlasSymbol,
} from "@atlas/sdk";

/** A serializable snapshot of a code symbol for the editor tree. */
export interface EditorSymbol {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly filePath: string;
  readonly line: number;
  readonly documentation: string | null;
}

/** A serializable file entry for the editor. */
export interface EditorFile {
  readonly path: string;
  readonly language: string;
  readonly size: number;
}

/** The minimum the editor needs to open a symbol or file at a line. */
export interface CodeAtlasTarget {
  readonly filePath: string;
  readonly line: number;
}

/** The resolved repository/db paths for a project. */
export interface ResolvedProjectPaths {
  readonly repositoryPath: string;
  readonly dbPath: string;
}

/** Resolve the repository + db path exactly as the SDK does. */
export function resolvePaths(options: ContextSDKOptions): ResolvedProjectPaths {
  const repositoryPath = resolve(
    options.repositoryPath ?? process.env["ATLAS_ROOT"] ?? process.cwd(),
  );
  const dbPath = resolve(
    options.dbPath ?? process.env["ATLAS_DB"] ?? join(repositoryPath, ".codeatlas", "context.db"),
  );
  return { repositoryPath, dbPath };
}

/** True when a `.codeatlas/context.db` exists for a project root. */
export function hasIndex(repositoryPath: string): boolean {
  return existsSync(join(repositoryPath, ".codeatlas", "context.db"));
}

/** True for the SDK error thrown when no index exists yet. */
export function isUnavailable(error: unknown): boolean {
  return error instanceof Error && error.name === "ContextUnavailableError";
}

/**
 * The single gateway the VS Code extension uses to talk to CodeAtlas. It wraps
 * {@link createContextSDK} and exposes only normalized, editor-friendly models —
 * never the database, never raw SQL, never storage internals.
 *
 * Holds one SDK session per workspace; call {@link close} on deactivate.
 */
export class ContextClient {
  private sdk: ContextSDK | null = null;

  /** Open (or reuse) a session for a project on first use. */
  public constructor(private readonly options: ContextSDKOptions) {}

  /** The resolved repository/db paths, when a session is open. */
  public get paths(): ResolvedProjectPaths {
    return resolvePaths(this.options);
  }

  /** True when an index currently exists and can be queried. */
  public get isAvailable(): boolean {
    return this.sdkOrThrow().isAvailable;
  }

  /** Current context status (counts, availability, timestamps). */
  public status(): ContextStatus {
    return this.sdkOrThrow().status();
  }

  /** Project overview with full detail (counts, languages, summary). */
  public overview(): ProjectOverview {
    return this.sdkOrThrow().project.overview("full");
  }

  /** Ranked symbol search. */
  public searchSymbols(query: string, kind?: string): readonly SearchResult[] {
    return this.sdkOrThrow().symbols.searchSymbols(query, {
      ...(kind === undefined ? {} : { kind }),
    });
  }

  /** Every indexed symbol (editor-friendly shape). */
  public listSymbols(): readonly EditorSymbol[] {
    return this.sdkOrThrow().symbols.listSymbols().map(this.toEditorSymbol);
  }

  /** Ranked file search. */
  public searchFiles(query: string): readonly SearchResult[] {
    return this.sdkOrThrow().files.searchFiles(query);
  }

  /** Metadata for every indexed file (no content). */
  public listFiles(): readonly EditorFile[] {
    return this.sdkOrThrow()
      .files.listFiles()
      .map((file) => ({
        path: file.path,
        language: file.language,
        size: file.size,
      }));
  }

  /** Every indexed module. */
  public modules(): readonly ModuleContext[] {
    return this.sdkOrThrow().modules.listModules();
  }

  /** Every stored summary. */
  public summaries(): readonly Summary[] {
    return this.sdkOrThrow().summaries.listSummaries();
  }

  /** The full persisted dependency graph. */
  public dependencies(): readonly DependencyContext[] {
    return this.sdkOrThrow().dependencies.getDependencyGraph();
  }

  /** Symbols declared in a given file, mapped to editor-friendly shape. */
  public symbolsInFile(path: string): readonly EditorSymbol[] {
    const file = this.sdkOrThrow().files.getFile(path);
    return this.listSymbols().filter((symbol) => symbol.filePath === file.path);
  }

  /** The file's indexed content (used for quick docs/peek). */
  public fileContent(path: string): string {
    return this.sdkOrThrow().files.getFile(path).content;
  }

  /** The stored summary for a file, if any. */
  public fileSummary(path: string): Summary | undefined {
    return this.sdkOrThrow().summaries.getFileSummary(path);
  }

  /** Run a deterministic relevant-context assembly (for inline context). */
  public relevant(query: string): {
    readonly query: string;
    readonly symbols: readonly EditorSymbol[];
    readonly files: readonly string[];
  } {
    const rel = this.sdkOrThrow().getRelevantContext(query);
    return {
      query: rel.query,
      symbols: rel.symbols.map(this.toEditorSymbol),
      files: rel.files.map((file) => file.path),
    };
  }

  /** Release the SDK / SQLite handle. */
  public close(): void {
    this.sdk?.close();
    this.sdk = null;
  }

  /**
   * Force the next operation to re-open the SDK. Call after an external
   * `atlas build` / `atlas update` so a newly written index becomes visible.
   */
  public reload(): void {
    this.close();
  }

  private sdkOrThrow(): ContextSDK {
    if (this.sdk === null) {
      this.sdk = createContextSDK(this.options);
    }
    return this.sdk;
  }

  private readonly toEditorSymbol = (symbol: AtlasSymbol): EditorSymbol => ({
    id: symbol.id,
    name: symbol.name,
    kind: symbol.kind,
    filePath: symbol.filePath,
    line: symbol.location.startLine,
    documentation: symbol.documentation,
  });
}
