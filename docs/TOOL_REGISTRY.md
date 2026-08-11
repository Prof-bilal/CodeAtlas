# Tool Registry

> **Status: [IMPLEMENTED]** (Task 19 — registry foundation only). This is the
> first piece of the Agent Toolkit (Direction C). It builds the **authoritative
> catalog of what exists** — the data foundation for the Manifest, Compatibility,
> Installer, Configurator, and Security/Trust tasks that follow. See
> [AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md) for the full design contract.

---

## 1. What this is

The **Tool Registry** (`@atlas/toolkit`, behind `ToolRegistryPort` in `core`) is
the curated catalog of useful open-source developer / AI-agent tools. It is the
*"what is there"* layer — deliberately separate from:

- the **Tool Manifest** (Task 20 — one *installed* instance of a tool),
- the **Compatibility Engine** (Task 21),
- the **Installer** (Task 22),
- the **Security/Trust evaluator** (Task 24).

The install / compatibility / security **fields are declared and validated
here** but are **evaluated by later tasks**.

```
CodeAtlas
    ↓
Agent Toolkit (@atlas/toolkit)
    ↓
Tool Registry  (this task — "what is there")
```

## 2. Architecture

```
Registry (ToolRegistryService implements ToolRegistryPort)
    ↓  reads
Registry Store (curated catalog + local overlay, merged by name)
    ↓  validated by
Registry Schema (versioned, validated, extensible)
```

- **Registry** — `ToolRegistryService` implements `ToolRegistryPort`
  (`listTools`, `getTool`, `listCategories`, `recordSource`, `schemaVersion`).
- **Registry Store** — `RegistryStore` merges the shipped curated catalog with
  a local overlay by record name. **Overlay records win** over catalog records
  of the same name without mutating the shipped catalog.
- **Registry Schema** — versioned (`REGISTRY_SCHEMA_VERSION = 1`), validated
  eagerly, and **fail-loud**: a version mismatch, malformed record, or
  unreadable overlay throws (`RegistrySchemaVersionError`,
  `RegistryValidationError`, `RegistryLoadError`) — records are never silently
  skipped or repaired.

### Dependency rules

`@atlas/toolkit` imports **only** `@atlas/core` + `@atlas/shared`. Consumers
(CLI / MCP / editors) reach the registry **only** through `@atlas/sdk`
(`createToolRegistry`), never through the feature package or the data files.

## 3. Record schema

Every record covers (at least):

| Field | Type | Notes |
| ----- | ---- | ----- |
| `name` | `string` | Unique, stable id; the overlay merge key |
| `description` | `string` | |
| `repository` | `string \| null` | http(s) URL |
| `website` | `string \| null` | http(s) URL |
| `documentation` | `string \| null` | http(s) URL |
| `license` | `string` | |
| `version` | `string` | |
| `categories` | `string[]` | **Extensible** — never constrained to a fixed list |
| `supportedOs` | `string[]` | e.g. `win32`, `linux`, `darwin`; empty = not declared |
| `supportedAgents` | `string[]` | e.g. `claude`, `gemini`, `codex`, `opencode`; empty = not declared |
| `installMethods` | `InstallMethod[]` | `npm` \| `pip` \| `cargo` \| `go` \| `binary` \| `github-release` \| `mcp` — **declared now, executed by Task 22** |
| `dependencies` | `ToolDependency[]` | `{ name, version? }` |
| `security` | `ToolSecurityStatus` | `verified` \| `reviewed` \| `community` \| `unverified` \| `blocked` + `lastReview` — **declared now, evaluated by Task 24** |
| `trust` | `ToolTrustLevel` | `official` \| `reviewed` \| `community` \| `unverified` \| `blocked` — **declared now, evaluated by Task 24** |
| `maintainer` | `string \| null` | |
| `lastUpdate` | `string \| null` | ISO date — a **maintenance signal** |
| `stars` | `number \| null` | Weak popularity signal only — **never a trust basis** |
| `provenance` | `ToolProvenance` | Per-field origin (see below) |

**Defaults:** `supportedOs`/`supportedAgents`/`installMethods`/`dependencies`
default to `[]`; `security` defaults to `unverified` and `trust` to `unverified`
(CodeAtlas never claims an audit it has not performed); URLs/`maintainer`/
`lastUpdate`/`stars` default to `null`.

**Categories are extensible by design.** `DEFAULT_CATEGORIES` documents the
suggested starting set (Context, Token Optimization, MCP, Code Analysis,
Testing, AI Quality, Agent Tools, CLI Utilities, Developer Productivity) but
validation accepts **any** non-empty string category — nothing is hardcoded
around the initial list.

## 4. Provenance — never trust external metadata blindly

Every field carries a `FieldProvenance` (`{ source, note? }`) so the origin is
**auditable**. Sources:

- **`curated`** — written/promoted by CodeAtlas curation (the default for
  shipped catalog entries),
- **`external`** — pulled from an external source (GitHub, npm, PyPI, Cargo, MCP
  directories) and **not** independently verified — advisory input only,
- **`user`** — provided by the user via the local overlay (its default),
- **`unknown`** — origin not recorded.

In the shipped data file, provenance is a compact **per-field override map**;
fields not listed default to `curated`. After validation every record carries a
complete `ToolProvenance` for every field, including the record as a whole
(`provenance.record`). External metadata is **enriched, reconciled, and then
curated — it is never auto-approved.**

## 5. Catalog + local overlay

- **Shipped catalog:** `packages/toolkit/src/catalog.json` — a versioned
  (`schemaVersion`) data file bundled with the package. It is the curated,
  authoritative layer. Currently seeds the initial category set with a small
  set of well-known tools (biome, ripgrep, uv, semgrep, github-mcp-server).
- **Local overlay:** users add private/community tools via an overlay JSON file
  (same schema) without editing the shipped catalog. Overlay records are merged
  by name — **the user's record wins**, and the curated catalog is never
  mutated. Overlay records default to `user` provenance.

The registry is **not** stored in the context database.

## 6. SDK surface

```ts
import { createToolRegistry } from "@atlas/sdk";

const registry = createToolRegistry();                 // shipped catalog
const registry = createToolRegistry({ overlayPath });  // + local overlay
const registry = createToolRegistry({ overlayData });  // injected (tests)

registry.listTools();          // readonly ToolRegistryRecord[]
registry.getTool("biome");     // ToolRegistryRecord | undefined
registry.listCategories();     // extensible category set
registry.recordSource("x");    // "catalog" | "overlay" | undefined
registry.schemaVersion;        // 1
```

`createToolRegistry()` validates eagerly: a malformed overlay or version
mismatch **throws** (re-exported errors: `RegistryError`,
`RegistrySchemaVersionError`, `RegistryValidationError`, `RegistryLoadError`).

## 7. Boundaries — what this task does NOT do

- No **installation** (Task 22), **compatibility evaluation** (Task 21), or
  **security evaluation** (Task 24) — those fields are declared and validated
  only.
- No network access at runtime, no auto-approval of external metadata, no
  downloading or fetching.
- No `atlas tools` CLI / slash-command surface yet.
