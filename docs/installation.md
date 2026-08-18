# Installation

CodeAtlas is published on npm as **`codeatlas-cli`**. Install the end-user CLI
globally, or build it from source for development.

## Requirements

| Tool | Version | Notes |
| ---- | ------- | ----- |
| Node.js | `>=22.5.0` | The storage layer uses the built-in `node:sqlite`. All packages share this engine floor; the `.nvmrc` pins **22**. |
| pnpm | `9.15.0` | Pinned in `package.json`; enable via Corepack (`corepack enable`). Only needed to build from source. |

Platforms: Windows, macOS, and Linux (development is exercised on Windows; the
code uses no platform-specific shelling).

## Option A — published global CLI (recommended for end users)

```bash
npm install --global codeatlas-cli
atlas --version
```

This installs a self-contained `atlas` binary (the bundled CLI reports its own
published version, e.g. `0.3.0-beta.0`). No `@atlas/*` workspace packages are
needed or installed.

## Option B — from source (recommended for development)

```bash
git clone <codeatlas-repository-url> CodeAtlas
cd CodeAtlas
corepack enable
pnpm install
pnpm --filter codeatlas-cli build
```

Dependencies are hoisted to the repo root (`.npmrc` `shamefully-hoist=true`) so
a single locked toolchain (TypeScript, tsup, Vitest, ESLint, Biome) is shared by
every workspace package.

Run the CLI from the repo:

```bash
node apps/cli/dist/index.js --help
```

## Verify the installation

```bash
atlas --version    # published CLI reports its own version (e.g. 0.3.0-beta.0)
pnpm check         # typecheck + lint + format-check + test (from a source checkout)
```

Then index a real repository:

```bash
atlas init --repo /absolute/path/to/your-project
atlas search authentication --repo /absolute/path/to/your-project
```

## Upgrade

```bash
npm update --global codeatlas-cli
atlas --version
```

To upgrade from a source checkout, pull the latest and rebuild:

```bash
cd CodeAtlas
git pull
pnpm install
pnpm --filter codeatlas-cli build
```

## Uninstall

```bash
npm uninstall --global codeatlas-cli
```

To remove index data from a repository, delete the `.codeatlas/` directory:

```bash
rm -rf <repo>/.codeatlas/
```

## What the CLI writes

CodeAtlas never modifies the target repository except for a gitignored
`.codeatlas/` directory, which contains:

- `manifest.json` — project metadata + context versioning,
- `context.db` — the SQLite context database,
- `usage.db` — AI usage & credits (ADR-009),
- `tools/` — per-tool Agent Toolkit manifests,
- `skills/` — installed skill directories (git-cloned from their canonical repos).

See [CONTEXT_STORAGE.md](./CONTEXT_STORAGE.md) for the on-disk layout and
[PUBLISHING.md](./PUBLISHING.md) for the maintainer release process.