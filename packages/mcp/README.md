# @atlas/mcp

A **Model Context Protocol (MCP)** server that exposes a project's CodeAtlas
context to external AI tools (Claude Desktop, Cursor, VS Code, and any other
MCP client) over stdio.

It consumes only `@atlas/sdk` (per the [dependency rules](../../docs/DEPENDENCIES.md))
and is **provider-independent**: search, dependencies, module explanation, and
project overview are deterministic reads of the persisted `.codeatlas/context.db`;
AI summary generation is opt-in per call and goes through whatever provider is
wired into the SDK.

## Tools

| Tool | Purpose |
| --- | --- |
| `search_symbols` | Ranked, fuzzy search over indexed symbols |
| `search_files` | Ranked, fuzzy search over indexed files (path + content) |
| `get_summary` | Read a stored file/folder/module/project summary (or generate one) |
| `get_dependencies` | Dependency edges from the graph (by node / relation / direction) |
| `explain_module` | What a folder/package contains: files, symbols, dependencies, summary |
| `project_overview` | Project counts, language breakdown, and stored project summary |

Full documentation for every tool (inputs, outputs, examples) lives in
[`docs/MCP.md`](../../docs/MCP.md).

## Running

The package ships a `codeatlas-mcp` binary:

```bash
codeatlas-mcp
```

It serves the index found at `<root>/.codeatlas/context.db`, where `<root>` is
resolved in this order:

1. the `ATLAS_DB` env var → the database file directly.
2. the `ATLAS_ROOT` env var → `<root>/.codeatlas/context.db`.
3. the current working directory → `./.codeatlas/context.db`.

Example client config (Claude Desktop / generic MCP client):

```json
{
  "mcpServers": {
    "codeatlas": {
      "command": "codeatlas-mcp",
      "env": { "ATLAS_ROOT": "/path/to/your/project" }
    }
  }
}
```

Logs go to **stderr** only (stdout is the MCP protocol channel). Set
`ATLAS_MCP_LOG_LEVEL` to `debug` for verbose output.

## Programmatic use

```ts
import { createMcpServer, startStdioServer } from "@atlas/mcp";

// Create a server bound to a project root, then attach any transport:
const mcp = createMcpServer({ root: "/path/to/project" });
await mcp.connect(someTransport);

// Or start the stdio server directly:
await startStdioServer({ root: "/path/to/project" });
```

## Status

Implemented as part of the MCP task (see [`docs/CURRENT_STATE.md`](../../docs/CURRENT_STATE.md)).
