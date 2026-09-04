# CodeAtlas — Feature Inventory Audit Matrix

> **Purpose:** independent feature-inventory audit of the CodeAtlas codebase
> (branch `main` @ `593d6bb`, 2026-08-15). Every row below was verified against
> source, tests, and (where cheap) live CLI behavior. "PASS" requires working
> code + tests. "Claimed" means the feature is described in README / docs /
> `CURRENT_STATE.md` / CLI help / package descriptions.
>
> **Columns:** Status tag (IMPLEMENTED / PARTIAL / PLANNED / BROKEN / STUB /
> DEAD CODE), evidence (files), and a release-readiness verdict.

## Legend

- **PASS** — implemented, tested, observed working.
- **PASS (gap)** — implemented and tested but with a documented/known gap.
- **PARTIAL** — real code exists but surface is incomplete or unwired.
- **PLANNED** — documented goal, no code.
- **STUB** — interface exists, throws `ComingSoonError`/prints placeholder.
- **BROKEN** — code exists but does not do what it claims.
- **DEAD CODE** — exists but never reached from production entry points.
- **NOT MEASURED** — not exercised during this audit.

---

## 1. Foundation & core pipeline

| Feature | Claimed | Implemented | Tested | Live-checked | Verdict |
| --- | --- | --- | --- | --- | --- |
| `@atlas/shared` (Result, branded types, errors, VERSION) | Yes | Yes | Yes | Yes | **PASS** |
| `@atlas/core` ports & domain entities | Yes | Yes | Yes | Yes | **PASS** |
| `ComingSoonError` | Yes | Yes (exists) | — | No | **DEAD CODE** — exported but never instantiated anywhere; only stale docs reference it |
| Scanner (`@atlas/scanner`) | Yes | Yes | Yes | Yes (`atlas scan`) | **PASS** |
| Manifest generation (`.codeatlas/manifest.json`) | Yes | Yes | Yes | Yes | **PASS** |
| File hashing & snapshots (`@atlas/hashing`) | Yes | Yes | Yes | Yes | **PASS** |
| TypeScript parser (`@atlas/parser`) | Yes | Yes (TS only) | Yes | Yes | **PASS** — renamed & default imports resolve cross-file; other languages PLANNED |
| Symbol extraction & in-memory indexer | Yes | Yes | Yes | Yes | **PASS (gap)** — `SymbolIndexer` cross-file resolution is NOT used by the production pipeline (SDK feeds same-file refs into graph) |
| Dependency graph (`@atlas/graph`) | Yes | Yes | Yes | Yes | **PASS** — renamed & default import resolution matches the parser |
| SQLite context DB (`@atlas/storage`) | Yes | Yes | Yes | Yes | **PASS** — file deletion cleans up symbol edges (fixed); `searchContext` guards empty queries and scores case-insensitively |
| Migrations/versioning | Yes | Yes | Partial | Yes | **PASS** — single v1 migration, idempotent, transaction-wrapped |
| Search (`@atlas/search`) | Yes | Yes | Yes | Yes | **PASS** — `searchContext` (DB fallback) guards empty queries and scores case-insensitively; no embeddings (RelevanceScorer seam only) |
| AI summaries (`@atlas/summary`) | Yes | Yes | Yes | Partial | **PASS** — scope summaries skip failed per-file summaries instead of aborting; `summarizeModule` not directly tested |
| Cache (`@atlas/cache`) | Yes | Yes | Yes | Yes | **PASS** |
| Providers (`@atlas/providers`) | Yes | Yes | Yes | Partial | **PASS** — transport failures return `Result` (`ProviderNetworkError`); default model ids maintained current; no streaming |
| **`@atlas/context` (rank & assemble)** | **Yes — as "[STUB]" in docs** | **Yes (fully implemented)** | **Yes** | **Yes** | **PASS — DOCS WRONG.** `ContextBuilderService` is a real deterministic rank-and-assemble (`build`/`sourceFile`). 7+ docs still claim it throws `ComingSoonError` (see FULL_AUDIT §Documentation). |

## 2. SDK & Context API

| Feature | Claimed | Implemented | Tested | Live-checked | Verdict |
| --- | --- | --- | --- | --- | --- |
| `Container` composition root (`@atlas/sdk`) | Yes | Yes | Yes | Yes | **PASS** |
| `createContextSDK` (files/symbols/deps/modules/summaries/search/project/status/freshness) | Yes | Yes | Yes | Yes | **PASS** |
| `createSessionManager` | Yes | Yes | Yes | Yes | **PASS** |
| `createUsageService` | Yes | Yes | Yes | Yes | **PASS** |
| `createToolkitSDK` / registry / compatibility / installer / configurator | Yes | Yes | Yes | Yes | **PASS** |
| `createOrchestrator` (multi-agent plan executor) | Yes | Yes (code) | Yes | No | **PARTIAL** — fully implemented and tested, but **zero production consumers** (no CLI/extension wiring; Direction B router still PLANNED) |
| SDK-owned incremental indexer (`indexProject`) | Yes | Yes | Yes | Yes (`atlas update`) | **PASS** — parse-only-changed verified in code; scan/hash/DB-load remain full-tree |
| Context → Agent integration (`createContextIntegration`, ADR-008) | Yes | Yes | Yes | Yes | **PASS** |
| Staleness detection / `freshness()` | Yes | Yes | Yes | Yes | **PASS** |

## 3. MCP server

| Feature | Claimed | Implemented | Tested | Live-checked | Verdict |
| --- | --- | --- | --- | --- | --- |
| stdio server (JSON-RPC 2.0, `@modelcontextprotocol/sdk`) | Yes | Yes | Yes | Yes | **PASS** |
| `search_symbols` | Yes | Yes | Yes | Yes | **PASS** |
| `search_files` | Yes | Yes | Yes | Yes | **PASS** |
| `get_summary` | Yes | Yes | Yes | Yes | **PASS** |
| `get_dependencies` | Yes | Yes | Yes | Yes | **PASS** |
| `explain_module` | Yes | Yes | Yes | Yes | **PASS** |
| `project_overview` | Yes | Yes | Yes | Yes | **PASS** |
| `read_file_range` (version-aware) | Yes | Yes | Yes | Yes | **PASS** |
| `outputSchema` on every tool / `structuredContent` validation | Yes | Yes | Yes | Yes | **PASS** |
| Auto-refresh (freshness guard) before reads | Yes | Yes | Yes | Yes | **PASS** |
| `codeatlas-mcp` bin + `atlas mcp` | Yes | Yes | Yes | Yes | **PASS** |
| Resources / prompts | No | No | — | — | **PLANNED** (tools only; documented) |

## 4. CLI (`apps/cli`)

| Feature | Claimed | Implemented | Tested | Live-checked | Verdict |
| --- | --- | --- | --- | --- | --- |
| `atlas init` / `build` / `update` | Yes | Yes | Partial | Yes | **PASS (gap)** — no behavioral CLI tests for `init`/`update` (only registration); covered at the SDK level by `packages/sdk/tests/indexing` + MCP audit fixtures |
| `atlas scan` | Yes | Yes | Yes | Yes | **PASS** |
| `atlas search` (+ `--ai`, `--json`) | Yes | Yes | Yes | Yes | **PASS** |
| `atlas mcp` | Yes | Yes | Partial | Yes | **PASS (gap)** — no CLI-level behavioral test (covered at package level) |
| `atlas sessions list/info/stop` | Yes | Yes | Yes | Yes | **PASS** |
| `atlas usage` (summary/list/budgets) | Yes | Yes | Yes | Yes | **PASS** |
| `atlas providers` / `atlas ollama` | Yes | Yes | Yes | Yes | **PASS** |
| `atlas agents status/connect` | Yes | Yes | Yes | Yes | **PASS** — live-verified against installed CLIs (`claude mcp list` etc.); Cursor/Cline read-back not verified |
| `atlas tools` (overview/search/info/install/remove/update/configure/doctor) | Yes | Yes | Yes | Yes | **PASS** |
| `atlas context build/explain/json/launch/attach` | Yes | Yes | Yes | Yes | **PASS** |
| `atlas claude/gemini/codex/opencode <prompt...>` | Yes | Yes | Yes | Yes | **PASS** |
| `atlas explain` | Yes | Yes | Yes | Yes | **PASS** |
| `atlas doctor` | Yes | Yes | Yes | Yes | **PASS** |
| `atlas tui` | **v2 / not shipped** | On disk only | Untracked tests | No | **PARTIAL / untracked** — source exists on disk but is git-ignored, never registered (`registerTui` unreachable), fresh clones build without it |
| `atlas config` | docs say [planned] | No | — | — | **PLANNED** |
| `atlas setup` | docs say [planned] | No | — | — | **PLANNED** |

## 5. VS Code extension (`apps/extension`)

| Feature | Claimed | Implemented | Tested | Live-checked | Verdict |
| --- | --- | --- | --- | --- | --- |
| 5 tree views + activity bar | Yes | Yes | Yes | No | **PASS** (headless-tested) |
| 10 `codeatlas.*` palette commands | Yes | Yes | Yes | No | **PASS** |
| Status-bar indicator | Yes | Yes | Yes | No | **PASS** |
| Reads only via Context SDK | Yes | Yes | Yes | — | **PASS** |
| Agent chat panel (`chat/*`, `codeatlas-chat`) | Not claimed | ~~Yes (code)~~ | — | No | **REMOVED (2026-08-16)** — tracked dead code, never imported by activation or contributed in `package.json`; deleted with its tests |

## 6. Agents / sessions / orchestrator

| Feature | Claimed | Implemented | Tested | Live-checked | Verdict |
| --- | --- | --- | --- | --- | --- |
| `AgentPort` adapters (claude/gemini/codex/opencode) | Yes | Yes | Yes | Yes | **PASS (gap)** — run flags are "common documented defaults", not live-verified against each installed CLI |
| Executable detection (Windows PATHEXT aware) | Yes | Yes | Yes | Yes | **PASS** |
| ProcessRunner (arg-array spawn, timeout, kill) | Yes | Yes | Yes | Yes | **PASS** |
| SessionManager (`SessionPort`) | Yes | Yes | Yes | Yes | **PASS** — in-memory only (documented) |
| Interactive `stdio:"inherit"` terminal handoff | Yes | Yes | Yes | No | **PASS** (code + tests) |
| Orchestrator router / slash commands (`/claude`…) | Yes (as planned) | No (router) | — | — | **PLANNED** — `createOrchestrator` exists but has no app wiring |

## 7. Agent Toolkit (`@atlas/toolkit`)

| Feature | Claimed | Implemented | Tested | Live-checked | Verdict |
| --- | --- | --- | --- | --- | --- |
| Tool Registry (Task 19) + `catalog.json` (9 tools) | Yes | Yes | Yes | Yes | **PASS** |
| Tool Manifest (Task 20) | Yes | Yes | Yes | Yes | **PASS** |
| Compatibility Engine (Task 21) | Yes | Yes | Yes | Yes | **PASS** |
| Installer (Task 22: npm/pip/cargo/go, approval-gated, arg-array spawn) | Yes | Yes | Yes | No (dry-run only) | **PASS** — `binary`/`github-release`/`mcp` install methods declared but not implemented (by design) |
| Configurator (Task 23) | Yes | Yes | Yes | Yes | **PASS** |
| Security/Trust assessor (Task 24) | Yes | Yes | Yes | Yes | **PASS** |
| `/tools` slash surface, `atlas setup` | Yes (as planned) | No | — | — | **PLANNED** |

## 8. Usage & credits (`@atlas/usage`)

| Feature | Claimed | Implemented | Tested | Live-checked | Verdict |
| --- | --- | --- | --- | --- | --- |
| Tri-state actual/estimated/unknown tokens & cost | Yes | Yes | Yes | Yes | **PASS** |
| Budgets (soft) vs limits (hard, fail-safe) | Yes | Yes | Yes | Partial | **PASS** |
| `UsageStore` (`.codeatlas/usage.db`, separate DB) | Yes | Yes | Yes | Yes | **PASS** |
| `withUsageTracking` / `trackAgentRun` | Yes | Yes | Yes | Partial | **PASS** |
| Built-in pricing (estimated only) | Yes | Yes | Yes | Yes | **PASS (gap)** — entries follow current default model ids; no Ollama pricing entry |

## 9. Tests & integration

| Feature | Claimed | Implemented | Tested | Live-checked | Verdict |
| --- | --- | --- | --- | --- | --- |
| Unit suite (`pnpm test`) | Yes | Yes | 899 tests / 88 files | **Yes — all pass** | **PASS** |
| Typecheck / lint / format (`pnpm check`) | Yes | Yes | — | **Yes — all pass** | **PASS** |
| Build (`pnpm build`) | Yes | Yes | — | **Yes — passes** | **PASS** |
| MCP tool tests (all 7 tools) | Yes | Yes | Yes | Yes | **PASS** |
| External integration suite (`tests/integration`, `test-repo/AIbuilder`) | Yes | Yes | Yes | Removed | **REMOVED (2026-08-16)** — depended on a gitignored external fixture not cloneable in CI; deleted with its wiring (`pnpm test:integration`, `vitest.integration.config.ts`) |
| Benchmarks (`tests/benchmarks/mcp-benchmark.ts`) | Yes | Yes | Manual | Partial | **PARTIAL** — tracked but not wired to a script, not run in CI |

## 10. Distribution & release

| Feature | Claimed | Implemented | Tested | Live-checked | Verdict |
| --- | --- | --- | --- | --- | --- |
| Published `codeatlas-cli` (v0.2.1) | Yes | Yes | Yes | Yes | **PASS** — self-contained bundle (tsup inlines `@atlas/*`; zero `require("@atlas/…")`) |
| `@atlas/*` scoped packages publishable | Implicit | Partially | — | — | **PARTIAL** — no `publishConfig`, no license/repository fields; `@atlas` scope externally owned → deliberately unpublished |
| CI (`pnpm check` on push/PR) | Yes | Yes | Yes | Yes | **PASS (gap)** — no Windows runner, no publish, no tags, no coverage |
| GitHub issue/PR templates | — | No | — | — | **PLANNED** |

## 11. Cross-cutting verdicts

- **Broken/incorrect claims in docs:** `@atlas/context` "[STUB]" (7 docs) — the single most important doc-vs-code mismatch; version "0.0.0 everywhere" (CLI is 0.2.1); "twelve top-level subcommands" (19 registered); engine note omits `@atlas/usage` (also needs Node ≥22.5.0); AI-builder doc's "update re-parses every file" is stale (now truly incremental).
- **Dead code shipped in the repo:** `ComingSoonError`; extension `chat/*` module; `apps/cli/src/commands/coming-soon.ts` (`printComingSoon` never called); untracked TUI source (kept on disk); `ts-morph` devDep in `apps/cli`.
- **Working but slow:** `atlas context` ≈ 22 s on a 395-file repo (see FULL_AUDIT §Performance).
- **Nothing tested as release-blocking at the unit level:** 899 tests green; live CLI smoke tests green.

---

*Sources: package sources + tests (packages/*, apps/*), `pnpm typecheck/lint/format:check/build/test`, live `atlas` smoke tests, git tracking audit, and `docs/*`. Companion report: `docs/FULL_AUDIT.md`.*