#!/usr/bin/env node
import { startStdioServer } from "./server";

// The MCP stdio transport owns stdout and keeps a stdin listener, so the
// process stays alive once connected. startStdioServer installs SIGINT/SIGTERM
// handlers that close the server and release the context database.
startStdioServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[atlas-mcp] failed to start: ${message}\n`);
  process.exit(1);
});
