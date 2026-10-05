import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CodeAtlasContext } from "./context";
import { executeHandler } from "./handler-utils";
import { HANDLERS, type HandlerContext } from "./handlers";
import type { Logger } from "./log";
import type { ToolName } from "./tools";
import type { ToolArgs } from "./validation";

/** A JSON `ReadResourceResult` body. */
function jsonContents(
  uri: URL,
  body: unknown,
): {
  contents: { uri: string; mimeType: string; text: string }[];
} {
  return {
    contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(body) }],
  };
}

/**
 * Register the read-only MCP **resources** (ADR-022 / MCP best practice): a
 * small, goal-oriented set of addressable projections rather than more tools.
 * Each delegates to an existing handler, so there is one implementation.
 */
export function registerResources(
  server: McpServer,
  context: CodeAtlasContext,
  logger: Logger,
): void {
  const read = async (name: ToolName, args: ToolArgs): Promise<unknown> => {
    const hctx: HandlerContext = { ctx: context, logger, timings: { probeMs: 0 } };
    const result = await executeHandler(hctx, HANDLERS[name], args);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.value;
  };

  server.registerResource(
    "CodeAtlas project overview",
    "codeatlas://overview",
    {
      mimeType: "application/json",
      description: "Counts, languages, and the stored project summary for the indexed repository.",
    },
    async (uri) => jsonContents(uri, await read("project_overview", {})),
  );

  server.registerResource(
    "CodeAtlas repo map",
    "codeatlas://repo-map",
    {
      mimeType: "application/json",
      description:
        "A compact repo map: the top symbols by deterministic PageRank importance, grouped by file.",
    },
    async (uri) => jsonContents(uri, context.requireSDK().project.repoMap()),
  );

  server.registerResource(
    "CodeAtlas symbol",
    new ResourceTemplate("codeatlas://symbol/{id}", { list: undefined }),
    {
      mimeType: "application/json",
      description: "A symbol's declaration, callers, callees, and test files by symbol id.",
    },
    async (uri, variables) =>
      jsonContents(uri, await read("inspect_symbol", { symbol: String(variables["id"] ?? "") })),
  );

  server.registerResource(
    "CodeAtlas skill",
    new ResourceTemplate("codeatlas://skills/{id}", { list: undefined }),
    {
      mimeType: "application/json",
      description: "A Skill's full body and references by id (built-in or project).",
    },
    async (uri, variables) =>
      jsonContents(uri, await read("get_skill", { id: String(variables["id"] ?? "") })),
  );
}
