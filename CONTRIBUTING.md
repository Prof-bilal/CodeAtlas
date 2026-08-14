# Contributing to CodeAtlas

Thanks for wanting to contribute! The full practical guide (setup, coding
standards, tests, commits, PRs, security reporting) lives in
[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

Every coding agent working in this repository must also follow
[AGENTS.md](AGENTS.md) — it is the single source of truth for all agents
(Claude Code, OpenCode, Codex, Gemini CLI, Cursor, …).

## Quick checklist

1. Read [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) first — know what is
   implemented, partial, stubbed, or planned.
2. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
   [docs/MODULES.md](docs/MODULES.md) before touching more than one file.
3. Set up per [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) (Node 22, pnpm 9.15.0).
4. Gate every change with `pnpm check` (typecheck + lint + format + test).
5. Use [Conventional Commits](https://www.conventionalcommits.org/); one purpose
   per commit/PR; never force-push, reset, or delete other work; never commit
   secrets or generated `.codeatlas/` artifacts.

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for details and
[SECURITY.md](SECURITY.md) for security policies.