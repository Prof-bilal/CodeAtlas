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
}

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
): ToolCallDecision {
  if (policy === undefined) {
    return { allowed: true };
  }
  if (policy.deniedTools?.includes(name) === true) {
    return { allowed: false, reason: `Tool "${name}" is denied by policy` };
  }
  if (policy.allowedTools !== undefined && !policy.allowedTools.includes(name)) {
    return { allowed: false, reason: `Tool "${name}" is not in the allowed tool list` };
  }
  return { allowed: true };
}
