# CodeAtlas Agent Catalog

Every implemented analysis agent maps to an `@atlas/*` package. This catalog
describes the **concrete agents** that exist today (the pipeline operators that
implemented modules provide). For the *rules* agents (human or AI) must follow,
see the root [AGENTS.md](../AGENTS.md).

> **Status:** all entries below reflect the implementation, verified against
> code (last audit 2026-08-09). Stub/service-level caveats live in
> [CURRENT_STATE.md](./CURRENT_STATE.md).

---

## Scanner Agent

- Package: `@atlas/scanner`
- Purpose: Recursively scans a project and collects **metadata** — files,
  folders, languages, framework, and markers — without reading file contents.
- Operations:
  - Walks the directory tree from the project root.
  - Skips ignored directories, matched case-insensitively: `node_modules`,
    `.git`, `dist`, `build`, `.next`, `coverage`, `vendor`. The list is
    configurable via `ScannerOptions.ignoredDirectories`.
  - Reports per-file metadata: absolute path, name, extension, size in bytes,
    and detected language (from extension/name).
  - Produces a `ProjectScan` with the nested file tree, file/folder totals,
    files grouped by extension, detected languages, and root markers
    (`package.json`, `tsconfig`, `README`, `.git`, framework signals).
  - `readFile` decodes a single file into a `SourceFile` (path + language +
    content) for downstream parsing.
- Output: `ProjectScan` — metadata only. No parsing, hashing, or persistence.

## Hashing Agent

- Package: `@atlas/hashing`
- Purpose: Manages SHA-256 hashing of file contents to detect what changed
  between runs.
- Operations:
  - `buildSnapshot` hashes every given path into a `HashSnapshot`.
  - `compareHashes(previous, current)` classifies every known path as
    `changed`, `added`, `deleted`, or `unchanged`.
  - `getChangedFiles` returns the paths that need re-processing (`changed` +
    `added`; `deleted` files cannot be re-processed and are excluded).
  - `saveSnapshot` / `loadSnapshot` persist snapshots as JSON so hashes can be
    reused across runs instead of re-reading every file.
- Storage: JSON snapshot files, e.g. a hash store in the project root.

## Manifest Agent

- Package: `@atlas/scanner` (`manifest.ts`)
- Purpose: Generates a per-project manifest describing the codebase.
- Operations:
  - Writes `<root>/.codeatlas/manifest.json` from a fresh `ProjectScan`.
  - Records schema version, project name, languages, framework, package
    manager (from lockfiles), git info (is-repo, branch, HEAD commit, origin),
    creation/update timestamps, and file/folder totals.
  - Merge policy: `createdAt` preserved, `updatedAt` refreshed, the rest
    recomputed from the latest scan.
- Output: `<root>/.codeatlas/manifest.json`.

## Parser Agent

- Package: `@atlas/parser`
- Purpose: Parses source code into a **language-agnostic intermediate
  representation** — normalized `Symbol`s — so the rest of the pipeline never
  needs to know the source language.
- Operations:
  - Extracts classes, interfaces, functions, methods, variables, imports,
    exports, enums, and type aliases.
  - Emits one `ParsedFile` per file. Each `Symbol` carries a normalized kind,
    1-based location, parent symbol id, visibility, modifiers, module
    specifier (for imports/exports), and type text.
  - Parses **only the files it is given**: unchanged files are never re-parsed
    (callers pass hashing's `changed`/`added` paths).
  - `resolveSymbol(id)` looks up symbols parsed earlier in the same session.
- Architecture: TypeScript first (via `ts-morph`); more languages via
  `LanguageParser` + `ParserRegistry`.
- Known gaps: namespaces and bare expressions are not extracted. Renamed
  imports (`import { a as b }`) and `export default <expr>` resolve cross-file.

## Graph Agent

- Package: `@atlas/graph`
- Purpose: Builds the project dependency graph and answers dependency and
  cycle queries.
- Operations:
  - `build(symbols, references)` builds a directed graph from the parser's
    normalized `Symbol`s and resolved `Reference`s.
  - Tracks imports, exports, calls, inheritance (`extends`), interface
    implementations (`implements`), and structural containment (`contains`).
  - `getDependencies(nodeId)` / `getDependents(nodeId)` / `neighbors`.
  - `shortestPath(from, to)` via BFS.
  - `detectCircularDependencies()` via Tarjan (one representative cycle per SCC).
  - `exportJson()` serializes nodes + edges.
- Output: in-memory directed graph; no persistence.

## Provider Agent

- Package: `@atlas/providers`
- Purpose: Unified adapter over AI model APIs so providers can be swapped.
- Operations:
  - `complete(request)` routes a completion to the adapter named by
    `request.provider` (default `"claude"`), returning content, model, and
    token usage.
  - Adapters: **Claude** (Anthropic Messages), **OpenAI** and **DeepSeek**
    (OpenAI-compatible chat completions), **Gemini** (`generateContent`).
    Injectable `HttpTransport` (default `fetch`) for offline testing.
  - `json: true` sets each provider's structured-JSON knob for parsing.
  - `register(adapter)` adds providers at runtime.
- Input: `ProviderRequest`. Output: `ProviderResponse` (content + model + usage).

## Cache Agent

- Package: `@atlas/cache`
- Purpose: Generic caching to avoid repeated expensive work.
- Operations: `get` / `set` / `delete` over an in-memory store with per-entry
  TTL; optional JSON file persistence.
- Output: cached values (e.g. summaries) keyed by a `CacheKey`.

## AI Summary Agent

- Package: `@atlas/summary`
- Purpose: Generates and caches structured summaries of code.
- Operations: `summarizeFile` / `summarizeFolder` / `summarizeModule` /
  `summarizeProject`; content-hash caching (only **changed** files reach the
  model; `metadata.cacheHit` for cache returns); custom `{prompt}` templates;
  token usage recorded.
- Input: `ProviderPort` + `CachePort` + `HashPort` (composed by the SDK).
  Output: structured `Summary` objects.

## Storage Agent

- Package: `@atlas/storage`
- Purpose: The SQLite **Context Database** behind `ContextDatabasePort`.
- Operations: `saveContext` / `updateContext` / `loadContext` / `deleteContext`
  / `searchContext` over 8 tables with repositories; migrations + versioning;
  transactions; `StorageService` keeps the legacy `StoragePort`.
- Input: parsed symbols, references, summaries. Output: a versioned SQLite
  database — no AI logic in this package.

---

## AI CLI Connection Layer

- Package: `@atlas/agents` (behind `AgentPort` in `core`)
- Purpose: Detects and runs external AI coding CLIs (Claude / Gemini / Codex /
  OpenCode) — the narrow spawn/detect boundary the orchestrator builds on.
- Operations: per-CLI `AgentAdapter`s (binary, run-mode flags, env),
  `findExecutable` on PATH, `detectAgent`/`detectAll` (availability + version),
  `run` a non-interactive child process (array args, timeout, partial-output
  honesty).
- Status: **[IMPLEMENTED]** — composed through the SDK for sessions
  (`createSessionManager`) and multi-agent orchestration (`createOrchestrator`).
  Interactive launches (`stdio: "inherit"`, no run-mode flags) are supported via
  `SessionLaunchRequest.interactive`. The **catalog ships the four npm
  installable CLIs** in `packages/toolkit/src/catalog.json` (`claude`
  `@anthropic-ai/claude-code`, `gemini` `@google/gemini-cli`, `codex`
  `@openai/codex`, `opencode` `opencode-ai`) so a missing agent can be installed
  through the Toolkit's approval-gated npm channel (`atlas tools`, or the v2 TUI).
  A connection layer, not an analysis agent of the context pipeline.
- See [AGENT_ORCHESTRATOR.md](./AGENT_ORCHESTRATOR.md) for the planned router on
  top of it.

> **Direction B (Unified AI CLI) is partial.** The `@atlas/agents` connection
> layer, the session manager, and the plan-executing orchestrator
> (`createOrchestrator` in `@atlas/sdk`) are implemented; the **interactive TUI**
> (`atlas tui`) slash surface (`/claude`–`/opencode` detect → launch
> interactively → install; `/cursor` `/grok` guidance; `/agents`) is
> **v2 / not shipped** (untracked); the **standalone router** (`atlas /claude`
> …) remains **[PLANNED]** — see [AGENT_ORCHESTRATOR.md](./AGENT_ORCHESTRATOR.md). The
> **Agent Toolkit** (Direction C — curated tool registry/install/config/
> security) is implemented behind `@atlas/toolkit` with a shipped catalog —
> see [AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md).