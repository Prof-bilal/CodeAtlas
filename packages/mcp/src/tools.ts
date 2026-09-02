import { z } from "zod";

/**
 * Declarative tool registry: every tool the server exposes, its description,
 * and its zod input schema. The schema is converted to JSON Schema for
 * `tools/list` and used to validate `tools/call` arguments by the MCP SDK.
 */

export type ToolName =
  | "analyze_task"
  | "create_plan"
  | "find_relevant_context"
  | "inspect_symbol"
  | "verify_answer"
  | "search_symbols"
  | "search_files"
  | "get_summary"
  | "get_dependencies"
  | "explain_module"
  | "project_overview"
  | "read_file_range";

export const TOOL_NAMES: readonly ToolName[] = [
  "analyze_task",
  "create_plan",
  "find_relevant_context",
  "inspect_symbol",
  "verify_answer",
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
  // ── High-level tools (planning layer) ──────────────────────────────────────
  {
    name: "analyze_task",
    title: "Analyze task",
    description:
      "FIRST CHOICE for any task: classify it (debug/security/architecture/understand), extract file paths, symbol names, and keywords. " +
      "Deterministic, no AI, no index required. Start here to understand what the task needs. " +
      "Returns category, subcategory, confidence, reasoning, and extracted entities.",
    inputSchema: {
      task: boundedString("The user task or question to classify."),
    },
    outputSchema: {
      category: z
        .string()
        .describe("High-level task category (debug, security, architecture, understand)."),
      subcategory: z.string().describe("Finer-grained subcategory label."),
      confidence: z.number().describe("Classification confidence (0..1)."),
      reasoning: z.string().describe("Deterministic explanation of the classification."),
      entities: z
        .object({
          filePaths: z.array(z.string()).describe("File paths mentioned in the task."),
          symbolNames: z.array(z.string()).describe("Symbol name candidates."),
          keywords: z.array(z.string()).describe("Lowercase keyword fallbacks."),
        })
        .describe("Extracted entities from the task text."),
      nextSteps: z.array(z.string()).describe("Suggested next steps for the model."),
    },
  },
  {
    name: "create_plan",
    title: "Create plan",
    description:
      "Generate a deterministic plan for a task: classify it, build an impact set from search + dependency closure, " +
      "and produce ordered steps with rationale and verification strategy. Requires an indexed project. " +
      "Returns steps, impact set, unknowns, and verification strategy.",
    inputSchema: {
      task: boundedString("The user task to plan for."),
    },
    outputSchema: {
      category: z.string().describe("Task category."),
      steps: z
        .array(
          z.object({
            order: z.number().describe("Step order (1-based)."),
            action: z.string().describe("What to do."),
            targetFiles: z.array(z.string()).describe("Files this step touches."),
            rationale: z.string().describe("Why this step."),
          }),
        )
        .describe("Ordered plan steps."),
      impactSet: z.array(z.string()).describe("Files the plan expects to touch."),
      unknowns: z.array(z.string()).describe("Things the plan cannot resolve deterministically."),
      verificationStrategy: z.string().describe("Recommended verification approach."),
      nextSteps: z.array(z.string()).describe("Suggested next steps."),
    },
  },
  {
    name: "find_relevant_context",
    title: "Find relevant context",
    description:
      "Use this FIRST when you need to understand code. Returns ranked file excerpts relevant to the task, " +
      "organized by tier (critical/important/supporting) with scores, reasons, and line ranges. " +
      "Includes a sufficiency gate that reports whether the context is enough to answer. " +
      "Every result includes 'next_steps' — deterministic hints for what to do next. " +
      "DISCIPLINE: call this 1-2 times maximum; when 'sufficient' is true, stop exploring and " +
      "write your final answer citing the exact file paths. Do not keep searching once you can answer.",
    inputSchema: {
      task: boundedString("The task to retrieve context for."),
      maxItems: intRange(1, 50).optional().describe("Maximum context items (default 20)."),
      maxTokens: intRange(100, 50000).optional().describe("Maximum total tokens (default 12000)."),
      contextMode: z
        .enum(["auto", "auto-escalate", "digest", "full", "off"])
        .optional()
        .describe(
          "Context packing mode. 'digest' returns fewer, pre-digested items under a tight budget " +
            "(recommended for smaller/weaker models); 'full' uses the standard budget; " +
            "'auto' picks by repository size (default); " +
            "'auto-escalate' starts in digest and falls back to full if sufficiency is low.",
        ),
    },
    outputSchema: {
      task: z.string().describe("The original task."),
      items: z
        .array(
          z.object({
            id: z.string().describe("Stable item id."),
            kind: z
              .string()
              .describe("Item kind (file, symbol, summary, dependency, instructions, overview)."),
            title: z.string().describe("Human-readable title."),
            path: z.string().nullable().describe("File path, when applicable."),
            score: z.number().describe("Relevance score."),
            source: z.string().describe("How this item was selected."),
            reason: z.string().describe("Why this item was included."),
            tier: z.string().optional().describe("Hierarchy tier."),
            tokens: z.number().describe("Estimated token count."),
          }),
        )
        .describe("Ranked context items."),
      synthesis: z
        .object({
          kind: z
            .string()
            .describe("Analysis kind (dependency-path, fault-site, module-map, file-set)."),
          conclusion: z
            .string()
            .describe("The engine's computed conclusion — verify it, do not trust it."),
          evidence: z.array(z.string()).describe("Ordered reasoning the conclusion is built from."),
          centralFiles: z
            .array(z.string())
            .describe("Files central to the conclusion (cite/verify these)."),
        })
        .optional()
        .describe(
          "Deterministic synthesis (present in digest mode): a computed conclusion + evidence chain from the graph/summaries, so the model can verify and present instead of re-deriving everything.",
        ),
      sufficient: z.boolean().describe("Whether the context is sufficient to answer."),
      sufficiencyFailures: z
        .array(
          z.object({
            predicate: z.string().describe("Failed predicate id."),
            message: z.string().describe("Human-readable explanation."),
          }),
        )
        .describe("Why the context may be insufficient."),
      nextSteps: z.array(z.string()).describe("Deterministic next steps for the model."),
      budget: z
        .object({
          itemsRequested: z.number(),
          itemsIncluded: z.number(),
          tokensEstimated: z.number(),
          budgetExceeded: z.boolean(),
        })
        .describe("Budget enforcement summary."),
      escalated: z
        .boolean()
        .optional()
        .describe(
          "True only when `auto-escalate` re-assembled with `full` (instead of the initial digest) and the full package satisfied the sufficiency gate. False/absent when no escalation happened. Present on every result.",
        ),
      escalationFrom: z
        .string()
        .optional()
        .describe(
          "The mode escalation started from (`digest`); present only when `escalated` is true.",
        ),
    },
  },
  {
    name: "inspect_symbol",
    title: "Inspect symbol",
    description:
      "Full symbol neighborhood: declaration details, callers, callees, and test files. " +
      "Use after search_symbols narrows the target. Returns the symbol's location, kind, visibility, " +
      "dependency edges (who calls/callees/extends it), and associated test files.",
    inputSchema: {
      symbol: boundedString("Symbol name or id to inspect."),
    },
    outputSchema: {
      symbol: z
        .object({
          id: z.string().describe("Symbol id."),
          name: z.string().describe("Symbol name."),
          kind: z.string().describe("Symbol kind (function, class, method, ...)."),
          filePath: z.string().describe("File where the symbol is defined."),
          location: z
            .object({
              startLine: z.number(),
              endLine: z.number(),
            })
            .describe("Source location (1-based)."),
          visibility: z.string().describe("Access level."),
          documentation: z.string().nullable().describe("Doc comment, when present."),
          typeText: z.string().nullable().describe("Type annotation, when present."),
        })
        .describe("The symbol declaration."),
      callers: z
        .array(
          z.object({
            name: z.string(),
            kind: z.string(),
            filePath: z.string(),
            edgeKind: z.string(),
          }),
        )
        .describe("Symbols/nodes that call or use this symbol."),
      callees: z
        .array(
          z.object({
            name: z.string(),
            kind: z.string(),
            filePath: z.string(),
            edgeKind: z.string(),
          }),
        )
        .describe("Symbols/nodes that this symbol calls or uses."),
      testFiles: z.array(z.string()).describe("Test files associated with this symbol's file."),
      nextSteps: z.array(z.string()).describe("Suggested next steps."),
    },
  },
  {
    name: "verify_answer",
    title: "Verify answer",
    description:
      "Run claim checks and optional verification commands against an answer. " +
      "Detects hallucinated file paths, missing symbols, plan coverage gaps, and output contract violations. " +
      "Optionally runs typecheck/tests/lint via allow-listed commands from .codeatlas/verify.json. " +
      "Returns a verification report with per-check pass/fail, command results, and an overall verdict.",
    inputSchema: {
      task: boundedString("The task the answer addresses."),
      citedPaths: z
        .array(boundedString("A file path cited in the answer."))
        .optional()
        .describe("File paths the answer claims to reference."),
      citedSymbols: z
        .array(boundedString("A symbol name cited in the answer."))
        .optional()
        .describe("Symbol names the answer claims to reference."),
      planTargets: z
        .array(boundedString("A plan target the answer should cover."))
        .optional()
        .describe("Plan step targets the answer should address."),
      outputContract: z
        .array(
          z.object({
            kind: boundedString("Contract kind (contains-text, contains-function, no-errors)."),
            value: boundedString("Value to check against."),
          }),
        )
        .optional()
        .describe("Output contract assertions."),
    },
    outputSchema: {
      task: z.string().describe("The task that was verified."),
      strategy: z
        .enum(["none", "claim-checks", "command-runners"])
        .describe("Verification strategy used."),
      claims: z
        .object({
          checks: z
            .array(
              z.object({
                id: z.string().describe("Claim check id."),
                kind: z.string().describe("Claim kind."),
                target: z.string().describe("What was checked."),
                passed: z.boolean().describe("Whether the claim passed."),
                detail: z.string().describe("Human-readable result."),
              }),
            )
            .describe("All claim checks run."),
          passed: z.number().describe("Number of passing checks."),
          failed: z.number().describe("Number of failing checks."),
          allPassed: z.boolean().describe("True when all checks passed."),
        })
        .describe("Claim check results."),
      commands: z
        .array(
          z.object({
            command: z.string().describe("Command that was run."),
            args: z.array(z.string()).describe("Arguments passed."),
            exitCode: z.number().describe("Exit code (0 = success)."),
            stdout: z.string().describe("Captured stdout (may be truncated)."),
            stderr: z.string().describe("Captured stderr (may be truncated)."),
            timedOut: z.boolean().describe("Whether the command timed out."),
            durationMs: z.number().describe("Wall-clock duration in ms."),
            preExisting: z.boolean().describe("True when this was a pre-existing failure."),
          }),
        )
        .describe("Command run results."),
      verdict: z
        .enum(["pass", "fail", "partial", "skipped", "error"])
        .describe("Overall verification verdict."),
      summary: z.string().describe("Human-readable summary."),
      nextSteps: z.array(z.string()).describe("Suggested next steps."),
    },
  },
  // ── Low-level tools (atomic operations) ────────────────────────────────────
  {
    name: "search_symbols",
    title: "Search symbols",
    description:
      "FIRST CHOICE: Find related code by symbol name (functions, classes, interfaces, methods, constants, ...). " +
      "Use this before read_file_range to narrow down targets. Typical: 1-2 calls per task. " +
      "Returns ranked hits with symbol kind, file, documentation, and score. " +
      "Overlaps with search_files; prefer this for code symbols.",
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
      nextSteps: z.array(z.string()).describe("Suggested next steps (empty for atomic tools)."),
      freshness: freshnessField,
    },
  },
  {
    name: "search_files",
    title: "Search files",
    description:
      "Find files by path or content. Use when searching for tests, config, or documentation. " +
      "Typical: 1-2 calls per task. Typo-tolerant fuzzy matching is on by default. " +
      "Overlaps with search_symbols; prefer search_symbols for code symbols. " +
      "Use this for file paths, test files, config files, or documentation.",
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
      nextSteps: z.array(z.string()).describe("Suggested next steps (empty for atomic tools)."),
      freshness: freshnessField,
    },
  },
  {
    name: "get_summary",
    title: "Get summary",
    description:
      "Retrieve a stored summary for a file, folder, module, or the whole project. " +
      "Deterministic, no AI needed. Typical: 1-2 calls per task. " +
      'Use target "project" for the project-level summary, or a file/folder path. ' +
      'When no stored summary exists and "generate" is true, a fresh AI summary is produced through the configured provider ' +
      "(generation fails cleanly when no provider is configured).",
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
      nextSteps: z.array(z.string()).describe("Suggested next steps (empty for atomic tools)."),
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
      "Understand relationships between code: persisted dependency edges (imports, calls, extends, implements, references, ...). " +
      "For debugging: use direction='incoming', relation='calls' (what calls this). " +
      "For architecture: use direction='outgoing', relation='imports' (what this uses). " +
      "Typical: 1 call per task. Returns edges with human-readable labels. " +
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
      nextSteps: z.array(z.string()).describe("Suggested next steps (empty for atomic tools)."),
      freshness: freshnessField,
    },
  },
  {
    name: "explain_module",
    title: "Explain module",
    description:
      "Get a full picture of a directory/package: module record, files, key symbols, and dependency edges. " +
      "Use when you need to understand a whole module before editing. Typical: 1 call per task. " +
      "Use project_overview for a project-level summary instead.",
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
      nextSteps: z.array(z.string()).describe("Suggested next steps (empty for atomic tools)."),
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
      "High-level project stats: saved-at, schema version, file/symbol/module/dependency counts, language breakdown, and the stored project summary. " +
      "Use at task start to understand project structure. Typical: 0-1 calls per task. " +
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
        .array(
          z.object({
            path: z.string(),
            name: z.string(),
            moduleType: z.string(),
          }),
        )
        .optional()
        .describe("Module list (detail: full)."),
      topFiles: z
        .array(z.object({ path: z.string(), language: z.string() }))
        .optional()
        .describe("Top files by symbol count (detail: full)."),
      topSymbols: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            kind: z.string(),
            filePath: z.string(),
          }),
        )
        .optional()
        .describe("Top symbols by dependency count (detail: full)."),
      nextSteps: z.array(z.string()).describe("Suggested next steps (empty for atomic tools)."),
      freshness: freshnessField,
    },
  },
  {
    name: "read_file_range",
    title: "Read file range (version-aware)",
    description:
      "Get exact code. Slow. Only call after a search narrows the target. Typical: 2-5 calls per task. " +
      "Reads a line range of an indexed file from the current working tree, with optional version validation. " +
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
      nextSteps: z.array(z.string()).describe("Suggested next steps (empty for atomic tools)."),
      freshness: freshnessField,
      message: z
        .string()
        .optional()
        .describe("Human-readable note when the version does not match."),
    },
  },
];
