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
  | "project_overview";

export const TOOL_NAMES: readonly ToolName[] = [
  "search_symbols",
  "search_files",
  "get_summary",
  "get_dependencies",
  "explain_module",
  "project_overview",
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

/** A single tool registration: metadata + zod input schema. */
export interface ToolDefinition {
  readonly name: ToolName;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Record<string, z.ZodType>;
}

/** Integer argument helper: `1..max` with a human-readable schema. */
function intRange(min: number, max: number): z.ZodNumber {
  return z.number().int().min(min).max(max);
}

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: "search_symbols",
    title: "Search symbols",
    description:
      "Search the CodeAtlas index for symbols (functions, classes, interfaces, methods, constants, ...) by name. " +
      "Returns ranked hits with the symbol kind, the defining file, the doc comment when present, and a relevance score. " +
      "Typo-tolerant fuzzy matching is on by default. Use it before get_dependencies or explain_module to find a symbol's exact name and file.",
    inputSchema: {
      query: z.string().describe("Symbol name or fragment to search for."),
      limit: intRange(1, 100).optional().describe("Maximum number of hits to return (default 20)."),
      kind: z.enum(SYMBOL_KINDS).optional().describe("Restrict results to a specific symbol kind."),
      minScore: z
        .number()
        .min(0)
        .optional()
        .describe("Drop hits below this relevance score (default 0)."),
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
      query: z.string().describe("File path fragment or content text to search for."),
      limit: intRange(1, 100).optional().describe("Maximum number of hits to return (default 20)."),
      minScore: z
        .number()
        .min(0)
        .optional()
        .describe("Drop hits below this relevance score (default 0)."),
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
      target: z
        .string()
        .describe(
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
      node: z
        .string()
        .optional()
        .describe("File path, symbol id, or symbol name to filter edges by."),
      relation: z
        .string()
        .optional()
        .describe("Only return edges of this kind (e.g. imports, calls, extends)."),
      direction: z
        .enum(["outgoing", "incoming", "both"])
        .optional()
        .describe("Which edges to return for the given node (default both)."),
      limit: intRange(1, 1000)
        .optional()
        .describe("Maximum number of edges to return (default 100)."),
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
      path: z.string().describe("Path of the module/folder to explain."),
      includeSummary: z
        .boolean()
        .optional()
        .describe("Include the stored module summary when present (default true)."),
      includeDependencies: z
        .boolean()
        .optional()
        .describe("Include dependency edges touching the module's files (default true)."),
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
  },
];
