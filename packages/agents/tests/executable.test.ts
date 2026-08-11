import { mkdtempSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { findExecutable } from "../src/executable";

const dirs: string[] = [];

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "atlas-agents-"));
  dirs.push(dir);
  return dir;
}

/**
 * Create a fake executable. On Windows, executables on PATH carry a `PATHEXT`
 * extension (`.EXE`/`.CMD`/…) so we create the file with one and search for the
 * bare name — mirroring how `findExecutable` resolves real CLIs.
 */
function makeBin(dir: string, name: string, mode = 0o755): string {
  const ext = process.platform === "win32" ? ".EXE" : "";
  const file = join(dir, `${name}${ext}`);
  writeFileSync(file, "#!/bin/sh\necho ok\n");
  if (process.platform !== "win32") {
    try {
      chmodSync(file, mode);
    } catch {
      // best effort
    }
  }
  return file;
}

/** The executable extension Windows expects (empty on POSIX). */
function extForPlatform(): string {
  return process.platform === "win32" ? ".EXE" : "";
}

afterEach(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  dirs.length = 0;
});

describe("findExecutable", () => {
  it("returns null for an unknown binary", () => {
    const pathEnv = makeDir();
    expect(findExecutable("definitely-not-a-cli", { pathEnv })).toBeNull();
  });

  it("resolves a binary present in PATH", () => {
    const dir = makeDir();
    const file = makeBin(dir, "faketool");
    const pathEnv = [dir].join(";");
    const resolved = findExecutable("faketool", { pathEnv });
    expect(resolved).toBe(file);
  });

  it("accepts an absolute path directly", () => {
    const dir = makeDir();
    const file = makeBin(dir, "abs-tool");
    expect(findExecutable(file, { pathEnv: "" })).toBe(file);
  });

  it("returns the first match across multiple PATH entries", () => {
    const first = makeDir();
    const second = makeDir();
    makeBin(first, "duptool");
    const secondFile = makeBin(second, "duptool");
    const pathEnv = [first, second].join(";");
    const resolved = findExecutable("duptool", { pathEnv });
    // Order matters: the earlier PATH entry wins.
    expect(resolved).toBe(join(first, `duptool${extForPlatform()}`));
    expect(secondFile).not.toBeNull();
  });

  it("skips empty PATH segments", () => {
    const dir = makeDir();
    const file = makeBin(dir, "emptytool");
    const pathEnv = `;${dir};`;
    expect(findExecutable("emptytool", { pathEnv })).toBe(file);
  });
});
