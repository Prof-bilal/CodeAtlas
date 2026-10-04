import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CHATGPT_TOOLS, chatGptTool } from "../src/tools";
import { UI_RESOURCES_LIST } from "../src/ui-resources";
import { isErrorResult, structuredOf, textOf, withConnection } from "./harness";

/** Parse `structuredContent` against a tool's declared output schema. */
function assertConforms(name: (typeof CHATGPT_TOOLS)[number]["name"], structured: unknown): void {
  const tool = chatGptTool(name);
  const parsed = z.object(tool.outputSchema).safeParse(structured);
  if (!parsed.success) {
    throw new Error(`${name} output schema mismatch: ${parsed.error.message}`);
  }
}

describe("ChatGPT plugin protocol", () => {
  it("advertises the five focused tools over tools/list", async () => {
    await withConnection(async ({ client }) => {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual(
        CHATGPT_TOOLS.map((tool) => tool.name).sort(),
      );
      for (const tool of tools) {
        expect(tool.description ?? "").not.toHaveLength(0);
        expect(tool.inputSchema).toBeDefined();
        expect(tool.outputSchema).toBeDefined();
      }
    });
  });

  it("serves the MCP Apps widgets as resources", async () => {
    await withConnection(async ({ client }) => {
      const { resources } = await client.listResources();
      const uris = resources.map((resource) => resource.uri).sort();
      expect(uris).toEqual(UI_RESOURCES_LIST.map((resource) => resource.uri).sort());
      for (const resource of resources) {
        expect(resource.mimeType).toBe("text/html;profile=mcp-app");
      }
      const read = await client.readResource({ uri: UI_RESOURCES_LIST[0]?.uri ?? "" });
      const first = read.contents[0] as { text?: string };
      expect(first.text ?? "").toContain("CODEATLAS");
    });
  });

  it("analyze_repository returns real indexed counts", async () => {
    await withConnection(async ({ client, fixture }) => {
      const result = await client.callTool({ name: "analyze_repository", arguments: {} });
      const structured = structuredOf(result);
      expect(structured).toBeDefined();
      assertConforms("analyze_repository", structured);
      expect(structured?.["counts"]).toMatchObject({
        files: 3,
        symbols: 3,
        modules: 1,
        dependencies: 2,
      });
      expect((structured?.["repository"] as { root?: string }).root).toBe(fixture.root);
      expect(structured?.["ui"]).toEqual({
        resourceUri: "ui://codeatlas/repository-summary.html",
      });
    });
  });

  it("search_repository finds a symbol and its file", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({
        name: "search_repository",
        arguments: { query: "double" },
      });
      const structured = structuredOf(result);
      assertConforms("search_repository", structured);
      const results = structured?.["results"] as Array<{ path: string | null; kind: string }>;
      expect(results.some((hit) => hit.path === "/src/math.ts")).toBe(true);
      expect(results.some((hit) => hit.kind === "symbol" && hit.path === "/src/math.ts")).toBe(
        true,
      );
    });
  });

  it("search_repository expands a natural-language query when nothing matches directly", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({
        name: "search_repository",
        arguments: { query: "where is authentication implemented" },
      });
      const structured = structuredOf(result);
      assertConforms("search_repository", structured);
      const results = structured?.["results"] as Array<{ path: string | null; reason: string }>;
      expect(results.some((hit) => hit.path === "/src/auth.ts")).toBe(true);
      expect(Array.isArray(structured?.["expandedTerms"])).toBe(true);
    });
  });

  it("impact_analysis resolves repo-relative paths", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({
        name: "impact_analysis",
        arguments: { paths: ["src/math.ts"] },
      });
      const structured = structuredOf(result);
      assertConforms("impact_analysis", structured);
      const affected = structured?.["affected"] as Array<{ path: string }>;
      expect(affected.map((node) => node.path)).toContain("/src/auth.ts");
    });
  });

  it("explain_repository grounds an architecture question in indexed files", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({
        name: "explain_repository",
        arguments: { question: "how does auth use math" },
      });
      const structured = structuredOf(result);
      assertConforms("explain_repository", structured);
      expect(Array.isArray(structured?.["items"])).toBe(true);
      expect(typeof structured?.["sufficient"]).toBe("boolean");
      expect(structured?.["sources"]).toContain("/src/auth.ts");
    });
  });

  it("impact_analysis reports the transitive dependents and edges", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({
        name: "impact_analysis",
        arguments: { paths: ["/src/math.ts"] },
      });
      const structured = structuredOf(result);
      assertConforms("impact_analysis", structured);
      const affected = structured?.["affected"] as Array<{ path: string; distance: number }>;
      expect(affected).toContainEqual(
        expect.objectContaining({ path: "/src/auth.ts", distance: 1 }),
      );
      const edges = structured?.["edges"] as Array<{ relation: string }>;
      expect(edges.some((edge) => edge.relation === "imports")).toBe(true);
    });
  });

  it("get_context resolves a symbol to its source", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({
        name: "get_context",
        arguments: { target: "double" },
      });
      const structured = structuredOf(result);
      assertConforms("get_context", structured);
      expect((structured?.["resolved"] as { kind?: string }).kind).toBe("symbol");
      expect(structured?.["content"]).toContain("double");
    });
  });

  it("get_context resolves a file path when asked explicitly", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({
        name: "get_context",
        arguments: { target: "/src/math.ts", kind: "file" },
      });
      const structured = structuredOf(result);
      assertConforms("get_context", structured);
      expect((structured?.["resolved"] as { kind?: string }).kind).toBe("file");
      expect(structured?.["content"]).toContain("double");
    });
  });

  it("reports malformed arguments as an error result", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({
        name: "analyze_repository",
        arguments: { focus: 123 },
      });
      expect(isErrorResult(result)).toBe(true);
      expect(textOf(result)).toMatch(/invalid/i);
    });
  });
});

describe("ChatGPT plugin without an index", () => {
  it("returns a clear domain error instead of failing to start", async () => {
    // A fixture whose db file is removed: the server still starts, reads fail cleanly.
    const fixture = (await import("../../../packages/mcp/tests/fixture")).createFixture();
    const { rmSync } = await import("node:fs");
    rmSync(fixture.dbPath, { force: true });
    await withConnection(
      async ({ client }) => {
        const result = await client.callTool({ name: "analyze_repository", arguments: {} });
        expect(isErrorResult(result)).toBe(true);
        expect(textOf(result)).toMatch(/No context index found/);
        expect(structuredOf(result)).toBeUndefined();
      },
      {},
      fixture,
    );
  });
});
