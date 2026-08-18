# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases are cut from the published `codeatlas-cli`; the changelog tracks the
npm versions.

## [0.3.0-beta.0] - 2026-08-17

### Added

- **Agent Toolkit tier system** — `ToolTier` type (`recommended` / `optional` /
  `experimental` / `incompatible`) on every registry record; schema version 2;
  Top-10 executive recommendation in the catalog.
- **Catalog expanded to 56 tools** — 47 deduplicated Agent-Toolkit skills + 9
  foundational tools; all validated against schema version 2.
- **Skill adapter** — `skill` install type: shallow `git clone` of the canonical
  repository into `.codeatlas/skills/<name>/`, `verifyPath` post-install check,
  `git pull --ff-only` update, directory deletion on remove.
- **`atlas init` recommended-tools offer** — interactive prompt to install the
  Top-10 recommended tools; `--tools all|none|1,2,3` flag; injectable prompt
  for testing.
- **Category browsing** — `atlas tools categories` lists all tool categories;
  `--category <cat>` filter on `atlas tools` overview and `atlas tools search`.
- **Compatibility report in `atlas tools info`** — per-check ✓/✗/? verdict
  for OS, runtimes, AI agents, architecture, and permissions.
- **Real `atlas tools update`** — skills updated via `git pull --ff-only`;
  ecosystem tools re-installed through the approved adapter; `--approve` flag
  for blanket approval; per-tool status reporting.
- **Uninstall config-cleanup** — `atlas tools remove` calls
  `configurator.unconfigure()` to strip tool entries from agent config files
  (Claude, Gemini, Codex, OpenCode, MCP, VS Code).
- **Live doctor/health check** — `atlas tools doctor` runs the compatibility
  engine on each installed tool and reports the overall verdict.
- **Conflict detection** — `atlas tools doctor` detects installed tools sharing
  a package id and lists conflicts.
- **Dependencies and categories in `atlas tools info`** — surfaces declared
  dependencies and category tags.
- **User guide** — `docs/AGENT_TOOLKIT.md` §10 rewritten as a complete CLI
  reference with real commands, examples, and the Top-10 list.
- **Statement caching in SQLite repositories** — `@atlas/storage` and
  `@atlas/usage` now reuse one prepared statement per SQL via a shared
  `StatementCache` base class instead of `db.prepare()` per row. `node:sqlite`
  statements hold native memory until the connection closes, so the previous
  approach leaked ~2.5 GB of native RSS during `atlas init` on large
  repositories. Verified on a real 1000-file repo: peak RSS **4,274 MB → 1,698
  MB**, minimum available memory **23 MB → 1,361 MB**, wall time 241 s → 188 s.
  Root cause and fix documented in `benchmarks/extreme/benchmark.md` (§7).
- **Parser reference resolution performance and correctness** —
  `@atlas/parser` builds symbol lookup maps once per file (O(symbols) instead
  of a quadratic per-reference filter), drops unresolved identifier usages so
  a large corpus stays memory-bounded, and adds a configurable reference-line
  cap (`DEFAULT_MAX_REFERENCE_LINES = 20_000`). Regression tests cover renamed
  imports and `export default <expression>` cross-file resolution.
- **Extreme repository stress benchmark suite** — `benchmarks/extreme/`
  (deterministic repository generator, monitored runner with RSS/available-
  memory guards, MCP server test, `results.json`, and an honest report).
- **Project readiness plan** — `docs/PROJECT_READINESS_PLAN.md` (productization
  audit + phased plan) and `docs/PROJECT_CHECKLIST.md` (release checklist).

### Changed

- `apps/cli/package.json` now ships full npm metadata (description, author,
  license, repository, homepage, bugs, keywords).
- `@atlas/search` index building is more memory-efficient for large snapshots.
- `atlas tools info` now shows compatibility report, dependencies, and
  categories.
- `atlas tools doctor` now runs live compatibility checks and detects conflicts.
- `atlas tools remove` now cleans up agent configuration entries.
- `atlas tools update` now re-installs installed tools (skills via git pull,
  ecosystem via package manager) instead of reporting counts.

### Fixed

- Massive native memory leak during `atlas init`/`build` on large repositories
  (see **Added** — statement caching). The previous extreme-benchmark result of
  4,852 MB peak RSS / 23 MB minimum available memory no longer reproduces.

### Security

- No new surface: the statement cache applies existing repository queries
  unchanged; no shell execution introduced.

## [0.2.1] - 2026-08-14

### Added

- **Deterministic context ranking** — `@atlas/context` (`ContextBuilderService`)
  is implemented: it ranks search hits and resolves them to source-file
  `ContextItem`s (ADR-001). Previously a stub.
- **`atlas explain`** — deterministic explanation of a symbol/file/module/concept
  with cross-file references; `--ai` generates an AI summary when a provider is
  configured.
- **`atlas doctor`** — PASS/WARN/FAIL health checklist (Node version, index,
  freshness, manifest, agents, MCP, providers); exit 1 on FAIL. Never prints
  credentials.
- **`atlas sessions stop` token impact** — reports burned tokens, estimated
  without-CodeAtlas baseline, and saved tokens for the session, with
  `unknown` fallbacks; `atlas context launch` records a best-effort usage event.
- **Incremental indexer** — `atlas update` re-reads and re-parses only
  changed/added TypeScript files, reuses the persisted snapshot for unchanged
  files, carries over usage edges, deletes removed files, prunes stale folder
  modules, and merges via `updateContext` (`@atlas/sdk` `indexProject`).
- **Context freshness** — `createContextSDK(...).freshness()` reports
  `fresh`/`stale`/`unknown`/`unavailable` against the working tree with the
  changed/added/deleted file lists.
- **Version-aware range reads** — `files.readRange(path, { startLine, endLine,
  padding?, expectedHash? })` reads the working tree and flags
  `versionMatch: false` / `stale` when context has drifted.
- **MCP `read_file_range` tool** — the MCP server now exposes 7 read-only tools.
- **`atlas scan`** — hierarchical project overview (files, folders, languages,
  framework) with no indexing, via `scanProjectOverview()` from the SDK.
- **Context SDK `repositoryPath` resolution for MCP** — the MCP server now
  resolves relative paths and staleness against the project root, not `cwd`.
- **`atlas search --repo <path>`** — search now accepts the repository path
  option like the other project commands (previously only
  `ATLAS_ROOT`/`cwd`).

### Changed

- `atlas init`/`build`/`update` now run the SDK-owned indexer (previously the
  `build`/`update` commands were "Coming Soon" placeholders).
- Removed the obsolete `apps/cli/src/commands/{init,build,update}.ts` placeholders
  (superseded by `commands/indexing.ts`).
- The interactive TUI (`atlas tui`) is **v2 / not shipped** — its source is
  git-untracked so fresh clones build without it; bare `atlas` prints help.
- Hardened a flaky `ProcessRunner` SIGKILL-escalation test to poll for the
  escalated signal instead of a fixed sleep (assertions unchanged).

### Fixed

- `atlas --version` now reports the CLI's own version (read from
  `apps/cli/package.json` at build time) instead of the workspace placeholder
  `0.0.0`.
- Windows: external AI CLI `.cmd`/`.bat` shims are now spawned correctly
  (`@atlas/agents` process layer).

### Docs

- Rewrote the top-level `README.md` (status claims now reflect the implemented
  `@atlas/context`, `atlas explain`, and `atlas doctor`; the published global
  install is the primary path).
- New docs: `docs/installation.md`, `docs/getting-started.md`,
  `docs/configuration.md`, `docs/integrations.md`, `docs/troubleshooting.md`.
- New GitHub-facing files: root `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, and `docs/RELEASE_AUDIT.md` (pre-release
  audit: secrets scan, hygiene, quality gates, changeset).
- Corrected stale claims (incremental indexer, `atlas build`/`update`, MCP tool
  count, git-repository status) in `docs/CONTEXT.md`, `docs/CONTEXT_STORAGE.md`,
  `docs/CLI.md`, `docs/CONTEXT_SDK.md`, `docs/MCP.md`, `docs/MODULES.md`,
  `docs/VSCODE.md`, `docs/DEVELOPMENT.md`, `docs/CONTRIBUTING.md`.

### Security

- `go-tui-app/` (an unrelated experimental spike) is gitignored.

## Past work (pre-changelog)

Prior changes through 2026-08 are summarized in `docs/CURRENT_STATE.md`,
`docs/FEATURE_STATUS.md`, and the git history (Conventional Commits).