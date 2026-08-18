# CodeAtlas — Project Checklist

The short, usable release checklist. Each line maps to a task in
[`PROJECT_READINESS_PLAN.md`](./PROJECT_READINESS_PLAN.md) (task IDs in
parentheses). Verified against the codebase on 2026-08-17.

Legend: `[ ]` not started · `[~]` partial · `[x]` complete · `[!]` blocked.

---

## Core (Direction A)

- [x] Scanner, hashing, manifest, incremental `atlas init`/`build`/`update`
- [x] TypeScript parser + symbol indexer (cross-file references)
- [~] Parser: namespaces, bare expressions (P2-10; known gaps documented)
- [x] Graph (imports/calls/refs, BFS, SCC cycle detection)
- [x] SQLite storage, 8 tables, migrations, repositories
- [x] P0 memory fix: statement cache on storage + usage repos — **committed `737236f`**
- [x] Ranked search (fuzzy + `RelevanceScorer` seam; no embeddings yet)
- [x] Deterministic context ranking (ADR-001)
- [x] Context SDK (`createContextSDK`) as the only read path
- [x] MCP server (7 tools) · [x] VS Code extension
- [x] Usage/credits (`atlas usage`)
- [x] Metrics implemented **and instrumented** — `record*` wired into indexer,
      search, context, read-range, MCP; real `init`+`search` populates metrics.json (P1-04)
- [x] Usage tracking wiring (`withUsageTracking`) — wired into CLI/MCP seams;
      real `search --ai` records actual tokens in usage.db (P1-05)
- [~] Read-path memory: whole-index reload ~738 MB (P1-08)
- [x] Node engine: all packages + root aligned to `>=22.5.0` (P1-02)
- [x] Dedup `estimateTokens` into `@atlas/shared` (P1-03)
- [x] Dead code removed: `ComingSoonError`, `coming-soon.ts`, stale test (P1-06)
- [x] Repo hygiene: dropped absent `ui/` from workspace; PROMPTS.md kept;
      real security contact added (P1-07)

## Agent Toolkit (Direction C)

- [x] Registry (9-tool catalog) · [x] Manifest · [x] Compatibility engine
- [x] Installer (npm/pip/cargo/go + skill git-clone, approval-gated, never fails open)
- [x] Configurator · [x] Security/Trust evaluation
- [x] `atlas tools` search/info/install/remove/configure/doctor surface
- [x] Recommendation tiers + curated **Top-10** (P2-01, P2-02)
- [x] Category browsing in CLI (P2-03)
- [x] Compatibility report surfaced (P2-04)
- [x] Real `atlas tools update` (no-op today) (P2-05)
- [x] Uninstall config-cleanup (P2-06)
- [x] Live doctor/health check (P2-07)
- [x] Conflict + dependency detection (P2-08)
- [x] `github-mcp-server` re-tiered as `experimental` (P2-10)

## Auto Installer

- [ ] `atlas setup` — environment/agent detection, dry-run, `--yes`, install →
      configure → verify → rollback (P3-01…P3-04)
- [ ] Default toolkit bundle defined; 47 skills cataloged with Top-10 `recommended` + `atlas init` permission offer (P3-05)
- [ ] No silent installs; exact commands shown; trust model documented (P3-06)

## Agents (Direction B)

- [x] Launch adapters: claude/gemini/codex/opencode
- [x] `atlas agents status/connect` — MCP config for 6 targets
- [x] Agent sessions (`atlas sessions`) + context-integration (`atlas context`)
- [~] Sessions in-memory only (P4-04)
- [ ] End-to-end agent verification matrix (P4-01)
- [ ] Agent test harness (fake/dry-run CLI) (P4-02)
- [ ] Compatibility matrix doc incl. Cursor/Cline MCP-only (P4-03)
- [ ] Orchestrator CLI wiring + slash-router spec — plan-only (P4-04)

## Providers / Usage

- [x] claude/openai/deepseek/gemini/ollama behind `ProviderPort`
- [ ] Provider config doc + OpenRouter/xAI via OpenAI-compatible adapter (P5-01)
- [ ] Unified local usage record + `usage.json` export (P5-02)
- [ ] Streaming support (fast-follow, P5-03)

## Benchmarks

- [x] Commit `benchmarks/extreme/` (results.json, §7 P0-fix section) (P6-01)
- [ ] Consolidate 3 benchmark artifacts w/ scope labels (P6-02)
- [ ] Post-fix repo-5000 attempt on a safe machine (P6-03)
- [ ] Evidence: token savings, context accuracy, incremental, freshness (P6-04)

## Documentation

- [x] Fix docs drift: AGENTS.md "20 commands", CURRENT_STATE/FEATURE_STATUS,
      MODULES.md, METRICS.md, CLI.md (P1-01)
- [ ] README rewrite — honest, benchmark-backed (P7-01)
- [ ] Keep docs structure; update DOCUMENTATION_MAP.md (P7-02)
- [ ] Install/quickstart/toolkit/agents user docs (P7-03)
- [ ] LICENSE copyright line (P9-05)

## Website & Brand

- [ ] Logo + favicon + brand kit in `assets/logo/` (P8-04) — **deferred**
- [ ] v1 website pages (P8-01) — **deferred: awaiting design direction**
- [ ] Benchmarks page consuming results.json (P8-02)
- [ ] Usage-upload graph, client-side only (P8-03)

## Distribution & Open Source

- [x] Fix published-package metadata: license/repository/homepage/keywords
      (P0-02)
- [x] Bump + publish `codeatlas-cli@0.3.0-beta.0` (P0-03…P0-06) — **published 2026-08-17** (tag `beta`)
- [ ] Issue/PR templates, FUNDING, CODEOWNERS, dependabot (P9-02)
- [ ] Git tag + GitHub Release + release workflow (P9-03)
- [ ] Install/upgrade/uninstall docs (P9-04)
- [ ] Win/macOS CI matrix (P9-06)
- [ ] Security contact + version support statement (P10-03)

## Final QA

- [ ] Security audit: no secrets/env/fixtures/private data tracked (P10-01)
- [ ] Toolkit install-path audit + trust model (P10-02)
- [ ] GitHub cleanup: track/ignore/archive decisions (P11-01)
- [ ] `pnpm check` green on a clean tree
- [ ] `atlas doctor` PASS from a fresh install
- [ ] No known contradictions between AGENTS.md, CURRENT_STATE.md, code
