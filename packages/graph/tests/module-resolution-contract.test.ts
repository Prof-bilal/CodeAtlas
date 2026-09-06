import type { FilePath } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { resolveModulePath } from "../src/module-resolution";

/**
 * Phase 5 alias contract (plan §17 Phase 5 Task 4, resolve-or-mark half).
 *
 * `module-resolution.ts` carries a "keep in sync" comment with the parser's
 * `SymbolIndexer.resolveModulePath`. The parser method is private, so this
 * test pins the shared contract both must honor: relative specifiers resolve
 * through the same candidate list; bare / node: / alias specifiers resolve
 * to `undefined` (mark-unresolved — counted as `unresolvedImports`, never
 * guessed). If either side changes candidates, this test fails loudly.
 */
function known(files: readonly string[]): ReadonlyMap<string, FilePath> {
  return new Map(files.map((f) => [f, f as FilePath]));
}

describe("module-resolution alias contract (parser ↔ graph)", () => {
  const files = known([
    "/repo/src/utils.ts",
    "/repo/src/index.ts",
    "/repo/src/sub/index.ts",
    "/repo/src/app.js",
  ]);

  it("resolves relative specifiers through the documented candidate list", () => {
    expect(resolveModulePath("/repo/src/main.ts" as FilePath, "./utils", files)).toBe(
      "/repo/src/utils.ts",
    );
    expect(resolveModulePath("/repo/src/main.ts" as FilePath, "./utils.ts", files)).toBe(
      "/repo/src/utils.ts",
    );
    expect(resolveModulePath("/repo/src/main.ts" as FilePath, "./sub", files)).toBe(
      "/repo/src/sub/index.ts",
    );
    expect(resolveModulePath("/repo/src/sub/a.ts" as FilePath, "../utils", files)).toBe(
      "/repo/src/utils.ts",
    );
  });

  it("resolves an explicit .js specifier only when the .js file is indexed", () => {
    expect(resolveModulePath("/repo/src/main.ts" as FilePath, "./app.js", files)).toBe(
      "/repo/src/app.js",
    );
    expect(
      resolveModulePath("/repo/src/main.ts" as FilePath, "./missing.js", files),
    ).toBeUndefined();
  });

  it("marks bare / node: / alias specifiers unresolved (never guessed)", () => {
    const from = "/repo/src/main.ts" as FilePath;
    for (const spec of [
      "lodash",
      "@repo/utils",
      "@/utils",
      "~/utils",
      "@lib/utils",
      "node:fs",
      "/absolute/path",
    ]) {
      expect(resolveModulePath(from, spec, files), spec).toBeUndefined();
    }
  });

  it("returns undefined for unknown relative targets", () => {
    expect(resolveModulePath("/repo/src/main.ts" as FilePath, "./nope", files)).toBeUndefined();
  });
});
