import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { type CodeAtlasMcpServer, createMcpServer } from "../src/server";
import { TOOL_NAMES } from "../src/tools";
import { type Fixture, createFixture, silentLogger } from "./fixture";

interface TestConnection {
  readonly mcp: CodeAtlasMcpServer;
  readonly client: Client;
  cleanup(): Promise<void>;
}

/** Start a real MCP client connected to the server over an in-memory transport. */
async function connectTo(fx: Fixture): Promise<TestConnection> {
  const mcp = createMcpServer({ root: fx.root, logger: silentLogger() });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
  await mcp.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    mcp,
    client,
    cleanup: async () => {
      await mcp.close();
      await client.close();
    },
  };
}

async function withConnection(fn: (conn: TestConnection) => Promise<void>): Promise<void> {
  const fx = createFixture();
  const conn = await connectTo(fx);
  try {
    await fn(conn);
  } finally {
    await conn.cleanup();
    fx.cleanup();
  }
}

/** Concatenate the text blocks of a call tool result (tolerates union shapes). */
function textOf(result: unknown): string {
  if (typeof result !== "object" || result === null) {
    return "";
  }
  const content = (result as { content?: readonly unknown[] }).content ?? [];
  return content.map((block) => (isTextBlock(block) ? block.text : "")).join("\n");
}

function isTextBlock(block: unknown): block is { readonly type: "text"; readonly text: string } {
  return (
    typeof block === "object" && block !== null && (block as { type?: unknown }).type === "text"
  );
}

describe("MCP server protocol", () => {
  it("advertises exactly the seven tools over tools/list", async () => {
    await withConnection(async ({ client }) => {
      const { tools } = await client.listTools();
      const names = tools.map((tool) => tool.name).sort();
      expect(names).toEqual([...TOOL_NAMES].sort());
      for (const tool of tools) {
        expect(tool.description ?? "").not.toHaveLength(0);
        expect(tool.inputSchema).toBeDefined();
      }
    });
  });

  it("calls project_overview and returns structured counts", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({ name: "project_overview", arguments: {} });
      const structured = result.structuredContent as Record<string, unknown>;
      expect(structured["counts"]).toMatchObject({
        files: 3,
        symbols: 3,
        modules: 1,
        dependencies: 2,
      });
    });
  });

  it("calls search_symbols and returns ranked hits", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({
        name: "search_symbols",
        arguments: { query: "double" },
      });
      const structured = result.structuredContent as Record<string, unknown>;
      expect(structured["total"]).toBeGreaterThan(0);
    });
  });

  it("returns a non-error result for a missing stored summary", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({
        name: "get_summary",
        arguments: { target: "/src/nope.ts" },
      });
      expect(result.isError).not.toBe(true);
      const structured = result.structuredContent as Record<string, unknown>;
      expect(structured["found"]).toBe(false);
    });
  });

  it("reports an unknown tool as an isError result", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({ name: "no_such_tool", arguments: {} });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
      expect(textOf(result)).toContain("no_such_tool");
    });
  });

  it("reports invalid arguments via schema validation", async () => {
    await withConnection(async ({ client }) => {
      const result = await client.callTool({ name: "search_symbols", arguments: {} });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("Invalid arguments");
    });
  });

  it("returns an isError result when no context index exists", async () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-mcp-server-empty-"));
    const mcp = createMcpServer({ root, logger: silentLogger() });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    try {
      await mcp.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({ name: "project_overview", arguments: {} });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("No context index found");
    } finally {
      await mcp.close();
      await client.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns an isError result and keeps the protocol alive for a corrupted index", async () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-mcp-server-corrupt-"));
    mkdirSync(join(root, ".codeatlas"), { recursive: true });
    writeFileSync(join(root, ".codeatlas", "context.db"), "not a sqlite database", "utf8");
    const mcp = createMcpServer({ root, logger: silentLogger() });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    try {
      await mcp.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({ name: "project_overview", arguments: {} });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
      expect(textOf(result).length).toBeGreaterThan(0);

      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort());
    } finally {
      await mcp.close();
      await client.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
