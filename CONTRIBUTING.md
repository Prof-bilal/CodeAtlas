# Contributing to CodeAtlas

Thanks for wanting to contribute! This is the practical guide: setup, the
change workflow, and **where to add things**. The deeper rules live in
[docs/contributing/](./docs/contributing/CONTRIBUTING.md), and
[AGENTS.md](./AGENTS.md) is the single source of truth for every coding agent
working here (Claude Code, OpenCode, Codex, Gemini CLI, Cursor, …).

## Quick start

```bash
corepack enable
pnpm install
pnpm check                      # typecheck + lint + format-check + tests (the gate)
pnpm --filter codeatlas-cli build
node apps/cli/dist/index.js --help
```

- **Node ≥ 22.5.0** is required (the storage layer uses the built-in
  `node:sqlite`).
- `pnpm test` runs the whole vitest suite; `npx vitest run packages/toolkit apps/cli`
  runs a subset. No test needs network access or provider credentials.
- `pnpm lint` (ESLint, including the dependency-direction matrix),
  `pnpm format` (Biome), `pnpm typecheck` (tsc across the workspace).

Details: [docs/contributing/DEVELOPMENT.md](./docs/contributing/DEVELOPMENT.md),
[docs/contributing/TESTING.md](./docs/contributing/TESTING.md).

## Understand the repository first

Read, in order:

1. [docs/CURRENT_STATE.md](./docs/CURRENT_STATE.md) — what actually exists.
2. [docs/REPOSITORY_MAP.md](./docs/REPOSITORY_MAP.md) — where everything lives.
3. [docs/architecture/ARCHITECTURE.md](./docs/architecture/ARCHITECTURE.md) —
   the dependency graph, ports, and composition root.
4. [docs/architecture/DEPENDENCIES.md](./docs/architecture/DEPENDENCIES.md) —
   the import rules ESLint enforces.

Short version: clean architecture in a pnpm + TypeScript monorepo. Contracts
(`*Port`) live in `packages/core`, implementations live in feature packages,
composition lives in `packages/sdk`, and consumers (`apps/cli`,
`packages/mcp`, `apps/extension`) import **only** the SDK.
Dependencies point inward: `cli → sdk → feature packages → core → shared`.

## Where do I put this?

- **A Skill** → `packages/toolkit/src/skills/prebuilt/<id>/SKILL.md` (canonical
  format: `name` must equal the directory id, plus `description`, `version`,
  optional `allowed-tools`), then add the id to `BUILTIN_SKILL_IDS` in
  `packages/toolkit/src/skills/builtin.ts` and extend
  `packages/toolkit/tests/builtin-skills.test.ts`.
  Users can also add Skills with no code change: `atlas skills create <id>` /
  `atlas skills add --from <dir>` (they land in `.codeatlas/skills/`).
- **A Tool** → a record in `packages/toolkit/src/catalog.json`. A new install
  method is a new adapter in `packages/toolkit/src/installer-adapters.ts`
  (argument-array spawns only, never `shell: true`).
- **A CLI command** → `apps/cli/src/commands/<name>.ts`, registered in
  `apps/cli/src/commands/index.ts`, with its name added to the command-list
  assertion in `apps/cli/tests/cli.test.ts`. Keep logic in the SDK — the CLI
  parses flags and renders output.
- **An SDK service** → implement behind a `core` port in the feature package,
  compose it in `packages/sdk/src/<feature>/`, export it from
  `packages/sdk/src/index.ts`, and test it in `packages/sdk/tests/`.
- **A context/analysis capability** → the pipeline packages (`scanner`,
  `hashing`, `parser`, `graph`, `storage`, `search`, `context`); read
  [docs/architecture/CONTEXT.md](./docs/architecture/CONTEXT.md) first.

More detail, including the "do not duplicate an existing abstraction" rules, is
in [docs/REPOSITORY_MAP.md](./docs/REPOSITORY_MAP.md).

## How Skills and Tools work

- **Skills** are pure instructions: a directory with a `SKILL.md`
  (frontmatter + markdown body). Nothing in a Skill is executed. CodeAtlas ships
  a loader (`@prof-bilal/atlas-toolkit`), an SDK service
  (`createSkillService`), CLI discovery (`atlas skills`, alias `atlas skill`),
  MCP tools (`list_skills`, `get_skill`), and delivery at launch
  (`atlas context launch --skill <id>`). Project Skills override built-ins of the
  same id.
- **Tools** are external executables/packages described by curated registry
  records. Installing is always gated: compatibility → security/trust →
  explicit approval → post-install verification + manifest. `atlas setup` shows
  what could be installed and installs only what the user selects.

Design details: [docs/architecture/AGENT_TOOLKIT.md](./docs/architecture/AGENT_TOOLKIT.md),
[docs/architecture/TOOL_REGISTRY.md](./docs/architecture/TOOL_REGISTRY.md),
[docs/reference/TOOL_MANIFEST.md](./docs/reference/TOOL_MANIFEST.md).

## Change workflow

1. **Inspect** the code and tests you are about to touch. Never assume the
   implementation matches the docs (or the plan).
2. **Plan** — one purpose per change. Architectural changes need an ADR in
   `docs/decisions/` plus human review (see
   [docs/contributing/CHANGE_POLICY.md](./docs/contributing/CHANGE_POLICY.md)).
3. **Implement** small, typed, scoped, reusing existing seams.
4. **Test** — add or adjust tests. Don't delete failing tests or weaken
   assertions; add a regression test for a bug.
5. **Run the gate**: `pnpm check` (typecheck + lint + format + tests).
6. **Document** — update the affected `docs/` file and
   [docs/FEATURE_STATUS.md](./docs/FEATURE_STATUS.md) if status changed.
7. **Report** — what changed, what you ran, known limitations, remaining work.

## Pull requests

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, …). Hooks enforce linting,
  formatting, typing, and commit conventions.
- One purpose per PR; keep the diff reviewable.
- `pnpm check` must pass, and docs must match reality. Never claim a feature is
  implemented without verifying it in code.
- Never commit secrets (`.env*`) or generated `.codeatlas/` artifacts, and never
  force-push or rewrite published history.

## Security

Read [docs/reference/SECURITY.md](./docs/reference/SECURITY.md) before touching
processes, paths, or provider calls. Do **not** open public issues for security
problems — report them privately (see [SECURITY.md](./SECURITY.md)).
