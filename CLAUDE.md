# CLAUDE.md — Claude Code Operating Notes

This file is a thin layer for Claude Code **only**. It does **not** duplicate
the repository rules — **`AGENTS.md` is authoritative** for project-wide
rules and instruction. Read `AGENTS.md` first; everything there applies here.

---

## Starting work

1. `AGENTS.md` is authoritative for repository rules. If anything here or in
   `docs/` seems to conflict, `AGENTS.md` + `docs/CURRENT_STATE.md` win.
2. Read the relevant `docs/` before implementation — start with
   `docs/DOCUMENTATION_MAP.md` to find the right file.
3. Inspect the existing code and tests before editing. Never assume planned
   features exist (`docs/CURRENT_STATE.md` is the arbiter).

## Non-obvious things to remember about this codebase

- **`@atlas/context` is implemented** as a deterministic rank-and-assemble
  step (`ContextBuilderService` behind `ContextBuilderPort`, ADR-001). It ranks
  search hits and resolves them to source-file `ContextItem`s — no AI. Do not
  revert it to a stub.
- **The CLI is wired.** `atlas search` opens `.codeatlas/context.db` (root from
  `ATLAS_ROOT` or cwd) and prints ranked hits via `createContextSDK`; `atlas
  mcp` starts the MCP server (`@atlas/mcp`). `init`/`build`/`update` run the
  SDK indexer; `explain` resolves deterministically (AI summary only via
  `--ai`); `doctor` runs a health checklist. The interactive `atlas tui` is
  **v2 / not shipped** (untracked source). `atlas tools configure <tool>` is
  wired through `createConfigurator()` and supports installed-target detection
  plus `--dry-run`.
- **Context is read through `createContextSDK` (`@atlas/sdk`)** — by `atlas
  search`, the MCP tools, and the VS Code extension (`@atlas/extension`). Do not
  open `.codeatlas/context.db` or use `@atlas/search`/`@atlas/storage` directly
  in consumers (see `docs/CONTEXT_SDK.md`).
- **MCP (`@atlas/mcp`) and the VS Code extension (`@atlas/extension`) are
  implemented** thin SDK consumers. **Direction B's Agent Orchestrator**
  (`/claude`, `/gemini`, agent router) is mostly planned — the
  narrow AI CLI connection layer (`@atlas/agents`, behind `AgentPort`) and the
  **Agent Session Manager** (`atlas sessions`, via `createSessionManager()`
  from `@atlas/sdk`) are implemented; the **router, slash commands, and
  interactive TTY session handling are not** — do not reference the router,
  `/agents`, or slash commands as existing (sessions themselves do exist; see
  `docs/AGENT_SESSIONS.md`).
- **Dependency direction is enforced by ESLint** (`no-restricted-imports`).
  Feature packages only import `core` + `shared`; the CLI imports only `sdk` +
  `mcp`; `mcp` and `apps/extension` import only `sdk`. See `docs/DEPENDENCIES.md`.
- **Storage uses `node:sqlite`** (Node built-in, needs Node `>=22.5.0`); other
  packages target `>=20.19.0`.
- Git metadata is present in the workspace; preserve history and avoid
  destructive git operations.

## How to work here

- Use existing abstractions (ports in `core`, services in each package,
  `Result`/`ok`/`fail` for expected outcomes).
- Keep changes scoped to the task; no unrelated edits or refactors.
- Add/adjust tests; run `pnpm check` (typecheck + lint + format + test) after
  changes.
- For architectural changes, write an ADR (`docs/decisions/`) and explain the
  trade-offs in your summary.
- **Never assume planned features exist** — verify against code and report
  reality honestly.
- Respect security/privacy (`docs/SECURITY.md`, `docs/PRIVACY.md`): no secrets,
  no implicit uploads, no unvalidated process/command execution.
