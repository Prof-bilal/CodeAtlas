import type { Summary } from "@atlas/core";
import { queryTerms } from "@atlas/search";
import { InvalidQueryError } from "../context/errors";
import type {
  DependencyContext,
  FileContentContext,
  ProjectOverview,
  SymbolContext,
} from "../context/models";
import type { ContextSDK } from "../context/sdk";
import { DEFAULT_CONTEXT_BUDGET, applyBudget, estimateTokens } from "./budget";
import { type DenyFilterResult, denyFilter } from "./deny";
import { type ProjectInstruction, collectInstructions } from "./instructions";
import type {
  ContextBudget,
  ContextItemKind,
  ContextItemSource,
  ContextPackage,
  ContextPackageItem,
  StaleContextSignal,
} from "./models";

/** Options for assembling a context package. */
export interface AssembleOptions {
  /** Overrides applied on top of the default budget. */
  readonly budget?: Partial<ContextBudget>;
  /** How many ranked file+symbol hits to gather as candidates (default 30). */
  readonly searchLimit?: number;
  /** Include project instruction files (`AGENTS.md`/`CLAUDE.md`/README/manifest) — default true. */
  readonly includeInstructions?: boolean;
  /** Resolve symbols/files explicitly named in the task — default true. */
  readonly explicitResolution?: boolean;
  /** Include a project-overview item — default true. */
  readonly includeOverview?: boolean;
  /**
   * Restrict the package to context items whose path falls under one of these
   * paths (an isolated scope, e.g. a security review scoped to the
   * authentication module). Dependency items (which carry no path) are dropped
   * and the repo-wide overview is omitted; project instructions still come
   * first (they are repo rules, deny-filtered like any other file). Defaults to
   * no scoping (shared context).
   */
  readonly scopePaths?: readonly string[];
}

/** Everything the assembler needs. */
export interface AssembleInput {
  readonly context: ContextSDK;
  readonly repositoryPath: string;
  readonly task: string;
  readonly staleness: StaleContextSignal;
  readonly options: AssembleOptions;
}

/** A file candidate selected for inclusion (carries its content once). */
interface FileSelection {
  readonly kind: "file";
  readonly file: FileContentContext;
  readonly score: number;
  readonly source: ContextItemSource;
  readonly reason: string;
}

/** A symbol candidate selected for inclusion. */
interface SymbolSelection {
  readonly kind: "symbol";
  readonly symbol: SymbolContext;
  readonly score: number;
  readonly source: ContextItemSource;
  readonly reason: string;
}

type Selection = FileSelection | SymbolSelection;

/** Deterministic tiebreak so equal scores still produce a stable order. */
const KIND_RANK: Readonly<Record<ContextItemKind, number>> = {
  symbol: 0,
  file: 1,
  summary: 2,
  dependency: 3,
  overview: 4,
  instructions: 5,
};

/** Assemble a ranked, budgeted, deny-filtered Context Package for a task. */
export function assembleContextPackage(input: AssembleInput): ContextPackage {
  const { context, repositoryPath, task, staleness, options } = input;
  if (task.trim() === "") {
    throw new InvalidQueryError("Task must not be empty.");
  }
  const budget: ContextBudget = { ...DEFAULT_CONTEXT_BUDGET, ...options.budget };

  const exclusions: { droppedPaths: string[]; droppedPatterns: string[] } = {
    droppedPaths: [],
    droppedPatterns: [],
  };

  // 1. Project instructions — always first, deny-filtered like any file.
  const instructionItems: ContextPackageItem[] = [];
  if (options.includeInstructions !== false) {
    for (const instruction of collectInstructions(repositoryPath)) {
      const filter = denyFilter(instruction.path, instruction.content);
      if (!filter.accepted) {
        recordExclusion(exclusions, instruction.path, filter);
        continue;
      }
      instructionItems.push(instructionItem(instruction));
    }
  }

  // 2..n. Indexed context (only when an index exists).
  const overviewItems: ContextPackageItem[] = [];
  const contextItems: ContextPackageItem[] = [];
  if (context.isAvailable) {
    const relevant = context.getRelevantContext(task);
    const selections = collectSelections(context, task, options);

    const selectedNodes = new Map<string, number>();
    for (const selection of selections) {
      const path = selection.kind === "file" ? selection.file.path : selection.symbol.filePath;
      const denied = fileIsDenied(context, path, exclusions);
      if (denied) {
        continue;
      }
      const item =
        selection.kind === "file"
          ? fileItem(selection.file, selection.score, selection.source, selection.reason)
          : symbolItem(selection.symbol, selection.score, selection.source, selection.reason);
      contextItems.push(item);
      const nodeId =
        selection.kind === "file" ? fileNodeId(path) : symbolNodeId(selection.symbol.id);
      // Track the best score per selected node for dependency scoring.
      const existing = selectedNodes.get(nodeId);
      if (existing === undefined || selection.score > existing) {
        selectedNodes.set(nodeId, selection.score);
      }
    }

    // Summaries, deduped by stable item id (`getRelevantContext` already carries
    // the project summary; the explicit lookups below fill the gaps without
    // double-adding). Summaries of denied files never reach the package — the
    // file-level deny filter is the guard, and the exclusion record explains it.
    const summaryItems = new Map<string, ContextPackageItem>();
    const summaryPaths = new Set<string>();
    for (const item of contextItems) {
      if (item.kind === "summary" && item.path !== null) {
        summaryPaths.add(item.path);
      }
    }
    const addSummary = (summary: Summary, score: number): void => {
      const item = summaryItem(summary, score);
      summaryItems.set(item.id, item);
    };
    for (const summary of relevant.summaries) {
      if (summary.kind === "file" && !summaryPaths.has(summary.target)) {
        continue;
      }
      addSummary(summary, fileScoreOf(summary, selectedNodes));
    }
    for (const item of [...contextItems]) {
      if (item.kind !== "file" || summaryPaths.has(item.path ?? "")) {
        continue;
      }
      const summary = context.summaries.getFileSummary(item.path ?? "");
      if (summary !== undefined) {
        summaryPaths.add(item.path ?? "");
        addSummary(summary, item.score);
      }
    }
    const projectSummary = context.summaries.getProjectSummary();
    if (projectSummary !== undefined) {
      addSummary(projectSummary, 1);
    }
    for (const item of summaryItems.values()) {
      contextItems.push(item);
    }

    // Dependency edges touching selected nodes (merge `getRelevantContext` edges
    // with the full graph, deduped by edge id).
    const dependencyItems = dependencyItemsFor(context, selectedNodes, relevant.dependencies);
    for (const item of dependencyItems) {
      contextItems.push(item);
    }

    // Overview item (from the deterministic relevant-context assembly).
    if (options.includeOverview !== false) {
      overviewItems.push(overviewItem(context, relevant.overview));
    }
  }

  const ordered = [
    ...instructionItems,
    ...(options.scopePaths !== undefined ? [] : overviewItems),
    ...sortByRank(scopeItems(contextItems, options.scopePaths)),
  ];

  const { items: budgetedItems, record } = applyBudget(ordered, budget);

  return {
    task,
    items: budgetedItems,
    staleness,
    budget: record,
    exclusions: {
      droppedPaths: exclusions.droppedPaths,
      droppedPatterns: exclusions.droppedPatterns,
    },
  };
}

/** Gather file+symbol selections from ranked search and explicit resolution. */
function collectSelections(
  context: ContextSDK,
  task: string,
  options: AssembleOptions,
): readonly Selection[] {
  const selections: Selection[] = [];
  const hits = context.search.search(task, {
    types: ["symbol", "file"],
    limit: options.searchLimit ?? 30,
  });
  for (const hit of hits) {
    if (hit.kind === "file" && hit.path !== null) {
      try {
        const file = context.files.getFile(hit.path);
        selections.push({
          kind: "file",
          file,
          score: hit.score,
          source: "search",
          reason: `Ranked search hit (score ${hit.score}) for "${task}".`,
        });
      } catch {
        // File disappeared from a concurrently-refreshed index — skip.
      }
    } else if (hit.kind === "symbol") {
      const symbolId = symbolIdFromTarget(hit.targetId);
      if (symbolId === null) {
        continue;
      }
      try {
        const symbol = context.symbols.getSymbol(symbolId);
        selections.push({
          kind: "symbol",
          symbol,
          score: hit.score,
          source: "search",
          reason: `Ranked search hit (score ${hit.score}) — symbol "${symbol.name}".`,
        });
      } catch {
        // Symbol removed from a concurrent index refresh — skip.
      }
    }
  }

  if (options.explicitResolution !== false) {
    for (const selection of explicitSelections(context, task)) {
      selections.push(selection);
    }
  }
  return dedupeSelections(selections);
}

/** Resolve symbols/files explicitly named by the task (deterministic, bounded). */
function explicitSelections(context: ContextSDK, task: string): readonly Selection[] {
  const selections: Selection[] = [];
  // Meaningful query terms only: stopwords and one-character words are dropped,
  // so a task like "where is the login implemented" never resolves "is" or
  // "the" to unrelated `is*`/`the*` symbols.
  const words = queryTerms(task);

  for (const word of words) {
    const looksLikePath =
      /[\\/]/.test(word) ||
      /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|c|cc|cpp|h|cs|json|md|markdown|yaml|yml|toml|sh)$/i.test(
        word,
      );
    if (looksLikePath) {
      try {
        const file = context.files.getFile(word);
        selections.push({
          kind: "file",
          file,
          score: 100,
          source: "explicit",
          reason: `Task names file "${word}" directly.`,
        });
        continue;
      } catch {
        // Not an indexed path — not explicit.
      }
    }
    const hits = context.symbols.searchSymbols(word, { limit: 1, minScore: 85 });
    for (const hit of hits) {
      const symbolId = symbolIdFromTarget(hit.targetId);
      if (symbolId === null) {
        continue;
      }
      try {
        const symbol = context.symbols.getSymbol(symbolId);
        selections.push({
          kind: "symbol",
          symbol,
          score: hit.score,
          source: "explicit",
          reason: `Task names symbol "${symbol.name}" directly.`,
        });
      } catch {
        // Not resolvable — skip.
      }
    }
  }
  return selections;
}

/** Dedupe selections by (symbol id / file path), keeping the highest score. */
function dedupeSelections(selections: readonly Selection[]): readonly Selection[] {
  const byKey = new Map<string, Selection>();
  for (const selection of selections) {
    const key = selection.kind === "file" ? selection.file.path : selection.symbol.id;
    const existing = byKey.get(key);
    if (existing === undefined || selection.score > existing.score) {
      byKey.set(key, selection);
    }
  }
  return [...byKey.values()];
}

/** Deny-filter a file once per path; caches the verdict across selections. */
function fileIsDenied(
  context: ContextSDK,
  path: string,
  exclusions: { droppedPaths: string[]; droppedPatterns: string[] },
): boolean {
  let file: FileContentContext;
  try {
    file = context.files.getFile(path);
  } catch {
    // File not in the index; its symbol item still carries only the signature.
    return false;
  }
  const filter = denyFilter(path, file.content);
  if (!filter.accepted) {
    recordExclusion(exclusions, path, filter);
    return true;
  }
  return false;
}

/** Dependency items for the selected node ids, deduped against `relevant`. */
function dependencyItemsFor(
  context: ContextSDK,
  selectedNodes: ReadonlyMap<string, number>,
  relevantDependencies: readonly DependencyContext[],
): readonly ContextPackageItem[] {
  const byId = new Map<string, ContextPackageItem>();
  for (const edge of relevantDependencies) {
    const item = dependencyItem(edge, edgeScore(edge, selectedNodes));
    byId.set(item.id, item);
  }
  for (const edge of context.dependencies.getDependencyGraph()) {
    const score = edgeScore(edge, selectedNodes);
    if (score < 0) {
      continue; // touches no selected node
    }
    const item = dependencyItem(edge, score);
    byId.set(item.id, item);
  }
  return [...byId.values()];
}

/** The score of an edge: the highest score of a selected endpoint, or `-1`. */
function edgeScore(edge: DependencyContext, selectedNodes: ReadonlyMap<string, number>): number {
  const from = selectedNodes.get(edge.from);
  const to = selectedNodes.get(edge.to);
  if (from === undefined && to === undefined) {
    return -1;
  }
  return Math.max(from ?? 0, to ?? 0);
}

/** Score of a stored summary derived from the selected file it belongs to. */
function fileScoreOf(summary: Summary, selectedNodes: ReadonlyMap<string, number>): number {
  if (summary.kind !== "file") {
    return 0;
  }
  const nodeId = fileNodeId(summary.target);
  return selectedNodes.get(nodeId) ?? 0;
}

/** Order context items by score desc, then kind, then id (deterministic). */
function sortByRank(items: readonly ContextPackageItem[]): readonly ContextPackageItem[] {
  return [...items].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    const rank = KIND_RANK[left.kind] - KIND_RANK[right.kind];
    if (rank !== 0) {
      return rank;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

/**
 * Apply an isolated scope: keep only items whose path is the scope path itself
 * or falls under it. Items without a path (dependencies, the overview) cannot be
 * attributed to a scope and are dropped.
 */
function scopeItems(
  items: readonly ContextPackageItem[],
  scopePaths: readonly string[] | undefined,
): readonly ContextPackageItem[] {
  if (scopePaths === undefined || scopePaths.length === 0) {
    return items;
  }
  const scopes = scopePaths.map(normalizeScope);
  return items.filter((item) => {
    if (item.path === null) {
      return false;
    }
    const path = normalizeScope(item.path);
    return scopes.some((scope) => path === scope || path.startsWith(`${scope}/`));
  });
}

/** Normalize a scope/item path to a stable, slash-separated key for matching. */
function normalizeScope(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

// ── item builders ───────────────────────────────────────────────────────────

function instructionItem(instruction: ProjectInstruction): ContextPackageItem {
  const content = instruction.content;
  return {
    id: `instructions:${instruction.filename}`,
    kind: "instructions",
    title: instruction.filename,
    path: instruction.path,
    content,
    score: 0,
    source: "instructions",
    reason: `Project instruction file included so the agent follows repository rules (${instruction.filename}).`,
    truncated: false,
    tokens: estimateTokens(content),
  };
}

function overviewItem(context: ContextSDK, overview: ProjectOverview): ContextPackageItem {
  const languages =
    Object.entries(overview.languages)
      .map(([language, count]) => `${language} (${count})`)
      .join(", ") || "none";
  const counts = overview.counts;
  const lines = [
    `Repository: ${overview.repositoryPath}`,
    `Indexed: ${overview.savedAt}`,
    `Schema version: ${overview.schemaVersion}`,
    `Languages: ${languages}`,
    `Counts: ${counts.files} files, ${counts.symbols} symbols, ${counts.modules} modules, ${counts.dependencies} dependencies, ${counts.summaries} summaries`,
  ];
  const modules = context.modules.listModules();
  if (modules.length > 0) {
    lines.push(`Modules: ${modules.map((module) => module.path).join(", ")}`);
  }
  if (overview.summary !== undefined) {
    lines.push(`Project summary: ${overview.summary.content.overview}`);
  }
  const content = lines.join("\n");
  return {
    id: "overview",
    kind: "overview",
    title: "Project overview",
    path: null,
    content,
    score: 0,
    source: "overview",
    reason: "Project overview with counts, languages, and modules.",
    truncated: false,
    tokens: estimateTokens(content),
  };
}

function fileItem(
  file: FileContentContext,
  score: number,
  source: ContextItemSource,
  reason: string,
): ContextPackageItem {
  const content = `File: ${file.path}\nLanguage: ${file.language}\n\n${file.content}`;
  return {
    id: `file:${file.path}`,
    kind: "file",
    title: file.path,
    path: file.path,
    content,
    score,
    source,
    reason,
    truncated: false,
    tokens: estimateTokens(content),
  };
}

function symbolItem(
  symbol: SymbolContext,
  score: number,
  source: ContextItemSource,
  reason: string,
): ContextPackageItem {
  const lines = [
    `Symbol: ${symbol.name} (${symbol.kind})`,
    `Location: ${symbol.filePath}:${symbol.location.startLine}`,
    `Visibility: ${symbol.visibility}`,
  ];
  if (symbol.typeText !== null) {
    lines.push(`Type: ${symbol.typeText}`);
  }
  if (symbol.documentation !== null && symbol.documentation.length > 0) {
    lines.push(`Documentation: ${symbol.documentation}`);
  }
  const content = lines.join("\n");
  return {
    id: `symbol:${symbol.id}`,
    kind: "symbol",
    title: symbol.name,
    path: symbol.filePath,
    content,
    score,
    source,
    reason,
    truncated: false,
    tokens: estimateTokens(content),
  };
}

function summaryItem(summary: Summary, score: number): ContextPackageItem {
  const target = summary.target || "project";
  const lines = [`Summary (${summary.kind}) — ${target}`, summary.content.overview];
  for (const point of summary.content.keyPoints) {
    lines.push(`- ${point}`);
  }
  const content = lines.join("\n");
  return {
    id: `summary:${summary.kind}:${summary.target}`,
    kind: "summary",
    title: target,
    path: summary.target || null,
    content,
    score,
    source: "summary",
    reason: `Stored ${summary.kind} summary for "${target}", included with its selected file.`,
    truncated: false,
    tokens: estimateTokens(content),
  };
}

function dependencyItem(edge: DependencyContext, score: number): ContextPackageItem {
  const content = `${edge.fromLabel} --${edge.kind}--> ${edge.toLabel}`;
  return {
    id: `dep:${edge.from}::${edge.kind}::${edge.to}`,
    kind: "dependency",
    title: content,
    path: null,
    content,
    score,
    source: "dependency",
    reason: "Persisted dependency edge touching a selected file or symbol.",
    truncated: false,
    tokens: estimateTokens(content),
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Record a denied file and the patterns that matched (deduped). */
function recordExclusion(
  exclusions: { droppedPaths: string[]; droppedPatterns: string[] },
  path: string,
  filter: DenyFilterResult,
): void {
  if (!exclusions.droppedPaths.includes(path)) {
    exclusions.droppedPaths.push(path);
  }
  for (const pattern of [...filter.pathPatterns, ...filter.contentPatterns]) {
    if (!exclusions.droppedPatterns.includes(pattern)) {
      exclusions.droppedPatterns.push(pattern);
    }
  }
}

/** Extract the symbol id from a `symbol:<id>` search-hit target. */
function symbolIdFromTarget(targetId: string | null): string | null {
  if (targetId === null || !targetId.startsWith("symbol:")) {
    return null;
  }
  return targetId.slice("symbol:".length);
}

/** Graph node id for a file (mirrors `@atlas/graph` without importing it). */
function fileNodeId(path: string): string {
  return `n:file:${path.replace(/\\/g, "/")}`;
}

/** Graph node id for a symbol (mirrors `@atlas/graph` without importing it). */
function symbolNodeId(symbolId: string): string {
  return `n:${symbolId}`;
}
