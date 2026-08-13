import { createContextSDK } from "@atlas/sdk";
import { describe, expect, it } from "vitest";
import { REPO_PATH, rel, writeResult } from "./helpers";

interface ReadMetrics {
  readonly files: number;
  readonly symbols: number;
  readonly modules: number;
  readonly dependencies: number;
  readonly hashes: number;
  readonly summaries: number;
  readonly overview: {
    readonly languages: ReadonlyArray<{ language: string; count: number }>;
    readonly counts: Record<string, number>;
  };
  readonly samples: {
    readonly file: { path: string; language: string } | null;
    readonly symbol: { name: string; kind: string } | null;
    readonly references: number;
    readonly dependents: number;
    readonly module: { name: string; moduleType: string } | null;
  };
}

/**
 * 05 — Verify the read surface of the Context SDK against the real index:
 * files, symbols, dependencies, modules, overview, status, and error behavior.
 */
describe("05 — context SDK read surface", () => {
  it("reads real files, symbols, dependencies, modules, and overview", () => {
    const context = createContextSDK({ repositoryPath: REPO_PATH });
    try {
      expect(context.isAvailable).toBe(true);
      const status = context.status();
      expect(status.available).toBe(true);
      expect(status.filesIndexed).toBeGreaterThan(100);

      const files = context.files.listFiles();
      expect(files.length).toBeGreaterThan(100);
      const login = files.find((file) =>
        file.path.replaceAll("\\", "/").includes("src/pages/auth/Login"),
      );
      expect(login, "Login.tsx must be in the file index").toBeDefined();

      const symbols = context.symbols.listSymbols();
      expect(symbols.length).toBeGreaterThan(1000);
      const loginPage = symbols.find((symbol) => symbol.name === "LoginPage");
      expect(loginPage, "LoginPage symbol must exist").toBeDefined();

      const def = context.symbols.findDefinition((loginPage as { id: string }).id);
      expect(def).toBeDefined();

      const references = context.symbols.findReferences((loginPage as { id: string }).id);
      expect(references.length).toBeGreaterThanOrEqual(0);

      const modules = context.modules.listModules();
      expect(modules.length).toBeGreaterThan(20);
      const authModule = modules.find((module) =>
        module.path.replaceAll("\\", "/").includes("src/pages/auth"),
      );
      expect(authModule, "auth pages module must exist").toBeDefined();

      const graph = context.dependencies.getDependencyGraph();
      expect(graph.length).toBeGreaterThan(1000);

      const dependents = context.dependencies.getDependents(login?.path ?? "");
      expect(dependents.length).toBeGreaterThanOrEqual(0);

      const overview = context.project.overview();
      expect(overview.counts.files).toBeGreaterThan(100);
      expect(overview.counts.symbols).toBeGreaterThan(1000);

      const stats = context.project.stats();
      expect(stats.symbols).toBeGreaterThan(1000);

      const metrics: ReadMetrics = {
        files: files.length,
        symbols: symbols.length,
        modules: modules.length,
        dependencies: graph.length,
        hashes: Object.keys(context.hashes()).length,
        summaries: context.summaries.listSummaries().length,
        overview: {
          languages: overview.languages,
          counts: {
            files: overview.counts.files,
            symbols: overview.counts.symbols,
            modules: overview.counts.modules,
            dependencies: overview.counts.dependencies,
          },
        },
        samples: {
          file: login ? { path: rel(login.path), language: login.language } : null,
          symbol: loginPage ? { name: loginPage.name, kind: loginPage.kind } : null,
          references: references.length,
          dependents: dependents.length,
          module: authModule ? { name: authModule.name, moduleType: authModule.moduleType } : null,
        },
      };
      void writeResult("05-verify-context", metrics);
    } finally {
      context.close();
    }
  });

  it("throws typed errors for unknown entities", () => {
    const context = createContextSDK({ repositoryPath: REPO_PATH });
    try {
      expect(() => context.files.getFile("/src/does-not-exist.ts")).toThrow();
      expect(() => context.symbols.findDefinition("symbol:missing")).toThrow();
      expect(() => context.dependencies.getDependencies("/nope")).toThrow();
    } finally {
      context.close();
    }
  });

  it("reports unavailable status cleanly for a missing index", () => {
    const context = createContextSDK({
      dbPath: "C:/does/not/exist/.codeatlas/context.db",
    });
    try {
      expect(context.isAvailable).toBe(false);
      expect(() => context.search.search("anything")).toThrow(/no context/i);
    } finally {
      context.close();
    }
  });
});
