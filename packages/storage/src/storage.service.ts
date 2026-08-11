import { createHash } from "node:crypto";
import type { Project, SourceFile, StoragePort, Symbol } from "@atlas/core";
import type { FilePath, ProjectId, Result } from "@atlas/shared";
import { fail, ok } from "@atlas/shared";
import { ContextStore } from "./context-store";

/** Options for constructing a {@link StorageService}. */
export interface StorageServiceOptions {
  /** The underlying store; defaults to an in-memory context database. */
  readonly store?: ContextStore;
}

/** Metadata key holding the JSON-encoded {@link Project}. */
const PROJECT_KEY = "project";

/**
 * Persists and rehydrates project/file/symbol data, satisfying the legacy
 * `StoragePort` contract over a {@link ContextStore} (a SQLite context
 * database). Synchronous store calls are surfaced as async `Result`s.
 */
export class StorageService implements StoragePort {
  private readonly store: ContextStore;

  public constructor(options: StorageServiceOptions = {}) {
    this.store = options.store ?? new ContextStore({ filePath: ":memory:" });
  }

  public async saveProject(project: Project): Promise<Result<void>> {
    try {
      this.store.updateContext({ metadata: { [PROJECT_KEY]: JSON.stringify(project) } });
      return ok(undefined);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public async loadProject(id: ProjectId): Promise<Result<Project | undefined>> {
    try {
      const raw = this.store.loadContext().metadata?.[PROJECT_KEY];
      if (raw === undefined) {
        return ok(undefined);
      }
      const parsed = JSON.parse(raw) as Partial<Project>;
      if (
        parsed.id !== id ||
        typeof parsed.id !== "string" ||
        typeof parsed.name !== "string" ||
        typeof parsed.rootPath !== "string"
      ) {
        return ok(undefined);
      }
      return ok({
        id: parsed.id as ProjectId,
        name: parsed.name,
        rootPath: parsed.rootPath as FilePath,
      });
    } catch (error) {
      return fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public async saveFiles(files: readonly SourceFile[]): Promise<Result<void>> {
    try {
      const hashes: Record<string, string> = {};
      for (const file of files) {
        hashes[file.path] = sha256(file.content);
      }
      this.store.updateContext({ files: [...files], hashes });
      return ok(undefined);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public async saveSymbols(symbols: readonly Symbol[]): Promise<Result<void>> {
    try {
      this.store.updateContext({ symbols: [...symbols] });
      return ok(undefined);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
