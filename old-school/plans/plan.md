# CodeAtlas Audit & Implementation Plan

Status: implementation tracking (Phases 1–5 complete; Phase 6 partially run). Last updated: 2026-08-23.

---

## 1. Executive Summary

**What already works**

- **Ollama is ~70% complete as a *provider* (not an agent).** Connection, endpoint config, model discovery/listing, model selection, persistence, chat, connection state, CLI surface (`atlas ollama`, `atlas providers`), error typing, and tests all exist (`packages/providers/src/adapters/ollama.ts`, `packages/providers/src/config.ts`, `packages/sdk/src/providers/ollama.ts`, `apps/cli/src/commands/providers.ts`, `packages/sdk/tests/ollama.test.ts`). It is consumed by the AI-summary and AI-briefing pipelines (`@atlas/summary`, `context-integration/briefing.ts`).
- **Context engine is complete and reachable by agents:** scanner → hasher → parser → graph → storage → search → `createContextSDK` → MCP (7 tools) and `atlas context build` (ADR-001/ADR-008).
- **Agent runtime exists for *external AI CLIs*** (`@atlas/agents` `AgentPort`/`SessionPort`, adapters for claude/gemini/codex/opencode) and OpenCode is fully supported (`atlas context launch --provider opencode`, `atlas opencode`, MCP registered via `atlas agents connect`, `opencode.json`).
- **Toolkit exists as a tool *management* system** (registry `catalog.json`, manifest, compatibility, installer, configurator, security/trust) plus the MCP runtime-tool surface. `atlas tools` + `atlas agents` are wired.
- **Benchmark infrastructure exists but is fragmented:** four independent harnesses (`benchmarks/run-benchmark.ts`, `benchmarks/run-single.ts`, `benchmarks/extreme/`, `benchmarks/final-2026-08/`, plus `tests/benchmarks/mcp-benchmark.ts`) and a wired `@atlas/metrics` package. **`atlas benchmark` does not exist.**

**What does not work (the gap for your three targets)**

1. **Ollama is not an agent.** The "Selected Ollama Model → thinks → requests a tool → CodeAtlas executes → returns → continues" loop does **not** exist. `ProviderPort` has no `tools` field, no adapter does tool/function calling, and there is no provider-backed chat-agent runner inside `SessionPort`/`AgentPort`. `atlas context launch --provider` accepts only the four CLI adapters.
2. **No `atlas benchmark` command.** All benchmarking is ad-hoc scripts that shell out to `atlas`; none covers Ollama; only the 2026-08 harness covers OpenCode end-to-end with real token/cost.
3. **Tools are not connected to an Ollama agent.** Toolkit tools are installed-but-not-executed by CodeAtlas; MCP tools are the only runtime tool surface and are usable only by CLI agents.

---

## 2. Ollama Audit

| Item | Status | Evidence |
|---|---|---|
| Connection | **COMPLETE** | `OllamaAdapter` (providers/adapters/ollama.ts), `OllamaService.connect()` (sdk/providers/ollama.ts:131) |
| Endpoint configuration | **COMPLETE** | `baseUrl` default `http://localhost:11434`, `--base-url`, env `OLLAMA_BASE_URL`, persisted (config.ts:18, sdk/providers/ollama.ts:89) |
| Health check | **PARTIAL** | `connect()` probes `GET /api/tags` as a live check (ollama.ts:133); no explicit `/health`/`/api/version` endpoint, no status endpoint |
| Ollama API client | **PARTIAL** | `POST /v1/chat/completions` + `GET /api/tags` only. Missing: native `/api/chat`, `/api/embeddings`, `/api/version` |
| Model discovery | **COMPLETE** | `listModels()` → `/api/tags` (ollama.ts:78) |
| Model listing | **COMPLETE** | `atlas ollama models` (providers.ts:133) |
| Model selection | **COMPLETE** | `atlas ollama use <model>` → `OllamaService.use()` (ollama.ts:182) |
| Selected model persistence | **COMPLETE** | `~/.codeatlas/providers.json`: `activeProvider`, `activeModel`, `ollama.model` (ollama.ts:182-200; config.ts:93-106) |
| Provider abstraction | **COMPLETE** | `ProviderPort` + `OllamaAdapter` registered via `createProviderService` (provider.service.ts:57) |
| Chat requests | **COMPLETE** | `complete()` (ollama.ts:41) — used by summary/briefing |
| Streaming | **MISSING** | `stream: false` hardcoded (ollama.ts:50); no streaming in *any* adapter; `docs/AI_PROVIDERS.md` marks streaming **[PLANNED]** |
| Tool calling | **MISSING** | No `tools`/`functions` in `ProviderRequest` or any adapter body; zero tool-call parsing |
| Function calling | **MISSING** | Same |
| Agent ↔ Ollama communication | **MISSING** | `@atlas/agents` adapters are only claude/gemini/codex/opencode (adapters.ts:10); no Ollama adapter; `context launch --provider` validates against those only |
| Ollama ↔ CodeAtlas communication | **PARTIAL** | Ollama *can* generate summaries/briefings via `ProviderPort.complete`; it cannot read repository context interactively |
| Context requests | **MISSING** | No mechanism for a model to request CodeAtlas context mid-turn; context is injected one-shot at launch |
| Repository/file requests | **MISSING** | Same |
| Error handling | **PARTIAL** | Typed `ProviderNetworkError`/`ProviderRequestError` + `Result` (ollama.ts:63-66); no retry/backoff, no streaming errors, no per-model validation |
| Connection state | **COMPLETE** | `OllamaStatus` (connected/mode/baseUrl/hasApiKey/keyDisplay/model) (sdk/providers/ollama.ts:27) |
| UI/CLI configuration | **COMPLETE** | `atlas ollama status/connect/disconnect/models/use`, `atlas providers` (providers.ts) |
| Tests | **PARTIAL** | `packages/sdk/tests/ollama.test.ts` (8 tests: status/connect/cloud-key/disconnect/env/use/overview), provider adapter/config/service tests exist. Missing: streaming, tool-calling, agent-integration, live-server tests |

---

## 3. Critical Ollama Question

### A. Can the user select an Ollama model? — **Yes**
- **Where:** `atlas ollama connect` (probe + persist), `atlas ollama use <model>` (select), `atlas ollama models` (discover).
- **Stored:** `~/.codeatlas/providers.json` as `activeProvider:"ollama"`, `activeModel`, `ollama.model` (0600; key only on `--save-key`).
- **How the agent accesses it:** `createProviderService()` (sdk/providers/service.ts:27) reads the persisted model into the adapter's `defaultModel`; the summary/briefing paths call it. **The agent runtime does not read it** — external CLI agents use their own models.

### B. Can the selected model communicate with the CodeAtlas agent runtime? — **No**
Current flow is one-directional:
`User → atlas context launch --provider opencode|claude|gemini|codex → external CLI spawn (SessionPort)`. The provider system (where Ollama lives) is a stateless `complete()` call. There is no runtime that hosts an Ollama session, no message loop, no state.

### C. Can the model request tools/context? — **Not implemented** (neither real tool calling nor prompt injection *from the model*)
- **Real tool calling:** none — no `tools` param anywhere.
- **Manual prompt injection:** context is injected *into the launch prompt* before the agent starts (ADR-008 `ContextPackage`), and CLI agents get MCP tools. The Ollama side has neither.

### D. Can CodeAtlas return targeted repository context? — **Yes, extensively (do not rebuild)**
- Search: `atlas search` / `ContextSDK.search` / MCP `search_files`/`search_symbols`
- File retrieval: `ContextSDK.files.readRange` / MCP `read_file_range`
- Symbols: `search_symbols`, `explain`
- Dependencies/references: `get_dependencies`, graph queries, `explain_module`
- Context generation: `atlas context build`, `getRelevantContext`, `ContextBuilderService`
- MCP: 7 tools over stdio

---

## 4. Ollama Gap Analysis

| Capability | Current Status | Existing Implementation | Missing Work | Priority |
|---|---|---|---|---|
| Connection | COMPLETE | `OllamaAdapter`/`OllamaService.connect` | — | — |
| Health Check | PARTIAL | connect() → `GET /api/tags` | explicit `/api/version` probe + state | P1 |
| Model Discovery | COMPLETE | `listModels()` | — | — |
| Model Selection | COMPLETE | `atlas ollama use` | — | — |
| Persistence | COMPLETE | `providers.json` | — | — |
| Chat | COMPLETE | `complete()` | — | — |
| Streaming | MISSING | — | `stream` in `ProviderRequest` + adapter (SSE/NDJSON) | P1 |
| Tool Calling | MISSING | — | `tools` on `ProviderRequest`, adapter sends/parses `tool_calls`, result plumbing | **P0** |
| Agent Communication | MISSING | — | provider-backed chat-agent runner behind `SessionPort`/`AgentPort` for `provider:"ollama"` | **P0** |
| Context Requests | MISSING | — | tool-call execution → Context SDK → results back to model | **P0** |
| Error Handling | PARTIAL | typed errors + `Result` | retries, streaming errors, model-not-found | P1 |
| Tests | PARTIAL | service/adapter tests | streaming, tool-call loop, agent-integration | **P0** |

**Minimum work to "complete Ollama":** (1) tool-calling on `ProviderPort` + `OllamaAdapter`; (2) a provider-backed chat-agent runner wired into the session system so `provider:"ollama"` works like the CLI adapters; (3) an in-turn context-tool loop; (4) streaming; (5) tests. Model selection/persistence/connection/listing are done.

---

## 5. Toolkit / Tools Audit

- **Tool definitions:** two separate definitions — (a) Toolkit **registry** records in `packages/toolkit/src/catalog.json` (biome, ripgrep, eslint, prettier, etc. — install metadata only); (b) **MCP runtime tools** in `packages/mcp/src/tools.ts` (`search_symbols`, `search_files`, `get_summary`, `get_dependencies`, `explain_module`, `project_overview`, `read_file_range`).
- **Tool implementations:** MCP tools are implemented SDK consumers. Toolkit tools are external CLIs that CodeAtlas **installs and configures but never executes**.
- **Skills:** a toolkit `skill` installer adapter shallow-clones a `SKILL.md` repo into `.codeatlas/skills/<name>/` (installer-adapters.ts:231; docs/AGENT_TOOLKIT.md §5). This is a *distribution* mechanism, **not** a skill runtime — nothing executes skills.
- **Toolkit installer:** adapters npm/pip/cargo/go + skill; `binary`/`github-release`/`mcp` declared but not executable.
- **Toolkit configuration:** `ConfiguratorPort` with claude/gemini/codex/opencode/mcp/vscode adapters (`atlas tools configure`, `atlas agents connect`).
- **MCP tools:** 7 context tools; **agent tools** = same MCP tools registered into each CLI agent's config.
- **External tools:** catalog tools are used by agents independently; CodeAtlas is not their executor.
- **Tool metadata/provenance:** `catalog.json` (per-field provenance) + per-tool `ToolManifest` (`.codeatlas/tools/<name>.json`).
- **Discovery:** `atlas tools search/info/overview/categories`.
- **Execution:** **CodeAtlas executes no tools.** Agents execute MCP tools themselves (through the stdio server).
- **Permissions:** `SecurityPort` trust gating on *install*; approval flow; **no runtime per-call permission layer** for MCP tool calls.
- **Lifecycle:** install/remove/update/configure/doctor via toolkit + manifest.

**Do tools communicate directly with CodeAtlas or operate independently?** Both: MCP tools talk to CodeAtlas (through the server → Context SDK); toolkit-installed tools operate as independent CLIs/skills.

---

## 6. Architecture Question

The desired final architecture is **already ~80% present**:

```
CodeAtlas
 ├─ Context Engine (createContextSDK, atlas context build) ✓
 ├─ Tool System: MCP tools ✓ (context); toolkit registry ✓ (management) — no runtime executor
 └─ Agent Runtime (SessionPort/AgentService + createOrchestrator) ✓ for CLI agents
     ├─ OpenCode ✓ (adapter + MCP registration)
     └─ Ollama ✗ (provider only; no chat-agent runner, no tool loop)
```

To avoid duplication: **reuse** `ProviderPort` (don't add a second provider abstraction), **reuse** the 7 MCP tool definitions as the context-tool set for any new runtime (don't create a second registry), **reuse** `SessionPort`/session-manager for the Ollama runner (don't build a parallel runtime), and keep the toolkit registry as the tool-*management* catalog (it is not a runtime executor and should not be made one).

---

## 7. Tool Integration Gap Analysis

| Q | Answer |
|---|---|
| 1. Are existing tools registered with CodeAtlas? | Toolkit registry: yes. MCP tools: yes (server `tools/list`). No unified runtime registry binding the two. |
| 2. Can the agent discover them? | CLI agents: yes, via MCP (`tools/list`) and `atlas tools search`. Ollama agent: no (no agent). |
| 3. Can the agent execute them? | CLI agents: yes, via MCP `tools/call`. Ollama: no. |
| 4. Can Ollama use them? | No. No tool-calling transport. |
| 5. Can OpenCode use them? | **Yes** — `opencode.json` registers `codeatlas-mcp`; proven by `benchmarks/final-2026-08` (agent MCP tool calls captured). |
| 6. Tools treated as independent skills? | Toolkit-installed tools yes (independent CLIs). MCP context tools no (SDK-backed). "Skills" = cloned `SKILL.md` bundles, not executed. |
| 7. Can the toolkit install/configure tools while CodeAtlas stays the execution/orchestration layer? | Yes — that is exactly its design. Nothing in the toolkit executes tools; adding a runtime executor alongside it is safe and non-conflicting. |
| 8. Smallest architectural change? | Add tool-calling to `ProviderPort`; add a provider-backed chat-agent runner behind the existing session system; expose the existing 7 context tools to that runner. No new registry, no new provider system, no new runtime framework. |

---

## 8. `atlas benchmark` Audit

**There is no `atlas benchmark` command.** The CLI has 20 commands; none is benchmark. What exists:

| Artifact | Location | What it does |
|---|---|---|
| `pnpm benchmark` | `benchmarks/run-benchmark.ts` | Shells out to `atlas init/update/search/explain/context/doctor` on 5 fixture repos; scan/task/freshness/memory metrics; char/4 token estimate; Markdown + JSON. Baseline is *hard-coded estimates*, not real runs. |
| `pnpm benchmark:single` | `benchmarks/run-single.ts` | Same, single repo. |
| Extreme stress | `benchmarks/extreme/` | `run-monitored.mjs` (RSS/MemAvailable guard), 1000/5000-file generated corpora; results.json. |
| Final 2026-08 | `benchmarks/final-2026-08/` | `run-benchmark.mjs` — **real** OpenCode runs (`opencode run --format json`) twice per task (baseline vs CodeAtlas MCP), real per-step token/cost from `step_finish`, task suites (`tasks/*.json`), automated evaluation (file/concept ratios), `generate-reports.mjs` → `benchmark.md`/`summary.md`/`failures.md`. |
| MCP benchmark | `tests/benchmarks/mcp-benchmark.ts` | MCP tool latency via in-memory transport (tracked, not CI-wired per docs/FULL_AUDIT.md:376). |
| `@atlas/metrics` | `packages/metrics` | `MetricsPort`: activity + token-efficiency snapshot (`.codeatlas/metrics.json`), `atlas metrics show/export/reset`. **`recordTokenEstimate` is never called.** |
| `@atlas/usage` | `packages/usage` | Tri-state actual/estimated/unknown tokens+cost, budgets/limits, `withUsageTracking` wraps provider calls; `.codeatlas/usage.db`. |

So: token/cost/latency capture (for OpenCode) exists in the 2026-08 harness; a persistence/analytics subsystem exists (`metrics`, `usage`); a CLI does not; Ollama support does not; the five harnesses are not consolidated.

---

## 9. Benchmark Gap Analysis

| Capability | Status | Existing Location | Missing Work | Priority |
|---|---|---|---|---|
| CLI command | MISSING | — | `atlas benchmark` namespace (init/run/status/report) | **P0** |
| Benchmark runner | PARTIAL | `final-2026-08/run-benchmark.mjs`, `run-benchmark.ts` | single reusable runner behind a port; no shell-out-only dependency | **P0** |
| Task system | PARTIAL | hard-coded per script; `tasks/*.json` (final-2026-08) | declarative task format + `init` scaffolder | **P0** |
| Baseline mode | PARTIAL | no-MCP mode (final-2026-08); hard-coded estimates (run-benchmark.ts) | real baseline run per task | **P0** |
| CodeAtlas mode | PARTIAL | MCP-enabled mode (final-2026-08) | fold into CLI runner | **P0** |
| OpenCode | **PARTIAL** | final-2026-08 (opencode run) | reusable driver | **P0** |
| Ollama | MISSING | — | driver over the new provider-backed chat-agent | P1 |
| Token metrics | PARTIAL | real `step_finish` tokens (final-2026-08); `@atlas/usage` | unify capture + persistence | **P0** |
| Cost metrics | PARTIAL | opencode cost events; `StaticPricingSource` (no ollama entry) | ollama pricing (≈0 local / unknown cloud) | P2 |
| Latency | PARTIAL | wall/event spans in all harnesses | standardized per-phase timings | P1 |
| Accuracy | PARTIAL | automated eval in final-2026-08 (files/concepts) | reuse as-is | P1 |
| Raw JSON | PARTIAL | `results/`, `repo-0X/raw-results.json` | `--json` on all commands | **P0** |
| Markdown report | PARTIAL | `generate-reports.mjs` | `atlas benchmark report` | **P0** |

---

## 10. Architecture Problems

| # | Issue | Class | Where |
|---|---|---|---|
| 1 | Ollama cannot participate in the agent flow (no tool-calling, no chat-agent runner) | **CRITICAL** | provider.port.ts, agents/adapters.ts |
| 2 | Five parallel benchmark harnesses duplicate runner/eval/report logic | **HIGH** | `benchmarks/*`, `tests/benchmarks/` |
| 3 | No `atlas benchmark` command; `pnpm benchmark` shells out and mixes estimates with real numbers | **HIGH** | package.json:22-23 |
| 4 | `MetricsPort.recordTokenEstimate` is dead (never called) — token-savings dashboard is unfed | **MEDIUM** | metrics.service.ts:107 |
| 5 | No streaming in `ProviderPort` or any adapter | **MEDIUM** | provider.port.ts, adapters/* |
| 6 | `@atlas/usage` pricing table has no Ollama entry | **LOW** | usage/src/pricing.ts |
| 7 | Two registries (toolkit catalog vs MCP tools) without a documented runtime bridge | LOW (documented in docs; not a bug) | toolkit/catalog.json, mcp/tools.ts |
| 8 | Docs drift: ROADMAP marks "Provider expansion: Ollama" **[PLANNED]** though implemented | **LOW** | docs/ROADMAP.md:91 |
| 9 | `undefined/` junk dir at repo root | **LOW** | `undefined/` |
| 10 | `atlas init` `--tools` offer + TUI slash surface untracked/intentional | LOW | — |

No provider-specific switches leak outside adapters; the toolkit has no runtime executor (so no duplication to remove); `@atlas/context` is deterministic (do not add AI gating).

---

## 11. Proposed Final Architecture (based on existing code)

```
Current:                                   Target (minimal deltas):
 ProviderPort (complete) ────────►  summary/briefing only
 AgentPort/SessionPort ──► claude/gemini/codex/opencode CLIs
 MCP tools ──────────────► CLI agents (opencode ✓)
 Toolkit registry ───────► install/configure (never execute)
 benchmarks/* ───────────► ad-hoc scripts
```

```
        CodeAtlas
         │        │
   Context Engine  Tool System
   (createContextSDK)  │
         │        ├─ MCP tools (7) ── reused as the runtime tool set
         │        └─ Toolkit registry (management only, unchanged)
         └──── Agent Runtime (SessionPort + createOrchestrator)
                ├─ CLI adapters (claude/gemini/codex/opencode)  [existing]
                └─ NEW: provider-backed chat-agent runner
                      ├─ provider: "ollama" → selected model (ProviderPort + tool-calling)
                      └─ OpenCode (unchanged)
                            ▲
                   atlas benchmark (new: init/run/status/report)
                   ├─ reuses @atlas/agents (opencode + ollama runners)
                   ├─ reuses @atlas/usage (tokens/cost, tri-state)
                   └─ reuses task format + eval from benchmarks/final-2026-08
```

**Deltas:** (1) tool-calling on `ProviderPort`; (2) a chat-agent runner for Ollama behind the existing session system; (3) route the existing 7 context tools into that runner; (4) a `@atlas/benchmark` package + CLI command reusing agents/usage/metrics; (5) retire/consolidate the ad-hoc harnesses into it.

---

## 12. Phased Implementation Plan

> Every phase assumes you follow AGENTS.md: read code+tests first, keep the port seam, ADR for architectural changes, run `pnpm check`, update `docs/`.

### Phase 1 — Complete Ollama at the provider level
- **Goal:** streaming + tool-calling + robustness on `ProviderPort`/`OllamaAdapter`.
- **Depends on:** nothing new.
- **Files:** `packages/core/src/ports/provider.port.ts`, `packages/providers/src/adapters/ollama.ts` (+ all adapters), `packages/providers/src/parse.ts`, tests.
- **Tasks:** `[x]` extend `ProviderRequest` with `tools` + `stream` (additive, optional — no breaking change); `[x]` `OllamaAdapter` sends `tools` and parses `tool_calls` from responses; `[x]` streaming path (`stream:true`, NDJSON); `[x]` `/api/version` health probe; `[x]` retry/backoff + streaming error handling; `[x]` ollama pricing entry (optional) (provider wildcard, $0 local); `[x]` tests.
- **Acceptance:** `[x]` adapter returns structured tool-calls; `[x]` stream returns chunks; `[x]` typed failures on stream errors; `[x]` `pnpm check` green.
- **Risk:** low (additive); **Complexity:** medium.

### Phase 2 — Ollama agent runtime
- **Goal:** `provider:"ollama"` becomes a first-class agent on the session system using the selected model.
- **Depends on:** Phase 1.
- **Files:** `packages/agents` (new `OllamaAgentAdapter` or chat-runner behind `SessionPort`), `packages/sdk/src/sessions`, `apps/cli/src/commands/context.ts` (allow `--provider ollama`), tests.
- **Tasks:** `[x]` chat-agent runner (messages, selected model from `createProviderService`); `[x]` wire into `launch()`/`attach()`; `[x]` `atlas context launch "…" --provider ollama`; `[x]` session usage recording with actual tokens; `[x]` tests.
- **Acceptance:** `[x]` user selects a model (`atlas ollama use`), launches, model answers; `[x]` usage recorded with actual tokens.
- **Risk:** medium (new runtime seam); **Complexity:** medium-high.

### Phase 3 — CodeAtlas tool loop for Ollama
- **Goal:** the selected model can request repository context mid-turn; CodeAtlas executes and returns.
- **Depends on:** Phase 2.
- **Files:** `packages/sdk/src/context-integration` or a small tool-executor module mapping the 7 MCP tool calls (reuse `packages/mcp/src/tools.ts` definitions + `ContextSDK`) to a tool loop; tests.
- **Tasks:** `[x]` expose context tools as tool schemas to the runner; `[x]` execute `tool_calls` against `ContextSDK`; `[x]` feed results back; `[x]` context budgeting/permissions (reuse ADR-008 budget + security rules).
- **Acceptance:** `[x]` Ollama → tool request → targeted context → continues; `[x]` no duplicate registry (MCP definitions reused).
- **Risk:** medium; **Complexity:** medium-high.

### Phase 4 — `atlas benchmark`
- **Goal:** `atlas benchmark init/run/status/report` reusing existing infra.
- **Depends on:** Phases 1–3 (OpenCode path works today; Ollama path needs Phase 2/3).
- **Files:** new `packages/benchmark` (behind a new `BenchmarkPort` in `core`), CLI command `apps/cli/src/commands/benchmark.ts`, port `tests/benchmarks/mcp-benchmark.ts` + `final-2026-08` task/eval/report logic.
- **Tasks:** `[x]` `BenchmarkPort` + runner (task → baseline run + CodeAtlas run via agents runners); `[x]` declarative task format + `init` scaffolder; `[x]` metrics capture via `@atlas/usage` (and feed `MetricsPort.recordTokenEstimate`); `[x]` persistence (JSON); `[x]` `report` (Markdown) ported from `generate-reports.mjs` (`packages/benchmark/src/reporter.ts`, wired into `atlas benchmark report`); `[x]` `--json`; `[x]` consolidate/retire ad-hoc harnesses (scope documented in `benchmarks/README.md`: `final-2026-08` repos/tasks retained as suite inputs, `run-benchmark.ts`/`run-single.ts` superseded, `extreme` + `tests/benchmarks/mcp-benchmark.ts` retained as specialized harnesses).
- **Acceptance:** `[x]` `atlas benchmark init/run/status/report`; `[x]` opencode + ollama runners; `[x]` baseline + codeatlas modes; token/cost/latency/accuracy metrics; `[x]` reproducible (pinned suite configs + versioned task files, resumable runs, single-command reproduce documented in `docs/benchmark.md`).
- **Risk:** medium; **Complexity:** high.

### Phase 5 — End-to-end integration
- **Goal:** prove both chains with tests.
- **Depends on:** Phases 1–4.
- **Tasks:** `[x]` OpenCode → CodeAtlas → Tools; `[x]` Ollama → CodeAtlas → Tools → Context → Ollama; `[x]` MCP unchanged; `[x]` full `pnpm check`.
- **Acceptance:** `[x]` both flows pass automated tests; `[x]` no MCP regression.

### Phase 6 — Final benchmark run
- **Goal:** publish honest numbers at 100/250/500/1000 files.
- **Depends on:** Phase 4/5.
- **Tasks:** `[x]` 4 repos (~100/250/500/1000 files); `[x]` OpenCode + Ollama + CodeAtlas + Toolkit + MCP; measure tokens/saved/cost/saved/latency/accuracy/tool-calls/failures. **All complete:** winston 18/18, commander 18/18 (R2-T09 re-run scored 2/2), axios 16/16, rxjs 16/16. Results (`opencode/nemotron-3-ultra-free`): token *savings* turn positive only at the largest repo (rxjs: −911K tokens, −22%); on smaller repos CodeAtlas mode adds tokens (MCP context) while accuracy is flat-to-higher (commander +0.44, axios +0.25, winston −0.11, rxjs −0.38). Full tables in `docs/benchmark.md`.
- **Acceptance:** `[x]` reproducible results (pinned suites + task files; single-command reproduce documented), `[x]` docs updated (`docs/benchmark.md`, FEATURE_STATUS, CURRENT_STATE, AGENTS, CLI, DOCUMENTATION_MAP).
- **Results so far (winston-bench, nemotron-3-ultra-free):** Token savings: −206K (codeatlas mode used more tokens due to MCP context); Cost savings: $0 (free model); Accuracy delta: −0.11 (slightly lower in codeatlas mode). All 18 tasks exited code 0.

---

## 13. Detailed Task Checklist (prioritized)

**P0 — required for core functionality**
- [x] `ProviderRequest.tools` + `tool_calls` parsing (core + ollama adapter)
- [x] Provider-backed chat-agent runner (`provider:"ollama"`) on the session system
- [x] `atlas context launch --provider ollama`
- [x] Ollama tool loop over existing MCP/Context-SDK tools
- [x] `atlas benchmark` CLI (init/run/status/report), OpenCode + baseline + CodeAtlas modes
- [x] Feed real tokens/cost into `@atlas/usage` and `MetricsPort.recordTokenEstimate`
- [x] Tests for all of the above

**P1 — production-quality MVP**
- [x] Streaming on `ProviderPort` + adapters
- [x] Ollama explicit health probe (`/api/version`) + model-not-found handling
- [x] Retry/backoff for provider calls; streaming error handling
- [x] Declarative benchmark task format + `atlas benchmark init`
- [x] Standardized latency capture per phase (per-task `durationMs` + per-tool-call durations in both runners; `latencyMs` recorded into `@atlas/usage`)
- [x] Consolidate/retire `run-benchmark.ts`, `run-single.ts`, `extreme`, `tests/benchmarks` into the CLI runner (or document scope) — scope documented in `benchmarks/README.md`
- [x] Ollama benchmark driver (Phase 4) (`OllamaRunner` + e2e test with real tool loop; **now registered in the CLI runner map** — mode-aware: plain chat for baseline, tool loop for codeatlas, per-task timeout enforced)

**P2 — useful improvements**
- [x] Ollama pricing entry (`StaticPricingSource` provider wildcard `"*"`: $0/token local inference with an explicit note; exact entries still win over the wildcard)
- [x] `atlas benchmark status` resume/reuse of completed runs
- [x] Security/permissions surface for runtime tool calls (advisory) — `ToolCallPolicy` (`allowedTools`/`deniedTools`/`maxToolCalls`/`maxResultChars`) on `ToolUsingChatAgent`: only allowed tools are offered to the model, denied calls get an error result the model can react to (run continues), denials surfaced on `ChatAgentResult.deniedToolCalls` and marked as errors in benchmark tool-call records

**P3 — optional (closed by explicit decision where not built)**
- [x] Embeddings/vector scorer wiring — **resolved: deferred by design.** The `RelevanceScorer` seam is intentional (deterministic lexical default); wiring vectors needs embedding storage + an ADR and is out of this plan's scope.
- [x] Native Ollama `/api/chat` endpoint adapter — **resolved: won't-do.** The OpenAI-compatible `/v1/chat/completions` endpoint already covers tools + streaming + usage and is Ollama's recommended stable surface; a parallel native path would duplicate transport/parsing for no consumer (AGENTS.md §4.3/§4.11).
- [x] `atlas benchmark report --format pdf/html` — **html [IMPLEMENTED]** (`renderHtml`, standalone styled document, escaped); **pdf deferred** (print-to-PDF from the HTML output covers the need; a dependency-free PDF writer would be gimmicky).

---

## 14. Final Implementation Order

```
Phase 1 (provider tool-calling+streaming)
   ↓
Phase 2 (ollama chat-agent runtime)
   ↓
Phase 3 (ollama → CodeAtlas context-tool loop)
   ↓
Phase 4 (atlas benchmark)
   ↓
Phase 5 (end-to-end integration tests)
   ↓
Phase 6 (final benchmark run at 100/250/500/1000)
```

**Why this order:** 1 is the dependency leaf (nothing else works without tool-calling). 2 builds the only missing runtime seam. 3 delivers the headline workflow. 4 can start in parallel for OpenCode today but its Ollama driver needs 2/3, so it sits after. 5 validates, 6 publishes. There is no cycle; each phase's tests gate the next.

---

## 15. Definition of Done

```
OLLAMA
[x] Connection works
[x] Models discovered
[x] Model selectable
[x] Selected model persisted
[x] Agent communicates with model (atlas context launch --provider ollama)
[x] Model can request CodeAtlas tools/context (real tool_calls)
[x] CodeAtlas returns targeted context
[x] Tool results return to model
[x] Errors handled (typed + retries)
[x] Tests pass

TOOLS
[x] Existing tools audited  (done — this report)
[x] Existing tools reused (MCP tools; no duplicate registry)
[x] No duplicate skill architecture (toolkit "skill" stays a distribution mechanism)
[x] Tools connected to CodeAtlas (context-tool loop)
[x] Agent can discover tools (MCP tools/list + atlas tools)
[x] Agent can execute tools
[x] Ollama can use tools where supported
[x] Existing MCP functionality preserved (no regression)

BENCHMARK
[x] atlas benchmark exists
[x] benchmark init
[x] benchmark run
[x] benchmark report
[x] OpenCode supported
[x] Ollama supported (mode-aware runner registered in the CLI: plain chat baseline, MCP-tool-loop codeatlas, timeout enforced, auto-index before codeatlas runs)
[x] baseline supported
[x] CodeAtlas mode supported
[x] token metrics (real, via @atlas/usage)
[x] cost metrics
[x] latency metrics
[x] accuracy metrics (files/concepts eval reused)
[x] raw JSON
[x] Markdown report

FINAL
[x] 100-file repository (winston-bench: 18/18 tasks complete)
[x] 250-file repository (commander-bench: 18/18 — R2-T09 re-run, scored 2/2; accuracy delta +0.44)
[x] 500-file repository (axios-bench: 16/16 tasks complete; accuracy delta +0.25)
[x] 1,000-file repository (rxjs-bench: 16/16 tasks complete; **911K tokens saved (−22%)** — first positive-savings suite, at the scale CodeAtlas targets; accuracy −0.38)
[x] Full end-to-end benchmark (all 4 suites complete + e2e tests + live Ollama smoke run via the CLI)
[x] Results reproducible (pinned suite configs + versioned task files + resumable runs; reproduce with one command per suite, documented in `docs/benchmark.md`)
```

---

## 16. Recommended First Phase

**Phase 1 — Complete Ollama at the provider level** (tool-calling + streaming + error handling on `ProviderPort`/`OllamaAdapter`).

**Why:** It is the smallest, safest, highest-leverage step. The audit proves everything the user-facing workflow needs downstream (Ollama agent loop → context tools → benchmark) is blocked only by the missing `tools`/`stream` transport on `ProviderPort` — model selection, persistence, connection, and the entire context engine already exist. It is purely additive (no breaking change to existing adapters), needs no new packages, and unblocks Phase 2/3/4 in dependency order. Do it *before* any benchmark work, because the Ollama benchmark driver cannot exist without the agent loop, and the agent loop cannot exist without tool-calling.

Secondary quick win you can do in parallel: **wire `MetricsPort.recordTokenEstimate`** (a 5-line change) so the existing `atlas metrics` token-efficiency surface stops being dead code, and file an ADR for the Phase 1 `ProviderRequest` extension.