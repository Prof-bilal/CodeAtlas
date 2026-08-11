import type { FilePath, Result } from "@atlas/shared";
import type { SourceFile } from "../domain/entities";
import type { ProjectScan } from "../domain/scan";

/** Discovers the filesystem layout of a project, honoring ignore rules. */
export interface ScannerPort {
  /**
   * Recursively scan the directory at `rootPath` and return a structured
   * metadata snapshot (file tree, totals, languages, framework, markers).
   * Implementations apply ignore rules (e.g. `node_modules`, `.git`, `dist`).
   */
  scanProject(rootPath: FilePath): Promise<Result<ProjectScan>>;

  /** Read and decode a single source file. */
  readFile(path: FilePath): Promise<Result<SourceFile>>;
}
