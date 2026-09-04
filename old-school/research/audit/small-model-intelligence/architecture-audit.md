# Architecture Audit — CodeAtlas

Verified against code, 2026-08-30. Status tags follow `docs/CURRENT_STATE.md`.

## 1. Repository shape

- pnpm + TypeScript monorepo, Node `>=22.5.0` (`node:sqlite`), ESM, strict TS.
- 19 packages in `packages/`, 3 apps in `apps/` (`cli`, `server`, `extension`).
- Dependency direction (ESLint-enforced, `docs/DEPENDENCIES.md`):
  `cli → sdk → feature packages → core → shared`. Feature packages import only
  `core` + `shared`; `mcp` and `apps/extension` import only `sdk`.

## 2. Major components and responsibilities

| Component | Path | Responsibility | Notes |
|---|---|---|---|
| shared | `packages/shared/src` | `Result`, branded IDs, `ComingSoonError` | Foundation |
| core | `packages/core/src` | Entities + **port interfaces** (type-only): `SearchPort`, `ContextBuilderPort`, `ProviderPort`, `AgentPort`, `SessionPort`, `ToolRegistryPort`, `CompatibilityPort`, `InstallerPort`, `ConfiguratorPort`, `SecurityPort`, `BenchmarkPort`, `UsagePort`, `ContextDatabasePort` | Extension seam — new intelligence features add ports here |
| scanner | `packages/scanner/src` | File walk, ignore rules, language/framework detection, `.codeatlas/manifest.json` | Deterministic |
| hashing | `packages/hashing/src` | SHA-256 snapshots; changed/added/deleted/unchanged | Enables incremental indexing |
| parser | `packages/parser/src` | ts-morph → normalized `Symbol[]`; symbol-indexer cross-file resolution | **TypeScript only**; renamed imports & `export default <expr>` don't resolve cross-file |
| graph | `packages/graph/src/graph.service.ts` | Directed graph: imports/calls/extends/implements/references/contains; shortest path; cycles | **Underused by context assembly today** |
| storage | `packages/storage/src` | SQLite (node:sqlite) context DB: 8 tables (files, symbols, dependencies, summaries, modules, relationships, hashes, metadata), repositories, migrations | Sole DB owner |
| search | `packages/search/src` (`search-index.ts`, `scoring.ts`, `fuzzy.ts`) | In-memory ranked index over a `ContextSnapshot`; typo-tolerant fuzzy; `RelevanceScorer` seam (no embeddings shipped) | Lexical only |
| summary | `packages/summary/src/summary.service.ts` | AI file/folder/module/project summaries; cached by content hash | Opt-in, provider-backed |
| context | `packages/context/src/context-builder.service.ts` | Deterministic rank-and-assemble (`ContextBuilderPort`, ADR-001): search hits → whole-file `ContextItem`s; `ContextTaskCategory` regex boosts (debug/security/architecture/understand) | Flat, file-granular |
| providers | `packages/providers/src` | `ProviderPort`; adapters `anthropic.ts`, `gemini.ts`, `ollama.ts`, `openai-compatible.ts`; `retry.ts`, `transport.ts` | Provider behavior quarantined here |
| agents | `packages/agents/src` | `AgentPort` AI-CLI connection layer (adapters, argv spawn, `process.ts`, `executable.ts`); `session-manager.ts` (`SessionPort`); `chat-agent-runner.ts` | Direction B foundation |
| sdk | `packages/sdk/src` | Composition root (`container.ts`); `context/` (`createContextSDK` façade); `context-integration/` (assemble/budget/slice/briefing/instructions/deny/render/staleness); `context-tools/` (`tool-loop.ts` — `ToolUsingChatAgent`); `indexing/` (`indexProject` incremental); `sessions/`; `usage/`; `toolkit/`; `benchmark/`; `metrics/`; `orchestrator/` | Consumers use only this |
| mcp | `packages/mcp/src` | MCP-over-stdio server; `tools.ts` (7 tools + zod schemas), `handlers.ts`, `freshness.ts`, `deny.ts` | Thin SDK consumer |
| usage | `packages/usage/src` | Tri-state (actual/estimated/unknown) tokens & cost, budgets/limits; `.codeatlas/usage.db` | ADR-009 |
| benchmark | `packages/benchmark/src` | Runner, `evaluator.ts` (file/concept substring scoring), `metrics.ts`, `reporter.ts`, `store.ts`; `apps/server` exposes HTTP | `benchmark-repos/`: 5 fixture repos |
| metrics | `packages/metrics/src` | Token estimation (`token-estimation.ts`), metrics store/exporter | Feeds usage |
| toolkit | `packages/toolkit/src` | Registry/Manifest/Compatibility/Installer/Configurator/Security (`catalog.json`) | Direction C |
| cache | `packages/cache/src` | Generic TTL cache + JSON persistence | Used by summary/briefing |
| CLI | `apps/cli/src/commands/` | 16 commands: `indexing.ts` (init/build/update), `search.ts`, `ask.ts`, `context.ts`, `explain.ts`, `mcp.ts`, `sessions.ts`, `usage.ts`, `agents.ts`, `metrics.ts`, `tools.ts`, `benchmark.ts`, `doctor.ts`, `providers.ts`, `scan.ts` | Thin SDK wiring |
| extension | `apps/extension` | VS Code extension, SDK consumer | Implemented |

## 3. Data flow

### Indexing (write path)
```text
scanProject (scanner) → .codeatlas/manifest.json
   → buildSnapshot / compareHashes (hashing) → only changed/added re-parsed
   → parser (ts-morph → Symbol[]) → symbol-indexer (cross-file refs)
   → graph.service (edges) → [optional AI summaries]
   → storage.saveContext / updateContext (SQLite)
```
Wired via `packages/sdk/src/indexing` (`indexProject`), used by
`atlas init/build/update` (`apps/cli/src/commands/indexing.ts`).

### Reading (query path)
```text
createContextSDK (packages/sdk/src/context/sdk.ts)
   → ReadRepositories → ContextDatabasePort → SQLite
   sub-APIs: files / symbols / dependencies / modules / summaries / project / search
   + getRelevantContext(query): top files/symbols + summaries + dep edges + overview
```

### Serving to models
- **MCP**: `packages/mcp/src/server.ts` + `tools.ts` + `handlers.ts`; 7 tools;
  staleness attach (`freshness.ts`), secret deny-list (`deny.ts`).
- **CLI ask**: `apps/cli/src/commands/ask.ts` → `integration.buildSlice()` →
  `packages/sdk/src/context-integration/slice.ts` (budgeted ranked slice).
- **Context package**: `assemble.ts` builds a `ContextPackage` (briefing +
  instructions + files + dependency graph + budget accounting), delivered via
  `packages/agents/src/session-manager.ts` or exported.

### Model interaction
- `packages/providers` (direct API completion; `ollama` adapter exists).
- `packages/sdk/src/context-tools/tool-loop.ts` — `ToolUsingChatAgent`:
  bounded tool loop over a `ContextToolSource`, `SearchMemory` near-duplicate
  query dedup, per-tool caps, static `CONTEXT_GUIDANCE`, `MAX_TOOL_ROUNDS`.
- `packages/agents` — external AI CLI sessions (launch/attach).

## 4. Model interaction map

| Surface | Model touchpoint | Guardrails |
|---|---|---|
| AI summaries | `summary.service.ts` → `ProviderPort` | Cache by content hash; `Result` fail-clean |
| Briefing | `context-integration/briefing.ts` | Same pattern; JSON-structured output |
| Tool loop | `context-tools/tool-loop.ts` | Round cap, query dedup, per-tool caps, policy deny |
| MCP | none direct (deterministic reads) | Deny list, path bounds, size caps |
| Agent sessions | `agents/session-manager.ts` | Spawn argv arrays, no shell strings |

## 5. Where intelligence is missing (component view)

| Missing capability | Nearest existing seam |
|---|---|
| Task classification beyond 4 regex categories | `ContextTaskCategory` in `core` + `context-builder.service.ts` |
| Hierarchical context | `ContextItem` (flat) in `core`; SDK `getRelevantContext` |
| Dependency-closure retrieval | `@atlas/graph` (exists, unused for retrieval) |
| Planning | Nothing (ADR-008 assembles context, no plan) |
| Verification | Nothing; closest are `hashing` (staleness) and `benchmark/evaluator.ts` |
| Critic pass | `BriefingPort` pattern could host a reviewer port |
| Structured agent state | `tool-loop.ts` accumulates messages only |
| Repository memory | `summary` + `instructions.ts` (AGENTS.md/CLAUDE.md/README/manifest) |
| Embeddings | `RelevanceScorer` seam in `@atlas/search` |

## 6. Architectural invariants that constrain the design

1. Deterministic-before-AI (ADR-001) — ranking stays AI-optional.
2. All context reads through `createContextSDK`; no DB access elsewhere.
3. Persistence only in `@atlas/storage`; no new context stores.
4. Provider logic only in adapters; no provider switches elsewhere.
5. Argument-array spawn, no `shell: true` (`docs/SECURITY.md`).
6. Incremental indexing via hashing; no full rescan without reason.
7. Tests require no network and no provider credentials.
8. ADR required for architecture changes (`docs/CHANGE_POLICY.md`) — new
   ports (`PlannerPort`, `VerifierPort`, `TaskClassifierPort`) need one each.
