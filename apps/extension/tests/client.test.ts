import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createProjectContainer } from "@atlas/sdk";
import { ContextClient, hasIndex, isUnavailable, resolvePaths } from "../src/client";
import { createEmptyFixture, createFixture, standardData, type Fixture } from "./fixture";

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const fixture of fixtures) {
    fixture.cleanup();
  }
  fixtures.length = 0;
});

describe("ContextClient against a real index", () => {
  it("opens a session pointing at the fixture database", () => {
    const fixture = createFixture();
    fixtures.push(fixture);

    const client = new ContextClient({ repositoryPath: fixture.root });
    expect(client.isAvailable).toBe(true);

    const paths = resolvePaths({ repositoryPath: fixture.root });
    expect(paths.repositoryPath).toBe(fixture.root);
    expect(paths.dbPath).toBe(join(fixture.root, ".codeatlas", "context.db"));
    expect(existsSync(paths.dbPath)).toBe(true);
    expect(hasIndex(fixture.root)).toBe(true);
    client.close();
  });

  it("reports project overview counts from the persisted index", () => {
    const fixture = createFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });

    const overview = client.overview();
    expect(overview.counts.files).toBe(3);
    expect(overview.counts.symbols).toBe(3);
    expect(overview.counts.modules).toBe(1);
    expect(overview.counts.dependencies).toBe(2);
    expect(overview.counts.summaries).toBe(3);
    client.close();
  });

  it("searches symbols and files through the SDK", () => {
    const fixture = createFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });

    const symbolHits = client.searchSymbols("double");
    expect(symbolHits.length).toBeGreaterThan(0);
    const fileHits = client.searchFiles("math");
    expect(fileHits.length).toBeGreaterThan(0);
    client.close();
  });

  it("lists symbols, files, modules, and summaries", () => {
    const fixture = createFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });

    expect(
      client
        .listSymbols()
        .map((s) => s.name)
        .sort(),
    ).toEqual(["MathUtils", "double", "login"]);
    expect(client.listFiles().map((f) => f.path)).toContain("/src/math.ts");
    expect(client.modules().map((m) => m.name)).toEqual(["src"]);
    expect(client.summaries().length).toBe(3);
    client.close();
  });

  it("reads file summaries and relevant context", () => {
    const fixture = createFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });

    const summary = client.fileSummary("/src/math.ts");
    expect(summary?.content.overview).toBe("Math utilities.");

    const relevant = client.relevant("double");
    expect(relevant.symbols.map((s) => s.name)).toContain("double");
    expect(relevant.files.some((path) => path.includes("math"))).toBe(true);
    client.close();
  });

  it("lists symbols declared in a single file", () => {
    const fixture = createFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });

    const symbols = client.symbolsInFile("/src/math.ts");
    expect(symbols.map((s) => s.name).sort()).toEqual(["MathUtils", "double"]);
    client.close();
  });

  it("is not available when there is no index, and surfaces a typed error", () => {
    const fixture = createEmptyFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });

    expect(client.isAvailable).toBe(false);
    const status = client.status();
    expect(status.available).toBe(false);

    let caught: unknown;
    try {
      client.overview();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();
    expect(isUnavailable(caught)).toBe(true);
    client.close();
  });

  it("becomes available again after reload once an index exists", () => {
    const fixture = createEmptyFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });
    expect(client.isAvailable).toBe(false);

    // Simulate `atlas build` writing an index into the same project root.
    mkdirSync(join(fixture.root, ".codeatlas"), { recursive: true });
    const container = createProjectContainer(fixture.dbPath);
    try {
      container.getContextDb().saveContext(standardData());
    } finally {
      container.getContextDb().close();
    }

    client.reload();
    expect(client.isAvailable).toBe(true);
    expect(client.status().filesIndexed).toBe(3);
    client.close();
  });
});
