import type { ToolDefinition } from "@atlas/core";
import type { Result } from "@atlas/shared";

/**
 * A provider-independent source of executable context tools.
 *
 * This interface inverts the dependency between the tool loop and the tool
 * registry: `@atlas/sdk` defines this seam; `@atlas/mcp` implements it using
 * its existing `TOOLS` + `HANDLERS`. No duplicate tool registry.
 */
export interface ContextToolSource {
  /** Return the tool definitions the model may call (JSON Schema parameters). */
  listTools(): readonly ToolDefinition[];

  /**
   * Execute a named tool with the given arguments.
   *
   * @param name - Tool name (must match one of `listTools()` names).
   * @param args - Parsed arguments from the model's tool call.
   * @returns The tool's result as a JSON-serializable value, or a failed
   *   `Result` with a human-readable error message for domain/validation errors.
   */
  execute(name: string, args: Record<string, unknown>): Promise<Result<unknown>>;

  /**
   * Optional deny-filter for file reads (beta audit Fix 6). Returns true when
   * the path should be blocked (secrets/sensitive configuration). When
   * present, consumers must refuse to read denied paths.
   */
  getDenyFilter?(): (path: string) => boolean;
}

/** Maximum tool calls per request (prevents infinite loops). */
export const MAX_TOOL_ROUNDS = 10;

/** Maximum characters per tool result (oversized results are truncated). */
export const MAX_TOOL_RESULT_CHARS = 20_000;

/**
 * Advisory per-call permission policy for the runtime tool loop.
 *
 * The default (no policy) allows every tool the `ContextToolSource` exposes.
 * A policy can restrict which tools may run and how much they may return.
 * Denied calls are *not* silently dropped: the model receives an error result
 * for the call, the denial is recorded in `ChatAgentResult.deniedToolCalls`,
 * and the conversation continues — the surface is advisory, never a silent
 * block, and never a hard failure of the whole run.
 */
export interface ToolCallPolicy {
  /** If set, only these tool names may be called; everything else is denied. */
  readonly allowedTools?: readonly string[];
  /** Tools that are always denied (takes precedence over `allowedTools`). */
  readonly deniedTools?: readonly string[];
  /** Maximum total executed tool calls per run (denied calls do not count). */
  readonly maxToolCalls?: number;
  /** Maximum characters per tool result (default: `MAX_TOOL_RESULT_CHARS`). */
  readonly maxResultChars?: number;
  /**
   * Per-tool call limits. Keys are tool names, values are max executed calls
   * per run. When unset, {@link DEFAULT_PER_TOOL_LIMITS} applies.
   */
  readonly perToolCallLimit?: Record<string, number>;
}

/**
 * Default per-tool call limits for the runtime tool loop.
 *
 * These encode the audited "typical usage" per task (see the beta audit):
 * searches should be narrow and repeated-query detection deduplicates near
 * duplicates, so a handful of calls per tool is enough. Tools absent from
 * this record are unlimited (beyond `maxToolCalls`).
 */
export const DEFAULT_PER_TOOL_LIMITS: Record<string, number> = {
  search_symbols: 2,
  search_files: 2,
  get_dependencies: 1,
  explain_module: 1,
  read_file_range: 5,
  get_summary: 2,
  project_overview: 1,
};

/** Outcome of evaluating one tool name against a {@link ToolCallPolicy}. */
export interface ToolCallDecision {
  readonly allowed: boolean;
  /** Human-readable denial reason (undefined when allowed). */
  readonly reason?: string;
}

/**
 * Evaluate a tool name against a policy. Exported for reuse by callers that
 * need to pre-check calls (e.g. to render what a policy would allow).
 */
export function evaluateToolCallPolicy(
  policy: ToolCallPolicy | undefined,
  name: string,
  perToolCounts?: Record<string, number>,
): ToolCallDecision {
  if (policy !== undefined) {
    if (policy.deniedTools?.includes(name) === true) {
      return { allowed: false, reason: `Tool "${name}" is denied by policy` };
    }
    if (policy.allowedTools !== undefined && !policy.allowedTools.includes(name)) {
      return {
        allowed: false,
        reason: `Tool "${name}" is not in the allowed tool list`,
      };
    }
  }
  // Per-tool call limits apply even without an explicit policy: the defaults
  // encode the audited "typical usage" per task. Override via
  // `policy.perToolCallLimit`.
  const limits = policy?.perToolCallLimit ?? DEFAULT_PER_TOOL_LIMITS;
  const limit = limits[name];
  if (limit !== undefined && perToolCounts !== undefined) {
    const used = perToolCounts[name] ?? 0;
    if (used >= limit) {
      return {
        allowed: false,
        reason: `Tool "${name}" limit reached (${used}/${limit} calls). Use results from prior calls instead of repeating this tool.`,
      };
    }
  }
  return { allowed: true };
}
