# codeatlas-cli

The end-user **command-line interface** for CodeAtlas, built with
[Commander.js](https://github.com/tj/commander.js).

This is a thin, dumb layer: it parses arguments and delegates to the
[`@atlas/sdk`](../../packages/sdk) — it contains no business logic.

## Install

Requires Node.js `>=22.5.0` (the storage layer uses the built-in `node:sqlite`).

```bash
npm install --global codeatlas-cli
atlas --version
```

## Quick start (smoke test)

Index a real repository, then query it — no AI provider or account needed:

```bash
# 1. Index the repository (writes .codeatlas/context.db + manifest.json)
atlas init --repo /absolute/path/to/your-project

# 2. Confirm the index was built
atlas update --repo /absolute/path/to/your-project

# 3. Search symbols, files, modules, dependencies, summaries.
#    atlas search reads the index for the current directory / ATLAS_ROOT,
#    so run it from the indexed project (or set ATLAS_ROOT).
cd /absolute/path/to/your-project
atlas search AuthService
atlas search "rate limiter"

# 4. Machine-readable output for scripting
atlas search AuthService --json
```

`atlas init` (build) and `atlas update` (incremental) both accept `--repo` (or
use `ATLAS_ROOT`/cwd). `atlas search` reads the index for the current directory
or `ATLAS_ROOT` (it does not take `--repo`). The target repository is never
modified except for its gitignored `.codeatlas/` directory.

## Commands

```text
atlas search <query...>  → wired — ranked search over .codeatlas/context.db
                           (via @atlas/sdk createContextSDK)
atlas mcp                → wired — starts the MCP server over stdio (@atlas/mcp)
atlas sessions           → wired — lists/inspects/stops AI agent sessions
atlas usage              → wired — reports usage, budgets, and limits
atlas tools              → wired — overview/search/info/install/remove/update/configure/doctor
atlas context <task>     → wired — builds/launches a safe context package
atlas init               → wired — initialize and index a repository
atlas build              → wired — build an index
atlas update             → wired — refresh an index and report changes
atlas explain [target]   → "Coming Soon"
atlas doctor             → "Coming Soon"
```

`atlas search`, `atlas sessions`, `atlas usage`, and the MCP tools read indexed
context through the **Context SDK** (`createContextSDK`, in `@atlas/sdk`) — they
never touch the database directly. See [`docs/CLI.md`](../../docs/CLI.md) for the
full command contract and [`docs/CURRENT_STATE.md`](../../docs/CURRENT_STATE.md)
for what is wired vs. stubbed.

## Connect to an AI agent (MCP)

`atlas mcp` starts a **Model Context Protocol** server over stdio. Any
MCP-capable AI coding tool — Claude Desktop, Claude Code, Cursor, VS Code, … —
can connect to it and query your indexed context with its built-in tools
(`search_symbols`, `search_files`, `get_dependencies`, `explain_module`,
`project_overview`, `get_summary`).

```bash
# Serve the index for the current directory (or --root / ATLAS_ROOT)
atlas mcp
```

Client configuration example (Claude Desktop / generic MCP clients):

```json
{
  "mcpServers": {
    "codeatlas": {
      "command": "atlas",
      "args": ["mcp"],
      "env": { "ATLAS_ROOT": "/absolute/path/to/your-project" }
    }
  }
}
```

The server starts even when no index exists yet; tools return a clear
`No context index found at <path>` error until you run `atlas init`. Because the
index is opened lazily, a server started *before* indexing picks it up the
moment `context.db` appears. See [`docs/MCP.md`](../../docs/MCP.md) for the full
tool reference and `--root`/`ATLAS_DB` resolution order.

### Seeding an AI CLI session with context

`atlas context` builds a **safe, budgeted, deny-filtered Context Package** for a
task, and `atlas context launch` seeds a live AI CLI session with it:

```bash
# Inspect the package a task would receive
atlas context "fix the authentication tests" --repo /absolute/path/to/your-project --explain

# Launch a session with that context (provider: claude | gemini | codex | opencode)
atlas context launch "fix the authentication tests" --provider claude --repo /absolute/path/to/your-project

# Manage the live session
atlas sessions list
atlas sessions info <id>
atlas sessions stop <id>
```

Provider calls are explicit and user-configured; only the assembled, budgeted
context is sent. See [`docs/CONTEXT.md`](../../docs/CONTEXT.md) and
[`docs/AGENT_SESSIONS.md`](../../docs/AGENT_SESSIONS.md).

## Development

```bash
pnpm --filter codeatlas-cli build
node apps/cli/dist/index.js --help
```

### Testing

The CLI ships a behavior test suite that covers the command list, `--version`,
`--help`, the placeholder commands, and an end-to-end `atlas search` against a
fixture `.codeatlas/context.db` (including the missing-index error and
`process.exitCode = 1`).

```bash
pnpm vitest run apps/cli/tests    # run the CLI tests only (from the repo root)
pnpm test                         # full monorepo suite
pnpm check                        # typecheck + lint + format + test (CI gate)
```

See [`docs/TESTING.md`](../../docs/TESTING.md) for the full testing policy.