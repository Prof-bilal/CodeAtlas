import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Resolve an absolute path relative to this repository root. */
function repoPath(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

/** Single source of truth for `@atlas/*` aliases across the test suite. */
const atlasAliases: Record<string, string> = {
  "@atlas/shared": repoPath("packages/shared/src/index.ts"),
  "@atlas/core": repoPath("packages/core/src/index.ts"),
  "@atlas/hashing": repoPath("packages/hashing/src/index.ts"),
  "@atlas/scanner": repoPath("packages/scanner/src/index.ts"),
  "@atlas/parser": repoPath("packages/parser/src/index.ts"),
  "@atlas/storage": repoPath("packages/storage/src/index.ts"),
  "@atlas/graph": repoPath("packages/graph/src/index.ts"),
  "@atlas/context": repoPath("packages/context/src/index.ts"),
  "@atlas/cache": repoPath("packages/cache/src/index.ts"),
  "@atlas/providers": repoPath("packages/providers/src/index.ts"),
  "@atlas/summary": repoPath("packages/summary/src/index.ts"),
  "@atlas/search": repoPath("packages/search/src/index.ts"),
  "@atlas/sdk": repoPath("packages/sdk/src/index.ts"),
  "@atlas/agents": repoPath("packages/agents/src/index.ts"),
  "@atlas/usage": repoPath("packages/usage/src/index.ts"),
  "@atlas/toolkit": repoPath("packages/toolkit/src/index.ts"),
  "@atlas/mcp": repoPath("packages/mcp/src/index.ts"),
};

export default defineConfig({
  resolve: { alias: atlasAliases },
  ssr: {
    // Keep `node:sqlite` external so Vite emits the `node:`-prefixed specifier
    // verbatim; otherwise the prefix is stripped and Node can't resolve `sqlite`.
    external: ["node:sqlite"],
  },
  test: {
    environment: "node",
    include: ["packages/*/tests/**/*.test.ts", "apps/**/tests/**/*.test.ts"],
    // MCP audit/context suites index real fixture trees in temp dirs; 5s is too
    // tight under parallel load (gitignore adds per-directory I/O). 15s is
    // generous for a single suite while still failing genuinely hung tests.
    testTimeout: 15000,
    server: {
      deps: {
        external: ["node:sqlite"],
      },
    },
  },
});
