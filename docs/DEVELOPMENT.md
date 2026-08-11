# CodeAtlas Development Guide

How to set up and run CodeAtlas locally. It complements
[DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) (the change workflow and
reporting format) — this file is about **tooling and commands**.

> All commands below are the repo's actual scripts (verified against
> `package.json` root + workspace manifests). Nothing here is invented.

---

## 1. Prerequisites

| Tool | Version | Notes |
| ---- | ------- | ----- |
| Node.js | `>=20.19.0` (root) · `>=22.5.0` for `@atlas/storage` | `node:sqlite` needs Node `>=22.5.0`; `.nvmrc` pins **22**. Use 22 for everyday work. |
| pnpm | `9.15.0` | `packageManager` field / `pnpm-workspace.yaml`. Enable via Corepack. |
| Git | any recent | optional — the repository is **not** a git repo today. |

Platforms: **Windows**, macOS, and Linux are all expected to work (development
has been exercised on Windows; the code uses no platform-specific shelling).

## 2. Install

```bash
corepack enable        # activates the pinned pnpm version
pnpm install
```

Dependencies are hoisted to the repo root (`.npmrc` `shamefully-hoist=true`) so
the single locked toolchain (TypeScript, tsup, Vitest, ESLint, Biome) is shared
by every workspace package.

## 3. Everyday commands (run from the repo root)

| Command | What it does |
| ------- | ------------ |
| `pnpm check` | **The quality gate**: typecheck + lint + format-check + test (see below) |
| `pnpm typecheck` | `tsc` for every workspace package |
| `pnpm lint` / `pnpm lint:fix` | ESLint over the monorepo (includes the `no-restricted-imports` dependency matrix) |
| `pnpm format` / `pnpm format:check` | Biome format (write) / verify |
| `pnpm test` / `pnpm test:watch` | Vitest, run / watch mode |
| `pnpm build` | `tsup` build for every workspace package |

Single-package variants (any package):

```bash
pnpm --filter @atlas/cli build
pnpm --filter @atlas/parser test
pnpm --filter @atlas/sdk typecheck
```

## 4. Running the CLI

```bash
pnpm build
node apps/cli/dist/index.js --help
node apps/cli/dist/index.js search hello --json
```

`atlas search` prints ranked hits from `<root>/.codeatlas/context.db`, using
`ATLAS_ROOT` (or the current directory) as the root. `atlas mcp` starts the MCP
server over stdio. `atlas sessions` lists/stops AI agent sessions via the SDK's
`createSessionManager()`. The remaining commands (`init`, `build`, `update`,
`explain`, `doctor`) are still "Coming Soon" placeholders — see
[CURRENT_STATE.md](./CURRENT_STATE.md).

## 5. Environment variables

| Variable | Meaning |
| -------- | ------- |
| `ATLAS_ROOT` | Project root resolved by the Context SDK, CLI, MCP, and the VS Code extension. Defaults to `cwd`. |
| `ATLAS_DB` | Absolute path to an on-disk context database, overriding `@atlas_sdk`'s `.codeatlas/context.db` default. |
| `ATLAS_MCP_LOG_LEVEL` | MCP server log level (`debug`/`info`/`warn`/`error`, default `info`). Logs go to **stderr** only. |

Provider API keys (e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, ...) come from
**user** environment/config — never from repository files, and never committed.

## 6. Debugging

- **Tests:** `pnpm test:watch` iterates fast; Vitest runs in-process with Node.
  Each package's tests live in `packages/*/tests/*.test.ts` (and
  `apps/*/tests`).
- **Type errors:** `pnpm typecheck` from the root; a failing package is
  reported with its name.
- **Node debugger:** run any built entrypoint under `node --inspect` (e.g.
  `node --inspect apps/cli/dist/index.js doctor`).
- **Build output:** `tsup` emits to each package's `dist/` (`*.js`, `*.cjs`,
  `.d.ts`). Rebuild after editing a library you consume.
- No dedicated `.vscode/launch.json` or `debug.sh` is shipped; the commands
  above are sufficient.

## 7. Where to look

| Concern | Location |
| ------- | -------- |
| Contracts / entities | `packages/core` (ports + domain), `packages/shared` |
| Directory walking, ignore rules, manifest | `packages/scanner` |
| Hashing / change detection | `packages/hashing` |
| Parsing / symbols | `packages/parser` |
| Dependency graph | `packages/graph` |
| SQLite context database | `packages/storage` |
| Search | `packages/search` |
| AI summaries | `packages/summary` |
| Providers | `packages/providers` |
| Composition root + Context SDK | `packages/sdk` (incl. `src/context`) |
| MCP server | `packages/mcp` |
| CLI | `apps/cli` |
| VS Code extension | `apps/extension` |

See [MODULES.md](./MODULES.md) for ownership and [DEPENDENCIES.md](./DEPENDENCIES.md)
for import rules.