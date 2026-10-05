import chokidar from "chokidar";
import type { Result } from "@prof-bilal/atlas-shared";
import { type IndexResult, indexProject } from "../indexing/indexer";

/** Options for {@link createWatcher}. */
export interface WatcherOptions {
  /** Repository root to watch and re-index. */
  readonly repositoryPath: string;
  /** Debounce window for bursts of file events (default 300ms). */
  readonly debounceMs?: number;
  /** Directory names never watched (default `.git`, `.codeatlas`, build dirs). */
  readonly ignoredDirs?: readonly string[];
  /** Called after each incremental re-index (success or failure). */
  readonly onIndex?: (result: Result<IndexResult>) => void;
  /** Called on watcher/index errors. */
  readonly onError?: (error: Error) => void;
}

/** A running repository watcher. */
export interface Watcher {
  /** Resolve once the underlying watcher is ready. */
  start(): Promise<void>;
  /** Stop watching and release resources. */
  close(): Promise<void>;
  /** Run an incremental re-index immediately (manual trigger / tests). */
  trigger(): Promise<void>;
}

const DEFAULT_IGNORED_DIRS = [".git", ".codeatlas", "node_modules", "dist", "build", "coverage"];

/**
 * Watch a repository and run the existing incremental indexer (`indexProject`
 * with `mode: "update"`) after a debounced burst of file changes. Reuses the
 * hashing + no-op fast path, so only changed files are re-parsed and an idle
 * repo does no work. Changes under ignored directories are never watched.
 */
export function createWatcher(options: WatcherOptions): Watcher {
  const debounceMs = options.debounceMs ?? 300;
  const ignoredDirs = options.ignoredDirs ?? DEFAULT_IGNORED_DIRS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let pending = false;
  let closed = false;

  const fsWatcher = chokidar.watch(options.repositoryPath, {
    ignoreInitial: true,
    ignored: (path: string) =>
      ignoredDirs.some((dir) => path.includes(`/${dir}/`) || path.endsWith(`/${dir}`)),
  });

  const runIndex = async (): Promise<void> => {
    if (closed) {
      return;
    }
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      const result = await indexProject({ repositoryPath: options.repositoryPath, mode: "update" });
      options.onIndex?.(result);
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      running = false;
      if (pending) {
        pending = false;
        schedule();
      }
    }
  };

  const schedule = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      void runIndex();
    }, debounceMs);
  };

  fsWatcher.on("all", () => schedule());
  fsWatcher.on("error", (error: unknown) => {
    options.onError?.(error instanceof Error ? error : new Error(String(error)));
  });

  return {
    start: () =>
      new Promise<void>((resolve) => {
        fsWatcher.once("ready", () => resolve());
      }),
    close: async () => {
      closed = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      await fsWatcher.close();
    },
    trigger: runIndex,
  };
}
