import type { DependencyContext, ModuleContext, ProjectOverview, Summary } from "@atlas/sdk";
import type { EditorSymbol } from "../client";
import type { VscodeTreeItemBase } from "../vscode-host";

/**
 * Pure builders that map CodeAtlas SDK models to editor tree items.
 * No `vscode` dependency here — these are unit tested directly.
 */
const NONE = 0 as const;
const COLLAPSED = 1 as const;
const EXPANDED = 2 as const;

/** The root node of the project overview tree. */
export function projectRootNode(overview: ProjectOverview): VscodeTreeItemBase {
  return {
    label: projectName(overview.repositoryPath),
    description: `${overview.counts.files} files · ${overview.counts.symbols} symbols`,
    collapsibleState: EXPANDED,
    contextValue: "codeatlas.project",
    tooltip: overview.repositoryPath,
  };
}

/** Children of the project node: counts, languages, saved-at, summary. */
export function projectOverviewChildren(overview: ProjectOverview): VscodeTreeItemBase[] {
  const nodes: VscodeTreeItemBase[] = [
    stat("Files", overview.counts.files),
    stat("Symbols", overview.counts.symbols),
    stat("Modules", overview.counts.modules),
    stat("Dependencies", overview.counts.dependencies),
    stat("Summaries", overview.counts.summaries),
    { label: "Languages", collapsibleState: COLLAPSED, contextValue: "codeatlas.languages" },
    {
      label: "Saved at",
      description: overview.savedAt === "" ? "never" : overview.savedAt.slice(0, 10),
      collapsibleState: NONE,
    },
    {
      label: "Schema version",
      description: String(overview.schemaVersion),
      collapsibleState: NONE,
    },
  ];
  if (overview.summary !== undefined) {
    nodes.push({
      label: "Project summary",
      description: truncate(overview.summary.content.overview, 60),
      collapsibleState: NONE,
    });
  }
  return nodes;
}

/** Children of the "Languages" group node. */
export function languageChildren(overview: ProjectOverview): VscodeTreeItemBase[] {
  return languageEntries(overview).map(([language, count]) => ({
    label: language,
    description: String(count),
    collapsibleState: NONE,
  }));
}

/** Grouped symbol rows (per symbol kind). */
export function symbolGroupNodes(symbols: readonly EditorSymbol[]): VscodeTreeItemBase[] {
  const kinds = [...new Set(symbols.map((symbol) => symbol.kind))].sort();
  return kinds.map((kind) => ({
    label: kind,
    description: String(symbols.filter((symbol) => symbol.kind === kind).length),
    collapsibleState: COLLAPSED,
    contextValue: "codeatlas.symbol-group",
  }));
}

/** The symbol rows under a `codeatlas.symbol-group` kind node. */
export function symbolRowsForKind(
  kind: string,
  symbols: readonly EditorSymbol[],
): VscodeTreeItemBase[] {
  return symbols
    .filter((symbol) => symbol.kind === kind)
    .map((symbol) => ({
      label: symbol.name,
      description: `${symbol.filePath.split("/").pop()}:${symbol.line}`,
      collapsibleState: NONE,
      contextValue: "codeatlas.symbol",
      ...(symbol.documentation !== null ? { tooltip: symbol.documentation } : {}),
      command: { command: "codeatlas.openFile", title: "Open file", arguments: [symbol] },
    }));
}

/** The module rows in the modules tree. */
export function moduleNodes(modules: readonly ModuleContext[]): VscodeTreeItemBase[] {
  return modules.map((module) => ({
    label: module.name,
    description: module.path,
    collapsibleState: COLLAPSED,
    contextValue: "codeatlas.module",
  }));
}

/** The file rows under a module (paths relative to the module). */
export function moduleFileNodes(
  modulePath: string,
  files: readonly { readonly path: string; readonly language: string }[],
): VscodeTreeItemBase[] {
  return files
    .filter((file) => file.path.startsWith(`${modulePath}/`) || file.path === modulePath)
    .map((file) => ({
      label: file.path.startsWith(`${modulePath}/`)
        ? file.path.slice(modulePath.length + 1)
        : file.path,
      description: file.language,
      collapsibleState: NONE,
      contextValue: "codeatlas.file",
    }));
}

/** The summary rows (summaries tree). */
export function summaryNodes(summaries: readonly Summary[]): VscodeTreeItemBase[] {
  return summaries.map((summary) => ({
    label: summary.target === "" ? "Project" : summary.target,
    description: truncate(summary.content.overview, 80),
    collapsibleState: NONE,
    contextValue: `codeatlas.summary:${summary.kind}`,
  }));
}

/** Dependency graph grouped by source label. */
export function dependencyGroupNodes(edges: readonly DependencyContext[]): VscodeTreeItemBase[] {
  const sources = [...new Set(edges.map((edge) => edge.fromLabel))].sort();
  return sources.map((source) => ({
    label: source,
    description: String(edges.filter((edge) => edge.fromLabel === source).length),
    collapsibleState: COLLAPSED,
    contextValue: "codeatlas.dep-source",
  }));
}

/** The edge rows under a dependency source group. */
export function dependencyEdgeNodes(
  source: string,
  dependencies: readonly DependencyContext[],
): VscodeTreeItemBase[] {
  return dependencies
    .filter((edge) => edge.fromLabel === source)
    .sort((a, b) => a.toLabel.localeCompare(b.toLabel))
    .map((edge) => ({
      label: `→ ${edge.toLabel}`,
      description: edge.kind,
      collapsibleState: NONE,
      contextValue: "codeatlas.dep-edge",
    }));
}

/** A menu node representing a stat (count). */
function stat(label: string, value: number): VscodeTreeItemBase {
  return { label, description: String(value), collapsibleState: NONE };
}

/** The project's last path segment, or the full path when none exists. */
function projectName(repositoryPath: string): string {
  const parts = repositoryPath.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? (parts[parts.length - 1] ?? repositoryPath) : repositoryPath;
}

function languageEntries(overview: ProjectOverview): readonly [string, number][] {
  return Object.entries(overview.languages).sort(([, left], [, right]) => right - left);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
