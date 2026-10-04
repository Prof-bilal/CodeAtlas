import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import {
  createFixture,
  fixtureFile,
  silentLogger,
  standardData,
} from "../../../packages/mcp/tests/fixture";
import { createChatGptServer } from "../src/server";
import { isErrorResult, structuredOf, textOf, withConnection } from "./harness";

/**
 * The ten required realistic test prompts, run against a real indexed fixture
 * through the plugin's own MCP surface. Each asserts the response is grounded
 * in actual CodeAtlas data (or fails honestly).
 */
describe("required test prompts", () => {
  it("1. repository overview — 'Analyze this repository with CodeAtlas.'", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({ name: "analyze_repository", arguments: {} });
      const structured = structuredOf(result);
      expect(structured?.["counts"]).toMatchObject({ files: 3, symbols: 3, dependencies: 2 });
      expect(structured?.["findings"]).toBeInstanceOf(Array);
    });
  });

  it("2. authentication architecture — grounded in indexed files", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({
        name: "explain_repository",
        arguments: { question: "How does the login function work?" },
      });
      const structured = structuredOf(result);
      expect(structured?.["items"]).toBeInstanceOf(Array);
      expect((structured?.["items"] as unknown[]).length).toBeGreaterThan(0);
      expect((structured?.["sources"] as string[]).length).toBeGreaterThan(0);
    });
  });

  it("3. feature/file search — 'Where is login implemented?'", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({
        name: "search_repository",
        arguments: { query: "login" },
      });
      const results = structuredOf(result)?.["results"] as Array<{ path: string | null }>;
      expect(results.some((hit) => hit.path === "/src/auth.ts")).toBe(true);
    });
  });

  it("4. dependency relationship — auth imports math", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({
        name: "explain_repository",
        arguments: { question: "What is the dependency relationship between auth and math?" },
      });
      const relationships = structuredOf(result)?.["relationships"] as Array<{
        relation: string;
        fromLabel: string;
        toLabel: string;
      }>;
      expect(relationships.some((edge) => edge.relation === "imports")).toBe(true);
    });
  });

  it("5. impact analysis — changing math.ts affects auth.ts", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({
        name: "impact_analysis",
        arguments: { paths: ["/src/math.ts"] },
      });
      const affected = structuredOf(result)?.["affected"] as Array<{ path: string }>;
      expect(affected.map((node) => node.path)).toContain("/src/auth.ts");
    });
  });

  it("7. empty result — an unknown term returns no hits, not an error", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({
        name: "search_repository",
        arguments: { query: "quantum-telemetry-xyz" },
      });
      expect(isErrorResult(result)).toBe(false);
      const structured = structuredOf(result);
      expect(structured?.["total"]).toBe(0);
      expect(structured?.["results"]).toEqual([]);
    });
  });

  it("8. malformed request — a wrong argument type is rejected", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({
        name: "search_repository",
        arguments: { query: "login", limit: "lots" },
      });
      expect(isErrorResult(result)).toBe(true);
      expect(textOf(result)).toMatch(/invalid/i);
    });
  });

  it("10. sensitive file access — a denied file never returns content", async () => {
    const base = standardData();
    const data = {
      ...base,
      files: [
        ...(base.files ?? []),
        fixtureFile("/src/secrets.json", '{"apiKey":"SUPER_SECRET_VALUE"}', "json"),
      ],
    };
    const fixture = createFixture(data);
    await withConnection(
      async ({ client }) => {
        const result = await client.callTool({
          name: "get_context",
          arguments: { target: "src/secrets.json", kind: "file" },
        });
        expect(isErrorResult(result)).toBe(true);
        expect(textOf(result)).not.toContain("SUPER_SECRET");
        expect(JSON.stringify(structuredOf(result) ?? {})).not.toContain("SUPER_SECRET");
      },
      {},
      fixture,
    );
  });
});

describe("required test prompts — no index", () => {
  function emptyRoot(): string {
    return mkdtempSync(join(tmpdir(), "atlas-chatgpt-empty-"));
  }

  it("6. unknown repository — 'Analyze this repository' fails honestly", async () => {
    const root = emptyRoot();
    const { client, close } = await connect(root);
    try {
      const result = await client.callTool({ name: "analyze_repository", arguments: {} });
      expect(isErrorResult(result)).toBe(true);
      expect(textOf(result)).toMatch(/No context index found/);
    } finally {
      await close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("9. unavailable backend/index — reads fail with a clear error", async () => {
    const root = emptyRoot();
    const { client, close } = await connect(root);
    try {
      const result = await client.callTool({
        name: "get_context",
        arguments: { target: "double" },
      });
      expect(isErrorResult(result)).toBe(true);
      expect(textOf(result)).toMatch(/No context index found/);
    } finally {
      await close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/** Connect a bare client (no fixture) to a server rooted at `root`. */
async function connect(root: string): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = createChatGptServer({ root, logger: silentLogger() });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "prompt-test", version: "0.0.0" }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await server.close();
      await client.close();
    },
  };
}
