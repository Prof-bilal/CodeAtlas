# CodeAtlas Architecture

This is the **canonical** architecture reference. It documents what exists
today (as of 2026-08-09), the target architecture the project is heading
toward, and the gap between the two. See
[CURRENT_STATE.md](./CURRENT_STATE.md) for per-module status tags.

> The repository is a **clean-architecture monorepo**. Business/domain rules
> live in the center; every infrastructure detail (file systems, databases,
> HTTP, LLM APIs, child processes) is pushed to the edges behind small
> interfaces.

---

## 1. Product Directions

CodeAtlas has three major directions. The first is implemented; the other two
are planned (with one building block of the second implemented).

```
                          CodeAtlas
                              |
              +---------------+----------------+
              |               |                |
        Context Engine    Agent Platform    Agent Toolkit
        (implemented)     (planned)         (partial)
              |               |                |
     +--------+--------+    Agent Router     Registry / Installer
     |        |        |        |             Configurator / Security
 Scanner  Parser  Graph   +-----+-----+-----+
     |        |        |   |     |     |     |
     +--------+--------+ Claude Gemini Codex OpenCode
              |
        Context Database
              |
           Search
              |
        MCP / SDK
```

**Direction A — Context Engine.** Analyzes repositories and builds persistent,
reusable project context. **~85% implemented** (see §3).

**Direction B — Unified AI CLI Orchestrator.** A unified CLI that launches and
manages existing AI coding CLIs. **Partly implemented** — the narrow
spawn/detect boundary (`@atlas/agents`, behind `AgentPort`) and the **Agent
Session Manager** (behind `SessionPort`, `atlas sessions`, via
`createSessionManager()` in `@atlas/sdk`) are implemented; the **agent router
and slash commands** do not exist yet (see [AGENT_SESSIONS.md](./AGENT_SESSIONS.md)
and [AGENT_ORCHESTRATOR.md](./AGENT_ORCHESTRATOR.md)).

**Direction C — Agent Toolkit.** A curated interface to discover, install,
configure, and verify high-quality open-source developer/AI-agent tools.
**Foundations implemented** — the **Tool Registry** (`@atlas/toolkit` behind
`ToolRegistryPort`, composed via `createToolRegistry()`), the **Tool Manifest
System** (versioned/validated/extensible per-installed-tool manifests in
`.codeatlas/tools/`), and the **Compatibility Engine** (behind
`CompatibilityPort`, composed via `createCompatibilityEngine()`), and the
**Tool Installer** (behind `InstallerPort`, composed via `createInstaller()`).
The Configurator is **[IMPLEMENTED]** (Task 23); Security/Trust remains
**[IMPLEMENTED]** (Task 24): offline SecurityAssessor behind `SecurityPort`.
See [AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md),
[TOOL_REGISTRY.md](./TOOL_REGISTRY.md), and
[TOOL_MANIFEST.md](./TOOL_MANIFEST.md).

> **Principle:** CodeAtlas *orchestrates* existing AI CLIs and tools; it does
> not unnecessarily recreate their internal functionality.

---

## 2. Actual Monorepo Layout (current)

```
apps/
  cli/          # Commander.js CLI — thin UI; search + mcp wired, rest "Coming Soon"
  extension/    # VS Code extension (@atlas/extension) — SDK consumer
packages/
  shared/       # Base types, Result, branded IDs, VERSION             (foundation)
  core/         # Domain entities + port interfaces (type-only)        (foundation)
  scanner/      # File walking + ignore + language/framework + manifest
  hashing/      # SHA-256, change detection, JSON snapshots
  parser/       # Language → normalized Symbol IR (TypeScript via ts-morph)
  graph/        # Dependency graph (imports, calls, inheritance, cycles)
  storage/      # SQLite context database (node:sqlite) + repositories
  cache/        # Generic caching (TTL + optional JSON persistence)
  providers/    # AI model adapters (Claude / OpenAI / DeepSeek / Gemini)
  summary/      # AI file/folder/module/project summaries
  search/       # Ranked, fuzzy-aware project search (vector-ready seam)
  context/      # Context ranking & assembly  — INTENTIONAL STUB
  agents/       # AI CLI connection layer (AgentPort) — spawn/detect external AI CLIs
  mcp/          # MCP server exposing context to AI tools (consumes the SDK)
  sdk/          # Composition root (Container) + Context API/SDK (createContextSDK)
docs/           # This documentation system
examples/       # Placeholder (no runnable examples yet)
```

> `packages/agents` (`@atlas/agents`) implements the **narrow spawn/detect
> boundary** of the orchestrator (Direction B): per-CLI adapters, executable
> detection, supervised non-interactive process runs behind `AgentPort`, a
> `ProcessRunner.launch()` for long-running children, and the **Agent Session
> Manager** behind `SessionPort`. It is **composed** into the SDK for sessions
> (`createSessionManager`) and wired to the CLI (`atlas sessions`); the **router
> and slash commands** remain planned. See [AGENT_SESSIONS.md](./AGENT_SESSIONS.md)
> and [AGENT_ORCHESTRATOR.md](./AGENT_ORCHESTRATOR.md).

---

## 3. Layer Responsibilities (as implemented)

### Foundation layer
- **`packages/shared`** — dependency-free. Base types (branded IDs, `Result`),
  constants (`VERSION`, `NAME`), `ComingSoonError`. No business logic.
- **`packages/core`** — the heart of the domain, **type-only**:
  - Entities: `Project`, `SourceFile`, `Symbol`, `Reference`, `GraphNode`,
    `GraphEdge`, `ContextItem`.
  - Ports (interfaces): `ScannerPort`, `ParserPort`, `StoragePort`,
    `GraphPort`, `ContextBuilderPort`, `CachePort`, `ProviderPort`, `HashPort`,
    `SummaryPort`, `ContextDatabasePort`.
  - `core` contains **no infrastructure**; it declares *what* the system can do.

### Feature layer (implementations of `core` ports)
- **`packages/scanner`** → `ScannerPort`: walks the file system, applies ignore
  rules, detects language/framework, reads files, generates `.codeatlas/manifest.json`.
- **`packages/hashing`** → `HashPort`: SHA-256, change classification
  (`changed/added/deleted/unchanged`), versioned JSON snapshots.
- **`packages/parser`** → `ParserPort`: source → language-agnostic `Symbol`s via a
  plugin `ParserRegistry`; `SymbolIndexer` resolves references across files.
- **`packages/graph`** → `GraphPort`: symbol/file dependency graph, BFS shortest
  path, Tarjan cycle detection, JSON export.
- **`packages/storage`** → `ContextDatabasePort` (+ legacy `StoragePort`):
  SQLite context DB with repositories, migrations, transactions, search.
- **`packages/cache`** → `CachePort`: generic TTL cache.
- **`packages/providers`** → `ProviderPort`: unified adapter over AI model APIs.
- **`packages/summary`** → `SummaryPort`: structured AI summaries, content-hash cached.
- **`packages/search`** → `SearchPort`: deterministic ranked search over the
  context snapshot — symbols, files, modules, dependencies, and summaries, with
  typo-tolerant fuzzy matching. Ranking flows through a `RelevanceScorer` seam so
  an embedding scorer (vector search) can be added later without touching callers.
- **`packages/context`** → `ContextBuilderPort`: **stub by design** — ranking/assembly
  intentionally deferred; methods throw `ComingSoonError`.
- **`packages/agents`** → `AgentPort` (+ `SessionPort`): the **AI CLI
  connection layer** for Direction B — per-CLI adapters
  (Claude/Gemini/Codex/OpenCode), executable detection, supervised
  non-interactive child-process runs, `ProcessRunner.launch()`, and the
  **Agent Session Manager**. It is the narrow spawn/detect seam; the **router
  and slash commands** build on it (planned). Composed into the SDK for sessions
  (`createSessionManager`).

### Application layer
- **`packages/sdk`** — the public façade / composition root. `Container.create()`
  registers every implementation behind its port; `ContainerOptions` is the
  plugin seam (any service can be overridden).
- **`createContextSDK`** (same package, `src/context/`) — the stable Context
  API consumers use to read a project's indexed context (files, symbols,
  dependencies, modules, summaries, search, project, status, relevant context)
  behind the `ContextDatabasePort`/`SearchPort` contracts. The database is
  hidden behind `ReadRepositories`/`WriteRepositories`; consumers never import
  feature packages. See [CONTEXT_SDK.md](./CONTEXT_SDK.md) and
  [ADR-005](./decisions/ADR-005.md).

### Interface layer
- **`apps/cli`** — Commander.js. Thin: parses commands and delegates to the SDK
  (and `@atlas/mcp`). **`atlas search` is wired** through the Context SDK;
  **`atlas mcp` starts the MCP server**; `init`/`build`/`update`/`explain`/
  `doctor` still print "Coming Soon".
- **`packages/mcp` (`@atlas/mcp`)** — MCP server over stdio exposing six
  read-only tools; consumes only the Context SDK ([MCP.md](./MCP.md)).
- **`apps/extension` (`@atlas/extension`)** — VS Code extension (Activity Bar +
  tree views + palette commands), reads only through the Context SDK
  ([VSCODE.md](./VSCODE.md)).

---

## 4. Data Flow (implemented path)

```
scanner  ── files ──▶ hashing ── changed/added ──▶ parser ── symbols+refs ──▶ graph
                                                                              │
storage ◀──────── save/load context ──────────── (symbols, deps, summaries) ──┘
   ▲
search ◀── search ── SearchService builds an in-memory index from the snapshot
```

Today the pieces exist independently and are composed in the SDK container / by
consumers. **`atlas search`** routes through `createContextSDK` (the Context
API) rather than reaching for the database, and **`atlas mcp`** starts the MCP
server (`@atlas/mcp`). The indexing pipeline that *produces* the database is not
yet wired from the CLI (`init`/`build`/`update` are still "Coming Soon").

### Planned end-to-end data flow (with Agent Platform + Agent Toolkit)

```
Repository
   │  (Direction A — Code Intelligence)
   ▼
CodeAtlas Context ──── scan → hash → parse → graph → store → search → Context SDK
   │
   ├──▶ Agent Sessions (Direction B — connection + sessions implemented) ── atlas /claude · /gemini · …
   │        agents spawn & supervise external AI CLIs (router/slash commands planned)
   │
   └──▶ Agent Toolkit (Direction C — Tasks 19–24 implemented) ── assess → install → configure → verify
            tools improve context, tokens, quality for the agents above
```

The Toolkit reads CodeAtlas context only through the **Context SDK** (never the
database), and detects AI CLIs through the **`AgentPort`** seam that
`@atlas/agents` implements.

---

## 5. Target Architecture

```
        apps/cli  (thin UI — commands + /agent router entry + atlas tools)
            │
            ▼
     packages/sdk  (Container: registers implementations behind ports)
            │
  ┌─────────┼──────────────┬──────────────────┬───────────────┬───────────────┬──────────────┐
  ▼         ▼              ▼                  ▼               ▼               ▼              ▼
scanner  parser         graph             context          search       orchestrator     toolkit
   │        │              │                  │               │            (planned)     (planned)
   ▼        ▼              ▼                  ▼               ▼               │              │
hashing  storage         cache             providers      (indexes the    agents       registry/
   └────────┴──────┬───────┴───────────────────┘          snapshot)     [implemented]  installer/
                   ▼                                                                  configurator
            packages/core (entities + ports)
                   ▼
            packages/shared (base types/utils)
```

Planned additions (not yet in the repo):
- **Agent Router** + slash commands (Claude/Gemini/Codex/OpenCode/DeepSeek)
  for Direction B — the `@atlas/agents` connection layer *and* the **Agent
  Session Manager** exist (see [AGENT_SESSIONS.md](./AGENT_SESSIONS.md)); the
  router itself does not. See [AGENT_ORCHESTRATOR.md](./AGENT_ORCHESTRATOR.md).
- **Agent Toolkit** (`@atlas/toolkit` + `atlas tools` CLI) for Direction C —
  curated tool registry, installer, configurator, compatibility, security/trust.
  The **Tool Registry**, **Tool Manifest**, **Compatibility Engine**, **Tool
  Installer**, and **Tool Configurator** are implemented (Tasks 19–23);
  The broader CLI surface remains planned; Security/Trust is implemented.
  See [AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md).
- **SDK consumers** and a working CLI wired end-to-end. MCP (`@atlas/mcp`) is
  an implemented SDK consumer — see [MCP.md](./MCP.md).

---

## 6. Ports = Plugin Seams

Every extension seam is a TypeScript interface in `core`. Because nothing
depends on concrete classes, adding providers, storage backends, parsers,
scanners, or context rankers requires **zero changes** to existing consumers.

```ts
// packages/core/src/ports/provider.port.ts
export interface ProviderPort {
  complete(request: ProviderRequest): Promise<Result<ProviderResponse>>;
}
```

An implementation merely implements the port and is registered in the SDK
container:

```ts
const container = Container.create({ provider: new CustomProvider() });
```

---

## 7. Future Expansion Strategy

| Initiative                          | Where it lands                                                      |
| ----------------------------------- | ------------------------------------------------------------------- |
| New AI provider (Ollama, …)         | New adapter in `providers` implementing `ProviderPort`              |
| New language support                | New parser in `parser` implementing `LanguageParser`, registered in `ParserRegistry` |
| Alternate storage                   | New adapter in `storage` behind `StoragePort` / `ContextDatabasePort` |
| Agent routing / `/claude` etc.      | Build on the existing `@atlas/agents` connection layer (`AgentPort`); the **Agent Session Manager** (`SessionPort`) is implemented behind the SDK; add the **router** behind the SDK (planned) |
| Agent Toolkit (`atlas tools`)       | `@atlas/toolkit`: Registry, Manifest, Compatibility, Installer, Configurator, and Security/Trust are implemented behind `core` ports and composed by the SDK; `atlas tools configure` is wired, while the broader CLI remains planned |
| New tool ecosystem (npm/pip/cargo/…) | New `InstallerPort` adapter per ecosystem; never blind `install.sh` execution (planned) |
| MCP server                          | `@atlas/mcp` consumes the Context SDK (implemented); run it via `atlas mcp`; add MCP resources/prompts |
| Editors / agents read context       | `createContextSDK` is the stable read interface — that is what they consume, never the DB |
| Plugin SDK for third parties        | Publish `@atlas/sdk`; document `ContainerOptions` API               |
| New CLI commands                    | `apps/cli/src/commands/<cmd>.ts` wiring to SDK services             |
| Editor integration (VS Code)        | `@atlas/extension` consumes the SDK (implemented — see [VSCODE.md](./VSCODE.md)) |
| Vector search                       | New `RelevanceScorer` implementation in `@atlas/search` (the scorer seam) + embedding index; no caller changes needed |

---

## 8. Architecture Decisions & Divergences

These divergences from a "perfect" target are intentional and documented:

1. **`context` is a stub.** Context ranking/assembly is deferred behind
   `ContextBuilderPort` on purpose (the deterministic core comes first). Do not
   "fix" it by removing the port or by silently implementing ranking.
2. **`module-resolution.ts` is duplicated** in `graph` and `parser`. This is a
   deliberate decoupling (graph must not depend on parser) at the cost of small
   duplication. Do not unify them unless a shared home is introduced in `core`.
3. **Storage uses `node:sqlite`** (Node built-in), which raises its minimum Node
   version above the rest of the monorepo — see
   [CURRENT_STATE.md](./CURRENT_STATE.md) §5.
4. **Direction B is partly implemented** — the `@atlas/agents` connection layer
   and the **Agent Session Manager** exist (`atlas sessions`); the
   orchestrator's **router and slash commands** remain planned; the VS Code
   extension (`@atlas/extension`) is implemented as a thin SDK consumer. See
   [VSCODE.md](./VSCODE.md) and [ROADMAP.md](./ROADMAP.md).
5. **Direction C (Agent Toolkit) foundations are implemented** — the **Tool
   Registry**, **Tool Manifest System**, **Compatibility Engine**, **Installer**,
   **Configurator**, and **Security/Trust assessor** exist in `@atlas/toolkit`
   behind ports and are composed through the SDK
   ([AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md)). New toolkit work must keep the
   "orchestrate, don't bundle" and "opt-in install" principles — never blind
   execution of third-party install scripts.

---

## 9. Dependency Direction (summary)

Dependencies point inward and are **enforced by ESLint**
(`no-restricted-imports`). The full matrix is in
[DEPENDENCIES.md](./DEPENDENCIES.md). In short:

```
cli → sdk → feature packages → core → shared
```

- Feature packages import only `core` + `shared`.
- `sdk` imports every feature package.
- `cli` imports only `sdk`.
- No cycles; no sideways coupling between feature packages.
