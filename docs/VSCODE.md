# VS Code Extension (`@atlas/extension`)

The first editor integration. It reads repository context **only through the
Context SDK** (`createContextSDK`) — it never opens the database or runs SQL
directly. It shells out to the `atlas` CLI for `build`/`update` (the indexing
pipeline is not yet an SDK method).

## What it provides

- **Activity Bar** (`codeatlas` container) with five **Tree Views**:
  - `codeatlas.project` — project overview: counts, languages, saved-at, schema.
  - `codeatlas.symbols` — symbols grouped by kind, expanding to closable rows
    that open the file at the symbol's line.
  - `codeatlas.modules` — indexed modules, expanding to their files.
  - `codeatlas.summaries` — stored file/module/project summaries.
  - `codeatlas.dependencies` — the persisted dependency graph grouped by source.
- **Command Palette** commands (all prefixed `codeatlas.`): open overview,
  search symbols, search files, show modules/summaries/dependencies, run
  `atlas build`, run `atlas update`, refresh.
- **Status Bar** item showing index availability and counts (`CodeAtlas: N files ·
  M symbols`), with a command attached.

When a workspace has no `.codeatlas/context.db` yet, the trees show a friendly
empty state and the status bar points at `Run atlas build`.

> **Interactive agent launching** lives in the **TUI** (`atlas tui`), not the
> VS Code extension. The extension is a read-only context viewer.

## How it talks to CodeAtlas

| Concern                    | Mechanism                                             |
| -------------------------- | ----------------------------------------------------- |
| Reading context            | `ContextClient` (`src/client.ts`) wraps `createContextSDK` |
| `atlas build` / `atlas update` | shell-out to the built CLI (`src/atlas-cli.ts`)       |
| VS Code surface            | an injectable `VscodeApi` façade (`src/vscode-host.ts`) |

The extension is structured so everything except `src/extension.ts` runs
headless: tree building is pure functions (`src/ui/nodes.ts`), the tree walk
maps `contextValue` to SDK reads (`src/providers.ts`), commands are plain
handlers (`src/commands.ts`), and wiring lives in `src/extension-core.ts`. The
only file that imports the real `vscode` module is `src/extension.ts`, which
bridges it to the facade.

## Testing

The extension is tested headlessly (`vitest`, no GUI VS Code host):

- `tests/nodes.test.ts` — pure tree-node builders.
- `tests/client.test.ts` — `ContextClient` against a real temp
  `.codeatlas/context.db` fixture.
- `tests/providers.test.ts` — tree children derivation per view.
- `tests/commands.test.ts` — registered commands driven through a fake host.
- `tests/extension-core.test.ts` — activate/refresh lifecycle, incl. becoming
  ready once a build writes an index.
- `tests/atlas-cli.test.ts` — CLI resolution and a real `--version` spawn.

## Workspace-capable

The default project root is the first workspace folder (`ATLAS_ROOT` env or
`cwd` as fallback), matching the CLI/SDK convention.

## Dev

```sh
pnpm --filter @atlas/extension build    # bundle to dist/extension.js
```

The manifest (`apps/extension/package.json`) declares activation, views,
commands, and the activity-bar container. `vscode` is external (supplied by the
extension host); the rest is bundled by `tsup`.

> **Note:** `atlas build`/`update` run the SDK-owned incremental indexer, so the
> extension's build flow works end-to-end (`.codeatlas/context.db` is written,
> then read through `createContextSDK`).