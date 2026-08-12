# CodeAtlas Dependency Rules & Policy

Two things are covered here: **(1)** the allowed dependency direction between
`@atlas/*` packages (enforced by ESLint), and **(2)** the policy for adding new
dependencies (any package manager).

---

## 1. Allowed dependency directions

The rules below are enforced by ESLint `no-restricted-imports` (see
`eslint.config.mjs`, `DEPENDENCY_MATRIX`). The canonical matrix:

| Package    | May import                                                     | May NOT import |
| ---------- | -------------------------------------------------------------- | -------------- |
| `shared`   | *(none)*                                                       | every other    |
| `core`     | shared                                        | every other    |
| `scanner`  | core, shared                                                   | everything else |
| `hashing`  | core, shared                                                   | everything else |
| `parser`   | core, shared                                                   | everything else |
| `graph`    | core, shared (dev: parser, tests only)                         | everything else |
| `storage`  | core, shared                                                   | everything else |
| `cache`    | core, shared                                                   | everything else |
| `providers`| core, shared                                                   | everything else |
| `summary`  | core, shared                                                   | everything else |
| `search`   | core, shared                                                   | everything else |
| `usage`    | core, shared                                                   | everything else |
| `context`  | core, shared                                                   | everything else |
| `agents`   | core, shared                                                   | everything else |
| `toolkit`  | core, shared                                                   | everything else |
| `sdk`      | shared, core, hashing, scanner, parser, storage, graph, context, cache, providers, summary, search, usage, agents *(`agents` was added when the SDK composed the connection layer for the session manager — ADR-007; `usage` when it composed the usage service — ADR-009)* | — |
| `cli`      | `sdk`, `mcp`                                                   | every other `@atlas/*` feature package |
| `mcp`      | `sdk`                                                          | every `@atlas/*` feature package |

Rules that follow:

1. **No cycles.** `core` and `shared` never import upstream packages.
2. **No sideways coupling.** Feature packages never import each other's concrete
   classes; the **SDK** composes them.
3. **`cli` touches the SDK and the MCP package only.** The CLI must never import
   `parser`, `scanner`, etc. Its single additional allowed dependency is
   `@atlas/mcp`, so it can start the MCP server (`atlas mcp`) — MCP itself
   imports only `@atlas/sdk`, and so does the VS Code extension
   (`apps/extension` / `@atlas/extension`). Future editor integrations will
   follow the same rule (SDK only).
4. Feature packages **implement** `core` ports; they never depend on concrete
   classes from other feature packages.
5. **`@atlas/usage`** (Usage & Credits) is a feature package: it may import
   **only** `core` + `shared`; the SDK composes it as `createUsageService()` and
   consumers (CLI) reach it via the SDK, never the store/repositories directly.
   See [USAGE.md](./USAGE.md) + ADR-009.
6. **`@atlas/toolkit`** (Agent Toolkit) is a feature package: it imports
   **only** `core` + `shared` (the Registry, Manifest, Compatibility Engine,
  Installer, Configurator, and Security/Trust are implemented),
   reads CodeAtlas context through the **Context
   SDK**/port seams, and is composed behind its ports by `@atlas/sdk`
   (`createToolRegistry`).
   `atlas tools configure` and future `atlas tools`/`atlas setup` commands delegate to the SDK and must
   **not** import `@atlas/toolkit` directly. See
   [AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md) + [TOOL_REGISTRY.md](./TOOL_REGISTRY.md)
   + [TOOL_MANIFEST.md](./TOOL_MANIFEST.md).
7. **Cross-package types** are imported with `import type` to avoid runtime
   coupling (enforced: `@typescript-eslint/consistent-type-imports`).

### Forbidden patterns (reject in review)

```
Scanner → AI            ✗ (scanner must not call providers)
Scanner → CLI           ✗ (scanner is a library, not a UI)
Parser → MCP            ✗ (MCP is a client layer)
Database → CLI          ✗ (storage has no UI knowledge)
AI → Scanner            ✗ (summaries consume scanner output, never control it)
```

> The **one documented exception** in the current code: `@atlas/graph` keeps a
> copy of module-path resolution (`module-resolution.ts`) that also exists in
> `@atlas/parser` — a deliberate decoupling so graph never imports parser at
> runtime. If a shared home is ever introduced in `core`, that duplication
> should be removed.

---

## 2. The dependency-addition checklist

Before adding **any** dependency (runtime or dev, npm or otherwise), answer
every question:

1. **Is it actually necessary?** Can the existing code accomplish the task?
2. **Can the standard library solve it?** Node built-ins are preferred
   (`node:crypto`, `node:fs`, `node:sqlite`, global `fetch`, …).
3. **Is it actively maintained?** Check publish date, issues, and the
   maintenance bus factor.
4. **Is the license compatible?** Must fit the MIT Open Source ethos. No
   AGPL/viral API incompatibilities without review.
5. **Does it meaningfully increase project complexity?** Small, focused
   utilities are fine; framework bundles are not.
6. **Does it duplicate existing functionality?** e.g. a "cache library" when
   `@atlas/cache` exists, or a command parser when `commander` is already
   declared.

Do **not** install packages simply because they are popular.

> The only non-workspace runtime dependencies today are **`commander`** (CLI)
> and **`ts-morph`** (TypeScript parsing) — both justified and narrow.

### Adding a dependency procedure

1. Document it in the affected package's `package.json`.
2. Add a one-line rationale in the PR description and optionally the relevant doc.
3. `pnpm install`, run `pnpm check`, and ensure the lockfile diff is minimal.
4. State in the PR why it passes the six-question checklist.

### Transitive-dependency care

- Audit new transitive packages (`pnpm why`, lockfile review) — supply-chain
  hygiene matters on a developer tool that runs on users' machines.
- Pin major versions deliberately; keep engine ranges compatible with
  `>=20.19.0` (storage caveat: `node:sqlite` needs `>=22.5.0`).
