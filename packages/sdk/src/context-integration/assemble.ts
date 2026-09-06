import { sep as pathSep } from "node:path";
import { rerankByContextTaskCategory } from "@atlas/context";
import type {
  ContextMode,
  ContextTaskCategory,
  ContextTier,
  LineRange,
  Summary,
} from "@atlas/core";
import { estimateTokens } from "@atlas/shared";
import { InvalidQueryError } from "../context/errors";
import type {
  DependencyContext,
  FileContentContext,
  ProjectOverview,
  SymbolContext,
} from "../context/models";
import type { ContextSDK } from "../context/sdk";
import { DEFAULT_CONTEXT_BUDGET, applyBudget } from "./budget";
import { createClassifier } from "./classifier";
import { type DenyFilterResult, denyFilter } from "./deny";
import { lineRangeOfSymbol, tierPriorityOf } from "./hierarchy";
import { type ProjectInstruction, collectInstructions } from "./instructions";
import type {
  ContextBudget,
  ContextItemKind,
  ContextItemSource,
  ContextPackage,
  ContextPackageItem,
  ContextSynthesis,
  StaleContextSignal,
} from "./models";
import { synthesize } from "./synthesis";

/**
 * Dependency items are additive evidence, never the answer: their score is
 * damped below the files/symbols they connect so a dense module cannot crowd a
 * budgeted package, and the count is capped to keep the package readable.
 */
const DEPENDENCY_SCORE_DAMP = 0.4;
const MAX_DEPENDENCY_ITEMS = 8;

/**
 * Default graph traversal (Phase 2c): after lexical search, follow dependency
 * edges out of the strongest seeds so an agent sees the code a task actually
 * touches, not just the files that mention its words. Bounded by construction
 * — depth, per-hop caps, and a total cap — because traversal evidence is
 * budgeted, never unbounded (token growth is the #1 risk).
 */
const TRAVERSAL_SEED_LIMIT = 5;
const TRAVERSAL_MAX_DEPTH = 2;
/** Per-hop caps (hop-1, hop-2). Hop-1 can carry more because it is closest. */
const TRAVERSAL_HOP_CAPS: readonly [number, number] = [10, 8];
const TRAVERSAL_TOTAL_CAP = 12;
/** Score decay per hop: `seedScore × 0.7^hop` (floor 1). */
const TRAVERSAL_DECAY = 0.7;
/** Only seeds at or above this score expand the graph (avoid unrelated spray). */
const TRAVERSAL_MIN_SEED_SCORE = 40;

/**
 * Extract raw, case-preserving word tokens from a task (paths stay intact).
 * Unlike `queryTerms` (which lowercases and strips punctuation), this keeps
 * identifiers exactly as written so explicit resolution can match camelCase /
 * PascalCase symbol names precisely.
 */
function rawWords(text: string): readonly string[] {
  return (text.match(/[A-Za-z0-9_./\\-]+/g) ?? []).filter((word) => word.length > 0);
}

/**
 * A word is identifier-like when it could plausibly be a code symbol rather
 * than ordinary prose: at least 4 characters and containing an uppercase
 * letter, an underscore, or a digit. This stops prose words like "add", "user",
 * or "endpoint" from being explicitly resolved to unrelated symbols, while
 * `AuthService`, `UserRepository`, and `createUserRoutes` still resolve.
 */
function isIdentifierLike(word: string): boolean {
  return word.length >= 4 && /[A-Z0-9_]/.test(word);
}

/**
 * Select effective context mode based on repository size (ADR-016 / Phase B B2).
 *
 * Auto mode selects:
 * - <= 800 files  → full (standard assembly; small/mid repos fit comfortably,
 *   and digesting them loses recall on open-ended discovery tasks — observed
 *   as a real regression: `routes.ts` dropped out of top-10 digest results on
 *   a small fixture repo)
 * - > 800 files   → digest (prevent token explosion on large repos)
 *
 * Auto-escalate: start in digest, fall back to full if the sufficiency gate
 * signals insufficient context (so weak models get the compact package first
 * but can escalate when the task demands more).
 */
function selectContextMode(mode: ContextMode, context: ContextSDK): "digest" | "full" | "off" {
  if (mode === "off") return "off";
  if (mode === "digest") return "digest";
  if (mode === "full") return "full";
  // "auto" or "auto-escalate": select based on repo size.
  if (!context.isAvailable) return "digest";
  const fileCount = context.files.listFiles().length;
  if (fileCount > 800) return "digest";
  return "full";
}

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
   * Context assembly mode (ADR-016 / Phase B).
   * - `auto` (default): select based on repo size
   * - `digest`: digest + top-5 search hits only
   * - `full`: all items, dependency chains, full assembly
   * - `off`: empty package (baseline mode)
   */
  readonly contextMode?: ContextMode;
  /**
   * Restrict the package to context items whose path falls under one of these
   * paths (an isolated scope, e.g. a security review scoped to the
   * authentication module). Dependency items (which carry no path) are dropped
   * and the repo-wide overview is omitted; project instructions still come
   * first (they are repo rules, deny-filtered like any other file). Defaults to
   * no scoping (shared context).
   */
  readonly scopePaths?: readonly string[];
  /**
   * Task-aware ranking hint (beta audit Fix 4). When set, search hits whose
   * path/title matches category-relevant patterns are boosted before selection
   * (e.g. "debug" surfaces error handlers and middleware). A ranking hint —
   * never a filter.
   */
  readonly taskCategory?: ContextTaskCategory;
  /**
   * Brief mode (Phase 3): replace every item's full content with a one-line
   * pointer (`path:start-end` / symbol signature) so a package costs a few
   * hundred tokens instead of a few thousand. Selection, ranking, tiers, and
   * the sufficiency gate are unchanged; callers fetch bodies via
   * `read_file_range` on demand. Defaults to false (full content).
   */
  readonly brief?: boolean;
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
  readonly tier: ContextTier;
  /** Path attribution for traversal-reached files: `[seed, …, file]`. */
  readonly traversalPath?: readonly string[];
}

/** A symbol candidate selected for inclusion. */
interface SymbolSelection {
  readonly kind: "symbol";
  readonly symbol: SymbolContext;
  readonly score: number;
  readonly source: ContextItemSource;
  readonly reason: string;
  readonly tier: ContextTier;
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
  digest: 6,
};

/** Assemble a ranked, budgeted, deny-filtered Context Package for a task. */
export function assembleContextPackage(input: AssembleInput): ContextPackage {
  const { context, repositoryPath, task, staleness, options } = input;
  if (task.trim() === "") {
    throw new InvalidQueryError("Task must not be empty.");
  }

  // Mode selection (ADR-016 / Phase B B2)
  const effectiveMode = selectContextMode(options.contextMode ?? "auto", context);

  // Off mode: return empty package immediately
  if (effectiveMode === "off") {
    return {
      task,
      items: [],
      staleness,
      budget: {
        budget: DEFAULT_CONTEXT_BUDGET,
        itemsRequested: 0,
        itemsIncluded: 0,
        tokensEstimated: 0,
        itemsDroppedByCount: [],
        itemsTruncated: [],
        droppedByTokens: [],
        budgetExceeded: false,
      },
      exclusions: { droppedPaths: [], droppedPatterns: [] },
      truncated: false,
    };
  }

  // Apply mode-specific budget overrides
  const budget: ContextBudget =
    effectiveMode === "digest"
      ? { maxItems: 10, maxTokensPerItem: 2000, maxTokensTotal: 8000, ...options.budget }
      : { ...DEFAULT_CONTEXT_BUDGET, ...options.budget };

  // Apply mode-specific search limit overrides
  const effectiveOptions: AssembleOptions = {
    ...options,
    searchLimit: effectiveMode === "digest" ? 5 : (options.searchLimit ?? 30),
    includeOverview: effectiveMode === "digest" ? false : (options.includeOverview ?? true),
  };

  const exclusions: { droppedPaths: string[]; droppedPatterns: string[] } = {
    droppedPaths: [],
    droppedPatterns: [],
  };

  // 1. Project instructions — always first, deny-filtered like any file.
  const instructionItems: ContextPackageItem[] = [];
  if (effectiveOptions.includeInstructions !== false) {
    for (const instruction of collectInstructions(repositoryPath)) {
      const filter = denyFilter(instruction.path, instruction.content);
      if (!filter.accepted) {
        recordExclusion(exclusions, instruction.path, filter);
        continue;
      }
      instructionItems.push(instructionItem(instruction));
    }
  }

  // 2. Repository digest — architecture map, entry points, conventions.
  //    Always included when available (Supporting tier, never budget-dropped).
  const digestItems: ContextPackageItem[] = [];
  if (context.isAvailable) {
    const digest = context.summaries.getDigest();
    if (digest !== undefined) {
      digestItems.push(digestItem(digest));
    }
  }

  // 3..n. Indexed context (only when an index exists).
  const overviewItems: ContextPackageItem[] = [];
  const contextItems: ContextPackageItem[] = [];
  if (context.isAvailable) {
    const relevant = context.getRelevantContext(task);
    const selections = collectSelections(context, task, effectiveOptions);

    const selectedNodes = new Map<string, number>();
    for (const selection of selections) {
      const path = selection.kind === "file" ? selection.file.path : selection.symbol.filePath;
      const denied = fileIsDenied(context, path, exclusions);
      if (denied) {
        continue;
      }
      const item =
        selection.kind === "file"
          ? fileItem(
              selection.file,
              selection.score,
              selection.source,
              selection.reason,
              selection.tier,
            )
          : symbolItem(
              selection.symbol,
              selection.score,
              selection.source,
              selection.reason,
              selection.tier,
            );
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
    // with the full graph, deduped by edge id, damped, and capped).
    const dependencyItems = dependencyItemsFor(context, selectedNodes, relevant.dependencies);
    for (const item of dependencyItems) {
      contextItems.push(item);
    }

    // Default bounded traversal (Phase 2c): always follow the graph out of the
    // strongest selected seeds (no regex gate — the budget decides inclusion).
    // Each reached file carries path attribution (`seed → … → file`) and a
    // decayed score lane, so multi-hop evidence is verifiable, not opaque.
    // Files already selected as whole-file items are skipped — re-adding them
    // would duplicate the exact same context. Files that merely contain a
    // selected *symbol* are still traversable: the symbol item carries the
    // signature, and the whole-file traversal item carries the body.
    const selectedWholeFiles = new Set<string>();
    for (const item of contextItems) {
      if (item.kind === "file" && item.path !== null) {
        selectedWholeFiles.add(item.path);
      }
    }
    for (const selection of traversalSelections(context, selectedNodes, selectedWholeFiles)) {
      const denied = fileIsDenied(context, selection.file.path, exclusions);
      if (denied) {
        continue;
      }
      contextItems.push(
        fileItem(
          selection.file,
          selection.score,
          selection.source,
          selection.reason,
          selection.tier,
          selection.traversalPath,
        ),
      );
    }

    // Overview item (from the deterministic relevant-context assembly).
    if (options.includeOverview !== false) {
      overviewItems.push(overviewItem(context, relevant.overview));
    }
  }

  const ordered = [
    ...instructionItems,
    ...digestItems,
    ...(options.scopePaths !== undefined ? [] : overviewItems),
    ...sortByRank(scopeItems(contextItems, options.scopePaths)),
  ];

  const { items: budgetedItems, record } = applyBudget(ordered, budget);

  // Brief mode: replace full content with one-line pointers (ids + paths +
  // ranges stay, so callers can fetch exact bodies on demand).
  const finalItems =
    effectiveOptions.brief === true ? budgetedItems.map(toBriefItem) : budgetedItems;

  // Package-level truncation signal: true when any items were dropped or truncated
  const truncated =
    record.droppedByTokens.length > 0 ||
    record.itemsDroppedByCount.length > 0 ||
    record.itemsTruncated.length > 0;

  // Synthesis tier (ADR-017): in digest/weak-model mode only, compute a
  // conclusion + evidence chain from the graph/summaries. Full (frontier)
  // mode omits synthesis — the model reasons over ranked items. Kept
  // synchronous: resolve the sync Result and keep only success values.
  let synthesis: ContextSynthesis | undefined;
  if (effectiveMode === "digest") {
    const category = createClassifier()(task).category;
    const result = synthesize({ context, task, category });
    synthesis = result.ok ? result.value : undefined;
  }

  return {
    task,
    items: finalItems,
    staleness,
    budget: record,
    exclusions: {
      droppedPaths: exclusions.droppedPaths,
      droppedPatterns: exclusions.droppedPatterns,
    },
    truncated,
    ...(synthesis !== undefined ? { synthesis } : {}),
  };
}

/**
 * Project an item to a one-line pointer (brief mode): a compact, deterministic
 * content line that names the item and where to read it, instead of the full
 * body. Symbols carry their signature line; files carry `path:start-end` when
 * ranges are known; auxiliary items (digest/overview/instructions) keep a
 * truncated first line so the model still knows they exist.
 */
function toBriefItem(item: ContextPackageItem): ContextPackageItem {
  const line = item.ranges?.[0];
  let pointer: string;
  if (item.kind === "symbol") {
    pointer =
      line === undefined
        ? `${item.title} @ ${item.path ?? "?"}`
        : `${item.title} @ ${item.path ?? "?"}:L${line.startLine}`;
  } else if (item.path !== null) {
    pointer = line === undefined ? item.path : `${item.path}:${line.startLine}-${line.endLine}`;
  } else {
    pointer = `${item.kind}:${item.title}`;
  }
  const content = `${pointer} — ${item.reason}`;
  return { ...item, content, truncated: true, tokens: estimateTokens(content) };
}

/** Gather file+symbol selections from ranked search and explicit resolution. */
function collectSelections(
  context: ContextSDK,
  task: string,
  options: AssembleOptions,
): readonly Selection[] {
  const selections: Selection[] = [];
  let hits = context.search.search(task, {
    types: ["symbol", "file"],
    limit: options.searchLimit ?? 30,
  });
  if (options.taskCategory !== undefined) {
    hits = rerankByContextTaskCategory(hits, options.taskCategory);
  }

  // Import/export symbol hits that point into a file already selected as a
  // whole-file hit at an equal-or-better score are dropped: the file item
  // carries strictly more context (the body), and keeping both lets one file's
  // repeated import symbols (AuthService in routes.ts, index.ts, middleware.ts,
  // …) crowd the package before graph traversal evidence that would connect
  // them. A symbol that scores *above* its file's hit is kept — an exact
  // definition (score 100) still outranks a weak content-only file hit (34).
  const bestWholeFileScore = new Map<string, number>();
  for (const hit of hits) {
    if (hit.kind === "file" && hit.path !== null) {
      const existing = bestWholeFileScore.get(hit.path) ?? -1;
      if (hit.score > existing) {
        bestWholeFileScore.set(hit.path, hit.score);
      }
    }
  }

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
          tier: "important",
        });
      } catch {
        // File disappeared from a concurrently-refreshed index — skip.
      }
    } else if (hit.kind === "symbol") {
      const bestFile = hit.path !== null ? bestWholeFileScore.get(hit.path) : undefined;
      if (bestFile !== undefined && hit.score <= bestFile) {
        continue;
      }
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
          tier: "important",
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

/**
 * Resolve symbols/files explicitly named by the task (deterministic, bounded).
 *
 * Only identifier-like words are resolved as symbols (see {@link
 * isIdentifierLike}) so prose — "where should I add a new endpoint" — never
 * pulls in an unrelated `add` symbol; paths are resolved as written so
 * case-preserved file references still work.
 */
function explicitSelections(context: ContextSDK, task: string): readonly Selection[] {
  const selections: Selection[] = [];
  const words = rawWords(task);

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
          tier: "critical",
        });
        continue;
      } catch {
        // Not an indexed path — not explicit.
      }
    }
    if (!isIdentifierLike(word)) {
      continue;
    }
    const hits = context.symbols.searchSymbols(word, {
      limit: 1,
      minScore: 85,
    });
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
          tier: "critical",
        });
      } catch {
        // Not resolvable — skip.
      }
    }
  }
  return selections;
}

/**
 * Default bounded traversal (Phase 2c): follow dependency edges out of the
 * strongest selected seeds — regardless of task wording — and add the reached
 * files as path-attributed selections. This replaces the old regex-gated
 * "dependency-intent chain": multi-hop evidence is valuable for every task
 * ("what does this touch?"), and the budget decides inclusion instead of a
 * keyword heuristic.
 *
 * Bounds (all by construction): up to {@link TRAVERSAL_SEED_LIMIT} seeds, depth
 * {@link TRAVERSAL_MAX_DEPTH}, per-hop caps {@link TRAVERSAL_HOP_CAPS}, and a
 * hard total cap {@link TRAVERSAL_TOTAL_CAP}. Cycle-safe (visited set seeded
 * with every selected node). Scores decay `0.7^hop` from the seed's score so
 * a directly-selected file always outranks the files it merely touches.
 */
function traversalSelections(
  context: ContextSDK,
  selectedNodes: ReadonlyMap<string, number>,
  selectedFilePaths?: ReadonlySet<string>,
): readonly FileSelection[] {
  // Undirected adjacency: traversal follows both directions so "who calls
  // this?" and "what does this call?" are both answerable from the same walk.
  const adjacency = new Map<string, string[]>();
  const edgeLabels = new Map<string, string>();
  for (const edge of context.dependencies.getDependencyGraph()) {
    const fromList = adjacency.get(edge.from) ?? [];
    fromList.push(edge.to);
    adjacency.set(edge.from, fromList);
    const toList = adjacency.get(edge.to) ?? [];
    toList.push(edge.from);
    adjacency.set(edge.to, toList);
    edgeLabels.set(`${edge.from}::${edge.to}`, edge.kind);
    edgeLabels.set(`${edge.to}::${edge.from}`, edge.kind);
  }

  // Choose the strongest seeds that clear the minimum relevance bar.
  const seeds = [...selectedNodes.entries()]
    .filter(([, score]) => score >= TRAVERSAL_MIN_SEED_SCORE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TRAVERSAL_SEED_LIMIT);

  const labelOf = (nodeId: string): string => {
    const filePath = filePathOf(nodeId);
    if (filePath !== null) {
      return filePath;
    }
    const symbolPrefix = "n:";
    if (nodeId.startsWith(symbolPrefix)) {
      return nodeId.slice(symbolPrefix.length);
    }
    return nodeId;
  };

  // BFS with path tracking: each frontier entry knows how it was reached.
  const reached = new Map<string, { score: number; path: string[] }>();
  const visited = new Set<string>(selectedNodes.keys());
  let frontier: Array<{ nodeId: string; seedScore: number; path: string[] }> = [];
  for (const [seedId, seedScore] of seeds) {
    visited.add(seedId);
    frontier.push({ nodeId: seedId, seedScore, path: [labelOf(seedId)] });
  }
  for (let hop = 1; hop <= TRAVERSAL_MAX_DEPTH && frontier.length > 0; hop += 1) {
    const next: Array<{ nodeId: string; seedScore: number; path: string[] }> = [];
    const hopCap = TRAVERSAL_HOP_CAPS[hop - 1] ?? TRAVERSAL_TOTAL_CAP;
    for (const entry of frontier) {
      if (next.length >= hopCap) {
        break;
      }
      const neighbors = adjacency.get(entry.nodeId) ?? [];
      for (const neighbor of neighbors) {
        if (next.length >= hopCap) {
          break;
        }
        if (visited.has(neighbor)) {
          continue;
        }
        visited.add(neighbor);
        const filePath = filePathOf(neighbor);
        if (filePath !== null) {
          if (selectedFilePaths?.has(filePath) === true) {
            // Whole-file items already carry this file's full context — skip
            // re-adding it as traversal evidence, but keep expanding through
            // the node so the walk is not truncated here.
            next.push({
              nodeId: neighbor,
              seedScore: entry.seedScore,
              path: [...entry.path, labelOf(neighbor)],
            });
            continue;
          }
          const decayed = Math.max(1, Math.round(entry.seedScore * TRAVERSAL_DECAY ** hop));
          const edgeKind = edgeLabels.get(`${entry.nodeId}::${neighbor}`) ?? "depends-on";
          const path = [...entry.path, edgeKind, labelOf(neighbor)];
          const existing = reached.get(filePath);
          if (existing === undefined || decayed > existing.score) {
            reached.set(filePath, { score: decayed, path });
          }
        }
        next.push({
          nodeId: neighbor,
          seedScore: entry.seedScore,
          path: [...entry.path, labelOf(neighbor)],
        });
      }
    }
    frontier = next;
  }

  const selections: FileSelection[] = [];
  const ranked = [...reached.entries()].sort((a, b) => b[1].score - a[1].score);
  for (const [path, { score, path: attribution }] of ranked) {
    if (selections.length >= TRAVERSAL_TOTAL_CAP) {
      break;
    }
    try {
      const file = context.files.getFile(path);
      selections.push({
        kind: "file",
        file,
        score,
        source: "traversal",
        reason: `File reached through the dependency graph: ${attribution.join(" → ")}.`,
        tier: "important",
        traversalPath: attribution,
      });
    } catch {
      // File disappeared from a concurrently-refreshed index — skip.
    }
  }
  return selections;
}

/** The file path a graph node id refers to, or `null` for symbol nodes. */
function filePathOf(nodeId: string): string | null {
  const FILE_PREFIX = "n:file:";
  if (!nodeId.startsWith(FILE_PREFIX)) {
    return null;
  }
  // `fileNodeId` stores forward-slash paths; restore the native separator so
  // the path matches the index (`files.getFile`) on every platform.
  return nodeId.slice(FILE_PREFIX.length).replace(/\//g, pathSep);
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

/**
 * Dependency items for the selected node ids, deduped against `relevant`.
 *
 * Scores are damped below the files/symbols they connect (evidence, not the
 * answer) and the count is capped so a dense module cannot crowd out the files
 * that actually answer the task.
 */
function dependencyItemsFor(
  context: ContextSDK,
  selectedNodes: ReadonlyMap<string, number>,
  relevantDependencies: readonly DependencyContext[],
): readonly ContextPackageItem[] {
  const byId = new Map<string, ContextPackageItem>();
  const add = (edge: DependencyContext): void => {
    const raw = edgeScore(edge, selectedNodes);
    if (raw < 0) {
      return;
    }
    const item = dependencyItem(edge, dampedEdgeScore(raw));
    byId.set(item.id, item);
  };
  for (const edge of relevantDependencies) {
    add(edge);
  }
  for (const edge of context.dependencies.getDependencyGraph()) {
    add(edge);
  }
  const items = [...byId.values()].sort((left, right) => right.score - left.score);
  return items.slice(0, MAX_DEPENDENCY_ITEMS);
}

/** Damp an edge's raw endpoint score so dependencies never outrank their files. */
function dampedEdgeScore(raw: number): number {
  return Math.max(1, Math.round(raw * DEPENDENCY_SCORE_DAMP));
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
  // Tier-first ordering (ADR-014 / P1.5): critical items precede important,
  // then unranked, supporting, optional — so the budget's tail-drop consumes
  // lower tiers first and rendering reads tier-major (context-strategy.md §4).
  return [...items].sort((left, right) => {
    const tierDelta = tierPriorityOf(left.tier) - tierPriorityOf(right.tier);
    if (tierDelta !== 0) {
      return tierDelta;
    }
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

function digestItem(digest: Summary): ContextPackageItem {
  const lines = [digest.content.overview];
  for (const point of digest.content.keyPoints) {
    lines.push(`- ${point}`);
  }
  const content = lines.join("\n");
  return {
    id: "digest:repository",
    kind: "digest",
    title: "Repository digest",
    path: null,
    content,
    score: 0,
    source: "digest",
    reason:
      "Deterministic repository digest: architecture map, entry points, and conventions (cached, never stale).",
    truncated: false,
    tokens: estimateTokens(content),
    tier: "supporting",
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
  tier: ContextTier,
  traversalPath?: readonly string[],
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
    tier,
    ...(traversalPath !== undefined && traversalPath.length > 0 ? { traversalPath } : {}),
  };
}

function symbolItem(
  symbol: SymbolContext,
  score: number,
  source: ContextItemSource,
  reason: string,
  tier: ContextTier,
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
    tier,
    ranges: [lineRangeOfSymbol(symbol.location)] as readonly LineRange[],
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
    tier: "supporting",
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
    tier: "important",
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
