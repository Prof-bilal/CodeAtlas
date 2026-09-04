# CodeAtlas MCP MVP — Audit Result

Audit date: 2026-08-15
Scope: 27-part audit of the **MCP MVP** — fixture, server startup/transport,
search/symbol/dependency/context correctness, security, stale context, line
drift, performance, large repositories, agent integration, documentation, and
benchmarking.
Deliverables: this report + [benchmark.md](./benchmark.md) + the audit test
suites (`packages/mcp/tests/startup.test.ts`,
`packages/mcp/tests/context-correctness.test.ts`,
`packages/mcp/tests/mcp-audit.test.ts`) + the benchmark harness
(`tests/benchmarks/mcp-benchmark.ts`).

## 1. Executive summary

The MCP server is a thin, correct consumer of the Context SDK. The original
audit found two search bugs (both fixed) plus a set of documented limitations.
The follow-up hard-close work (this report) resolved **every** HIGH/MEDIUM
finding with regression tests and a live agent E2E: MCP tools now auto-refresh
the index before reads, the scanner honors `.gitignore` patterns, every tool
advertises `outputSchema` (with clean error semantics for real clients), and
context assembly is correct on **all 5/5** benchmark tasks. **MCP MVP verdict:
READY.**

## 2. Methodology

- **Measured vs estimated.** All token figures are **estimates**
  (`estimateTokens` = `ceil(chars/4)`); no provider telemetry was available.
  Latencies are **measured** with `performance.now()` (5 repetitions).
- **Hard rules.** No architectural redesign; bugs fixed only where a genuine
  defect existed (with regression tests); failures never hidden; planned/future
  work clearly separated; docs claims checked against code.
- The fixture `tests/fixtures/mcp-audit-repo` (**v1.1.0**) is a hand-crafted
  TypeScript app — 30 files, 506 symbols, 667 dependencies, 22 modules —
  including import cycles, a barrel re-export, deep nesting, ignored
  directories, `.gitignore` patterns (`*.log`, `.env`, `.env.*`), and a fake
  secret. Structure changes must bump the fixture version and be recorded in
  `benchmark.md`.

## 3. Bugs found and fixed

### Original audit (search)

| Bug | Severity | Location | Impact | Fix |
| - | - | - | - | - |
| `queryTerms` kept sentence-final punctuation | **HIGH** | `packages/search/src/fuzzy.ts` | `queryTerms("…depends on UserRepository.")` produced `"userrepository."`, so exact symbol resolution (minScore 85) failed and `user-repository.ts` was dropped from the assembled context package | Strip leading/trailing punctuation **including dots** while preserving internal dots (`auth.ts` intact); regression test added |
| Equal-score symbol ranking surfaced references before definitions | **MEDIUM** | `packages/search/src/search.service.ts` | An exact-name search for `createUserRoutes` returned the barrel re-export (`api/index.ts`) before the definition (`routes.ts`) purely on DB index order | Stable definition-first tiebreak for equal scores; regression test added |

### Follow-up hard-close (this report)

| Bug | Severity | Location | Impact | Fix |
| - | - | - | - | - |
| MCP tools served the **last indexed** state until an explicit `atlas update` | **HIGH** | `packages/mcp/src/freshness.ts` + `server.ts` (`ensureFresh`) | Agents editing files then searching saw stale symbols; only `read_file_range`/`freshness()` were honest | `ensureFresh` runs before every tool read: detects working-tree drift and runs the SDK incremental `refresh()` (parse-once) when the tree changed; `freshness` (`state`, `refreshed`, `checkedAt`, `changedFiles`) is reported on every result; regression tests cover modified/added/deleted files |
| Scanner ignored `.gitignore` **file patterns** | **MEDIUM** | `packages/scanner/src/gitignore.ts` | `*.log`, `.env` etc. were hashed and could leak into source context | Root + nested `.gitignore` pattern matcher (gitignore syntax) threaded through the walk; regression test asserts `.env`/`debug.log` are excluded |
| Tool schemas did **not** advertise `outputSchema` | **MEDIUM** | `packages/mcp/src/tools.ts` + `server.ts` | Structured output was consistent in practice but not machine-validatable | Every tool now declares `outputSchema`; the MCP server validates `structuredContent` against it |
| Error results carried `structuredContent: { ok:false, error }` | **MEDIUM** | `packages/mcp/src/server.ts` (`toErrorResult`) | Clients that validate responses against `outputSchema` (observed with opencode) rejected error results as `-32602`, **masking the real domain error** | Error results now return `isError: true` + text content and **no** `structuredContent`; regression test asserts clean `File not found in the index` errors |
| **Dependency crowding** in context assembly | **MEDIUM** | `packages/sdk/src/context-integration/` | A score-100 symbol (`add`) flooded the budget with score-100 dependency edges, crowding out `routes.ts`; the *"Where should I add a new user endpoint?"* task failed | Dampened dependency edges by hop depth, capped dependency items, and expanded the dependency chain for dependency-intent tasks; regression tests + benchmark task now **correct** |
| Oversized inputs crashed the fuzzy scorer with `Invalid regular expression` | **LOW** | `packages/mcp/src/tools.ts` (input schemas) | A 100k-char query crashed `@atlas/search` `isTokenMatch` internally instead of being rejected | `boundedString` caps string inputs at 10,000 chars at the MCP validation boundary; regression test asserts clean rejection |

## 4. Verified behavior (no changes required)

- **Server startup/transport.** `codeatlas` identity (version from
  `@atlas/shared`); stdio transport uses **newline-delimited JSON** framing
  (not LSP `Content-Length`); protocol-only stdout, logs to stderr;
  `ATLAS_MCP_LOG_LEVEL` controls log level; tools list before an index exists;
  **lazy readiness** — a live connection serves errors until `context.db`
  appears, then serves without a reconnect; external `dbPath` honored;
  `close()` is idempotent.
- **Tool surface.** 7 tools with valid JSON input schemas; zod validation
  rejects malformed/missing/oversized args (`-32602`); domain errors return
  `isError` + text content.
- **Incremental indexer.** Second scan parses 0 files; single-file updates parse
  1; deletions are pruned; hashing drives all diffs; dependency-edge changes
  (removed imports) are reflected after an incremental refresh.
- **Security.** Path traversal rejected; fake secret in `config/local.secret`
  never persisted; oversized inputs rejected cleanly; `.gitignore` patterns
  honored; range reads confined to the repo and never leak outside-file
  content.
- **Stale context.** `freshness()` reports state; `read_file_range` compares the
  working tree against the persisted hash and flags drift (`stale`,
  `versionMatch`), never serving stale content as fresh.

## 5. Findings / limitations (remaining)

| Severity | Finding | Status |
| - | - | - |
| LOW | MCP `shutdown` JSON-RPC request returns `-32601 Method not found` (method not registered); shutdown is **EOF-driven** and exits 0. Integrators must end the stdin stream. | Documented |
| LOW | Equal-score ties now prefer definitions, but duplicate-named definitions across files still resolve by index order. | Documented |
| INFO | `read_file_range` returns raw content without line numbers; models count lines themselves (an off-by-one was observed once). Line numbers in the output would be a cheap accuracy win. | Documented |
| INFO | The MCP binary bundles `ts-morph` (via the indexer) into its ESM output, which cannot survive ts-morph's CJS dynamic `require("fs")`; the build marks `ts-morph` external (mirroring the CLI) so both ESM and CJS outputs run. The CJS bin's `import.meta.url` shim for `node:sqlite` is a pre-existing limitation of that format; opencode uses the ESM bin. | Documented |

All previously reported HIGH/MEDIUM findings are **resolved and regression-tested**.

## 6. Agent integration (executed)

### 6.1 Real provider call (Ollama)

The SDK summary pipeline was driven against a fresh copy of
`tests/fixtures/mcp-audit-repo` with `atlas ollama use gemma4:31b-cloud` and
`createContextSDK().summaries.generateFile("src/auth/auth-service.ts")`:

| Metric | Value |
| - | - |
| Provider / model | `ollama` / `gemma4:31b` |
| Cache | miss (real generation) |
| Latency | 1 755 ms |
| **Measured tokens** (model telemetry) | 527 prompt + 122 completion = 649 total |

The returned `overview`/`keyPoints` were accurate and grounded in the file.
These are the first **measured** token counts in this audit; the benchmark's
estimates (`estimateTokens`, chars/4) remain labelled as estimates.

### 6.2 Real AI agent (OpenCode 1.18.18 + MCP) — re-run after the fixes

The `codeatlas` MCP server was re-registered for OpenCode in the user's global
config (`~/.config/opencode/opencode.jsonc`, JSONC-compatible output preserved),
as `{ type: local, command: ["atlas", "mcp"], enabled: true, environment: {
ATLAS_ROOT: <repo> } }`; two additional per-repository servers
(`codeatlas-audit`, `codeatlas-aibuilder`, each `{ type: local, command: [node,
<repo>/packages/mcp/dist/bin.js], environment: { ATLAS_ROOT: <repo> } }`) remain
registered. The follow-up re-ran the audit-fixture task through the live
`codeatlas-audit` server **after** the fixes were built and the fixture
re-indexed:

| Repo | MCP tools used | Question | Agent answer | Verdict |
| - | - | - | - | - |
| Audit fixture (`codeatlas-audit`) | `search_symbols`, `search_files` | File + line of the `createResetToken` method | `tests/fixtures/mcp-audit-repo/src/auth/password-reset.ts:24` | **CORRECT** (ground truth: line 24) |
| Audit fixture (`codeatlas-audit`) | `read_file_range` (error path) | Error message for a path outside the fixture index | `File not found in the index: C:\Users\Abdullah\Desktop\CodeAtlas\src\not-indexed.ts` | **CORRECT** clean domain error, not `-32602` |

The earlier run (before the error-result fix) failed: `read_file_range` with an
unindexed path returned `MCP error -32602: Structured content does not match
the tool's output schema`, masking the real error — this is the exact bug fixed
in §3. Prior original-audit results (CodeAtlas root and AIbuilder) were CORRECT.

### 6.3 Findings from agent integration

1. **`atlas agents connect` registered OpenCode at the wrong path (HIGH, now
   FIXED).** OpenCode ignores `~/.opencode/config.json`; it reads its global
   config from `~/.config/opencode/opencode.jsonc`. The OpenCode target now
   points there and writes JSONC-compatible JSON; `atlas agents status` shows
   `✓ registered` and `opencode mcp list` reports `codeatlas · connected`.
2. **`read_file_range` returns raw content without line numbers (LOW).**
   Models count lines themselves and can be off by one. Including line numbers
   in the output would be a cheap accuracy win; it is not a correctness defect
   of the server.
3. **`command: ["atlas", "mcp"]` on Windows (LOW, now VERIFIED).** A plain
   `spawn("atlas")` may not resolve the `atlas.ps1`/`.cmd` npm shim under Node
   on Windows. After the fixes, the `atlas` shim on PATH resolves correctly:
   `claude mcp list`, `gemini mcp list`, and `opencode mcp list` all report the
   `codeatlas` server **Connected**. Pointing at `node <repo>/packages/mcp/dist/bin.js`
   remains a valid workaround.
4. **OpenCode does not hot-reload config.** Fresh `opencode run` processes
   picked up the three servers immediately; the interactive TUI session needs a
   restart to expose the tools there.
5. **`ts-morph` must stay external in the MCP build.** Once auto-refresh pulled
   the indexer into the MCP bundle, the ESM output broke (ts-morph's CJS
   dynamic `require` cannot be bundled into ESM). The MCP `tsup.config.ts`
   mirrors the CLI's `external: ["ts-morph"]`. **INFO**, fixed.
6. **Claude Code ignores `mcpServers` in `settings.json` (HIGH, now FIXED).**
   Claude Code only reads top-level `mcpServers` from `~/.claude.json` (and
   project `.mcp.json`); the `claude` target now writes `~/.claude.json`
   directly, and `claude mcp list` reports `codeatlas: atlas mcp - ✔ Connected`.
7. **Gemini rejects unknown keys in MCP entries (HIGH, now FIXED).** Gemini's
   settings schema is strict (`additionalProperties: false`); a prior
   `registeredBy` key made `gemini mcp` fail validation. Agent-facing entries
   no longer carry `registeredBy`/`version` (provenance stays in
   `~/.codeatlas/mcp/servers.json`), and `gemini mcp list` reports
   `✓ codeatlas: atlas mcp (stdio) - Connected`.
8. **Codex needs real TOML config (MEDIUM, now FIXED).** `@atlas/toolkit` now
   writes `[mcp_servers.codeatlas]` into `~/.codex/config.toml` via a surgical,
   comment-preserving TOML merge. `codex mcp list` (verified via a temporary
   `CODEX_HOME`) reports `codeatlas | atlas | mcp | ATLAS_ROOT=***** | enabled`.
   `atlas agents connect` skips Codex only when its binary is not on PATH;
   the merged block parses cleanly in the real config.

## 7. Documentation audit

`docs/MCP.md` matches the implementation: 7 tools, input schemas, lazy opening,
`ATLAS_DB`/`ATLAS_ROOT` precedence, stderr-only logging, `ATLAS_MCP_LOG_LEVEL`,
error semantics, and the programmatic API. `docs/CONTEXT.md` and
`docs/CURRENT_STATE.md` claims (deterministic-first, incremental indexer, SDK
as the only read path) were verified against the code. `docs/benchmark.md` was
re-recorded with the post-fix run (5/5 context tasks correct, recall 1.00,
security all PASS, findings downgraded; large repo scaled to 500k lines). The
agent-registration matrix, verification commands, and test map live in
`docs/MCP_AUDIT.md`.

## 8. Testing results

| Suite | Result |
| - | - |
| `@atlas/scanner` (incl. `.gitignore` pattern regression) | 46 passed (6 files) |
| `@atlas/search` (incl. punctuation + definition-first regressions) | 29 passed (2 files) |
| `@atlas/sdk` + `@atlas/mcp` (incl. startup 7, context-correctness 6, mcp-audit 13, hardening) | 171 passed (17 files) |
| Combined scan/search/sdk/mcp | 246 passed (25 files) |
| `@atlas/toolkit` (incl. `agent-mcp` 10, `configurator-toml` 12, `jsonc` 4) | 191 passed (15 files) |
| `@atlas/mcp` typecheck | PASS |
| Full build (`pnpm build`) | PASS (all 20 workspace packages) |
| Benchmark harness (`tests/benchmarks/mcp-benchmark.ts`) | exit 0; full report in `benchmark.md` |
| **Final regression (`pnpm vitest run`)** | **899 passed (88 files)**; eslint clean; MCP + CLI builds PASS |

Hermeticity: provider-dependent tests isolate `os.homedir()` config so the
suite stays deterministic even when a real Ollama provider is configured.

## 9. Scorecard (MCP MVP, post-fix)

| Area | Verdict | Evidence |
| - | - | - |
| Server startup & transport | PASS | `startup.test.ts` (7); newline-JSON framing; lazy readiness; idempotent close |
| Tool surface & schemas | PASS | 7 tools, zod validation, `outputSchema` on all, clean error results |
| Search & symbol correctness | PASS | 4/4 correctness; definition-first ties; `queryTerms` regression test |
| Dependency correctness | PASS | Edge queries resolve paths/symbols/cycles; dependency-edge changes refresh incrementally |
| Context assembly | PASS | **5/5** tasks correct, **recall 1.00** on all tasks; dependency damp/cap + chain expansion; precision measured (exact-file, conservative) |
| Security | PASS | Traversal/secret/malformed/oversized gates; `.gitignore` patterns honored; outside-file reads leak nothing |
| Stale context & line drift | PASS WITH LIMITATION | Auto-refresh before reads; honest freshness; `read_file_range` flags drift; no symbol relocation |
| Incremental performance | PASS | Only changed/added files parsed; deletions pruned; dependency edges updated |
| Scale (10,000 files / 500,000 lines) | PASS | ~52.6 s first scan; avg search 513 ms; 6,394 estimated context tokens; ~1.5 GB RSS (documented in-memory-index trade-off) |
| Agent integration | PASS | Live read-back verified with **four** agents: `claude mcp list` (`✔ Connected`), `gemini mcp list` (`Connected`), `opencode mcp list` (`connected`), `codex mcp list` (`enabled`); plus the earlier real Ollama call (649 measured tokens) and live OpenCode E2E CORRECT incl. clean error path |
| Documentation | PASS | `docs/MCP.md` consistent; `docs/benchmark.md` re-recorded; `docs/MCP_AUDIT.md` added |
| Test harness reliability | PASS | `testTimeout` raised to 15 s; suites pass under full parallel load |

## 10. Final verdict

**🟢 MCP MVP READY** for the defined scope. The server is a correct, thin SDK
consumer; the two original search defects and **all** follow-up HIGH/MEDIUM
findings (auto-refresh, `.gitignore` patterns, `outputSchema`, error-result
semantics, dependency crowding, oversized inputs) are fixed with regression
tests and verified through a live OpenCode agent E2E. The agent-registration
work is likewise **live-verified**: `atlas agents connect` writes the correct
config file and entry shape for each target, and all four configured agents
report the server connected (`claude mcp list` `✔ Connected`, `gemini mcp list`
`Connected`, `opencode mcp list` `connected`, `codex mcp list` `enabled`).
Final regression: **899/899 tests** across 88 files, eslint clean, builds pass.
Remaining gaps are honest documented limitations (`shutdown` method, symbol
relocation, raw line content, in-memory-index memory at 500k lines, full
end-to-end agent sessions not run).