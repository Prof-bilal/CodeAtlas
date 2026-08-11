import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A temporary test project with a cleanup method. */
export interface TestProject {
  readonly root: string;
  readonly cleanup: () => void;
}

/**
 * Create a temporary directory tree from a flat map of
 * `relativePath -> file content`.
 */
export function createTestProject(files: Readonly<Record<string, string>>): TestProject {
  const root = mkdtempSync(join(tmpdir(), "codeatlas-scan-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content, "utf8");
  }
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
