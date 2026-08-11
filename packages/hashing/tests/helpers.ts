import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface TempDir {
  readonly dir: string;
  readonly cleanup: () => void;
}

/** Create a temporary directory for test fixtures. */
export function createTempDir(): TempDir {
  const dir = mkdtempSync(join(tmpdir(), "codeatlas-hash-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Write a file (creating parent directories) inside the temp dir. */
export function writeFile(root: string, relativePath: string, content: string): string {
  const fullPath = join(root, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
  return fullPath;
}
