# CodeAtlas Codebase Audit Plan

> **Status:** PLANNED — not yet executed
> **Created:** 2026-09-15
> **Purpose:** Comprehensive scan of the entire CodeAtlas codebase to find gaps, loopholes, stale code, missing pieces, and structural issues — then fix them in ordered phases to make the codebase clean, consistent, and contributor-friendly.

---

## Executive Summary

CodeAtlas is a substantial TypeScript monorepo (567 files, 13,272 symbols, 21,297 dependency edges) with strong foundations but accumulated drift. This plan identifies **68 actionable items** across 8 categories, organized into **6 phases** that can be executed sequentially. Each phase is self-contained and leaves the codebase in a better state.

### Key Findings at a Glance

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Broken features | 2 | 1 | 0 | 0 |
| Architecture gaps | 0 | 1 | 2 | 3 |
| Documentation | 0 | 2 | 3 | 4 |
| Test coverage | 0 | 1 | 3 | 0 |
| Code quality | 0 | 0 | 1 | 0 |
| Stale/orphaned content | 0 | 0 | 2 | 3 |
| CI/CD | 0 | 1 | 1 | 2 |
| Contributor experience | 0 | 1 | 2 | 1 |
| **Total** | **2** | **7** | **14** | **13** |

---

## Phase 0: Fix Broken Features (CRITICAL)

> **Goal:** Fix the two broken features that block users right now.
> **Effort:** ~2 hours
> **Risk:** Low — isolated changes

### 0.1 Fix `atlas skills add` — GitHub URL support

**Problem:** `atlas skills add <github-url>` fails. The command only accepts `--from <path>` (local directory). Users cannot install skills from GitHub repos.

**Root cause:** `apps/cli/src/commands/skills.ts` line 86 defines `--from <path>` as required. The `addCustomSkill()` function in `packages/sdk/src/skills/authoring.ts` calls `tryReadSkill(sourceDir, sourceId)` which does `existsSync(join(sourceDir, "SKILL.md"))` — only works with local directories.

**Evidence:**
```
$ atlas skills add https://github.com/furqanistic/aura-skills
error: required option '--from <path>' not specified

$ atlas skills add --from https://github.com/furqanistic/aura-skills
Source Skill is invalid: expected a valid https:/github.com/furqanistic/aura-skills/SKILL.md.

$ atlas skills add --from https://github.com/furqanistic/aura-skills/blob/main/skills/improve-backend-code/SKILL.md
Invalid Skill id: "SKILL.md"
```

**Fix:**
1. In `apps/cli/src/commands/skills.ts`: detect if `--from` value is a URL (starts with `https://` or `git@`)
2. If URL: clone the repo shallowly to a temp directory, find SKILL.md files, then delegate to `addCustomSkill()` with the local path
3. Support both full repo URLs and direct SKILL.md URLs
4. Auto-derive skill ID from the repo name or subdirectory

**Files to change:**
- `apps/cli/src/commands/skills.ts` — add URL detection + git clone logic
- `packages/sdk/src/skills/authoring.ts` — (optional) move clone logic to SDK for reuse

### 0.2 Fix `atlas skills list` — not showing skills after `atlas setup --yes`

**Problem:** After `atlas setup --yes`, `atlas skills list` shows "No skills installed in .codeatlas/skills/."

**Root cause:** The `atlas skills list` command (without `--builtin`) only scans `.codeatlas/skills/` for custom skills. The setup flow installs skills through the toolkit installer which clones into `.codeatlas/skills/<name>/`. However:
- The `discoverSkills()` function scans immediate subdirectories for `SKILL.md`
- If the git clone failed silently or the catalog skill entries lack `packageId` (git URL), no skills would be installed
- Additionally, `atlas skills list` doesn't show builtin skills by default — users must pass `--builtin`

**Fix:**
1. Make `atlas skills list` show BOTH custom and builtin skills by default (merged list with source indicator)
2. Add a `--custom-only` flag if users want only custom skills
3. Verify that the `SkillInstallerAdapter` actually clones skills correctly
4. Add verbose output to `atlas setup --yes` showing what was installed

**Files to change:**
- `apps/cli/src/commands/skills.ts` — merge custom + builtin in default list
- `packages/sdk/src/setup.ts` — add installation logging
- `packages/toolkit/src/installer-adapters.ts` — verify skill clone logic

### 0.3 Fix type errors in benchmark tests

**Problem:** `pnpm typecheck` fails with 2 errors in `packages/benchmark/tests/clone.test.ts` (lines 89, 95).

**Root cause:** Accessing `result.error.message` on a `Result<T>` without narrowing to the error variant.

**Fix:** Add type guard (`if (!result.ok)`) before accessing `.error`.

**Files to change:**
- `packages/benchmark/tests/clone.test.ts`

---

## Phase 1: Clean Up Stale & Orphaned Content

> **Goal:** Remove or properly archive dead code, stale directories, and undocumented tool state.
> **Effort:** ~1 hour
> **Risk:** Very low — only cleanup or archiving

### 1.1 Archive `validation/` directory

**Finding:** `validation/mcp-v2-final/` contains 13 old MCP v2 audit documents. Unlike every other stale directory, it is NOT gitignored.

**Action:**
- Move contents to `old-school/validation/` or delete entirely
- Add `validation/` to `.gitignore`

### 1.2 Clean up `old-school/` directory

**Finding:** ~100+ files of historical plans, benchmarks, audits, and an old UI prototype. Has a README.md marking it as superseded.

**Action:**
- Verify the README.md is accurate
- Optionally: archive to a separate git branch and remove from main (preserve history via git)
- At minimum: ensure `.gitignore` covers it completely

### 1.3 Remove `scripts/build.sh` hardcoded path

**Finding:** `scripts/build.sh` line 3 hardcodes `cd /home/bilal/CodeAtlas` — wrong user, wrong machine.

**Action:**
- Fix the path to use `$(dirname "$0")/..` or similar portable approach
- Or delete the script if it's superseded by pnpm workspace scripts

### 1.4 Clean up `examples/` placeholder

**Finding:** Contains only a `README.md` saying "Placeholder (no runnable examples yet)."

**Action:**
- Either add a minimal working example (e.g., SDK usage snippet)
- Or remove the directory and update ARCHITECTURE.md to not reference it

### 1.5 Investigate and document `packages/common/`

**Finding:** Undocumented package with a single source file (`lcm.ts` — LCM utility). Not mentioned in CURRENT_STATE, README, MODULES, or any docs. Listed in ESLint dependency matrix with no allowed imports.

**Action:**
- Determine if it's used by any other package
- If unused: remove it
- If used: document its purpose in CURRENT_STATE.md and add a README.md

### 1.6 Document `.commandcode/` and `.freebuff/`

**Finding:** Gitignored tool-specific state directories with no documentation.

**Action:**
- Add a brief note in docs/CURRENT_STATE.md explaining what they are
- Or add entries to .gitignore comments

---

## Phase 2: Fix Architecture Drift

> **Goal:** Ensure the documented architecture matches reality, fix dependency violations, and close PLANNED feature gaps.
> **Effort:** ~3 hours
> **Risk:** Medium — touching architecture rules

### 2.1 Reconcile PLANNED vs IMPLEMENTED features

**Finding:** `docs/CURRENT_STATE.md` and `docs/FEATURE_STATUS.md` list several features as [PLANNED] that may actually be partially implemented, and vice versa.

**Action:**
- Audit every [PLANNED] item against actual code
- Update status to [IMPLEMENTED], [PARTIAL], or [PLANNED] as appropriate
- Specifically check:
  - Other language parsers (TypeScript only — confirmed [PLANNED])
  - Vector search / embeddings (seam exists — confirm status)
  - MCP resources/prompts (tools only — confirm status)
  - Interactive TUI (source git-untracked — confirm status)
  - Agent Router / slash commands — confirm status

### 2.2 Create missing ADRs (019-021)

**Finding:** `docs/HARNESS_PLAN.md` references ADR-019, ADR-020, ADR-021 but these files don't exist in `docs/decisions/`.

**Action:**
- Either create the missing ADRs documenting the decisions they represent
- Or update HARNESS_PLAN.md to remove references to non-existent ADRs

### 2.3 Fix duplicate ADR numbers

**Finding:** ADR-016 and ADR-017 each have two variant files:
- `ADR-016-context-modes.md` vs `ADR-016-package-placement.md`
- `ADR-017-synthesis-tier.md` vs `ADR-017-mcp-high-level-tools.md`

**Action:**
- Determine which is canonical for each number
- Rename or merge duplicates
- Update `docs/decisions/README.md` index

### 2.4 Fix `validation/` not in `.gitignore`

**Finding:** Every other stale directory is gitignored, but `validation/` is not.

**Action:** Add `validation/` to `.gitignore`

### 2.5 Fix `examples/` reference in ARCHITECTURE.md

**Finding:** ARCHITECTURE.md references `examples/` as "Placeholder (no runnable examples yet)."

**Action:** Either add examples or remove the reference.

### 2.6 Audit dependency direction enforcement

**Finding:** ESLint `no-restricted-imports` enforces `cli → sdk → feature → core → shared`. The `packages/common/` package is in the matrix but undocumented.

**Action:**
- Verify the ESLint rules still match the documented dependency matrix in `docs/DEPENDENCIES.md`
- Remove `packages/common/` from the matrix if it's being removed (Phase 1.5)
- Verify no new violations have crept in

---

## Phase 3: Fill Documentation Gaps

> **Goal:** Every package has a README, all docs are current, the documentation map is accurate.
> **Effort:** ~4 hours
> **Risk:** Low — documentation only

### 3.1 Add README.md to 8 packages

**Missing:** `agents`, `benchmark`, `common` (if kept), `metrics`, `search`, `toolkit`, `usage`, `verifier`

**Template per package:**
```markdown
# @prof-bilal/atlas-<name>

> One-line description

## What it does
## When to use it
## API surface (key exports)
## Dependencies (what it imports from @prof-bilal/*)
## Test coverage
## See also
```

Priority order: `toolkit` > `search` > `agents` > `usage` > `benchmark` > `verifier` > `metrics` > `common`

### 3.2 Add README.md to 2 apps

**Missing:** `apps/extension/`, `apps/server/`

**Action:** Write brief READMEs covering purpose, how to run, and how to test.

### 3.3 Update DOCUMENTATION_MAP.md

**Missing entries:** `MCP_MIGRATION.md`, `remaining.md`, HTML harness files

**Action:** Add missing entries to the map index.

### 3.4 Add deprecation notice to MCP audit

**Finding:** `CODEATLAS-MCP-READINESS-AUDIT.md` is a historical document but lacks a deprecation notice.

**Action:** Add a header noting it's historical and pointing to the V2 implementation plan.

### 3.5 Update CHANGELOG.md for 0.5.0 release

**Finding:** CHANGELOG has an [Unreleased] section but doesn't reflect the 0.5.0 release we just published.

**Action:** Add a `## [0.5.0]` section documenting the skills architecture, new commands (browse, setup, warden), and scope rename.

### 3.6 Update root README.md with 0.5.0 changes

**Action:** Update installation instructions, feature list, and CLI command count to reflect 0.5.0.

### 3.7 Clean up root-level research docs

**Finding:** `skills.md` (659 lines) and `upgrade.md` (389 lines) are working/research documents at the root, not referenced by DOCUMENTATION_MAP.

**Action:**
- Move to `docs/` or `old-school/` as appropriate
- Or add them to DOCUMENTATION_MAP with appropriate labels

### 3.8 Update AGENTS.md command count

**Finding:** AGENTS.md says "31 commands" but the actual count may have changed with new additions (browse, setup, warden, etc.).

**Action:** Verify the actual command count and update AGENTS.md.

---

## Phase 4: Improve Test Coverage

> **Goal:** Critical paths have tests, no command is completely untested.
> **Effort:** ~6 hours
> **Risk:** Low — adding tests, not changing behavior

### 4.1 Add handler test for `analyze_impact` (MCP)

**Finding:** `analyze_impact` is the only MCP handler without a functional test in `handlers.test.ts`.

**Action:** Add 3-5 tests covering:
- Single-file impact analysis
- Multi-file impact analysis
- Max depth limiting
- Include/exclude tests and docs

### 4.2 Add SDK-level tests for untested services

**Untested:** `warden.ts`, `verifier.ts`, `inspect/index.ts`, `impact/index.ts`

**Action:** Add unit tests for each:
- `warden.ts` — status check, run command
- `verifier.ts` — claim verification
- `inspect/index.ts` — HTTP probe
- `impact/index.ts` — blast radius computation

### 4.3 Add CLI tests for critical untested commands

**Untested commands (13):** ask, browse, impact, inspect, metrics, benchmark, verify, warden, skills, setup, evaluate, trace, mcp

**Priority for testing:**
1. `skills` — broken, needs tests to prevent regression
2. `setup` — critical first-run experience
3. `tools` — core feature
4. `browse` — new feature
5. `warden` — security feature

**Action:** Add at least smoke tests for the top 5 priority commands.

### 4.4 Add `atlas setup` interactive mode tests

**Finding:** The setup command has zero tests for the interactive selection flow (once we add it in Phase 0.2).

**Action:** Mock `@clack/prompts` and test:
- Project detection output
- Tool/skill selection flow
- Installation confirmation
- `--yes` bypass mode
- `--dry-run` mode

---

## Phase 5: CI/CD & Release Automation

> **Goal:** Automated releases, multi-OS testing, security scanning.
> **Effort:** ~3 hours
> **Risk:** Low — CI config changes

### 5.1 Add release automation workflow

**Finding:** No CI workflow for npm publishing. Currently manual (`pnpm publish -r`).

**Action:** Create `.github/workflows/release.yml`:
- Trigger: push of a version tag (`v*`)
- Steps: build, test, publish all packages to npm
- Use `NPM_TOKEN` secret

### 5.2 Add multi-OS CI matrix

**Finding:** CI only runs on `ubuntu-latest`. README notes this as a known limitation.

**Action:** Add `macos-latest` and `windows-latest` to the CI matrix in `ci.yml`.

### 5.3 Add dependency audit step

**Finding:** No security scanning for dependencies.

**Action:** Add `pnpm audit` step to CI workflow (non-blocking initially, then make blocking).

### 5.4 Add documentation link checking

**Finding:** Internal links between docs are not validated.

**Action:** Add a CI step that checks for broken internal links in `.md` files (using `lychee` or similar).

---

## Phase 6: Contributor Experience

> **Goal:** New contributors can understand, build, test, and contribute smoothly.
> **Effort:** ~2 hours
> **Risk:** Low

### 6.1 Improve CONTRIBUTING.md

**Finding:** Current CONTRIBUTING.md is a 24-line pointer to `docs/CONTRIBUTING.md`. The full guide exists but could be more welcoming.

**Action:**
- Add a "Quick Start" section (clone, install, build, test)
- Add "Your First Contribution" guide
- Add "Code Style" summary (biome + eslint rules)
- Add "PR Guidelines"

### 6.2 Add package-level development guide

**Finding:** No guide for developing within a specific package.

**Action:** Add `docs/DEVELOPING-PACKAGES.md` covering:
- How to add a new package
- Package structure conventions
- How to add a new command to the CLI
- How to add a new MCP tool
- How to add a new SDK module

### 6.3 Fix scripts portability

**Finding:** `scripts/build.sh` has hardcoded paths. The `scripts/` directory is gitignored.

**Action:**
- Fix all scripts to be portable
- Or document that scripts are local-only and not part of the build

### 6.4 Update .gitignore comments

**Finding:** Several gitignored directories lack comments explaining what they are.

**Action:** Add comments to `.gitignore` explaining:
- `.commandcode/` — external tool state
- `.freebuff/` — workspace metadata
- `old-school/` — archived historical materials
- `validation/` — old validation artifacts

---

## Execution Order

```
Phase 0 (CRITICAL) → Phase 1 (cleanup) → Phase 2 (architecture) → Phase 3 (docs) → Phase 4 (tests) → Phase 5 (CI/CD) → Phase 6 (contributor UX)
```

Each phase should be a separate PR. Phase 0 should be merged immediately since it fixes user-facing bugs.

---

## Tracking

| Phase | Status | PR | Merged |
|-------|--------|-----|--------|
| Phase 0: Fix broken features | PLANNED | — | — |
| Phase 1: Clean stale content | PLANNED | — | — |
| Phase 2: Fix architecture drift | PLANNED | — | — |
| Phase 3: Fill documentation gaps | PLANNED | — | — |
| Phase 4: Improve test coverage | PLANNED | — | — |
| Phase 5: CI/CD automation | PLANNED | — | — |
| Phase 6: Contributor experience | PLANNED | — | — |

---

## Appendix: Detailed Findings

### A. Code Quality Metrics

| Metric | Value | Status |
|--------|-------|--------|
| Lint errors | 0 | PASS |
| Type errors | 2 (benchmark/tests/clone.test.ts) | FAIL |
| Total tests | 1,568 passing across 153 files | PASS |
| Skipped tests | 0 | CLEAN |
| TODO/FIXME comments | 0 actionable | CLEAN |

### B. Package Inventory

| Package | Version | Has Tests | Has README | Has Build Config |
|---------|---------|-----------|------------|------------------|
| @prof-bilal/atlas-shared | 0.5.0 | YES | YES | YES |
| @prof-bilal/atlas-core | 0.5.0 | YES | YES | YES |
| @prof-bilal/atlas-agents | 0.5.0 | YES | **NO** | YES |
| @prof-bilal/atlas-benchmark | 0.5.0 | YES | **NO** | YES |
| @prof-bilal/atlas-cache | 0.5.0 | YES | YES | YES |
| @prof-bilal/atlas-context | 0.5.0 | YES | YES | YES |
| @prof-bilal/atlas-graph | 0.5.0 | YES | YES | YES |
| @prof-bilal/atlas-hashing | 0.5.0 | YES | YES | YES |
| @prof-bilal/atlas-mcp | 0.5.0 | YES | YES | YES |
| @prof-bilal/atlas-metrics | 0.5.0 | YES | **NO** | YES |
| @prof-bilal/atlas-parser | 0.5.0 | YES | YES | YES |
| @prof-bilal/atlas-providers | 0.5.0 | YES | YES | YES |
| @prof-bilal/atlas-scanner | 0.5.0 | YES | YES | YES |
| @prof-bilal/atlas-sdk | 0.5.0 | YES | YES | YES |
| @prof-bilal/atlas-search | 0.5.0 | YES | **NO** | YES |
| @prof-bilal/atlas-storage | 0.5.0 | YES | YES | YES |
| @prof-bilal/atlas-summary | 0.5.0 | YES | YES | YES |
| @prof-bilal/atlas-toolkit | 0.5.0 | YES | **NO** | YES |
| @prof-bilal/atlas-usage | 0.5.0 | YES | **NO** | YES |
| @prof-bilal/atlas-verifier | 0.5.0 | YES | **NO** | YES |
| @prof-bilal/atlas-common | — | YES (1) | **NO** | YES |
| codeatlas-cli | 0.5.0 | YES | YES | YES |

### C. CLI Command Coverage

| Command | Has Test | Notes |
|---------|----------|-------|
| init/build/update | YES | |
| search | YES | |
| scan | YES | |
| explain | YES | |
| doctor | YES | |
| sessions | YES | |
| usage | YES | |
| providers/ollama | YES | |
| context | YES | |
| tools | YES | |
| agents | YES | |
| claude/gemini/codex/opencode | YES | |
| mcp | PARTIAL | Only help text |
| **ask** | **NO** | |
| **browse** | **NO** | |
| **impact** | **NO** | |
| **inspect** | **NO** | |
| **metrics** | **NO** | |
| **benchmark** | **NO** | |
| **verify** | **NO** | |
| **warden** | **NO** | |
| **skills** | **NO** | |
| **setup** | **NO** | |
| **evaluate** | **NO** | |
| **trace** | **NO** | |

### D. MCP Handler Coverage

| Handler | Tested? |
|---------|---------|
| find_relevant_context | YES (8 tests) |
| inspect_symbol | YES (5 tests) |
| search_symbols | YES (5 tests) |
| search_files | YES (3 tests) |
| get_summary | YES (6 tests) |
| get_dependencies | YES (7 tests) |
| project_overview | YES (4 tests) |
| read_file_range | YES (7 tests) |
| list_skills | YES (1 test) |
| get_skill | YES (3 tests) |
| **analyze_impact** | **NO** |

### E. Documentation Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Architecture docs | 9/10 | Comprehensive, ADR-backed |
| API/SDK docs | 8/10 | CONTEXT_SDK.md and MCP.md are thorough |
| User guides | 8/10 | All key guides present |
| Contributor guides | 7/10 | Present but could be more welcoming |
| Package-level docs | 6/10 | 13/21 have READMEs |
| CI/CD | 6/10 | No release automation, no multi-OS |
| Changelog | 8/10 | Well-maintained, honest |
| Navigation | 9/10 | DOCUMENTATION_MAP is excellent |
| Security/privacy | 9/10 | Both root and docs-level coverage |
| **Overall** | **8/10** | **Strong with targeted gaps** |
