import type { ContextSnapshot } from "@atlas/core";
import type { FilePath, NodeId, SymbolId } from "@atlas/shared";

/**
 * A denormalized, language-agnostic record in the search index. One entry per
 * persisted file, symbol, module, dependency edge, or summary. Kind names match
 * {@link SearchHitKind} so the service can filter before scoring.
 */
export type IndexedEntity = FileEntry | SymbolEntry | ModuleEntry | DependencyEntry | SummaryEntry;

export interface FileEntry {
  readonly kind: "file";
  readonly path: string;
  readonly language: string;
  readonly content: string;
}

export interface SymbolEntry {
  readonly kind: "symbol";
  readonly id: string;
  readonly name: string;
  readonly symbolKind: string;
  readonly filePath: string;
  readonly documentation: string | null;
}

export interface ModuleEntry {
  readonly kind: "module";
  readonly path: string;
  readonly name: string;
  readonly moduleType: string;
}

export interface DependencyEntry {
  readonly kind: "dependency";
  readonly from: string;
  readonly to: string;
  /** Edge kind, e.g. `"imports"`, `"calls"`, `"extends"`. */
  readonly relation: string;
  /** Human-readable labels resolved from the snapshot (name / path). */
  readonly fromLabel: string;
  readonly toLabel: string;
}

export interface SummaryEntry {
  readonly kind: "summary";
  /** The path or project label being summarized. */
  readonly target: string;
  readonly summaryKind: string;
  readonly overview: string;
  readonly keyPoints: readonly string[];
}

/** Graph node id for a file (mirrors `@atlas/graph` without importing it). */
function fileNodeId(path: FilePath): NodeId {
  return `n:file:${path.replace(/\\/g, "/")}` as NodeId;
}

/** Graph node id for a symbol (mirrors `@atlas/graph` without importing it). */
function symbolNodeId(symbolId: SymbolId): NodeId {
  return `n:${symbolId}` as NodeId;
}

/**
 * Build the full search index from a stored context snapshot. Order follows the
 * snapshot collections; scoring and sorting happen at query time.
 */
export function buildIndex(snapshot: ContextSnapshot): readonly IndexedEntity[] {
  const entities: IndexedEntity[] = [];

  for (const file of snapshot.files ?? []) {
    entities.push({
      kind: "file",
      path: file.path,
      language: file.language,
      content: file.content,
    });
  }
  for (const symbol of snapshot.symbols ?? []) {
    entities.push({
      kind: "symbol",
      id: symbol.id,
      name: symbol.name,
      symbolKind: symbol.kind,
      filePath: symbol.filePath,
      documentation: symbol.documentation,
    });
  }
  for (const module of snapshot.modules ?? []) {
    entities.push({
      kind: "module",
      path: module.path,
      name: module.name,
      moduleType: module.moduleType,
    });
  }
  for (const summary of snapshot.summaries ?? []) {
    entities.push({
      kind: "summary",
      target: summary.target,
      summaryKind: summary.kind,
      overview: summary.content.overview,
      keyPoints: summary.content.keyPoints,
    });
  }

  const labels = buildNodeLabels(snapshot);
  for (const dependency of snapshot.dependencies ?? []) {
    entities.push({
      kind: "dependency",
      from: dependency.from,
      to: dependency.to,
      relation: dependency.kind,
      fromLabel: labels.get(dependency.from) ?? dependency.from,
      toLabel: labels.get(dependency.to) ?? dependency.to,
    });
  }

  return entities;
}

/** Map every known graph node id to a human-readable label for dependency hits. */
function buildNodeLabels(snapshot: ContextSnapshot): ReadonlyMap<NodeId, string> {
  const labels = new Map<NodeId, string>();
  for (const file of snapshot.files ?? []) {
    labels.set(fileNodeId(file.path), file.path);
  }
  for (const symbol of snapshot.symbols ?? []) {
    labels.set(symbolNodeId(symbol.id), `${symbol.name} (${symbol.filePath})`);
  }
  return labels;
}
