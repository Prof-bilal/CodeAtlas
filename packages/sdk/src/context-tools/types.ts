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
