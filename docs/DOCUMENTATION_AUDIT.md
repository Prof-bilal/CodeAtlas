# CodeAtlas Documentation Audit

Self-audit of the AI-agent documentation system created/adjusted on **2026-08-08**.

> **2026-08-09 follow-up:** the CLI/MCP/VS Code surface was re-verified against
> code. `AGENTS.md`, `README.md`, `CLAUDE.md`, `docs/CLI.md`,
> `docs/ARCHITECTURE.md`, `docs/CURRENT_STATE.md`, `docs/ROADMAP.md`, and
> `docs/CONTEXT_STORAGE.md` were corrected to reflect that `atlas search` and
> `atlas mcp` are wired and that MCP + the VS Code extension are implemented.
> Three docs were added: `docs/CONTEXT.md`, `docs/DEVELOPMENT.md`,
> `docs/CONTRIBUTING.md`. All 53 markdown files pass the link/anchor check;
> `tsc`, ESLint, Biome, Vitest (44 files / 305 tests), and `pnpm -r build` all
> pass (docs-only changes — no production code was touched).

---

## 1. Files created

| File | Purpose |
| ---- | ------- |
| `AGENTS.md` | **Authoritative rules for all coding agents** (was `agents.md`) |
| `CLAUDE.md` | Claude Code operating notes — defers to `AGENTS.md` |
| `ARCHITECTURE.md` | Pointer to canonical `docs/ARCHITECTURE.md` (keeps README link valid) |
| `docs/CURRENT_STATE.md` | Implemented / partial / stubbed / planned / unknown, verified against code |
| `docs/PRINCIPLES.md` | Local First, AI Optional, Provider Agnostic, CLI First, Deterministic-before-AI, etc. |
| `docs/ARCHITECTURE.md` | Canonical architecture (both product directions, current + target) |
| `docs/MODULES.md` | Module ownership ("who owns what" + forbidden actions) |
| `docs/DEPENDENCIES.md` | Allowed import directions (ESLint matrix) + dependency-add policy |
| `docs/AI_PROVIDERS.md` | Provider interface, adapters, key/security rules |
| `docs/AGENT_ORCHESTRATOR.md` | Planned Unified AI CLI (Direction B) design contract |
| `docs/CLI.md` | `atlas` CLI contract (stubbed vs planned clearly marked) |
| `docs/CONTEXT_STORAGE.md` | `.codeatlas/` layout (implemented vs target) |
| `docs/SECURITY.md` | Secrets, processes, path traversal, symlinks, malicious repos, MCP |
| `docs/PRIVACY.md` | Local-first, no implicit uploads, relevant-context-only |
| `docs/TESTING.md` | Test tiers and non-negotiable rules |
| `docs/CODE_QUALITY.md` | TS strict, no `any`, small functions, error handling |
| `docs/CHANGE_POLICY.md` | Inspect-before-modify, large-change template, scoping |
| `docs/DOCUMENTATION_MAP.md` | Hierarchy + navigation rules |
| `docs/AGENT_COMPATIBILITY.md` | How Claude Code / OpenCode / Codex / Gemini consume the same docs |
| `docs/DEVELOPMENT_WORKFLOW.md` | Standard workflow + reporting format |
| `docs/FEATURE_STATUS.md` | Status tags table, verified against code |
| `docs/ROADMAP.md` | Phased plan |
| `docs/AGENT_CATALOG.md` | Preserved prior per-agent catalog (was root `agents.md`) |
| `docs/decisions/README.md` | ADR index + format |
| `docs/decisions/ADR-001.md` | `@atlas/context` stub is intentional (retroactive) |
| `docs/decisions/ADR-002.md` | Orchestrate existing CLIs, don't reimplement (proposed) |
| `docs/DOCUMENTATION_AUDIT.md` | This file |
| `docs/README.md` | Rewritten as a docs index |
| `README.md` | Updated "AI Agent Instructions" section; status paragraph retained |
| `apps/cli/README.md` | Fixed broken `../sdk` link → `../../packages/sdk` |

## 2. Verification performed

- **Link integrity:** all **87** local markdown links across the repo resolve
  (checked with a link-walking script that skips `node_modules`, `dist`, `.git`).
- **Test baseline:** `pnpm test` (corepack) → **30 files / 164 tests, all passed**,
  including the intentional `@atlas/context` stub test and the CLI stub test.
- **No production code was modified.** Only documentation files (docs/, README,
  ARCHITECTURE pointer, apps/cli README link fix). No `@atlas/*` source changed.
- **No secrets added.** No `.env`, keys, or tokens introduced anywhere.

## 3. Contradictions found and resolved

1. **Root `ARCHITECTURE.md` vs `docs/ARCHITECTURE.md`:** the task required
   `docs/ARCHITECTURE.md`; a root `ARCHITECTURE.md` already existed. To keep a
   single source of truth, root is now a pointer to the canonical docs file.
2. **Root `agents.md` vs task-spec `AGENTS.md`:** on Windows they are the same
   file. The prior per-agent catalog was rehomed to `docs/AGENT_CATALOG.md`; the
   root file now holds the authoritative agent **rules** per the spec.
3. **README "Foundation phase" wording** vs reality (scanner→storage built):
   the README wording (`scanner ... implemented and tested`) matches reality,
   so it was retained; CLI stub listing matches reality.
4. **Task's roadmap marks *Symbols* and *Context DB* `[PLANNED]`; actual code
   has them implemented.** `docs/FEATURE_STATUS.md` reflects **code** (both
   implemented), which is the correct ground truth per the task's rule to not
   mark things un/implemented without checking.

## 4. Unresolved questions

- **Minimum Node version drift** (`storage` needs `>=22.5.0` vs rest `>=20.19.0`):
  left as documented inconsistency, not fixed (out of scope, needs a decision).
- **Provider default model ids** are placeholder values (`claude-sonnet-5`,
  `gemini-1.5-pro`); no decision made — flagged for a maintainer.
- **No git repo** exists; all husky/commitlint config is inactive. Whether to
  `git init` is a human decision.
- **Prior ADR statuses** (ADR-002 `Proposed`) — a human should accept/reject.
- **`atlas config` / `atlas agents` commands** are documented as [planned] but
  not yet registered; implementation order is a roadmap decision.

## 5. Recommendations

1. **Implement Phase 2's missing piece first: `@atlas/context` ranking** (or
   explicitly keep it stubbed for another sprint). It is the only stubbed
   *pipeline* service and is a precondition for wiring the CLI.
2. **Wire the CLI to the SDK** (`atlas init`, `atlas build`) after context
   ranking, replacing the "Coming Soon" surface with real incremental builds.
3. **Resolve the Node engine mismatch** — either drop storage to `>=20.19.0`
   with an external SQLite (breaking the node:sqlite choice) or lift the root
   engine to `>=22.5.0`.
4. **Add CI** (GitHub Actions or similar) running `pnpm check`, and `git init`
   the repo so husky/commitlint become effective.
5. **Direction B (orchestrator)** should not start until Phases 1–2 are solid,
   and its first commit should implement the **security rules in `docs/SECURITY.md`**
   (array-args spawn, binary-from-PATH, timeouts, no shell strings).
6. **Provider defaults:** update adapter default model ids to current vendor
   catalogs, or remove the defaults and require explicit `model`.

## 6. Omissions (intended)

- No user guide / API reference yet (README stub says "will be added as the
  engine is implemented") — consistent with [ROADMAP.md](./ROADMAP.md).
- No orchestrator code — documented as `[PLANNED]`; no fictional
  documentation of it as implemented. MCP is now implemented (`@atlas/mcp`)
  and documented in `docs/MCP.md`; the VS Code extension (`@atlas/extension`)
  is implemented and documented in `docs/VSCODE.md`.