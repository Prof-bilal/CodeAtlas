# ADR-013: Benchmark API Server (`apps/server`)

- **Status:** Accepted
- **Date:** 2026-08-23
- **Deciders:** CodeAtlas maintainers

## Context

The benchmark framework (ADR-012) is CLI-only: suites are created, run, and
reported through `atlas benchmark`, persisted as JSON under
`.codeatlas/benchmarks/`. The web UI (`CodeAtlas-ui`) is a static marketing and
docs site whose benchmark pages hardcode pasted numbers.

We want the Atlas Benchmark page to become a live dashboard: list real suites,
start benchmark jobs, watch progress, run "browser benchmarks" (quick tests)
against curated community repositories without local cloning, and rank results —
with **no fabricated data** anywhere. That requires an HTTP surface over the
existing framework; no HTTP server existed anywhere in the monorepo (the MCP
server is stdio-only).

## Decision

Add a new consumer app, **`apps/server` (`@atlas/server`)** — a localhost HTTP
API ("CodeAtlas Benchmark API") built on `node:http` with **zero new runtime
npm dependencies**. Like the CLI, it is a composition root that may import
`@atlas/sdk`, `@atlas/mcp`, and `@atlas/benchmark` (added to the ESLint
dependency matrix), and it reuses the existing building blocks rather than
forking them:

- **Suites read/write** through `BenchmarkService`/`BenchmarkStore` against the
  same `.codeatlas/benchmarks/` root the CLI uses.
- **Suite runs** through `BenchmarkService.runTask` per task × mode (so real
  per-task progress exists), finalized by `runSuite`'s resume path (aggregates
  + `completed` status) — no changes to `@atlas/benchmark` were needed for
  progress reporting.
- **Aggregates** are recomputed from the persisted per-task results via
  `evaluateTask` because a filtered CLI `--task` run can leave a
  subset-only `raw-results.json`.
- **Browser benchmarks** (quick tests) measure scan (`scanProjectOverview`),
  indexing (`indexProject` when missing), deterministic retrieval
  (`ContextSDK.getRelevantContext`), and context assembly
  (`assembleContextPackage`); the optional AI answer runs only when an Ollama
  provider is configured and reports `unavailable` otherwise.
- **Community library** is a curated, operator-editable JSON config
  (`apps/server/config/community-repos.json`). `local` entries point at
  on-disk directories; `git` entries are shallow-cloned (`git clone --depth 1`,
  argument-array spawn, `shell:false`) into an isolated temp workspace that is
  always cleaned up. Availability is checked live (filesystem /
  `git ls-remote`) — repository statistics are never hardcoded.

Jobs (benchmark runs, browser benchmarks) run in-process behind a
`JobManager`: max 1 concurrent + a bounded queue (429 when full), named stages,
cooperative cancellation checked between stages/tasks, and a wall-clock budget.
The UI polls `GET /api/jobs/:id`; there is no simulated progress. Suite
repository paths are persisted in a server-owned sidecar
(`suites/<id>/repository.json`), additive to the store.

### API surface (JSON, `/api` prefix)

```
GET  /health                          GET  /benchmarks
POST /benchmarks                      GET  /benchmarks/:id
GET  /benchmarks/:id/report           POST /benchmarks/:id/cancel
GET  /task-files                      GET  /community/repos
POST /community/repos/:id/run         POST /browser-benchmarks
GET  /browser-benchmarks/:id          GET  /jobs
GET  /jobs/:id                        POST /jobs/:id/cancel
```

A transparent 0–100 display score is computed **only from measured inputs**
(`50 + 25·clamp(tokenSavings%/50) + 25·clamp(accuracyDelta)`); the formula is
returned with every score and shown in the UI.

### Security posture

- Binds `127.0.0.1` by default (`ATLAS_SERVER_HOST` to override — container
  setups); no authentication (single-user local tool, like the CLI).
- No repository code is executed by quick tests (scan/parse/retrieve only);
  agent runs use the same runners the CLI uses (operator-configured CLIs).
- All spawns are argument arrays (`shell:false`); request bodies are capped
  (1 MiB default); responses never include secrets or provider config;
  browser-benchmark file paths are repository-relative (server layout is not
  leaked); the static UI file server is path-traversal-safe.
- Job queue = rate limiting for expensive operations.

## Consequences

- The UI (`CodeAtlas-ui`) `#/benchmarks` page becomes a live dashboard
  (My Benchmarks / Community / Leaderboard, run dialog with live progress,
  suite detail with history, browser benchmark workspace) backed by this API;
  the old hardcoded pages are removed. In dev, Vite proxies `/api`; in
  production the server serves the built UI itself.
- Jobs are in-process (dropped on restart) but every completed task result is
  persisted, so interrupted suites resume — documented limitation.
- Progress granularity is per task × mode plus stage transitions; a streaming
  event bus (SSE/WebSocket) may come later behind the same job model.
- `apps/server` follows the CLI precedent for workspace packaging
  (`@atlas/*` as devDependencies bundled by tsup, `ts-morph` external).
