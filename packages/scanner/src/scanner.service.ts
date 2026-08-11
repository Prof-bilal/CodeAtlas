import type {
  DetectedFileType,
  DetectedLanguage,
  FileTreeNode,
  ProjectScan,
  ScannerPort,
  ScannedFile,
  SourceFile,
} from "@atlas/core";
import { readdir, readFile as readFileAsync, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { FilePath, Result } from "@atlas/shared";
import { fail, ok } from "@atlas/shared";
import { detectFramework, type FrameworkSignals } from "./framework";
import { createIgnoreMatcher, DEFAULT_IGNORED_DIRECTORIES } from "./ignore";
import { detectLanguageByName, extensionOf, LANGUAGE_BY_EXTENSION } from "./language";

/** Configuration for a {@link ScannerService}. */
export interface ScannerOptions {
  /**
   * Directory names to ignore, matched case-insensitively.
   * Defaults to {@link DEFAULT_IGNORED_DIRECTORIES}.
   */
  readonly ignoredDirectories?: readonly string[];
  /**
   * Maximum directory depth to descend below the root (`0` = root only).
   * `undefined` means unlimited depth.
   */
  readonly maxDepth?: number;
}

/** Result of walking one directory. */
interface WalkResult {
  readonly node: FileTreeNode;
  readonly files: readonly ScannedFile[];
  readonly dotFolders: number;
}

/** Read a JSON file, tolerating parse errors. */
async function readJson(path: string): Promise<Readonly<Record<string, unknown>> | null> {
  try {
    const raw = await readFileAsync(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Readonly<Record<string, unknown>>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Recursively scan a project directory and collect metadata using the default
 * configuration.
 *
 * This is the convenience entry point of `@atlas/scanner`. No parsing, AI, or
 * persistence is performed — the result is metadata only.
 *
 * @param rootPath - Absolute path of the project root to scan.
 * @returns A {@link Result} wrapping the structured {@link ProjectScan}, or a
 *   failure when the root does not exist or cannot be read.
 */
export async function scanProject(rootPath: FilePath): Promise<Result<ProjectScan>> {
  return new ScannerService().scanProject(rootPath);
}

/**
 * Discover the filesystem layout of a project.
 *
 * Implements {@link ScannerPort} from `@atlas/core`.
 */
export class ScannerService implements ScannerPort {
  private readonly ignored: readonly string[] = DEFAULT_IGNORED_DIRECTORIES;
  private readonly maxDepth: number | undefined;

  public constructor(options: ScannerOptions = {}) {
    this.ignored = options.ignoredDirectories ?? DEFAULT_IGNORED_DIRECTORIES;
    this.maxDepth = options.maxDepth;
  }

  /**
   * Recursively scan the directory at `rootPath` and return a structured
   * metadata snapshot (file tree, totals, languages, framework, markers).
   *
   * @param rootPath - Absolute path of the project root to scan.
   * @returns A {@link Result} wrapping the {@link ProjectScan}, or a failure
   *   when the root does not exist or cannot be read.
   */
  public async scanProject(rootPath: FilePath): Promise<Result<ProjectScan>> {
    const root = resolve(rootPath);

    if (!(await this.isDirectory(root))) {
      return fail(new Error(`Scan root does not exist: ${root}`));
    }

    try {
      const ignore = createIgnoreMatcher(this.ignored);
      const walked = await this.walkDirectory(root, ignore, 0);
      const markers = await this.collectRootMarkers(root);

      return ok({
        name: basename(root),
        rootPath,
        totalFiles: walked.files.length,
        totalFolders: walked.dotFolders,
        tree: walked.node.children,
        files: walked.files,
        fileTypes: groupByExtension(walked.files),
        languages: groupByLanguage(walked.files),
        framework: detectFramework(markers),
        hasPackageJson: markers.rootEntries.includes("package.json"),
        hasTsconfig: markers.rootEntries.includes("tsconfig.json"),
        hasReadme: markers.rootEntries.some((name) => isReadmeName(name)),
        isGitRepository: markers.rootEntries.includes(".git"),
      });
    } catch (error) {
      return fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Read and decode a single source file into a {@link SourceFile}.
   *
   * @param path - Absolute path of the file to read.
   * @returns A {@link Result} wrapping the {@link SourceFile} (with its
   *   detected language), or a failure when the file cannot be read.
   */
  public async readFile(path: FilePath): Promise<Result<SourceFile>> {
    try {
      const content = await readFileAsync(path, "utf8");
      return ok({
        path,
        language: detectLanguageByName(basename(path)) ?? "text",
        content,
      });
    } catch (error) {
      return fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async isDirectory(path: string): Promise<boolean> {
    try {
      return (await stat(path)).isDirectory();
    } catch {
      return false;
    }
  }

  private async walkDirectory(
    dir: string,
    ignore: (name: string) => boolean,
    depth: number,
  ): Promise<WalkResult> {
    const entries = await readdir(dir, { withFileTypes: true });
    const children: FileTreeNode[] = [];
    const files: ScannedFile[] = [];
    let dotFolders = 0;
    const shouldRecurse = this.maxDepth === undefined || depth + 1 <= this.maxDepth;

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (ignore(entry.name)) {
          continue;
        }
        dotFolders += 1;
        if (shouldRecurse) {
          const sub = await this.walkDirectory(fullPath, ignore, depth + 1);
          dotFolders += sub.dotFolders;
          files.push(...sub.files);
          children.push(sub.node);
        } else {
          children.push({
            name: entry.name,
            path: fullPath as FilePath,
            type: "directory",
            children: [],
          });
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      files.push({
        path: fullPath as FilePath,
        name: entry.name,
        extension: extensionOf(entry.name),
        sizeBytes: await this.fileSize(fullPath),
        language: detectLanguageByName(entry.name),
      });
      children.push({
        name: entry.name,
        path: fullPath as FilePath,
        type: "file",
        children: [],
      });
    }

    return {
      node: {
        name: basename(dir),
        path: dir as FilePath,
        type: "directory",
        children: sortTreeArray(children),
      },
      files,
      dotFolders,
    };
  }

  private async fileSize(path: string): Promise<number> {
    try {
      return (await stat(path)).size;
    } catch {
      return 0;
    }
  }

  private async collectRootMarkers(
    root: string,
  ): Promise<FrameworkSignals & { readonly rootEntries: readonly string[] }> {
    let rootEntries: string[] = [];
    try {
      rootEntries = await readdir(root);
    } catch {
      rootEntries = [];
    }
    const existsRoot = (name: string): boolean => rootEntries.includes(name);

    return {
      packageJson: await readJson(join(root, "package.json")),
      hasTsconfig: existsRoot("tsconfig.json"),
      hasNextBuildFolder: existsRoot(".next"),
      hasRequirementsFile: existsRoot("requirements.txt") || existsRoot("requirements.in"),
      hasPyprojectFile: existsRoot("pyproject.toml") || existsRoot("setup.py"),
      hasGoMod: existsRoot("go.mod"),
      hasCargoToml: existsRoot("Cargo.toml"),
      hasPomXml: existsRoot("pom.xml"),
      hasGemfile: existsRoot("Gemfile"),
      rootEntries,
    };
  }
}

/** Heuristic for README file names (e.g. `README.md`, `README`). */
function isReadmeName(name: string): boolean {
  return /^readme(\.|$)/i.test(name);
}

/** Group scanned files by extension, most common first. */
function groupByExtension(files: readonly ScannedFile[]): DetectedFileType[] {
  const counts = new Map<string | null, number>();
  for (const file of files) {
    counts.set(file.extension, (counts.get(file.extension) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([extension, count]) => ({
      extension,
      count,
      language: extension === null ? null : (LANGUAGE_BY_EXTENSION[extension] ?? null),
    }))
    .sort((a, b) => b.count - a.count);
}

/** Group scanned files by language, most common first. */
function groupByLanguage(files: readonly ScannedFile[]): DetectedLanguage[] {
  const byLanguage = new Map<string, { fileCount: number; extensions: Set<string | null> }>();

  for (const file of files) {
    const language = file.language;
    if (language === null) {
      continue;
    }
    let group = byLanguage.get(language);
    if (group === undefined) {
      group = { fileCount: 0, extensions: new Set() };
      byLanguage.set(language, group);
    }
    group.fileCount += 1;
    group.extensions.add(file.extension);
  }

  return [...byLanguage.entries()]
    .map(([name, group]) => ({
      name,
      fileCount: group.fileCount,
      extensions: [...group.extensions].filter(
        (extension): extension is string => extension !== null,
      ),
    }))
    .sort((a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name));
}

/** Sort a list of tree nodes: folders first, then children by name. */
function sortTreeArray(nodes: readonly FileTreeNode[]): FileTreeNode[] {
  return nodes.map(sortTree).sort(compareNodes);
}

/** Recursively sort a single tree node's children. */
function sortTree(node: FileTreeNode): FileTreeNode {
  return { ...node, children: sortTreeArray(node.children) };
}

function compareNodes(a: FileTreeNode, b: FileTreeNode): number {
  if (a.type !== b.type) {
    return a.type === "directory" ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}
