# Integrations

CodeAtlas exposes the same indexed context through several consumer surfaces.
Every consumer reads **only** through the Context SDK
(`createContextSDK`) — never the database directly.

## Model Context Protocol (MCP)

`@atlas/mcp` serves a project's context to any MCP-capable client (Claude
Desktop, Cursor, VS Code, generic agents) over stdio.

```bash
codeatlas-mcp                     # serves ./<cwd>/.codeatlas/context.db
ATLAS_ROOT=/path/to/project codeatlas-mcp
ATLAS_DB=/path/to/context.db codeatlas-mcp
```

Or run it from the CLI: `atlas mcp [--root <path>]`.

Tools (7, all deterministic reads unless noted):

| Tool | What it does |
| ---- | ------------ |
| `search_symbols` | Ranked, typo-tolerant symbol search. |
| `search_files` | Ranked file search by path or content. |
| `get_summary` | Read a stored summary (AI generation is opt-in per call). |
| `get_dependencies` | Persisted graph edges (imports, calls, extends, …). |
| `explain_module` | Files, symbols, edges, and summary for a folder/module. |
| `project_overview` | Counts, languages, and project summary. |
| `read_file_range` | Version-aware working-tree line range read with freshness metadata. |

Client configuration (Claude Desktop / generic MCP clients):

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

See [MCP.md](./MCP.md) for the full tool reference.

## VS Code extension

`@atlas/extension` surfaces indexed context in the editor: activity bar
entry, tree views, and palette commands. It is a thin SDK consumer. See
[VSCODE.md](./VSCODE.md).

## AI coding CLIs (Claude / Gemini / Codex / OpenCode)

`@atlas/agents` detects and runs external AI coding CLIs behind `AgentPort`.
Two delivery surfaces exist:

- **`atlas context launch <task> --provider <provider>`** — assembles a
  budgeted Context Package and starts a provider session seeded with it
  (`createContextIntegration`, ADR-008).
- **`atlas <agent> <prompt...>`** — standalone launch commands for each
  agent (`atlas claude`, `atlas gemini`, `atlas codex`, `atlas opencode`).
  These are thin wrappers over `atlas context launch`.

Sessions are tracked by the session manager (`atlas sessions list/info/stop`).
See [AGENT_SESSIONS.md](./AGENT_SESSIONS.md).

## Agent Toolkit (`atlas tools`)

A curated, schema-validated tool registry plus per-tool manifests,
compatibility checks, an approval-gated installer, a configurator, and a
security/trust assessor. See [AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md).

## Not yet integrated (planned)

- The standalone `/context` and `/tools` slash router (future orchestrator).
- `atlas setup` — guided environment → agent → tool recommendation.