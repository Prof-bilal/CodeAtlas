import type { ContextSnapshot } from "@atlas/core";

/**
 * A denormalized, language-agnostic record in the search index. One entry per
 * persisted file, symbol, module, or summary. Kind names match
 * {@link SearchHitKind} so the service can filter before scoring.
 *
 * Dependency edges are intentionally NOT indexed: they are structural metadata
 * served through the dependency graph API (`getDependencies`,
 * `getDependencyGraph`), not keyword search. Indexing every edge as a
 * searchable entity flooded top-k results (edge labels like "imports"/"calls"
 * match common query terms) and starved file/symbol hits.
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
export type IndexedEntity = FileEntry | SymbolEntry | ModuleEntry | SummaryEntry;

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
  /** First content window (≤ {@link MAX_INDEXED_CONTENT_CHARS}); backward-compatible field. */
  readonly content: string;
  /**
   * Windowed excerpts of the file body. Each window is ≤
   * {@link MAX_INDEXED_CONTENT_CHARS} chars, strided by
   * {@link CONTENT_WINDOW_STRIDE}; capped at {@link MAX_CONTENT_WINDOWS} per
   * file so index memory grows boundedly. Scoring takes the max over windows,
   * so a match past the old single-excerpt cliff is visible to ranking (F2).
   * Optional so entities constructed directly (unit tests, custom callers)
   * degrade to a single `content` window.
   */
  readonly contentWindows?: readonly ContentWindow[];
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

export interface SummaryEntry extends IndexedEntityBase {
  readonly kind: "summary";
  /** The path or project label being summarized. */
  readonly target: string;
  readonly summaryKind: string;
  readonly overview: string;
  readonly keyPoints: readonly string[];
}

/** One bounded excerpt of a file's content, with its char offset in the file. */
export interface ContentWindow {
  readonly content: string;
  /** Character offset of this window's start within the original file body. */
  readonly startChar: number;
}

/**
 * The maximum number of leading characters of a file's content that a single
 * index window retains for scoring/prefiltering. Retaining full bodies of huge
 * files duplicates the corpus text in memory (~2× with the lowercased
 * `searchText`); bounded windows keep identifier/prose matching working for
 * the common case while hard-capping the index's memory per file. Winning hits
 * fetch the full body on demand from the context database (see the Context
 * SDK).
 */
export const MAX_INDEXED_CONTENT_CHARS = 2000;

/** Overlap between consecutive content windows (stride). */
export const CONTENT_WINDOW_STRIDE = 1000;

/**
 * Maximum content windows retained per file. With a 2000-char window and
 * 1000-char stride this covers up to ~16 KB of body text per file — well past
 * the old single-excerpt cliff — while keeping index memory bounded (F2).
 */
export const MAX_CONTENT_WINDOWS = 8;

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
    const windows = contentWindows(file.content);
    const first = windows[0]?.content ?? "";
    const windowedText = windows.map((window) => window.content).join("\n");
    entities.push({
      kind: "file",
      path: file.path,
      language: file.language,
      content: first,
      contentWindows: windows,
      searchText: normalize(`${basename}\n${file.path}\n${windowedText}`),
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

  return entities;
}

/**
 * Window a file body into bounded, overlapping excerpts. Windows are ≤
 * {@link MAX_INDEXED_CONTENT_CHARS} chars with {@link CONTENT_WINDOW_STRIDE}
 * between starts, capped at {@link MAX_CONTENT_WINDOWS} per file. Each window
 * records its starting char offset for attribution. A file shorter than one
 * window yields a single full-body window.
 */
export function contentWindows(content: string): readonly ContentWindow[] {
  if (content.length === 0) {
    return [];
  }
  if (content.length <= MAX_INDEXED_CONTENT_CHARS) {
    return [{ content, startChar: 0 }];
  }
  const windows: ContentWindow[] = [];
  const lastStart = content.length - MAX_INDEXED_CONTENT_CHARS;
  for (
    let start = 0;
    start <= lastStart && windows.length < MAX_CONTENT_WINDOWS;
    start += CONTENT_WINDOW_STRIDE
  ) {
    windows.push({
      content: content.slice(start, start + MAX_INDEXED_CONTENT_CHARS),
      startChar: start,
    });
  }
  // Ensure the tail of a long file is reachable even when the stride would
  // otherwise stop short of it.
  const last = windows[windows.length - 1];
  if (
    windows.length < MAX_CONTENT_WINDOWS &&
    (last === undefined || last.startChar + MAX_INDEXED_CONTENT_CHARS < content.length)
  ) {
    windows.push({ content: content.slice(lastStart), startChar: lastStart });
  }
  return windows;
}
