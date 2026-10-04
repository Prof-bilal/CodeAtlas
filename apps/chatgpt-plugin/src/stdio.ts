import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type ChatGptServer, type ChatGptServerOptions, createChatGptServer } from "./server";

/**
 * Start the plugin server over **stdio** — the transport used by Codex CLI and
 * other local MCP clients. stdout is reserved for the protocol; all logs go to
 * stderr.
 */
export async function startStdioServer(options: ChatGptServerOptions = {}): Promise<ChatGptServer> {
  const plugin = createChatGptServer(options);
  const transport = new StdioServerTransport();
  await plugin.connect(transport);
  plugin.logger.info(
    `CodeAtlas ChatGPT plugin ready over stdio (context database: ${plugin.context.dbPath})`,
  );

  let shuttingDown = false;
  const shutdown = (reason: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    plugin.logger.info(`received ${reason}; shutting down`);
    plugin
      .close()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.stdin.once("end", () => shutdown("stdin end"));
  process.stdin.once("close", () => shutdown("stdin close"));
  return plugin;
}
