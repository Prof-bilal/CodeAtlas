import { mkdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { CacheService } from "@atlas/cache";
import type {
  ContextData,
  PersistedDependency,
  PersistedModule,
  Symbol as PersistedSymbol,
  SourceFile,
  Summary,
  SummaryPort,
} from "@atlas/core";
import { GraphService } from "@atlas/graph";
import { HashService } from "@atlas/hashing";
import { ParserService } from "@atlas/parser";
import { ScannerService, generateManifest } from "@atlas/scanner";
import {
  type FilePath,
  type Result,
  DEFAULT_CONCURRENCY,
  fail,
  mapWithConcurrency,
  ok,
} from "@atlas/shared";
import { ContextStore } from "@atlas/storage";
import { SummaryService } from "@atlas/summary";
import { fileNodeId, symbolNodeId } from "../context/nodes";
import { createProviderService } from "../providers/index";

export interface IndexRequest {
  readonly repositoryPath: string;
  readonly dbPath?: string;
  readonly mode?: "build" | "update";
  /**
   * Generate an AI file summary for every freshly parsed file after indexing
   * (AI is optional; without a provider the failures are counted, not fatal).
   */
  readonly summaries?: boolean;
  /** Summary port override (defaults to a provider-backed service). */
  readonly summary?: SummaryPort;
}

export interface IndexResult {
  readonly repositoryPath: string;
  readonly dbPath: string;
  readonly mode: "build" | "update";
  readonly files: number;
  readonly parsedFiles: number;
  readonly skippedFiles: number;
  readonly symbols: number;
  readonly dependencies: number;
  readonly added: number;
  readonly changed: number;
  readonly deleted: number;
  readonly unchanged: number;
  readonly manifestPath: string;
  /** File summaries generated and stored when `summaries` was requested. */
  readonly summaries: number;
  /** Files whose summary generation failed (e.g. no provider configured). */
  readonly summariesFailed: number;
}

/**
 * Edge kinds that originate from in-file usage references. Only these need to
 * be carried over from the previous run during an incremental update, because
 * the regenerated graph recomputes every other edge (imports, exports,
 * contains, module imports) from the merged symbol set alone.
 */
const USAGE_EDGE_KINDS = new Set([
  "calls",
  "constructs",
  "accesses",
  "references",
  "reads",
  "writes",
  "extends",
  "implements",
]);

/**
 * SDK-owned deterministic scanner â†’ hash â†’ parser â†’ graph â†’ storage flow.
 *
 * `build` performs a full replace. `update` is incremental: only changed and
 * added files are re-read and re-parsed (unchanged files reuse the persisted
 * snapshot), deleted files are removed without leaving ghost entries, and the
 * store is merged via `updateContext` rather than replaced wholesale.
 */
export async function indexProject(request: IndexRequest): Promise<Result<IndexResult>> {
  const repositoryPath = resolve(request.repositoryPath);
  const dbPath = resolve(request.dbPath ?? join(repositoryPath, ".codeatlas", "context.db"));
  const scanner = new ScannerService();
  const hasher = new HashService();
  const parser = new ParserService();
  const graph = new GraphService();
  let store: ContextStore | undefined;

  try {
    await mkdir(dirname(dbPath), { recursive: true });
    store = new ContextStore({ filePath: dbPath });
    const scan = await scanner.scanProject(repositoryPath as FilePath);
    if (!scan.ok) return fail(scan.error);
    const manifest = await generateManifest(scan.value, { rootPath: repositoryPath });
    if (!manifest.ok) return fail(manifest.error);

    const paths = scan.value.files.map((file) => file.path);
    const current = await hasher.buildSnapshot(paths);
    if (!current.ok) return fail(current.error);
    const mode = request.mode ?? "build";
    // Change detection reads only the persisted hashes (one table), not the
    // whole context snapshot: a no-op `update` must not materialize every file
    // body, symbol, and edge just to discover that nothing changed.
    const previousHashes = store.loadHashes();
    const diff = hasher.compareHashes({ hashes: previousHashes }, current.value);
    const incremental = mode === "update" && Object.keys(previousHashes).length > 0;

    // Files that must be re-read and re-parsed: every TypeScript file for a
    // full build, or only changed + added files for an incremental update.
    const filesToReparse = new Set<string>(diff.changed);
    for (const path of diff.added) {
      filesToReparse.add(path);
    }
    const deletedSet = new Set<string>(diff.deleted);
    const scannedTsFiles = scan.value.files.filter((scanned) => scanned.language === "typescript");

    // Incremental no-op fast path: nothing changed on disk, so there is
    // nothing to re-read, re-parse, or rewrite. Refreshing the saved-at
    // timestamp is one metadata row; the multi-second full `updateContext` +
    // VACUUM cycle is skipped entirely.
    if (incremental && filesToReparse.size === 0 && deletedSet.size === 0) {
      store.updateContext({});
      const stats = store.stats();
      return ok({
        repositoryPath,
        dbPath,
        mode,
        files: scannedTsFiles.length,
        parsedFiles: 0,
        skippedFiles: 0,
        symbols: stats.symbols,
        dependencies: stats.dependencies,
        added: 0,
        changed: 0,
        deleted: 0,
        unchanged: diff.unchangedCount,
        manifestPath: manifest.value.path,
        summaries: 0,
        summariesFailed: 0,
      });
    }

    // Only incremental updates need the persisted files/symbols/edges; a full
    // `build` replaces everything and only ever needed the hash diff above.
    const previousContext = incremental ? store.loadContext() : undefined;
    const previousFiles = new Map<string, SourceFile>();
    for (const file of previousContext?.files ?? []) {
      previousFiles.set(file.path, file);
    }
    const previousSymbolsByFile = new Map<string, PersistedSymbol[]>();
    for (const symbol of previousContext?.symbols ?? []) {
      const list = previousSymbolsByFile.get(symbol.filePath);
      if (list === undefined) {
        previousSymbolsByFile.set(symbol.filePath, [symbol]);
      } else {
        list.push(symbol);
      }
    }

    const reparsePaths = new Set<string>();
    const sourceFiles: SourceFile[] = [];
    const filesToParse: SourceFile[] = [];
    const toRead = scannedTsFiles.filter(
      (scanned) => !incremental || filesToReparse.has(scanned.path),
    );
    const readFiles = await mapWithConcurrency(toRead, DEFAULT_CONCURRENCY, async (scanned) => {
      const file = await scanner.readFile(scanned.path);
      return file.ok ? file.value : null;
    });
    for (const file of readFiles) {
      if (file === null) {
        continue;
      }
      sourceFiles.push(file);
      filesToParse.push(file);
      reparsePaths.add(file.path);
    }
    if (incremental) {
      for (const scanned of scannedTsFiles) {
        if (filesToReparse.has(scanned.path)) {
          continue;
        }
        const existing = previousFiles.get(scanned.path);
        if (existing !== undefined) {
          sourceFiles.push(existing);
        }
      }
    }
    const parsed = await parser.parseFiles(filesToParse);

    // Merged symbol set: unchanged files keep their persisted symbols; changed
    // and added files contribute freshly-parsed symbols; deleted files drop
    // theirs. PersistedSymbol ids are deterministic (file + span), so persisted ids and
    // graph edges remain stable across runs.
    const mergedSymbols: PersistedSymbol[] = [];
    for (const [filePath, symbols] of previousSymbolsByFile) {
      if (deletedSet.has(filePath) || reparsePaths.has(filePath)) {
        continue;
      }
      mergedSymbols.push(...symbols);
    }
    for (const file of parsed.parsed) {
      mergedSymbols.push(...file.symbols);
    }

    const references = parsed.parsed.flatMap((file) => file.references);
    graph.build(mergedSymbols, references);
    const exported = await graph.exportEdges();
    if (!exported.ok) return fail(exported.error);
    const dependencies: PersistedDependency[] = exported.value.map((edge) => ({
      from: edge.from as never,
      to: edge.to as never,
      kind: edge.kind,
    }));

    if (incremental) {
      // Unchanged files were not re-parsed, so their usage edges are not
      // regenerated. Carry over the previous usage edges whose endpoints are
      // untouched (not changed/added/deleted) and still present, so the graph
      // stays complete. Import/export/contains/module edges are already
      // regenerated from the merged symbol set and must not be duplicated.
      const touched = new Set<string>();
      for (const path of reparsePaths) {
        touched.add(fileNodeId(path));
        for (const symbol of previousSymbolsByFile.get(path) ?? []) {
          touched.add(symbolNodeId(symbol.id));
        }
      }
      for (const path of deletedSet) {
        touched.add(fileNodeId(path));
        for (const symbol of previousSymbolsByFile.get(path) ?? []) {
          touched.add(symbolNodeId(symbol.id));
        }
      }
      const nodeIds = new Set<string>();
      for (const edge of dependencies) {
        nodeIds.add(edge.from);
        nodeIds.add(edge.to);
      }
      for (const edge of previousContext?.dependencies ?? []) {
        if (!USAGE_EDGE_KINDS.has(edge.kind)) {
          continue;
        }
        if (touched.has(edge.from) || touched.has(edge.to)) {
          continue;
        }
        if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
          continue;
        }
        dependencies.push(edge);
      }
    }

    const modules = buildModules(repositoryPath, paths);

    // Optional AI enrichment: generate a file summary per freshly parsed file.
    // Summaries are cached by content hash, so unchanged files hit the cache on
    // later runs; a missing provider (or any generation failure) degrades
    // cleanly by counting the failure instead of aborting the build.
    const summaries: Summary[] = [];
    let summariesFailed = 0;
    if (request.summaries === true) {
      const summaryPort =
        request.summary ??
        new SummaryService({
          provider: createProviderService(),
          cache: new CacheService(),
          hash: new HashService(),
        });
      const results = await mapWithConcurrency(filesToParse, DEFAULT_CONCURRENCY, async (file) =>
        summaryPort.summarizeFile(file),
      );
      for (const summary of results) {
        if (summary.ok) {
          summaries.push(summary.value);
        } else {
          summariesFailed += 1;
        }
      }
    }

    const data: ContextData = {
      files: sourceFiles,
      symbols: mergedSymbols,
      dependencies,
      modules,
      hashes: current.value.hashes,
      metadata: { repositoryPath, manifestPath: manifest.value.path },
      ...(summaries.length > 0 ? { summaries } : {}),
    };

    if (incremental) {
      // Drop the stale entries for changed + deleted files (cascades symbols,
      // summaries, hashes, and graph edges), prune removed folder modules, then
      // merge the new state over whatever is left.
      for (const path of [...reparsePaths, ...deletedSet]) {
        store.deleteContext({ kind: "file", path: path as FilePath });
      }
      store.pruneModules(modules.map((module) => module.path));
      store.updateContext(data);
    } else {
      store.saveContext(data);
    }

    return ok({
      repositoryPath,
      dbPath,
      mode,
      files: sourceFiles.length,
      parsedFiles: parsed.parsed.length,
      skippedFiles: parsed.skipped.length,
      symbols: mergedSymbols.length,
      dependencies: dependencies.length,
      added: diff.addedCount,
      changed: diff.changedCount,
      deleted: diff.deletedCount,
      unchanged: diff.unchangedCount,
      manifestPath: manifest.value.path,
      summaries: summaries.length,
      summariesFailed,
    });
  } catch (error) {
    return fail(error instanceof Error ? error : new Error(String(error)));
  } finally {
    store?.compact();
    store?.close();
  }
}

function buildModules(root: string, paths: readonly string[]): PersistedModule[] {
  const seen = new Set<string>();
  const modules: PersistedModule[] = [];
  for (const path of paths) {
    let current = dirname(path);
    while (current.startsWith(root) && current !== root) {
      const relativePath = relative(root, current).replace(/\\/g, "/");
      if (!seen.has(relativePath)) {
        seen.add(relativePath);
        modules.push({ path: current, name: relativePath, moduleType: "folder" });
      }
      current = dirname(current);
    }
  }
  return modules;
}
