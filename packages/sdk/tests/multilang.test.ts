import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createContextSDK, indexProject } from "../src/index";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "atlas-multilang-"));
  roots.push(root);
  return root;
}

describe("multi-language indexing", () => {
  it("parses Python and Go and resolves their cross-file imports", async () => {
    const root = await tempRepo();
    await mkdir(join(root, "pkg"), { recursive: true });
    await writeFile(join(root, "pkg", "util.py"), "def helper():\n    return 1\n");
    await writeFile(
      join(root, "app.py"),
      "from pkg.util import helper\n\n\ndef run():\n    return helper()\n",
    );

    await mkdir(join(root, "internal", "util"), { recursive: true });
    await writeFile(
      join(root, "internal", "util", "util.go"),
      "package util\n\nfunc Do() int { return 1 }\n",
    );
    await writeFile(
      join(root, "main.go"),
      'package main\n\nimport "example.com/mod/internal/util"\n\nfunc main() { util.Do() }\n',
    );

    const index = await indexProject({ repositoryPath: root, mode: "build" });
    expect(index.ok).toBe(true);
    if (!index.ok) return;
    expect(index.value.symbols).toBeGreaterThan(0);

    const sdk = createContextSDK({ repositoryPath: root });
    try {
      const edges = sdk.dependencies.getDependencyGraph();
      const imports = edges
        .filter((edge) => edge.kind === "imports")
        .map((edge) => `${edge.from}->${edge.to}`);

      // Python: app.py imports pkg/util.py.
      expect(imports.some((pair) => pair.includes("app.py") && pair.includes("util.py"))).toBe(
        true,
      );
      // Go: main.go imports internal/util/util.go.
      expect(
        imports.some((pair) => pair.includes("main.go") && pair.includes("internal/util/util.go")),
      ).toBe(true);

      // Symbols from both languages are searchable.
      expect(sdk.symbols.searchSymbols("helper", { limit: 5 }).length).toBeGreaterThan(0);
      expect(sdk.symbols.searchSymbols("Do", { limit: 5 }).length).toBeGreaterThan(0);

      // PageRank importance produced a non-empty repo map.
      const repoMap = sdk.project.repoMap(5);
      expect(repoMap.entries.length).toBeGreaterThan(0);
      expect(repoMap.text.length).toBeGreaterThan(0);
    } finally {
      sdk.close();
    }
  });
});
