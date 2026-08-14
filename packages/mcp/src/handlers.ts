import type { ContextSDK, Result, Summary, SummaryKind } from "@atlas/sdk";
import type { CodeAtlasContext } from "./context";
import type { Logger } from "./log";
import { SUMMARY_KINDS, SYMBOL_KINDS, type ToolName } from "./tools";
import {
  type ToolArgs,
  ToolDomainError,
  ToolInputError,
  optionalBoolean,
  optionalEnum,
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
  search_symbols: searchSymbols,
  search_files: searchFiles,
  get_summary: getSummary,
  get_dependencies: getDependencies,
  explain_module: explainModule,
  project_overview: projectOverview,
  read_file_range: readFileRange,
};

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

  return { hits: enriched.slice(0, limit), total: enriched.length };
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
    return { path: hit.path, ...(language !== undefined ? { language } : {}), score: hit.score };
  });

  return { hits: results.slice(0, limit), total: results.length };
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
    return { found: true, generated: false, summaries: matches.map(toSummaryShape) };
  }
  if (!generate) {
    return {
      found: false,
      generated: false,
      summaries: [],
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
  return { found: true, generated: true, summaries: [toSummaryShape(result.value)] };
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
  };
}

// ── explain_module ───────────────────────────────────────────────────────────

async function explainModule(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const path = requireString(args, "path");
  const includeSummary = optionalBoolean(args, "includeSummary") ?? true;
  const includeDependencies = optionalBoolean(args, "includeDependencies") ?? true;

  const sdk = h.ctx.requireSDK();
  const explanation = sdk.modules.explain(path, { includeSummary, includeDependencies });
  return {
    path,
    module: explanation.module,
    fileCount: explanation.fileCount,
    files: explanation.files.map((file) => ({ path: file.path, language: file.language })),
    symbolCount: explanation.symbolCount,
    symbols: explanation.symbols.map((symbol) => ({
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
  return result;
}

// ── read_file_range ──────────────────────────────────────────────────────────

async function readFileRange(h: HandlerContext, args: ToolArgs): Promise<unknown> {
  const path = requireString(args, "path");
  const startLine = requireInt(args, "startLine");
  const endLine = requireInt(args, "endLine");
  const padding = optionalInt(args, "padding", 0, 1000);
  const expectedHash = optionalString(args, "expectedHash");

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
  return {
    path: range.path,
    startLine: range.startLine,
    endLine: range.endLine,
    content: range.content,
    hash: range.hash,
    versionMatch: range.versionMatch,
    stale: range.stale,
    padded: range.padded,
    ...(range.message === undefined ? {} : { message: range.message }),
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
