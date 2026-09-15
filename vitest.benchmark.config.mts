import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
function repoPath(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}
const atlasAliases: Record<string, string> = {
  "@prof-bilal/atlas-shared": repoPath("packages/shared/src/index.ts"),
  "@prof-bilal/atlas-core": repoPath("packages/core/src/index.ts"),
  "@prof-bilal/atlas-hashing": repoPath("packages/hashing/src/index.ts"),
  "@prof-bilal/atlas-scanner": repoPath("packages/scanner/src/index.ts"),
  "@prof-bilal/atlas-parser": repoPath("packages/parser/src/index.ts"),
  "@prof-bilal/atlas-storage": repoPath("packages/storage/src/index.ts"),
  "@prof-bilal/atlas-graph": repoPath("packages/graph/src/index.ts"),
  "@prof-bilal/atlas-context": repoPath("packages/context/src/index.ts"),
  "@prof-bilal/atlas-cache": repoPath("packages/cache/src/index.ts"),
  "@prof-bilal/atlas-providers": repoPath("packages/providers/src/index.ts"),
  "@prof-bilal/atlas-summary": repoPath("packages/summary/src/index.ts"),
  "@prof-bilal/atlas-search": repoPath("packages/search/src/index.ts"),
  "@prof-bilal/atlas-sdk": repoPath("packages/sdk/src/index.ts"),
  "@prof-bilal/atlas-agents": repoPath("packages/agents/src/index.ts"),
  "@prof-bilal/atlas-usage": repoPath("packages/usage/src/index.ts"),
  "@prof-bilal/atlas-metrics": repoPath("packages/metrics/src/index.ts"),
  "@prof-bilal/atlas-toolkit": repoPath("packages/toolkit/src/index.ts"),
  "@prof-bilal/atlas-mcp": repoPath("packages/mcp/src/index.ts"),
  "@prof-bilal/atlas-benchmark": repoPath("packages/benchmark/src/index.ts"),
};
export default defineConfig({
  resolve: { alias: atlasAliases },
  ssr: { external: ["node:sqlite"] },
  test: {
    environment: "node",
    include: ["benchmarks/**/*.test.ts"],
    testTimeout: 600000,
    hookTimeout: 120000,
    server: { deps: { external: ["node:sqlite"] } },
  },
});
