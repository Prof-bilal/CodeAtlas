# Repository Map

Where everything lives, what it is for, and **where a contributor should add
new code**. Read this before creating a file — if an existing seam already does
the job, extend it instead.

## Top level

| Path | What it is | Who should touch it |
| ---- | ---------- | ------------------- |
| `apps/cli/` | The `atlas` CLI (`codeatlas-cli`) — Commander.js commands only | Anything user-facing in the terminal. No business logic: delegate to the SDK. |
| `apps/extension/` | VS Code extension (`@prof-bilal/atlas-extension`) | IDE integration. Reads context only through the SDK. |
| `packages/core/` | Domain entities + **port interfaces** (`*Port`) | Only when a new seam is needed (ADR) — ports are type-only contracts. |
| `packages/sdk/` | Composition root: every service is wired here and exported | Adding a public API surface (`createContextSDK`, `createToolkitSDK`, `planSetup`, `createSkillService`, …). |
| `packages/toolkit/` | Agent Toolkit: tool registry (`catalog.json`), tool manifests, installer, configurator, security assessor, **Skills loader + built-in Skills** | Tools (`atlas tools`), and Skills (`skills/prebuilt/<id>/SKILL.md`). |
| `packages/mcp/` | MCP server (`@prof-bilal/atlas-mcp`) over stdio | Exposing context/Skills to MCP clients. |
| `packages/*` (feature) | One package per capability: scanner, hashing, parser, storage, graph, context, cache, providers, summary, search, agents, usage, metrics, verifier | Implementing a capability behind a `core` port. |
| `docs/` | Documentation (see [`docs/README.md`](./README.md)) | Any behavior/architecture change. |
| `examples/` | Copy-paste examples for users | When you add a user-facing workflow worth showing. |
| `scripts/` | Build helpers (`copy-prebuilt-skills.mjs`) | Build plumbing only. Not runtime code. |
| `tests/fixtures/` | Shared test fixture repositories | Fixtures used by more than one package. |
| `.github/workflows/` | CI (typecheck, lint, format, tests) | CI changes. |

## docs/

| Directory | Contents |
| --------- | -------- |
| `docs/` (root) | `CURRENT_STATE.md` (what exists), `FEATURE_STATUS.md` (status tags), `REPOSITORY_MAP.md` (this file), `README.md` (index). |
| `docs/architecture/` | `ARCHITECTURE.md`, `MODULES.md`, `DEPENDENCIES.md`, `CONTEXT.md`, `CONTEXT_STORAGE.md`, `TOOL_REGISTRY.md`, `AGENT_TOOLKIT.md`, `AGENT_SESSIONS.md`, `AGENT_ORCHESTRATOR.md`, `AGENT_CATALOG.md`. |
| `docs/guides/` | Install, first run, configuration, integrations, providers, AI workflow, VS Code, agent compatibility, troubleshooting. |
| `docs/reference/` | `CLI.md`, `CONTEXT_SDK.md`, `MCP.md`, `MCP_MIGRATION.md`, `USAGE.md`, `TOOL_MANIFEST.md`, `SECURITY.md`, `PRIVACY.md`. |
| `docs/contributing/` | `CONTRIBUTING.md`, `DEVELOPMENT.md`, `DEVELOPMENT_WORKFLOW.md`, `TESTING.md`, `CODE_QUALITY.md`, `CHANGE_POLICY.md`. |
| `docs/decisions/` | ADRs (`ADR-NNN-*.md`) + the ADR index. |
| `docs/archive/` | Superseded plans/audits/research. Historical only — never current requirements. |

## Where do I add…?

### A Skill

1. Add a directory with a canonical `SKILL.md`:
   `packages/toolkit/src/skills/prebuilt/<skill-id>/SKILL.md`.
   Frontmatter: `name` (must equal the directory id), `description`, `version`,
   optional `allowed-tools`.
2. Add the id to `BUILTIN_SKILL_IDS` in
   `packages/toolkit/src/skills/builtin.ts`.
3. Extend `packages/toolkit/tests/builtin-skills.test.ts` (the tests assert the
   shipped list, on-disk `SKILL.md` files, loader round-trips and metadata).
4. Nothing else: the loader, `atlas skills`, MCP `list_skills`/`get_skill`, and
   the packaged `dist/skills/prebuilt` copy all read the same file.

For a *user-authored* Skill, no code change is needed — `atlas skills create <id>`
or `atlas skills add --from <dir>` writes into `.codeatlas/skills/`.

### A Tool

1. Add a record to `packages/toolkit/src/catalog.json` (schema-validated; include
   `installMethods`, `security`, `trust`, `provenance`).
2. Support for a new *install method* is an adapter:
   `packages/toolkit/src/installer-adapters.ts` (+ tests). Keep spawning
   argument-array based (`shell: false`).
3. Per-tool configuration goes in `packages/toolkit/src/configurator-adapters.ts`.
4. Tests: `packages/toolkit/tests/schema.test.ts`, `installer-adapters.test.ts`.

### A CLI command

1. Add `apps/cli/src/commands/<name>.ts` exporting `register<Name>(program)`.
2. Register it in `apps/cli/src/commands/index.ts`, and add the name to the
   command-list assertion in `apps/cli/tests/cli.test.ts`.
3. Put logic in the SDK — the CLI parses flags and renders. New public API goes
   in `packages/sdk/src/**` and is exported from `packages/sdk/src/index.ts`.
4. Add a focused test in `apps/cli/tests/`.

### An SDK service

1. Implement behind the matching `core` port in a feature package
   (`packages/<feature>/src`).
2. Compose it in `packages/sdk/src/<feature>/` and export the factory + types
   from `packages/sdk/src/index.ts`.
3. Keep consumer packages (CLI, MCP, extension) importing **only** the SDK.

### A context/analysis capability

Work inside the pipeline packages (`scanner → hashing → parser → graph →
storage → search → context`). Read
[docs/architecture/CONTEXT.md](./architecture/CONTEXT.md) first, and respect
[docs/architecture/DEPENDENCIES.md](./architecture/DEPENDENCIES.md).

### A test

- Unit/integration: `packages/<pkg>/tests/*.test.ts` (vitest).
- CLI: `apps/cli/tests/*.test.ts`.
- Shared fixtures: `tests/fixtures/`.
- No test may require network access or provider credentials.

## Rules of thumb

- **Dependencies point inward:** `cli → sdk → feature packages → core → shared`.
  ESLint enforces the matrix in `eslint.config.mjs`; never import a feature
  package from the CLI or another feature package.
- **Persistence belongs to `@prof-bilal/atlas-storage`.** Never write ad-hoc SQL.
- **Context reads go through `createContextSDK`.** No consumer touches the
  database, `@prof-bilal/atlas-search`, or `@prof-bilal/atlas-storage` directly.
- **One registry, one loader.** Do not add a second tool registry, Skill loader,
  recommendation system, or artifact store.
- **Small changes.** One purpose per change; update `docs/` when behavior or
  status changes (see [docs/contributing/CHANGE_POLICY.md](./contributing/CHANGE_POLICY.md)).
