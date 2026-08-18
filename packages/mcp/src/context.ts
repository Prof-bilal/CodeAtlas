import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { type ContextSDK, type MetricsPort, type UsagePort, createContextSDK } from "@atlas/sdk";
import { FreshnessController, type FreshnessReport } from "./freshness";
import { ToolDomainError } from "./validation";

export interface CodeAtlasContextOptions {
  /** Project root; resolves `.codeatlas/context.db` inside it. */
  readonly root?: string;
  /** Explicit path to the context database file (overrides `root`). */
  readonly dbPath?: string;
  /**
   * Auto-refresh the index when the working tree changes before serving reads
   * (default `true`). Disabling it restores the explicit `atlas update` model.
   */
  readonly autoRefresh?: boolean;
  /**
   * Debounce (ms) for the full path-set freshness probe. `0` (default) probes
   * on every read so external edits are reflected immediately.
   */
  readonly autoRefreshIntervalMs?: number;
  /** Optional metrics port; tool reads/search are recorded. */
  readonly metrics?: MetricsPort;
  /** Optional usage port; AI summary generation is recorded with actual tokens. */
  readonly usage?: UsagePort;
}

export interface ResolvedContextConfig {
  readonly root: string;
  readonly dbPath: string;
}

/**
 * Resolve the project root and context-database path. Precedence: an explicit
 * `dbPath` option, then the `ATLAS_DB` env var, then `<root>/.codeatlas/context.db`
 * where `root` comes from the `root` option, the `ATLAS_ROOT` env var, or cwd.
 */
export function resolveContextConfig(options: CodeAtlasContextOptions = {}): ResolvedContextConfig {
  const root = resolve(options.root ?? process.env["ATLAS_ROOT"] ?? process.cwd());
  const dbPath = resolve(
    options.dbPath ?? process.env["ATLAS_DB"] ?? join(root, ".codeatlas", "context.db"),
  );
  return { root, dbPath };
}

/**
 * Owns the connection to a project's on-disk context index, opened through the
 * **Context SDK** (`createContextSDK`) rather than the SDK `Container`. Tools
 * read only normalized SDK models — never the database directly.
 *
 * The SDK is opened **lazily** on the first tool call so the server can start
 * before an index has been built; `open()` re-checks the filesystem each time,
 * so context becomes available the moment `context.db` appears.
 */
export class CodeAtlasContext {
  public readonly root: string;
  public readonly dbPath: string;
  private sdk: ContextSDK | null = null;
  private readonly freshness: FreshnessController;
  private readonly metrics: MetricsPort | undefined;
  private readonly usage: UsagePort | undefined;

  public constructor(options: CodeAtlasContextOptions = {}) {
    const config = resolveContextConfig(options);
    this.root = config.root;
    this.dbPath = config.dbPath;
    this.metrics = options.metrics;
    this.usage = options.usage;
    this.freshness = new FreshnessController({
      autoRefresh: options.autoRefresh ?? true,
      intervalMs: options.autoRefreshIntervalMs ?? 0,
      root: this.root,
    });
  }

  /** True when a context database currently exists on disk. */
  public get isReady(): boolean {
    return existsSync(this.dbPath);
  }

  /** Whether the SDK is currently open (index exists and has been opened). */
  public get isOpen(): boolean {
    return this.sdk !== null;
  }

  /** Open (once) the Context SDK, or `null` when no index exists yet. */
  public open(): ContextSDK | null {
    if (!this.isReady) {
      return null;
    }
    this.sdk ??= createContextSDK({
      dbPath: this.dbPath,
      repositoryPath: this.root,
      ...(this.metrics === undefined ? {} : { metrics: this.metrics }),
      ...(this.usage === undefined ? {} : { usage: this.usage }),
    });
    return this.sdk;
  }

  /** Open the Context SDK, raising a domain error when the index is missing. */
  public requireSDK(): ContextSDK {
    const sdk = this.open();
    if (sdk === null) {
      throw new ToolDomainError(
        `No context index found at ${this.dbPath}. Build the CodeAtlas index first (see docs/CONTEXT_STORAGE.md).`,
      );
    }
    return sdk;
  }

  /** Record an MCP tool request when a metrics port is wired. */
  public recordMcpRequest(latencyMs: number): void {
    this.metrics?.recordMcpRequest({ latencyMs });
  }

  /** Close the SDK's SQLite handle; a later `open()` re-opens it. */
  public close(): void {
    this.sdk?.close();
    this.sdk = null;
    this.freshness.reset();
  }

  /**
   * Detect whether the working tree has drifted from the index and, when it
   * has, incrementally refresh the index before reads are served. No-ops (with
   * an `unavailable` report) when no index exists yet.
   */
  public async ensureFresh(): Promise<FreshnessReport> {
    const sdk = this.open();
    if (sdk === null) {
      return { state: "unavailable", refreshed: false, checkedAt: new Date().toISOString() };
    }
    return this.freshness.ensureFresh(sdk);
  }
}
