import { randomUUID, timingSafeEqual } from "node:crypto";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createLogger } from "@prof-bilal/atlas-mcp";
import { type ChatGptServer, type ChatGptServerOptions, createChatGptServer } from "./server";

/**
 * Streamable HTTP transport for the CodeAtlas ChatGPT plugin.
 *
 * ChatGPT connectors reach a remote MCP server over Streamable HTTP, so this is
 * the adapter that makes the plugin installable in ChatGPT (Codex and other
 * local clients use {@link import("./stdio").startStdioServer} instead).
 *
 * Safety: binds to **127.0.0.1 by default** and **fails closed**. Binding a
 * non-loopback host without a bearer token (`--token` / `ATLAS_CHATGPT_TOKEN`)
 * is refused at startup rather than merely warned about. CORS defaults to a
 * loopback allow-list (never `*`), and DNS-rebinding protection is enabled by
 * default with an allow-list of loopback hosts plus the bound host/port. The
 * server never touches the filesystem beyond the configured CodeAtlas index,
 * and every tool read is the same read-only, deny-filtered Context SDK path the
 * stdio server uses.
 */

/** Options for the HTTP transport. */
export interface HttpServerOptions extends ChatGptServerOptions {
  /** Interface to bind (default `127.0.0.1`). */
  readonly host?: string;
  /** TCP port (default `8787`). */
  readonly port?: number;
  /** Bearer token required on `/mcp` when set (also `ATLAS_CHATGPT_TOKEN`). */
  readonly token?: string;
  /**
   * Host header allow-list for DNS-rebinding protection. Defaults to loopback
   * hosts plus the bound host, each with and without the bound port.
   */
  readonly allowedHosts?: readonly string[];
  /** Return JSON responses instead of SSE streams when possible (default `true`). */
  readonly jsonResponses?: boolean;
  /**
   * `Access-Control-Allow-Origin` value. Defaults to reflecting a loopback
   * `Origin` header only — never `*`. Set explicitly to allow another origin.
   */
  readonly corsOrigin?: string;
}

/** A running HTTP plugin server. */
export interface RunningHttpServer {
  readonly url: string;
  readonly host: string;
  readonly port: number;
  close(): Promise<void>;
}

/** Endpoint path for MCP requests. */
export const MCP_PATH = "/mcp";

/** Default port for the HTTP transport. */
export const DEFAULT_HTTP_PORT = 8787;

const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Start the plugin over Streamable HTTP. */
export async function startHttpServer(options: HttpServerOptions = {}): Promise<RunningHttpServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? DEFAULT_HTTP_PORT;
  const token = options.token ?? process.env["ATLAS_CHATGPT_TOKEN"];
  const corsOrigin = options.corsOrigin;
  const logger =
    options.logger ??
    createLogger(options.logLevel === undefined ? {} : { level: options.logLevel });

  // Fail closed: a non-loopback bind without a token would expose repository
  // source reads to anyone who can reach the host. Refuse to start instead of
  // warning (the module docstring has always claimed a token is required).
  const hasToken = token !== undefined && token.length > 0;
  if (!isLoopback(host) && !hasToken) {
    throw new Error(
      `refusing to bind non-loopback host "${host}" without a bearer token — set --token or ATLAS_CHATGPT_TOKEN.`,
    );
  }

  // One transport (and one lazily-opened Context SDK) per MCP session.
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  // Filled in after `listen`; read when constructing a session transport so the
  // default host allow-list includes the actual (possibly ephemeral) port.
  let boundPort = port;

  const httpServer = createServer((req, res) => {
    handleRequest(req, res).catch((error: unknown) => {
      logger.error("http request failed", error);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
      }
      res.end(JSON.stringify({ error: "internal_error" }));
    });
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    applyCors(req, res, corsOrigin);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname === "/healthz") {
      respondJson(res, 200, { status: "ok", server: "codeatlas-chatgpt" });
      return;
    }
    if (url.pathname === "/") {
      respondJson(res, 200, {
        name: "CodeAtlas ChatGPT plugin",
        description: "Repository intelligence for ChatGPT/Codex.",
        mcp: MCP_PATH,
        health: "/healthz",
      });
      return;
    }
    if (url.pathname !== MCP_PATH) {
      respondJson(res, 404, { error: "not_found" });
      return;
    }

    if (token !== undefined && token.length > 0 && !isAuthorized(req, token)) {
      res.writeHead(401, { "content-type": "application/json", "www-authenticate": "Bearer" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    if (req.method === "POST") {
      await handlePost(req, res);
      return;
    }
    if (req.method === "GET" || req.method === "DELETE") {
      await handleSessionRequest(req, res);
      return;
    }

    res.writeHead(405, { "content-type": "application/json", allow: "GET, POST, DELETE, OPTIONS" });
    res.end(JSON.stringify({ error: "method_not_allowed" }));
  }

  async function handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (body === undefined) {
      respondJson(res, 400, {
        error: "invalid_request",
        message: "Request body must be a JSON object.",
      });
      return;
    }
    const sessionId = headerValue(req, "mcp-session-id");
    if (sessionId !== undefined) {
      const transport = sessions.get(sessionId);
      if (transport === undefined) {
        respondJson(res, 404, jsonRpcError("Session not found."));
        return;
      }
      await transport.handleRequest(req, res, body);
      return;
    }

    // New session: one plugin server instance per transport.
    const plugin: ChatGptServer = createChatGptServer(options);
    let closed = false;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      ...(options.jsonResponses === false ? {} : { enableJsonResponse: true }),
      // DNS-rebinding protection is on by default: a browser page resolving a
      // loopback hostname must still send the expected Host header.
      allowedHosts: [...(options.allowedHosts ?? defaultAllowedHosts(host, boundPort))],
      enableDnsRebindingProtection: true,
    });
    transport.onclose = () => {
      const id = transport.sessionId;
      if (id !== undefined) {
        sessions.delete(id);
      }
      if (!closed) {
        closed = true;
        plugin.context.close();
      }
    };

    try {
      await plugin.connect(transport as unknown as Transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      plugin.context.close();
      throw error;
    }
    const id = transport.sessionId;
    if (id !== undefined) {
      sessions.set(id, transport);
    }
  }

  async function handleSessionRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = headerValue(req, "mcp-session-id");
    if (sessionId === undefined) {
      respondJson(res, 400, jsonRpcError("Missing mcp-session-id header."));
      return;
    }
    const transport = sessions.get(sessionId);
    if (transport === undefined) {
      respondJson(res, 404, jsonRpcError("Session not found."));
      return;
    }
    await transport.handleRequest(req, res);
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => {
      httpServer.removeListener("error", reject);
      resolve();
    });
  });
  const address = httpServer.address();
  boundPort = typeof address === "object" && address !== null ? address.port : port;
  logger.info(`CodeAtlas ChatGPT plugin listening on http://${host}:${boundPort}${MCP_PATH}`);

  return {
    host,
    port: boundPort,
    url: `http://${host}:${boundPort}${MCP_PATH}`,
    close: async () => {
      for (const transport of sessions.values()) {
        await transport.close().catch(() => undefined);
      }
      sessions.clear();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

/** True for the loopback interfaces (`127.0.0.1`, `::1`, `localhost`). */
export function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function isAuthorized(req: IncomingMessage, token: string): boolean {
  const header = headerValue(req, "authorization");
  if (header === undefined || !header.startsWith("Bearer ")) {
    return false;
  }
  const provided = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(token);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name];
  if (raw === undefined) {
    return undefined;
  }
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Default Host allow-list for DNS-rebinding protection: the loopback names plus
 * the bound host, each with and without the bound port (the Host header always
 * includes the port for non-default ports).
 */
function defaultAllowedHosts(bindHost: string, port: number): string[] {
  const hosts: string[] = [];
  for (const name of new Set([bindHost, "127.0.0.1", "localhost", "::1", "[::1]"])) {
    hosts.push(name, `${name}:${port}`);
  }
  return hosts;
}

/**
 * Apply CORS headers. Without an explicit `corsOrigin`, only a loopback `Origin`
 * is reflected; any other origin gets no `Access-Control-Allow-Origin`, so the
 * browser blocks the cross-origin read (never a wildcard by default).
 */
function applyCors(req: IncomingMessage, res: ServerResponse, corsOrigin?: string): void {
  const origin = corsOrigin ?? loopbackOrigin(req);
  if (origin !== undefined) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "content-type, authorization, mcp-session-id, mcp-protocol-version, last-event-id",
  );
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id, mcp-protocol-version");
}

/** The request's `Origin` if it is a loopback origin, else `undefined`. */
function loopbackOrigin(req: IncomingMessage): string | undefined {
  const origin = req.headers.origin;
  if (typeof origin !== "string" || origin.length === 0) {
    return undefined;
  }
  try {
    return isLoopback(new URL(origin).hostname) ? origin : undefined;
  } catch {
    return undefined;
  }
}

function respondJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function jsonRpcError(message: string): {
  readonly jsonrpc: "2.0";
  readonly error: { code: number; message: string };
  readonly id: null;
} {
  return { jsonrpc: "2.0", error: { code: -32000, message }, id: null };
}

/** Read and parse a bounded JSON request body. */
async function readJsonBody(req: IncomingMessage): Promise<unknown | undefined> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      return undefined;
    }
    chunks.push(buffer);
  }
  if (total === 0) {
    return undefined;
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}
