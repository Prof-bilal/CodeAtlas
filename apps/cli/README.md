# @atlas/cli

The end-user **command-line interface** for CodeAtlas, built with
[Commander.js](https://github.com/tj/commander.js).

This is a thin, dumb layer: it parses arguments and delegates to the
[`@atlas/sdk`](../../packages/sdk) — it contains no business logic.

## Commands

```text
atlas search <query...>  → wired — ranked search over .codeatlas/context.db
                           (via @atlas/sdk createContextSDK)
atlas mcp                → wired — starts the MCP server over stdio (@atlas/mcp)
atlas sessions           → wired — lists/inspects/stops agent sessions
atlas usage              → wired — reports usage, budgets, and limits
atlas tools              → wired — overview/search/info/install/remove/update/configure/doctor
atlas context <task>     → wired — builds/launches a safe context package
atlas init               → "Coming Soon"
atlas build              → "Coming Soon"
atlas update             → "Coming Soon"
atlas explain [target]   → "Coming Soon"
atlas doctor             → "Coming Soon"
```

`atlas search` reads `<root>/.codeatlas/context.db` (root from `ATLAS_ROOT` or
the current directory). See [`docs/CLI.md`](../../docs/CLI.md) for the full
command contract and [`docs/CURRENT_STATE.md`](../../docs/CURRENT_STATE.md) for
what is wired vs. stubbed.

## Development

```bash
pnpm --filter @atlas/cli build
node apps/cli/dist/index.js --help
```
