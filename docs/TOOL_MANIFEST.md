# Tool Manifest

> **Status: [IMPLEMENTED]** (Task 20). The second piece of the Agent Toolkit
> (Direction C). It defines the **versioned, validated, extensible** record of
> **one installed tool** on the user's machine — the per-installed-tool state
> that the Compatibility (21), Installer (22), Configurator (23), and
> Security/Trust (24) tasks read and write. The **Tool Registry** (Task 19) is
> the catalog of *what exists*; see [TOOL_REGISTRY.md](./TOOL_REGISTRY.md).
> Design contract: [AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md) §4–§9.

---

## 1. What this is

A **Tool Manifest** is the state record for **one installed tool** on the
user's machine, distinct from the Registry entry (the *catalog* record). The
flow:

```
Registry Entry  (Task 19 — the catalog record)
      ↓  refines into
Tool Manifest   (this task — one installed tool's state)
      ↓  read/written by
Compatibility (21) · Installer (22) · Configurator (23) · Security/Trust (24)
```

The manifest records:

- which tool + version is installed,
- **where** it was installed from (registry entry, npm package, release asset),
- the **install method** and provenance (recorded command, source, timestamps),
- the **verification result** (checksum / signature status),
- the **applied configuration** and which agents it was configured for,
- the **trust + security status** that applied at install time,
- a `doctor`-able **integration state** (expected vs. actual location),
- comments on unknown-but-well-formed fields, which are **preserved** so
  forward-compatible tools never lose data.

It lives in `@atlas/toolkit` and mirrors the codebase's existing **Scanner
manifest pattern** (`@atlas/scanner` `manifest.ts`): state sits **next to the
project state in `.codeatlas/`**, so a future `atlas tools doctor` can
reconcile what is expected vs. what is actually present.

## 2. Architecture

```
Tool Manifest (@atlas/toolkit)
    ├── manifest-schema.ts   — versioned schema + validate / serialize / parse
    ├── manifest.ts          — createToolManifest + .codeatlas/tools/ store
    └── errors.ts            — ManifestError + typed errors
```

- `validateToolManifest` — schema validation (**`Result`**-shaped, listing
  every problem). A malformed manifest is never silently repaired.
- `parseToolManifest` — parse + validate a JSON string; the manifest is
  **untrusted input** (see §6).
- `serializeToolManifest` — pretty-printed JSON (2-space indent, trailing
  newline), re-emitting preserved unknown fields as top-level keys.
- `createToolManifest` — build a fresh manifest for a new install, filling
  honest defaults (`unverified` security/trust/verification, `unknown`
  integration state, `manual` provenance) and stamping `installedAt`/`updatedAt`.
- `saveToolManifest` / `loadToolManifest` / `listInstalledTools` — the
  `.codeatlas/tools/` store.

### Dependency rules

Same as the Registry: `@atlas/toolkit` imports **only** `@atlas/core` +
`@atlas/shared`. The manifest is a data/state layer that later Toolkit tasks
(21–24) consume *within* `@atlas/toolkit`; there is **no SDK surface yet** — it
is wired when a consumer (Install, Configure, `atlas tools`) needs it.

## 3. Schema (`TOOL_MANIFEST_SCHEMA_VERSION = 1`)

The final schema derives from the requirements (install ecosystems,
installed-state, doctor-ability, security) rather than the design sketch. All
timestamps are full ISO-8601 (`new Date().toISOString()`); optional JSON fields
are `null`, never `undefined`.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `schemaVersion` | `number` | Manifest schema version — must match, else `ManifestSchemaVersionError`. |
| `name` | `string` | Tool id, unique per install; must be a **safe file name** to reach disk (§4). |
| `description` | `string` | |
| `toolVersion` | `string` | The installed tool version. |
| `repository` | `string \| null` | http(s) URL. |
| `license` | `string` | |
| `categories` | `string[]` | **Extensible** — any non-empty strings; defaults to `[]`. |
| `supportedAgents` | `string[]` | Agents the tool is configured for (`claude`, `gemini`, …). |
| `documentation` | `string \| null` | http(s) URL. |
| `compatibility` | `object` | **Declared** requirements — **evaluated by Task 21**: `os`, `runtimes: {name, versionRange}[]`, `agents`, `mcp: boolean`, `architecture`, `permissions`, `note`. |
| `installation` | `object` | **Declared** how-to — **executed by Task 22** (see §5): `type`, `package`, `source`, `checksum`, `versionRange`, `note`. |
| `configuration` | `object` | Declared + applied config — **Task 23**: `type` (`automatic`/`manual`/`none`), `applied[]`, `agents[]`, `note`. |
| `security` | `object` | **Snapshot evaluated by Task 24**: `status` (`verified`/`reviewed`/`community`/`unverified`/`blocked`), `trust` (`official`/`reviewed`/`community`/`unverified`/`blocked`), `lastReview`, `note`. |
| `provenance` | `object` | Install audit trail: `source` (`registry`/`npm`/`pip`/`cargo`/`go`/`binary`/`github-release`/`mcp`/`manual`), `sourceRef`, `method`, `command` (**argv array, never a shell string**), `recordedAt`. |
| `verification` | `object` | Verification result: `status` (`verified`/`unverified`/`failed`), `checksum`, `note`. |
| `integrationState` | `object` | Doctor-able state: `status` (`expected`/`installed`/`missing`/`broken`/`unknown`), `expectedPath`, `foundPath`, `checkedAt`, `note`. |
| `installedAt` | `string` | Preserved across saves (Scanner merge policy). |
| `updatedAt` | `string` | Refreshed on every save. |
| *(unknown fields)* | — | Preserved verbatim in the internal `extra` bucket, re-emitted as top-level keys — never rejected, never evaluated. |

**Honest defaults** (a manifest never claims more than it recorded): `security`
status + trust default to `unverified`, `verification` to `unverified`,
`integrationState` to `unknown`, `configuration` to `none`, `provenance` to
`manual` with the installation method, and `compatibility` to empty.

## 4. On-disk layout (Scanner manifest pattern)

```text
.codeatlas/
├── manifest.json     # repo manifest (@atlas/scanner)          [IMPLEMENTED]
└── tools/
    ├── biome.json    # one Tool Manifest per installed tool     [IMPLEMENTED]
    └── <name>.json
```

- Directory: `<root>/.codeatlas/tools/` (constants `MANIFEST_DIR_NAME` +
  `TOOL_MANIFESTS_DIR_NAME`), gitignored like the rest of `.codeatlas/`.
- File name is the tool's safe-name: `^[A-Za-z0-9][A-Za-z0-9._-]*$` — names
  with separators or `..` are **rejected** (`ManifestValidationError`) so
  untrusted tool names can never escape the `tools/` directory.
- Merge policy (mirrors the Scanner manifest): `installedAt` is preserved from the
  on-disk file, `updatedAt` is refreshed, everything else is written exactly as
  given. `saveToolManifest` **validates before any write**.
- `listInstalledTools(root)` returns the installed names from the directory;
  `loadToolManifest(path)` is file-based (returns `ok(null)` for a missing
  file).

## 5. Installation ecosystems — declared, never executed

The `installation` object describes `npm`, `pip`, `cargo`, `go`, `binary`,
`github-release`, and `mcp` installs *declaratively* (`type`, `package`,
`source`, `checksum`, `versionRange`) **without executing anything**. The
Installer (Task 22) interprets it; the manifest itself never spawns a process,
never fetches a URL, and never runs install scripts.

Provenance `command` is a recorded **argument array** (e.g.
`["npm", "install", "-g", "biome"]`) — never a shell string — so audit trails
stay safely replayable.

## 6. Security — the manifest is untrusted input

Per [SECURITY.md](./SECURITY.md) and the Task 24 threat list:

- **Validated on load and before any write.** A corrupted/hostile manifest
  fails with a typed error (`ManifestValidationError`,
  `ManifestSchemaVersionError`, `ManifestLoadError`) — never a crash, never
  silently repaired.
- **Never executed.** Nothing from a manifest is ever run, evaluated, or passed
  to a shell.
- **No prototype pollution.** Unknown-field copying goes through
  `Object.fromEntries`; a `__proto__` key is preserved as an inert own property
  and `Object.prototype` is never mutated (regression-tested).
- **Size-bounded.** Files above `MAX_TOOL_MANIFEST_BYTES` (1 MiB) are rejected
  without being read in full.
- **Path-safe names.** Unsafe tool names are refused before any filesystem
  access (§4).

## 7. Validation & errors

| Situation | Result |
| --------- | ------ |
| Valid manifest | `ok(manifest)` |
| Version mismatch | `ManifestSchemaVersionError` |
| Any malformed field | `ManifestValidationError` (every problem listed) |
| Corrupt/non-JSON file | `ManifestValidationError` ("not valid JSON") via `parseToolManifest` / `loadToolManifest` |
| Unreadable/oversized file | `ManifestLoadError` |
| Missing file | `ok(null)` (from `loadToolManifest`) |
| Unsafe tool name | `ManifestValidationError` (from `toolManifestPath` / `saveToolManifest`) |

## 8. Boundaries — what this task does NOT do

- **No installation** (Task 22), **no compatibility evaluation** (Task 21), and
  **no security evaluation** (Task 24) — only declares/records the fields those
  tasks evaluate.
- **No context database** access — installed-tool state is plain JSON in
  `.codeatlas/tools/`.
- **No SDK surface yet** — `createToolManifest`/`saveToolManifest`/
  `loadToolManifest`/`listInstalledTools` are exported from `@atlas/toolkit`
  and consumed by later Toolkit tasks; the SDK/CLI surface arrives with
  Task 25 (`atlas tools`).
- **No execution of anything in a manifest** (§6).