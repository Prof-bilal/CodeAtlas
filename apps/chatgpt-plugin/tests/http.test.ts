import { afterEach, describe, expect, it } from "vitest";
import { type Fixture, createFixture, silentLogger } from "../../../packages/mcp/tests/fixture";
import { type RunningHttpServer, isLoopback, startHttpServer } from "../src/http";

const BASE_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

interface Initialized {
  readonly sessionId: string;
  readonly version: string;
  readonly body: Record<string, unknown>;
}

async function initialize(url: string, token?: string): Promise<Initialized> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...BASE_HEADERS,
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "http-test", version: "0.0.0" },
      },
    }),
  });
  const sessionId = res.headers.get("mcp-session-id") ?? "";
  const body = (await res.json()) as Record<string, unknown>;
  const result = body["result"] as { protocolVersion?: string } | undefined;
  return { sessionId, version: result?.protocolVersion ?? "2025-06-18", body };
}

async function rpc(
  url: string,
  sessionId: string,
  version: string,
  message: Record<string, unknown>,
  token?: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...BASE_HEADERS,
      "mcp-session-id": sessionId,
      "mcp-protocol-version": version,
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(message),
  });
  return (await res.json()) as Record<string, unknown>;
}

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0)) {
    await fn();
  }
});

async function setup(options: { token?: string } = {}): Promise<{
  server: RunningHttpServer;
  fixture: Fixture;
}> {
  const fixture = createFixture();
  const server = await startHttpServer({
    root: fixture.root,
    port: 0,
    logger: silentLogger(),
    ...(options.token === undefined ? {} : { token: options.token }),
  });
  cleanup.push(async () => {
    await server.close();
    fixture.cleanup();
  });
  return { server, fixture };
}

describe("ChatGPT plugin HTTP transport", () => {
  it("classifies loopback hosts", () => {
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("localhost")).toBe(true);
    expect(isLoopback("0.0.0.0")).toBe(false);
  });

  it("serves /healthz", async () => {
    const { server } = await setup();
    const health = await fetch(server.url.replace("/mcp", "/healthz"));
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok", server: "codeatlas-chatgpt" });
  });

  it("negotiates a session and lists the five tools", async () => {
    const { server } = await setup();
    const init = await initialize(server.url);
    expect(init.sessionId).not.toHaveLength(0);
    expect((init.body["result"] as { serverInfo?: { name?: string } }).serverInfo?.name).toBe(
      "codeatlas",
    );

    const listed = await rpc(server.url, init.sessionId, init.version, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    const tools = (listed["result"] as { tools: Array<{ name: string }> }).tools;
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "analyze_repository",
      "explain_repository",
      "get_context",
      "impact_analysis",
      "search_repository",
    ]);
    expect((listed["result"] as { tools: unknown[] }).tools).toHaveLength(5);
  });

  it("runs a tool end to end over HTTP", async () => {
    const { server } = await setup();
    const init = await initialize(server.url);
    const called = await rpc(server.url, init.sessionId, init.version, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "analyze_repository", arguments: {} },
    });
    const result = called["result"] as { structuredContent?: Record<string, unknown> };
    expect(result.structuredContent?.["counts"]).toMatchObject({ files: 3, symbols: 3 });
  });

  it("rejects requests for an unknown session", async () => {
    const { server } = await setup();
    const res = await fetch(server.url, {
      method: "POST",
      headers: { ...BASE_HEADERS, "mcp-session-id": "does-not-exist" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(404);
  });

  it("requires a bearer token when one is configured", async () => {
    const { server } = await setup({ token: "s3cret" });
    const unauthorized = await fetch(server.url, {
      method: "POST",
      headers: BASE_HEADERS,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(unauthorized.status).toBe(401);

    const init = await initialize(server.url, "s3cret");
    expect(init.sessionId).not.toHaveLength(0);
    const listed = await rpc(
      server.url,
      init.sessionId,
      init.version,
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      "s3cret",
    );
    expect((listed["result"] as { tools: unknown[] }).tools).toHaveLength(5);
  });

  it("returns a JSON-RPC error for a non-session GET", async () => {
    const { server } = await setup();
    const res = await fetch(server.url, { headers: { accept: "text/event-stream" } });
    expect(res.status).toBe(400);
  });
});
