import {
  type ContextSDK,
  type ContextToolSource,
  type Result,
  type ToolDefinition,
  denyFilter,
  fail,
  ok,
} from "@atlas/sdk";
import type { ZodType } from "zod";
import { z } from "zod";
import { HANDLERS, type HandlerContext } from "./handlers";
import { type Logger, createLogger } from "./log";
import { TOOLS, type ToolName } from "./tools";
import { zodToJsonSchema } from "./zod-to-json-schema";

/** Convert MCP tool definitions to ToolDefinition[] (JSON Schema parameters). */
function buildToolDefinitions(): readonly ToolDefinition[] {
  return TOOLS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: convertInputSchema(tool.inputSchema),
    },
  }));
}

/** Convert a zod input schema to a JSON Schema object. */
function convertInputSchema(inputSchema: Record<string, ZodType>): Record<string, unknown> {
  return zodToJsonSchema(z.object(inputSchema));
}

/** Create a ContextToolSource backed by the MCP tool handlers. */
export function createContextToolSource(handlerContext: HandlerContext): ContextToolSource {
  const definitions = buildToolDefinitions();
  const toolNames = new Set(definitions.map((d) => d.function.name));

  return {
    listTools: () => definitions,

    async execute(name: string, args: Record<string, unknown>): Promise<Result<unknown>> {
      if (!toolNames.has(name)) {
        return fail(new Error(`Unknown tool: "${name}"`));
      }

      const handler = HANDLERS[name as ToolName];
      if (handler === undefined) {
        return fail(new Error(`No handler for tool: "${name}"`));
      }

      try {
        const result = await handler(handlerContext, args);
        return ok(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return fail(new Error(message));
      }
    },

    // Security (beta audit Fix 6): expose the secret deny-filter so consumers
    // (tool loop, CLI) can pre-check paths before any read is attempted.
    getDenyFilter: () => (path: string) => !denyFilter(path, "").accepted,
  };
}

/**
 * Create a ContextToolSource from a `ContextSDK` directly, without requiring
 * a full `HandlerContext`. This is the convenience factory for consumers that
 * already have a `ContextSDK` (e.g. the CLI).
 */
export function createContextToolSourceFromSDK(
  sdk: ContextSDK,
  options?: { readonly logger?: Logger },
): ContextToolSource {
  const logger = options?.logger ?? createLogger({ level: "warn" });
  const handlerContext: HandlerContext = {
    ctx: {
      requireSDK: () => sdk,
    } as never,
    logger,
  };
  return createContextToolSource(handlerContext);
}
