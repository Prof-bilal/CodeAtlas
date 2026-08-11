import { describe, expect, it } from "vitest";
import type { DependencyContext, ModuleContext, ProjectOverview, Summary } from "@atlas/sdk";
import type { EditorSymbol } from "../src/client";
import {
  dependencyEdgeNodes,
  dependencyGroupNodes,
  languageChildren,
  moduleFileNodes,
  moduleNodes,
  projectOverviewChildren,
  projectRootNode,
  summaryNodes,
  symbolGroupNodes,
  symbolRowsForKind,
} from "../src/ui/nodes";

const SYMBOL = (over: Partial<EditorSymbol> = {}): EditorSymbol => ({
  id: "s1",
  name: "double",
  kind: "function",
  filePath: "/src/math.ts",
  line: 3,
  documentation: "Doubles a number.",
  ...over,
});

const OVERVIEW: ProjectOverview = {
  repositoryPath: "C:/repo/demo",
  savedAt: "2026-08-09T10:00:00.000Z",
  schemaVersion: 3,
  languages: { typescript: 2, markdown: 1 },
  counts: { files: 3, symbols: 3, modules: 1, dependencies: 2, summaries: 3 },
};

const SUMMARY: Summary = {
  kind: "file",
  target: "/src/math.ts",
  content: { overview: "Math utilities for the project.", keyPoints: [] },
  metadata: {
    generatedAt: "2026-08-09T00:00:00.000Z",
    provider: "claude",
    model: "claude-sonnet-5",
    prompt: null,
    cacheHit: true,
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  },
};

const MODULE: ModuleContext = { path: "/src", name: "src", moduleType: "folder" };

const DEPENDENCY: DependencyContext = {
  from: "n:file:/src/auth.ts",
  to: "n:file:/src/math.ts",
  kind: "imports",
  fromLabel: "/src/auth.ts",
  toLabel: "/src/math.ts",
};

describe("project root + overview children", () => {
  it("derives the label from the last path segment", () => {
    const root = projectRootNode(OVERVIEW);
    expect(root.label).toBe("demo");
    expect(root.contextValue).toBe("codeatlas.project");
    expect(root.collapsibleState).toBe(2);
  });

  it("renders the counts, languages, saved-at, and schema underneath", () => {
    const children = projectOverviewChildren(OVERVIEW);
    const labels = children.map((node) => node.label);
    expect(labels).toEqual([
      "Files",
      "Symbols",
      "Modules",
      "Dependencies",
      "Summaries",
      "Languages",
      "Saved at",
      "Schema version",
    ]);
    expect(children[0]?.description).toBe("3");
    expect(children[5]?.contextValue).toBe("codeatlas.languages");
    expect(children[6]?.description).toBe("2026-08-09");
  });

  it("adds the project summary node when one exists", () => {
    const withSummary = projectOverviewChildren({ ...OVERVIEW, summary: SUMMARY });
    expect(withSummary.some((node) => node.label === "Project summary")).toBe(true);
  });
});

describe("languages", () => {
  it("sorts languages by count descending", () => {
    const nodes = languageChildren(OVERVIEW);
    expect(nodes.map((node) => node.label)).toEqual(["typescript", "markdown"]);
    expect(nodes[0]?.description).toBe("2");
  });
});

describe("symbols", () => {
  it("groups symbols by kind, sorted", () => {
    const groups = symbolGroupNodes([
      SYMBOL(),
      SYMBOL({ id: "s2", name: "login", kind: "function" }),
      SYMBOL({ id: "s3", name: "MathUtils", kind: "class" }),
    ]);
    expect(groups.map((group) => group.label)).toEqual(["class", "function"]);
    expect(groups[1]?.description).toBe("2");
  });

  it("renders a symbol row with a clickable open command", () => {
    const rows = symbolRowsForKind("function", [SYMBOL()]);
    expect(rows[0]?.label).toBe("double");
    expect(rows[0]?.description).toBe("math.ts:3");
    expect(rows[0]?.command?.command).toBe("codeatlas.openFile");
  });

  it("omits the tooltip when a symbol has no documentation", () => {
    const rows = symbolRowsForKind("function", [SYMBOL({ documentation: null })]);
    expect(rows[0]).not.toHaveProperty("tooltip");
  });

  it("attaches the documentation tooltip when present", () => {
    const rows = symbolRowsForKind("function", [SYMBOL({ documentation: "Docs." })]);
    expect(rows[0]?.tooltip).toBe("Docs.");
  });
});

describe("modules", () => {
  it("lists modules expandable to their files", () => {
    const nodes = moduleNodes([MODULE]);
    expect(nodes[0]?.label).toBe("src");
    expect(nodes[0]?.description).toBe("/src");
    expect(nodes[0]?.collapsibleState).toBe(1);
  });

  it("renders a module's files relative to the module path", () => {
    const files = [
      { path: "/src/math.ts", language: "typescript" },
      { path: "/README.md", language: "markdown" },
    ];
    const rows = moduleFileNodes("/src", files);
    expect(rows.map((row) => row.label)).toEqual(["math.ts"]);
  });
});

describe("summaries", () => {
  it("labels the project summary as Project", () => {
    const nodes = summaryNodes([{ ...SUMMARY, kind: "project" as const, target: "" }]);
    expect(nodes[0]?.label).toBe("Project");
  });
});

describe("dependencies", () => {
  it("groups edges by source label and shows the edges", () => {
    const sources = dependencyGroupNodes([DEPENDENCY]);
    expect(sources[0]?.label).toBe("/src/auth.ts");
    expect(sources[0]?.description).toBe("1");

    const edges = dependencyEdgeNodes("/src/auth.ts", [DEPENDENCY]);
    expect(edges[0]?.label).toBe("→ /src/math.ts");
    expect(edges[0]?.contextValue).toBe("codeatlas.dep-edge");
  });

  it("sorts sibling edges by target label", () => {
    const edges = dependencyEdgeNodes("/src/auth.ts", [
      { ...DEPENDENCY, toLabel: "/zeta.ts" },
      { ...DEPENDENCY, toLabel: "/alpha.ts" },
    ]);
    expect(edges.map((edge) => edge.label)).toEqual(["→ /alpha.ts", "→ /zeta.ts"]);
  });
});
