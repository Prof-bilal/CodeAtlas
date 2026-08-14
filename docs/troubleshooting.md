# Troubleshooting

Common problems and their fixes. If something is not covered here, check
[CURRENT_STATE.md](./CURRENT_STATE.md) (ground truth of what exists) and
[FEATURE_STATUS.md](./FEATURE_STATUS.md), then open an issue.

## "No context index found at <path>"

`atlas search` (and the MCP tools) exit with this error when
`<root>/.codeatlas/context.db` does not exist.

Fix:

```bash
atlas init --repo /path/to/your-project
```

The MCP server also starts *before* an index exists and picks it up lazily the
moment `context.db` appears — no restart needed.

## SQLite / `node:sqlite` errors

`@atlas/storage` requires **Node `>=22.5.0`**. Symptoms: `ERR_UNKNOWN_FILE_EXTENSION`
or a `node:sqlite` module-not-found at runtime.

Fix: switch to Node 22 (`nvm use 22` / match `.nvmrc`) and re-run
`pnpm install && pnpm build`.

## Index is stale (search results don't match the working tree)

Search reads the persisted index; edits since the last run are not reflected.

Fix:

```bash
atlas update --repo /path/to/your-project
```

`update` is incremental — it re-parses only changed/added files. You can also
detect staleness programmatically: `createContextSDK(...).freshness()` returns
`fresh` / `stale` / `unknown` / `unavailable` with the changed file list
(see [CONTEXT_SDK.md](./CONTEXT_SDK.md)).

## A file changed, but my tool still returned old content

Version-aware reads protect you: `files.readRange(path, { expectedHash })` and
the MCP `read_file_range` tool return `versionMatch: false` plus the *current*
on-disk content when the file drifted. If you don't pass `expectedHash`, compare
the returned `hash` yourself, or refresh the index with `atlas update`.

## Tests fail or a package won't build after a change

- Rebuild libraries you consume: `pnpm build` (tsup emits to each `dist/`).
- Run the quality gate: `pnpm check`.
- Run targeted tests from the repo root (Vitest is configured at the root):
  `npx vitest run packages/<pkg> apps/cli`.

## `atlas tools install` refuses a tool

By design. The installer runs compatibility and security gates **before**
anything is installed and never fails open:

- `incompatible` ⇒ not installable in this environment (never guessed),
- `blocked` ⇒ refused by the security assessor,
- everything requires explicit `--yes` approval.

See [AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md) §6–§8.

## `atlas context` / `atlas explain` prints nothing useful

`atlas explain` needs an index: it resolves a symbol/file/module/concept
deterministically, so a missing `.codeatlas/context.db` exits `1` with "No
context index found". Rebuild the index with `atlas init --repo ...` if the
package looks empty. `atlas doctor` runs a health checklist (exit `1` on any
FAIL) — run it to diagnose the installation before deeper debugging.

## AI summaries never generate

Summaries are AI-optional. Without a configured provider, every generation call
fails cleanly (a `fail` `Result`) — reads still work. Configure a provider key
in your **user environment** (never in the repo) to enable generation.

## MCP logs are noisy / silent

Logs go to **stderr** (stdout is reserved for the protocol). Control verbosity
with `ATLAS_MCP_LOG_LEVEL=debug|info|warn|error`.

## The parser misses a cross-file reference

Known, documented gaps (TypeScript parser, [PARTIAL]): renamed imports
(`import { a as b }`) and `export default <expr>` do not resolve cross-file.
Namespaces and bare expressions are not extracted. See
[CONTEXT.md](./CONTEXT.md) §2 and [FEATURE_STATUS.md](./FEATURE_STATUS.md).

## `pnpm --filter <name>` says "No projects matched"

Per-package filters use the package `name` field. Examples: `codeatlas-cli`
(apps/cli), `@atlas/sdk`, `@atlas/mcp`, `@atlas/parser`, `@atlas/storage`.