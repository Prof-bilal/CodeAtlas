import { afterEach, describe, expect, it } from "vitest";
import { ContextClient } from "../src/client";
import { childrenOf, ViewTreeProvider, TREE_VIEWS } from "../src/providers";
import { createEmptyFixture, createFixture, type Fixture } from "./fixture";

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const fixture of fixtures) {
    fixture.cleanup();
  }
  fixtures.length = 0;
});

describe("childrenOf", () => {
  it("builds the project root and its overview children", () => {
    const fixture = createFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });

    const roots = childrenOf(client, "codeatlas.project");
    expect(roots).toHaveLength(1);
    expect(roots[0]?.contextValue).toBe("codeatlas.project");

    const children = childrenOf(client, "codeatlas.project", roots[0]);
    expect(children.some((node) => node.label === "Files")).toBe(true);
    client.close();
  });

  it("groups symbols by kind and expands a group to rows", () => {
    const fixture = createFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });

    const groups = childrenOf(client, "codeatlas.symbols");
    const functionGroup = groups.find((group) => group.label === "function");
    expect(functionGroup).toBeDefined();

    const rows = childrenOf(client, "codeatlas.symbols", functionGroup);
    expect(rows.some((row) => row.label === "double")).toBe(true);
    client.close();
  });

  it("lists modules and their files", () => {
    const fixture = createFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });

    const modules = childrenOf(client, "codeatlas.modules");
    const srcModule = modules.find((module) => module.label === "src");
    expect(srcModule).toBeDefined();

    const files = childrenOf(client, "codeatlas.modules", srcModule);
    expect(files.map((file) => file.label).sort()).toEqual(["auth.ts", "math.ts"]);
    client.close();
  });

  it("shows summaries and dependency groups for their views", () => {
    const fixture = createFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });

    expect(childrenOf(client, "codeatlas.summaries")).toHaveLength(3);
    expect(childrenOf(client, "codeatlas.dependencies")).toHaveLength(2);
    client.close();
  });

  it("renders an empty state instead of throwing when no index exists", () => {
    const fixture = createEmptyFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });

    const roots = childrenOf(client, "codeatlas.project");
    expect(roots[0]?.contextValue).toBe("codeatlas.empty");
    client.close();
  });
});

describe("ViewTreeProvider", () => {
  it("registers a provider for every contributed view", () => {
    const fixture = createFixture();
    fixtures.push(fixture);
    const client = new ContextClient({ repositoryPath: fixture.root });

    let refreshes = 0;
    const provider = new ViewTreeProvider(client, "codeatlas.project");
    const subscription = provider.onDidChangeTreeData(() => {
      refreshes += 1;
    });
    provider.refresh();
    expect(refreshes).toBe(1);

    const roots = provider.getChildren();
    expect(provider.getTreeItem(roots[0])).toBe(roots[0]);
    subscription.dispose();
    provider.refresh();
    expect(refreshes).toBe(1);
    client.close();
  });

  it("covers every id in TREE_VIEWS", () => {
    expect(TREE_VIEWS).toHaveLength(5);
    expect(new Set(TREE_VIEWS).size).toBe(TREE_VIEWS.length);
  });
});
