import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";
import "eslint-import-resolver-typescript";

// The layered dependency graph enforced by ESLint.
// Every package may only import @atlas/* packages listed for it.
const ALL_PACKAGES = [
  "@atlas/shared",
  "@atlas/core",
  "@atlas/hashing",
  "@atlas/scanner",
  "@atlas/parser",
  "@atlas/storage",
  "@atlas/graph",
  "@atlas/context",
  "@atlas/cache",
  "@atlas/providers",
  "@atlas/summary",
  "@atlas/search",
  "@atlas/sdk",
  "@atlas/agents",
  "@atlas/usage",
  "@atlas/metrics",
  "@atlas/toolkit",
  "@atlas/mcp",
];

/** Which @atlas/* packages each package is allowed to depend on. */
const DEPENDENCY_MATRIX = {
  "packages/shared": [],
  "packages/core": ["@atlas/shared"],
  "packages/hashing": ["@atlas/core", "@atlas/shared"],
  "packages/scanner": ["@atlas/core", "@atlas/shared"],
  "packages/parser": ["@atlas/core", "@atlas/shared"],
  "packages/storage": ["@atlas/core", "@atlas/shared"],
  "packages/graph": ["@atlas/core", "@atlas/shared"],
  "packages/context": ["@atlas/core", "@atlas/shared"],
  "packages/cache": ["@atlas/core", "@atlas/shared"],
  "packages/providers": ["@atlas/core", "@atlas/shared"],
  "packages/agents": ["@atlas/core", "@atlas/shared"],
  "packages/usage": ["@atlas/core", "@atlas/shared"],
  "packages/metrics": ["@atlas/core", "@atlas/shared"],
  "packages/toolkit": ["@atlas/core", "@atlas/shared"],
  "packages/summary": ["@atlas/core", "@atlas/shared"],
  "packages/search": ["@atlas/core", "@atlas/shared"],
  "packages/sdk": [
    "@atlas/shared",
    "@atlas/core",
    "@atlas/hashing",
    "@atlas/scanner",
    "@atlas/parser",
    "@atlas/storage",
    "@atlas/graph",
    "@atlas/context",
    "@atlas/cache",
    "@atlas/providers",
    "@atlas/summary",
    "@atlas/search",
    "@atlas/agents",
    "@atlas/usage",
    "@atlas/metrics",
    "@atlas/toolkit",
  ],
  "apps/cli": ["@atlas/sdk", "@atlas/mcp"],
  "apps/extension": ["@atlas/sdk"],
  "packages/mcp": ["@atlas/sdk"],
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
