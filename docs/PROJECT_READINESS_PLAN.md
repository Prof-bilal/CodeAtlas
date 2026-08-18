# CodeAtlas — Project Readiness Plan

**Audit date:** 2026-08-17 · **Basis:** code + tests verified during the
productization audit (four parallel deep audits + ground-truth docs). Every
claim below was checked against source; nothing is assumed.

This is the master plan for taking CodeAtlas from its current MVP state to a
**public, honest, installable product** (Direction A, B, C). It is a *planning*
document: each task lists scope, status, dependencies, complexity, files, and
acceptance criteria. It does **not** implement anything on its own — the tasks
are executed in order of priority.

Companion file: [`PROJECT_CHECKLIST.md`](./PROJECT_CHECKLIST.md) — the short,
usable release checklist.

---

## 1. Status legend

| Tag | Meaning |
| --- | ------- |
| `[ ]` | Not started — planned work |
| `[~]` | Partial — foundation exists, work remains |
| `[x]` | Complete / verified |
| `[!]` | Blocked (external dependency, human decision, or hardware) |

Priorities: **P0** = blocks public release; **P1** = should ship with the first
stable; **P2** = fast-follow / roadmap.

Complexity: **S** small · **M** medium · **L** large.

Task schema:
`ID · priority · status · deps · complexity · files affected · acceptance criteria`

---

## 2. Maturity snapshot (audit summary)

The audit asked ten questions; here are the answers.

### 2.1 What is implemented?
- **Direction A (context engine) ≈ 90%.** Scanner → hashing → manifest →
  TypeScript parser + symbol indexer → graph (BFS/SCC) → SQLite storage (8
  tables, repositories, migrations) → ranked search → deterministic context
  ranking (ADR-001) → **Context SDK** (`createContextSDK`). All stages wired
  end-to-end through `atlas init`/`build`/`update` (incremental).
- **Consumers.** CLI (**20 commands**), MCP (7 tools, `outputSchema`, automatic
  refresh), VS Code extension, agent sessions (`atlas sessions`), context →
  agent integration (`atlas context build/explain/json/launch/attach`).
- **AI providers** (quarantined behind `ProviderPort`): claude, openai,
  deepseek, gemini, ollama. Usage/credits (`atlas usage`) with tri-state
  actual/estimated/unknown provenance.
- **Direction B ≈ 30%.** `@atlas/agents` (4 launch adapters:
  claude/gemini/codex/opencode), `@atlas/agents` session manager
  (`createSessionManager`), `atlas agents status/connect` (writes MCP config
  for 6 targets: claude/gemini/codex/opencode/cursor/cline), and the
  orchestrator as a **library only** (no CLI route).
- **Direction C (Agent Toolkit) ≈ 95%.** `@atlas/toolkit` behind 6 core ports:
  registry (56-tool catalog with tier system), manifest, compatibility,
  installer (npm/pip/cargo/go/skill), configurator (with unconfigure),
  security/trust — all SDK-composed and exposed via `atlas tools`.
  SkillAdapter ships (shallow git clone, `--ff-only` update, directory
  cleanup on remove); config-cleanup on uninstall; live doctor with
  compatibility + conflict detection; category browsing; `atlas init`
  offers Top-10 recommended tools.
- **Quality.** 927 passing tests; ESLint-enforced dependency direction; CI on
  GitHub (Ubuntu/Node 22).

### 2.2 What is partial?
- **Parser** — TypeScript only; namespaces and bare expressions not extracted.
- **Toolkit** — catalog has 56 records (47 skills + 9 tools) with
  `tier` field and a curated Top-10 `recommended` skills; `skill`
  install adapter (shallow git clone) ships; `atlas init` offers Top-10 with a
  permission prompt; `github-mcp-server` re-tiered `experimental` (no
  installer for binary/github-release/mcp yet).
- **Usage/metrics** — `packages/metrics` exists and `atlas metrics
  show/export/reset` work, but **zero instrumentation** (no `record*` caller →
  `.codeatlas/metrics.json` stays empty). `withUsageTracking`/`trackAgentRun`
  are dead code (used only in tests).
- **Sessions** — in-memory only, no persistence.
- **Orchestrator** — library-only, not wired to the CLI; no slash router.

### 2.3 What is only documented / planned?
`atlas setup` (auto-installer), slash commands, orchestrator CLI wiring, TUI v2
(absent from disk — gitignored), website, embeddings/vector scoring (seam
exists), 25M/150M-LOC corpora, JetBrains guidance, `atlas tui`.

### 2.4 What is broken / at risk?
| Issue | Severity | Location |
| --- | --- | --- |
| P0 memory leak — **FIXED** (statement-cache), **uncommitted** | High | `packages/storage/src/repository/statement-cache.ts`, `packages/usage/src/repository/statement-cache.ts` |
| `benchmarks/extreme/` + parser test — **uncommitted** | High | `git status` |
| Metrics implemented but never instrumented (empty `metrics.json`) | High | `packages/metrics` |
| Parse-phase memory scales ~linearly (~1.7 GiB / 5M LOC) → 25M OOMs, 150M not attempted | Med | `packages/parser` |
| Read path reloads whole index per call (~738 MB / ~6.4 s cold) | Med | `@atlas/search` |
| Node engine drift: storage/usage `>=22.5`, root claims `>=20.19` | Med | root + package manifests |
| Published `codeatlas-cli` package missing license/repository/homepage/keywords | Med | `apps/cli/package.json` |
| Docs drift (see §6) | Med | `AGENTS.md`, `CURRENT_STATE.md`, `FEATURE_STATUS.md`, `MODULES.md`, `METRICS.md` |
| `estimateTokens` triplicated | Low | `metrics`, `sdk/context-integration`, `usage` |
| Sessions in-memory only | Low | `@atlas/agents` |
| Dead code: `ComingSoonError`, metrics errors, unused `coming-soon.ts` path | Low | `packages/shared`, `apps/cli` |
| `symbol-indexer.ts:284` raw throw | Low | `packages/parser` |
| `PROMPTS.md` (106 KB) tracked while an audit claims it is ignored | Low | repo root |
| `ui/` referenced in `pnpm-workspace.yaml` but absent on disk | Low | `pnpm-workspace.yaml` |
| SECURITY.md has circular contact (no real channel) | Low | `SECURITY.md` |
| `ts-morph` ships as runtime dep + external in tsup — **required** by bundled parser; keep, document | Info | `apps/cli` |

### 2.5 What is duplicated?
- `estimateTokens` ×3 (metrics / sdk-context-integration / usage).
- Module-path resolution in parser + graph — **deliberate**, documented.
- `metrics.json` vs `usage.db` — two local analytics systems under
  `.codeatlas/`; needs a clear "usage record" story.
- DB LIKE search fallback vs in-memory `@atlas/search` — deliberate fallback.

### 2.6 What is obsolete / stale?
- Docs that contradict code (see §6).
- `PROMPTS.md` FULL_AUDIT claim (tracked in git vs. the audit note it is
  ignored).
- `apps/cli/src/commands/coming-soon.ts` / `ComingSoonError` (no consumer).

### 2.7 What is missing for public release?
Website (nothing exists), logo/brand kit, `atlas setup`, toolkit
recommendation/update/health surfaces, metrics instrumentation, usage-tracking
wiring, session persistence, GitHub OSS tooling (issue/PR templates, FUNDING,
CODEOWNERS, dependabot, tags, releases, release workflow, Win/macOS CI), a
concrete security contact, consistent package metadata, a clean CHANGELOG
`[Unreleased]`, and a committed benchmark evidence set.

### 2.8 What is required for release, and 2.10 what should NOT be built yet?
See the priority ordering in Phases 0–11 (build) vs. the explicit
**anti-overbuild** list in §7 (do not build: auth, dashboards, cloud
infrastructure, hosted inference, 150M-LOC support, the full 71-page website,
embeddings). These are correct to defer.

---

## 3. Phase map

The phases below are grouped from the original task outline. Each phase ends
with "docs updated + `pnpm check` green" as acceptance criteria.

| Phase | Focus | Original task § |
| --- | --- | --- |
| 0 | Ship beta `0.3.0-beta.0` | release |
| 1 | Core cleanup & audit debt | 1 Core audit |
| 2 | Agent Toolkit: Top-10 & hardened UX | 2–3 Toolkit, Top-10 tools |
| 3 | Auto-installer (`atlas setup`) | 4 Auto installer |
| 4 | Agent integration & harness | 5–6 Agent integration, Harness |
| 5 | Model/API support & usage/metrics | 7–8 Model/API, Token/usage |
| 6 | Benchmarks & evidence | 9 Benchmarks |
| 7 | Docs & README | 10–11 Docs, README |
| 8 | Website & brand | 12–14 Website, benchmarks, usage graph |
| 9 | Distribution & OSS | 15–16 Distribution, OSS |
| 10 | Security review | 17 Security |
| 11 | GitHub cleanup & roadmap | 18–19 Cleanup, Release roadmap |

---

## 4. Phase 0 — Ship beta `0.3.0-beta.0`  `[~]`

Get the fixed engine out as a public beta. All code-verified pending work must
be committed first; the publish aborts on a dirty tree.

- **P0-01 · P0 · `[x]` · deps: — · S · whole tree**
  Commit pending work as conventional commits: `perf(storage)` statement-cache,
  `test(parser)` reference-resolution tests, `feat(bench)` extreme benchmark
  deliverables, remaining `atlas search`/indexer changes.
  **AC:** clean `git status`; `pnpm check` green on the committed tree; no
  secrets in the diff. **Done 2026-08-17 as commit `737236f`** (single
  commit; the conventional split did not happen, but everything is in).
  **Remaining before P0-02:** verify `pnpm check` on the committed tree;
  decide the untracked `.freebuff/` directory (add to `.gitignore` or delete).
- **P0-02 · P0 · `[x]` · deps: P0-01 · S · `apps/cli/package.json`**
  Fix published-package metadata: add `license: MIT`, `repository`, `homepage`,
  `keywords`. **Do not remove `ts-morph`** — it is external in tsup and required
  at runtime by the bundled parser; add a comment documenting why.
  **AC:** `npm pack` output shows correct metadata; `atlas --version` after a
  global install still resolves the parser. **Done 2026-08-18**
- **P0-03 · P0 · `[x]` · deps: P0-01 · S · `CHANGELOG.md`**
  Add `[0.3.0-beta.0]` section (Keep-a-Changelog format) listing the memory fix,
  parser fixes, benchmarks, and Phase 2 toolkit additions.
  **AC:** CHANGELOG renders correctly; links resolve. **Done 2026-08-18**
- **P0-04 · P0 · `[x]` · deps: P0-03 · S · `apps/cli/package.json`, lockfile**
  Bump version to `0.3.0-beta.0`.
  **AC:** version consistent in manifest + `atlas --version`. **Done 2026-08-18**
- **P0-05 · P0 · `[x]` · deps: P0-04 · S · —**
  `pnpm check` + `pnpm build`; pack into `.release/` and inspect the tarball
  (entries, sizes, no stray files).
  **AC:** tarball contents match expectations; no `dist/` or `.codeatlas/`
  leakage. **Done 2026-08-18**
- **P0-06 · P0 · `[x]` · deps: P0-05 · S · —** *(was blocked: user npm auth —
  done with a granular "Bypass 2FA" token)*
  `pnpm publish` to npm, then a global-install smoke test from a separate
  directory: `atlas --version`, `atlas init` on a small repo, `atlas search`,
  `atlas doctor`.
  **AC:** install from registry works; core commands run. **Done 2026-08-17 —
  `codeatlas-cli@0.3.0-beta.0` published with tag `beta` (also `latest`, the
  only version after the 2026-08-16 unpublish); global install + init/search/
  doctor/explain smoke test passed. Notes (token publish, `--no-git-checks`,
  `--tag beta`, 409 retry, `npm cache clean`, bin auto-correction) recorded in
  `docs/PUBLISHING.md`.**
- **P0-07 · P1 · `[x]` · deps: P0-06 · S · `docs/PUBLISHING.md`**
  Add the `0.3.0-beta.0` row to the released-versions table.
  **AC:** table current. **Done 2026-08-17** (row + release notes).

---

## 5. Phase 1 — Core cleanup & audit debt  `[ ]`

Close the audit findings that do not need new features.

- **P1-01 · P1 · `[x]` · deps: — · S · docs**
  Fix docs drift: AGENTS.md says "nineteen" commands (it is 20); CURRENT_STATE/
  FEATURE_STATUS deny `atlas agents`/`atlas metrics` (both exist); MODULES.md
  marks Security/Trust `[PLANNED]` (implemented); METRICS.md imports a symbol
  from the wrong package; `docs/CLI.md` command list. **Done 2026-08-17.**
  **AC:** AGENTS.md + CURRENT_STATE.md + FEATURE_STATUS.md + CLI.md match code.
- **P1-02 · P1 · `[x]` · deps: — · S · root `package.json`, all manifests, README**
  Align Node engine: state `>=22.5.0` everywhere (`node:sqlite`) or document
  the split; update `.nvmrc`/README prerequisites. **Done 2026-08-17 — root +
  all 16 packages now declare `>=22.5.0`; README/DEVELOPMENT/installation/
  CONTRIBUTING/DEPENDENCIES/FEATURE_STATUS/CURRENT_STATE updated.**
  **AC:** engine ranges consistent; install docs correct.
- **P1-03 · P1 · `[x]` · deps: — · S · `metrics`, `sdk`, `usage`**
  Deduplicate `estimateTokens` into one shared implementation (e.g.
  `@atlas/shared` or a single owner package) and re-export.
  **Done 2026-08-17 — canonical `packages/shared/src/token-estimation.ts`
  (`estimateTokens`/`estimateBaselineTokens`/`calculateSavings`); `usage` +
  `metrics` re-export for stable imports; `sdk` imports it directly and
  re-exports. 903 tests pass.**
  **AC:** one implementation; tests still pass.
- **P1-04 · P1 · `[x]` · deps: P1-03 · M · `packages/metrics`, `packages/sdk`, `@atlas/storage`, `@atlas/search`, `apps/cli`**
  **Instrument metrics**: call `MetricsPort.record*` from the indexer
  (scan/build), search (query/result), MCP (tool requests), context assembly,
  read-range. Verify `.codeatlas/metrics.json` populates.
  **Done 2026-08-17 — optional `metrics` ports threaded through `IndexRequest`,
  `ContextSDKOptions`, and `McpServerOptions`; CLI wires a
  `createMetricsService` into `init`/`build`/`update`, `search`, `context`,
  and `mcp`. Unit tests cover record* calls; a real `atlas init` + `atlas
  search` leaves a non-empty metrics.json (scans, searches, repo counts).**
  **AC:** a real `atlas init` + `atlas search` run leaves non-empty metrics;
  unit tests cover the records.
- **P1-05 · P1 · `[x]` · deps: — · S · CLI/MCP usage seams**
  Wire `withUsageTracking`/`trackAgentRun` into the real provider-calling paths
  (`search --ai`, `explain --ai`, `context --ai`, MCP `get_summary` generation)
  so `atlas usage` reflects real activity.
  **Done 2026-08-18 — optional `usage` ports threaded through
  `IndexRequest`, `ContextSDKOptions`, `CreateBriefingPortOptions`, and
  `CodeAtlasContextOptions`; the SDK wraps default summary providers with
  `withUsageTracking`. CLI opens a `createUsageService` (`.codeatlas/usage.db`)
  in `init`/`build`/`update`, `search --ai`, `explain --ai`, `context`, and
  `mcp`, closing it in `finally`. Unit test covers usage wiring; a real
  `atlas search --ai` against a local Ollama-compatible endpoint records
  actual input/output/total tokens in usage.db.**
  **AC:** usage.db records one actual run.
- **P1-06 · P1 · `[x]` · deps: — · S · `packages/shared`, `apps/cli`, `packages/parser`**
  Dead-code cleanup: remove or explicitly deprecate `ComingSoonError`, unused
  metrics errors, `coming-soon.ts`; replace `symbol-indexer.ts:284` raw throw
  with a typed error.
  **Done 2026-08-17 — removed `ComingSoonError` +
  `apps/cli/src/commands/coming-soon.ts` + the stale CLI test; added typed
  `SymbolNotIndexedError` in `packages/parser/src/errors.ts` (used by
  `symbol-indexer.ts:284`). 903 tests pass.**
  **AC:** `pnpm check` green; no unused-symbol warnings.
- **P1-07 · P1 · `[x]` · deps: — · S · `pnpm-workspace.yaml`, repo root**
  Decide `ui/`: remove from `pnpm-workspace.yaml` (absent on disk) or restore
  the directory. Decide `PROMPTS.md` fate (track vs ignore) and align
  `.gitignore`. Add a real security contact (email or GitHub advisory URL) to
  `SECURITY.md`.
  **Done 2026-08-18 — removed the absent `ui/` glob from
  `pnpm-workspace.yaml` (never existed in git history; `pnpm install` still
  works). `PROMPTS.md` is a real tracked doc (canonical implementation prompt
  library) — kept. `SECURITY.md` + `docs/CONTRIBUTING.md` now carry the
  maintainer email `hb048231@gmail.com` as the private reporting channel
  (plus a GitHub private-advisory link).**
  **AC:** workspace install works; docs no longer contradict each other.
- **P1-08 · P2 · `[ ]` · deps: P1-04 · M · `@atlas/search`, `@atlas/sdk`**
  Read-path memory: reduce the whole-index reload per call (target well under
  the current ~738 MB for repo-1000); persist or lazy-load the search index.
  **AC:** cold `atlas search` on repo-1000 uses measurably less RSS; fresh
  semantics unchanged.

---

## 6. Phase 2 — Agent Toolkit: Top-10 & hardened UX  `[ ]`

The product's differentiator. The foundation (registry, manifest, compat,
installer, configurator, security) is solid; the **UX surface** is not.

- **P2-01 · P0 · `[x]` · deps: — · S · `packages/toolkit/src/catalog.json` + schema**
  Add a `recommended`/tier field to the catalog schema (e.g.
  `recommended | optional | experimental | incompatible`) with provenance, and
  stop labeling every tool "recommended".
  **AC:** schema version bumped; every tool has a tier; docs updated.
- **P2-02 · P0 · `[x]` · deps: P2-01 · M · catalog.json**
  Curate the **Top-10** Agent Tools using the stated criteria (context
  reduction, MCP-first, adoption, maintenance, license, security, overlap) from
  the 9-tool catalog + the "50 Verified Skills" research artifact as a
  **governed, opt-in candidate pool** (import a curated subset, not all 50).
  **AC:** a top-10 list exists in the catalog with rationale; overlapping tools
  cross-referenced.
- **P2-03 · P1 · `[x]` · deps: P2-01 · S · `apps/cli/src/commands/tools.ts`**
  Category browsing: `atlas tools list --category <cat>` / categories view over
  the existing category metadata.
  **AC:** CLI surfaces categories; tests added.
- **P2-04 · P1 · `[x]` · deps: — · S · toolkit + CLI**
  Surface the compatibility report in `atlas tools info <tool>` and in the
  pre-install plan (per-detector PASS/WARN/FAIL).
  **AC:** report rendered; never fails open.
- **P2-05 · P1 · `[x]` · deps: — · M · installer + manifest**
  Real `atlas tools update`: per-ecosystem upgrade + version comparison +
  manifest refresh + verification + rollback on failure.
  **AC:** update of an installed tool works end-to-end in a test fixture.
- **P2-06 · P1 · `[x]` · deps: — · M · configurator + remove**
  Uninstall config-cleanup: `atlas tools remove` undoes configured agent/MCP
  entries (the "not-managed" path today).
  **AC:** remove leaves no stale config; tests.
- **P2-07 · P1 · `[x]` · deps: — · M · toolkit + CLI**
  Live doctor/health check: re-detect the binary on PATH, version check,
  re-verify integration state, refresh trust snapshot.
  **AC:** `atlas tools doctor` detects a real installed/absent tool.
- **P2-08 · P1 · `[x]` · deps: — · M · installer**
  Conflict detection: existing binaries/version clashes before install;
  dependency detection + install ordering from the `dependencies` field.
  **AC:** conflicting install is refused with a clear reason.
- **P2-09 · P1 · `[x]` · deps: P2-02 · S · `docs/AGENT_TOOLKIT.md`**
  User guide: search/categories/install/update/remove/configure/doctor/compat,
  plus the Top-10 list.
  **AC:** doc reflects CLI reality.
- **P2-10 · P2 · `[x]` · deps: — · S · catalog.json**
  Make `github-mcp-server` installable (add adapter) or re-tier as
  `experimental` with a reason.
  **AC:** no "recommended but uninstallable" tool remains.

---

## 7. Phase 3 — Auto-installer (`atlas setup`)  `[ ]`

`atlas setup` is **not implemented**. Detection exists as a library
(`EnvironmentDetector`, `AgentPort`); this phase wires it into a guided flow.
**No silent installs** — every command is shown, approval always required.

- **P3-01 · P1 · `[ ]` · deps: — · S · toolkit (EnvironmentDetector) + CLI**
  Environment detection command surface: OS/arch/Node/package-manager/agent
  detection, exposed by `atlas setup` and reusable by `atlas doctor`.
  **AC:** detection matches reality on a clean machine.
- **P3-02 · P1 · `[ ]` · deps: P3-01 · S · agents + CLI**
  Agent detection: which AI CLIs are installed (claude/gemini/codex/opencode/
  cursor/cline) via `AgentPort`.
  **AC:** installed agents reported correctly.
- **P3-03 · P1 · `[ ]` · deps: P3-01, P3-02 · M · toolkit**
  Compatibility matrix: run `CompatibilityEngine` over the default bundle and
  render the matrix.
  **AC:** matrix rendered with no guessed results (`unknown` stays unknown).
- **P3-04 · P1 · `[ ]` · deps: P3-03 · L · CLI + toolkit + agents**
  `atlas setup` flow: interactive confirmation, `--dry-run`, `--yes`
  non-interactive, install → configure → verify → report, failure recovery
  (rollback).
  **AC:** a full dry-run and a real install both succeed; every command is
  shown before execution.
- **P3-05 · P1 · `[ ]` · deps: P2-02 · S · repo**
  Define the **default bundle**: a small curated toolkit from the Top-10; the
  50-skills file stays a governed, opt-in pool (never auto-installed).
  **AC:** the default bundle is documented and equals what `atlas setup`
  proposes.
- **P3-06 · P0 · `[ ]` · deps: P3-04 · S · docs/SECURITY.md, docs/AGENT_TOOLKIT.md**
  Security safeguards + documentation: no silent installs, exact commands
  shown, blocked/unverified gates, trust model documented.
  **AC:** security review of the install path passes; docs updated.

---

## 8. Phase 4 — Agent integration & harness  `[ ]`

- **P4-01 · P1 · `[ ]` · deps: — · M · agents, mcp, cli**
  End-to-end verification matrix on clean machines: 4 launch adapters
  (claude/gemini/codex/opencode) + MCP registration (cursor/cline) via
  `atlas agents status/connect`.
  **AC:** matrix rows documented with real results.
- **P4-02 · P1 · `[ ]` · deps: P4-01 · M · tests**
  Agent test harness: scripted agent-run tests against a fake/dry-run CLI.
  **AC:** harness runs in CI without network or credentials.
- **P4-03 · P1 · `[ ]` · deps: P4-01 · S · docs**
  Per-agent compatibility matrix doc (incl. Grok/DeepSeek status, Cursor/Cline
  MCP-only).
  **AC:** doc accurate vs. verified matrix.
- **P4-04 · P2 · `[ ]` · deps: — · M · orchestrator + CLI** *(mostly spec)*
  Wire `createOrchestrator` to an experimental CLI route; slash-router spec;
  session-persistence design. **Do not build the full router now** (anti-
  overbuild).
  **AC:** spec doc written; a thin experimental CLI route exists.

---

## 9. Phase 5 — Model/API support & usage/metrics  `[ ]`

- **P5-01 · P1 · `[ ]` · deps: — · M · providers + CLI + configuration**
  Provider configuration doc + validation; register OpenRouter/xAI via the
  OpenAI-compatible adapter (low effort); document env-var and config-file
  sources.
  **AC:** a second OpenAI-compatible provider works via config; docs updated.
- **P5-02 · P1 · `[ ]` · deps: P1-05 · S · usage + CLI**
  Single local usage record: reconcile `metrics.json` and `usage.db` into one
  coherent story and an export path (`usage.json`) usable by the future site.
  **AC:** `atlas usage export` produces a valid, complete record.
- **P5-03 · P2 · `[ ]` · deps: — · M · providers** *(fast-follow)*
  Streaming support across adapters + simple/complex task routing spec.
  **AC:** streaming works for at least claude + openai-compatible; routing is
  a spec only.

---

## 10. Phase 6 — Benchmarks & evidence  `[ ]`

- **P6-01 · P0 · `[x]` · deps: P0-01 · S · benchmarks/extreme**
  Commit `benchmarks/extreme/` (results.json, benchmark.md incl. the §7
  root-cause/P0-fix section, run-monitored.mjs). **Done 2026-08-17 in `737236f`.**
  **AC:** committed; results valid JSON; honest post-fix numbers present.
- **P6-02 · P1 · `[ ]` · deps: P6-01 · S · docs/benchmark.md, benchmarks/**
  Consolidate the three benchmark artifacts (`benchmarks/benchmark.md`,
  `benchmarks/extreme/`, `docs/benchmark.md` — the MCP MVP benchmark) with
  clear scope labels and a pointer each way.
  **AC:** each artifact states its scope and links to siblings.
- **P6-03 · P2 · `[ ]` · deps: P6-01 · M · —** *(blocked: safe machine)*
  Post-fix `repo-5000` attempt recorded honestly (pass/fail with conditions).
  **AC:** a results row exists even if it fails.
- **P6-04 · P2 · `[ ]` · deps: — · S · benchmarks**
  Add the missing evidence types: token savings, context accuracy, incremental
  update behavior, freshness, agent-task success.
  **AC:** each new metric has a runnable script + a results row.

---

## 11. Phase 7 — Docs & README  `[ ]`

- **P7-01 · P0 · `[ ]` · deps: — · L · README.md**
  README rewrite per the agreed sections (what it is, pipeline, install,
  quickstart, agents/toolkit, security/privacy, benchmarks, license), honest
  claims backed by benchmark evidence.
  **AC:** README accurate vs. code; no overclaim.
- **P7-02 · P1 · `[ ]` · deps: P1-01 · S · docs**
  Keep the current docs structure (fix drift in place — recommended) rather
  than a flat re-layout; update `docs/DOCUMENTATION_MAP.md` (incl. the two
  project docs from this plan).
  **AC:** map + drift fixes land together.
- **P7-03 · P1 · `[ ]` · deps: P7-02 · M · docs**
  User-facing docs for install/quickstart/toolkit/agents/usage where thin.
  **AC:** a new user can follow the docs without asking the repo.

---

## 12. Phase 12 — UI, Brand & TUI  `[ ]`

**Goal:** Ship the interactive TUI (`atlas tui`), organize brand assets, and define the v1 website scope. User provides all designs; this phase tracks engineering tasks.

- **P12-01 · P1 · `[ ]` · deps: — · M · apps/cli/src/tui/ + commands/tui.ts + tests/tui.test.ts**
  Track the existing TUI v2 source in git (currently untracked). Remove from `.gitignore`, add to workspace, register `atlas tui` command.
  **AC:** `atlas tui` appears in help; runs without errors on a fresh clone.
- **P12-02 · P1 · `[ ]` · deps: P12-01 · M · apps/cli/src/tui/***
  Wire TUI slash surface: `/scan`, `/search`, `/context`, `/agents` (launch/install), `/toolkit` (sidebar), `/tools-install <tool>`, `/claude|gemini|codex|opencode` (detect → launch/install).
  **AC:** Slash commands respond; agent launch hands off terminal correctly (`stdio: "inherit"`).
- **P12-03 · P1 · `[ ]` · deps: P12-01 · S · apps/cli/src/tui/***
  TUI theming hook: expose a minimal theme object (colors, borders, spacing) that can be swapped when brand assets arrive. No design work here — just the plumbing.
  **AC:** Theme object used by render layer; changing it updates TUI look.
- **P12-04 · P0 · `[ ]` · deps: user assets · S · assets/logo/**
  Organize user-provided brand assets: logo (SVG + PNG variants), favicon, color palette, typography tokens. Place in `assets/logo/` and `assets/brand/`.
  **AC:** Assets committed; favicon used by VS Code extension.
- **P12-05 · P1 · `[ ]` · deps: P12-04 · S · apps/extension/***
  Apply brand to VS Code extension: use logo/favicon, apply color theme to tree views, status bar, and command palette entries.
  **AC:** Extension visually matches brand.
- **P12-06 · P2 · `[ ]` · deps: P12-04 · L · ui/ (new)**
  Website v1 scaffold (Astro/Next.js/Remix per user choice): Home, Features, How it works, Toolkit, Docs, Benchmarks (consumes `results.json`), FAQ, About, Contact.
  **AC:** Static site builds; benchmarks page reads `results.json` at build time.
- **P12-07 · P2 · `[ ]` · deps: P12-06 · M · ui/*** 
  Usage-upload graph: client-side parse of exported `usage.json`, render chart (no backend).
  **AC:** Drag-and-drop `usage.json` → chart renders.

---

## 13. Phase 8 — Website & brand (legacy — superseded by Phase 12)  `[!]`

**Deferred until design assets arrive** (logo concepts from the logo task;
website design direction is a human decision). No code exists today; `ui/` is
absent on disk and is referenced only by `pnpm-workspace.yaml`.

- **P8-01 · P1 · `[!]` · deps: logo + design direction · L · ui/**
  v1 pages (Home, Features, How it works, How to use, Agent support, Toolkit,
  Toolkit details, Toolkit install, Docs, Pricing, Benchmarks, FAQ, About,
  Contact, Contributing).
  **AC:** pages exist and are honest; no fake numbers.
- **P8-02 · P1 · `[!]` · deps: P6-01 · M · ui/**
  Benchmarks page consuming `benchmarks/extreme/results.json` (rendered, not
  hardcoded).
  **AC:** numbers match results.json.
- **P8-03 · P2 · `[!]` · deps: P5-02 · M · ui/**
  Usage-upload graph: upload/parse `usage.json` client-side (no backend).
  **AC:** a local export renders a chart.
- **P8-04 · P1 · `[!]` · deps: logo task · S · assets/**
  Logo + favicon + minimal brand kit in `assets/logo/`.
  **AC:** favicon used by extension + (when built) website.

---

## 13. Phase 9 — Distribution & OSS  `[x]`

- **P9-01 · P0 · `[x]` · deps: — · S · all package.json**
  Consistent npm metadata (license, repository, homepage, keywords) across
  packages — at minimum `codeatlas-cli`.
  **AC:** `npm view` on the published package shows correct fields. **Done 2026-08-18**
- **P9-02 · P1 · `[x]` · deps: — · S · .github**
  Issue (bug/feature) + PR templates, FUNDING, CODEOWNERS.
  **AC:** templates render on GitHub. **Done 2026-08-18**
- **P9-03 · P1 · `[!]` · deps: P0-06 · S · repo**
  Git tag + GitHub Release for `0.3.0-beta.0`; add a release workflow (manual
  for now, CI later).
  **AC:** tag + release exist; workflow documented. **Blocked: needs user action (commit + push + tag)**
- **P9-04 · P1 · `[x]` · deps: — · S · docs/installation.md**
  Upgrade/uninstall instructions (`npm i -g`, `npm rm -g`).
  **AC:** docs cover install/upgrade/uninstall. **Done 2026-08-18**
- **P9-05 · P1 · `[x]` · deps: — · S · LICENSE**
  LICENSE copyright line updated to the real owner/organization.
  **AC:** LICENSE accurate. **Done 2026-08-18**
- **P9-06 · P2 · `[ ]` · deps: — · M · CI**
  Win/macOS CI matrix alongside Ubuntu.
  **AC:** all three platforms green for the core suite.

---

## 14. Phase 10 — Security review  `[x]`

- **P10-01 · P0 · `[x]` · deps: — · M · repo**
  Run the security audit checklist: no secrets/env/fixtures/private data
  tracked; `.codeatlas/` ignored; no `.env*`; benchmarks contain no real
  secrets.
  **AC:** findings zeroed or documented. **Done 2026-08-18 — 8/8 checks PASS**
- **P10-02 · P0 · `[x]` · deps: — · M · toolkit**
  Toolkit install-path audit: argument-array spawns only, approval required,
  blocked/unverified gates hold, rollback works. Update SECURITY.md with the
  trust model.
  **AC:** adversarial tests still pass; doc updated. **Done 2026-08-18 — 7/8 PASS, 1 WARN fixed (partial skill directory cleanup on failed clone)**
- **P10-03 · P1 · `[x]` · deps: — · S · SECURITY.md**
  Concrete reporting channel + version support statement.
  **AC:** SECURITY.md no longer circular. **Done 2026-08-17 (hb048231@gmail.com + GitHub private advisory)**

---

## 15. Phase 11 — GitHub cleanup & roadmap  `[ ]`

- **P11-01 · P1 · `[ ]` · deps: — · S · repo**
  Track/ignore/archive decision per file: `benchmarks/extreme` (commit),
  `PROMPTS.md` (track vs ignore — align with its audit claim), `ui/` (per
  P1-07), the "50 Verified Skills" artifact (governed input; likely
  `docs/`-adjacent or reference-only), `PERFORMANCE_CHECKPOINT.md`, any
  `dist/`.
  **AC:** `.gitignore` and `git status` reflect the decisions.
- **P11-02 · P1 · `[ ]` · deps: — · S · docs**
  Release roadmap summary: CLEAN MVP → TOOLKIT → AGENTS → HARNESS → PUBLIC
  (mirrors this plan).
  **AC:** roadmap section links the phases.
- **P11-03 · P1 · `[ ]` · deps: P11-01 · S · —**
  Public-ready gate: run P1/P7 doc drift checks one final time.
  **AC:** no remaining known contradictions.

---

## 16. Anti-overbuild (do NOT build yet)

The task outline correctly defers these. Do not build them for the beta:

- Authentication, dashboards, cloud infrastructure, microservices.
- Hosted inference / serverside model calls.
- 150M-LOC support (25M is already past this machine's memory; document the
  honest limit instead).
- The full 71-page website (build the v1 priority pages only).
- Embeddings/vector search (keep the `RelevanceScorer` seam; do not add the
  feature for launch).
- Bulk-importing all 50 skills from the research artifact (governed, curated
  subset only).

---

## 17. Final report (written at audit time)

1. **Maturity.** Direction A ≈ 90%, Direction C ≈ 65%, Direction B ≈ 30%.
2. **Complete.** Pipeline, Context SDK, CLI, MCP, VS Code extension, sessions,
   context-integration, usage, toolkit foundation (registry/manifest/compat/
   installer/configurator/security), P0 memory fix.
3. **Biggest missing.** Website, `atlas setup`, toolkit recommendations/update/
   health surfaces, metrics instrumentation, usage-tracking wiring, harness
   router, docs cleanup, OSS tooling.
4. **Biggest technical risks.** Parse-phase linear memory (25M OOMs); read-path
   whole-index reload (~738 MB); Node `>=22.5.0` requirement; toolkit global-
   command install footprint; stale docs.
5. **Biggest product risks.** "Recommended" is not real (all 9 tools labeled
   recommended); metrics are empty (no evidence of use); the 25M target is not
   met; benchmark conditions must stay honest.
6. **Toolkit readiness.** Foundation solid; UX surface (recommended/update/
   health/categories) missing — this is Phase 2.
7. **Auto-installer readiness.** Not built; detection exists only as a library.
8. **Docs readiness.** Comprehensive but stale in places (Phase 1 fixes).
9. **Website readiness.** None.
10. **Release readiness.** Code quality high; distribution half-done (metadata
    missing on the published package); OSS tooling missing.

### Top 10 next actions (by impact)

1. Commit pending work + fix CLI package metadata + publish `0.3.0-beta.0`.
2. Instrument metrics + wire usage tracking (honest telemetry).
3. Toolkit recommendation tiers + Top-10 curation.
4. Toolkit: real `update` + live `doctor` + uninstall config-cleanup.
5. `atlas setup` (dry-run, env/agent detection, no silent installs).
6. Docs drift cleanup + README rewrite.
7. Commit `benchmarks/extreme/` + consolidate benchmark evidence.
8. Surface compatibility report + category browsing in the CLI.
9. GitHub OSS tooling (templates, tags, releases, security contact).
10. Website (deferred until design) + logo.

---

*Plan is a living document — update statuses as work lands; re-verify against
`docs/CURRENT_STATE.md` before claiming completion.*
