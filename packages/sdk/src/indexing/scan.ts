import type { ProjectScan } from "@atlas/core";
import { ScannerService } from "@atlas/scanner";
import type { FilePath, Result } from "@atlas/shared";

/**
 * Scan a project directory and return its structured metadata overview.
 *
 * This is the SDK-owned surface for filesystem-only project inspection: it
 * wraps `@atlas/scanner` (no parsing, no AI, no persistence) so consumers like
 * the CLI can produce a hierarchical overview without touching the scanner
 * package directly. Returns the structured {@link ProjectScan} (file tree,
 * totals, languages, framework, markers), or a failure when the root does not
 * exist or cannot be read.
 */
export async function scanProjectOverview(rootPath: FilePath): Promise<Result<ProjectScan>> {
  return new ScannerService().scanProject(rootPath);
}
