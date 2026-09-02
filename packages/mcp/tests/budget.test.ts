import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { ToolCallBudget, createToolCallBudget, readBudgetConfigFromEnv } from "../src/budget";
import { createMcpServer } from "../src/server";
import { createFixture, silentLogger } from "./fixture";

describe("ToolCallBudget", () => {
  it("is unlimited by default (no behavior change)", () => {
    const b = new ToolCallBudget();
    for (let i = 0; i < 1000; i++) {
      expect(b.check("read_file_range")).toEqual({ allowed: true });
      b.record("read_file_range", 100);
    }
    expect(b.exhausted).toBe(false);
    expect(b.snapshot().totalCalls).toBe(1000);
  });

  it("caps total calls across all tools", () => {
    const b = new ToolCallBudget({ maxTotalCalls: 3 });
    expect(b.check("search_files")).toEqual({ allowed: true });
    b.record("search_files", 10);
    b.record("search_files", 10);
    b.record("search_files", 10);
    const res = b.check("search_files");
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/tool-call budget exhausted/);
    expect(res.limit).toEqual({ tool: "search_files", kind: "total" });
  });

  it("caps read_file_range independently", () => {
    const b = new ToolCallBudget({ maxReadRangeCalls: 2 });
    expect(b.check("read_file_range").allowed).toBe(true);
    b.record("read_file_range", 1000);
    expect(b.check("read_file_range").allowed).toBe(true);
    b.record("read_file_range", 1000);
    const res = b.check("read_file_range");
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/read_file_range call budget exhausted/);
    expect(res.limit).toEqual({ tool: "read_file_range", kind: "per-tool" });
    // other tools unaffected
    expect(b.check("search_files").allowed).toBe(true);
  });

  it("per-tool override takes precedence", () => {
    const b = new ToolCallBudget({ maxPerTool: { search_files: 1 } });
    b.record("search_files", 10);
    expect(b.check("search_files").allowed).toBe(false);
  });

  it("accumulates per-tool byte attribution", () => {
    const b = new ToolCallBudget({ maxReadRangeCalls: 5 });
    b.record("read_file_range", 482);
    b.record("read_file_range", 518);
    b.record("search_files", 300);
    const snap = b.snapshot();
    expect(snap.totalCalls).toBe(3);
    expect(snap.perTool["read_file_range"]).toEqual({ calls: 2, bytes: 1000 });
    expect(snap.perTool["search_files"]).toEqual({ calls: 1, bytes: 300 });
  });
});

describe("readBudgetConfigFromEnv", () => {
  it("parses positive integers", () => {
    expect(
      readBudgetConfigFromEnv({
        ATLAS_MCP_MAX_TOOL_CALLS: "5",
        ATLAS_MCP_MAX_READ_RANGE_CALLS: "3",
      }),
    ).toEqual({ maxTotalCalls: 5, maxReadRangeCalls: 3 });
  });

  it("ignores invalid / non-positive values", () => {
    expect(
      readBudgetConfigFromEnv({
        ATLAS_MCP_MAX_TOOL_CALLS: "0",
        ATLAS_MCP_MAX_READ_RANGE_CALLS: "abc",
      }),
    ).toEqual({ maxTotalCalls: undefined, maxReadRangeCalls: undefined });
  });

  it("treats empty/missing as unlimited", () => {
    expect(readBudgetConfigFromEnv({})).toEqual({
      maxTotalCalls: undefined,
      maxReadRangeCalls: undefined,
    });
  });

  it("createToolCallBudget wires env config through", () => {
    const b = createToolCallBudget({ ATLAS_MCP_MAX_READ_RANGE_CALLS: "1" });
    expect(b.check("read_file_range").allowed).toBe(true);
    b.record("read_file_range", 1);
    expect(b.check("read_file_range").allowed).toBe(false);
  });
});

/** Drive the budget end-to-end through the MCP server's runTool choke point. */
describe("budget end-to-end via MCP server", () => {
  /**
   * Helper: build a live MCP server in the given env, connected to a local
   * MCP client over in-memory transport. This exercises the exact runTool path
   * that opencod / kilo / browser-benchmark agents funnel every tool call
   * through, with the per-session ToolCallBudget enforced before the handler.
   */
  async function withBudgetServer<T>(
    _env: Record<string, string>,
    fn: (client: Client) => Promise<T>,
  ): Promise<T> {
    const root = createFixture();
    const mcp = createMcpServer({ root: root.root, logger: silentLogger() });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "budget-e2e", version: "0.0.0" }, { capabilities: {} });
    await mcp.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      return await fn(client);
    } finally {
      await client.close();
      await mcp.close();
      root.cleanup();
    }
  }

  it("rejects a second tool call once the env cap is hit (opencod / kilo path)", async () => {
    process.env["ATLAS_MCP_MAX_TOOL_CALLS"] = "1";
    try {
      await withBudgetServer({}, async (client) => {
        // First call within the cap is allowed and the handler runs.
        const ok = await client.callTool({
          name: "search_symbols",
          arguments: { query: "double", limit: 5 },
        });
        expect(ok.isError).toBeUndefined();
        expect(ok.isError).not.toBe(true);

        // Second call exceeds the cap: rejected *before* the handler, with a
        // machine-checkable isError result — not a thrown exception or a silent
        // drop. This is the boundary that stops a 19× read_file_range thrash.
        const rejected = await client.callTool({
          name: "search_symbols",
          arguments: { query: "login", limit: 5 },
        });
        expect(rejected.isError).toBe(true);
        const text =
          (rejected.content as { type: string; text: string }[] | undefined)?.[0]?.text ?? "";
        expect(text).toContain("tool-call budget exhausted");
        expect(text).toContain("1");
      });
    } finally {
      process.env["ATLAS_MCP_MAX_TOOL_CALLS"] = undefined;
    }
  });

  it("keeps the budget off by default so behaviour is unchanged (no env set)", async () => {
    const saved = process.env["ATLAS_MCP_MAX_TOOL_CALLS"];
    process.env["ATLAS_MCP_MAX_TOOL_CALLS"] = undefined;
    try {
      await withBudgetServer({}, async (client) => {
        for (let i = 0; i < 50; i++) {
          const r = await client.callTool({
            name: "search_symbols",
            arguments: { query: `q${i}`, limit: 1 },
          });
          expect(r.isError).not.toBe(true);
        }
      });
    } finally {
      if (saved !== undefined) process.env["ATLAS_MCP_MAX_TOOL_CALLS"] = saved;
    }
  });
});
