import { basename } from "node:path";
import {
  HANDLERS,
  type HandlerContext,
  type SummaryShape,
  type ToolArgs,
  ToolInputError,
  optionalEnum,
  optionalInt,
  optionalString,
  requireString,
} from "@prof-bilal/atlas-mcp";
import {
  type ContextSDK,
  type FilePath,
  type Result,
  extractTaskEntities,
  scanProjectOverview,
} from "@prof-bilal/atlas-sdk";
import type { ChatGptToolName } from "./tools";
import { UI_RESOURCES } from "./ui-resources";

/**
 * Implementations for the ChatGPT-facing tools.
 *
 * Every handler delegates to the **existing** `@prof-bilal/atlas-mcp` handlers (which
 * in turn read only through `createContextSDK`) and then reshapes the result
 * into the smaller, goal-oriented ChatGPT schema. No indexing, parsing, graph,
 * or storage logic is reimplemented here.
 */

type AdapterHandler = (h: HandlerContext, args: ToolArgs) => Promise<unknown>;

export const ADAPTER_HANDLERS: Readonly<Record<ChatGptToolName, AdapterHandler>> = {
  analyze_repository: analyzeRepository,
  search_repository: searchRepository,
  explain_repository: explainRepository,
  impact_analysis: impactAnalysis,
  get_context: getContext,
};

// ── analyze_repository ───────────────────────────────────────────────────────

interface ProjectOverviewResult {
  readonly savedAt: string;
  readonly schemaVersion: number;
  readonly counts: {
    readonly files: number;
    readonly symbols: number;
    readonly modules: number;
    readonly dependencies: number;
    readonly summaries: number;
  };
  readonly languages: Record<string, number>;
  readonly parsedFiles: number;
  readonly contentOnlyFiles: number;
  readonly unresolvedImports: number;
  readonly summary: SummaryShape | null;
}

async function analyzeRepository(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const focus = optionalString(args, "focus") ?? null;
  const sdk = h.ctx.requireSDK();
  const overview = (await HANDLERS.project_overview(h, {
    includeSummary: true,
    detail: "summary",
  })) as ProjectOverviewResult;

  const areas = topAreas(sdk);
  const findings = buildFindings(overview, sdk);
  const scan = await tryScan(h.ctx.root);

  const repository = {
    name: scan?.name !== undefined && scan.name.length > 0 ? scan.name : basename(h.ctx.root),
    root: h.ctx.root,
    framework: scan?.framework ?? null,
    isGitRepository: scan?.isGitRepository ?? false,
  };

  const nextSteps: string[] = [
    "Call search_repository to find where a feature is implemented.",
    "Call explain_repository to understand how a subsystem works.",
    "Call impact_analysis before changing a file to see what it affects.",
  ];
  if (overview.contentOnlyFiles > 0) {
    nextSteps.push(
      `${overview.contentOnlyFiles} file(s) have no parsed symbols (parser covers TypeScript/JavaScript).`,
    );
  }

  return {
    repository,
    counts: overview.counts,
    languages: overview.languages,
    parsedFiles: overview.parsedFiles,
    contentOnlyFiles: overview.contentOnlyFiles,
    unresolvedImports: overview.unresolvedImports,
    savedAt: overview.savedAt,
    schemaVersion: overview.schemaVersion,
    focus,
    areas,
    findings,
    summary: overview.summary,
    ui: bindUi("repository-summary.html"),
    nextSteps,
  };
}

/** The shallowest indexed module directories — the project's architectural areas. */
function topAreas(sdk: ContextSDK): Array<{ name: string; path: string }> {
  const modules = sdk.modules.listModules();
  const ranked = modules
    .map((module) => ({
      module,
      depth: module.name.split("/").filter((segment) => segment.length > 0).length,
    }))
    .sort((a, b) => a.depth - b.depth || a.module.name.localeCompare(b.module.name));
  const depthOne = ranked.filter((entry) => entry.depth === 1);
  const chosen = depthOne.length >= 3 ? depthOne : ranked.filter((entry) => entry.depth <= 2);
  return chosen.slice(0, 12).map((entry) => ({ name: entry.module.name, path: entry.module.path }));
}

/** Deterministic structural findings, grounded in indexed data only. */
function buildFindings(overview: ProjectOverviewResult, sdk: ContextSDK): string[] {
  const { counts } = overview;
  const findings: string[] = [
    `${counts.files} files, ${counts.symbols} symbols across ${counts.modules} module(s)`,
    `${counts.dependencies} dependency relationship(s) indexed`,
  ];
  if (overview.contentOnlyFiles > 0) {
    findings.push(
      `${overview.contentOnlyFiles} file(s) have no parsed symbols (searchable by path/content only)`,
    );
  }
  if (overview.unresolvedImports > 0) {
    findings.push(`${overview.unresolvedImports} import(s) could not be resolved to indexed files`);
  }
  // The deterministic digest records cycle findings as key points when present.
  const digest = sdk.summaries.getDigest();
  if (digest !== undefined) {
    for (const point of digest.content.keyPoints) {
      if (/circular/i.test(point)) {
        findings.push(point);
      }
    }
  }
  return findings;
}

async function tryScan(
  root: string,
): Promise<{ name: string; framework: string | null; isGitRepository: boolean } | null> {
  try {
    const result: Result<{ name: string; framework: string | null; isGitRepository: boolean }> =
      await scanProjectOverview(root as FilePath);
    return result.ok ? result.value : null;
  } catch {
    // The index is the source of truth; a filesystem scan is a best-effort enrichment.
    return null;
  }
}

// ── search_repository ────────────────────────────────────────────────────────

interface SymbolSearchHit {
  readonly name: string;
  readonly path: string | null;
  readonly targetId: string | null;
  readonly symbolKind?: string;
  readonly documentation: string | null;
  readonly score: number;
  readonly confidence?: string;
}

interface FileSearchHit {
  readonly path: string | null;
  readonly language?: string;
  readonly score: number;
  readonly confidence?: string;
}

interface SearchResult {
  readonly hits: readonly (SymbolSearchHit | FileSearchHit)[];
}

type Confidence = "high" | "medium" | "low";

interface MergedHit {
  readonly path: string | null;
  readonly kind: "file" | "symbol";
  readonly title: string;
  readonly symbolKind?: string;
  readonly documentation: string | null;
  readonly line?: number;
  readonly score: number;
  readonly confidence?: Confidence;
  readonly reason: string;
}

async function searchRepository(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const query = requireString(args, "query");
  const limit = optionalInt(args, "limit", 1, 50) ?? 12;
  const kind = optionalEnum(args, "kind", ["all", "files", "symbols"]) ?? "all";
  const sdk = h.ctx.requireSDK();

  // Search the query as given first. CodeAtlas search is deterministic/lexical,
  // so a natural-language question ("where is authentication implemented")
  // often matches nothing; in that case expand it into concrete terms using the
  // SDK's existing entity extractor and retry.
  let merged = await runSearches(h, sdk, [query], kind, limit);
  let expandedWith: string[] = [];
  if (merged.length === 0) {
    expandedWith = expandQueryTerms(query);
    merged = await runSearches(h, sdk, expandedWith, kind, limit, true);
  }

  const deduped = dedupe(merged)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const nextSteps: string[] = [];
  if (deduped.length === 0) {
    nextSteps.push(
      "No matches. Try a different term, or call analyze_repository to see the project's areas.",
    );
  } else {
    const top = deduped.find((hit) => hit.path !== null);
    if (top?.path !== null && top?.path !== undefined) {
      nextSteps.push(`Call get_context with target "${top.path}" to read the code.`);
    }
    nextSteps.push("Call explain_repository to understand how these files relate.");
  }

  return {
    query,
    kind,
    results: deduped,
    total: deduped.length,
    ...(expandedWith.length > 0 ? { expandedTerms: expandedWith } : {}),
    ui: bindUi("search-results.html"),
    nextSteps,
  };
}

/** Run the file and/or symbol search for each term and flatten the hits. */
async function runSearches(
  h: HandlerContext,
  sdk: ContextSDK,
  terms: readonly string[],
  kind: string,
  limit: number,
  related = false,
): Promise<MergedHit[]> {
  const out: MergedHit[] = [];
  for (const term of terms) {
    if (kind !== "files") {
      const symbols = (await HANDLERS.search_symbols(h, { query: term, limit })) as SearchResult;
      for (const hit of symbols.hits as readonly SymbolSearchHit[]) {
        out.push(toSymbolHit(sdk, hit, related ? term : undefined));
      }
    }
    if (kind !== "symbols") {
      const files = (await HANDLERS.search_files(h, { query: term, limit })) as SearchResult;
      for (const hit of files.hits as readonly FileSearchHit[]) {
        out.push(toFileHit(hit, related ? term : undefined));
      }
    }
  }
  return out;
}

/**
 * Derive concrete search terms from a natural-language query using the SDK's
 * entity extractor (identifiers, paths, non-stopword keywords), plus short
 * prefixes of long keywords so a word like "authentication" can still match an
 * "auth" module. Bounded and deterministic; the search engine itself is reused
 * unchanged.
 */
function expandQueryTerms(query: string): string[] {
  const entities = extractTaskEntities(query);
  const terms: string[] = [];
  const seen = new Set<string>();
  const push = (value: string): void => {
    const term = value.trim();
    const key = term.toLowerCase();
    if (term.length < 3 || seen.has(key)) return;
    seen.add(key);
    terms.push(term);
  };
  for (const path of entities.filePaths) push(path);
  for (const name of entities.symbolNames) push(name);
  for (const keyword of entities.keywords) push(keyword);
  for (const base of [...entities.symbolNames, ...entities.keywords]) {
    if (base.length >= 6) {
      push(base.slice(0, 4));
      push(base.slice(0, 5));
    }
  }
  if (terms.length === 0) {
    for (const word of query.split(/\s+/)) push(word);
  }
  return terms.slice(0, 8);
}

function toSymbolHit(sdk: ContextSDK, hit: SymbolSearchHit, relatedTerm?: string): MergedHit {
  let line: number | undefined;
  if (hit.targetId?.startsWith("symbol:")) {
    try {
      line = sdk.symbols.getSymbol(hit.targetId.slice("symbol:".length)).location.startLine;
    } catch {
      // Symbol dropped by a concurrent refresh — omit the line.
    }
  }
  const confidence = asConfidence(hit.confidence);
  const base =
    hit.documentation !== null && hit.documentation.length > 0
      ? firstLine(hit.documentation)
      : `${hit.symbolKind ?? "symbol"} "${hit.name}" in ${basename(hit.path ?? "") || "index"}`;
  return {
    path: hit.path,
    kind: "symbol",
    title: hit.name,
    ...(hit.symbolKind !== undefined ? { symbolKind: hit.symbolKind } : {}),
    documentation: hit.documentation,
    ...(line !== undefined ? { line } : {}),
    score: hit.score,
    ...(confidence !== undefined ? { confidence } : {}),
    reason: withRelated(base, relatedTerm),
  };
}

function toFileHit(hit: FileSearchHit, relatedTerm?: string): MergedHit {
  const confidence = asConfidence(hit.confidence);
  return {
    path: hit.path,
    kind: "file",
    title: hit.path === null ? "(unknown file)" : basename(hit.path),
    documentation: null,
    score: hit.score,
    ...(confidence !== undefined ? { confidence } : {}),
    reason: withRelated(withLanguage("Matched file path/content", hit.language), relatedTerm),
  };
}

/** Prefer the symbol hit when a file and its symbol both matched. */
function dedupe(hits: readonly MergedHit[]): MergedHit[] {
  const seen = new Map<string, MergedHit>();
  for (const hit of hits) {
    const key = `${hit.kind}:${hit.path ?? ""}:${hit.title}`;
    const existing = seen.get(key);
    if (existing === undefined || hit.score > existing.score) {
      seen.set(key, hit);
    }
  }
  return [...seen.values()];
}

// ── explain_repository ───────────────────────────────────────────────────────

interface ContextItem {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly path: string | null;
  readonly reason: string;
  readonly score: number;
  readonly confidence?: string;
  readonly ranges?: ReadonlyArray<{ startLine: number; endLine: number }>;
}

interface FrcResult {
  readonly items: readonly ContextItem[];
  readonly sufficient: boolean;
  readonly hint: string;
  readonly synthesis?: { readonly conclusion: string };
}

/** The explanation item shape returned by the tool. */
interface ExplanationItem {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly path: string | null;
  readonly reason: string;
  readonly score: number;
  readonly symbolKind?: string;
  readonly line?: number;
  readonly confidence?: Confidence;
  readonly ranges?: ReadonlyArray<{ startLine: number; endLine: number }>;
}

async function explainRepository(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const question = requireString(args, "question");
  const scope = optionalString(args, "scope") ?? null;
  const sdk = h.ctx.requireSDK();

  const pkg = (await HANDLERS.find_relevant_context(h, {
    task: question,
    maxItems: 12,
    contextMode: "auto",
    brief: false,
  })) as FrcResult;

  // Keep only items that are actual code evidence; instruction/overview/digest
  // items are context plumbing, not an explanation.
  let items: ExplanationItem[] = pkg.items.filter(isCodeItem).slice(0, 12).map(toContextItem);
  let expandedTerms: string[] = [];
  if (items.length === 0) {
    // The lexical assembly found no code; expand the question into concrete
    // terms (same strategy as search_repository) and use those hits instead.
    expandedTerms = expandQueryTerms(question);
    const hits = await runSearches(h, sdk, expandedTerms, "all", 12, true);
    items = dedupe(hits)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(toContextItemFromHit);
  }

  const sources = uniquePaths(items.map((item) => item.path));
  const relationships = collectRelationships(sdk, sources);

  const nextSteps: string[] = [];
  if (!pkg.sufficient) {
    nextSteps.push(pkg.hint);
    nextSteps.push("Narrow the question or pass a `scope` path to focus the explanation.");
  } else {
    nextSteps.push("Call impact_analysis before changing any of these files.");
  }

  return {
    question,
    scope,
    items,
    relationships,
    conclusion: pkg.synthesis?.conclusion ?? null,
    sufficient: pkg.sufficient,
    sources,
    ...(expandedTerms.length > 0 ? { expandedTerms } : {}),
    hint: pkg.hint,
    ui: bindUi("explanation.html"),
    nextSteps,
  };
}

/** True for items that represent actual code evidence. */
function isCodeItem(item: ContextItem): boolean {
  return (
    item.kind === "file" ||
    item.kind === "symbol" ||
    item.kind === "summary" ||
    item.kind === "dependency"
  );
}

/** Map an assembled context item to the explanation item shape. */
function toContextItem(item: ContextItem): ExplanationItem {
  const confidence = asConfidence(item.confidence);
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    path: item.path,
    reason: item.reason,
    score: item.score,
    ...(confidence !== undefined ? { confidence } : {}),
    ...(item.ranges !== undefined ? { ranges: item.ranges.map((r) => ({ ...r })) } : {}),
  };
}

/** Map an expanded-search hit to the explanation item shape. */
function toContextItemFromHit(hit: MergedHit): ExplanationItem {
  return {
    id: `${hit.kind}:${hit.path ?? hit.title}`,
    kind: hit.kind,
    title: hit.title,
    path: hit.path,
    reason: hit.reason,
    score: hit.score,
    ...(hit.symbolKind !== undefined ? { symbolKind: hit.symbolKind } : {}),
    ...(hit.line !== undefined ? { line: hit.line } : {}),
    ...(hit.confidence !== undefined ? { confidence: hit.confidence } : {}),
  };
}

/** Direct dependency edges touching the relevant files (deterministic graph reads). */
function collectRelationships(
  sdk: ContextSDK,
  sources: readonly string[],
): Array<{ from: string; to: string; relation: string; fromLabel: string; toLabel: string }> {
  const edges: Array<{
    from: string;
    to: string;
    relation: string;
    fromLabel: string;
    toLabel: string;
  }> = [];
  const seen = new Set<string>();
  for (const source of sources.slice(0, 6)) {
    try {
      const result = sdk.dependencies.query({ node: source, direction: "both", limit: 8 });
      for (const edge of result.edges) {
        const key = `${edge.from}>${edge.to}#${edge.kind}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({
          from: edge.from,
          to: edge.to,
          relation: edge.kind,
          fromLabel: edge.fromLabel,
          toLabel: edge.toLabel,
        });
        if (edges.length >= 40) return edges;
      }
    } catch {
      // Node not resolvable in the graph — skip this source.
    }
  }
  return edges;
}

// ── impact_analysis ──────────────────────────────────────────────────────────

interface ImpactResult {
  readonly subjects: readonly string[];
  readonly affected: ReadonlyArray<{
    readonly path: string;
    readonly distance: number;
    readonly isTestFile: boolean;
    readonly isDocFile: boolean;
  }>;
  readonly risk: {
    readonly level: "low" | "medium" | "high";
    readonly directDependents: number;
    readonly totalAffected: number;
    readonly affectedTests: number;
    readonly affectedDocs: number;
    readonly fanOutRatio: number;
  };
  readonly nextSteps: readonly string[];
}

async function impactAnalysis(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const sdk = h.ctx.requireSDK();

  // Accept repo-relative paths (what a user sees) by resolving them to the
  // indexed absolute paths the graph is keyed by; leave symbol names as-is.
  const rawPaths = Array.isArray(args["paths"]) ? (args["paths"] as unknown[]).map(String) : [];
  const subjects = rawPaths.map((path) => matchFilePath(sdk, path) ?? path);

  const result = (await HANDLERS.analyze_impact(h, {
    ...args,
    paths: subjects,
  })) as ImpactResult;

  // The MCP closure reports graph node ids; present readable file paths.
  const affected = dedupeAffected(
    result.affected.map((node) => ({ ...node, path: nodeIdToPath(sdk, node.path) })),
  );

  const edges: Array<{ from: string; to: string; relation: string }> = [];
  const seen = new Set<string>();
  for (const subject of result.subjects.slice(0, 10)) {
    try {
      for (const edge of sdk.dependencies.getDependents(subject)) {
        const key = `${edge.from}>${edge.to}#${edge.kind}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ from: edge.fromLabel, to: edge.toLabel, relation: edge.kind });
        if (edges.length >= 40) break;
      }
    } catch {
      // Subject not present in the graph — skip.
    }
    if (edges.length >= 40) break;
  }

  return {
    subjects: result.subjects,
    affected,
    risk: result.risk,
    edges,
    ui: bindUi("impact-analysis.html"),
    nextSteps: result.nextSteps,
  };
}

/** Convert a graph node id to a readable file path. */
function nodeIdToPath(sdk: ContextSDK, nodeId: string): string {
  if (nodeId.startsWith("n:file:")) {
    return nodeId.slice("n:file:".length);
  }
  if (nodeId.startsWith("n:")) {
    try {
      return sdk.symbols.getSymbol(nodeId.slice("n:".length)).filePath;
    } catch {
      return nodeId;
    }
  }
  return nodeId;
}

/** Collapse affected nodes that resolve to the same file, keeping the closest. */
function dedupeAffected(
  nodes: ReadonlyArray<{
    readonly path: string;
    readonly distance: number;
    readonly isTestFile: boolean;
    readonly isDocFile: boolean;
  }>,
): Array<{ path: string; distance: number; isTestFile: boolean; isDocFile: boolean }> {
  const byPath = new Map<
    string,
    { path: string; distance: number; isTestFile: boolean; isDocFile: boolean }
  >();
  for (const node of nodes) {
    const existing = byPath.get(node.path);
    if (existing === undefined || node.distance < existing.distance) {
      byPath.set(node.path, { ...node });
    }
  }
  return [...byPath.values()];
}

// ── get_context ──────────────────────────────────────────────────────────────

interface InspectResult {
  readonly symbol: {
    readonly name: string;
    readonly kind: string;
    readonly filePath: string;
    readonly location: { readonly startLine: number; readonly endLine: number };
  };
  readonly callers: ReadonlyArray<{
    name: string;
    kind: string;
    filePath: string;
    edgeKind: string;
  }>;
  readonly callees: ReadonlyArray<{
    name: string;
    kind: string;
    filePath: string;
    edgeKind: string;
  }>;
  readonly testFiles: readonly string[];
}

interface ReadRangeResult {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly content: string;
  readonly truncationNote?: string;
}

async function getContext(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const target = requireString(args, "target");
  const kind = optionalEnum(args, "kind", ["auto", "file", "symbol"]) ?? "auto";
  const startLine = optionalInt(args, "startLine", 1, 1_000_000);
  const endLine = optionalInt(args, "endLine", 1, 1_000_000);
  const maxLines = optionalInt(args, "maxLines", 1, 2000) ?? 120;
  const sdk = h.ctx.requireSDK();

  const preferSymbol = kind === "symbol" || (kind === "auto" && !looksLikePath(target));
  if (preferSymbol) {
    try {
      const inspected = (await HANDLERS.inspect_symbol(h, { symbol: target })) as InspectResult;
      const location = inspected.symbol.location;
      const range = chooseRange(startLine, endLine, location.startLine, location.endLine, maxLines);
      const read = (await HANDLERS.read_file_range(h, {
        path: inspected.symbol.filePath,
        startLine: range.start,
        endLine: range.end,
        padding: 0,
      })) as ReadRangeResult;
      return {
        target,
        resolved: {
          kind: "symbol",
          path: inspected.symbol.filePath,
          name: inspected.symbol.name,
          symbolKind: inspected.symbol.kind,
          startLine: location.startLine,
          endLine: location.endLine,
        },
        content: read.content,
        callers: inspected.callers,
        callees: inspected.callees,
        testFiles: inspected.testFiles,
        truncated: read.truncationNote !== undefined,
        ui: bindUi("context-view.html"),
        nextSteps: [
          "Call impact_analysis with this file to see what a change would affect.",
          "Call search_repository to find related code.",
        ],
      };
    } catch (error) {
      if (kind === "symbol") {
        throw error;
      }
      // Fall through to file resolution.
    }
  }

  const path = resolveFilePath(sdk, target);
  const totalLines = lineCount(sdk, path);
  const range = chooseRange(startLine, endLine, 1, totalLines, maxLines);
  const read = (await HANDLERS.read_file_range(h, {
    path,
    startLine: range.start,
    endLine: range.end,
    padding: 0,
  })) as ReadRangeResult;

  return {
    target,
    resolved: {
      kind: "file" as const,
      path,
      name: null,
      symbolKind: null,
      startLine: null,
      endLine: null,
    },
    content: read.content,
    callers: [],
    callees: [],
    testFiles: [],
    truncated: read.truncationNote !== undefined,
    ui: bindUi("context-view.html"),
    nextSteps: [`Call impact_analysis with "${path}" to see what depends on it.`],
  };
}

/** Match a user-supplied path against indexed files (exact, suffix, basename). */
function matchFilePath(sdk: ContextSDK, target: string): string | undefined {
  const files = sdk.files.listFiles();
  const normalized = target.replace(/\\/g, "/");
  const exact = files.find((file) => file.path.replace(/\\/g, "/") === normalized);
  if (exact !== undefined) return exact.path;
  const suffix = files.find((file) => file.path.replace(/\\/g, "/").endsWith(`/${normalized}`));
  if (suffix !== undefined) return suffix.path;
  return files.find((file) => basename(file.path) === normalized)?.path;
}

/** Resolve a user-supplied target to an indexed file path or fail readably. */
function resolveFilePath(sdk: ContextSDK, target: string): string {
  const match = matchFilePath(sdk, target);
  if (match === undefined) {
    throw new ToolInputError(
      `File "${target}" is not in the index. Use search_repository to find the exact path.`,
    );
  }
  return match;
}

function lineCount(sdk: ContextSDK, path: string): number {
  try {
    return sdk.files.getFile(path).content.split("\n").length;
  } catch {
    return 1;
  }
}

/** A heuristic for "this looks like a file path rather than a symbol name". */
function looksLikePath(target: string): boolean {
  return (
    target.includes("/") ||
    target.includes("\\") ||
    /\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|scss|html|yml|yaml)$/i.test(target)
  );
}

interface LineRange {
  readonly start: number;
  readonly end: number;
}

/** Choose a 1-based line range, defaulting to a declaration span, capped by maxLines. */
function chooseRange(
  startLine: number | undefined,
  endLine: number | undefined,
  defaultStart: number,
  defaultEnd: number,
  maxLines: number,
): LineRange {
  const start = startLine ?? Math.max(1, defaultStart);
  if (endLine !== undefined) {
    if (endLine < start) {
      throw new ToolInputError(`"endLine" (${endLine}) must be >= "startLine" (${start}).`);
    }
    return { start, end: endLine };
  }
  const end = Math.max(start, Math.min(Math.max(defaultEnd, start), start + maxLines - 1));
  return { start, end };
}

// ── shared helpers ───────────────────────────────────────────────────────────

function bindUi(file: string): { resourceUri: string } {
  return { resourceUri: `${UI_RESOURCES.base}${file}` };
}

function asConfidence(value: string | undefined): Confidence | undefined {
  return value === "high" || value === "medium" || value === "low" ? value : undefined;
}

function firstLine(text: string): string {
  const line = text.split("\n").find((entry) => entry.trim().length > 0) ?? text;
  return line.trim().slice(0, 160);
}

function withLanguage(prefix: string, language: string | undefined): string {
  return language === undefined ? prefix : `${prefix} (${language})`;
}

/** Attribute a hit to the expanded search term that produced it, when relevant. */
function withRelated(reason: string, relatedTerm: string | undefined): string {
  return relatedTerm === undefined ? reason : `related term "${relatedTerm}" — ${reason}`;
}

function uniquePaths(paths: readonly (string | null)[]): string[] {
  const seen = new Set<string>();
  for (const path of paths) {
    if (path !== null) seen.add(path);
  }
  return [...seen];
}
