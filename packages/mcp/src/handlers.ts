import type {
  ClaimCheckInput,
  ContextPackage,
  ContextSDK,
  Result,
  SufficiencyResult,
  Summary,
  SummaryKind,
} from "@atlas/sdk";
import {
  createClassifier,
  createPlanner,
  createVerifier,
  evaluateSufficiency,
  loadVerifyConfig,
} from "@atlas/sdk";
import type { CodeAtlasContext } from "./context";
import { isDeniedPath } from "./deny";
import type { Logger } from "./log";
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

/** The services every tool handler needs at call time. */
export interface HandlerContext {
  readonly ctx: CodeAtlasContext;
  readonly logger: Logger;
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
}

export const HANDLERS: Readonly<
  Record<ToolName, (h: HandlerContext, args: ToolArgs) => Promise<unknown>>
> = {
  analyze_task: analyzeTask,
  create_plan: createPlan,
  find_relevant_context: findRelevantContext,
  inspect_symbol: inspectSymbol,
  verify_answer: verifyAnswer,
  search_symbols: searchSymbols,
  search_files: searchFiles,
  get_summary: getSummary,
  get_dependencies: getDependencies,
  explain_module: explainModule,
  project_overview: projectOverview,
  read_file_range: readFileRange,
};

// ── analyze_task ────────────────────────────────────────────────────────────

async function analyzeTask(_h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const task = requireString(args, "task");
  const classify = createClassifier();
  const classification = classify(task);

  const nextSteps: string[] = [];
  if (classification.confidence < 0.4) {
    nextSteps.push("Low classification confidence — consider rephrasing the task for clarity.");
  }
  if (classification.entities.filePaths.length > 0) {
    nextSteps.push(`Search for files: ${classification.entities.filePaths.join(", ")}`);
  }
  if (classification.entities.symbolNames.length > 0) {
    nextSteps.push(`Search for symbols: ${classification.entities.symbolNames.join(", ")}`);
  }
  nextSteps.push("Use create_plan to build a deterministic plan for this task.");

  return {
    category: classification.category,
    subcategory: classification.subcategory,
    confidence: classification.confidence,
    reasoning: classification.reasoning,
    entities: classification.entities,
    nextSteps,
  };
}

// ── create_plan ─────────────────────────────────────────────────────────────

async function createPlan(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const task = requireString(args, "task");
  const sdk = h.ctx.requireSDK();

  const classify = createClassifier();
  const classification = classify(task);
  const planner = createPlanner(sdk);
  const planResult = planner.plan(task, classification);

  const nextSteps: string[] = [];
  if (planResult.unknowns.length > 0) {
    nextSteps.push(`Unknowns detected: ${planResult.unknowns.join("; ")}`);
  }
  if (planResult.impactSet.length > 0) {
    nextSteps.push(
      `Review impact set (${planResult.impactSet.length} files) and use find_relevant_context for detailed context.`,
    );
  }
  if (planResult.verificationStrategy !== "none") {
    nextSteps.push(`Verification strategy: ${planResult.verificationStrategy}`);
  }

  return {
    category: classification.category,
    steps: planResult.steps,
    impactSet: planResult.impactSet,
    unknowns: planResult.unknowns,
    verificationStrategy: planResult.verificationStrategy,
    nextSteps,
  };
}

// ── find_relevant_context ───────────────────────────────────────────────────

async function findRelevantContext(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const task = requireString(args, "task");
  const maxItems = optionalInt(args, "maxItems", 1, 50) ?? 20;
  const maxTokens = optionalInt(args, "maxTokens", 100, 50000) ?? 12000;
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

  const nextSteps = [...finalSufficiency.nextSteps];
  if (finalSufficiency.sufficient) {
    nextSteps.push(
      "Context is SUFFICIENT — stop exploring now and write your final answer. " +
        "Cite the exact file paths you will reference. Do not read more files unless something is missing.",
    );
  } else {
    nextSteps.push(
      "Context may be insufficient — consider broader search or dependency expansion.",
    );
  }

  const result = {
    task: finalPkg.task,
    items: finalPkg.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      path: item.path,
      score: item.score,
      source: item.source,
      reason: item.reason,
      ...(item.tier !== undefined ? { tier: item.tier } : {}),
      tokens: item.tokens,
    })),
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
  const hits = sdk.symbols.searchSymbols(symbolQuery, { limit: 1, minScore: 50 });
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

  // Find test files: files matching *.test.ts or *.spec.ts in the same directory.
  const testFiles: string[] = [];
  const allFiles = sdk.files.listFiles();
  const symbolDir = symbol.filePath.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
  for (const file of allFiles) {
    const filePath = file.path.replace(/\\/g, "/");
    if (
      filePath.startsWith(symbolDir) &&
      (filePath.endsWith(".test.ts") ||
        filePath.endsWith(".spec.ts") ||
        filePath.endsWith(".test.js") ||
        filePath.endsWith(".spec.js"))
    ) {
      testFiles.push(file.path);
    }
  }

  const nextSteps: string[] = [];
  if (callers.length > 0) {
    nextSteps.push(`Review ${callers.length} caller(s) to understand usage.`);
  }
  if (callees.length > 0) {
    nextSteps.push(`Review ${callees.length} callee(s) to understand dependencies.`);
  }
  if (testFiles.length > 0) {
    nextSteps.push(`Check ${testFiles.length} test file(s) for expected behavior.`);
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
    callers,
    callees,
    testFiles,
    nextSteps,
  };
}

// ── search_symbols ───────────────────────────────────────────────────────────

async function searchSymbols(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const query = requireString(args, "query");
  const limit = optionalInt(args, "limit", 1, 100) ?? 20;
  const kind = optionalEnum(args, "kind", SYMBOL_KINDS);
  const minScore = optionalNumber(args, "minScore", 0) ?? 0;

  const sdk = h.ctx.requireSDK();
  const hits = sdk.symbols.searchSymbols(query, {
    limit,
    minScore,
    ...(kind === undefined ? {} : { kind }),
  });

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
    return {
      name: hit.title,
      path: hit.path,
      targetId: hit.targetId,
      ...(symbolKind !== undefined ? { symbolKind } : {}),
      documentation,
      score: hit.score,
    };
  });

  return { hits: enriched.slice(0, limit), total: enriched.length, nextSteps: [] };
}

// ── search_files ─────────────────────────────────────────────────────────────

async function searchFiles(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const query = requireString(args, "query");
  const limit = optionalInt(args, "limit", 1, 100) ?? 20;
  const minScore = optionalNumber(args, "minScore", 0) ?? 0;

  const sdk = h.ctx.requireSDK();
  const hits = sdk.files.searchFiles(query, { limit, minScore });
  const results = hits.map((hit) => {
    let language: string | undefined;
    if (hit.path !== null) {
      try {
        language = sdk.files.getFile(hit.path).language;
      } catch (_) {
        // File removed from a concurrent refresh — omit language.
      }
    }
    return {
      path: hit.path,
      ...(language !== undefined ? { language } : {}),
      score: hit.score,
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
  const limit = optionalInt(args, "limit", 1, 1000) ?? 100;

  const sdk = h.ctx.requireSDK();
  const { edges, nodeFound, total } = sdk.dependencies.query({
    ...(node === undefined ? {} : { node }),
    ...(relation === undefined ? {} : { relation }),
    direction: direction as "outgoing" | "incoming" | "both",
    limit,
  });

  return {
    node: node ?? null,
    count: edges.length,
    total,
    nodeFound,
    dependencies: edges.map(
      (edge): DependencyShape => ({
        from: edge.from,
        to: edge.to,
        relation: edge.kind,
        fromLabel: edge.fromLabel,
        toLabel: edge.toLabel,
      }),
    ),
    nextSteps: [],
  };
}

// ── explain_module ───────────────────────────────────────────────────────────

async function explainModule(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const path = requireString(args, "path");
  const includeSummary = optionalBoolean(args, "includeSummary") ?? true;
  const includeDependencies = optionalBoolean(args, "includeDependencies") ?? true;

  const sdk = h.ctx.requireSDK();
  const explanation = sdk.modules.explain(path, {
    includeSummary,
    includeDependencies,
  });

  const MAX_SYMBOLS = 200;
  const MAX_FILES = 200;
  const symbols = explanation.symbols.slice(0, MAX_SYMBOLS);
  const files = explanation.files.slice(0, MAX_FILES);

  return {
    path,
    module: explanation.module,
    fileCount: explanation.fileCount,
    files: files.map((file) => ({ path: file.path, language: file.language })),
    symbolCount: explanation.symbolCount,
    symbols: symbols.map((symbol) => ({
      id: symbol.id,
      name: symbol.name,
      kind: symbol.kind,
      filePath: symbol.filePath,
      location: {
        startLine: symbol.location.startLine,
        endLine: symbol.location.endLine,
      },
    })),
    dependencyCount: explanation.dependencyCount,
    dependencies: explanation.dependencies,
    summary: explanation.summary === null ? null : toSummaryShape(explanation.summary),
    ...(explanation.fileCount > MAX_FILES
      ? {
          fileOverflow: `${explanation.fileCount} total files (showing first ${MAX_FILES})`,
        }
      : {}),
    ...(explanation.symbolCount > MAX_SYMBOLS
      ? {
          symbolOverflow: `${explanation.symbolCount} total symbols (showing first ${MAX_SYMBOLS})`,
        }
      : {}),
    nextSteps: [],
  };
}

// ── project_overview ─────────────────────────────────────────────────────────

async function projectOverview(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const includeSummary = optionalBoolean(args, "includeSummary") ?? true;
  const detail = optionalEnum(args, "detail", ["summary", "full"]) ?? "summary";

  const sdk = h.ctx.requireSDK();
  const overview = sdk.project.overview(detail as "summary" | "full");
  const result: Record<string, unknown> = {
    savedAt: overview.savedAt,
    schemaVersion: overview.schemaVersion,
    counts: overview.counts,
    languages: overview.languages,
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

// ── verify_answer ────────────────────────────────────────────────────────────

async function verifyAnswer(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const task = requireString(args, "task");
  const citedPaths = optionalStringArray(args, "citedPaths") ?? [];
  const citedSymbols = optionalStringArray(args, "citedSymbols") ?? [];
  const planTargets = optionalStringArray(args, "planTargets") ?? [];
  const outputContractRaw = optionalArray(args, "outputContract") as
    | Array<{ kind?: string; value?: string }>
    | undefined;

  const outputContract = outputContractRaw?.map((c) => ({
    kind: String(c.kind ?? ""),
    value: String(c.value ?? ""),
  }));

  const sdk = h.ctx.requireSDK();
  const projectRoot = h.ctx.root;

  // Resolve symbols from the context index
  const resolveSymbols = async (): Promise<readonly string[]> => {
    try {
      const overview = sdk.project.overview("summary");
      return (overview.topSymbols ?? []).map((s) => s.name);
    } catch {
      return [];
    }
  };

  const verifier = createVerifier({
    resolveSymbols,
    getAnswerText: () => task,
    computeFingerprint: async () => `${projectRoot}:${Date.now()}`,
    log: (msg) => h.logger.info(msg),
  });

  // Load verify config
  const config = loadVerifyConfig(projectRoot) ?? undefined;

  const claimInput: ClaimCheckInput = {
    task,
    citedPaths,
    citedSymbols,
    planTargets,
    ...(outputContract ? { outputContract } : {}),
  };

  const report = await verifier.verify(claimInput, config, projectRoot);

  return {
    task: report.task,
    strategy: report.strategy,
    claims: {
      checks: report.claims.checks.map((c) => ({
        id: c.id,
        kind: c.kind,
        target: c.target,
        passed: c.passed,
        detail: c.detail,
      })),
      passed: report.claims.passed,
      failed: report.claims.failed,
      allPassed: report.claims.allPassed,
    },
    commands: report.commands.map((c) => ({
      command: c.command,
      args: [...c.args],
      exitCode: c.exitCode,
      stdout: c.stdout,
      stderr: c.stderr,
      timedOut: c.timedOut,
      durationMs: c.durationMs,
      preExisting: c.preExisting,
    })),
    verdict: report.verdict,
    summary: report.summary,
    nextSteps: buildVerifyNextSteps(report),
  };
}

function buildVerifyNextSteps(report: { verdict: string; claims: { failed: number } }): string[] {
  const steps: string[] = [];
  if (report.verdict === "fail") {
    if (report.claims.failed > 0) {
      steps.push("Fix hallucinated paths or symbols cited in the answer");
    }
    steps.push("Re-run verification after correcting the answer");
  }
  if (report.verdict === "partial") {
    steps.push("Pre-existing failures detected; consider running atlas doctor");
  }
  return steps;
}

function optionalStringArray(args: ToolArgs, key: string): string[] | undefined {
  const val = args[key];
  if (val === undefined || val === null) return undefined;
  if (!Array.isArray(val)) return undefined;
  return val.map((v) => String(v));
}

function optionalArray(args: ToolArgs, key: string): unknown[] | undefined {
  const val = args[key];
  if (val === undefined || val === null) return undefined;
  if (!Array.isArray(val)) return undefined;
  return val;
}
