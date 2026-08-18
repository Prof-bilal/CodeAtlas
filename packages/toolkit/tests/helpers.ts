import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { TOOL_MANIFEST_SCHEMA_VERSION } from "../src/manifest-schema";
import { REGISTRY_SCHEMA_VERSION } from "../src/schema";

/** A valid minimal record used across the registry tests. */
export function validRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "test-tool",
    description: "A tool for exercising the registry schema.",
    license: "MIT",
    version: "1.0.0",
    categories: ["Developer Productivity"],
    ...overrides,
  };
}

/** A minimal catalog/overlay payload at the current schema version. */
export function validCatalog(tools: readonly unknown[]): Record<string, unknown> {
  return { schemaVersion: REGISTRY_SCHEMA_VERSION, tools };
}

/** A valid minimal raw manifest used across the manifest tests. */
export function validToolManifestInput(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: TOOL_MANIFEST_SCHEMA_VERSION,
    name: "fixture-tool",
    description: "A fixture tool for exercising the manifest schema.",
    toolVersion: "1.2.3",
    license: "MIT",
    categories: ["Developer Productivity"],
    installation: { type: "npm", package: "fixture-tool" },
    installedAt: "2026-08-11T10:00:00.000Z",
    updatedAt: "2026-08-11T10:00:00.000Z",
    ...overrides,
  };
}

/** A temporary directory with a cleanup method. */
export interface TempDir {
  readonly root: string;
  readonly cleanup: () => void;
}

/** Create a temporary directory (e.g. a throwaway project root). */
export function createTempDir(prefix = "codeatlas-toolkit-"): TempDir {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Write a file inside a {@link TempDir}, creating parents as needed. */
export function writeTempFile(root: string, relativePath: string, content: string): void {
  const fullPath = join(root, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
}
