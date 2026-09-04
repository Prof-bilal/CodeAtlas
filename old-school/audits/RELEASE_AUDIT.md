# CodeAtlas Release Audit

Pre-release audit for the open-source hand-off: secrets, hygiene, quality
gates, and what actually ships in this changeset. Companion to
[CHANGELOG.md](../CHANGELOG.md) ([Unreleased]) and `docs/FEATURE_STATUS.md`.

> Audit run 2026-08-14 against the `main` branch working tree.

---

## 1. Secrets & credential hygiene — PASS

- **No `.env*` files** are tracked or present anywhere in the workspace
  (searched both tracked and untracked files).
- **No API keys, tokens, or provider credentials** are present in source,
  docs, or fixtures.
- The only keys that exist are **documented example values** inside test
  fixtures, e.g. the AWS-documented example access key
  `AKIAIOSFODNN7EXAMPLE` and fake `sk-abc…` strings used to prove
  round-tripping. None are real.
- `.gitignore` excludes `.env*`, `.codeatlas/`, and build artifacts
  (`node_modules/`, `dist/`, `*.tsbuildinfo`).

## 2. Repository hygiene — PASS

- Dead CLI stubs removed (`apps/cli/src/commands/{init,build,update}.ts`);
  the real implementation lives in the SDK-owned indexer and
  `apps/cli/src/commands/indexing.ts`.
- `go-tui-app/` (an external, uncommitted experiment) is excluded via
  `.gitignore`, and `eslint.config.mjs` ignores `go-tui-app/**` so `pnpm lint`
  is green locally.
- Git metadata, husky/commitlint (Conventional Commits) and a CI workflow
  (`.github/workflows/ci.yml`) are present.

## 3. Quality gates — PASS

| Gate | Command | Result |
| ---- | ------- | ------ |
| Typecheck | `pnpm typecheck` (via `pnpm check`) | pass |
| Lint | `pnpm lint` (via `pnpm check`) | pass |
| Format check | `pnpm format:check` (via `pnpm check`) | pass |
| Tests | `pnpm test` | **78 files / 737 tests pass** |
| Build | `pnpm build` (all packages + CLI bundle) | pass |
| CLI smoke | `init` → `search --repo` → `update` (no-op) → `context --repo` on a scratch repo | works end-to-end |

One pre-existing flaky timing test (`ProcessRunner` SIGKILL escalation,
`packages/agents/tests/process.test.ts`) was **hardened, not weakened**: it
now polls for the escalated signal with a bounded deadline instead of a fixed
40 ms sleep, so it no longer races under parallel load. It still asserts
`SIGKILL` is sent and `timedOut` is true.

## 4. What ships in this changeset

- **Incremental indexing** — `@atlas/sdk` `indexProject` re-parses only
  `changed`/`added` files; `update` merges (`updateContext`) instead of
  replacing, prunes removed folder modules, and reports
  `+`/`~`/`-`/`=` counters. Verified by `packages/sdk/tests/freshness.test.ts`
  (Test A stale→refresh, Test B 60-file budget, Test C line-drift +
  version-aware range reads).
- **Freshness signals** — `createContextSDK.freshness()` /
  `detectFreshness` and a `fresh`/`stale`/`unknown` status; `ReadRangeRequest`
  carries `expectedHash` and `readRange` fails on drift (`FileChangedError`).
- **MCP `read_file_range`** tool — 7th MCP tool, version-aware reads with
  `expectedHash`, cross-platform `read_lines`-style ranges.
- **`atlas scan`** — metadata-only project overview
  (`scanProjectOverview`: files/folders, languages, framework, tree),
  added as the CLI's 13th command.
- **`atlas search --repo <path>`** — the search command now accepts the
  repository path flag like every other project command (previously it only
  honored `ATLAS_ROOT`/cwd, while the README advertised `--repo`).
- **Windows `ProcessRunner` fix** — npm `.cmd`/`.bat` shims are launched
  through `cmd.exe` with argument-array spawn (`shell:false`); no shell
  string is ever built from user/repository input.
- **Docs rewrite** — new root `README.md` plus
  `docs/{installation,getting-started,configuration,integrations,troubleshooting}.md`,
  root `CONTRIBUTING.md`/`SECURITY.md`/`CODE_OF_CONDUCT.md`/`CHANGELOG.md`,
  and stale-claim fixes across `docs/{CLI,CONTEXT,CONTEXT_SDK,CONTEXT_STORAGE,
  MCP,ARCHITECTURE,MODULES,VSCODE,CURRENT_STATE,CONTRIBUTING,DEVELOPMENT,
  DOCUMENTATION_MAP,README}.md`.

## 5. Known limitations (unchanged)

- Parser: renamed imports and `export default <expr>` do not resolve
  cross-file.
- The interactive `atlas tui` is v2 / not shipped (untracked source).
- No embedding/vector search — the `RelevanceScorer` seam exists but is not
  populated.
- Storage requires Node `>=22.5.0` (`node:sqlite`); other packages target
  `>=20.19.0`.

## 6. Release checklist status

- [x] Secrets scan (no credentials, no `.env`)
- [x] `pnpm check` green (typecheck + lint + format + 737 tests)
- [x] `pnpm build` green
- [x] CLI smoke test (init/search/update/context/scan on scratch repo)
- [x] Flaky test hardened
- [x] CHANGELOG [Unreleased] populated
- [x] Commit all changes on `main` with Conventional Commits