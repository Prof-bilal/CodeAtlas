# CodeAtlas

> An open-source **AI Context Engine** that helps AI tools and agents understand
> any codebase — accurately, cheaply, and locally.

CodeAtlas scans, parses, and indexes a source tree into a queryable, persistent
context database, exposes that context to developer tools and AI agents over a
stable SDK (CLI, MCP, VS Code), and manages the **Tools** and **Skills** those
agents work with.

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
  [PRIVACY.md](docs/reference/PRIVACY.md)).
- **Deterministic before AI.** Facts (symbols, graph, search) are computed
  statically; AI only *adds* summaries and explanations.

## Who it is for

- **Developers** who want to ask an AI coding agent about a large repository
  without pasting files into a prompt.
- **AI coding agents and MCP clients** (Claude Desktop, Cursor, VS Code, …) that
  need structured, attributable context instead of grep output.
- **Maintainers and contributors** who want to extend the engine, add a Tool, or
  add a Skill (see [REPOSITORY_MAP.md](docs/REPOSITORY_MAP.md)).

## Features

- **Context engine** — scanner, SHA-256 change detection, TypeScript parser,
  dependency graph, AI-optional summaries, SQLite storage, ranked
  fuzzy-aware search.
- **Context SDK** (`@prof-bilal/atlas-sdk`) — the single read interface every
  consumer uses: files, symbols, dependencies, modules, summaries, search,
  project stats, and freshness.
- **MCP server** (`@prof-bilal/atlas-mcp`) — read-only tools over stdio for any
  MCP client, including `list_skills` / `get_skill`.
- **Skills** — 13 first-party workflow Skills (planning, debugging,
  verification, security review, MCP building, research, UI workflows) shipped
  as canonical `SKILL.md` files, plus project-local Skills you author yourself.
  `atlas skills` lists and inspects them.
- **Tools** (`atlas tools`) — a curated, schema-validated tool registry with a
  per-tool manifest, a compatibility engine, a security/trust assessor, an
  approval-gated installer, and a configurator for installed agents.
- **Setup you control** — `atlas setup` shows what could be installed and
  installs **only** what you select. Installing CodeAtlas itself never installs
  optional Tools or Skills.
- **Agent infrastructure** — AI CLI connection layer, agent sessions
  (`atlas sessions`), usage & credits (`atlas usage`), and context → agent
  integration (`atlas context launch`).
- **VS Code extension** (`@prof-bilal/atlas-extension`) — activity bar, tree
  views, and palette commands over the SDK.

## Installation

Requirements: **Node.js `>=22.5.0`** (the storage layer uses the built-in
`node:sqlite`; every package shares that engine floor).

```bash
npm install --global codeatlas-cli
atlas --version
```

This installs **CodeAtlas only** — no Tools, no Skills, no config changes. Then
choose what you want:

```bash
atlas setup
```

Or build from source:

```bash
corepack enable
pnpm install
pnpm --filter codeatlas-cli build
```

See [docs/guides/installation.md](docs/guides/installation.md).

## Setup

`atlas setup` detects what kind of project you have, shows the available
options, and installs only what you pick:

```text
$ atlas setup

CodeAtlas setup

Project: /work/my-app
Project evidence: frontend markers

Recommended Skills — already available, no install needed:
  ✓ webapp-testing — Test rendered web applications through observable behavior…
  13 built-in Skills ship with CodeAtlas; see them all with `atlas skills`.

Recommended Tools & Skills — installable (0):
  none — the curated recommendations are built-in Skills

Optional — installable from the catalog (51):
   1) changelog-generator [skill] (trust:community) — Turn verified change history into release evidence.
   2) ... 

Select items to install (numbers/ranges, e.g. 1,3-5; 'all'; 'none') [none]:
```

Nothing is pre-selected and nothing installs without your confirmation.
Non-interactive use: `atlas setup --tools <id>[,<id>] --yes`
(`--dry-run` plans without executing).

## Quick start

```bash
# Index a repository you want to understand.
atlas init --repo /absolute/path/to/your-project

# Search the generated context database.
atlas search authentication --repo /absolute/path/to/your-project

# Get safe, budgeted context for an AI task.
atlas context "fix the authentication tests" --repo /absolute/path/to/your-project

# See which Skills are available, then inspect one.
atlas skills
atlas skills info verification-before-completion

# Launch an agent seeded with that context and a Skill.
atlas context launch "fix the failing auth tests" --provider claude \
  --skill verification-before-completion

# Keep the index in sync with the working tree.
atlas update --repo /absolute/path/to/your-project
```

Full walkthrough: [docs/guides/getting-started.md](docs/guides/getting-started.md).

## CLI

29 top-level commands. The common ones:

```text
atlas init|build|update [--repo <path>]   Index / rebuild / incrementally update
atlas scan [--repo <path>]                Hierarchical project overview (no indexing)
atlas search <query...>                   Search symbols, files, modules, summaries
atlas context <task>|launch|attach        Build, launch, or attach budgeted context
atlas ask <question>                      Ranked context slice for one question
atlas explain <target> [--ai]             Explain a symbol/file/module/concept
atlas skills [list|info|validate|load]    Discover and inspect built-in + installed Skills
atlas tools  [search|info|install|...]    Registry, install, configure, doctor
atlas setup                               Choose which Tools/Skills to install
atlas mcp                                 Start the MCP server over stdio
atlas sessions|usage|metrics              Sessions, credits, token analytics
atlas agents|ollama|providers             Detect AI CLIs; configure providers
atlas doctor [--json]                     Diagnose installation & project health
atlas claude|gemini|codex|opencode        Launch that agent with context (sugar)
```

Every data-returning command supports `--json`. The CLI imports only
`@prof-bilal/atlas-sdk` (+ `@prof-bilal/atlas-mcp` for `atlas mcp`) — enforced by
ESLint. See [docs/reference/CLI.md](docs/reference/CLI.md).

## MCP

`@prof-bilal/atlas-mcp` exposes the context engine over stdio to any MCP client:
search, inspect, dependencies, summaries, project overview, bounded file reads,
plus `list_skills` / `get_skill`. Register it for installed agents with
`atlas agents connect`. See [docs/reference/MCP.md](docs/reference/MCP.md).

## Context SDK

The programmatic API every consumer uses instead of the database:

```ts
import { createContextSDK } from "@prof-bilal/atlas-sdk";

const context = createContextSDK({ repositoryPath: "/path/to/repo" });
const hits = context.search.search("authentication");
const signal = await context.freshness(); // fresh | stale | unknown | unavailable
context.close(); // releases the SQLite handle
```

See [docs/reference/CONTEXT_SDK.md](docs/reference/CONTEXT_SDK.md).

## Configuration

`ATLAS_ROOT` and `ATLAS_DB` control which index the CLI, MCP server, and SDK
resolve (`ATLAS_DB` wins). Index data lives in `<repo>/.codeatlas/` (manifest,
`context.db`, `tools/`, installed skills, `usage.db`) and is gitignored. See
[docs/guides/configuration.md](docs/guides/configuration.md) and
[docs/architecture/CONTEXT_STORAGE.md](docs/architecture/CONTEXT_STORAGE.md).

## Architecture

Clean architecture in a pnpm + TypeScript monorepo: contracts in `packages/core`,
implementations in feature packages, composition in `packages/sdk`.
Dependencies point inward and are enforced by ESLint.

```text
                     ┌───────────┐   ┌──────────────┐
                     │  atlas CLI│   │ VS Code ext. │
                     └─────┬─────┘   └──────┬───────┘
                           │  context only  │
                     ┌─────▼─────┐   ┌──────▼───────┐
                     │    MCP    │   │     SDK      │  ← composition root
                     └───────────┘   └──────┬───────┘
                                            │
        ┌──────────┬───────────┬────────────┼──────────┬──────────┐
        ▼          ▼           ▼            ▼          ▼          ▼
     Context     Tools       Skills      Agents     Usage     Metrics
        │          │           │            │          │          │
        └──────────┴───────────┴────────────┴──────────┴──────────┘
                                            ▼
                                   core (ports) → shared
```

```text
apps/
  cli/          # End-user CLI (Commander.js)
  extension/    # VS Code extension
packages/
  shared/       # Base types, Result, branded IDs, VERSION
  core/         # Domain models + port interfaces (type-only)
  scanner/      # Walking, ignore rules, manifest
  hashing/      # SHA-256 hashing + change detection
  parser/       # TypeScript parsing → normalized symbols
  storage/      # SQLite persistence (node:sqlite)
  graph/        # Dependency graph
  context/      # Context rank & assembly (deterministic — ADR-001)
  cache/        # Generic caching
  providers/    # AI provider adapters
  summary/      # AI-optional summaries
  search/       # Ranked, fuzzy-aware search
  agents/       # AI CLI connection layer
  usage/        # Usage & credits
  metrics/      # Local token/usage analytics
  toolkit/      # Tool registry, manifests, installer, Skills loader
  verifier/     # Claim verification
  mcp/          # MCP server
  sdk/          # Public API + composition root
docs/           # Documentation (see docs/README.md)
examples/       # Copy-paste examples
scripts/        # Build helpers
```

Read [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md),
[docs/architecture/MODULES.md](docs/architecture/MODULES.md) and
[docs/REPOSITORY_MAP.md](docs/REPOSITORY_MAP.md).

## Status

**[IMPLEMENTED]** Core pipeline (scanner, hashing, manifest, parser, graph,
storage, search, summaries, cache, providers), Context SDK, MCP server, VS Code
extension, agent connection layer + sessions, usage tracking, context → agent
integration, Ollama tool loop, the Agent Toolkit (tool registry, manifests,
compatibility engine, installer, configurator, security/trust assessor, Skills
loader with 13 built-in Skills), and the `atlas setup` selection flow.

**[PARTIAL]** Parser handles TypeScript only (renamed imports and
`export default <expr>` do not resolve cross-file).

**[PLANNED]** `/tools` and `/context` slash surfaces, the standalone agent
router / slash commands, the interactive TUI, and browser observation
(`atlas browse` + the four UI Skills that document it).

Ground truth: [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) and
[docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md).

### Beta limitations

- **TypeScript-only parsing** — other languages are indexed as files but not
  parsed into symbols/dependencies.
- **No streaming** — provider responses arrive complete.
- **No interactive TUI / slash commands** — `atlas tui` and `/claude`, `/tools`,
  `/agents` are not shipped.
- **MCP is tools-only** — no MCP resources or prompts yet.
- **Search is lexical** — vector/embedding search is a planned seam
  (`RelevanceScorer`), not wired.
- **No browser control** — the Playwright-based browser layer was removed for
  this phase; four UI Skills document it as [PLANNED].
- **CI runs Ubuntu only**; Windows/macOS are used in development but not
  exercised in CI.

## Development

```bash
pnpm install
pnpm check                                    # typecheck + lint + format + test
pnpm test                                     # unit/integration tests
npx vitest run packages/toolkit apps/cli       # targeted tests
pnpm --filter codeatlas-cli build              # build the CLI (copies Skills)
```

See [docs/contributing/DEVELOPMENT.md](docs/contributing/DEVELOPMENT.md),
[docs/contributing/TESTING.md](docs/contributing/TESTING.md) and
[docs/REPOSITORY_MAP.md](docs/REPOSITORY_MAP.md).

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) first.
Commits follow [Conventional Commits](https://www.conventionalcommits.org/);
hooks enforce linting, formatting, typing, and commit conventions.

## Security

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md) and
[docs/reference/SECURITY.md](docs/reference/SECURITY.md).

## Documentation

- Index & navigation: [docs/README.md](docs/README.md)
- Repository map ("where do I add this?"): [docs/REPOSITORY_MAP.md](docs/REPOSITORY_MAP.md)
- Current state: [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) ·
  [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md)
- Architecture: [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) ·
  [docs/architecture/MODULES.md](docs/architecture/MODULES.md) ·
  [docs/architecture/DEPENDENCIES.md](docs/architecture/DEPENDENCIES.md)
- Security & privacy: [docs/reference/SECURITY.md](docs/reference/SECURITY.md) ·
  [docs/reference/PRIVACY.md](docs/reference/PRIVACY.md)

## License

[MIT](./LICENSE)
