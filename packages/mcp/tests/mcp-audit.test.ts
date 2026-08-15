import { cp, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createContextSDK, indexProject } from "@atlas/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { type CodeAtlasMcpServer, createMcpServer } from "../src/server";
import { TOOL_NAMES } from "../src/tools";
import { silentLogger } from "./fixture";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const auditFixture = join(repoRoot, "tests", "fixtures", "mcp-audit-repo");
const tempRoots: string[] = [];

interface ConnectedAuditRepo {
  readonly root: string;
  readonly mcp: CodeAtlasMcpServer;
  readonly client: Client;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function copyAuditRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "atlas-mcp-audit-"));
  tempRoots.push(root);
  await cp(auditFixture, root, { recursive: true });
  return root;
}

async function buildAuditRepo(): Promise<string> {
  const root = await copyAuditRepo();
  const result = await indexProject({ repositoryPath: root, mode: "build" });
  expect(result.ok).toBe(true);
  return root;
}

async function connectAuditRepo(): Promise<ConnectedAuditRepo> {
  const root = await buildAuditRepo();
  const mcp = createMcpServer({ root, logger: silentLogger() });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "mcp-audit-test", version: "0.0.0" }, { capabilities: {} });
  await mcp.connect(serverTransport);
  await client.connect(clientTransport);
  return { root, mcp, client };
}

async function closeConnection(conn: ConnectedAuditRepo): Promise<void> {
  await conn.mcp.close();
  await conn.client.close();
}

function structured<T extends Record<string, unknown>>(result: unknown): T {
  return (result as { structuredContent: T }).structuredContent;
}

function textOf(result: unknown): string {
  if (typeof result !== "object" || result === null) {
    return "";
  }
  const content = (result as { content?: { type: string; text: string }[] }).content;
  return content?.[0]?.text ?? "";
}

describe("MCP audit fixture", () => {
  it("indexes the dedicated audit repo with realistic symbols and dependencies", async () => {
    const root = await buildAuditRepo();
    const sdk = createContextSDK({ repositoryPath: root });
    try {
      const overview = sdk.project.overview("full");
      expect(overview.counts.files).toBeGreaterThanOrEqual(15);
      expect(overview.counts.symbols).toBeGreaterThanOrEqual(50);
      expect(overview.counts.dependencies).toBeGreaterThan(0);
      expect(overview.languages["typescript"]).toBe(overview.counts.files);
      expect(sdk.symbols.searchSymbols("authenticateUser")[0]?.title).toBe("authenticateUser");
      expect(sdk.symbols.searchSymbols("validatePayment")[0]?.title).toBe("validatePayment");
      expect(
        sdk.dependencies.query({ node: join(root, "src", "auth", "cycle-a.ts") }).edges.length,
      ).toBeGreaterThan(0);
      expect(sdk.files.searchFiles("generatedButIgnored")).toHaveLength(0);
      expect(sdk.files.searchFiles("sk_test_fake_decoy_for_audit_only")).toHaveLength(0);
      expect(sdk.files.searchFiles("LOCAL_STRIPE_KEY")).toHaveLength(0);
    } finally {
      sdk.close();
    }
  });

  it("excludes .gitignore pattern files that are not default ignored directories", async () => {
    const root = await copyAuditRepo();
    await writeFile(
      join(root, ".env"),
      "ATLAS_FAKE_GITIGNORED_KEY=sk_fake_gitignored_for_audit_only",
    );
    await writeFile(join(root, "debug.log"), "DEBUG_LOG_FIXTURE_ENTRY");

    const result = await indexProject({ repositoryPath: root, mode: "build" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sdk = createContextSDK({ repositoryPath: root });
    try {
      expect(sdk.files.searchFiles("ATLAS_FAKE_GITIGNORED_KEY", { limit: 5 })).toHaveLength(0);
      expect(sdk.files.searchFiles("DEBUG_LOG_FIXTURE_ENTRY", { limit: 5 })).toHaveLength(0);
      expect(sdk.files.searchFiles(".env", { limit: 5 })).toHaveLength(0);
      expect(sdk.files.searchFiles("debug.log", { limit: 5 })).toHaveLength(0);
    } finally {
      sdk.close();
    }
  });

  it("advertises valid tool schemas and supports core agent workflows", async () => {
    const conn = await connectAuditRepo();
    try {
      const listed = await conn.client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort());
      for (const tool of listed.tools) {
        expect(tool.description).toEqual(expect.any(String));
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.outputSchema).toBeDefined();
        expect(tool.outputSchema?.type).toBe("object");
        expect(Object.keys(tool.outputSchema?.properties ?? {}).length).toBeGreaterThan(0);
      }

      const authSearch = structured<{ hits: Array<{ name: string; path: string }> }>(
        await conn.client.callTool({
          name: "search_symbols",
          arguments: { query: "authenticateUser", kind: "method", limit: 5 },
        }),
      );
      expect(authSearch.hits[0]?.name).toBe("authenticateUser");
      expect(authSearch.hits[0]?.path).toContain(join("src", "auth", "auth-service.ts"));

      const paymentFiles = structured<{ hits: Array<{ path: string }> }>(
        await conn.client.callTool({
          name: "search_files",
          arguments: { query: "payment validation", limit: 5 },
        }),
      );
      expect(paymentFiles.hits.some((hit) => hit.path.includes("payment-validator.ts"))).toBe(true);

      const module = structured<{ fileCount: number; symbolCount: number }>(
        await conn.client.callTool({
          name: "explain_module",
          arguments: { path: join(conn.root, "src", "auth") },
        }),
      );
      expect(module.fileCount).toBeGreaterThanOrEqual(4);
      expect(module.symbolCount).toBeGreaterThan(0);
    } finally {
      await closeConnection(conn);
    }
  });

  it("auto-refreshes the index before reads when the working tree changes", async () => {
    const conn = await connectAuditRepo();
    const authPath = join(conn.root, "src", "auth", "auth-service.ts");
    try {
      const before = structured<{ hits: Array<{ name: string }> }>(
        await conn.client.callTool({
          name: "search_symbols",
          arguments: { query: "authenticateUser", kind: "method" },
        }),
      );
      expect(before.hits[0]?.name).toBe("authenticateUser");

      const source = await readFile(authPath, "utf8");
      await writeFile(
        authPath,
        source
          .replaceAll("authenticateUser", "authenticateMember")
          .replace("bad-password", "bad-secret"),
      );

      const freshSearch = structured<{
        hits: Array<{ name: string }>;
        freshness: { state: string };
      }>(
        await conn.client.callTool({
          name: "search_symbols",
          arguments: { query: "authenticateMember", kind: "method" },
        }),
      );
      expect(freshSearch.hits[0]?.name).toBe("authenticateMember");
      expect(freshSearch.freshness.state).toBe("fresh");

      const range = structured<{ content: string; stale: boolean; versionMatch: boolean }>(
        await conn.client.callTool({
          name: "read_file_range",
          arguments: { path: authPath, startLine: 20, endLine: 36, padding: 0 },
        }),
      );
      expect(range.content).toContain("authenticateMember");
      expect(range.content).toContain("bad-secret");
      expect(range.stale).toBe(false);
      expect(range.versionMatch).toBe(true);
    } finally {
      if (conn.mcp.context.isOpen) {
        await closeConnection(conn);
      }
    }
  });

  it("detects added files and serves their symbols without an explicit update", async () => {
    const conn = await connectAuditRepo();
    const addedPath = join(conn.root, "src", "auth", "mfa.ts");
    try {
      const added = await writeFile(
        addedPath,
        `export function generateMfaChallenge(userId: string): string {
  return "challenge-" + userId;
}
export function verifyMfaCode(challenge: string, code: string): boolean {
  return challenge.endsWith(code);
}
`,
      );
      expect(added).toBeUndefined();

      const result = structured<{ hits: Array<{ name: string }>; freshness: { state: string } }>(
        await conn.client.callTool({
          name: "search_symbols",
          arguments: { query: "generateMfaChallenge", kind: "function" },
        }),
      );
      expect(result.hits[0]?.name).toBe("generateMfaChallenge");
      expect(result.freshness.state).toBe("fresh");
    } finally {
      if (conn.mcp.context.isOpen) {
        await closeConnection(conn);
      }
    }
  });

  it("reports stale state when auto-refresh is disabled", async () => {
    const root = await buildAuditRepo();
    const mcp = createMcpServer({ root, logger: silentLogger(), autoRefresh: false });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "mcp-audit-test", version: "0.0.0" }, { capabilities: {} });
    await mcp.connect(serverTransport);
    await client.connect(clientTransport);
    const conn = { root, mcp, client };
    const authPath = join(conn.root, "src", "auth", "auth-service.ts");
    try {
      const source = await readFile(authPath, "utf8");
      await writeFile(authPath, source.replaceAll("authenticateUser", "authenticateMember"));

      const staleSearch = structured<{
        hits: Array<{ name: string }>;
        freshness: { state: string };
      }>(
        await conn.client.callTool({
          name: "search_symbols",
          arguments: { query: "authenticateMember", kind: "method" },
        }),
      );
      expect(staleSearch.hits[0]?.name).toBe("authenticateUser");
      expect(staleSearch.freshness.state).toBe("unavailable");

      const update = await indexProject({ repositoryPath: conn.root, mode: "update" });
      expect(update.ok).toBe(true);

      await closeConnection(conn);
      const refreshed = await connectExistingAuditRepo(conn.root);
      try {
        const freshSearch = structured<{ hits: Array<{ name: string }> }>(
          await refreshed.client.callTool({
            name: "search_symbols",
            arguments: { query: "authenticateMember", kind: "method" },
          }),
        );
        expect(freshSearch.hits[0]?.name).toBe("authenticateMember");
      } finally {
        await closeConnection(refreshed);
      }
    } finally {
      if (conn.mcp.context.isOpen) {
        await closeConnection(conn);
      }
    }
  });

  it("drops the old symbol name after a rename through automatic refresh", async () => {
    // Regression test for the stale-search audit finding: after the working
    // tree renames a symbol, the *old* name must disappear from MCP search,
    // not just the new name appear.
    const conn = await connectAuditRepo();
    const authPath = join(conn.root, "src", "auth", "auth-service.ts");
    try {
      const source = await readFile(authPath, "utf8");
      await writeFile(authPath, source.replaceAll("authenticateUser", "authenticateMember"));

      const oldName = structured<{ hits: Array<{ name: string }>; freshness: { state: string } }>(
        await conn.client.callTool({
          name: "search_symbols",
          arguments: { query: "authenticateUser", kind: "method" },
        }),
      );
      // Fuzzy search may still surface the renamed symbol, but the *old* symbol
      // itself must no longer be present in the refreshed index.
      expect(oldName.hits.some((hit) => hit.name === "authenticateUser")).toBe(false);
      expect(oldName.freshness.state).toBe("fresh");

      const newName = structured<{ hits: Array<{ name: string }> }>(
        await conn.client.callTool({
          name: "search_symbols",
          arguments: { query: "authenticateMember", kind: "method" },
        }),
      );
      expect(newName.hits[0]?.name).toBe("authenticateMember");
    } finally {
      if (conn.mcp.context.isOpen) {
        await closeConnection(conn);
      }
    }
  });

  it("detects deleted files through automatic refresh and drops their symbols", async () => {
    const conn = await connectAuditRepo();
    const deletedPath = join(conn.root, "src", "auth", "password-reset.ts");
    try {
      await unlink(deletedPath);

      const gone = structured<{ hits: Array<{ name: string }>; freshness: { state: string } }>(
        await conn.client.callTool({
          name: "search_symbols",
          arguments: { query: "createResetToken", kind: "method" },
        }),
      );
      expect(gone.hits).toHaveLength(0);
      expect(gone.freshness.state).toBe("fresh");

      const overview = structured<{ counts: { files: number } }>(
        await conn.client.callTool({ name: "project_overview", arguments: { detail: "summary" } }),
      );
      // 30 indexed TypeScript files in the fixture, minus the deleted one.
      expect(overview.counts.files).toBe(29);
    } finally {
      if (conn.mcp.context.isOpen) {
        await closeConnection(conn);
      }
    }
  });

  it("reflects an A-to-C dependency rewrite through get_dependencies without an explicit update", async () => {
    // P1-9 gap: a rewrite that *changes* a dependency target (A now depends on
    // C instead of B) must be picked up by the automatic freshness path and
    // surfaced through the get_dependencies MCP tool.
    const conn = await connectAuditRepo();
    const authPath = join(conn.root, "src", "auth", "auth-service.ts");
    try {
      const source = await readFile(authPath, "utf8");
      const rewritten = source
        .replace(
          'import { PasswordResetService } from "./password-reset";',
          'import { EmailService } from "../services/email-service";',
        )
        .replace(
          "private readonly resets: PasswordResetService,",
          "private readonly resets: EmailService,",
        )
        .replace(
          "return this.resets.createResetToken(email) !== undefined;",
          "return this.resets.sendPasswordReset(email) !== undefined;",
        );
      expect(rewritten).not.toContain("password-reset");
      expect(rewritten).toContain("email-service");
      await writeFile(authPath, rewritten);

      const deps = structured<{
        dependencies: Array<{ fromLabel: string; toLabel: string }>;
        freshness: { state: string };
      }>(
        await conn.client.callTool({
          name: "get_dependencies",
          arguments: { node: authPath, direction: "outgoing", limit: 100 },
        }),
      );
      expect(deps.freshness.state).toBe("fresh");
      const toLabels = deps.dependencies.map((dep) => dep.toLabel);
      expect(toLabels.some((label) => label.includes("email-service.ts"))).toBe(true);
      expect(toLabels.some((label) => label.includes("password-reset.ts"))).toBe(false);
    } finally {
      if (conn.mcp.context.isOpen) {
        await closeConnection(conn);
      }
    }
  });

  it("removes deleted and renamed files after an explicit incremental update", async () => {
    const root = await buildAuditRepo();
    const deletedPath = join(root, "src", "auth", "password-reset.ts");
    const oldDriftPath = join(root, "src", "deep", "nested", "feature", "line-drift.ts");
    const newDriftPath = join(root, "src", "deep", "nested", "feature", "line-drift-renamed.ts");

    await unlink(deletedPath);
    const driftContent = await readFile(oldDriftPath, "utf8");
    await writeFile(newDriftPath, driftContent.replace("targetFunction", "targetFunctionRenamed"));
    await unlink(oldDriftPath);

    const update = await indexProject({ repositoryPath: root, mode: "update" });
    expect(update.ok).toBe(true);
    if (!update.ok) return;
    expect(update.value.deleted).toBe(2);
    expect(update.value.added).toBe(1);

    const sdk = createContextSDK({ repositoryPath: root });
    try {
      expect(sdk.symbols.searchSymbols("createResetToken", { limit: 5 })).toHaveLength(0);
      expect(sdk.symbols.searchSymbols("targetFunctionRenamed", { limit: 5 })[0]?.title).toBe(
        "targetFunctionRenamed",
      );
      expect(sdk.files.searchFiles("line-drift.ts", { limit: 5 })).toHaveLength(0);
    } finally {
      sdk.close();
    }
  });

  it("surfaces dependency-edge changes after an incremental refresh", async () => {
    const root = await buildAuditRepo();
    const authPath = join(root, "src", "auth", "auth-service.ts");
    const passwordResetPath = join(root, "src", "auth", "password-reset.ts");

    const source = await readFile(authPath, "utf8");
    const withoutPasswordResetImport = source.replace(
      /import \{[^}]*PasswordResetService[^}]*\} from "\.\/password-reset";\n/,
      "",
    );
    expect(withoutPasswordResetImport).not.toContain("password-reset");
    await writeFile(authPath, withoutPasswordResetImport);

    const update = await indexProject({ repositoryPath: root, mode: "update" });
    expect(update.ok).toBe(true);
    if (!update.ok) return;

    const sdk = createContextSDK({ repositoryPath: root });
    try {
      const authDeps = sdk.dependencies.getDependencies(authPath);
      const stillReferencesPasswordReset = authDeps.some(
        (dep) =>
          dep.toLabel.includes("password-reset") || dep.toLabel.includes("PasswordResetService"),
      );
      expect(stillReferencesPasswordReset).toBe(false);

      const passwordResetDependents = sdk.dependencies.getDependents(passwordResetPath);
      const authServiceDependent = passwordResetDependents.some((dep) =>
        dep.fromLabel.replaceAll("\\", "/").endsWith("src/auth/auth-service.ts"),
      );
      expect(authServiceDependent).toBe(false);
    } finally {
      sdk.close();
    }
  });

  it("rejects traversal and malformed MCP inputs without exposing outside files", async () => {
    const conn = await connectAuditRepo();
    try {
      const traversal = await conn.client.callTool({
        name: "read_file_range",
        arguments: { path: "..\\..\\..\\Windows\\win.ini", startLine: 1, endLine: 5 },
      });
      expect(traversal.isError).toBe(true);
      expect(JSON.stringify(traversal)).not.toContain("[fonts]");

      const malformed = await conn.client.callTool({
        name: "read_file_range",
        arguments: { path: join(conn.root, "src", "index.ts"), startLine: 4, endLine: 2 },
      });
      expect(malformed.isError).toBe(true);
      expect(JSON.stringify(malformed)).toContain("endLine");

      const oversized = await conn.client.callTool({
        name: "search_symbols",
        arguments: { query: "a".repeat(100_000), limit: 1 },
      });
      expect(oversized.isError).toBe(true);
      expect(JSON.stringify(oversized)).toContain("10000");

      const outsideFile = join(conn.root, "..", "outside-repo.txt");
      await writeFile(outsideFile, "OUTSIDE_REPO_SECRET_MARKER_123");
      const outsideRead = await conn.client.callTool({
        name: "read_file_range",
        arguments: { path: outsideFile, startLine: 1, endLine: 3 },
      });
      expect(outsideRead.isError).toBe(true);
      expect(JSON.stringify(outsideRead)).not.toContain("OUTSIDE_REPO_SECRET_MARKER_123");
    } finally {
      await closeConnection(conn);
    }
  });

  it("returns error results without structuredContent so outputSchema validation does not mask domain errors", async () => {
    const conn = await connectAuditRepo();
    try {
      const missing = await conn.client.callTool({
        name: "read_file_range",
        arguments: { path: join(conn.root, "src", "does-not-exist.ts"), startLine: 1, endLine: 5 },
      });
      expect(missing.isError).toBe(true);
      expect(missing.structuredContent).toBeUndefined();
      expect(textOf(missing)).toContain("File not found in the index");

      const noIndex = await conn.client.callTool({
        name: "project_overview",
        arguments: {},
      });
      if (noIndex.isError) {
        expect(noIndex.structuredContent).toBeUndefined();
        expect(textOf(noIndex)).toContain("No context index found");
      }
    } finally {
      await closeConnection(conn);
    }
  });
});

async function connectExistingAuditRepo(root: string): Promise<ConnectedAuditRepo> {
  await mkdir(dirname(resolve(root, ".codeatlas", "context.db")), { recursive: true });
  const mcp = createMcpServer({ root, logger: silentLogger() });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "mcp-audit-test", version: "0.0.0" }, { capabilities: {} });
  await mcp.connect(serverTransport);
  await client.connect(clientTransport);
  return { root, mcp, client };
}
