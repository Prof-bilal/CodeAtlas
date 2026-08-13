import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_NAME, REPO_PATH, repositoryPresent, writeResult } from "./helpers";

/**
 * 00 — Repository profile. Verifies the real AI Builder repository fixture and
 * records a machine-readable profile used by the rest of the suite.
 */
describe("AI Builder repository profile", () => {
  it("is present as the external test subject", () => {
    expect(repositoryPresent(), "test-repo/AIbuilder must exist").toBe(true);
  });

  it("records an accurate repository profile", async () => {
    const rootEntries = readdirSync(REPO_PATH, { withFileTypes: true });
    const dirs = rootEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    const files = rootEntries.filter((entry) => entry.isFile()).map((entry) => entry.name);

    expect(rootEntries.map((entry) => entry.name)).toContain("package.json");
    expect(dirs).toContain("src");
    expect(dirs).toContain("project-context");
    expect(dirs).toContain("node_modules");
    expect(files).toContain("vite.config.ts");
    expect(files).toContain("index.html");

    for (const path of [
      "src/components/auth/RequireAuth.tsx",
      "src/pages/auth/Login.tsx",
      "src/App.tsx",
      "src/store/AppProvider.tsx",
      "project-context/backend/AUTH.md",
      "project-context/product/MVP.md",
    ]) {
      expect(fileExists(join(REPO_PATH, path)), `missing ${path}`).toBe(true);
    }

    const profile = {
      name: REPO_NAME,
      path: REPO_PATH,
      directories: dirs.sort(),
      rootFiles: files.sort(),
      importantDirectories: [
        "src/components",
        "src/components/auth",
        "src/components/backend",
        "src/components/builder",
        "src/components/designer",
        "src/components/navigation",
        "src/components/ui",
        "src/pages",
        "src/pages/auth",
        "src/data",
        "src/types",
        "src/lib",
        "src/hooks",
        "src/store",
        "project-context",
        "project-context/ai",
        "project-context/backend",
        "project-context/design",
        "project-context/product",
      ],
      configurationFiles: [
        "package.json",
        "vite.config.ts",
        "tsconfig.json",
        "tsconfig.app.json",
        "tsconfig.node.json",
        "index.html",
        "tokens.json",
        "theme.css",
        "variables.css",
      ],
      documentationFiles: [
        "DESIGN.md",
        "IMPLEMENTATION_PLAN.md",
        "wese.md",
        "project-context/ai/AGENTS.md",
        "project-context/backend/ARCHITECTURE.md",
        "project-context/backend/API.md",
        "project-context/backend/AUTH.md",
        "project-context/product/PRD.md",
        "project-context/product/MVP.md",
      ],
    };
    await writeResult("00-repository-profile", profile);
  });

  it("is a React + Vite + TypeScript + Tailwind project with auth and a docs set", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_PATH, "package.json"), "utf8")) as {
      name: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.name).toBe("aibuilder");
    expect(pkg.dependencies).toMatchObject({
      react: expect.stringMatching(/^\^18/),
      "react-dom": expect.stringMatching(/^\^18/),
      "react-router-dom": expect.stringMatching(/^\^6/),
      "lucide-react": expect.any(String),
    });
    expect(pkg.devDependencies).toMatchObject({
      vite: expect.stringMatching(/^\^6/),
      typescript: expect.any(String),
      "@vitejs/plugin-react": expect.any(String),
      "@tailwindcss/vite": expect.any(String),
    });
  });
});

function fileExists(path: string): boolean {
  return existsSync(path);
}
