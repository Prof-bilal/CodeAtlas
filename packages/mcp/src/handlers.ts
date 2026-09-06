import type {
  ContextPackage,
  ContextSDK,
  Result,
  SufficiencyResult,
  Summary,
  SummaryKind,
} from "@atlas/sdk";
import { evaluateSufficiency } from "@atlas/sdk";
import type { CodeAtlasContext } from "./context";
import { isDeniedPath } from "./deny";
import type { Logger } from "./log";
import { normalizeScore, toInternalMinScore } from "./score";
import { SUMMARY_KINDS, SYMBOL_KINDS, type ToolName } from "./tools";
import {
  type ToolArgs,
  ToolDomainError,
  ToolInputError,
  optionalBoolean,
  optionalEnum,
  optionalEnumFromEnv,
  optionalInt,
  optionalNumber,
  optionalString,
  requireInt,
  requireString,
} from "./validation";

/** Per-call timing attribution (Phase 0 instrumentation). */
export interface ToolTimings {
  probeMs: number;
  searchMs?: number;
  assemblyMs?: number;
}

/** The services every tool handler needs at call time. */
export interface HandlerContext {
  readonly ctx: CodeAtlasContext;
  readonly logger: Logger;
  /** Mutable timings bag filled by handlers; server attaches it to the result. */
  readonly timings: ToolTimings;
}

/** The normalized summary shape returned to clients. */
export interface SummaryShape {
  readonly kind: SummaryKind;
  readonly target: string;
  readonly overview: string;
  readonly keyPoints: readonly string[];
  readonly metadata: {
    readonly generatedAt: string;
    readonly provider: string;
    readonly model: string;
    readonly cacheHit: boolean;
    readonly durationMs: number;
    readonly totalTokens: number;
  };
}

/** A single dependency edge with human-readable endpoint labels. */
export interface DependencyShape {
  readonly from: string;
  readonly to: string;
  readonly relation: string;
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly hop?: number;
  readonly path?: readonly string[];
}

export const HANDLERS: Readonly<
  Record<ToolName, (h: HandlerContext, args: ToolArgs) => Promise<unknown>>
> = {
  find_relevant_context: findRelevantContext,
  inspect_symbol: inspectSymbol,
  search_symbols: searchSymbols,
  search_files: searchFiles,
  get_summary: getSummary,
  get_dependencies: getDependencies,
  project_overview: projectOverview,
  read_file_range: readFileRange,
};

// ── find_relevant_context ───────────────────────────────────────────────────

async function findRelevantContext(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const task = requireString(args, "task");
  const maxItems = optionalInt(args, "maxItems", 1, 50) ?? 20;
  const maxTokens = optionalInt(args, "maxTokens", 100, 50000) ?? 12000;
  const brief = optionalBoolean(args, "brief") ?? false;
  const contextMode: "auto" | "auto-escalate" | "digest" | "full" | "off" | undefined =
    (optionalEnum(args, "contextMode", ["auto", "auto-escalate", "digest", "full", "off"]) ??
      optionalEnumFromEnv("ATLAS_CONTEXT_MODE", [
        "auto",
        "auto-escalate",
        "digest",
        "full",
        "off",
      ])) as "auto" | "auto-escalate" | "digest" | "full" | "off" | undefined;

  const sdk = h.ctx.requireSDK();

  // Build the context package via the SDK's assembly pipeline.
  const { assembleContextPackage } = await import("@atlas/sdk");
  const { detectStaleness } = await import("@atlas/sdk");
  const staleness = await detectStaleness(sdk);

  const assemble = (mode: "auto" | "digest" | "full" | "off"): ContextPackage => {
    const pkg = assembleContextPackage({
      context: sdk,
      repositoryPath: sdk.config.repositoryPath,
      task,
      staleness,
      options: {
        budget: { maxItems, maxTokensPerItem: 2000, maxTokensTotal: maxTokens },
        ...(brief ? { brief: true } : {}),
        ...(contextMode !== undefined ? { contextMode: mode } : {}),
      },
    });
    return pkg;
  };
  const evaluate = (pkg: ContextPackage): SufficiencyResult => {
    const indexedPaths = sdk.files.listFiles().map((f) => f.path);
    return evaluateSufficiency({
      planTargets: pkg.items.filter((i) => i.path !== null).map((i) => i.path ?? ""),
      indexedPaths,
      searchHits: pkg.items
        .filter((i) => i.path !== null)
        .map((i) => ({ path: i.path, score: i.score })),
      isCodeModification: true,
      criticalCount: pkg.items.filter((i) => i.tier === "critical").length,
      closureDependencyCount: pkg.items.filter((i) => i.kind === "dependency").length,
      isMultiFileTask: pkg.items.filter((i) => i.kind === "file").length > 1,
    });
  };

  // Auto-escalate: start with digest, fall back to full if sufficiency is low.
  // The model gets the best package it can in a single tool call — it does not
  // need to know about the escalation; it just receives more context when needed.
  const startMode: "auto" | "digest" | "full" | "off" =
    contextMode === "auto-escalate" ? "digest" : contextMode === undefined ? "auto" : contextMode;

  const assembleStarted = performance.now();
  const pkg = assemble(startMode);
  const sufficiency = evaluate(pkg);

  // Escalate only when the digest pass failed the gate AND a full package
  // actually passes it. A re-assembly is not an escalation when full is just as
  // insufficient (small repos produce digest-equivalent packages), so the flag
  // below reflects the outcome, not the attempt.
  let finalPkg = pkg;
  let finalSufficiency = sufficiency;
  let escalated = false;
  if (contextMode === "auto-escalate" && !sufficiency.sufficient) {
    const fullPkg = assemble("full");
    const fullSufficiency = evaluate(fullPkg);
    if (fullSufficiency.sufficient) {
      finalPkg = fullPkg;
      finalSufficiency = fullSufficiency;
      escalated = true;
    }
  }
  h.timings.assemblyMs = Math.round(performance.now() - assembleStarted);

  // Compact guidance (Phase 3): a single short `hint` replaces the verbose
  // prose steps; `nextSteps` stays for backward compatibility but carries only
  // the sufficiency predicate hints (typically empty when sufficient).
  const nextSteps = [...finalSufficiency.nextSteps];
  const hint = finalSufficiency.sufficient
    ? "Context SUFFICIENT — write the final answer now; cite exact file paths."
    : (finalSufficiency.refine ??
      "Context may be insufficient — broaden search or expand dependencies.");

  const result = {
    task: finalPkg.task,
    items: finalPkg.items.map((item) => {
      const normalized = normalizeScore(item.score);
      return {
        id: item.id,
        kind: item.kind,
        title: item.title,
        path: item.path,
        score: normalized.score,
        rawScore: normalized.rawScore,
        confidence: normalized.confidence,
        source: item.source,
        reason: item.reason,
        ...(item.tier !== undefined ? { tier: item.tier } : {}),
        tokens: item.tokens,
      };
    }),
    ...(finalPkg.synthesis !== undefined
      ? {
          synthesis: {
            kind: finalPkg.synthesis.kind,
            conclusion: finalPkg.synthesis.conclusion,
            evidence: finalPkg.synthesis.evidence,
            centralFiles: finalPkg.synthesis.centralFiles,
          },
        }
      : {}),
    sufficient: finalSufficiency.sufficient,
    sufficiencyFailures: finalSufficiency.failures.map((f) => ({
      predicate: f.predicate,
      message: f.message,
    })),
    ...(!finalSufficiency.sufficient && finalSufficiency.refine !== undefined
      ? { refine: finalSufficiency.refine }
      : {}),
    hint,
    nextSteps,
    budget: {
      itemsRequested: finalPkg.budget.itemsRequested,
      itemsIncluded: finalPkg.budget.itemsIncluded,
      tokensEstimated: finalPkg.budget.tokensEstimated,
      budgetExceeded: finalPkg.budget.budgetExceeded,
    },
    // Explicit escalation signal on every result: true only when auto-escalate
    // re-assembled with full and the full package satisfied the gate.
    ...(escalated
      ? { escalated: true as const, escalationFrom: "digest" as const }
      : { escalated: false }),
  };

  // Cap output at 50K chars (Phase B B5)
  const serialized = JSON.stringify(result);
  const MAX_OUTPUT_CHARS = 50_000;
  if (serialized.length > MAX_OUTPUT_CHARS) {
    const truncated = serialized.slice(0, MAX_OUTPUT_CHARS);
    return JSON.parse(`${truncated.slice(0, truncated.lastIndexOf(","))}}`) as unknown;
  }

  return result;
}

// ── inspect_symbol ──────────────────────────────────────────────────────────

async function inspectSymbol(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const symbolQuery = requireString(args, "symbol");
  const sdk = h.ctx.requireSDK();

  // Try to find the symbol by name search.
  const searchStarted = performance.now();
  const hits = sdk.symbols.searchSymbols(symbolQuery, { limit: 1, minScore: 50 });
  h.timings.searchMs = Math.round(performance.now() - searchStarted);
  if (hits.length === 0) {
    throw new ToolDomainError(`Symbol "${symbolQuery}" not found in the index.`);
  }

  const hit = hits[0];
  if (hit === undefined) {
    throw new ToolDomainError(`Symbol "${symbolQuery}" not found in the index.`);
  }
  const symbolId = symbolIdFromTarget(hit.targetId);
  if (symbolId === undefined) {
    throw new ToolDomainError(`Symbol "${symbolQuery}" could not be resolved.`);
  }

  const symbol = sdk.symbols.getSymbol(symbolId);

  // Find callers and callees via dependency edges.
  const allEdges = sdk.dependencies.getDependencyGraph();
  const callers: Array<{ name: string; kind: string; filePath: string; edgeKind: string }> = [];
  const callees: Array<{ name: string; kind: string; filePath: string; edgeKind: string }> = [];

  const symbolNodeId = `n:${symbolId}`;
  const fileNodeId = `n:file:${symbol.filePath}`;

  for (const edge of allEdges) {
    // Incoming edges (callers): edge.to points to our symbol or its file.
    if (edge.to === symbolNodeId || edge.to === fileNodeId) {
      const sourceNode = resolveNode(sdk, edge.from);
      if (sourceNode !== null) {
        callers.push({
          name: sourceNode.name,
          kind: sourceNode.kind,
          filePath: sourceNode.filePath,
          edgeKind: edge.kind,
        });
      }
    }
    // Outgoing edges (callees): edge.from points to our symbol or its file.
    if (edge.from === symbolNodeId || edge.from === fileNodeId) {
      const targetNode = resolveNode(sdk, edge.to);
      if (targetNode !== null) {
        callees.push({
          name: targetNode.name,
          kind: targetNode.kind,
          filePath: targetNode.filePath,
          edgeKind: edge.kind,
        });
      }
    }
  }

  // Find test files: prefer derived `tested-by` graph edges (impl file -> test
  // file, F4); fall back to the same-directory *.test|*.spec scan for indexes
  // built before test-edge derivation existed.
  const testFiles = new Set<string>();
  const fileNode = `n:file:${symbol.filePath}`;
  for (const edge of allEdges) {
    if (edge.kind === "tested-by" && edge.from === fileNode) {
      testFiles.add(edge.to.replace(/^n:file:/, ""));
    }
  }
  if (testFiles.size === 0) {
    const symbolDir = symbol.filePath.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
    for (const file of sdk.files.listFiles()) {
      const filePath = file.path.replace(/\\/g, "/");
      if (
        filePath.startsWith(symbolDir) &&
        (filePath.endsWith(".test.ts") ||
          filePath.endsWith(".spec.ts") ||
          filePath.endsWith(".test.js") ||
          filePath.endsWith(".spec.js"))
      ) {
        testFiles.add(file.path);
      }
    }
  }
  const testFilesList = [...testFiles];

  // Phase 4 cap discipline: caller/callee lists are capped at 25 each so a
  // dense-graph symbol cannot blow up the response; overflow is reported.
  const MAX_CALLERS = 25;
  const MAX_CALLEES = 25;
  const callerOverflow =
    callers.length > MAX_CALLERS
      ? `${callers.length} total callers (showing first ${MAX_CALLERS})`
      : undefined;
  const calleeOverflow =
    callees.length > MAX_CALLEES
      ? `${callees.length} total callees (showing first ${MAX_CALLEES})`
      : undefined;
  const cappedCallers = callers.slice(0, MAX_CALLERS);
  const cappedCallees = callees.slice(0, MAX_CALLEES);
  // Confidence: exact-name resolution is high; test-edge fallback lowers it.
  const confidence =
    testFiles.size > 0 && symbol.name === symbolQuery
      ? "high"
      : symbol.name === symbolQuery
        ? "high"
        : "medium";

  const nextSteps: string[] = [];
  if (cappedCallers.length > 0) {
    nextSteps.push(`Review ${cappedCallers.length} caller(s) to understand usage.`);
  }
  if (cappedCallees.length > 0) {
    nextSteps.push(`Review ${cappedCallees.length} callee(s) to understand dependencies.`);
  }
  if (testFilesList.length > 0) {
    nextSteps.push(`Check ${testFilesList.length} test file(s) for expected behavior.`);
  }

  return {
    symbol: {
      id: symbol.id,
      name: symbol.name,
      kind: symbol.kind,
      filePath: symbol.filePath,
      location: {
        startLine: symbol.location.startLine,
        endLine: symbol.location.endLine,
      },
      visibility: symbol.visibility,
      documentation: symbol.documentation,
      typeText: symbol.typeText,
    },
    callers: cappedCallers,
    callees: cappedCallees,
    testFiles: testFilesList,
    confidence,
    ...(callerOverflow !== undefined ? { callerOverflow } : {}),
    ...(calleeOverflow !== undefined ? { calleeOverflow } : {}),
    nextSteps,
  };
}

// ── search_symbols ───────────────────────────────────────────────────────────

async function searchSymbols(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const query = requireString(args, "query");
  const limit = optionalInt(args, "limit", 1, 100) ?? 20;
  const kind = optionalEnum(args, "kind", SYMBOL_KINDS);
  const minScoreRaw = optionalNumber(args, "minScore", 0) ?? 0;
  const minScore = toInternalMinScore(minScoreRaw);

  const sdk = h.ctx.requireSDK();
  const searchStarted = performance.now();
  const hits = sdk.symbols.searchSymbols(query, {
    limit,
    minScore,
    ...(kind === undefined ? {} : { kind }),
  });
  h.timings.searchMs = Math.round(performance.now() - searchStarted);

  const enriched = hits.map((hit) => {
    const symbolId = symbolIdFromTarget(hit.targetId);
    let symbolKind: string | undefined;
    let documentation: string | null = null;
    if (symbolId !== undefined) {
      try {
        const symbol = sdk.symbols.getSymbol(symbolId);
        symbolKind = symbol.kind;
        documentation = symbol.documentation;
      } catch (_) {
        // Symbol already dropped from a concurrent index refresh — skip.
      }
    }
    const normalized = normalizeScore(hit.score);
    return {
      name: hit.title,
      path: hit.path,
      targetId: hit.targetId,
      ...(symbolKind !== undefined ? { symbolKind } : {}),
      documentation,
      score: normalized.score,
      rawScore: normalized.rawScore,
      confidence: normalized.confidence,
    };
  });

  return { hits: enriched.slice(0, limit), total: enriched.length, nextSteps: [] };
}

// ── search_files ─────────────────────────────────────────────────────────────

async function searchFiles(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const query = requireString(args, "query");
  const limit = optionalInt(args, "limit", 1, 100) ?? 20;
  const minScoreRaw = optionalNumber(args, "minScore", 0) ?? 0;
  const minScore = toInternalMinScore(minScoreRaw);

  const sdk = h.ctx.requireSDK();
  const searchStarted = performance.now();
  const hits = sdk.files.searchFiles(query, { limit, minScore });
  h.timings.searchMs = Math.round(performance.now() - searchStarted);
  const results = hits.map((hit) => {
    let language: string | undefined;
    if (hit.path !== null) {
      try {
        language = sdk.files.getFile(hit.path).language;
      } catch (_) {
        // File removed from a concurrent refresh — omit language.
      }
    }
    const normalized = normalizeScore(hit.score);
    return {
      path: hit.path,
      ...(language !== undefined ? { language } : {}),
      score: normalized.score,
      rawScore: normalized.rawScore,
      confidence: normalized.confidence,
    };
  });

  return { hits: results.slice(0, limit), total: results.length, nextSteps: [] };
}

// ── get_summary ──────────────────────────────────────────────────────────────

async function getSummary(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const target = requireString(args, "target");
  const kindHint = optionalEnum(args, "kind", SUMMARY_KINDS);
  const generate = optionalBoolean(args, "generate") ?? false;
  const force = optionalBoolean(args, "force") ?? false;

  const sdk = h.ctx.requireSDK();
  const summaries = sdk.summaries.listSummaries();

  const matchesBase =
    target === "project"
      ? summaries.filter((summary) => summary.kind === "project")
      : summaries.filter((summary) => summary.target === target);
  const matches =
    kindHint === undefined
      ? matchesBase
      : matchesBase.filter((summary) => summary.kind === kindHint);
  if (matches.length > 0) {
    return {
      found: true,
      generated: false,
      summaries: matches.map(toSummaryShape),
      nextSteps: [],
    };
  }
  if (!generate) {
    return {
      found: false,
      generated: false,
      summaries: [],
      nextSteps: [],
      message: `No stored summary for "${target}". Pass "generate": true to create one via the configured AI provider.`,
    };
  }

  const kind = resolveSummaryKind(sdk, target, kindHint);
  const opts = force === true ? { force: true } : {};
  const result: Result<Summary> = await summarize(sdk, kind, target, opts);
  if (!result.ok) {
    throw new ToolDomainError(`Summary generation failed for "${target}": ${result.error.message}`);
  }
  h.logger.info(
    `generated ${kind} summary for "${target}" (provider: ${result.value.metadata.provider})`,
  );
  return {
    found: true,
    generated: true,
    summaries: [toSummaryShape(result.value)],
    nextSteps: [],
  };
}

/** Resolve the generation scope for a target (mirrors the old kind hints). */
function resolveSummaryKind(
  sdk: ContextSDK,
  target: string,
  kindHint: string | undefined,
): SummaryKind {
  if (kindHint === "project" || target === "project") {
    return "project";
  }
  if (kindHint === "folder" || kindHint === "module" || kindHint === "file") {
    return kindHint;
  }
  const file = sdk.files.listFiles().find((entry) => entry.path === target);
  return file === undefined ? "module" : "file";
}

/** Delegate a summary request to the matching SDK summary method. */
async function summarize(
  sdk: ContextSDK,
  kind: SummaryKind,
  target: string,
  options: { readonly force?: boolean },
): Promise<Result<Summary>> {
  if (kind === "project") {
    return sdk.summaries.generateProject(options);
  }
  if (kind === "folder") {
    return sdk.summaries.generateFolder(target, options);
  }
  if (kind === "file") {
    return sdk.summaries.generateFile(target, options);
  }
  return sdk.summaries.generateModule(target, options);
}

// ── get_dependencies ─────────────────────────────────────────────────────────

async function getDependencies(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const node = optionalString(args, "node");
  const relation = optionalString(args, "relation");
  const direction = optionalEnum(args, "direction", ["outgoing", "incoming", "both"]) ?? "both";
  // Tightened default (Phase 3): 25 edges is enough for the common call/import
  // question; callers needing bulk set `limit` explicitly (max 1000).
  const limit = optionalInt(args, "limit", 1, 1000) ?? 25;
  // Phase 4: bounded BFS depth 1..3 (default 1). The protocol schema
  // rejects out-of-range values before this runs; the SDK clamps defensively.
  const rawDepth = optionalInt(args, "depth", 1, 3);
  const depth = rawDepth ?? 1;

  const sdk = h.ctx.requireSDK();
  const {
    edges,
    nodeFound,
    total,
    depth: effectiveDepth,
  } = sdk.dependencies.query({
    ...(node === undefined ? {} : { node }),
    ...(relation === undefined ? {} : { relation }),
    direction: direction as "outgoing" | "incoming" | "both",
    limit,
    depth,
  });

  return {
    node: node ?? null,
    count: edges.length,
    total,
    nodeFound,
    depth: effectiveDepth ?? depth,
    dependencies: edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      relation: edge.kind,
      fromLabel: edge.fromLabel,
      toLabel: edge.toLabel,
      ...(edge.hop !== undefined ? { hop: edge.hop } : {}),
      ...(edge.path !== undefined ? { path: [...edge.path] } : {}),
    })),
    nextSteps: [],
  };
}

// ── project_overview ─────────────────────────────────────────────────────────

async function projectOverview(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const includeSummary = optionalBoolean(args, "includeSummary") ?? true;
  const detail = optionalEnum(args, "detail", ["summary", "full"]) ?? "summary";

  const sdk = h.ctx.requireSDK();
  const overview = sdk.project.overview(detail as "summary" | "full");

  // Honesty: report how many indexed files actually have parsed symbols vs
  // content-only (scanner-visible but no symbol rows), and how many imports
  // could not be resolved (Phase 5 alias tracking).
  const files = sdk.files.listFiles();
  const symbolFiles = new Set(sdk.symbols.listSymbols().map((symbol) => symbol.filePath));
  let parsedFiles = 0;
  for (const file of files) {
    if (symbolFiles.has(file.path)) parsedFiles += 1;
  }
  const contentOnlyFiles = files.length - parsedFiles;

  const result: Record<string, unknown> = {
    savedAt: overview.savedAt,
    schemaVersion: overview.schemaVersion,
    counts: overview.counts,
    languages: overview.languages,
    parsedFiles,
    contentOnlyFiles,
    unresolvedImports: overview.unresolvedImports ?? 0,
  };
  if (includeSummary) {
    result["summary"] = overview.summary === undefined ? null : toSummaryShape(overview.summary);
  }
  if (detail === "full") {
    result["modules"] = (overview.modules ?? []).map((module) => ({
      path: module.path,
      name: module.name,
      moduleType: module.moduleType,
    }));
    result["topFiles"] = (overview.topFiles ?? []).map((file) => ({
      path: file.path,
      language: file.language,
    }));
    result["topSymbols"] = (overview.topSymbols ?? []).map((symbol) => ({
      id: symbol.id,
      name: symbol.name,
      kind: symbol.kind,
      filePath: symbol.filePath,
    }));
    // Phase 4 gating: full listings can be large — emit an explicit size
    // warning so agents prefer summary + targeted search/dependencies.
    const moduleCount = (overview.modules ?? []).length;
    result["warning"] =
      `detail:"full" returns module/file/symbol listings (${moduleCount} modules, ${files.length} files indexed) and can be large; prefer "summary" plus search_files/search_symbols/dependencies_of for targeted reads.`;
  }
  result["nextSteps"] = [];
  return result;
}

// ── read_file_range ──────────────────────────────────────────────────────────

async function readFileRange(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const path = requireString(args, "path");
  const startLine = requireInt(args, "startLine");
  const endLine = requireInt(args, "endLine");
  const padding = optionalInt(args, "padding", 0, 1000);
  const expectedHash = optionalString(args, "expectedHash");

  // Security: never read denied (secret/sensitive) files through MCP
  // (beta audit Fix 6). Fail closed with a clear domain error.
  if (isDeniedPath(path)) {
    h.logger.warn(`Security: Blocked read of denied file: ${path}`);
    throw new ToolDomainError(
      `File "${path}" is in the deny list (security policy). This file may contain secrets or sensitive configuration.`,
    );
  }

  if (endLine < startLine) {
    throw new ToolInputError(`"endLine" (${endLine}) must be >= "startLine" (${startLine}).`);
  }

  const sdk = h.ctx.requireSDK();
  const range = sdk.files.readRange(path, {
    startLine,
    endLine,
    ...(padding === undefined ? {} : { padding }),
    ...(expectedHash === undefined ? {} : { expectedHash }),
  });

  // Cap output at 20K chars (Phase B B5)
  const MAX_CONTENT_CHARS = 20_000;
  let content = range.content;
  let truncationNote: string | undefined;
  if (content.length > MAX_CONTENT_CHARS) {
    content = content.slice(0, MAX_CONTENT_CHARS);
    const remaining = range.content.length - MAX_CONTENT_CHARS;
    truncationNote = `[Content truncated at 20K chars — ${remaining} chars omitted. Narrow the line range to see more.]`;
  }

  return {
    path: range.path,
    startLine: range.startLine,
    endLine: range.endLine,
    content,
    hash: range.hash,
    versionMatch: range.versionMatch,
    stale: range.stale,
    padded: range.padded,
    ...(range.message === undefined ? {} : { message: range.message }),
    ...(truncationNote === undefined ? {} : { truncationNote }),
    nextSteps: [],
  };
}

// ── shared shape mapping ─────────────────────────────────────────────────────

function toSummaryShape(summary: Summary): SummaryShape {
  return {
    kind: summary.kind,
    target: summary.target,
    overview: summary.content.overview,
    keyPoints: summary.content.keyPoints,
    metadata: {
      generatedAt: summary.metadata.generatedAt,
      provider: summary.metadata.provider,
      model: summary.metadata.model,
      cacheHit: summary.metadata.cacheHit,
      durationMs: summary.metadata.durationMs,
      totalTokens: summary.metadata.totalTokens,
    },
  };
}

/** Extract the symbol id from a `symbol:<id>` search-hit target. */
function symbolIdFromTarget(targetId: string | null): string | undefined {
  if (targetId === null || !targetId.startsWith("symbol:")) {
    return undefined;
  }
  return targetId.slice("symbol:".length);
}

/** Resolve a graph node id to a human-readable name, kind, and file path. */
function resolveNode(
  sdk: ContextSDK,
  nodeId: string,
): { name: string; kind: string; filePath: string } | null {
  if (nodeId.startsWith("n:file:")) {
    const path = nodeId.slice("n:file:".length);
    return { name: path.split("/").pop() ?? path, kind: "file", filePath: path };
  }
  if (nodeId.startsWith("n:")) {
    const symbolId = nodeId.slice("n:".length);
    try {
      const symbol = sdk.symbols.getSymbol(symbolId);
      return { name: symbol.name, kind: symbol.kind, filePath: symbol.filePath };
    } catch {
      return null;
    }
  }
  return null;
}
