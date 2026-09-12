import {
  type ContextSDK,
  type ContextToolSource,
  type Result,
  type ToolDefinition,
  denyFilter,
  fail,
} from "@atlas/sdk";
import type { ZodType } from "zod";
import { z } from "zod";
import { executeHandler } from "./handler-utils";
import { HANDLERS, type HandlerContext } from "./handlers";
import { type Logger, createLogger } from "./log";
import { TOOLS, TOOL_ALIASES, type ToolName, resolveToolName } from "./tools";
import { zodToJsonSchema } from "./zod-to-json-schema";

/** Convert MCP tool definitions to ToolDefinition[] (JSON Schema parameters). */
function buildToolDefinitions(): readonly ToolDefinition[] {
  const definitions = TOOLS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: convertInputSchema(tool.inputSchema),
    },
  }));
  // Phase 4 compat window: advertise the canonical names too.
  const byName = new Map(TOOLS.map((tool) => [tool.name, tool]));
  for (const [canonical, deprecated] of Object.entries(TOOL_ALIASES)) {
    const tool = byName.get(deprecated);
    if (tool === undefined) {
      continue;
    }
    definitions.push({
      type: "function" as const,
      function: {
        name: canonical as ToolName,
        description: `${tool.description}\n\n(CANONICAL name for the deprecated \`${deprecated}\` tool.)`,
        parameters: convertInputSchema(tool.inputSchema),
      },
    });
  }
  return definitions;
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
      const canonical = resolveToolName(name);
      if (!toolNames.has(name) && !TOOL_ALIASES[name]) {
        return fail(new Error(`Unknown tool: "${name}"`));
      }

      const handler = HANDLERS[canonical as ToolName];
      if (handler === undefined) {
        return fail(new Error(`No handler for tool: "${name}"`));
      }

      return executeHandler(handlerContext, handler, args);
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
    timings: { probeMs: 0 },
  };
  return createContextToolSource(handlerContext);
}
