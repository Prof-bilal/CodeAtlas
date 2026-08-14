import { mkdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type {
  ContextData,
  PersistedDependency,
  PersistedModule,
  Symbol as PersistedSymbol,
  SourceFile,
} from "@atlas/core";
import { GraphService } from "@atlas/graph";
import { HashService } from "@atlas/hashing";
import { ParserService } from "@atlas/parser";
import { ScannerService, generateManifest } from "@atlas/scanner";
import { type FilePath, type Result, fail, ok } from "@atlas/shared";
import { ContextStore } from "@atlas/storage";
import { fileNodeId, symbolNodeId } from "../context/nodes";

export interface IndexRequest {
  readonly repositoryPath: string;
  readonly dbPath?: string;
  readonly mode?: "build" | "update";
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
    const previousContext = store.loadContext();
    const previousHashes = previousContext.hashes ?? {};
    const diff = hasher.compareHashes({ hashes: previousHashes }, current.value);
    const mode = request.mode ?? "build";
    const incremental = mode === "update" && Object.keys(previousHashes).length > 0;

    // Files that must be re-read and re-parsed: every TypeScript file for a
    // full build, or only changed + added files for an incremental update.
    const filesToReparse = new Set<string>(diff.changed);
    for (const path of diff.added) {
      filesToReparse.add(path);
    }

    const previousFiles = new Map<string, SourceFile>();
    for (const file of previousContext.files ?? []) {
      previousFiles.set(file.path, file);
    }
    const previousSymbolsByFile = new Map<string, PersistedSymbol[]>();
    for (const symbol of previousContext.symbols ?? []) {
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
    for (const scanned of scan.value.files) {
      if (scanned.language !== "typescript") {
        continue;
      }
      if (!incremental || filesToReparse.has(scanned.path)) {
        const file = await scanner.readFile(scanned.path);
        if (file.ok) {
          sourceFiles.push(file.value);
          filesToParse.push(file.value);
          reparsePaths.add(scanned.path);
        }
      } else {
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
    const deletedSet = new Set(diff.deleted);
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
    const exported = await graph.exportJson();
    if (!exported.ok) return fail(exported.error);
    const graphData = JSON.parse(exported.value) as {
      readonly edges: readonly {
        readonly from: string;
        readonly to: string;
        readonly kind: string;
      }[];
    };
    const dependencies: PersistedDependency[] = graphData.edges.map((edge) => ({
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
      for (const edge of previousContext.dependencies ?? []) {
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
    const data: ContextData = {
      files: sourceFiles,
      symbols: mergedSymbols,
      dependencies,
      modules,
      hashes: current.value.hashes,
      metadata: { repositoryPath, manifestPath: manifest.value.path },
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
    });
  } catch (error) {
    return fail(error instanceof Error ? error : new Error(String(error)));
  } finally {
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
