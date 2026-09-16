# CodeAtlas — Open Source Cleanup Report

**Commit:** `e14aad2` — `refactor: remove browser-control and benchmark subsystems, fix Skills discovery and setup UX`
**Pushed:** `origin/main` (`35f4ee9..e14aad2`)

---

## 1. Repository cleanup

| Action | Detail |
|---|---|
| **Deleted** | `packages/benchmark/`, `apps/server/`, `benchmarks/` (~3 GB of corpora: 7,323 files, −654,625 lines), `packages/common/`, `old-school/`, `validation/`, `.opencode/` planning files, root `CODEBASE-AUDIT-PLAN.md`, `docs/HARNESS_PLAN*`, `vitest.benchmark.config.mts`, `.github/workflows/retrieval-gates.yml`, ADR-012/013, browser layer (`BrowsePort`, SDK browse service, `atlas browse`, catalog `playwright-cli`/`playwright-mcp` entries, `.playwright-cli/`) |
| **Moved** | `docs/` reorganized (37 renames) into `architecture/`, `guides/`, `reference/`, `contributing/` with all cross-links rewritten; root audit plan → `docs/archive/` |
| **Consolidated** | Root planning/scratch `.md` files folded into the docs tree or removed; `.tmp/` audit scripts deleted |
| **Retained** | All 19 feature packages, all 13 prebuilt Skills, all normal unit/integration/CLI/SDK/MCP tests, MCP, VS Code extension, examples |

## 2. Architecture

**Before:** 21 packages + 2 apps; browser-control layer threaded through core/SDK/CLI/MCP; benchmark subsystem (`packages/benchmark` + `apps/server` API server + 3 GB `benchmarks/` corpora); untracked `atlas tui` v2; dozens of planning docs at the root.

**After (dependency direction: inward):**

```text
                 ┌─────────────┐    ┌─────────────┐
                 │  CLI (apps) │    │ MCP         │
                 └──────┬──────┘    └──────┬──────┘
                        └────────┬─────────┘
                          ┌──────▼──────┐
                          │     SDK     │   composition root
                          └──┬───┬───┬──┘
              ┌──────────────┤   │   └──────────────┐
        ┌─────▼─────┐  ┌─────▼───┴───┐      ┌──────▼─────┐
        │  Context  │  │   Toolkit   │      │ Agents etc.│
        │ (scan→    │  │ Tools+Skills│      └────────────┘
        │  search)  │  └──────┬──────┘
        └─────┬─────┘         │
              └────────┬───────┘
                ┌──────▼──────┐
                │    Core     │   ports + contracts
                └─────────────┘
```

19 packages remain, each behind a `core` port; nothing imports sideways. The
new structure is simpler because two experimental subsystems and their
transport/app/config scaffolding are gone, and the docs tree mirrors the
architecture instead of burying it.

## 3. Skills

- **13 prebuilt Skills**, each with a real `SKILL.md` (name, description,
  version, workflow, tools, output, verification, rules) in
  `packages/toolkit/src/skills/prebuilt/<name>/`.
- **Why `atlas skills` works now:** the root cause was a commander collision —
  the bare command printed help, and a parent-option name shadowed the
  subcommand flag, so the prebuilt library was never surfaced. `atlas skills`
  now defaults to listing the built-in + installed library, `atlas skills <name>`
  inspects one, and unknown ids error instead of silently listing.
- **Packaging verified:** `npm pack --dry-run` → 17 files, all 13
  `dist/skills/prebuilt/*/SKILL.md` present in the tarball.
- **Web-facing Skills re-pointed:** `ui-research`, `ui-check`, `ui-build`,
  `webapp-testing` now use the **agent's own web fetch/search** and the
  project's own tests; rendering-dependent checks are reported
  **could not run**, never guessed. A test enforces that no Skill body
  mentions `browser` or `playwright` at all.

## 4. Tools

One canonical tool catalog (`packages/toolkit/src/catalog.json`) merged with a
local overlay, behind `ToolRegistryPort`. Browser-specific entries
(`playwright-cli`, `playwright-mcp`) removed; generic tools (ripgrep, git, etc.)
kept. Installer/configurator/security gating unchanged.

## 5. Setup UX

```text
npm install -g codeatlas-cli     → CodeAtlas only (core CLI + SDK + MCP)
atlas setup                      → detects environment
                                 → shows recommended Tools/Skills (none selected)
                                 → user navigates/selects
                                 → installs ONLY what was selected, after confirm
                                 → validates
```

Verified via PTY run: `atlas setup` with no selections creates no `.codeatlas/`
state. Defaults to `none` — auto-install is impossible.

## 6. Browser removal

Removed: `BrowsePort` + adapter, SDK browse service + tests, `atlas browse`
command, catalog entries, browser-workflow capability references in Skills,
MCP budget/browser references, `.playwright-cli/`. **Zero** occurrences of
`playwright` in the built CLI bundle; grep-verified and asserted by a test.
No remaining active browser dependencies.

## 7. Benchmark removal

Removed: `packages/benchmark`, `apps/server`, `atlas benchmark` CLI command,
SDK/core benchmark surface, `vitest.benchmark.config.mts`, retrieval-gates
workflow, benchmark docs/plans, ADR-012/013, 3 GB `benchmarks/` corpus.
**Normal project tests fully preserved** — 132 test files still run.

## 8. Package validation

- `pnpm build` → success across all packages
- `npm pack --dry-run` (CLI) → 17 files, 1.1 MB: CLI bundle, MCP assets,
  tool catalog, **all 13 SKILL.md** files
- MCP smoke: starts, exposes 15 tools, none browser-related
- CLI smoke: `atlas skills` (list/inspect), `atlas setup` (no-op by default)

## 9. Tests

| Check | Result |
|---|---|
| typecheck (`pnpm typecheck`) | ✅ clean |
| eslint + biome lint | ✅ clean (4 latent lint errors fixed in `packages/usage` + SDK tests during commit) |
| format (`pnpm format`) | ✅ applied |
| tests (`pnpm test`) | ✅ **132 files, 1390 passed** (+5 new regression tests for skills discovery & setup) |
| build | ✅ success |
| pack validation | ✅ 13/13 SKILL.md shipped |
| CLI / Skill discovery / MCP validation | ✅ as above |

## 10. Remaining technical debt (pre-existing, not from this cleanup)

- Parser is **TypeScript-only**; renamed imports and `export default <expr>`
  do not resolve cross-file.
- `atlas tui` v2 and the slash-command router remain planned/untracked.
- Cosmetic: `atlas setup`'s "Recommended — installable (0)" heading reads
  slightly odd since the recommended tier is the built-in Skill library
  (which needs no install).

## 11. Git state

- Working tree clean; single reviewed commit `e14aad2` pushed to `origin/main`.
- Tagging note: CLI version is `0.5.0` and `CHANGELOG.md` records this as
  **[Unreleased]** — if you want this to *be* `v0.5.0`, cut it by moving the
  changelog section to `[0.5.0] - 2026-09-16`, then tag & push.
