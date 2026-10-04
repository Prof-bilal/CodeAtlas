import {
  type RunnableTool,
  freshnessField,
  summaryShape,
  timingsField,
} from "@prof-bilal/atlas-mcp";
import { z } from "zod";

/**
 * The ChatGPT/Codex-facing tool surface.
 *
 * These are **not** the raw CodeAtlas MCP primitives. Each tool maps to one
 * recognizable user goal ("analyze this repo", "where is X", "explain how X
 * works", "what breaks if I change X", "show me the code for X") and delegates
 * to the existing `@prof-bilal/atlas-mcp` handlers / Context SDK reads — no
 * engine logic is reimplemented here.
 *
 * Tool descriptions are written to make routing unambiguous for a general
 * assistant: they state when to use each tool and when *not* to.
 */

export type ChatGptToolName =
  | "analyze_repository"
  | "search_repository"
  | "explain_repository"
  | "impact_analysis"
  | "get_context";

/** Binds a tool result to an MCP Apps UI resource. */
export interface ChatGptUiBinding {
  /** `ui://` resource that renders this tool's structured result. */
  readonly resourceUri: string;
  readonly title: string;
}

/** A ChatGPT-facing tool: metadata + zod schemas + optional widget binding. */
export interface ChatGptToolDefinition extends RunnableTool {
  readonly name: ChatGptToolName;
  readonly ui?: ChatGptUiBinding;
}

const MAX_STRING_LENGTH = 10_000;

/** A string argument capped at {@link MAX_STRING_LENGTH}. */
function boundedString(description: string): z.ZodString {
  return z.string().max(MAX_STRING_LENGTH).describe(description);
}

/** Integer argument helper with a human-readable schema. */
function intRange(min: number, max: number): z.ZodNumber {
  return z.number().int().min(min).max(max);
}

/** Shared trailing fields every ChatGPT result carries. */
const resultMeta = {
  freshness: freshnessField,
  timings: timingsField,
};

export const CHATGPT_TOOLS: readonly ChatGptToolDefinition[] = [
  {
    name: "analyze_repository",
    title: "Analyze repository",
    description:
      "Analyze a CodeAtlas-indexed repository and return its structure: repository name, framework/runtime, " +
      "language breakdown, file/symbol/module/dependency counts, major architectural areas, and notable " +
      "structural findings (unresolved imports, unparsed files, dependency cycles). " +
      "USE WHEN the user asks to analyze, overview, summarise, or 'get to know' their codebase, or asks what " +
      "languages/frameworks/size a project has. " +
      "DO NOT USE for generic programming questions unrelated to a repository, or to read code (use get_context). " +
      "Call at most once at the start of a repository conversation.",
    inputSchema: {
      focus: boundedString(
        "Optional area to summarize in the findings (e.g. 'authentication', 'billing').",
      ).optional(),
    },
    outputSchema: {
      repository: z.object({
        name: z.string().describe("Repository/directory name."),
        root: z.string().describe("Absolute path of the analyzed project root."),
        framework: z.string().nullable().describe("Detected framework, when identifiable."),
        isGitRepository: z.boolean().describe("Whether the project is a git worktree."),
      }),
      counts: z
        .object({
          files: z.number(),
          symbols: z.number(),
          modules: z.number(),
          dependencies: z.number(),
          summaries: z.number(),
        })
        .describe("Indexed entity counts."),
      languages: z.record(z.string(), z.number()).describe("Indexed files per language."),
      parsedFiles: z.number().describe("Indexed files that have at least one parsed symbol."),
      contentOnlyFiles: z
        .number()
        .describe("Indexed files with no parsed symbols (parser covers TypeScript/JavaScript)."),
      unresolvedImports: z
        .number()
        .describe("Import specifiers that could not be resolved to an indexed file."),
      savedAt: z.string().describe("ISO timestamp of the last index write."),
      schemaVersion: z.number().describe("Context database schema version."),
      focus: z.string().nullable().describe("The requested focus area, or null."),
      areas: z
        .array(z.object({ name: z.string(), path: z.string() }))
        .describe("Top-level architectural areas (shallowest indexed module directories)."),
      findings: z.array(z.string()).describe("Deterministic structural findings from the index."),
      summary: z.object(summaryShape).nullable().describe("Stored project summary, or null."),
      ui: z.object({ resourceUri: z.string() }).describe("UI resource that renders this result."),
      nextSteps: z.array(z.string()).describe("Deterministic suggested next steps."),
      ...resultMeta,
    },
    ui: { resourceUri: "ui://codeatlas/repository-summary.html", title: "Repository summary" },
  },
  {
    name: "search_repository",
    title: "Search repository",
    description:
      "Find where functionality lives in a CodeAtlas-indexed repository. Returns ranked files and symbols " +
      "with the matched symbol kind, source location, and a short reason each was selected. " +
      "USE WHEN the user asks 'where is X implemented', 'find the code for Y', 'which files handle Z', or asks " +
      "for relevant files/symbols before a change. " +
      "DO NOT USE to read code bodies (use get_context) or for dependency/impact questions (use impact_analysis). " +
      "Prefer 1-2 calls per task.",
    inputSchema: {
      query: boundedString("What to find, in natural language (feature, concept, or symbol name)."),
      limit: intRange(1, 50).optional().describe("Maximum merged results to return (default 12)."),
      kind: z
        .enum(["all", "files", "symbols"])
        .optional()
        .describe("Restrict to files, symbols, or both (default all)."),
    },
    outputSchema: {
      query: z.string().describe("The original query."),
      kind: z.string().describe("The requested result kind."),
      results: z
        .array(
          z.object({
            path: z.string().nullable().describe("Absolute path of the file, when known."),
            kind: z.enum(["file", "symbol"]).describe("Whether this is a file or symbol hit."),
            title: z.string().describe("Symbol name, or file basename."),
            symbolKind: z.string().optional().describe("Parser symbol kind, for symbol hits."),
            documentation: z.string().nullable().describe("Doc comment, when present."),
            line: z.number().optional().describe("Declaration line, for resolvable symbol hits."),
            score: z.number().describe("Deterministic relevance score (0..1)."),
            confidence: z
              .enum(["high", "medium", "low"])
              .optional()
              .describe("Coarse confidence band."),
            reason: z.string().describe("Why this hit was selected."),
          }),
        )
        .describe("Merged, ranked file and symbol hits."),
      total: z.number().describe("Total results after merging."),
      expandedTerms: z
        .array(z.string())
        .optional()
        .describe(
          "Present when a natural-language query matched nothing directly and was expanded into these concrete terms.",
        ),
      ui: z.object({ resourceUri: z.string() }).describe("UI resource that renders this result."),
      nextSteps: z.array(z.string()).describe("Deterministic suggested next steps."),
      ...resultMeta,
    },
    ui: { resourceUri: "ui://codeatlas/search-results.html", title: "Search results" },
  },
  {
    name: "explain_repository",
    title: "Explain architecture",
    description:
      "Explain how something works in a CodeAtlas-indexed repository, grounded in the indexed context and " +
      "dependency graph: relevant files/symbols, the dependency relationships between them, a deterministic " +
      "architecture conclusion when available, and whether the retrieved context is sufficient. " +
      "USE WHEN the user asks how a subsystem works, how data/control flows, or how modules relate " +
      "('how does checkout work', 'how does auth flow through the app'). " +
      "DO NOT USE for locating code (use search_repository) or for change-impact questions (use impact_analysis).",
    inputSchema: {
      question: boundedString("The architecture question, in natural language."),
      scope: boundedString(
        "Optional path or module to scope the explanation to (e.g. 'src/auth').",
      ).optional(),
    },
    outputSchema: {
      question: z.string().describe("The original question."),
      scope: z.string().nullable().describe("The requested scope, or null."),
      items: z
        .array(
          z.object({
            id: z.string().describe("Stable item id."),
            kind: z.string().describe("Item kind (file, symbol, summary, dependency)."),
            title: z.string().describe("Human-readable title."),
            path: z.string().nullable().describe("File path, when applicable."),
            reason: z.string().describe("Why this item is relevant."),
            score: z.number().describe("Relevance score (0..1)."),
            symbolKind: z.string().optional().describe("Parser symbol kind, for symbol items."),
            line: z.number().optional().describe("Declaration line, for symbol items."),
            confidence: z
              .enum(["high", "medium", "low"])
              .optional()
              .describe("Coarse confidence band."),
            ranges: z
              .array(z.object({ startLine: z.number(), endLine: z.number() }))
              .optional()
              .describe("Relevant 1-based source ranges, when known."),
          }),
        )
        .describe("Ranked context items grounding the explanation."),
      relationships: z
        .array(
          z.object({
            from: z.string().describe("Source node id."),
            to: z.string().describe("Target node id."),
            relation: z.string().describe("Edge kind (imports, calls, extends, ...)."),
            fromLabel: z.string().describe("Human-readable source label."),
            toLabel: z.string().describe("Human-readable target label."),
          }),
        )
        .describe("Dependency edges among the relevant files."),
      conclusion: z
        .string()
        .nullable()
        .describe("Deterministic engine conclusion when available, else null."),
      sufficient: z.boolean().describe("Whether the retrieved context is sufficient to answer."),
      sources: z.array(z.string()).describe("Indexed file paths the explanation is grounded in."),
      expandedTerms: z
        .array(z.string())
        .optional()
        .describe(
          "Present when the question matched no code directly and was expanded into these concrete terms.",
        ),
      hint: z.string().describe("One-line deterministic guidance."),
      ui: z.object({ resourceUri: z.string() }).describe("UI resource that renders this result."),
      nextSteps: z.array(z.string()).describe("Deterministic suggested next steps."),
      ...resultMeta,
    },
    ui: { resourceUri: "ui://codeatlas/explanation.html", title: "Architecture explanation" },
  },
  {
    name: "impact_analysis",
    title: "Analyze change impact",
    description:
      "Compute the blast radius of a change in a CodeAtlas-indexed repository: which files depend on the " +
      "given file(s) transitively, how far away they are, how many are tests/docs, and a composite risk " +
      "level (low/medium/high), plus the direct dependency edges. Grounded in the indexed graph, not guesses. " +
      "USE WHEN the user asks what a change could affect/break, what depends on a file or symbol, or how safe " +
      "a change is. " +
      "DO NOT USE to locate code (use search_repository) or to explain architecture (use explain_repository).",
    inputSchema: {
      paths: z
        .array(boundedString("A changed file path (repo-relative or absolute)."))
        .min(1)
        .max(50)
        .describe("The changed file paths to analyze."),
      maxDepth: intRange(0, 10)
        .optional()
        .describe("Maximum traversal depth (0 = unlimited, 1 = direct dependents only)."),
      includeTests: z.boolean().optional().describe("Include test files (default true)."),
      includeDocs: z.boolean().optional().describe("Include documentation files (default true)."),
    },
    outputSchema: {
      subjects: z.array(z.string()).describe("The input paths that were analyzed."),
      affected: z
        .array(
          z.object({
            path: z.string().describe("Affected file path."),
            distance: z.number().describe("Hop distance from the nearest changed subject."),
            isTestFile: z.boolean(),
            isDocFile: z.boolean(),
          }),
        )
        .describe("Transitive reverse-dependency closure."),
      risk: z
        .object({
          level: z.enum(["low", "medium", "high"]),
          directDependents: z.number(),
          totalAffected: z.number(),
          affectedTests: z.number(),
          affectedDocs: z.number(),
          fanOutRatio: z.number().describe("Fraction of the graph affected (0-1)."),
        })
        .describe("Risk summary for the change set."),
      edges: z
        .array(
          z.object({
            from: z.string().describe("Source label."),
            to: z.string().describe("Target label."),
            relation: z.string().describe("Edge kind."),
          }),
        )
        .describe("Direct dependency edges into the changed subjects."),
      ui: z.object({ resourceUri: z.string() }).describe("UI resource that renders this result."),
      nextSteps: z.array(z.string()).describe("Deterministic suggested next steps."),
      ...resultMeta,
    },
    ui: { resourceUri: "ui://codeatlas/impact-analysis.html", title: "Change impact" },
  },
  {
    name: "get_context",
    title: "Get code context",
    description:
      "Retrieve focused code context for a specific file or symbol in a CodeAtlas-indexed repository: the " +
      "resolved location and the exact source range, plus callers/callees and test files for symbols. " +
      "USE WHEN the user asks to see/show/read the code for a file or function, or after search_repository to " +
      "inspect a specific hit. " +
      "DO NOT USE to explore unknown code (use search_repository first) or for whole-repo overviews " +
      "(use analyze_repository).",
    inputSchema: {
      target: boundedString("A symbol name, file path, or path fragment to read."),
      kind: z
        .enum(["auto", "file", "symbol"])
        .optional()
        .describe("Interpret the target as a file or symbol (default auto-detect)."),
      startLine: intRange(1, 1_000_000).optional().describe("First line to return (1-based)."),
      endLine: intRange(1, 1_000_000).optional().describe("Last line to return (1-based)."),
      maxLines: intRange(1, 2000)
        .optional()
        .describe("Maximum lines to return when no explicit range is given (default 120)."),
    },
    outputSchema: {
      target: z.string().describe("The original target."),
      resolved: z
        .object({
          kind: z.enum(["file", "symbol"]).describe("How the target was resolved."),
          path: z.string().describe("Absolute path of the resolved file."),
          name: z.string().nullable().describe("Symbol name, for symbol resolutions."),
          symbolKind: z.string().nullable().describe("Symbol kind, for symbol resolutions."),
          startLine: z.number().nullable().describe("Symbol declaration start line, when known."),
          endLine: z.number().nullable().describe("Symbol declaration end line, when known."),
        })
        .describe("What the target resolved to."),
      content: z.string().describe("The source text for the resolved range."),
      callers: z
        .array(
          z.object({
            name: z.string(),
            kind: z.string(),
            filePath: z.string(),
            edgeKind: z.string(),
          }),
        )
        .describe("Callers/uses of the symbol (empty for files)."),
      callees: z
        .array(
          z.object({
            name: z.string(),
            kind: z.string(),
            filePath: z.string(),
            edgeKind: z.string(),
          }),
        )
        .describe("What the symbol calls/uses (empty for files)."),
      testFiles: z.array(z.string()).describe("Test files associated with the resolved file."),
      truncated: z.boolean().describe("Whether the returned content was truncated."),
      ui: z.object({ resourceUri: z.string() }).describe("UI resource that renders this result."),
      nextSteps: z.array(z.string()).describe("Deterministic suggested next steps."),
      ...resultMeta,
    },
    ui: { resourceUri: "ui://codeatlas/context-view.html", title: "Code context" },
  },
];

/** The ChatGPT tool names, in registration order. */
export const CHATGPT_TOOL_NAMES: readonly ChatGptToolName[] = CHATGPT_TOOLS.map((t) => t.name);

/** Look up a ChatGPT tool definition by name. */
export function chatGptTool(name: ChatGptToolName): ChatGptToolDefinition {
  const tool = CHATGPT_TOOLS.find((entry) => entry.name === name);
  if (tool === undefined) {
    throw new Error(`Unknown ChatGPT tool: ${name}`);
  }
  return tool;
}
