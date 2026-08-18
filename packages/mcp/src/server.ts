import { VERSION } from "@atlas/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CodeAtlasContext, type CodeAtlasContextOptions } from "./context";
import type { FreshnessReport } from "./freshness";
import { HANDLERS, type HandlerContext } from "./handlers";
import { type LogLevel, type Logger, createLogger } from "./log";
import { TOOLS, type ToolDefinition } from "./tools";
import { type ToolArgs, ToolDomainError, ToolInputError } from "./validation";

/** Options for creating or starting a CodeAtlas MCP server. */
export interface McpServerOptions extends CodeAtlasContextOptions {
  /** Inject a logger; defaults to stderr logging at `ATLAS_MCP_LOG_LEVEL`. */
  readonly logger?: Logger;
  /** Minimum log level when no logger is injected. */
  readonly logLevel?: LogLevel;
  /** MCP server name advertised in the handshake (default `"codeatlas"`). */
  readonly serverName?: string;
}

/** A running CodeAtlas MCP server and its lifecycle handles. */
export interface CodeAtlasMcpServer {
  /** The underlying MCP server (use for advanced protocol access). */
  readonly server: McpServer;
  /** The project context index the tools read from. */
  readonly context: CodeAtlasContext;
  /** The stderr logger. */
  readonly logger: Logger;
  /** Attach a transport and start listening. */
  connect(transport: Transport): Promise<void>;
  /** Close the transport and release the context database handle. */
  close(): Promise<void>;
}

/** Create a CodeAtlas MCP server with all tools registered. */
export function createMcpServer(options: McpServerOptions = {}): CodeAtlasMcpServer {
  const logger =
    options.logger ??
    createLogger(options.logLevel === undefined ? {} : { level: options.logLevel });
  const context = new CodeAtlasContext(options);
  const server = new McpServer({
    name: options.serverName ?? "codeatlas",
    version: VERSION,
  });
  registerTools(server, context, logger);
  return {
    server,
    context,
    logger,
    connect: (transport) => server.connect(transport),
    close: async () => {
      context.close();
      await server.close();
    },
  };
}

/**
 * Start the server on stdio and keep the process alive until the transport
 * closes or the process is signalled. This is the entry point for the
 * `codeatlas-mcp` binary.
 */
export async function startStdioServer(
  options: McpServerOptions = {},
): Promise<CodeAtlasMcpServer> {
  const mcp = createMcpServer(options);
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  mcp.logger.info(`CodeAtlas MCP server ready (context database: ${mcp.context.dbPath})`);

  let shuttingDown = false;
  const shutdown = (reason: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    mcp.logger.info(`received ${reason}; shutting down`);
    mcp
      .close()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.stdin.once("end", () => shutdown("stdin end"));
  process.stdin.once("close", () => shutdown("stdin close"));
  return mcp;
}

function registerTools(server: McpServer, context: CodeAtlasContext, logger: Logger): void {
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      },
      (args, _extra) => runTool(tool, context, logger, args),
    );
  }
}

/** Execute a tool handler, converting success and failure into a tool result. */
async function runTool(
  tool: ToolDefinition,
  context: CodeAtlasContext,
  logger: Logger,
  args: unknown,
): Promise<CallToolResult> {
  const startedAt = performance.now();
  logger.debug(`tool call: ${tool.name}`);
  // Detect stale index state before serving reads: refresh incrementally when
  // the working tree has drifted, and report the outcome to the client.
  const freshness = await context.ensureFresh();
  const hctx: HandlerContext = { ctx: context, logger };
  const handler = HANDLERS[tool.name];
  try {
    const result = await handler(hctx, args as ToolArgs);
    const enriched = enrichFreshness(result, freshness);
    context.recordMcpRequest(Math.round(performance.now() - startedAt));
    return {
      content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }],
      structuredContent: enriched as Record<string, unknown>,
    };
  } catch (error) {
    context.recordMcpRequest(Math.round(performance.now() - startedAt));
    return toErrorResult(tool.name, error, logger);
  }
}

/** Attach the freshness report to object results (leaves primitives alone). */
function enrichFreshness(result: unknown, freshness: FreshnessReport): unknown {
  if (typeof result === "object" && result !== null && !Array.isArray(result)) {
    return { ...result, freshness };
  }
  return result;
}

/** Turn a thrown error into a readable, machine-checkable error result. */
function toErrorResult(toolName: string, error: unknown, logger: Logger): CallToolResult {
  const isExpected = error instanceof ToolInputError || error instanceof ToolDomainError;
  const message = error instanceof Error ? error.message : String(error);
  if (isExpected) {
    logger.debug(`tool "${toolName}" rejected: ${message}`);
  } else {
    logger.error(`unexpected error in tool "${toolName}"`, error);
  }
  // `isError: true` + text content signal the failure. Deliberately no
  // `structuredContent` here: clients validate it against the tool's
  // `outputSchema`, and `{ ok: false, error }` does not match any tool's
  // declared success shape (observed: opencode rejected it as -32602 and
  // masked the real error).
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
