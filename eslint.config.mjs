import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";
import "eslint-import-resolver-typescript";

// The layered dependency graph enforced by ESLint.
// Every package may only import @prof-bilal/atlas-* packages listed for it.
const ALL_PACKAGES = [
  "@prof-bilal/atlas-shared",
  "@prof-bilal/atlas-core",
  "@prof-bilal/atlas-hashing",
  "@prof-bilal/atlas-scanner",
  "@prof-bilal/atlas-parser",
  "@prof-bilal/atlas-storage",
  "@prof-bilal/atlas-graph",
  "@prof-bilal/atlas-context",
  "@prof-bilal/atlas-cache",
  "@prof-bilal/atlas-providers",
  "@prof-bilal/atlas-summary",
  "@prof-bilal/atlas-search",
  "@prof-bilal/atlas-sdk",
  "@prof-bilal/atlas-agents",
  "@prof-bilal/atlas-usage",
  "@prof-bilal/atlas-metrics",
  "@prof-bilal/atlas-toolkit",
  "@prof-bilal/atlas-mcp",
  "@prof-bilal/atlas-benchmark",
  "@prof-bilal/atlas-verifier",
  "@prof-bilal/atlas-common",
];

/** Which @prof-bilal/atlas-* packages each package is allowed to depend on. */
const DEPENDENCY_MATRIX = {
  "packages/shared": [],
  "packages/core": ["@prof-bilal/atlas-shared"],
  "packages/hashing": ["@prof-bilal/atlas-core", "@prof-bilal/atlas-shared"],
  "packages/scanner": ["@prof-bilal/atlas-core", "@prof-bilal/atlas-shared"],
  "packages/parser": ["@prof-bilal/atlas-core", "@prof-bilal/atlas-shared"],
  "packages/storage": ["@prof-bilal/atlas-core", "@prof-bilal/atlas-shared"],
  "packages/graph": ["@prof-bilal/atlas-core", "@prof-bilal/atlas-shared"],
  "packages/context": ["@prof-bilal/atlas-core", "@prof-bilal/atlas-shared"],
  "packages/cache": ["@prof-bilal/atlas-core", "@prof-bilal/atlas-shared"],
  "packages/providers": ["@prof-bilal/atlas-core", "@prof-bilal/atlas-shared"],
  "packages/agents": ["@prof-bilal/atlas-core", "@prof-bilal/atlas-shared"],
  "packages/usage": ["@prof-bilal/atlas-core", "@prof-bilal/atlas-shared"],
  "packages/metrics": ["@prof-bilal/atlas-core", "@prof-bilal/atlas-shared"],
  "packages/toolkit": ["@prof-bilal/atlas-core", "@prof-bilal/atlas-shared"],
  "packages/summary": ["@prof-bilal/atlas-core", "@prof-bilal/atlas-shared"],
  "packages/search": ["@prof-bilal/atlas-core", "@prof-bilal/atlas-shared"],
  "packages/sdk": [
    "@prof-bilal/atlas-shared",
    "@prof-bilal/atlas-core",
    "@prof-bilal/atlas-hashing",
    "@prof-bilal/atlas-scanner",
    "@prof-bilal/atlas-parser",
    "@prof-bilal/atlas-storage",
    "@prof-bilal/atlas-graph",
    "@prof-bilal/atlas-context",
    "@prof-bilal/atlas-cache",
    "@prof-bilal/atlas-providers",
    "@prof-bilal/atlas-summary",
    "@prof-bilal/atlas-search",
    "@prof-bilal/atlas-agents",
    "@prof-bilal/atlas-usage",
    "@prof-bilal/atlas-metrics",
    "@prof-bilal/atlas-toolkit",
    "@prof-bilal/atlas-benchmark",
    "@prof-bilal/atlas-verifier",
  ],
  "apps/cli": ["@prof-bilal/atlas-sdk", "@prof-bilal/atlas-mcp", "@prof-bilal/atlas-benchmark"],
  "apps/server": ["@prof-bilal/atlas-sdk", "@prof-bilal/atlas-mcp", "@prof-bilal/atlas-benchmark"],
  "apps/extension": ["@prof-bilal/atlas-sdk"],
  "packages/mcp": ["@prof-bilal/atlas-sdk"],
  "packages/benchmark": [
    "@prof-bilal/atlas-core",
    "@prof-bilal/atlas-shared",
    "@prof-bilal/atlas-agents",
    "@prof-bilal/atlas-usage",
    "@prof-bilal/atlas-toolkit",
  ],
  "packages/verifier": ["@prof-bilal/atlas-core", "@prof-bilal/atlas-shared", "@prof-bilal/atlas-storage"],
  "packages/common": [],
};

/** Build per-package `no-restricted-imports` blocks from the matrix. */
function dependencyRestrictions() {
  return Object.entries(DEPENDENCY_MATRIX)
    .map(([dir, allowed]) => {
      const forbidden = ALL_PACKAGES.filter((pkg) => !allowed.includes(pkg));
      if (forbidden.length === 0) return null;
      return {
        files: [`${dir}/**/*.{ts,tsx}`],
        ignores: [`${dir}/tests/**`],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: forbidden.map((pkg) => ({
                group: [pkg],
                message: `"${pkg}" is not an allowed dependency for "${dir}". See ARCHITECTURE.md dependency rules.`,
              })),
            },
          ],
        },
      };
    })
    .filter(Boolean);
}

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "ui/**",
      "go-tui-app/**",
      "tests/fixtures/**",
      "benchmark-repos/**",
      "benchmarks/**",
      "old-school/**",
      "scripts/**",
      "docs/test-results/**",
      // Separate npm project with its own oxlint config — not part of the
      // monorepo's ESLint scope.
      "CodeAtlas-ui/**",
    ],
  },
  {
    settings: {
      "import/resolver": {
        typescript: { alwaysTryTypes: true },
        node: true,
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  importPlugin.flatConfigs.recommended,
  {
    files: ["**/*.cjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        process: "readonly",
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "import/no-duplicates": "error",
    },
  },
  {
    // `@modelcontextprotocol/sdk` only maps its `.js` subpath exports to
    // `.d.ts` for extensionless specifiers, so `import/no-unresolved` reports
    // false positives for `@modelcontextprotocol/sdk/server/mcp.js` etc. (TS
    // and Node both resolve them). Scope an `ignore` to the MCP package and
    // the benchmark harness that drives a real MCP client.
    files: ["packages/mcp/**/*.ts", "tests/**/*.ts"],
    rules: {
      "import/no-unresolved": ["error", { ignore: ["^@modelcontextprotocol/sdk/"] }],
    },
  },
  ...dependencyRestrictions(),
);
