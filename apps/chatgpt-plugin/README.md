# @prof-bilal/atlas-chatgpt-plugin

A small **ChatGPT / Codex plugin** that exposes CodeAtlas repository
intelligence over the Model Context Protocol (MCP). It is a thin adapter: it
reuses `@prof-bilal/atlas-mcp`'s handlers, validation, budget, freshness, and
result discipline, and re-reads nothing itself — every answer comes from the
CodeAtlas index through `createContextSDK`.

> Understand your codebase before you change it.

## Tools

Five focused, goal-oriented tools (the raw eleven-tool CodeAtlas surface is
deliberately **not** exposed, to keep assistant tool-routing small):

| Tool | Answers | Backed by |
| --- | --- | --- |
| `analyze_repository` | "Analyze this repo", structure, counts, areas, findings | MCP `project_overview` |
| `search_repository` | "Where is X implemented?", relevant files/symbols | MCP `search_symbols` + `search_files` |
| `explain_repository` | "How does X work?", architecture + relationships | MCP `find_relevant_context` + graph reads |
| `impact_analysis` | "What breaks if I change X?" | MCP `analyze_impact` + graph reads |
| `get_context` | "Show me the code for X" | MCP `inspect_symbol` / `read_file_range` |

Each tool declares zod input/output schemas and returns `structuredContent`.
Repository summary, search, explanation, impact, and code-context results also
bind to optional MCP Apps widgets — the tools are fully useful without UI.

## Run it

Build once, and index the project you want to serve:

```bash
pnpm --filter @prof-bilal/atlas-chatgpt-plugin build
atlas init          # or: atlas build   (from codeatlas-cli)
```

### Codex CLI / local MCP clients (stdio)

```bash
codeatlas-chatgpt-mcp --root /path/to/your/project
```

Codex `~/.codex/config.toml`:

```toml
[mcp_servers.codeatlas]
command = "codeatlas-chatgpt-mcp"
args = ["--root", "/path/to/your/project"]
```

### ChatGPT (Streamable HTTP)

ChatGPT connectors need a reachable HTTPS URL, so run the server over HTTP and
tunnel it during local development:

```bash
# 1. Start the HTTP server (loopback by default)
codeatlas-chatgpt-mcp --http --port 8787 --root /path/to/your/project

# 2. Expose it (any tunnel works; example uses cloudflared)
cloudflared tunnel --url http://127.0.0.1:8787
```

Then add `https://<tunnel-host>/mcp` as a connector in ChatGPT (developer mode).
For anything other than loopback, require a token:

```bash
codeatlas-chatgpt-mcp --http --host 0.0.0.0 --port 8787 --token "$SECRET" --root /path/to/your/project
```

Health check: `GET /healthz`.

## Programmatic use

```ts
import { createChatGptServer, startStdioServer, startHttpServer } from "@prof-bilal/atlas-chatgpt-plugin";

const plugin = createChatGptServer({ root: "/path/to/project" });
await plugin.connect(someTransport);
```

## Packaging & submission

Static metadata for directory/app submission lives in `plugin/`:

- `plugin/manifest.json` — name, descriptions, developer, logo, categories,
  tool list, and MCP server config.
- `plugin/mcp.json` and `plugin/codex.toml.example` — ready-to-paste client config.
- `plugin/icons/logo.svg`, `plugin/icons/logo-dark.svg` — branding.
- `plugin/PRIVACY.md` — privacy policy.

See `docs/reference/CHATGPT.md` in the repository root for the manual
OpenAI-dashboard steps (the dashboard does not read these files automatically).

## Security

- Loopback by default; a bearer token is required for non-loopback binds.
- Read-only; no arbitrary filesystem access; the CodeAtlas secret deny-list is
  enforced on every read.
- No secrets are logged.

## Limitations

- Runs only against a **local** CodeAtlas index (`.codeatlas/context.db`); there
  is no CodeAtlas cloud backend in this release.
- Parser coverage is TypeScript/JavaScript; other languages are indexed as
  content only.
- Widgets require a host that implements the Apps SDK; without it, tool output
  is still complete.
