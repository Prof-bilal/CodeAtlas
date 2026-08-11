import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createContextSDK, type ContextSDK } from "@atlas/sdk";
import { ToolDomainError } from "./validation";

export interface CodeAtlasContextOptions {
  /** Project root; resolves `.codeatlas/context.db` inside it. */
  readonly root?: string;
  /** Explicit path to the context database file (overrides `root`). */
  readonly dbPath?: string;
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

  public constructor(options: CodeAtlasContextOptions = {}) {
    const config = resolveContextConfig(options);
    this.root = config.root;
    this.dbPath = config.dbPath;
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
    this.sdk ??= createContextSDK({ dbPath: this.dbPath });
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

  /** Close the SDK's SQLite handle; a later `open()` re-opens it. */
  public close(): void {
    this.sdk?.close();
    this.sdk = null;
  }
}
