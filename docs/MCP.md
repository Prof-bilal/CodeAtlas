# CodeAtlas MCP Server

Exposes a project's CodeAtlas context to AI coding tools over the **Model
Context Protocol** (MCP) over stdio. It is the interface between the Context
Engine (`@atlas/sdk`) and external agents — Claude Desktop, Cursor, VS Code,
and any MCP-capable client.

- Package: `@atlas/mcp` (`packages/mcp`)
- Protocol: MCP over stdio (JSON-RPC 2.0), via the official
  `@modelcontextprotocol/sdk`
- Status: **[IMPLEMENTED]** (2026-08-09) — twelve tools

## Principles

- **Consumes the Context SDK.** Every tool reads through
  `createContextSDK` sub-APIs (`symbols.searchSymbols`, `files.searchFiles`,
  `dependencies.query`, `modules.explain`, `summaries.*`, `project.overview`,
  `files.readRange`)
  — never the database directly. See [CONTEXT_SDK.md](./CONTEXT_SDK.md).
- **Provider-independent.** The server never hardcodes an AI provider. Search,
  dependencies, module explanation, and overview are deterministic reads of the
  persisted index. AI summary *generation* is opt-in per call and goes through
  the SDK's summary port — and fails cleanly when none is configured.
- **Local-first.** Everything reads `.codeatlas/context.db`; nothing is
  uploaded.
- **Logs go to stderr.** stdout is reserved for the MCP protocol.

## Configuration & running

The `codeatlas-mcp` binary (or `startStdioServer`) serves the context index
resolved from, in order of precedence:

1. An explicit database path (`ATLAS_DB` env var, or the `dbPath` option).
2. `<ATLAS_ROOT>/.codeatlas/context.db` (or the `root` option).
3. `<cwd>/.codeatlas/context.db`.

The server starts even when no index exists yet; tools return a clear
`No context index found at <path>` error until the index is built. Because the
container is opened lazily, a server that starts *before* the index is built
picks it up the moment `context.db` appears.

```bash
codeatlas-mcp                     # serves ./<cwd>/.codeatlas/context.db
ATLAS_ROOT=/path/to/project codeatlas-mcp
ATLAS_DB=/path/to/context.db codeatlas-mcp
```

Client configuration example (Claude Desktop / generic MCP clients):

```json
{
  "mcpServers": {
    "codeatlas": {
      "command": "codeatlas-mcp",
      "env": { "ATLAS_ROOT": "/path/to/your/project" }
    }
  }
}
```

Logging: set `ATLAS_MCP_LOG_LEVEL` to `debug` (or `info`/`warn`/`error`).

## Error handling

Every tool call returns one of:

- A **normal result** — a JSON object as `structuredContent` (and as a
  pretty-printed JSON text block). Not an error even when the answer is
  "nothing stored" (e.g. `get_summary` returns `found: false`).
- An **error result** (`isError: true`) carrying only text content — **no
  `structuredContent`** — for domain failures: missing index, generation
  without a provider, a module path with nothing under it, an unreadable index,
  a path outside the index, etc. (`structuredContent` is deliberately omitted
  on errors so clients that validate it against the tool's `outputSchema` do
  not reject the error itself; the human-readable message is in the text
  block.)
- A protocol-level **`-32602` invalid params** error for arguments that fail
  the tool's declared input schema (e.g. a missing `query`).

---

## Tool reference

All tools are deterministic reads of the persisted index unless noted. Search
tools use typo-tolerant fuzzy matching by default. The server exposes **twelve**
legacy tools plus four **canonical aliases** (Phase 4 compat window):
`find_relevant_context` ↔ `context_for`, `get_dependencies` ↔
`dependencies_of`, `project_overview` ↔ `overview`, `read_file_range` ↔
`read_range`. Both names work and return identical results; the canonical
names are the recommended spelling for new integrations. Relevance scores are
normalized to **0..1** on every result (the lexical scorer's raw 0..100 value
is dual-emitted as `rawScore` during deprecation), and each hit carries a
`confidence` band (`high`/`medium`/`low`).

### `find_relevant_context`

The flagship read: assemble the minimum sufficient context package for a task
(see `docs/CONTEXT.md`). Ranks and assembles files, symbols, summaries, and
dependency evidence from the index deterministically — no AI.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `task` | string | ✅ | The task or question to ground. |
| `maxItems` | integer 1–50 | – | Max items in the package (default 20). |
| `maxTokens` | integer | – | Token budget for the package (default 12000). |
| `contextMode` | enum | – | `auto`, `digest`, `full`, `off`, or `auto-escalate` (default `auto`). |

Returns:

```jsonc
{
  "task": "Where is authentication implemented?",
  "items": [
    {
      "id": "s1",
      "kind": "symbol",
      "title": "AuthService",
      "path": "/src/auth-service.ts",
      "score": 1.0,
      "rawScore": 100,
      "confidence": "high",
      "source": "explicit",
      "reason": "exact-symbol match",
      "tokens": 320
    }
  ],
  "synthesis": "Authentication lives in …", // only when a digest was assembled
  "sufficient": true,
  "nextSteps": []
}
```

### `inspect_symbol`

Inspect one symbol: its definition plus caller/callee edges and nearby test
files (best caller/callee answer today). `callers`/`callees` are capped at 25
each (`callerOverflow`/`calleeOverflow` when truncated) with a `confidence`
band.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `symbol` | string | ✅ | Symbol name to look up. |

Returns the symbol definition, `callers`, `callees`, and `testFiles` arrays.

### Migration

See `docs/MCP_MIGRATION.md` for canonical alias names, the `depth` parameter,
deprecated tools (`analyze_task`, `create_plan`, `verify_answer`,
`explain_module`), and the Phase 6 removal schedule.

### `search_symbols`

Ranked search over indexed symbols (functions, classes, interfaces, methods,
constants, …).

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `query` | string | ✅ | Symbol name or fragment to search for. |
| `limit` | integer 1–100 | – | Max hits (default 20). |
| `kind` | enum | – | Restrict to a symbol kind: `class`, `interface`, `function`, `method`, `constructor`, `property`, `variable`, `constant`, `import`, `export`, `enum`, `enum-member`, `type-alias`. |
| `minScore` | number ≥ 0 | – | Drop hits below this relevance score (default 0). Use 0..1; values >1 are treated as the legacy 0..100 scale. |

Returns:

```jsonc
{
  "hits": [
    {
      "name": "double",
      "path": "/src/math.ts",
      "targetId": "symbol:s1",
      "symbolKind": "function",
      "documentation": "Doubles a number.",   // or null
      "score": 1.0,
      "rawScore": 100,
      "confidence": "high"
    }
  ],
  "total": 1
}
```

### `search_files`

Ranked search over indexed files by **path or content**.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `query` | string | ✅ | File path fragment or content text. |
| `limit` | integer 1–100 | – | Max hits (default 20). |
| `minScore` | number ≥ 0 | – | Drop hits below this relevance score (default 0). Use 0..1; values >1 are treated as the legacy 0..100 scale. |

Returns:

```jsonc
{
  "hits": [{ "path": "/src/auth.ts", "language": "typescript", "score": 0.8, "rawScore": 80, "confidence": "medium" }],
  "total": 1
}
```

### `analyze_task`

Classify a task into a plan category (`locate` / `repair` / `refactor` /
`dependency` / …) with supporting evidence. Deterministic keyword
classification — exposed for debugging; most agents should use
`find_relevant_context` instead.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `task` | string | ✅ | The task to classify. |

### `create_plan`

Draft a step plan for a task from the classifier's category and the planner's
impact set. Template-based (max 8 steps); retained for tool-loop use.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `task` | string | ✅ | The task to plan for. |

### `verify_answer`

Check whether the assembled context actually answers the task. Harness-layer
helper retained for backward compatibility.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `task` | string | ✅ | The task that was answered. |
| `answer` | string | ✅ | The proposed answer to verify. |

### `get_summary`

Read a stored summary for a file, folder, module, or the whole project. This
is deterministic and requires no AI provider. When nothing is stored and
`generate: true`, a fresh AI summary is produced through the SDK's provider
(and fails cleanly when no provider is configured).

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `target` | string | ✅ | Path of the file/folder/module, or `"project"` for the project summary. |
| `kind` | enum | – | Hint for the scope to match: `file`, `folder`, `module`, `project` (default: match any scope). |
| `generate` | boolean | – | Generate a fresh summary when none is stored (default false). |
| `force` | boolean | – | When generating, bypass the content-hash cache (default false). |

Returns (stored or generated):

```jsonc
{
  "found": true,
  "generated": false,              // or true when a fresh AI summary was made
  "summaries": [
    {
      "kind": "file",
      "target": "/src/math.ts",
      "overview": "Math utilities for the project.",
      "keyPoints": ["double", "MathUtils"],
      "metadata": {
        "generatedAt": "2026-08-08T00:00:00.000Z",
        "provider": "claude",
        "model": "claude-sonnet-5",
        "cacheHit": true,
        "durationMs": 0,
        "totalTokens": 0
      }
    }
  ]
}
```

When nothing is stored and `generate` is false, returns `found: false` with a
helpful `message` (not an error). The project summary is matched by kind, so
`target: "project"` always finds it.

### `get_dependencies`

Persisted dependency edges from the CodeAtlas graph (imports, calls, extends,
implements, references, …).

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `node` | string | – | File path, symbol id, symbol name, or full graph node id to filter edges by. |
| `relation` | string | – | Only return edges of this kind (e.g. `imports`, `calls`, `extends`). |
| `direction` | enum | – | `outgoing` (what the node depends on), `incoming` (what depends on it), or `both` (default). |
| `limit` | integer 1–1000 | – | Max edges (default 25). |
| `depth` | integer 1–3 | – | Bounded BFS depth (default 1 = direct edges). 2..3 expands multi-hop with `hop` + `path` per edge; ignored without `node`. |

Returns:

```jsonc
{
  "node": "/src/auth.ts",           // null when not filtered
  "nodeFound": true,
  "depth": 2,                       // effective traversal depth
  "count": 2,
  "total": 9,                       // edges before filtering
  "dependencies": [
    {
      "from": "n:file:/src/auth.ts",
      "to": "n:file:/src/math.ts",
      "relation": "imports",
      "fromLabel": "/src/auth.ts",
      "toLabel": "/src/math.ts",
      "hop": 1,
      "path": ["n:file:/src/auth.ts", "n:file:/src/math.ts"]
    }
  ]
}
```

`node` is resolved to graph node ids from files, symbols (by id or name), or a
raw `n:`-prefixed id. When `node` matches nothing, `nodeFound: false` and an
empty edge list are returned.

### `explain_module` (DEPRECATED — see `docs/MCP_MIGRATION.md`)

DEPRECATED at the Phase 6 cut; use `overview` + `search_files` +
`dependencies_of` instead. Caps tightened 200/200 → 50/50 with
`fileOverflow`/`symbolOverflow`. Explains a module (a folder or package): its
persisted module record, the files it contains, the symbols defined there, and
the dependency edges touching its files.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | ✅ | Path of the module/folder to explain. |
| `includeSummary` | boolean | – | Include the stored module summary when present (default true). |
| `includeDependencies` | boolean | – | Include dependency edges touching the module's files (default true). |

Returns:

```jsonc
{
  "path": "/src",
  "module": { "path": "/src", "name": "src", "moduleType": "folder" },  // or null
  "fileCount": 2,
  "files": [{ "path": "/src/math.ts", "language": "typescript" }],
  "symbolCount": 3,
  "symbols": [
    {
      "id": "s1",
      "name": "double",
      "kind": "function",
      "filePath": "/src/math.ts",
      "location": { "startLine": 1, "endLine": 1 }
    }
  ],
  "dependencyCount": 2,
  "dependencies": [ /* same shape as get_dependencies */ ],
  "summary": { /* same shape as get_summary summaries[0] */ }  // or null
}
```

### `read_file_range`

Version-aware read of a line range from a file. The content is read from the
**working tree** and compared against the persisted version, so an agent never
acts on stale context. Returns the **current** on-disk text (or the indexed
content as a fallback when the file is not on disk), plus freshness metadata.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | ✅ | Absolute path, or a path relative to the project root. |
| `startLine` | integer ≥ 1 | ✅ | First line of the requested range (1-based). |
| `endLine` | integer ≥ `startLine` | ✅ | Last line of the requested range (inclusive). |
| `padding` | integer ≥ 0 | – | Lines to include around the range (default 5; `0` disables). |
| `expectedHash` | string | – | SHA-256 the caller believes the file should have; a mismatch sets `versionMatch: false`. |

Returns:

```jsonc
{
  "path": "/src/auth.ts",
  "startLine": 1,
  "endLine": 7,
  "content": "import { double } from './math';\n...",
  "hash": "a1b2c3…",
  "versionMatch": true,          // false when expectedHash was given but the file changed
  "stale": false,                // true when the file is not on disk or the hash drifted
  "padded": true,                // false when padding: 0
  "message": "File changed since this context was generated."  // only when versionMatch is false
}
```

### `project_overview`

High-level overview of the indexed project.

| Argument | Type | Required | Description |
| --- | --- | --- | --- |
| `includeSummary` | boolean | – | Include the stored project summary when present (default true). |
| `detail` | enum | – | `summary` (default) returns counts + overview; `full` also lists modules, files, and symbols. |

Returns:

```jsonc
{
  "savedAt": "2026-08-08T00:00:00.000Z",
  "schemaVersion": 1,
  "counts": { "files": 3, "symbols": 3, "modules": 1, "dependencies": 2, "summaries": 3 },
  "languages": { "typescript": 2, "markdown": 1 },
  "parsedFiles": 2,             // files with at least one parsed symbol
  "contentOnlyFiles": 1,        // scanner-visible files with no symbol rows
  "unresolvedImports": 0,       // import specifiers that failed to resolve
  "summary": { /* project summary, or null */ },
  // only with detail: "full":
  "modules": [{ "path": "/src", "name": "src", "moduleType": "folder" }],
  "topFiles": [{ "path": "/src/math.ts", "language": "typescript" }],
  "topSymbols": [{ "id": "s1", "name": "double", "kind": "function", "filePath": "/src/math.ts" }]
}
```

Every object result also carries `freshness` (state/refreshed/checkedAt) and
`timings` (`probeMs`/`searchMs`/`assemblyMs`/`responseBytes`) metadata.

---

## Programmatic API

```ts
import { createMcpServer, startStdioServer } from "@atlas/mcp";

const mcp = createMcpServer({ root: "/path/to/project" }); // or { dbPath }
await mcp.connect(someTransport);
await mcp.close(); // releases the context database handle
```

See `packages/mcp/README.md` and `packages/mcp/src/index.ts` for the full public
surface.
