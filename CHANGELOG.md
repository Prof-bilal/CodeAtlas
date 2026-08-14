# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases are cut from the published `codeatlas-cli`; the changelog tracks the
npm versions.

## [0.2.1] - 2026-08-14

### Fixed

- `atlas --version` now reports the CLI's own version (read from
  `apps/cli/package.json` at build time) instead of the workspace placeholder
  `0.0.0`.

## [0.2.0] - 2026-08-14

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
- `docs/PUBLISHING.md` now documents the 0.2.0/0.2.1 release notes and the
  published-versions table.

### Fixed

- Windows: external AI CLI `.cmd`/`.bat` shims are now spawned correctly
  (`@atlas/agents` process layer).

### Security

- `go-tui-app/` (an unrelated experimental spike) is gitignored.

## Past work (pre-changelog)

Prior changes through 2026-08 are summarized in `docs/CURRENT_STATE.md`,
`docs/FEATURE_STATUS.md`, and the git history (Conventional Commits).