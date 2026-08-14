import { resolve } from "node:path";
import type { FileTreeNode, ProjectScan } from "@atlas/sdk";
import { scanProjectOverview } from "@atlas/sdk";
import type { Command } from "commander";
import { resolveProjectRoot } from "./search";

interface ScanOptions {
  readonly repo?: string;
  readonly json?: boolean;
}

export function registerScan(program: Command): void {
  program
    .command("scan")
    .description("Show a hierarchical overview of a project tree (no indexing)")
    .option("--repo <path>", "repository path (defaults to ATLAS_ROOT or cwd)")
    .option("--json", "print the scan result as JSON")
    .action(async (options: ScanOptions) => {
      const root = options.repo === undefined ? resolveProjectRoot() : resolve(options.repo);
      const result = await scanProjectOverview(root as never);
      if (!result.ok) {
        console.error(result.error.message);
        process.exitCode = 1;
        return;
      }
      console.log(
        options.json === true
          ? JSON.stringify(result.value, null, 2)
          : renderOverview(result.value),
      );
    });
}

/** Render a hierarchical, human-readable overview of a project scan. */
export function renderOverview(scan: ProjectScan): string {
  const lines = [
    `${scan.name} — ${scan.totalFiles} files in ${scan.totalFolders} folders`,
    `Languages: ${scan.languages
      .slice(0, 6)
      .map((language) => `${language.name} (${language.fileCount})`)
      .join(", ")}`,
    `Framework: ${scan.framework ?? "none"}`,
    "",
  ];
  for (const node of scan.tree) {
    renderTreeNode(node, "", lines);
  }
  return lines.join("\n");
}

function renderTreeNode(node: FileTreeNode, prefix: string, lines: string[]): void {
  const isDir = node.type === "directory";
  lines.push(`${prefix}${isDir ? "[d]" : "   "} ${node.name}${isDir ? "/" : ""}`);
  const childPrefix = `${prefix}  `;
  for (const child of node.children) {
    renderTreeNode(child, childPrefix, lines);
  }
}
