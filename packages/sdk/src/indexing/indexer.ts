import { mkdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type { ContextData, PersistedDependency, PersistedModule, SourceFile } from "@atlas/core";
import { GraphService } from "@atlas/graph";
import { HashService } from "@atlas/hashing";
import { ParserService } from "@atlas/parser";
import { ScannerService, generateManifest } from "@atlas/scanner";
import { type FilePath, type Result, fail, ok } from "@atlas/shared";
import { ContextStore } from "@atlas/storage";

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

/** SDK-owned deterministic scanner → hash → parser → graph → storage flow. */
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
    const previous = store.loadContext().hashes ?? {};
    const diff = hasher.compareHashes({ hashes: previous }, current.value);
    const sourceFiles: SourceFile[] = [];
    for (const scanned of scan.value.files) {
      if (scanned.language !== "typescript") continue;
      const file = await scanner.readFile(scanned.path);
      if (file.ok) sourceFiles.push(file.value);
    }
    const parsed = await parser.parseFiles(sourceFiles);
    const allSymbols = parsed.parsed.flatMap((file) => file.symbols);
    const allReferences = parsed.parsed.flatMap((file) => file.references);
    graph.build(allSymbols, allReferences);
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
    const modules = buildModules(repositoryPath, paths);
    const data: ContextData = {
      files: sourceFiles,
      symbols: allSymbols,
      dependencies,
      modules,
      hashes: current.value.hashes,
      metadata: { repositoryPath, manifestPath: manifest.value.path },
    };
    store.saveContext(data);
    return ok({
      repositoryPath,
      dbPath,
      mode: request.mode ?? "build",
      files: sourceFiles.length,
      parsedFiles: parsed.parsed.length,
      skippedFiles: parsed.skipped.length,
      symbols: allSymbols.length,
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
