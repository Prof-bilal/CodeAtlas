# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases are not yet cut; everything is under **Unreleased**.

## [Unreleased]

### Added

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
- Hardened a flaky `ProcessRunner` SIGKILL-escalation test to poll for the
  escalated signal instead of a fixed sleep (assertions unchanged).

### Docs

- Rewrote the top-level `README.md`.
- New docs: `docs/installation.md`, `docs/getting-started.md`,
  `docs/configuration.md`, `docs/integrations.md`, `docs/troubleshooting.md`.
- New GitHub-facing files: root `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, and `docs/RELEASE_AUDIT.md` (pre-release
  audit: secrets scan, hygiene, quality gates, changeset).
- Corrected stale claims (incremental indexer, `atlas build`/`update`, MCP tool
  count, git-repository status) in `docs/CONTEXT.md`, `docs/CONTEXT_STORAGE.md`,
  `docs/CLI.md`, `docs/CONTEXT_SDK.md`, `docs/MCP.md`, `docs/MODULES.md`,
  `docs/VSCODE.md`, `docs/DEVELOPMENT.md`, `docs/CONTRIBUTING.md`.

### Fixed

- Windows: external AI CLI `.cmd`/`.bat` shims are now spawned correctly
  (`@atlas/agents` process layer).

### Security

- `go-tui-app/` (an unrelated experimental spike) is gitignored.

## Past work (pre-changelog)

Prior changes through 2026-08 are summarized in `docs/CURRENT_STATE.md`,
`docs/FEATURE_STATUS.md`, and the git history (Conventional Commits).