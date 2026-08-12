# AGENTS.md

> **This file is the single source of truth for *all* coding agents working in
> this repository** — Claude Code, OpenCode, Codex, Gemini CLI, Cursor, and any
> other tool. All rules below are mandatory. Detailed technical context lives in
> `docs/`; this file stays concise and points into it.

---

## 1. Project

**CodeAtlas** is an open-source **AI Context Engine** (Direction A — implemented),
a **Unified AI CLI Orchestrator** (Direction B — mostly planned), and an
**Agent Toolkit** (Direction C — partially implemented). It scans, parses, and indexes a
source tree into a queryable, persistent context database, exposes that context
to developer tools and AI agents, and can later route work to installed AI
coding CLIs (`/claude`, `/gemini`, `/codex`, `/opencode`, …) and curated
open-source tools.

It is a **pnpm + TypeScript monorepo** (packages `@atlas/*` in `packages/`, a
CLI in `apps/cli`, and a VS Code extension in `apps/extension`). Clean
architecture: contracts in `packages/core`, implementations in feature
packages, composition in `packages/sdk`. Each feature package implements a
`core` port. The CLI, MCP, and the VS Code extension consume **only**
`@atlas/sdk` (plus `@atlas/mcp` for `atlas mcp`). Dependency direction is
enforced by ESLint (`no-restricted-imports`) — see `docs/DEPENDENCIES.md`.

## 2. Current state — read this first

**`docs/CURRENT_STATE.md` is the arbiter of what actually exists.** Read it
before doing anything. Its companion `docs/FEATURE_STATUS.md` is the feature
status table. Never assume planned features exist; verify against code.

Non-obvious facts (verified as of 2026-08-11):

- `@atlas/context` (context ranking/assembly) is **intentionally a stub** — its
  methods throw `ComingSoonError` by design (ADR-001). Do **not** "fix" it.
- The CLI has **ten** subcommands. `atlas search`, `atlas mcp`,
  `atlas sessions`, `atlas usage`, and `atlas tools configure` are wired
  (through the **Context SDK**,
  `@atlas/mcp`, `createSessionManager()`, and `createUsageService()`
  respectively); `init`/`build`/`update`/`explain`/`doctor` still print
  "Coming Soon".
- **`createContextSDK` (`@atlas/sdk`)** is the single read interface consumers
  (CLI, MCP, VS Code extension, agents) use to read indexed context. Consumers
  must **not** reach for the SQLite database, `@atlas/search`,
  `@atlas/storage`, or `@atlas/summary` directly. **AI usage/credits**
  (`@atlas/usage`, tri-state actual/estimated/unknown tokens & cost,
  budgets/limits) is likewise reached **only** through the SDK
  (`createUsageService`) — see `docs/USAGE.md` (ADR-009); its store
  (`.codeatlas/usage.db`) is separate from the context database.
- **MCP (`@atlas/mcp`) and the VS Code extension (`@atlas/extension`) are
  implemented** thin SDK consumers. The **Agent Orchestrator (Direction B)** is
  mostly planned — the narrow **AI CLI connection layer (`@atlas/agents`,
  behind `AgentPort`)** and the **Agent Session Manager** (behind `SessionPort`,
  composed via `createSessionManager()` in `@atlas/sdk`, surfaced as
  `atlas sessions`) are implemented. No agent router, no `/agents` commands, no
  slash commands — those remain **[PLANNED]**. See
  `docs/AGENT_SESSIONS.md` (ADR-007).
- **Context → Agent integration (`@atlas/sdk`'s `context-integration` module,
  `createContextIntegration()`, ADR-008) is implemented**: it assembles a
  budgeted, deny-filtered, provider-independent `ContextPackage` per task (from
  `createContextSDK`, never the DB directly) and delivers it through the session
  manager (`launch`/`attach` via `SessionPort`). No CLI `atlas context` command
  is wired yet — the follow-up.
- **Direction C — the Agent Toolkit (`@atlas/toolkit`, `atlas tools`)**: the
  **Tool Registry foundation (Task 19) is implemented** — `@atlas/toolkit`
  behind `ToolRegistryPort` in `core`, composed via `createToolRegistry()` in
  `@atlas/sdk`: a curated, schema-validated, provenance-auditable catalog
  (`packages/toolkit/src/catalog.json`) merged with a local overlay. **The Tool
  Manifest System (Task 20) is implemented** — a versioned, validated,
  extensible schema (`TOOL_MANIFEST_SCHEMA_VERSION = 1`) recording one
  installed tool's state, persisted per tool in `.codeatlas/tools/<name>.json`
  mirroring the Scanner manifest pattern, loaded as untrusted input (never
  executed, prototype-pollution safe, size-bounded, path-safe names). See
  `docs/TOOL_MANIFEST.md`. **The Compatibility Engine (Task 21) is
  implemented** — `@atlas/toolkit` behind `CompatibilityPort` in `core`,
  composed via `createCompatibilityEngine()` in `@atlas/sdk`: evaluates a
  tool's declared requirements (OS/architecture/runtimes/package manager/AI
  CLIs via `AgentPort`/MCP/permissions) against the detected, injectable
  environment (`EnvironmentDetector`); never installs anything and **never
  fails open** — `incompatible` ⇒ not installable here, `unknown` flagged never
  guessed, declared permissions advisory. See `docs/AGENT_TOOLKIT.md` §6. **The
  Tool Installer (Task 22) is implemented** — `@atlas/toolkit` behind
  `InstallerPort` in `core`, composed via `createInstaller()` in `@atlas/sdk`:
  a safe MVP subset (`npm`, `pip`, `cargo`, `go`) installs through **official
  distribution channels only**; every command is an **argument-array spawn**
  (`shell:false`, never a shell string — adversarial tests assert this);
  **approval is always required**; the compatibility (Task 21) and security
  (`blocked` → refuse) gates run before anything; post-install verification +
  Tool Manifest provenance + best-effort rollback. **The Tool Configurator
  (Task 23) is implemented** behind `ConfiguratorPort`, with per-target
  adapters, AgentPort-backed detection, safe user-config merge/backup/rollback,
  verification, dry-run, SDK composition, and `atlas tools configure`.
  **Security/Trust evaluation (Task 24) is implemented** behind `SecurityPort`:
  offline per-check risk assessment, exact five trust states, hostile-input
  rejection, fail-closed installer gating, and explicit unverified override
  recording. Design contract:
  `docs/AGENT_TOOLKIT.md`; registry details:
  `docs/TOOL_REGISTRY.md`.
- Pipelines that are implemented and tested: scanner, hashing, manifest,
  parser (TypeScript only — **[PARTIAL]**), graph, SQLite storage, search,
  summaries, cache, providers. Parser known gaps: renamed imports and
  `export default <expr>` do not resolve cross-file.
- Storage uses `node:sqlite` (needs Node `>=22.5.0`); every other package
  targets `>=20.19.0`.
- This is **not a git repository** (no `.git`). Husky/commitlint are configured
  but inactive.

## 3. Architecture & consumers

Read `docs/ARCHITECTURE.md` (canonical) and `docs/MODULES.md` (ownership)
before touching more than one file. Key rules:

- Dependencies point **inward**: `cli → sdk → feature packages → core → shared`.
- Feature packages import **only** `core` + `shared`; `cli` imports only
  `sdk` (+ `mcp`); `mcp` and `apps/extension` import only `sdk`. Enforced by
  ESLint. See `docs/DEPENDENCIES.md`.
- The indexing pipeline data flow is
  `scanner → hashing → parser → graph → storage → search → SDK` — see
  `docs/CONTEXT.md` for how CodeAtlas understands a repository.
- Everyone reads context through **`createContextSDK`** (`docs/CONTEXT_SDK.md`).
  The CLI must not query the database, MCP must not query the database, the VS
  Code extension must not query the database, and agents must never bypass the
  Context SDK. Persistence belongs to `@atlas/storage` repositories; provider-
  specific logic belongs inside provider adapters; process/agent management
  (when it ships) belongs behind the planned orchestrator.

## 4. Rules — mandatory for every change

### 4.1 Inspect before you change anything
Read the actual code **and tests** of the modules you will touch. Never assume
the implementation matches the plan, the docs, this file, or
`docs/CURRENT_STATE.md`. Search for existing implementations before creating
new services, repositories, utilities, database access, parsers, adapters, or
configuration systems. **If an existing abstraction can solve the problem,
extend it instead of creating a parallel implementation.**

### 4.2 Preserve the architecture
Keep the dependency matrix, port seams, and per-package ownership intact.
Changing architecture = a documented ADR (`docs/decisions/`) + human review.
Do **not** randomly refactor or redesign working systems.

### 4.3 Do not duplicate or reinvent
Before writing a new module/class, look for one that already does the job
(`@atlas/cache`, the parser registry, `ContextStore`, `createContextSDK`,
repository classes, `Result`, branded types, …). Reuse; do not fork.

### 4.4 Database rules
The context database is owned by `@atlas/storage`. **Do not modify the schema
casually.** Before any database change: inspect the schema (`src/schema.ts`,
`src/migrations.ts`), the migration/versioning approach, every repository that
touches the tables, and the tests. Prefer additive, backward-compatible
migrations. Respect the `node:sqlite` engine requirement. All queries go
through repositories — never ad-hoc SQL.

### 4.5 Context rules
Context is the product. Do not rescan the entire repository unnecessarily;
respect file hashing and snapshots; preserve incremental updates; never bypass
the Context SDK; do not create duplicate context storage in another package;
do not invalidate existing context without a good reason. See
`docs/CONTEXT.md` and `docs/CONTEXT_STORAGE.md`.

### 4.6 AI provider rules
Provider behavior is **quarantined in adapters** (`@atlas/providers`); the rest
of the app sees only `ProviderPort`. Do **not** assume all providers share CLI
arguments, features, authentication, or context-injection behavior. Never leave
`if (provider === "...")` switches outside adapters. Default model ids are
best-effort placeholders — prefer explicit `model`.

### 4.7 Process execution (security-critical)
Avoid shell execution when unnecessary. Prefer `spawn(file, argsArray)` over
`spawn(..., { shell: true })` and `exec(shellString)`. Validate paths, never
build a shell string from repository-derived or AI-generated content, never
execute arbitrary repository content automatically. Never introduce
`shell: true` without a documented reason. See `docs/SECURITY.md`.

### 4.8 File-system rules
Respect `.gitignore` and ignored `.codeatlas/`. Never access `.env*`,
credentials, or private keys found in a repository. Handle symlinks, binary
files, and large files carefully. Never assume every repository file is safe to
send to an external AI provider. See `docs/SECURITY.md`.

### 4.9 Secrets & privacy
Never log or print API keys, tokens, or provider config values. Never commit
`.env*`. Provider calls are **user-configured and explicit**; they send narrow,
relevant context — never implicit whole-repository uploads. See
`docs/SECURITY.md` and `docs/PRIVACY.md`.

### 4.10 Testing
Add or adjust tests per `docs/TESTING.md`. A task is not done until the relevant
tests pass. Do **not** delete failing tests to make the suite pass; do **not**
weaken assertions. Add regression tests for bugs. Mock external AI CLIs and
provider transports in unit tests; normal tests require **no** provider
credentials and **no** network.

### 4.11 Change scope
One purpose per change; do not rewrite unrelated modules, the whole
architecture, or every dependency. Prefer small change → test → verify →
continue over rewrite-everything. Do not replace a working implementation
simply because another approach looks cleaner.

### 4.12 Documentation & claims
Never claim a feature is implemented without checking the code. Distinguish
**[IMPLEMENTED]** / **[PARTIAL]** / **[EXPERIMENTAL]** / **[PLANNED]** /
**[DEPRECATED]**. When you implement a significant feature or change the
architecture/ownership/feature-status, update the relevant `docs/`. `docs/`
is the source of truth and must reflect reality.

### 4.13 Git & safety
No repository operations that destroy work (no force-push, branch deletion,
history reset). Do not modify files unrelated to the current task. Never commit
secrets.

## 5. Workflow

1. Read this file.
2. Read `docs/CURRENT_STATE.md` and `docs/DOCUMENTATION_MAP.md` (find the doc
   you need).
3. Read the relevant `docs/` for the module(s) you'll touch.
4. Inspect the implementation (source + tests) and its dependency implications.
5. Plan (write an ADR for architectural changes).
6. Implement — small, typed, scoped, reusing existing abstractions.
7. Test — `pnpm check` (typecheck + lint + format + test). Add/adjust tests.
8. Document — update the affected docs and `docs/FEATURE_STATUS.md` if status
   changed.
9. Review — self-review vs `docs/CODE_QUALITY.md`, `docs/SECURITY.md`, and
   `docs/CHANGE_POLICY.md`.
10. Report — per `docs/DEVELOPMENT_WORKFLOW.md`: files changed, what changed,
    tests run/passed, known limitations, remaining work.

## 6. Where things live

- Docs index & navigation: `docs/DOCUMENTATION_MAP.md`.
- Current state / feature status: `docs/CURRENT_STATE.md`,
  `docs/FEATURE_STATUS.md`.
- Canonical architecture: `docs/ARCHITECTURE.md` (root `ARCHITECTURE.md` is a
  pointer).
- Module ownership: `docs/MODULES.md`. Dependency matrix: `docs/DEPENDENCIES.md`.
- How the repo is understood: `docs/CONTEXT.md`; the on-disk `.codeatlas/`
  layout: `docs/CONTEXT_STORAGE.md`.
- Reader-facing API: `docs/CONTEXT_SDK.md`.
- Integrated consumers: `docs/MCP.md` (`@atlas/mcp`), `docs/VSCODE.md`
  (`@atlas/extension`).
- Security / privacy / testing / quality / process:
  `docs/SECURITY.md`, `docs/PRIVACY.md`, `docs/TESTING.md`,
  `docs/CODE_QUALITY.md`, `docs/CHANGE_POLICY.md`.
- Development setup: `docs/DEVELOPMENT.md`. Contributing: `docs/CONTRIBUTING.md`.
- Implemented analysis agents: `docs/AGENT_CATALOG.md`.
- Agent Toolkit design/current state: `docs/AGENT_TOOLKIT.md`.
