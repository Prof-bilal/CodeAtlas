# Installation

CodeAtlas is a **pnpm + TypeScript monorepo**. Install it either from source or
(as published) as a global npm package.

## Requirements

| Tool | Version | Notes |
| ---- | ------- | ----- |
| Node.js | `>=22.5.0` | The storage layer uses the built-in `node:sqlite`. Other packages target `>=20.19.0`; the `.nvmrc` pins **22**. |
| pnpm | `9.15.0` | Pinned in `package.json`; enable via Corepack (`corepack enable`). |

Platforms: Windows, macOS, and Linux (development is exercised on Windows; the
code uses no platform-specific shelling).

## Option A — from source (recommended for development)

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

## Option B — global CLI (after publish)

```bash
npm install --global codeatlas-cli
atlas --help
```

## Verify the installation

```bash
pnpm check        # typecheck + lint + format-check + test (the quality gate)
pnpm build        # build every workspace package
```

Then index a real repository:

```bash
atlas init --repo /absolute/path/to/your-project
atlas search authentication --repo /absolute/path/to/your-project
```

## What the CLI writes

CodeAtlas never modifies the target repository except for a gitignored
`.codeatlas/` directory, which contains:

- `manifest.json` — project metadata + context versioning,
- `context.db` — the SQLite context database,
- `usage.db` — AI usage & credits (ADR-009),
- `tools/` — per-tool Agent Toolkit manifests.

See [CONTEXT_STORAGE.md](./CONTEXT_STORAGE.md) for the on-disk layout and
[PUBLISHING.md](./PUBLISHING.md) for the maintainer release process.