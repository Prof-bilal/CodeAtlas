import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CodeAtlasContext,
  type CodeAtlasContextOptions,
  type LogLevel,
  type Logger,
  type ToolCallBudget,
  createLogger,
  createToolCallBudget,
  runTool,
} from "@prof-bilal/atlas-mcp";
import { VERSION } from "@prof-bilal/atlas-sdk";
import { ADAPTER_HANDLERS } from "./handlers";
import { CHATGPT_TOOLS } from "./tools";
import { registerUiResources } from "./ui-resources";

/** Options for creating or starting the CodeAtlas ChatGPT/Codex plugin server. */
export interface ChatGptServerOptions extends CodeAtlasContextOptions {
  /** Inject a logger; defaults to stderr logging at `ATLAS_MCP_LOG_LEVEL`. */
  readonly logger?: Logger;
  /** Minimum log level when no logger is injected. */
  readonly logLevel?: LogLevel;
  /** MCP server name advertised in the handshake (default `"codeatlas"`). */
  readonly serverName?: string;
  /** Serve MCP Apps widgets as resources (default `true`). */
  readonly includeUi?: boolean;
}

/** A running plugin server and its lifecycle handles. */
export interface ChatGptServer {
  /** The underlying MCP server (5 focused tools + optional UI resources). */
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

/**
 * Create the CodeAtlas ChatGPT/Codex plugin server.
 *
 * The server exposes **five focused, goal-oriented tools** (analyze / search /
 * explain / impact / get_context) plus MCP Apps widgets, and reuses
 * `@prof-bilal/atlas-mcp`'s handlers, validation, budget, freshness, and result
 * discipline via {@link runTool}. It deliberately does **not** expose the raw
 * eleven-tool CodeAtlas surface, keeping the assistant's tool routing small.
 */
export function createChatGptServer(options: ChatGptServerOptions = {}): ChatGptServer {
  const logger =
    options.logger ??
    createLogger(options.logLevel === undefined ? {} : { level: options.logLevel });
  const context = new CodeAtlasContext(options);
  const budget: ToolCallBudget = createToolCallBudget();

  const server = new McpServer({
    name: options.serverName ?? "codeatlas",
    version: VERSION,
  });

  for (const tool of CHATGPT_TOOLS) {
    const meta =
      tool.ui === undefined
        ? undefined
        : {
            // MCP Apps extension binding (standard-first).
            ui: { resourceUri: tool.ui.resourceUri },
            // ChatGPT Apps SDK compatibility key for the same widget.
            "openai/outputTemplate": tool.ui.resourceUri,
          };
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        ...(meta === undefined ? {} : { _meta: meta }),
      },
      (args, _extra) => runTool(tool, ADAPTER_HANDLERS[tool.name], context, logger, budget, args),
    );
  }

  if (options.includeUi !== false) {
    registerUiResources(server);
  }

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
