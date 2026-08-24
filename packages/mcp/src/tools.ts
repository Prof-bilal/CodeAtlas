import { z } from "zod";

/**
 * Declarative tool registry: every tool the server exposes, its description,
 * and its zod input schema. The schema is converted to JSON Schema for
 * `tools/list` and used to validate `tools/call` arguments by the MCP SDK.
 */

export type ToolName =
  | "search_symbols"
  | "search_files"
  | "get_summary"
  | "get_dependencies"
  | "explain_module"
  | "project_overview"
  | "read_file_range";

export const TOOL_NAMES: readonly ToolName[] = [
  "search_symbols",
  "search_files",
  "get_summary",
  "get_dependencies",
  "explain_module",
  "project_overview",
  "read_file_range",
];

/** Symbol kinds the parser can emit (mirrors `@atlas/core` `SymbolKind`). */
export const SYMBOL_KINDS = [
  "class",
  "interface",
  "function",
  "method",
  "constructor",
  "property",
  "variable",
  "constant",
  "import",
  "export",
  "enum",
  "enum-member",
  "type-alias",
] as const;

/** Summary scopes stored in the context database. */
export const SUMMARY_KINDS = ["file", "folder", "module", "project"] as const;

/** A single tool registration: metadata + zod input and output schemas. */
export interface ToolDefinition {
  readonly name: ToolName;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Record<string, z.ZodType>;
  /** Advertised shape of `structuredContent` (root is always an object). */
  readonly outputSchema: Record<string, z.ZodType>;
}

/** Integer argument helper: `1..max` with a human-readable schema. */
function intRange(min: number, max: number): z.ZodNumber {
  return z.number().int().min(min).max(max);
}

/**
 * Maximum length for string inputs (queries, paths, targets). Bounds keep the
 * fuzzy scorer and path resolution away from pathological inputs: a multi-KB
 * query would otherwise blow up the whole-token regex inside `@atlas/search`
 * with an uncontrolled internal error instead of a clean validation rejection.
 */
const MAX_STRING_LENGTH = 10_000;

/** A string argument capped at {@link MAX_STRING_LENGTH}. */
function boundedString(description: string): z.ZodString {
  return z.string().max(MAX_STRING_LENGTH).describe(description);
}

/** The freshness verdict attached to every object result. */
const freshnessField = z
  .object({
    state: z
      .enum(["fresh", "stale", "unavailable", "unknown"])
      .describe("Staleness of the served results relative to the working tree."),
    refreshed: z.boolean().describe("Whether a refresh ran before this result was served."),
    checkedAt: z.string().describe("ISO timestamp of the staleness check."),
    changedFiles: z
      .number()
      .optional()
      .describe("Changed/added/deleted files detected before a refresh (when known)."),
    message: z.string().optional().describe("Human-readable detail for stale/unknown states."),
  })
  .describe("Staleness report attached to every tool result.");

/** A ranked symbol hit from `search_symbols`. */
const symbolHit = {
  name: z.string().describe("Symbol name."),
  path: z.string().nullable().describe("Absolute path of the defining file."),
  targetId: z.string().nullable().describe("Graph node id of the hit (for get_dependencies)."),
  symbolKind: z.string().optional().describe("Parser symbol kind, when still resolvable."),
  documentation: z.string().nullable().describe("Doc comment, when present."),
  score: z.number().describe("Deterministic relevance score (0..1)."),
};

/** A ranked file hit from `search_files`. */
const fileHit = {
  path: z.string().nullable().describe("Absolute path of the file."),
  language: z.string().optional().describe("Detected language, when still resolvable."),
  score: z.number().describe("Deterministic relevance score (0..1)."),
};

/** A file entry inside an `explain_module` result (no relevance score). */
const moduleFile = {
  path: z.string().describe("Absolute path of the file."),
  language: z.string().describe("Detected language."),
};

/** The normalized summary shape returned by `get_summary` / `explain_module`. */
const summaryShape = {
  kind: z.string().describe("Summary scope (file/folder/module/project)."),
  target: z.string().describe('Path or "project" the summary covers.'),
  overview: z.string().describe("Short overview of the target."),
  keyPoints: z.array(z.string()).describe("Structured key points."),
  metadata: z.object({
    generatedAt: z.string(),
    provider: z.string(),
    model: z.string(),
    cacheHit: z.boolean(),
    durationMs: z.number(),
    totalTokens: z.number(),
  }),
};

/** A single dependency edge with human-readable endpoints. */
const dependencyShape = {
  from: z.string().describe("Source node id."),
  to: z.string().describe("Target node id."),
  relation: z.string().describe("Edge kind (imports, calls, extends, ...)."),
  fromLabel: z.string().describe("Human-readable source label."),
  toLabel: z.string().describe("Human-readable target label."),
};

/** A dependency edge as exposed by `explain_module` (uses the SDK field name). */
const moduleDependencyShape = {
  from: z.string().describe("Source node id."),
  to: z.string().describe("Target node id."),
  kind: z.string().describe("Edge kind (imports, calls, extends, ...)."),
  fromLabel: z.string().describe("Human-readable source label."),
  toLabel: z.string().describe("Human-readable target label."),
};

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: "search_symbols",
    title: "Search symbols",
    description:
      "Search the CodeAtlas index for symbols (functions, classes, interfaces, methods, constants, ...) by name. " +
      "Returns ranked hits with the symbol kind, the defining file, the doc comment when present, and a relevance score. " +
      "Typo-tolerant fuzzy matching is on by default. Use it before get_dependencies or explain_module to find a symbol's exact name and file.",
    inputSchema: {
      query: boundedString("Symbol name or fragment to search for."),
      limit: intRange(1, 100).optional().describe("Maximum number of hits to return (default 20)."),
      kind: z.enum(SYMBOL_KINDS).optional().describe("Restrict results to a specific symbol kind."),
      minScore: z
        .number()
        .min(0)
        .optional()
        .describe("Drop hits below this relevance score (default 0)."),
    },
    outputSchema: {
      hits: z.array(z.object(symbolHit)).describe("Ranked symbol hits."),
      total: z.number().describe("Total hits before the limit was applied."),
      freshness: freshnessField,
    },
  },
  {
    name: "search_files",
    title: "Search files",
    description:
      "Search the CodeAtlas index for files by path or content. " +
      "Returns ranked hits with the file path, detected language, and a relevance score. " +
      "Typo-tolerant fuzzy matching is on by default.",
    inputSchema: {
      query: boundedString("File path fragment or content text to search for."),
      limit: intRange(1, 100).optional().describe("Maximum number of hits to return (default 20)."),
      minScore: z
        .number()
        .min(0)
        .optional()
        .describe("Drop hits below this relevance score (default 0)."),
    },
    outputSchema: {
      hits: z.array(z.object(fileHit)).describe("Ranked file hits."),
      total: z.number().describe("Total hits before the limit was applied."),
      freshness: freshnessField,
    },
  },
  {
    name: "get_summary",
    title: "Get summary",
    description:
      "Retrieve a stored summary for a file, folder, module, or the whole project from the persisted index. " +
      "This is deterministic and works with no AI provider configured. " +
      'When no stored summary exists and "generate" is true, a fresh AI summary is produced through the configured provider ' +
      "(CodeAtlas is AI-optional, so generation fails cleanly when no provider is configured). " +
      'Use target "project" for the project-level summary, or a file/folder path.',
    inputSchema: {
      target: boundedString(
        'Path of the file/folder/module to summarize, or "project" for the whole project.',
      ),
      kind: z
        .enum(SUMMARY_KINDS)
        .optional()
        .describe("Hint for which stored summary scope to match (default: match any scope)."),
      generate: z
        .boolean()
        .optional()
        .describe("Generate a fresh AI summary when none is stored (default false)."),
      force: z
        .boolean()
        .optional()
        .describe("When generating, bypass the content-hash cache (default false)."),
    },
    outputSchema: {
      found: z.boolean().describe("Whether a summary exists for the target."),
      generated: z.boolean().describe("Whether the summary was generated on this call."),
      summaries: z.array(z.object(summaryShape)).describe("Matching stored/generated summaries."),
      freshness: freshnessField,
      message: z
        .string()
        .optional()
        .describe("Human-readable note when no summary is stored and none was generated."),
    },
  },
  {
    name: "get_dependencies",
    title: "Get dependencies",
    description:
      "Return persisted dependency edges from the CodeAtlas graph (imports, calls, extends, implements, references, ...). " +
      "Optionally filter to a single node — a file path, symbol id, or symbol name — and by relation kind. " +
      '"direction" selects outgoing edges (what the node depends on), incoming edges (what depends on it), or both. ' +
      "Edge endpoints are graph node ids with human-readable labels resolved from files and symbols.",
    inputSchema: {
      node: boundedString("File path, symbol id, or symbol name to filter edges by.").optional(),
      relation: boundedString(
        "Only return edges of this kind (e.g. imports, calls, extends).",
      ).optional(),
      direction: z
        .enum(["outgoing", "incoming", "both"])
        .optional()
        .describe("Which edges to return for the given node (default both)."),
      limit: intRange(1, 1000)
        .optional()
        .describe("Maximum number of edges to return (default 100)."),
    },
    outputSchema: {
      node: z.string().nullable().describe("The requested filter node, or null."),
      count: z.number().describe("Edges returned (after filtering and limit)."),
      total: z.number().describe("Total edges in the graph (before filtering)."),
      nodeFound: z.boolean().describe("False when the node was not found in the index."),
      dependencies: z.array(z.object(dependencyShape)).describe("Dependency edges."),
      freshness: freshnessField,
    },
  },
  {
    name: "explain_module",
    title: "Explain module",
    description:
      "Explain a module (a folder or package): its persisted module record, the files it contains, the key symbols defined there, " +
      "and the dependency edges touching its files. Optionally includes the stored module summary. " +
      "Useful for understanding what a directory does before editing it.",
    inputSchema: {
      path: boundedString("Path of the module/folder to explain."),
      includeSummary: z
        .boolean()
        .optional()
        .describe("Include the stored module summary when present (default true)."),
      includeDependencies: z
        .boolean()
        .optional()
        .describe("Include dependency edges touching the module's files (default true)."),
    },
    outputSchema: {
      path: z.string().describe("The module/folder path requested."),
      module: z.any().nullable().describe("The persisted module record, or null."),
      fileCount: z.number().describe("Files in the module."),
      files: z.array(z.object(moduleFile)).describe("Files in the module."),
      symbolCount: z.number().describe("Symbols in the module."),
      symbols: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            kind: z.string(),
            filePath: z.string(),
            location: z.object({ startLine: z.number(), endLine: z.number() }),
          }),
        )
        .describe("Symbols defined in the module."),
      dependencyCount: z.number().describe("Dependency edges touching the module's files."),
      dependencies: z.array(z.object(moduleDependencyShape)).describe("Dependency edges."),
      summary: z.object(summaryShape).nullable().describe("Stored module summary, or null."),
      freshness: freshnessField,
      fileOverflow: z
        .string()
        .optional()
        .describe("Present when more files exist than were returned."),
      symbolOverflow: z
        .string()
        .optional()
        .describe("Present when more symbols exist than were returned."),
    },
  },
  {
    name: "project_overview",
    title: "Project overview",
    description:
      "High-level overview of the indexed project: when it was saved, the schema version, counts of files/symbols/modules/dependencies/summaries, " +
      "a language breakdown, and the stored project summary when present. " +
      'With detail "full" it also lists modules, the top files, and the top symbols.',
    inputSchema: {
      includeSummary: z
        .boolean()
        .optional()
        .describe("Include the stored project summary when present (default true)."),
      detail: z
        .enum(["summary", "full"])
        .optional()
        .describe(
          '"summary" (default) returns counts + overview; "full" also lists modules, files, and symbols.',
        ),
    },
    outputSchema: {
      savedAt: z.string().describe("ISO timestamp of the last index write."),
      schemaVersion: z.number().describe("Context database schema version."),
      counts: z
        .object({
          files: z.number(),
          symbols: z.number(),
          modules: z.number(),
          dependencies: z.number(),
          summaries: z.number(),
        })
        .describe("Indexed entity counts."),
      languages: z.record(z.string(), z.number()).describe("Files per detected language."),
      summary: z.object(summaryShape).nullable().describe("Stored project summary, or null."),
      modules: z
        .array(z.object({ path: z.string(), name: z.string(), moduleType: z.string() }))
        .optional()
        .describe("Module list (detail: full)."),
      topFiles: z
        .array(z.object({ path: z.string(), language: z.string() }))
        .optional()
        .describe("Top files by symbol count (detail: full)."),
      topSymbols: z
        .array(
          z.object({ id: z.string(), name: z.string(), kind: z.string(), filePath: z.string() }),
        )
        .optional()
        .describe("Top symbols by dependency count (detail: full)."),
      freshness: freshnessField,
    },
  },
  {
    name: "read_file_range",
    title: "Read file range (version-aware)",
    description:
      "Read a line range of an indexed file from the current working tree, with optional version validation. " +
      'Pass "expectedHash" (a file hash previously returned by CodeAtlas) so the read can detect whether the file ' +
      'changed since that context was generated; on a mismatch it returns the fresh content and "versionMatch": false ' +
      'instead of silently trusting stale line numbers. "padding" (default 5) includes context lines above and below ' +
      "the requested range to protect against small line-number drift.",
    inputSchema: {
      path: boundedString("Path of the indexed file to read."),
      startLine: intRange(1, 1_000_000).describe("First line to return (1-based)."),
      endLine: intRange(1, 1_000_000).describe("Last line to return (1-based)."),
      padding: intRange(0, 1000)
        .optional()
        .describe("Context lines above/below the requested range (default 5)."),
      expectedHash: boundedString(
        "File hash the caller's context was generated against; validates freshness.",
      ).optional(),
    },
    outputSchema: {
      path: z.string().describe("Path of the indexed file read."),
      startLine: z.number().describe("Effective first line returned (after clamping/padding)."),
      endLine: z.number().describe("Effective last line returned (after clamping/padding)."),
      content: z.string().describe("The range content from the current working tree."),
      hash: z.string().describe("SHA-256 of the current on-disk file."),
      versionMatch: z.boolean().describe("False when expectedHash mismatches the current hash."),
      stale: z.boolean().describe("True when the on-disk file differs from the persisted index."),
      padded: z.boolean().describe("True when padding was applied around the requested range."),
      freshness: freshnessField,
      message: z
        .string()
        .optional()
        .describe("Human-readable note when the version does not match."),
    },
  },
];
