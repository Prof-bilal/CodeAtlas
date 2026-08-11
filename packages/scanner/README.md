# @atlas/scanner

Recursively scan a project directory and collect structured metadata.

Implements `ScannerPort` from `@atlas/core`. This package is **metadata only** —
it does not parse source code, invoke AI, or touch a database.

## Features

- Recursive directory walk with a built-in **file tree**.
- **Ignore rules** — skips `node_modules`, `.git`, `dist`, `build`, `.next`,
  `coverage`, and `vendor` (case-insensitive, configurable).
- **Detection** of:
  - files and folders (with counts),
  - extensions (grouped by type),
  - programming languages (by extension),
  - framework (from `package.json` dependencies / lockfile markers, if possible),
  - `package.json`, `tsconfig.json`, `README.md`, and git repository markers.
- **Structured output** only (a `ProjectScan` object) — no side effects.

## Usage

```ts
import { scanProject } from "@atlas/scanner";

const result = await scanProject("/path/to/project" as FilePath);
if (result.ok) {
  console.log(result.value.framework); // e.g. "next.js"
  console.log(result.value.totalFiles);
}
```

## Public API

- `scanProject(rootPath)` — convenience wrapper returning a `ProjectScan`.
- `ScannerService` — the `ScannerPort` implementation (with options):
  - `scanProject(rootPath)` — scan a directory into structured metadata.
  - `readFile(path)` — read a file into a `SourceFile` with a detected language.
- `createIgnoreMatcher(names)` / `DEFAULT_IGNORED_DIRECTORIES` — ignore rules.
- `detectLanguageByName(fileName)` / `extensionOf(fileName)` — language detection.
- `detectFramework(signals)` — framework detection.

## Project Manifest

After scanning, you can generate a versioned project manifest with
`generateManifest(scan, { rootPath })`, which writes `.codeatlas/manifest.json`:

- project name, languages, framework
- package manager (from lockfiles: `pnpm`/`yarn`/`npm`/`bun`/`deno`)
- git info (branch, commit, origin remote)
- `createdAt` / `updatedAt` dates and scanner version
- total files and folders

A `manifestVersion` schema field is included to support future migrations.
Existing values are preserved where possible — notably `createdAt` is only set
on first creation and never reset on later updates.

```ts
import { scanProject, generateManifest } from "@atlas/scanner";

const result = await scanProject("/path/to/project");
if (result.ok) {
  await generateManifest(result.value, { rootPath: "/path/to/project" });
}
```

Public manifest API: `generateManifest`, `loadManifest`, `detectPackageManager`,
`collectGitInfo`, and the `ProjectManifest` / `GitInfo` types.

