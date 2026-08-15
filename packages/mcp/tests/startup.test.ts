import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION, createProjectContainer } from "@atlas/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/log";
import { type CodeAtlasMcpServer, createMcpServer } from "../src/server";
import { TOOL_NAMES } from "../src/tools";
import { silentLogger } from "./fixture";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function tempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

/** Write a minimal but real context database at <root>/.codeatlas/context.db. */
function seedIndex(root: string): string {
  const dbPath = join(root, ".codeatlas", "context.db");
  mkdirSync(join(root, ".codeatlas"), { recursive: true });
  const container = createProjectContainer(dbPath);
  try {
    container.getContextDb().saveContext({
      files: [
        {
          path: "/src/math.ts" as never,
          language: "typescript",
          content: "export function double(x: number) { return x * 2; }",
        },
      ],
    });
  } finally {
    container.getContextDb().close();
  }
  return dbPath;
}

async function connectTo(
  root: string,
  options: { dbPath?: string } = {},
): Promise<{
  readonly mcp: CodeAtlasMcpServer;
  readonly client: Client;
  cleanup(): Promise<void>;
}> {
  const mcp = createMcpServer({
    root,
    ...(options.dbPath === undefined ? {} : { dbPath: options.dbPath }),
    logger: silentLogger(),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "startup-test", version: "0.0.0" }, { capabilities: {} });
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

describe("MCP startup behavior", () => {
  it("serves tools/list and a clean handshake before any index exists", async () => {
    const root = tempRoot("atlas-mcp-start-empty-");
    const conn = await connectTo(root);
    try {
      const info = await conn.client.getServerVersion();
      expect(info?.name).toBe("codeatlas");
      expect(info?.version).toBe(VERSION);

      const { tools } = await conn.client.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort());
      for (const tool of tools) {
        expect(tool.description ?? "").not.toHaveLength(0);
        expect(tool.inputSchema.type).toBe("object");
      }
    } finally {
      await conn.cleanup();
    }
  });

  it("becomes ready on the same live connection once the index appears", async () => {
    const root = tempRoot("atlas-mcp-start-lazy-");
    const conn = await connectTo(root);
    try {
      const before = await conn.client.callTool({ name: "project_overview", arguments: {} });
      expect(before.isError).toBe(true);
      const beforeText = (
        (before.content as { type: string; text: string }[] | undefined)?.[0]?.text ?? ""
      ).replace(/\\n/g, "\n");
      expect(beforeText).toContain("No context index found");

      seedIndex(root);

      const after = await conn.client.callTool({ name: "project_overview", arguments: {} });
      expect(after.isError).not.toBe(true);
      const counts = after.structuredContent as { counts: { files: number } };
      expect(counts.counts.files).toBeGreaterThanOrEqual(1);
    } finally {
      await conn.cleanup();
    }
  });

  it("reads context from an explicit external dbPath at startup", async () => {
    const root = tempRoot("atlas-mcp-start-external-root-");
    const dbRoot = tempRoot("atlas-mcp-start-external-db-");
    const dbPath = seedIndex(dbRoot);

    const conn = await connectTo(root, { dbPath });
    try {
      const result = await conn.client.callTool({ name: "project_overview", arguments: {} });
      expect(result.isError).not.toBe(true);
      const counts = result.structuredContent as { counts: { files: number } };
      expect(counts.counts.files).toBe(1);
    } finally {
      await conn.cleanup();
    }
  });

  it("is safe to close before connecting and idempotent to close twice", async () => {
    const root = tempRoot("atlas-mcp-start-close-");
    const mcp = createMcpServer({ root, logger: silentLogger() });
    await mcp.close();
    await mcp.close();
    expect(mcp.context.isOpen).toBe(false);
  });
});

describe("MCP logger", () => {
  it("writes every line to the configured stream only, filtered by level", () => {
    const write = vi.fn();
    const logger = createLogger({
      level: "info",
      stream: { write } as unknown as NodeJS.WritableStream,
    });

    logger.debug("debug-hidden");
    logger.info("info-shown");
    logger.warn("warn-shown");
    logger.error("error-shown", new Error("boom"));

    const written = write.mock.calls.map((call) => String(call[0])).join("");
    expect(written).not.toContain("debug-hidden");
    expect(written).toContain("[atlas-mcp] info info-shown");
    expect(written).toContain("[atlas-mcp] warn warn-shown");
    expect(written).toContain("[atlas-mcp] error error-shown");
    expect(written).toContain("boom");
  });

  it("defaults the level from ATLAS_MCP_LOG_LEVEL and lets an explicit level win", () => {
    const previous = process.env["ATLAS_MCP_LOG_LEVEL"];
    try {
      process.env["ATLAS_MCP_LOG_LEVEL"] = "error";
      const envWrite = vi.fn();
      const fromEnv = createLogger({
        stream: { write: envWrite } as unknown as NodeJS.WritableStream,
      });
      fromEnv.info("env-info");
      fromEnv.error("env-error");
      const envWritten = envWrite.mock.calls.map((call) => String(call[0])).join("");
      expect(envWritten).not.toContain("env-info");
      expect(envWritten).toContain("env-error");

      const explicitWrite = vi.fn();
      const explicit = createLogger({
        level: "debug",
        stream: { write: explicitWrite } as unknown as NodeJS.WritableStream,
      });
      explicit.debug("explicit-debug");
      expect(explicitWrite.mock.calls.map((call) => String(call[0])).join("")).toContain(
        "explicit-debug",
      );
    } finally {
      if (previous === undefined) {
        // biome-ignore lint/performance/noDelete: truly unset the env var; assigning undefined throws in Node >= 20.
        delete process.env["ATLAS_MCP_LOG_LEVEL"];
      } else {
        process.env["ATLAS_MCP_LOG_LEVEL"] = previous;
      }
    }
  });
});

// ── End-to-end stdio subprocess test against the built binary ────────────────

interface JsonRpcMessage {
  readonly jsonrpc: "2.0";
  readonly id?: number;
  readonly method?: string;
  readonly result?: Record<string, unknown>;
  readonly error?: { readonly code: number; readonly message: string };
}

/** Read newline-delimited JSON-RPC messages from a stream. */
class LineReader {
  private buffer = "";
  private readonly waiting: Array<(message: JsonRpcMessage) => void> = [];

  public constructor(stream: NodeJS.ReadableStream) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.drain();
    });
  }

  public next(): Promise<JsonRpcMessage> {
    return new Promise((resolve) => {
      this.waiting.push(resolve);
      this.drain();
    });
  }

  private drain(): void {
    for (;;) {
      const newline = this.buffer.indexOf("\n");
      if (newline === -1) return;
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      if (line.trim().length === 0) continue;
      const message = JSON.parse(line) as JsonRpcMessage;
      const resolve = this.waiting.shift();
      if (resolve !== undefined) resolve(message);
    }
  }
}

/** The MCP stdio transport frames messages as newline-delimited JSON. */
function frame(message: object): string {
  return `${JSON.stringify(message)}\n`;
}

describe("MCP stdio binary (built dist/bin.js)", () => {
  it("starts, negotiates, serves tools, rejects without an index, and exits cleanly", async () => {
    const root = tempRoot("atlas-mcp-start-bin-");
    const binPath = fileURLToPath(new URL("../dist/bin.js", import.meta.url));

    const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [binPath], {
      env: { ...process.env, ATLAS_ROOT: root, ATLAS_MCP_LOG_LEVEL: "info" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    let stdoutRaw = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutRaw += chunk;
    });
    const reader = new LineReader(child.stdout);

    const exitPromise = new Promise<number>((resolve, reject) => {
      const watchdog = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("binary did not exit within the watchdog"));
      }, 30_000);
      child.once("exit", (code) => {
        clearTimeout(watchdog);
        resolve(code ?? -1);
      });
    });

    try {
      child.stdin.write(
        frame({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "startup-test", version: "0.0.0" },
          },
        }),
      );
      const initialize = await reader.next();
      expect(initialize.error).toBeUndefined();
      const serverInfo = initialize.result?.["serverInfo"] as { name?: string; version?: string };
      expect(serverInfo.name).toBe("codeatlas");
      expect(serverInfo.version).toBe(VERSION);

      child.stdin.write(frame({ jsonrpc: "2.0", method: "notifications/initialized" }));
      child.stdin.write(frame({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }));
      const listed = await reader.next();
      const toolNames = ((listed.result?.["tools"] ?? []) as Array<{ name: string }>)
        .map((tool) => tool.name)
        .sort();
      expect(toolNames).toEqual([...TOOL_NAMES].sort());

      child.stdin.write(
        frame({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "project_overview", arguments: {} },
        }),
      );
      const called = await reader.next();
      const callResult = called.result as {
        isError?: boolean;
        content?: { type: string; text: string }[];
      };
      expect(callResult.isError).toBe(true);
      const errorText = callResult.content?.[0]?.text ?? "";
      expect(errorText).toContain("No context index found");

      child.stdin.write(frame({ jsonrpc: "2.0", id: 4, method: "shutdown", params: {} }));
      const shutdownResponse = await reader.next();
      // Documented behavior: the shutdown request is not registered by the
      // server (responds -32601); clients terminate by closing stdin instead.
      expect(shutdownResponse.id).toBe(4);
      child.stdin.end();
    } catch (error) {
      child.kill("SIGKILL");
      throw error;
    }

    const code = await exitPromise;
    expect(code).toBe(0);

    expect(stderr).toContain("CodeAtlas MCP server ready");
    expect(stderr).toContain(join(root, ".codeatlas", "context.db"));

    // stdout must carry protocol messages only: every non-empty line is JSON.
    const nonEmptyLines = stdoutRaw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    expect(nonEmptyLines.length).toBeGreaterThan(0);
    for (const line of nonEmptyLines) {
      expect(() => JSON.parse(line), `stdout polluted with non-JSON: ${line}`).not.toThrow();
    }
  }, 60_000);
});
