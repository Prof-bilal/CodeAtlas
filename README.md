# CodeAtlas

> An open-source **AI Context Engine** that helps AI tools understand any codebase.

CodeAtlas scans, parses, and indexes source code into a queryable graph, then
assembles the most relevant context to feed into LLM prompts — so AI assistants
can reason about large codebases accurately and efficiently.

> **Status: Core pipeline implemented.** The scanner, hashing, parser (TypeScript),
> graph, summary, providers, cache, and SQLite storage modules are implemented
> and tested; the search engine, MCP server, and Context API/SDK are implemented
> and consumed by `atlas search`, the MCP tools, and the VS Code extension. The
> **Agent infrastructure** is also implemented: the AI CLI connection layer
> (`@atlas/agents`), the **Agent Session Manager** (`atlas sessions`), the
> **multi-agent Orchestrator**, **Usage & Credits** (`atlas usage`, ADR-009),
> Context → Agent integration (`createContextIntegration`, ADR-008), and the
> **Agent Toolkit** registry + tool-manifest foundation (Tasks 19–20), its
> Compatibility Engine and Installer (Tasks 21–22), and the Tool Configurator
> with the Security/Trust assessor (Task 24), and the SDK-backed Toolkit CLI
> (Task 25). Still planned: the CLI's
> indexing commands (`init`/`build`/`explain`/`doctor`), the `/tools` slash
> surface, `atlas setup`, and the future `/context` slash router.
> The context rank/assembler (`@atlas/context`) remains a structural stub behind
> its port by design (ADR-001).

## Monorepo Layout

```
apps/
  cli/          # End-user CLI built with Commander.js
  extension/    # VS Code extension (@atlas/extension)
packages/
  shared/       # Base types, Result, branded IDs, VERSION, ComingSoonError
  core/         # Domain models, ports (interfaces), use-cases
  scanner/      # File-system walking + ignore rules + manifest.ts
  hashing/      # SHA-256 file hashing + change detection
  parser/       # Language parsing -> normalized symbols/AST
  storage/      # Persistence layer behind core ports
  graph/        # Code-dependency graph build & query
  context/      # Context rank & assembly for LLM prompts (intentional stub)
  cache/        # Generic caching layer
  providers/    # AI model provider adapters
  summary/      # AI file/folder/module/project summaries
  search/       # Ranked, fuzzy-aware project search
  agents/       # AI CLI connection + session manager (detect & run external AI CLIs)
  usage/        # AI usage & credits: tri-state tokens/cost, budgets, limits
  toolkit/      # Agent Toolkit: Tool Registry + Tool Manifest foundation
  mcp/          # MCP server exposing context to AI coding tools
  sdk/          # Public programmatic API (wires everything) + createContextSDK
docs/           # Design & contributor documentation
examples/       # Usage examples (placeholder)
```

## Getting Started

```bash
# Enable the pinned toolchain & install dependencies
corepack enable
pnpm install

# Verify the whole monorepo (typecheck, lint, format, test)
pnpm check
```

## CLI

```bash
pnpm --filter @atlas/cli build
node apps/cli/dist/index.js --help
```

```text
atlas search <query...>  → wired — ranked search over .codeatlas/context.db
atlas mcp                → wired — starts the MCP server over stdio
atlas sessions           → wired — list/info/stop AI agent sessions
atlas usage              → wired — usage summary, list, budgets
atlas tools              → wired — SDK-backed overview/search/info/install/remove/update/configure/doctor
atlas init / build / update / explain / doctor  → still "Coming Soon" placeholders
```

`atlas search`, `atlas sessions`, `atlas usage`, and the MCP tools read indexed
context through the **Context SDK** (`createContextSDK`, in `@atlas/sdk`) — they
never touch the database directly. The indexing pipeline that *produces* that
database is not yet wired into the CLI; that is the remaining Phase 1–2 work (see
`docs/ROADMAP.md`).

## Contributing

Please read [ARCHITECTURE.md](./ARCHITECTURE.md) first. All commits must follow
[Conventional Commits](https://www.conventionalcommits.org/); hooks enforce
linting, formatting, typing, and commit conventions on every change.

## License

[MIT](./LICENSE)

## Agents
- **Scanner Agent**: Recursively scans projects for metadata (files, folders, languages, frameworks, package.json, tsconfig.json)
- **Hashing Agent**: Manages SHA-256 hashing for files to detect changes, deletions, and new files
- **Manifest Agent**: Generates project-specific manifest in `.codeatlas/manifest.json` with metadata
- **Parser Agent**: Parses source into a language-agnostic IR — normalized symbols (kind, location, parent, visibility) for classes, interfaces, functions, methods, variables, imports, exports, enums, and type aliases
- **Graph Agent**: Builds the dependency graph (imports, exports, calls, inheritance, implementations) and answers dependency, path, and cycle queries
- **Provider Agent**: Unified adapter over Claude / OpenAI / Gemini / DeepSeek with an extensible registry
- **Cache Agent**: Generic caching (get/set/delete, TTL, optional JSON persistence)
- **AI Summary Agent**: Structured file/folder/module/project summaries, cached by content hash so only changed files reach the model
- **Storage Agent**: SQLite context database (files, symbols, dependencies, modules, summaries, relationships, hashes, metadata) with repositories, migrations, transactions, and search
- **Search Agent**: Ranked, fuzzy-aware search over the context snapshot (files, symbols, modules, dependencies, summaries) behind a vector-ready scorer seam
- **MCP Server**: Exposes indexed context to AI coding tools over MCP/stdio (6 read tools) — an SDK consumer
- **VS Code Extension**: Activity Bar + tree views + palette commands reading context through the SDK
- **AI CLI Connection Layer**: Detects and runs external AI coding CLIs (Claude / Gemini / Codex / OpenCode) behind `AgentPort` in `@atlas/agents`
- **Agent Session Manager**: Manages independent live AI-CLI sessions behind `SessionPort` (`createSessionManager`, `atlas sessions`)
- **Multi-Agent Orchestrator**: Coordinates bounded agent roles (parallel/sequential) through `SessionPort`, collects and combines results (`createOrchestrator`)
- **Usage & Credits Agent**: Tri-state actual/estimated/unknown tokens & cost, budgets/limits, pricing abstraction, `atlas usage` (`@atlas/usage`)
- **Context → Agent Integration**: Assembles budgeted, deny-filtered `ContextPackage`s per task and delivers them to sessions (`createContextIntegration`, ADR-008)
- **Tool Registry**: Curated, schema-validated, provenance-auditable catalog + local overlay (`createToolRegistry`, `@atlas/toolkit`)
- **Tool Manifest System**: Versioned, validated manifest per installed tool (`.codeatlas/tools/<name>.json`, `TOOL_MANIFEST_SCHEMA_VERSION = 1`)

## Progress
- ✅ Scanner module implemented (recursive scan, ignored directories, structured output)
- ✅ Hashing module built (_SHA-256_, change detection, JSON storage)
- ✅ Manifest generation (project metadata in JSON)
- ✅ Parser module built (TypeScript → normalized symbols via `ts-morph`, plugin-ready for more languages, parses only changed files)
- ✅ Dependency graph built (imports, exports, calls, inheritance, interface implementations; `shortestPath` + cycle detection + JSON export)
- ✅ Provider adapters built (Claude, OpenAI, Gemini, DeepSeek) + extensible registry
- ✅ Caching built (TTL + persistence)
- ✅ AI summary engine built (file/folder/module/project; content-hash caching; structured JSON; token usage)
- ✅ SQLite context database built (8 tables, repositories, migrations, transactions, search)
- ✅ Ranked project search built (in-memory index over files/symbols/modules/dependencies/summaries, fuzzy-aware, vector-ready scorer seam)
- ✅ Context API / SDK built (`createContextSDK` — the read/write façade, provider-independent)
- ✅ MCP server built (`@atlas/mcp` — stdio server, 6 read-only tools consuming the SDK)
- ✅ VS Code extension built (`@atlas/extension` — tree views + palette commands) consuming the SDK
- ✅ AI CLI connection layer built (`@atlas/agents` behind `AgentPort`)
- ✅ Agent Session Manager built (`createSessionManager`, `atlas sessions list/info/stop`)
- ✅ Multi-Agent Orchestrator built (`createOrchestrator` — bounded agent roles, parallel/sequential, result combination)
- ✅ Usage & Credits built (`@atlas/usage`, `createUsageService`, `atlas usage` — tri-state tokens/cost, budgets, limits)
- ✅ Context → Agent Integration built (`createContextIntegration` — budgeted, deny-filtered ContextPackages; ADR-008)
- ✅ Tool Registry foundation built (`@atlas/toolkit`, `createToolRegistry` — curated catalog + local overlay)
- ✅ Tool Manifest System built (versioned, validated, extensible per-installed-tool manifests)
- ✅ Compatibility Engine built (`createCompatibilityEngine`, fail-closed environment checks)
- ✅ Tool Installer built (`createInstaller`, approval-gated safe MVP ecosystems, verification/rollback)
- ✅ Tool Configurator built (`createConfigurator`, per-target adapters, merge/backup/rollback, dry-run)
- ➖ CLI `atlas search` + `atlas mcp` + `atlas sessions` + `atlas usage` + `atlas tools` wired through SDK seams; `init`/`build`/`explain`/`doctor` still stubs

## AI Agent Instructions
- [AGENTS.md](AGENTS.md) — authoritative rules for every coding agent (Claude Code, OpenCode, Codex, Gemini CLI, …).
- [Agent catalog](docs/AGENT_CATALOG.md) — the implemented analysis agents mapped to their `@atlas/*` packages.
- [Documentation map](docs/DOCUMENTATION_MAP.md) — how to navigate `docs/`.

## Next Steps
- Wire the scan → hash → parse → graph → storage pipeline into `atlas build` and
  `atlas update`.
- Implement the intentional `@atlas/context` ranking/assembly service when the
  product decision changes (currently preserved as a stub by ADR-001).
- Agent Toolkit: `/tools` slash integration and `atlas setup`; Context CLI
  slash routing remains future work — see
  `docs/AGENT_TOOLKIT.md`
