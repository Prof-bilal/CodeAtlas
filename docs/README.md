# CodeAtlas Documentation

The technical truth for CodeAtlas lives here. Start with
[CURRENT_STATE.md](./CURRENT_STATE.md) (what actually exists), then
[architecture/ARCHITECTURE.md](./architecture/ARCHITECTURE.md) (how it fits
together) and [REPOSITORY_MAP.md](./REPOSITORY_MAP.md) (where everything lives).

## Layout

| Directory | Contents |
| --------- | -------- |
| `docs/` (root) | Status + navigation: `CURRENT_STATE.md`, `FEATURE_STATUS.md`, `REPOSITORY_MAP.md`, this index. |
| `docs/architecture/` | How the system is built: architecture, module ownership, dependency rules, the context pipeline, agent subsystems. |
| `docs/guides/` | Task-oriented guides: install, first run, configuration, integrations, providers, VS Code, troubleshooting. |
| `docs/reference/` | Contracts: CLI, SDK, MCP, tool manifest, usage/credits, security, privacy. |
| `docs/contributing/` | How to work here: setup, testing, code quality, change policy, PR expectations. |
| `docs/decisions/` | Architecture Decision Records (ADRs). |
| `docs/archive/` | Superseded plans, audits and research. Historical reference only — never current requirements. |

## Start here

- [CURRENT_STATE.md](./CURRENT_STATE.md) — what is implemented / partial / planned. **Read first.**
- [REPOSITORY_MAP.md](./REPOSITORY_MAP.md) — "where do I add this?" map of apps, packages, docs and tests.
- [FEATURE_STATUS.md](./FEATURE_STATUS.md) — status tags across features.

## Architecture

- [architecture/ARCHITECTURE.md](./architecture/ARCHITECTURE.md) — canonical architecture + dependency diagram
- [architecture/MODULES.md](./architecture/MODULES.md) — module ownership ("who owns what")
- [architecture/DEPENDENCIES.md](./architecture/DEPENDENCIES.md) — import rules + dependency policy
- [architecture/CONTEXT.md](./architecture/CONTEXT.md) — how CodeAtlas understands a repository (the pipeline)
- [architecture/CONTEXT_STORAGE.md](./architecture/CONTEXT_STORAGE.md) — the `.codeatlas/` directory
- [architecture/TOOL_REGISTRY.md](./architecture/TOOL_REGISTRY.md) — Tool Registry (record schema, provenance, overlay)
- [architecture/AGENT_TOOLKIT.md](./architecture/AGENT_TOOLKIT.md) — Agent Toolkit design + current state
- [architecture/AGENT_SESSIONS.md](./architecture/AGENT_SESSIONS.md) — Agent Session Manager
- [architecture/AGENT_ORCHESTRATOR.md](./architecture/AGENT_ORCHESTRATOR.md) — unified AI CLI orchestrator
- [architecture/AGENT_CATALOG.md](./architecture/AGENT_CATALOG.md) — implemented analysis agents

## Guides

- [guides/installation.md](./guides/installation.md) — install the published CLI or build from source
- [guides/getting-started.md](./guides/getting-started.md) — 10-minute walkthrough
- [guides/configuration.md](./guides/configuration.md) — environment variables + options
- [guides/integrations.md](./guides/integrations.md) — MCP, VS Code, AI CLIs, Agent Toolkit
- [guides/AI_PROVIDERS.md](./guides/AI_PROVIDERS.md) — provider adapters
- [guides/AI_WORKFLOW.md](./guides/AI_WORKFLOW.md) — connect a provider, summarize, launch agents, track tokens
- [guides/VSCODE.md](./guides/VSCODE.md) — the VS Code extension
- [guides/AGENT_COMPATIBILITY.md](./guides/AGENT_COMPATIBILITY.md) — how external agents consume these instructions
- [guides/troubleshooting.md](./guides/troubleshooting.md) — common problems and fixes

## Reference

- [reference/CLI.md](./reference/CLI.md) — the `atlas` CLI contract
- [reference/CONTEXT_SDK.md](./reference/CONTEXT_SDK.md) — the read/query API consumers use
- [reference/MCP.md](./reference/MCP.md) — MCP server configuration + tool reference
- [reference/MCP_MIGRATION.md](./reference/MCP_MIGRATION.md) — MCP v2 tool-name migration
- [reference/USAGE.md](./reference/USAGE.md) — AI usage & credits (provenance, budgets, `atlas usage`)
- [reference/TOOL_MANIFEST.md](./reference/TOOL_MANIFEST.md) — per-installed-tool manifest schema
- [reference/SECURITY.md](./reference/SECURITY.md) — non-negotiable security rules
- [reference/PRIVACY.md](./reference/PRIVACY.md) — privacy rules (local-first)

## Contributing

- [contributing/CONTRIBUTING.md](./contributing/CONTRIBUTING.md) — practical contributor guide
- [contributing/DEVELOPMENT.md](./contributing/DEVELOPMENT.md) — developer setup & commands
- [contributing/DEVELOPMENT_WORKFLOW.md](./contributing/DEVELOPMENT_WORKFLOW.md) — the standard change workflow
- [contributing/TESTING.md](./contributing/TESTING.md) — testing policy
- [contributing/CODE_QUALITY.md](./contributing/CODE_QUALITY.md) — coding standards
- [contributing/CHANGE_POLICY.md](./contributing/CHANGE_POLICY.md) — how changes happen

## Decisions

- [decisions/README.md](./decisions/README.md) — ADR index
- [archive/](./archive) — superseded plans, audits and research (MCP v2, skills/tools research, upgrade research)

## Navigating for a task

- **New to the repo?** `AGENTS.md` → `CURRENT_STATE.md` → `architecture/ARCHITECTURE.md`.
- **About to modify a module?** Also read `architecture/MODULES.md` + `architecture/DEPENDENCIES.md`.
- **Touching an indexer/analyzer?** Read `architecture/CONTEXT.md` + `architecture/MODULES.md`.
- **Touching Skills or Tools?** Read `architecture/AGENT_TOOLKIT.md` + `architecture/TOOL_REGISTRY.md` + `reference/TOOL_MANIFEST.md`.
- **Provider calls / usage / credits?** Read `guides/AI_PROVIDERS.md` + `reference/USAGE.md`.
- **Anything touching processes or secrets?** Read `reference/SECURITY.md` + `reference/PRIVACY.md`.

## Rules

- One **single source of truth** per concept. If two docs disagree, the more
  canonical one wins (`AGENTS.md` → `CURRENT_STATE.md`/`ARCHITECTURE.md` → the
  rest) and the contradiction is a bug to fix.
- Feature status is *always* checked against code before being claimed — never
  mark something implemented without looking.
- Doc changes get the same review as code (`pnpm check`, plus a link check).
