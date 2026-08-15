import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexProject } from "@atlas/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { type CodeAtlasMcpServer, createMcpServer } from "../src/server";
import { TOOLS } from "../src/tools";
import { silentLogger } from "./fixture";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRepo(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

interface Connection {
  readonly mcp: CodeAtlasMcpServer;
  readonly client: Client;
}

async function connectTo(root: string): Promise<Connection> {
  const mcp = createMcpServer({ root, logger: silentLogger() });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "mcp-hardening", version: "0.0.0" }, { capabilities: {} });
  await mcp.connect(serverTransport);
  await client.connect(clientTransport);
  return { mcp, client };
}

async function closeConnection(conn: Connection): Promise<void> {
  await conn.mcp.close();
  await conn.client.close();
}

function textOf(result: unknown): string {
  if (typeof result !== "object" || result === null) {
    return "";
  }
  const content = (result as { content?: { type: string; text: string }[] }).content;
  return content?.[0]?.text ?? "";
}

/** Try to create a symlink; returns false on platforms that refuse (e.g. Windows without
 *  Developer Mode / admin privileges). Tests that need symlinks are skipped then. */
async function symlinksWork(): Promise<boolean> {
  try {
    const root = await tempRepo("atlas-mcp-symlink-probe-");
    const target = join(root, "target.txt");
    const link = join(root, "link.txt");
    await writeFile(target, "probe");
    await symlink(target, link);
    await rm(root, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

describe("MCP security hardening", () => {
  it("never serves content through a symlink that points outside the repository", async () => {
    const canSymlink = await symlinksWork();
    if (!canSymlink) {
      return;
    }
    const repoRoot = await tempRepo("atlas-mcp-symlink-repo-");
    const outsideDir = await tempRepo("atlas-mcp-symlink-outside-");
    const secretPath = join(outsideDir, "secret.ts");
    await writeFile(secretPath, "export const TOP_SECRET_VALUE = 12345;\n");
    const linkPath = join(repoRoot, "linked-secret.ts");
    await symlink(secretPath, linkPath);

    const index = await indexProject({ repositoryPath: repoRoot, mode: "build" });
    expect(index.ok).toBe(true);
    if (!index.ok) return;

    const conn = await connectTo(repoRoot);
    try {
      const files = await conn.client.callTool({
        name: "search_files",
        arguments: { query: "TOP_SECRET_VALUE", limit: 10 },
      });
      expect(files.isError).not.toBe(true);
      const structured = files.structuredContent as { hits: Array<{ path: string }> };
      expect(structured.hits).toHaveLength(0);

      const read = await conn.client.callTool({
        name: "read_file_range",
        arguments: { path: linkPath, startLine: 1, endLine: 3 },
      });
      expect(read.isError).toBe(true);
      expect(JSON.stringify(read)).not.toContain("TOP_SECRET_VALUE");
    } finally {
      await closeConnection(conn);
    }
  });

  it("rejects a path longer than the input schema bound", async () => {
    const root = await tempRepo("atlas-mcp-huge-path-");
    const index = await indexProject({ repositoryPath: root, mode: "build" });
    expect(index.ok).toBe(true);
    if (!index.ok) return;

    const conn = await connectTo(root);
    try {
      const result = await conn.client.callTool({
        name: "read_file_range",
        arguments: { path: `src/${"a".repeat(20_000)}.ts`, startLine: 1, endLine: 5 },
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("Invalid arguments");
    } finally {
      await closeConnection(conn);
    }
  });

  it("rejects limit values outside the declared range for search tools", async () => {
    const root = await tempRepo("atlas-mcp-bad-limit-");
    const index = await indexProject({ repositoryPath: root, mode: "build" });
    expect(index.ok).toBe(true);
    if (!index.ok) return;

    const conn = await connectTo(root);
    try {
      for (const limit of [0, -1, 101]) {
        const result = await conn.client.callTool({
          name: "search_symbols",
          arguments: { query: "anything", limit },
        });
        expect(result.isError, `limit=${limit}`).toBe(true);
        expect(textOf(result)).toContain("Invalid arguments");
      }
    } finally {
      await closeConnection(conn);
    }
  });
});

describe("MCP behavior with empty and unsupported repositories", () => {
  it("serves tools and returns empty results for a repo with only unsupported files", async () => {
    const root = await tempRepo("atlas-mcp-unsupported-");
    await writeFile(join(root, "data.bin"), "\u0000\u0001\u0002");
    await writeFile(join(root, "style.css"), "body { color: red; }");
    await writeFile(join(root, "notes.txt"), "plain text");

    const index = await indexProject({ repositoryPath: root, mode: "build" });
    expect(index.ok).toBe(true);
    if (!index.ok) return;

    const conn = await connectTo(root);
    try {
      const overview = await conn.client.callTool({ name: "project_overview", arguments: {} });
      expect(overview.isError).not.toBe(true);
      const counts = (overview.structuredContent as { counts: { files: number } }).counts;
      expect(counts.files).toBe(0);

      const symbols = await conn.client.callTool({
        name: "search_symbols",
        arguments: { query: "anything" },
      });
      expect(symbols.isError).not.toBe(true);
      expect((symbols.structuredContent as { hits: unknown[] }).hits).toHaveLength(0);

      const files = await conn.client.callTool({
        name: "search_files",
        arguments: { query: "anything" },
      });
      expect(files.isError).not.toBe(true);
      expect((files.structuredContent as { hits: unknown[] }).hits).toHaveLength(0);
    } finally {
      await closeConnection(conn);
    }
  });

  it("serves tools and returns empty results for a README-only repository", async () => {
    const root = await tempRepo("atlas-mcp-readme-");
    await writeFile(join(root, "README.md"), "# Readme only");

    const index = await indexProject({ repositoryPath: root, mode: "build" });
    expect(index.ok).toBe(true);
    if (!index.ok) return;

    const conn = await connectTo(root);
    try {
      const overview = await conn.client.callTool({ name: "project_overview", arguments: {} });
      expect(overview.isError).not.toBe(true);
      const counts = (overview.structuredContent as { counts: { files: number } }).counts;
      expect(counts.files).toBe(0);
    } finally {
      await closeConnection(conn);
    }
  });

  it("serves tools and returns empty results for a config-only repository", async () => {
    const root = await tempRepo("atlas-mcp-config-");
    await mkdir(join(root, "config"), { recursive: true });
    await writeFile(join(root, "package.json"), '{"name": "demo"}');
    await writeFile(join(root, "tsconfig.json"), '{"compilerOptions": {}}');

    const index = await indexProject({ repositoryPath: root, mode: "build" });
    expect(index.ok).toBe(true);
    if (!index.ok) return;

    const conn = await connectTo(root);
    try {
      const overview = await conn.client.callTool({ name: "project_overview", arguments: {} });
      expect(overview.isError).not.toBe(true);
      const counts = (overview.structuredContent as { counts: { files: number } }).counts;
      expect(counts.files).toBe(0);
    } finally {
      await closeConnection(conn);
    }
  });

  it("serves tools and returns empty results for a repository with no TypeScript", async () => {
    const root = await tempRepo("atlas-mcp-no-ts-");
    await writeFile(join(root, "main.py"), "print('hello')\n");
    await writeFile(join(root, "app.rb"), "puts 'hi'\n");

    const index = await indexProject({ repositoryPath: root, mode: "build" });
    expect(index.ok).toBe(true);
    if (!index.ok) return;

    const conn = await connectTo(root);
    try {
      const overview = await conn.client.callTool({ name: "project_overview", arguments: {} });
      expect(overview.isError).not.toBe(true);
      const counts = (overview.structuredContent as { counts: { files: number } }).counts;
      expect(counts.files).toBe(0);
    } finally {
      await closeConnection(conn);
    }
  });
});

describe("MCP output schema conformance", () => {
  it("produces structuredContent that matches each tool's declared output schema", async () => {
    const root = await tempRepo("atlas-mcp-schema-");
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(
      join(root, "src", "app.ts"),
      "export function double(x: number) { return x * 2; }\n",
    );
    const index = await indexProject({ repositoryPath: root, mode: "build" });
    expect(index.ok).toBe(true);
    if (!index.ok) return;

    const conn = await connectTo(root);
    try {
      const appPath = join(root, "src", "app.ts");
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [
        { name: "search_symbols", args: { query: "double" } },
        { name: "search_files", args: { query: "app.ts" } },
        { name: "get_summary", args: { target: appPath } },
        { name: "get_dependencies", args: {} },
        { name: "explain_module", args: { path: join(root, "src") } },
        { name: "project_overview", args: { detail: "full" } },
        { name: "read_file_range", args: { path: appPath, startLine: 1, endLine: 5 } },
      ];

      for (const call of calls) {
        const result = await conn.client.callTool({ name: call.name, arguments: call.args });
        expect(result.isError, `tool=${call.name}`).not.toBe(true);

        const tool = TOOLS.find((entry) => entry.name === call.name);
        expect(tool, `schema for ${call.name}`).toBeDefined();
        if (tool === undefined) continue;

        const schema = z.object(tool.outputSchema);
        const parsed = schema.safeParse(result.structuredContent);
        expect(parsed.success, `tool=${call.name}`).toBe(true);
        if (!parsed.success) {
          throw new Error(
            `structuredContent for ${call.name} did not match its outputSchema: ${parsed.error.message}`,
          );
        }
      }
    } finally {
      await closeConnection(conn);
    }
  });
});
