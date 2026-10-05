# CodeAtlas ChatGPT / Codex Plugin

Exposes CodeAtlas repository intelligence to ChatGPT and Codex as a focused MCP
plugin.

- Package: `@prof-bilal/atlas-chatgpt-plugin` (`apps/chatgpt-plugin`)
- Protocol: MCP over **stdio** (Codex, local clients) and **Streamable HTTP**
  (ChatGPT connectors), via the official `@modelcontextprotocol/sdk`
- Status: **[IMPLEMENTED]** (2026-10-03) — five tools + MCP Apps widgets

## Design: a thin adapter, not a second engine

The plugin **does not reimplement** any CodeAtlas capability. It reuses
`@prof-bilal/atlas-mcp`:

- the tool **handlers** (`HANDLERS`) — `project_overview`, `search_symbols`,
  `search_files`, `find_relevant_context`, `analyze_impact`, `inspect_symbol`,
  `read_file_range`;
- the **result discipline** (`runTool`): per-session call budget → index
  freshness probe/refresh → handler → `freshness` + `timings` enrichment, and
  `isError` results with no `structuredContent`;
- argument **validation**, the **secret deny-filter** (`isDeniedPath`), the
  stderr **logger**, the lazy **`CodeAtlasContext`**, and the prebuilt **Skills**
  surface.

Those handlers read only through `createContextSDK` — the database, parser,
graph, and search packages are never touched. The adapter's job is purely
presentation: map existing outputs onto five user-goal tools, normalize graph
node ids to file paths, and bind results to widgets.

To make this reuse possible, `packages/mcp/src/index.ts` additionally exports
`runTool`, `HANDLERS`, `executeHandler`, the validation helpers/errors, and the
shared `freshnessField`/`timingsField`/`summaryShape` zod fragments. This is an
additive programmatic API for embedders; the eleven-tool stdio server is
unchanged.

## Tools

| Tool | User intent | Delegates to |
| --- | --- | --- |
| `analyze_repository` | analyze / overview my repository | `project_overview` (+ SDK module list, scan, digest) |
| `search_repository` | find where a feature is implemented | `search_symbols` + `search_files` |
| `explain_repository` | how does X work / how do modules relate | `find_relevant_context` + `dependencies.query` |
| `impact_analysis` | what files are affected by a change | `analyze_impact` + `dependencies.getDependents` |
| `get_context` | show me the code for X | `inspect_symbol` + `read_file_range` |

Every tool returns `structuredContent` and a JSON text block, carries
`freshness` and `timings`, and declares an `outputSchema` validated by the test
suite. Descriptions state when to use each tool and when **not** to, so an
assistant routes accurately.

`impact_analysis` normalizes graph node ids (`n:file:…`, `n:<symbolId>`) to
readable file paths, and collapses symbol-level hits to their containing file.

**Query handling.** CodeAtlas search is deterministic and *lexical* (no
embeddings). To make natural-language questions work, the adapter keeps the
engine unchanged but adds two presentation-layer behaviors:

- `search_repository` / `explain_repository`, when a query matches nothing
  directly, expand it with the SDK's existing entity extractor
  (`extractTaskEntities`) plus short prefixes of long keywords — so
  "where is authentication implemented" can match an `auth` module. The expanded
  terms are returned as `expandedTerms` and each hit's `reason` names the term it
  matched, so the result stays honest.
- `impact_analysis` accepts repo-relative paths (what a user sees) and resolves
  them to the indexed absolute paths the graph is keyed by.

## UI (MCP Apps)

Five widgets are registered as `resources` (`ui://codeatlas/…`,
`text/html;profile=mcp-app`) and bound to tools through
`_meta.ui.resourceUri` (with the ChatGPT-specific `openai/outputTemplate` key for
compatibility):

| Widget | Tool |
| --- | --- |
| `repository-summary.html` | `analyze_repository` |
| `search-results.html` | `search_repository` |
| `explanation.html` | `explain_repository` |
| `impact-analysis.html` | `impact_analysis` |
| `context-view.html` | `get_context` |

Widgets read the result from `window.openai.toolOutput` when the host provides
it, and degrade to a compact placeholder otherwise. **Tools never require UI.**

## Transports

- **stdio** (`startStdioServer`, default): for Codex CLI and other local MCP
  clients. `codeatlas-chatgpt-mcp --root <path>`.
- **Streamable HTTP** (`startHttpServer`, `--http`): for ChatGPT connectors.
  Endpoint `/mcp`, `GET /healthz`, JSON responses by default, one transport +
  one lazily-opened Context SDK per session.

## Security

- Binds `127.0.0.1` by default. A non-loopback bind **requires** a bearer token
  (`--token` / `ATLAS_CHATGPT_TOKEN`); startup warns loudly otherwise.
- Token comparison is length-checked and timing-safe.
- Read-only; the CodeAtlas deny-filter blocks `.env*`, keys, and secrets files
  on every read. No logs contain secrets.

## Local testing

```bash
# Unit + protocol + HTTP + the required prompt scenarios
pnpm --filter @prof-bilal/atlas-chatgpt-plugin test

# Manual: MCP Inspector over stdio
npx @modelcontextprotocol/inspector codeatlas-chatgpt-mcp --root /path/to/repo

# Manual: HTTP smoke test
codeatlas-chatgpt-mcp --http --port 8787 --root /path/to/repo
curl -s localhost:8787/healthz
```

The automated suite covers ten required scenarios: repository overview,
authentication architecture, feature/file search, dependency relationship,
impact analysis, unknown repository, empty result, malformed request,
unavailable index, and a denied/sensitive file access attempt.

## Packaging & submission

Static packaging lives in `apps/chatgpt-plugin/plugin/`:
`manifest.json`, `mcp.json`, `codex.toml.example`, `icons/*.svg`, `PRIVACY.md`.
The OpenAI directory/connector dashboard does **not** read these files
automatically — see "Manual OpenAI configuration" below.

## Manual OpenAI configuration

These steps cannot be automated from the repository:

1. **Host an HTTPS endpoint.** ChatGPT connectors require a reachable HTTPS URL.
   Deploy `codeatlas-chatgpt-mcp --http` behind TLS, or tunnel `localhost:8787`
   for development.
2. **Create the connector/app** in the OpenAI platform with the name,
   description, logo (export `plugin/icons/logo.svg` to a 512×512 PNG), and the
   `/mcp` URL. Optionally set the bearer token as an auth header.
3. **Submit** for review. The directory listing uses the platform's fields, not
   `manifest.json`; use the manifest as the source of the copy and tool list.
4. **Codex CLI** requires no dashboard step: add the `~/.codex/config.toml`
   entry (or run `atlas agents connect`).

## Known limitations

- Serves a **local** CodeAtlas index; no cloud backend exists in this release.
- Parser coverage is TypeScript/JavaScript plus Python, Go, Java, C#, and Rust
  (tree-sitter); other languages are content-only.
- Widgets need an Apps-SDK-capable host; without one, output is text/structured
  only.
- `analyze_repository` reports dependency cycles only when the deterministic
  digest recorded them; the read SDK does not expose a cycle count directly.
