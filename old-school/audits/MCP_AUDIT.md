# MCP Production-Hardening Audit — CodeAtlas

A durable reference for the MCP server's production hardening and the
agent-registration work. It points to the two dated records:

- [`result.md`](./result.md) — the full MCP MVP audit run (bugs, fixes,
  verified behavior, scorecard, verdict).
- [`benchmark.md`](./benchmark.md) — measured latency/token/scale numbers,
  including the 10k files / 500k lines large-repo run.

## 1. Scope

The MCP server (`@atlas/mcp`) is a thin, deterministic consumer of the Context
SDK (`createContextSDK`); it never touches the SQLite database directly. This
audit covered: server startup/transport, tool surface and `outputSchema`,
error-result semantics, stale-context auto-refresh, `.gitignore` patterns,
security gates, scale, and **registration of the server into every configured
AI coding tool** (`atlas agents connect`).

Method: **hermetic unit tests** plus **live read-back** with each installed
agent's own CLI (`claude mcp list`, `gemini mcp list`, `opencode mcp list`,
`codex mcp list`). No agent launches and no provider credits were used.

## 2. Server hardening (summary)

| Area | State |
| - | - |
| Tool surface | 7 deterministic tools (search/read/deps/overview/explain/summary) reading only through the Context SDK |
| `outputSchema` | Every tool declares one; the server validates `structuredContent` against it before returning |
| Error semantics | Domain errors return `isError: true` + text content and **no** `structuredContent` (so clients that validate against `outputSchema` do not reject the error as `-32602`) |
| Auto-refresh | `ensureFresh` runs before every read: detects working-tree drift and runs the SDK incremental refresh when changed; `freshness` reported on results |
| Input bounds | `boundedString` caps string inputs (10k chars); zod rejects malformed/missing/oversized args |
| `.gitignore` | Root + nested gitignore patterns honored by the scanner (`*.log`, `.env`, …) |
| Security | Traversal, secret leakage, malformed and oversized input all rejected cleanly |
| Transport | stdio, newline-delimited JSON framing, protocol-only stdout, logs to stderr, lazy readiness, idempotent `close()` |

Full bug/fix table and regression tests: `docs/result.md` §3.

## 3. Agent registration matrix

`atlas agents connect` writes the CodeAtlas MCP server into the **correct**
config file and shape for each target. The matrix below was **live-verified**
with each agent's own CLI on this machine (2026-08-15).

| Target | Config file | Entry shape | Verified read-back |
| - | - | - | - |
| Claude | `~/.claude.json` (top-level `mcpServers`) | `{ type: "stdio", command: "atlas", args: ["mcp"], env: { ATLAS_ROOT } }` | `claude mcp list` → `codeatlas: atlas mcp - ✔ Connected` |
| Gemini | `~/.gemini/settings.json` (`mcpServers`) | same stdio shape, **schema-clean** (no unknown keys) | `gemini mcp list` → `✓ codeatlas: atlas mcp (stdio) - Connected` |
| Codex | `~/.codex/config.toml` (`[mcp_servers.codeatlas]`) | `command = "atlas"`, `args = ["mcp"]`, `env = { ATLAS_ROOT = ... }` (no `type`) | `codex mcp list` → `codeatlas | atlas | mcp | ATLAS_ROOT=***** | enabled` |
| OpenCode | `~/.config/opencode/opencode.jsonc` (`mcp`) | `{ type: "local", command: ["atlas", "mcp"], enabled: true, environment: { ATLAS_ROOT } }` | `opencode mcp list` → `● ✓ codeatlas connected` |
| Cursor | `~/.cursor/mcp.json` (`mcpServers`) | stdio shape | — |
| Cline | `~/.cline/cline_mcp_settings.json` (`mcpServers`) | stdio shape | — |

### Findings that drove the matrix (all fixed)

1. **Claude Code ignores `mcpServers` in `settings.json` (HIGH).** Claude Code
   only reads top-level `mcpServers` from `~/.claude.json` and project
   `.mcp.json`; the claude target now writes `~/.claude.json`.
2. **Gemini's settings schema is strict (`additionalProperties: false`) (HIGH).**
   A previously-added `registeredBy` key made `gemini mcp` fail validation.
   Agent-facing entries no longer carry `registeredBy`/`version`; provenance
   stays in `~/.codeatlas/mcp/servers.json`.
3. **OpenCode reads `~/.config/opencode/opencode.jsonc`, not
   `~/.opencode/config.json` (HIGH).** The target now points there and writes
   JSONC-compatible JSON.
4. **Codex needs real TOML (MEDIUM).** `@atlas/toolkit` ships a surgical,
   comment-preserving TOML merge (`configurator-toml.ts`): it only inserts or
   replaces the `[mcp_servers.<tool>]` block and leaves every other byte of
   `~/.codex/config.toml` untouched. `@atlas/toolkit` also handles JSONC
   (`jsonc.ts`) for OpenCode.
5. **`atlas mcp` on Windows (LOW, verified working).** The `atlas` npm shim on
   PATH resolves correctly; pointing at `node <repo>/packages/mcp/dist/bin.js`
   remains a valid workaround.

## 4. How to verify

```bash
atlas agents status                      # shows each target + its config path
atlas agents connect                     # writes missing registrations
atlas agents connect --dry-run           # preview without writing
atlas agents connect --target claude     # restrict to one target

claude mcp list                          # expect: codeatlas ... ✔ Connected
gemini mcp list                          # expect: ✓ codeatlas ... Connected
opencode mcp list                        # expect: ● ✓ codeatlas connected
# codex (binary not on PATH here): verify with a temp CODEX_HOME + the real binary
$env:CODEX_HOME = <temp dir with a config.toml containing [mcp_servers.codeatlas]>
& <codex.exe> mcp list
```

`atlas agents connect` is **idempotent**: re-running reports
`Already configured: <targets>`. Codex is skipped while its binary is not on
PATH (honest `not installed` in `atlas agents status`).

## 5. Test map & how to run

| Suite | Coverage |
| - | - |
| `packages/mcp/tests/startup.test.ts` | server identity, transport, lazy readiness, idempotent close |
| `packages/mcp/tests/context-correctness.test.ts` | search/symbol/dependency correctness + `read_file_range` semantics |
| `packages/mcp/tests/mcp-audit.test.ts` | full fixture audit: incremental refresh, `.gitignore`, security gates, error semantics |
| `packages/mcp/tests/hardening.test.ts` | `outputSchema`, clean error results, bounded input, traversal/malformed/oversized |
| `packages/mcp/tests/server.test.ts`, `handlers.test.ts` | tool dispatch + result framing |
| `packages/toolkit/tests/agent-mcp.test.ts` | per-target config files and entry shapes (claude/gemini/codex/opencode/cursor/cline), dry-run, merge, TOML round-trip |
| `packages/toolkit/tests/configurator-toml.test.ts` | TOML parse/serialize + surgical comment-preserving merge (idempotent, CRLF-safe) |
| `packages/toolkit/tests/jsonc.test.ts` | JSONC parsing (comments + trailing commas) |
| `tests/benchmarks/mcp-benchmark.ts` | latency, token estimates, scale, security, context-task precision/recall |

Run from the repo root:

```bash
pnpm vitest run packages/mcp packages/toolkit apps/cli
pnpm exec vite-node tests/benchmarks/mcp-benchmark.ts
```

## 6. Known limitations (honest)

- `read_file_range` returns raw content without line numbers and does not
  relocate symbols after edits; the stale flag / `versionMatch` signal drift.
- The in-memory search index is O(entities) in time and linear in memory
  (~1.5 GB RSS at 10k files / 500k lines); a swap-in `RelevanceScorer`/vector
  index is the planned path.
- Token counts are estimates (`estimateTokens`, chars/4), never measured.
- Codex registration is written only when the codex binary is on PATH (it is
  installed here but not on PATH), so `atlas agents connect` skips it; the
  block is verified manually via a temporary `CODEX_HOME`.
- **Full end-to-end agent sessions** (launching an agent and asking it to
  actually invoke a tool) were **not run**; connectivity verification is via
  each agent's own MCP read-back (`mcp list` → `Connected`/`enabled`), which
  proves registration, transport, and that the server answers the agent's MCP
  handshake. That is the verification depth approved for this audit.