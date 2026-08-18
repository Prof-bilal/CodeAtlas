# CodeAtlas

> An open-source **AI Context Engine** that helps AI tools and agents understand
> any codebase — accurately and efficiently.

CodeAtlas scans, parses, and indexes a source tree into a queryable, persistent
context database, exposes that context to developer tools and AI agents over a
stable SDK (CLI, MCP, VS Code), and can later route work to installed AI coding
CLIs and curated open-source tools.

```text
Repository → scan → hash → parse → graph → context.db → Context SDK → CLI · MCP · VS Code · agents
```

## Why CodeAtlas

LLMs work best with *relevant, fresh context*, not whole repositories:

- **Bounded.** A budgeted, deny-filtered `ContextPackage` is assembled per task,
  never a wholesale upload.
- **Fresh.** The index is incremental and version-aware — agents get a
  `versionMatch`/`stale` signal and always read the current working tree.
- **Local-first.** Everything runs locally against `<repo>/.codeatlas/`; no
  implicit network calls, no whole-repo uploads (see
  [PRIVACY.md](docs/PRIVACY.md)).
- **Deterministic before AI.** Facts (symbols, graph, search) are computed
  statically; AI only *adds* summaries and explanations.

## Features

- **Context engine** — scanner, SHA-256 hashing/change detection, TypeScript
  parser, dependency graph, AI-optional summaries, SQLite storage, ranked
  fuzzy-aware search.
- **Context SDK** (`@atlas/sdk`) — the single read/write façade
  (`createContextSDK`) every consumer uses: files, symbols, dependencies,
  modules, summaries, search, project stats, and freshness.
- **Freshness & version-aware reads** — `freshness()` reports
  `fresh`/`stale`/`unknown`/`unavailable`; `files.readRange(path, { expectedHash })`
  reads the working tree and flags when context is out of date.
- **Incremental indexing** — `atlas update` re-parses only changed/added files,
  reuses persisted snapshots, and deletes removed entries.
- **MCP server** (`@atlas/mcp`) — 7 read-only tools over stdio for Claude
  Desktop, Cursor, VS Code, and any MCP client.
- **VS Code extension** (`@atlas/extension`) — activity bar, tree views, and
  palette commands.
- **Agent infrastructure** — AI CLI connection layer (`@atlas/agents`),
  agent sessions (`atlas sessions`), usage & credits (`atlas usage`), and
  Context → Agent integration (`createContextIntegration`).
- **Agent Toolkit** (`atlas tools`) — curated tool registry, per-tool
  manifests, compatibility engine, approval-gated installer, configurator, and
  a security/trust assessor.

## Status

**[IMPLEMENTED]** Core pipeline (scanner, hashing, manifest, parser, graph,
storage, search, summaries, cache, providers), Context SDK, MCP (7 tools),
VS Code extension, agent connection layer + session manager, usage tracking,
context integration, and the full Agent Toolkit (56-tool catalog with tier
system, skill adapter, compatibility engine, approval-gated installer,
configurator, security/trust assessor, category browsing, config-cleanup on
remove, live doctor, conflict detection).

**[PARTIAL]** Parser handles TypeScript only (renamed imports and
`export default <expr>` do not resolve cross-file).

**[PLANNED]** The `/tools` and `/context` slash surfaces, `atlas setup`, the
standalone agent router, and the Agent Orchestrator.

Ground truth: [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) and
[docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md).

## Installation

Requirements: **Node.js `>=22.5.0`** (the storage layer uses the built-in
`node:sqlite`; all packages share the same engine floor). The quickest path is
the
published global CLI:

```bash
npm install --global codeatlas-cli
atlas --version
```

or build from source (see [docs/installation.md](docs/installation.md) for
both):

```bash
corepack enable
pnpm install
pnpm --filter codeatlas-cli build
```

## Quick start

```bash
# Index a repository you want to understand.
atlas init --repo /absolute/path/to/your-project

# See what was scanned (metadata only, no indexing).
atlas scan --repo /absolute/path/to/your-project

# Search the generated context database.
atlas search authentication --repo /absolute/path/to/your-project

# Get safe, budgeted context for an AI task.
atlas context "fix the authentication tests" --repo /absolute/path/to/your-project

# Check whether the index is up to date with the working tree.
atlas update --repo /absolute/path/to/your-project
```

Running from a source checkout uses the same `atlas` binary:

```bash
node apps/cli/dist/index.js init --repo /absolute/path/to/your-project
```

Full walkthrough: [docs/getting-started.md](docs/getting-started.md).

## CLI reference

```text
atlas init [--repo <path>] [--json]      Initialize and index a project
atlas build [--repo <path>] [--json]     Full rebuild of the context index
atlas update [--repo <path>] [--json]    Incremental index update
atlas scan [--repo <path>] [--json]      Hierarchical project overview (no indexing)
atlas search <query...> [-t <kind>] [-l <n>] [--json]
atlas mcp [--root <path>]                Start the MCP server over stdio
atlas sessions list|info|stop            Manage AI agent sessions
atlas usage [summary|list|budgets]       Usage & credits
atlas tools search|info|install|remove|update|configure|doctor
atlas context <task> [--explain] [--json]
atlas context launch|attach <task>       Launch/attach agent sessions with context
atlas explain <target> [--ai]              Explain a symbol/file/module/concept
atlas doctor [--json]                      Diagnose installation & project health
```

Every data-returning command supports `--json` for machine-readable output.
The CLI imports only `@atlas/sdk` (+ `@atlas/mcp` for `atlas mcp`) — enforced by
ESLint. See [docs/CLI.md](docs/CLI.md).

## Integrations

- **MCP** — `@atlas/mcp` exposes 7 read-only tools
  (`search_symbols`, `search_files`, `get_summary`, `get_dependencies`,
  `explain_module`, `project_overview`, `read_file_range`) over stdio. See
  [docs/MCP.md](docs/MCP.md) and [docs/integrations.md](docs/integrations.md).
- **VS Code** — `@atlas/extension` reads context through the SDK. See
  [docs/VSCODE.md](docs/VSCODE.md).
- **AI coding CLIs** — the connection layer detects Claude / Gemini / Codex /
  OpenCode; `atlas context launch` (and the v2 TUI slash surface) deliver
  context to sessions. See [docs/AGENT_SESSIONS.md](docs/AGENT_SESSIONS.md).
- **Agent Toolkit** — `atlas tools` for registry, install, configure, and
  doctor. See [docs/AGENT_TOOLKIT.md](docs/AGENT_TOOLKIT.md).

## Context SDK

The programmatic read (and indexing-write) API — what every consumer uses
instead of the database:

```ts
import { createContextSDK } from "@atlas/sdk";

const context = createContextSDK({ repositoryPath: "/path/to/repo" });
const hits = context.search.search("authentication");
const signal = await context.freshness(); // fresh | stale | unknown | unavailable
context.close(); // releases the SQLite handle
```

See [docs/CONTEXT_SDK.md](docs/CONTEXT_SDK.md).

## Configuration

`ATLAS_ROOT` and `ATLAS_DB` environment variables control which index the CLI,
MCP server, and SDK resolve (`ATLAS_DB` wins). Index data lives in
`<repo>/.codeatlas/` (manifest, `context.db`, tool manifests, `usage.db`) and is
gitignored. See [docs/configuration.md](docs/configuration.md) and
[docs/CONTEXT_STORAGE.md](docs/CONTEXT_STORAGE.md).

## Architecture

Clean architecture in a pnpm + TypeScript monorepo: contracts in `packages/core`,
implementations in feature packages, composition in `packages/sdk`. Dependencies
point inward (`cli → sdk → feature packages → core → shared`) and are enforced by
ESLint. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).

```
apps/
  cli/          # End-user CLI (Commander.js)
  extension/    # VS Code extension
packages/
  shared/       # Base types, Result, branded IDs, VERSION
  core/         # Domain models + ports (interfaces)
  scanner/      # File-system walking + ignore rules + manifest
  hashing/      # SHA-256 hashing + change detection
  parser/       # TypeScript parsing → normalized symbols
  storage/      # SQLite persistence (node:sqlite)
  graph/        # Code-dependency graph
  context/      # Context rank/assembly (deterministic — ADR-001)
  cache/        # Generic caching
  providers/    # AI provider adapters
  summary/      # AI-optional summaries
  search/       # Ranked, fuzzy-aware search
  agents/       # AI CLI connection + session manager
  usage/        # Usage & credits
  toolkit/      # Agent Toolkit
  mcp/          # MCP server
  sdk/          # Public API + Context SDK
docs/           # Design & contributor documentation
```

## Development

```bash
pnpm check        # typecheck + lint + format + test (the gate)
pnpm test         # unit tests
npx vitest run packages/<pkg> apps/cli   # targeted tests
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) and
[docs/TESTING.md](docs/TESTING.md).

## Documentation

- Index & navigation: [docs/DOCUMENTATION_MAP.md](docs/DOCUMENTATION_MAP.md)
- Current state: [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) ·
  [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
  [docs/MODULES.md](docs/MODULES.md) · [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md)
- Security & privacy: [docs/SECURITY.md](docs/SECURITY.md) ·
  [docs/PRIVACY.md](docs/PRIVACY.md)

## Contributing

Please read [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) and
[AGENTS.md](AGENTS.md) first. All commits must follow
[Conventional Commits](https://www.conventionalcommits.org/); hooks enforce
linting, formatting, typing, and commit conventions on every change. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Security

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md) and
[docs/SECURITY.md](docs/SECURITY.md).

## Benchmarks

CodeAtlas indexes real repositories locally. Here are honest numbers from the
[extreme stress benchmark](benchmarks/extreme/) on a shared 7.2 GiB machine
(1,000 generated TypeScript files, 5 M lines, 251 MB source):

| Metric | Value |
|--------|-------|
| Peak RSS | 1,698 MB |
| Minimum available memory | 1,361 MB |
| Wall time (build) | 188 s |
| Symbols indexed | 78,904 |
| Dependencies indexed | 139,408 |
| Index size on disk | 353 MB |

A prior native-memory leak (statement-per-row preparation) caused 4,274 MB
peak RSS / 23 MB minimum available on the same corpus — that is fixed
([CHANGELOG](CHANGELOG.md)). The 5,000-file corpus (25 M lines, 1.2 GB
source) exceeds available memory on this machine and is a known limitation.

**Honesty note:** these are *worst-case* generated corpora, not typical
repositories. Real-world projects with mixed languages and fewer files will
use less memory. We do not claim specific token-savings percentages — the
context engine delivers *bounded, relevant* context, not magic.

Full results: [`benchmarks/extreme/results.json`](benchmarks/extreme/results.json).

## License

[MIT](./LICENSE)