import { resolve } from "node:path";
import type { Options } from "tsup";

/**
 * Repository root, computed from wherever tsup is invoked.
 * Every package and app below `packages/` / `apps/` is exactly two
 * directories deep, so `../ ..` always resolves to the workspace root.
 */
const ROOT = resolve(process.cwd(), "..", "..");

/**
 * Map `@atlas/*` package names to their source entry points so that bundled
 * packages (e.g. the CLI and the SDK) can pull workspace sources directly.
 * This removes any cross-package build-order requirement.
 */
const workspaceAliases: Record<string, string> = {
  "@atlas/shared": resolve(ROOT, "packages/shared/src/index.ts"),
  "@atlas/core": resolve(ROOT, "packages/core/src/index.ts"),
  "@atlas/hashing": resolve(ROOT, "packages/hashing/src/index.ts"),
  "@atlas/scanner": resolve(ROOT, "packages/scanner/src/index.ts"),
  "@atlas/parser": resolve(ROOT, "packages/parser/src/index.ts"),
  "@atlas/storage": resolve(ROOT, "packages/storage/src/index.ts"),
  "@atlas/graph": resolve(ROOT, "packages/graph/src/index.ts"),
  "@atlas/context": resolve(ROOT, "packages/context/src/index.ts"),
  "@atlas/cache": resolve(ROOT, "packages/cache/src/index.ts"),
  "@atlas/providers": resolve(ROOT, "packages/providers/src/index.ts"),
  "@atlas/search": resolve(ROOT, "packages/search/src/index.ts"),
  "@atlas/sdk": resolve(ROOT, "packages/sdk/src/index.ts"),
  "@atlas/agents": resolve(ROOT, "packages/agents/src/index.ts"),
  "@atlas/usage": resolve(ROOT, "packages/usage/src/index.ts"),
  "@atlas/toolkit": resolve(ROOT, "packages/toolkit/src/index.ts"),
  "@atlas/mcp": resolve(ROOT, "packages/mcp/src/index.ts"),
};

/** Base tsup configuration shared by every package and app. */
export function atlasConfig(overrides: Partial<Options> = {}): Options {
  return {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    outDir: "dist",
    external: ["commander"],
    alias: workspaceAliases,
    ...overrides,
  };
}
