# Contributing to CodeAtlas

Practical guide for humans (and agents) making changes. It intentionally
**points** at the deeper policies instead of restating them — read the linked
docs when you reach that step.

> The repository **is** a git repository (branch `main`). Use the normal
> fork/branch/PR workflow, keep commits' intent clear and
> Conventional-Commit-shaped, and never force-push or rewrite history.

---

## 1. Getting started

1. Follow [DEVELOPMENT.md](./DEVELOPMENT.md) to install and run `pnpm check`
   from the repo root (Node ≥ 22.5.0 — the shared `node:sqlite` floor).
2. Read the docs navigation map: [DOCUMENTATION_MAP.md](./DOCUMENTATION_MAP.md).
3. Read [CURRENT_STATE.md](./CURRENT_STATE.md) before touching code — know what
   is implemented, partial, stubbed, or planned.

## 2. Architecture expectations

- Clean architecture: contracts in `packages/core`, implementations in feature
  packages, composition in `packages/sdk`. See [ARCHITECTURE.md](./ARCHITECTURE.md).
- Module ownership is strict: [MODULES.md](./MODULES.md). Don't cross
  boundaries, and don't duplicate an existing abstraction — extend it.
- Dependency direction is **enforced by ESLint**
  (`no-restricted-imports`): feature packages import only `core` + `shared`;
  `cli` imports only `sdk` (+ `mcp`); `mcp` and `apps/extension` import only
  `sdk`. See [DEPENDENCIES.md](./DEPENDENCIES.md).
- Context consumers read through **`createContextSDK`** — never the database.
  See [CONTEXT_SDK.md](./CONTEXT_SDK.md).

## 3. Coding standards

Follow [CODE_QUALITY.md](./CODE_QUALITY.md) and
[CHANGE_POLICY.md](./CHANGE_POLICY.md):

- TypeScript **strict**; no `any`; small functions; intentional error handling
  (`Result`/`ok`/`fail` for expected outcomes, throws for programming errors).
- Keep changes scoped to one purpose; prefer small additive changes.
- Architectural changes: write an ADR in `docs/decisions/` (see the ADR README
  for the format) and get human approval before implementing.

## 4. Tests

Follow [TESTING.md](./TESTING.md):

- Every meaningful module has tests; add/adjust tests for your change.
- Mock external AI CLIs and provider transports — **no live network** and no
  provider credentials in the suite.
- Do **not** delete failing tests or weaken assertions to make CI pass.
- The gate is `pnpm check` (typecheck + lint + format + test).

## 5. Committing & PRs

- **Git metadata is present in the current workspace.** Preserve history and
  avoid destructive operations:
  - Use [Conventional Commits](https://www.conventionalcommits.org/)
    (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, …). Hooks enforce this.
  - One purpose per commit/PR.
  - Never force-push, reset, or delete other work.
  - Never commit secrets (`.env*`) or generated `.codeatlas/` artifacts.

## 6. Documentation

The docs are part of the product:

- If you change a contract/API/ownership, update the relevant `docs/` file and
  the maps/indexes that reference it ([DOCUMENTATION_MAP.md](./DOCUMENTATION_MAP.md),
  [docs/README.md](./README.md)).
- If feature status changes, update [FEATURE_STATUS.md](./FEATURE_STATUS.md)
  and add a line to [CURRENT_STATE.md](./CURRENT_STATE.md) noting change.
- **Never claim a feature is implemented unless you verified it in code.** Use
  the status tags carefully ([FEATURE_STATUS.md](./FEATURE_STATUS.md)).

## 7. Security

Read [SECURITY.md](./SECURITY.md) before touching anything that runs processes,
handles paths, or talks to providers. Highlights: array-argument spawns (no
`shell: true` without a documented reason), validate every untrusted input
(repo contents, MCP args, provider responses), never log/commit secrets, no
implicit uploads (see [PRIVACY.md](./PRIVACY.md)).

## 8. Security reporting

If you find a security issue (a provider key leak, a path traversal in the
scanner/MCP input, an unsafe process invocation, an injection risk), do **not**
open a public issue. Email the maintainers privately at
**hb048231@gmail.com** (or use GitHub private vulnerability reporting) — see
the responsible disclosure guidance in [SECURITY.md](./SECURITY.md).
