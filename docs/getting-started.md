# Getting Started

A 10-minute tour of CodeAtlas against a real repository. It assumes you have
installed the CLI (see [installation.md](./installation.md)).

## 1. Index a project

```bash
atlas init --repo /absolute/path/to/your-project
```

This scans the tree, hashes every file, parses the TypeScript files, builds the
dependency graph, and persists everything to
`<your-project>/.codeatlas/context.db`. It reports files, symbols,
dependencies, and the manifest path. Add `--json` for machine-readable output.

## 2. Inspect the tree before (or without) indexing

```bash
atlas scan --repo /absolute/path/to/your-project
```

`atlas scan` is metadata only — no parsing, no database. It shows the
hierarchical file tree, file/folder totals, detected languages, and framework.

## 3. Search the index

```bash
atlas search authentication --repo /absolute/path/to/your-project
atlas search login --type symbol -l 5 --repo /absolute/path/to/your-project
```

Search is ranked and typo-tolerant, across files, symbols, modules,
dependencies, and summaries. Restrict with `-t <kind>` (repeatable), cap with
`-l <n>`, disable fuzzing with `--no-fuzzy`.

## 4. Get context for an AI task

```bash
atlas context "fix the authentication tests" --repo /absolute/path/to/your-project
atlas context "fix the authentication tests" --explain --repo /absolute/path/to/your-project
```

`atlas context` assembles a **budgeted, deny-filtered Context Package** from the
index — the deterministic answer to *"what does an LLM need to work on this?"*.
`--explain` shows *why* each item was chosen without dumping content.

## 5. Keep the index fresh

```bash
atlas update --repo /absolute/path/to/your-project
```

`atlas update` is **incremental**: it re-reads and re-parses only files whose
hashes changed (or that are new), reuses the persisted snapshot for unchanged
files, drops deleted files, and merges the result. A no-op run reports
`+0 ~0 -0`.

The Context SDK can also report freshness directly
(`createContextSDK(...).freshness()` → `fresh` / `stale` / `unknown` /
`unavailable`) — see [CONTEXT_SDK.md](./CONTEXT_SDK.md).

## 6. Try the interactive UI

```bash
atlas tui
# or, from a TTY, just:
atlas
```

The TUI adds slash commands: `/scan`, `/search`, `/context`, `/agents`,
`/toolkit`, `/tools-install`, `/claude`, `/gemini`, `/codex`, `/opencode`,
`/cursor`, `/grok`, `/status`, `/help`, `/exit`.

## 7. Use it from an AI tool

Start the MCP server and point Claude Desktop / Cursor / VS Code at it — see
[integrations.md](./integrations.md).

---

## Next steps

- Use CodeAtlas with an AI provider: [AI_WORKFLOW.md](./AI_WORKFLOW.md)
- Understand the model: [CONTEXT.md](./CONTEXT.md)
- Read context programmatically: [CONTEXT_SDK.md](./CONTEXT_SDK.md)
- Explore the CLI surface: [CLI.md](./CLI.md)
- Configure roots and databases: [configuration.md](./configuration.md)
- Hit a snag? [troubleshooting.md](./troubleshooting.md)