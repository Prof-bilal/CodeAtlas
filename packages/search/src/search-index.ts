import type { ContextSnapshot } from "@atlas/core";
import type { FilePath, NodeId, SymbolId } from "@atlas/shared";

/**
 * A denormalized, language-agnostic record in the search index. One entry per
 * persisted file, symbol, module, dependency edge, or summary. Kind names match
 * {@link SearchHitKind} so the service can filter before scoring.
 *
 * `searchText` and `identifierLengths` are precomputed by {@link buildIndex}
 * for the lexical scorer's candidate prefilter. `searchText` is the
 * lowercased, normalized concatenation of every scoreable field, so a query
 * term that could match any field (exact/prefix/token/substring) is a
 * substring of it; `identifierLengths` are the lengths of the identifier-like
 * fields that participate in fuzzy matching, so the length-based fuzzy
 * prefilter (edit distance ≥ length difference) is exact. Both are optional
 * because callers may construct bare entities for direct scorer tests.
 */
export type IndexedEntity = FileEntry | SymbolEntry | ModuleEntry | DependencyEntry | SummaryEntry;

export interface IndexedEntityBase {
  /** Lowercased, slash-normalized concatenation of all scoreable fields. */
  readonly searchText?: string;
  /** Lengths of identifier-like fields that fuzzy matching may hit. */
  readonly identifierLengths?: readonly number[];
}

export interface FileEntry extends IndexedEntityBase {
  readonly kind: "file";
  readonly path: string;
  readonly language: string;
  readonly content: string;
}

export interface SymbolEntry extends IndexedEntityBase {
  readonly kind: "symbol";
  readonly id: string;
  readonly name: string;
  readonly symbolKind: string;
  readonly filePath: string;
  readonly documentation: string | null;
}

export interface ModuleEntry extends IndexedEntityBase {
  readonly kind: "module";
  readonly path: string;
  readonly name: string;
  readonly moduleType: string;
}

export interface DependencyEntry extends IndexedEntityBase {
  readonly kind: "dependency";
  readonly from: string;
  readonly to: string;
  /** Edge kind, e.g. `"imports"`, `"calls"`, `"extends"`. */
  readonly relation: string;
  /** Human-readable labels resolved from the snapshot (name / path). */
  readonly fromLabel: string;
  readonly toLabel: string;
}

export interface SummaryEntry extends IndexedEntityBase {
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

/** Lowercase and normalize a text field for comparison. */
function normalize(text: string): string {
  return text.toLowerCase().replaceAll("\\", "/");
}

/** The final path segment of a path, split on either separator. */
function pathBasename(path: string): string {
  const separator = path.includes("\\") ? "\\" : "/";
  const segments = path.split(separator);
  return segments[segments.length - 1] ?? path;
}

/**
 * Build the full search index from a stored context snapshot. Order follows the
 * snapshot collections; scoring and sorting happen at query time. Every entity
 * carries precomputed lowercase `searchText` and fuzzy-eligible
 * `identifierLengths` so the lexical scorer can prefilter candidates instead
 * of scoring the whole index per query.
 */
export function buildIndex(snapshot: ContextSnapshot): readonly IndexedEntity[] {
  const entities: IndexedEntity[] = [];

  for (const file of snapshot.files ?? []) {
    const basename = pathBasename(file.path);
    entities.push({
      kind: "file",
      path: file.path,
      language: file.language,
      content: file.content,
      searchText: normalize(`${basename}\n${file.path}\n${file.content}`),
      identifierLengths: [basename.length, file.path.length],
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
      searchText: normalize(`${symbol.name}\n${symbol.filePath}\n${symbol.documentation ?? ""}`),
      identifierLengths: [symbol.name.length, symbol.filePath.length],
    });
  }
  for (const module of snapshot.modules ?? []) {
    entities.push({
      kind: "module",
      path: module.path,
      name: module.name,
      moduleType: module.moduleType,
      searchText: normalize(`${module.name}\n${module.path}`),
      identifierLengths: [module.name.length, module.path.length],
    });
  }
  for (const summary of snapshot.summaries ?? []) {
    entities.push({
      kind: "summary",
      target: summary.target,
      summaryKind: summary.kind,
      overview: summary.content.overview,
      keyPoints: summary.content.keyPoints,
      searchText: normalize(
        `${summary.target}\n${summary.content.overview}\n${summary.content.keyPoints.join("\n")}`,
      ),
      identifierLengths: [summary.target.length, summary.content.overview.length],
    });
  }

  const labels = buildNodeLabels(snapshot);
  for (const dependency of snapshot.dependencies ?? []) {
    const fromLabel = labels.get(dependency.from) ?? dependency.from;
    const toLabel = labels.get(dependency.to) ?? dependency.to;
    entities.push({
      kind: "dependency",
      from: dependency.from,
      to: dependency.to,
      relation: dependency.kind,
      fromLabel,
      toLabel,
      searchText: normalize(`${fromLabel}\n${toLabel}\n${dependency.kind}`),
      identifierLengths: [fromLabel.length, toLabel.length],
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
