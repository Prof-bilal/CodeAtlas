#!/usr/bin/env node
import { parseArgs } from "node:util";
import { DEFAULT_HTTP_PORT, startHttpServer } from "./http";
import type { ChatGptServerOptions } from "./server";
import { startStdioServer } from "./stdio";

const HELP = `codeatlas-chatgpt-mcp — CodeAtlas repository intelligence for ChatGPT / Codex

USAGE
  codeatlas-chatgpt-mcp [options]            # stdio (Codex, local MCP clients)
  codeatlas-chatgpt-mcp --http [options]     # Streamable HTTP (ChatGPT connector)

OPTIONS
  --http                 Serve over Streamable HTTP at /mcp instead of stdio.
  --host <host>          HTTP bind interface (default 127.0.0.1).
  --port <port>          HTTP port (default ${DEFAULT_HTTP_PORT}).
  --token <token>        Require this bearer token on /mcp (or ATLAS_CHATGPT_TOKEN).
  --root <path>          Project root to serve (default ATLAS_ROOT or cwd).
  --no-ui                Do not serve MCP Apps widgets.
  --no-autorefresh       Do not auto-refresh the index before reads.
  -h, --help             Show this help.

EXAMPLES
  codeatlas-chatgpt-mcp --root /path/to/repo
  codeatlas-chatgpt-mcp --http --port 8787 --root /path/to/repo
  codeatlas-chatgpt-mcp --http --host 0.0.0.0 --token $SECRET --root /path/to/repo
`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      http: { type: "boolean", default: false },
      host: { type: "string" },
      port: { type: "string" },
      token: { type: "string" },
      root: { type: "string" },
      "no-ui": { type: "boolean", default: false },
      "no-autorefresh": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write(HELP);
    return;
  }

  const base: ChatGptServerOptions = {
    ...(values.root !== undefined ? { root: values.root } : {}),
    ...(values["no-ui"] ? { includeUi: false } : {}),
    ...(values["no-autorefresh"] ? { autoRefresh: false } : {}),
  };

  if (!values.http) {
    await startStdioServer(base);
    return;
  }

  let port = DEFAULT_HTTP_PORT;
  if (values.port !== undefined) {
    const parsed = Number.parseInt(values.port, 10);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
      throw new Error(`Invalid --port "${values.port}".`);
    }
    port = parsed;
  }

  await startHttpServer({
    ...base,
    port,
    ...(values.host !== undefined ? { host: values.host } : {}),
    ...(values.token !== undefined ? { token: values.token } : {}),
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[atlas-chatgpt] failed to start: ${message}\n`);
  process.exit(1);
});
