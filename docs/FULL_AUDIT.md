# CodeAtlas Full Audit

> Independent audit of the complete CodeAtlas codebase — architecture, code
> quality, features, security, performance, tests, docs, and release readiness.
> Audited branch `main` @ `593d6bb` (2026-08-15) on Windows 11, Node v24.18.0,
> pnpm 9.15.0. This audit was **read-only** (no production code modified; the two
> deliverables `docs/AUDIT_FEATURE_MATRIX.md` and this file were added).
>
> **Method:** full repo inspection, parallel deep-dives of every package, the
> complete quality gates run live (`pnpm typecheck`, `pnpm lint`,
> `pnpm format:check`, `pnpm build`, `pnpm test`), live CLI smoke tests, git
> tracking/hygiene audit, and a secrets scan. Evidence is cited as
> `path:line`.

---

## 1. Executive Summary

CodeAtlas is a **substantially implemented, genuinely tested** AI Context
Engine (Direction A ≈ complete), with a real MCP server, a real CLI (19
commands), a real VS Code extension, a real agent-connection layer + session
manager, a real Agent Toolkit (Registry, Manifest, Compatibility, Installer,
Configurator, Security), and a real (but app-unwired) multi-agent orchestrator.

**Quality gates all pass on this machine:**

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | PASS (all 17 packages + 2 apps) |
| `pnpm lint` | PASS |
| `pnpm format:check` | PASS (413 files) |
| `pnpm build` | PASS (self-contained CLI bundle) |
| `pnpm test` | **PASS — 899 tests / 88 files** |
| Live CLI (search/doctor/context/explain/tools/agents/usage) | PASS |

The single most important finding is **not** a code failure: the docs —
including `docs/CURRENT_STATE.md`, which is declared the arbiter of truth —
still claim `@atlas/context` is an *intentional stub* that throws
`ComingSoonError`, while the code fully implements it. That erodes the
repository's own "docs are the source of truth" invariant and misleads every
agent and contributor.

Release-readiness verdict: the published `codeatlas-cli` 0.2.1 is **usable by a
real developer today** for the core value (scan → index → search → context →
MCP → VS Code → launch agents). It is **not a clean public open-source release**
yet: no Windows CI, no tags/release automation, stale docs, tracked dead code
(extension chat module), and two real code bugs (see §Critical Findings). The
external integration suite described below was **removed (2026-08-16)** because
its fixture (`test-repo/AIbuilder`) is not publicly cloneable in CI.

**Overall health score: 7.4 / 10.** Feature completion: Direction A ≈ 90%,
Direction B ≈ 45% (implemented but unwired), Direction C ≈ 75%.

---

## 2. Architecture

### 2.1 Verified structure

Clean architecture in a pnpm + TypeScript (strict, ESM) monorepo. Contracts in
`packages/core` (ports + domain types), implementations in feature packages,
composition in `packages/sdk`. Dependency direction points inward
(`cli → sdk → feature packages → core → shared`) and is **enforced by ESLint
`no-restricted-imports`** (`eslint.config.mjs:29-65`).

- **Verified compliant:** MCP imports only `@atlas/sdk` + `@modelcontextprotocol/sdk`
  (`packages/mcp/package.json`); extension imports only `@atlas/sdk`; feature
  packages import only `core`/`shared`; `apps/cli/tests/cli.test.ts:33` is the
  single (test-only) exception importing `@atlas/storage` directly.
- **No circular imports** found (SDK graph is a clean DAG).
- **Ports vs implementations:** 17 ports in `core` map to real implementations;
  `ContextBuilderPort` → implemented (see §Critical), `OrchestratorPort` →
  implemented in SDK but unwired, `InstallerPort` → subset implemented.

### 2.2 Does the architecture support the intended future?

**Yes, without a rewrite.** The pipeline
`Context Engine → Agent Harness (sessions) → Model Router (providers) →
Subagents (orchestrator)` is already composed as ports:
- Agent orchestration goes through `SessionPort` (never spawns directly), so
  adding a router is a new consumer of `createOrchestrator`, not a refactor.
- A vector scorer plugs into `@atlas/search`'s `RelevanceScorer` seam without
  touching callers.
- New languages = new `LanguageParser` in the registry; new install ecosystems =
  new `InstallerAdapter`.
- Provider/model routing is quarantined behind `ProviderPort`; no
  `if (provider === …)` switches outside adapters.

### 2.3 Architectural risks

1. **The SDK is becoming a God-object.** `packages/sdk/src/index.ts` exports
   ~200 symbols and `createContextSDK` + `Container` + toolkit + sessions +
   usage + orchestrator. It works, but the surface is large and partially
   unwired (orchestrator).
2. **Search is all-in-memory, re-built on each read.** `@atlas/search` reloads
   and re-indexes the entire snapshot per `refresh()`; `ContextBuilderService.build`
   calls `search.refresh()` on every invocation (`packages/context/src/context-builder.service.ts:38`).
   At 10k files/500k lines this costs ~1.5 GB RSS (documented in `docs/benchmark.md`).
   Acceptable for MVP; a persistent index or shared session-level cache is the
   next step.
3. **Storage has no FKs on `Dependencies`/`Relationships`** (`packages/storage/src/schema.ts:42-48,78-87`);
   edge integrity rests entirely on cleanup code that currently has a bug
   (§Critical).
4. **Two deliberate duplications** (module-path resolution in parser and graph;
   DB `searchContext` vs `@atlas/search`) are documented as intentional but
   their scoring semantics already diverge (§Medium).

---

## 3. Feature Matrix

See **`docs/AUDIT_FEATURE_MATRIX.md`** (companion deliverable). Summary:

- **Direction A — Context Engine: ~90%.** Scanner, hashing, manifest, parser,
  graph, storage, search, summaries, cache, providers, Context SDK, MCP, CLI,
  VS Code all implemented and tested. Gaps: parser (TS-only, renamed imports /
  default-export resolution), vector search, resources/prompts on MCP.
- **Direction B — AI CLI Orchestrator: ~45%.** Connection layer, sessions, and
  the orchestrator exist; the router + slash surface + CLI wiring do not
  (TUI is v2/untracked).
- **Direction C — Agent Toolkit: ~75%.** Tasks 19–24 fully implemented;
  `/tools` slash surface and `atlas setup` planned.

---

## 4. Core Context System

### 4.1 Pipeline correctness (scan → parse → graph → store → search → SDK)

Verified end-to-end via live CLI on the CodeAtlas repo itself (395 files, 8740
symbols) and the tracked MCP fixture. Facts are deterministic (no AI in facts);
AI only adds summaries. Search is ranked, fuzzy, duplicate-free and
case/separator-normalized.

### 4.2 Incremental updates — VERIFIED TRUE (docs partially stale)

`packages/sdk/src/indexing/indexer.ts` genuinely re-parses **only**
`changed`/`added` files (`:109-112,135-148`), reuses persisted symbols for
unchanged files (`:157-162`), carries over usage edges for untouched files
(`:184-220`), and deletes removed files (`:262-264`). Live `atlas update` on
the repo was ~4.6 s (cold). **However:**
- The scan (whole tree) and `store.loadContext()` (whole 19 MB DB) run on every
  update, so `update` wall-time is dominated by non-parse work.
- `docs/CONTEXT.md` §3 documents the incremental update behavior; the stale
  claim in `docs/AI-BUILDER-INTEGRATION-TEST.md:2.4` is moot — that doc was
  removed with the integration suite (2026-08-16).

### 4.3 Freshness — PASS

`freshness()` compares persisted per-file hashes to the working tree and
reports `fresh/stale/unknown/unavailable` (`packages/sdk/src/context/staleness.ts`).
`files.readRange(path, { expectedHash })` reads the working tree and reports
`versionMatch` on drift. MCP auto-refreshes before reads. **Stale context
cannot silently be served as fresh** — this invariant holds.

### 4.4 Known gaps (documented, not hidden)

- Parser/graph: renamed imports & `export default <expr>` don't resolve
  cross-file (`packages/parser`), pinned by `graph.service.test.ts:227-248`.
- `SymbolIndexer`'s cross-file reference resolution is **not used by the
  production pipeline** — the SDK flattens same-file references into the graph
  (`packages/sdk/src/indexing/indexer.ts:167-168`), so usage edges never point
  at cross-file definitions. Functional but under-utilized code.
- Vector/embedding search is PLANNED (lexical-only today).

### 4.5 Token efficiency (measured via `docs/benchmark.md`)

On the 30-file fixture, five context tasks achieved **52.9–82.2% estimated-token
savings vs the full repo with recall = 1.00 on all five** (baseline 14,420 est.
tokens). Precision is low (0.08–0.20) under the *strict* exact-file metric, but
the "irrelevant" files are contextually useful. Token counts are CodeAtlas'
`chars/4` heuristic — **estimated, never measured**. The natural-language
synonym gap ("authentication" vs "auth") requires the planned embedding scorer.

---

## 5. MCP

- **7 tools, all real, all tested, all protocol-compliant:** `search_symbols`,
  `search_files`, `get_summary`, `get_dependencies`, `explain_module`,
  `project_overview`, `read_file_range` (`packages/mcp/src/tools.ts`, `handlers.ts`).
- Every tool has a zod `inputSchema` + `outputSchema`; the server validates
  `structuredContent` against `outputSchema`; domain errors return `isError:
  true` + text, **no** `structuredContent` (so outputSchema-validating clients
  see real errors, not `-32602`).
- Input bounds: string args capped (10k chars); `intRange` caps ints.
- Auto-refresh freshness guard runs before every read; `freshness` reported on
  results.
- stdio-only (protocol on stdout, logs to stderr), lazy readiness, idempotent
  `close()`, SIGINT/SIGTERM cleanup.
- Security: traversal/malformed/oversized inputs rejected (tested); reads only
  through the Context SDK (no DB access).
- Latency at 30-file scale: 18.9–44.3 ms avg per tool (measured, `docs/benchmark.md`).
- **Scope:** resources/prompts not exposed (documented).

---

## 6. CLI

19 top-level commands, **all registered and wired to real SDK seams** — no
"coming soon" surface is reachable (`printComingSoon` is never called;
`registerTui` is never registered). Verified live: `doctor` (all PASS),
`search`, `context` (build/json), `explain`, `tools` (9-tool catalog),
`agents status` (detects claude/gemini/codex/opencode with versions),
`usage`, `update`. Errors set exit code 1; all data commands support `--json`.

Notable gaps:
- No behavioral tests for `atlas init` / `atlas update` / `atlas mcp` at the CLI
  level (registration only); MCP covered at package level, incremental update at
  the SDK/MCP level.
- `atlas agents status/connect` is implemented but `docs/CLI.md` still lists
  `atlas agents` as "[planned] — not registered".
- `atlas context` ≈ **22 s** on the 395-file audit repo (§Performance).

---

## 7. TUI

**v2 / not shipped — confirmed.** Source exists on disk
(`apps/cli/src/tui/{shell,router,render,guides,io}.ts`, `apps/cli/src/commands/tui.ts`,
`apps/cli/tests/tui.test.ts` 779 lines) but is **git-ignored and untracked**
(`.gitignore:53-55`), `registerTui` is never called, and bare `atlas` prints
help. Fresh clones build without it. A separate untracked `go-tui-app/plan.md`
(Go/Bubbletea spike) has **no code**. Conclusion: the TUI is a private
experiment, correctly excluded from the public surface. It is NOT production
functionality and must not be claimed as such.

---

## 8. Agent Integrations

- **Adapters exist for Claude, Gemini, Codex, OpenCode** (`packages/agents/src/adapters.ts`)
  — detection, `run`/`launch`, arg-array spawn, timeouts, kill escalation,
  Windows `.cmd` shim handling. `atlas claude|gemini|codex|opencode <prompt...>`
  launch with a seeded Context Package (verified help + code).
- **Caveat (honest):** run-mode flags (`-p`, `exec`, `run`) are "common
  documented defaults" and **not live-verified** against each installed CLI
  (`packages/agents/src/adapters.ts:4-8`).
- **MCP agent registration is live-verified** (`docs/MCP_AUDIT.md`): Claude,
  Gemini, Codex, OpenCode read back correctly via their own `mcp list`; Cursor
  and Cline targets are written but read-back unverified.
- Session manager: in-memory only (documented), independent concurrent
  sessions, `captureOutput`/`getSessionOutput`, interactive `stdio:"inherit"`
  handoff.
- **No router, no slash commands** — those remain PLANNED (the orchestrator
  exists in code but is unwired, §Architecture).

---

## 9. Agent Toolkit

All of Tasks 19–24 are genuinely implemented and tested:
- **Registry:** schema-validated `catalog.json` with **9 real tools** (biome,
  ripgrep, uv, semgrep, github-mcp-server, claude, gemini, codex, opencode), all
  honestly `unverified`, + local overlay.
- **Manifest:** versioned, validated, prototype-pollution-safe, 1 MiB bound,
  path-safe names, `.codeatlas/tools/<name>.json`.
- **Compatibility engine:** fail-closed (incompatible ⇒ not installable),
  unknown never guessed, offline + read-only.
- **Installer:** npm/pip/cargo/go only, **argument-array spawn with `shell:false`**
  (adversarial tests assert this), approval always required, compatibility +
  security gates before anything runs, verification + Tool Manifest provenance +
  best-effort rollback. `binary`/`github-release`/`mcp` methods are declared but
  not executable (by design).
- **Configurator:** Claude/Gemini/Codex/OpenCode/MCP/VS Code adapters with
  merge/backup/rollback/dry-run.
- **Security/Trust:** offline checks, five exact trust states, hostile-input
  rejection, fail-closed installer gating.
- `atlas tools` surface verified live. `/tools` slash + `atlas setup` = PLANNED.

---

## 10. Security

Secrets scan (633 files) found **no real secrets**; all `sk-`/`api_key` hits are
legitimate config reads or test fixtures. **No `.env` files exist.**

Positive:
- **No `shell: true`** anywhere in package source (0 matches). All 17 `exec(`
  matches are SQLite `db.exec()` DDL. Argument-array spawning enforced.
- Deny-filter in context assembly blocks `.env*`/keys/credentials; secret
  redaction in captured install output; API keys never logged; Gemini key goes
  in the URL query string (a design note — leaks into logs/proxies more readily
  than a header).
- Provider keys read only from env or `~/.codeatlas/providers.json` (written
  `0o600`), never the repo.
- MCP/installer reject traversal, malformed and oversized input.

Issues:
- **HIGH — provider adapters do not catch transport errors.** `fetch` failure
  (offline/DNS/refused) rejects and propagates as an unhandled rejection
  instead of a `Result` failure (`packages/providers/src/adapters/anthropic.ts:37`,
  `gemini.ts:38`, `openai-compatible.ts:47`, `ollama.ts:48`; `ProviderService.complete`
  has no try/catch either; `SummaryService.generate` doesn't catch).
- **MEDIUM — `docs/DESIGN.md` case-collision:** `.gitignore:39` ignores
  `docs/Design.md` (mixed case) but the file is `docs/DESIGN.md`; on macOS/Linux
  it will appear untracked and `git add .` could commit it.
- **INFO — `searchContext` empty query** returns every row (contract
  inconsistency, no production caller today).
- **INFO — session manager is in-memory** (no persistence across restarts).

---

## 11. Performance

Measured on the audit repo (395 files / 8740 symbols / 19 MB DB + 11 MB WAL):

| Operation | Wall time |
| --- | --- |
| `atlas search` (cold CLI) | ~2.5 s |
| `atlas update` (incremental, cold) | ~4.6 s |
| `atlas context` build | **~22 s** |
| Context SDK `status()` (first read, loads whole snapshot) | ~4.5 s |
| Context SDK `search` (re-indexes snapshot) | ~1.1 s |
| Context SDK `getRelevantContext` | ~4.7 s |

Measured 2026-08-16 on `benchmark-repos/05-large-project` (4,560 TS files /
~409k lines, stress test):

| Operation | Wall time | Peak RSS |
| --- | --- | --- |
| `atlas init` (full first scan, cold) | **~94 s** | ~3.7 GB |
| `atlas update` (steady-state, 0–2 files changed) | ~25 s | ~3.2 GB |
| `atlas search` (cold CLI) | ~4 s | ~0.75 GB |
| `atlas context build` (cold CLI) | ~10.5 s | ~1.1 GB |
| `atlas scan` (no indexing) | ~0.7 s | ~50 MB |

Indexed 4,750 files / 138,466 symbols / 204,638 dependency edges; DB ~228 MB
(compact + VACUUM reduces it; VACUUM alone ≈ 4 s). Incremental add / modify /
delete all detected correctly. Search relevance holds at scale (specific
queries rank matching files first).

At fixture scale (30 files) search is 9–30 ms and all MCP tools < 45 ms
(`docs/benchmark.md`). At 10k files / 500k lines: first scan 52.6 s, search
avg 513 ms, **RSS ~1.5 GB** (documented).

**Actual bottleneck:** ts-morph parsing is single-threaded (each file parses
serially on one thread; the `mapWithConcurrency` around it only overlaps I/O).
On the 4,560-file fixture parsing alone is ~41 s of the ~94 s first scan.
Secondary costs: the full snapshot is materialized into JS objects on every
read (`loadContext`), every `update` rewrites the whole DB in one transaction
followed by VACUUM (~4 s), and the in-memory search index retains ~2× the file
text. These dominate the steady-state `update` cost (~25 s even with no
changes) and RSS (~3.7 GB on the first scan, ~3.2 GB on update).

The highest-leverage fix for 5,000+ files is moving ts-morph parsing to
`worker_threads` (per-worker `Project`), which would cut the first-scan parse
step from ~41 s toward ~4–8 s on multi-core machines.

---

## 12. Testing

- **Unit: 899 tests / 88 files — all pass** (`pnpm test`, 40.6 s). Every package
  has tests; all 7 MCP tools have protocol-level and E2E tests; security-critical
  claims (arg-array spawn, approval gates, traversal rejection) are asserted.
- **Integration: `tests/integration/*` (00–09, "36 tests") — REMOVED (2026-08-16).**
  It passed locally for the author but hard-wired `test-repo/AIbuilder`
  (`tests/integration/helpers.ts:11`), a gitignored external fixture that is not
  anonymously cloneable, so CI failed on the clone step. The suite, its config,
  its CI job, and its docs were deleted; the defects it caught (search scoring,
  Windows path normalization, SDK stopwords, incremental cost claims) are fixed
  and covered by unit tests.
- **Coverage gaps:**
  - No `packages/search/tests/scoring.test.ts` (damping factors untested) or
    `search-index.test.ts`.
  - `ContextBuilderService` — no failure-propagation / dedup-multi-hit / no-limit
    tests.
  - `packages/summary` — no `summarizeModule` test, no provider-failure test.
  - `packages/providers` — no network-error test (which would currently fail,
    confirming §10).
  - `packages/storage` — no test for the deleteFile dangling-edge bug (§Critical),
    no `searchContext` empty-query/case tests.
  - CLI — no behavioral tests for `init`/`update`/`mcp`.
  - Extension chat module is *tested* but is dead code in production.
- Benchmarks (`tests/benchmarks/mcp-benchmark.ts`) are tracked but not wired to
  a script or CI.

---

## 13. Documentation

The docs system is unusually extensive and mostly accurate, but **contains
stale claims that directly contradict code** — the worst was the `@atlas/context`
"[STUB]" claim. **All rows below have been corrected in code/docs as of
2026-08-16** (verified against the current tree):

| Doc | Stale claim | Reality |
| --- | --- | --- |
| `docs/CURRENT_STATE.md` | `@atlas/context` is an intentional stub throwing `ComingSoonError` | Fully implemented (`context-builder.service.ts`); `FEATURE_STATUS.md`, `ADR-001` (status "superseded"), `CONTEXT.md` are correct |
| `docs/MODULES.md:109` | same stub claim | same — now `[IMPLEMENTED]` |
| `docs/ARCHITECTURE.md:89` | "INTENTIONAL STUB" | corrected to "deterministic rank-and-assemble" |
| `docs/decisions/ADR-005.md` | "`@atlas/context` remains the untouched stub" | corrected — deterministic rank-and-assemble |
| `docs/TESTING.md:45` | tests assert `ComingSoonError` | tests assert ranked output |
| `docs/decisions/README.md` (ADR index) | ADR-001 "intentionally a stub" | superseded |
| `packages/context/README.md` | "Status: stub" | deterministic rank-and-assemble (ADR-001) |
| `README.md` | "context/ # Context rank/assembly (intentional stub)" | corrected |
| `docs/ROADMAP.md:78` | `@atlas/context` **[STUB] — implement** | corrected to **[IMPLEMENTED]** |
| `docs/FINAL-MVP-AUDIT.md:57` | "remains an intentional ADR-001 stub" | corrected with note |

Also: `docs/DESIGN.md`, `docs/FINAL-MVP-AUDIT.md`, `docs/PRINCIPLES.md`,
`docs/decisions/README.md` are orphaned/stale and not in the
`DOCUMENTATION_MAP.md`. Implemented-but-undocumented: nothing significant —
the doc set is ahead of the code in breadth but behind in a few facts.

---

## 14. Open Source Readiness

A new developer CAN: discover (README is solid), install
(`npm i -g codeatlas-cli`), init (`atlas init`), search, build context, run
`atlas mcp`, and use `atlas doctor`/`atlas explain` without asking the author —
**all verified live**. Blockers to a clean public release:

1. **Fresh-clone integration suite failure** (gitignored fixture, no guards).
2. **No Windows/macOS CI** (Windows-specific path/.cmd logic unexercised in CI;
   only Ubuntu).
3. **No issue/PR templates; no security-policy versioning; no git tags; no
   changelog link to tags; no release workflow** (publishing is manual).
4. **Stale docs** (§13) contradict the repository's own "docs = truth" rule.
5. **Tracked dead code** (extension chat module) will confuse contributors.
6. `@atlas/*` packages are not npm-publish-ready (no `publishConfig`,
   no `license`/`repository`/`keywords`; scope externally owned).
7. Versioning story: only the CLI is versioned; `@atlas/*` all `0.0.0`.

---

## 15. Build / Release

- `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`
  all pass. tsup produces ESM+CJS+DTS per package; the CLI bundle is
  self-contained (0 `require("@atlas/…")`).
- `pnpm release:cli` works (published 0.2.1 on npm). No automated release,
  no tags, no `changesets` (CHANGELOG is hand-maintained, Keep-a-Changelog).
- Minor: `tsup.config.base.ts` alias map omits `@atlas/summary` (works in
  practice); `apps/cli` has an unused `ts-morph` devDependency.

---

## 16. Dead Code / Cleanup Inventory

| Item | Classify | Note |
| --- | --- | --- |
| `ComingSoonError` (`packages/shared`) | KEEP as API, fix docs | exported, never instantiated; only stale docs reference it |
| Extension `apps/extension/src/chat/*` + `tests/{chat-*,slash}.test.ts` + `chat-fakes.ts` | REMOVE or WIRE | tracked, tested, never reachable (not in `contributes`, not imported by activation) |
| `apps/cli/src/commands/coming-soon.ts` | REMOVE or leave as helper | `printComingSoon` never called |
| `apps/cli/src/tui/*`, `commands/tui.ts`, `tests/tui.test.ts` | ARCHIVE (untracked, on disk) | documented v2 experiment; keep out of git |
| `go-tui-app/plan.md` | ARCHIVE/GITIGNORE | planning notes only, gitignored |
| `ui/` (untracked Next.js site) | DECIDE | gitignored but a `pnpm-workspace` member; remove from workspace or track |
| `test-repo/AIbuilder` | GITIGNORE (fixture) | **REMOVED (2026-08-16)** — not publicly cloneable in CI; deleted with the integration suite |
| `docs/DESIGN.md`, `docs/FINAL-MVP-AUDIT.md`, `docs/PRINCIPLES.md`, `docs/decisions/README.md` | ARCHIVE or UPDATE | stale/orphaned; fix `Design.md` case-collision in `.gitignore` |
| `build.log`, `install.log`, `apps/cli/.release/*.tgz` | GITIGNORE | already ignored |
| `PROMPTS.md` | DECIDE | tracked but listed in `.gitignore` (dead entry) |

---

## 17. Critical Findings

1. **Storage `deleteFile` leaves dangling symbol edges.** In
   `packages/storage/src/context-store.ts:234-253`, `files.deleteByPath` (line 239)
   cascades `Symbols` rows, then `symbols.byFile(fileId)` (line 246) is called
   AFTER the cascade — always empty — so `Dependencies`/`Relationships` edges
   pointing at deleted symbols are never removed (only the file-node edges are).
   `deleteSymbol` (line 255) does it correctly. The existing test only asserts
   the file-node edge. **Impact:** incremental updates / file deletion can leave
   stale graph edges (dangling references to dead symbols), i.e. stale context
   silently surviving. **Fix:** collect symbol ids *before* the cascade.
   **Status: **[RESOLVED]** — fixed in `5c6de7c`; symbol node ids are collected
   before the cascade and every touching edge is removed, with a regression test
   asserting symbol-node edges are dropped while unrelated edges survive.**
2. **Provider adapters swallow nothing but also catch nothing.** Network
   failures throw unhandled rejections through
   `ClaudeAdapter/GeminiAdapter/OpenAIAdapter/DeepSeekAdapter/OllamaAdapter.complete`
   (e.g. `packages/providers/src/adapters/anthropic.ts:37`), `ProviderService.complete`,
   and `SummaryService.generate`. Any offline/refused/blocked provider call
   crashes rather than returning a `Result` failure. No test covers this path.
   **Status: **[RESOLVED]** — fixed in `1f08457`; every adapter wraps its
   transport calls and returns `fail(new ProviderNetworkError(...))`, with
   regression tests covering all built-in providers, `listModels`, and the
   non-2xx path.**

## 18. High-Priority Findings

3. **`atlas context` ≈ 22 s on a 395-file repo** — repeated whole-snapshot loads
   inside one command (§Performance). Hurts the flagship UX.
4. ~~**Documentation truth failure:** 8+ files claim `@atlas/context` is a stub
    (§13). This is the audit's most consequential finding because the repo's
    trust mechanism is "docs = ground truth".~~ **RESOLVED (2026-08-16)** — every
    remaining `@atlas/context` stub claim (ARCHITECTURE, ROADMAP, FINAL-MVP-AUDIT,
    ADR-005 index row, DOCUMENTATION_AUDIT index row) corrected; §13 table updated.
5. ~~**Extension chat module is tracked dead code** that appears implemented.~~
    **RESOLVED (2026-08-16)** — `apps/extension/src/chat/*` and its tests
    (`chat-commands`/`chat-panel`/`chat-webview`/`slash`/`chat-fakes`) were
    removed; the extension never imported them and contributed no chat commands.
6. **`docs/DESIGN.md` case-collision** in `.gitignore` — a latent untracked-file
   / accidental-commit hazard on case-sensitive filesystems.
7. ~~**`searchContext` empty query returns all rows** + LIKE(CI)/scoring(CS)
    mismatch can yield score-0 hits (`context-store.ts:154-173,359-368`). No
    production caller today; latent.~~ **RESOLVED (2026-08-16)** — empty queries
    now return no hits, and scoring/snippets are case-insensitive to match the
    LIKE filter; regression tests cover both.

## 19. Medium-Priority Findings

8. ~~Parser/graph renamed-import & `export default <expr>` gaps (documented,
   tested as a known limitation).~~ **RESOLVED (2026-08-16)** — renamed imports
   (`import { a as b }`) and `export default <expr>` now resolve cross-file via
   the import symbol's `importedName`, mirrored in both `@atlas/parser` and
   `@atlas/graph`; regression tests added.
9. `SymbolIndexer` cross-file resolution unused by production pipeline (INFO+).
   — **INFO**, intentional (graph keeps its own documented copy;
   `module-resolution.ts`); unchanged.
10. ~~Engine note omits `@atlas/usage` (also needs Node ≥22.5.0).~~
    **RESOLVED** — `docs/DEVELOPMENT.md` now lists `@atlas/usage` alongside
    `@atlas/storage`.
11. ~~Integration suite not in CI and fails on fresh clone (also a release
    blocker, §14).~~ **RESOLVED (2026-08-16)** — the external fixture-dependent
    suite (`test-repo/AIbuilder`) was removed; the remaining `*integration*`
    tests use temp dirs, run under `pnpm check`, and CI runs `pnpm check`.
12. `@atlas/*` packages not publish-ready; versioning `0.0.0` everywhere except
    CLI; no tags/release automation; no issue/PR templates. — **INFO**, unchanged.
13. ~~Duplicated scoring (`context-store.ts` vs `@atlas/search`) with divergent
    constants/semantics; duplicated provider `chatCompletionContent/Usage`
    helpers.~~ **PARTIAL (2026-08-16)** — duplicated provider helpers extracted
    into `packages/providers/src/parse.ts` (shared by the OpenAI-compatible and
    Ollama adapters). The storage `searchContext` scoring duplication is
    architectural (`@atlas/storage` may not import `@atlas/search`); its
    constants were aligned case-insensitively with the LIKE filter (finding #7).
14. ~~`summarizeScope` fails fast on the first per-file summary failure.~~
    **RESOLVED** — per-file failures now drop that file from the scope instead
    of aborting it; the scope summary still runs, and a scope with no successful
    files returns the last error. Regression tests cover both paths.
15. `atlas update` scan/hash/DB-load still full-tree (parse is incremental).
    **ASSESSED (2026-08-16)** — measured on this repo (7,638 files): hashing is
    parallel (`mapWithConcurrency`) and fast (~323 ms), a plain recursive walk
    is ~84 ms, and the 5.4 s scan is dominated by the repo's own
    `benchmark-repos/` fixtures (7,058 files) plus per-file gitignore matching,
    not by the production path. A full-tree scan is required to detect
    additions/deletions, so the parse-incremental design is sound. A stat-based
    hash fast-path would save only the ~300 ms hash step and is not worth the
    cross-cutting change (core type + scanner + hashing schema + storage
    migration); deferred.
16. Benchmarks not wired to a script/CI; only Linux CI (Windows logic
    unexercised). **PARTIAL (2026-08-16)** — `pnpm benchmark` /
    `pnpm benchmark:single <repo>` scripts added; still not run in CI.

## 20. Low-Priority / INFO

17. ~~Unused `ts-morph` devDep in `apps/cli`; `tsup.config.base.ts` missing
    `@atlas/summary` alias.~~ **PARTIAL (2026-08-16)** — `@atlas/summary` alias
    added to `tsup.config.base.ts`. `ts-morph` is a real runtime dependency of
    `apps/cli` (the bundled parser imports it; it stays `external` in tsup), so
    the "unused devDep" half of the claim is outdated.
18. `status().hasApiKey` for Ollama always `true` (misleading name only);
    Gemini key in URL query string. — **INFO**, unchanged (CLI already renders
    Ollama as "local (no key)").
19. `metadata.prompt` recorded as `null` for default prompts in summaries;
    cache entries loaded from a corrupt-but-parseable file never expire.
20. ~~Dead `.gitignore` entries (`PROMPTS.md`, `!.vscode/extensions.json`).~~
    **RESOLVED** — the `PROMPTS.md` entry is already gone from `.gitignore`;
    `!.vscode/extensions.json` is the negation of `.vscode/*` and is inert
    (no `.vscode/` tree in the repo).
21. `cache.service.ts` swallowed exceptions (documented best-effort) — acceptable.

---

## 21. Missing Features (roadmap, not defects)

- Interactive slash surface / agent router (TUI v2 or `atlas agents` launch).
- `atlas setup`; `/tools` slash integration; tool benchmarking/recommendation.
- Non-TypeScript parsers; cross-file renamed-import/default-export resolution.
- Vector/embedding search.
- MCP resources/prompts; editor integrations beyond VS Code (JetBrains).
- Streaming provider completions; verified model catalogs/pricing.
- Session persistence across restarts; CI Windows/macOS; automated releases.

## 22. Broken Features

- None found that are *claimed as working but actually broken* in the shipped
  surface. The two real bugs (§17) are latent (deleteFile edges; provider
  network errors) — neither was hit in normal path smoke tests, but both are
  reachable.

## 23. Production Risks

1. Provider network robustness (crash on offline) — affects `--ai` paths,
   `search --ai`, `explain --ai`, summaries.
2. Stale graph edges after file deletion — context quality decays silently on
   long-lived indexes.
3. `atlas context` latency at larger repos grows with repeated full loads.
4. In-memory search index memory (1.5 GB @ 500k lines) — documented trade-off.
5. Integration suite fragility (fixture coupling) undermines CI confidence.

## 24. Recommended Roadmap

**Immediate (before broader release):**
1. Fix the two critical bugs (deleteFile edge ordering; catch transport errors).
   — **DONE (2026-08-16):** `context-store.deleteFile` now resolves symbol node
   ids before the file-row cascade; every provider adapter wraps transport
   calls in a new `ProviderNetworkError`. Regression tests added.
2. Correct the stale `@atlas/context` docs (CURRENT_STATE, MODULES, ARCHITECTURE,
   ADR-005, TESTING, package README, root README, decisions index) — this is a
   ~30-minute task with outsized trust value.
   — **DONE (2026-08-16):** 8+ docs corrected; also fixed the version/subcommand
   count/engine/`atlas agents`/`atlas providers`/`atlas ollama` claims.
3. Remove or wire the extension chat module; decide fate of `ui/`; fix
   `Design.md` gitignore case. — **PARTIAL:** `.gitignore` case-collision fixed
   (`docs/Design.md` → `docs/DESIGN.md`) and the dead `PROMPTS.md` entry
   removed. Extension `chat/*` removal and `ui/` fate remain maintainer
   decisions (deferred).
4. Wire `pnpm test:integration` into CI with a checked-in or downloaded fixture;
   add a Windows runner. — **DONE then REVERTED (2026-08-16):** CI gained an
   `integration` job cloning the `test-repo/AIbuilder` fixture, but the fixture
   is **not anonymously cloneable** (`fatal: could not read Username` in CI), so
   the job was removed. The entire external integration suite (`tests/integration/*`,
   `vitest.integration.config.ts`, `docs/AI-BUILDER-INTEGRATION-TEST.md`,
   `test:integration` script, gitignore/eslint entries) was **deleted**; the
   defects it found are fixed and unit-tested. A Windows runner is not yet added.

**Short term:**
5. Add a session-level snapshot cache in the Context SDK to kill the repeated
   whole-DB loads (`atlas context` should drop to a few seconds).
6. Add the missing unit tests that would have caught the two bugs
   (storage delete-edge; provider network failure).
7. Add `searchContext` empty-query guard + case-consistent scoring; add
   `scoring.test.ts`.
8. Publish `@atlas/*` properly (publishConfig + npm metadata) or document them
   as private; version them.

**Medium term:**
9. Wire the orchestrator (`atlas agents launch` or slash surface) — the code is
   ready; only consumers are missing.
10. Vector scorer behind `RelevanceScorer`; verify provider model catalogs;
    live-verify agent run flags per installed CLI.
11. Per-command behavioral CLI tests; benchmark wiring; release automation
    (tags + changelog + GitHub Actions publish).

---

## 25. Final Answers

1. **Overall health score:** 7.4 / 10 (strong, tested core; documentation
   truth + two latent bugs + release-hygiene gaps hold it below production-perfect).
2. **Feature completion:** Direction A (Context Engine) ≈ 90%; Direction B
   (AI CLI Orchestrator) ≈ 45% (implemented but unwired); Direction C
   (Agent Toolkit) ≈ 75%. Weighted overall ≈ 70%.
3. **Critical findings:** storage `deleteFile` dangling symbol edges;
   provider adapters don't catch network/transport errors.
4. **High-priority findings:** `atlas context` latency; the 8+ stale
   `@atlas/context`-is-a-stub docs; tracked dead extension chat module;
   `Design.md` gitignore case hazard; `searchContext` empty-query/case bugs.
5. **Security findings:** no secrets, no `shell:true`, deny-filter + redaction +
   approval gates all verified. Risks: provider transport crashes; Gemini key in
   URL; session manager in-memory.
6. **Architecture findings:** clean, enforced port/dependency discipline; no
   cycles; future directions need no rewrite. Risks: SDK god-object; in-memory
   search re-index; FK-less graph edges.
7. **Context-quality findings:** incremental parse verified; freshness invariant
   holds; stale-context doc claims disproven; token savings 53–82% with recall
   1.00 (estimated); dangling-edge bug can silently degrade graph on deletes.
8. **Test-coverage gaps:** storage delete-edge, provider network errors,
   `@atlas/search` scoring, context builder edge cases, CLI init/update/mcp,
   `summarizeModule`; the external integration suite was removed (2026-08-16).
9. **Documentation gaps/staleness:** §13 table (the `@atlas/context` stub claim
   is the standout); version/engine/subcommand-count drift; `CLI.md` agents row.
10. **Release blockers:** fresh-clone integration failure; no Windows CI;
    stale docs; dead tracked code; no release automation/tags/templates;
    `@atlas/*` not publish-ready.
11. **Recommended next actions:** §24 Immediate (1)–(4) first — two bug fixes,
    doc correction, dead-code cleanup, CI fixture + Windows runner — then the
    short-term performance (Context SDK snapshot cache) and test additions.

---

*Produced by an independent audit agent, 2026-08-15. Evidence lives in the
feature matrix (`docs/AUDIT_FEATURE_MATRIX.md`) and the cited source files.*