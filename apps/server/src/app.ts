import { createReadStream, existsSync, statSync } from "node:fs";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import type { ServerConfig } from "./config";
import { JobManager } from "./jobs";

/**
 * Minimal HTTP plumbing for the Benchmark API: a method+pattern router with
 * `:param` segments, size-bounded JSON bodies, safe static file serving for
 * the built UI, and uniform JSON error envelopes. No framework, no new
 * dependencies — this is a localhost tool.
 */
export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestContext {
  readonly req: IncomingMessage;
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
  readonly body: unknown;
}

export type RouteHandler = (ctx: RequestContext) => unknown | Promise<unknown>;

export interface Route {
  readonly method: "GET" | "POST";
  readonly pattern: string;
  readonly handler: RouteHandler;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const pSegs = pattern.split("/").filter((s) => s.length > 0);
  const segs = path.split("/").filter((s) => s.length > 0);
  if (pSegs.length !== segs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pSegs.length; i += 1) {
    const p = pSegs[i];
    if (p.startsWith(":")) {
      params[p.slice(1)] = decodeURIComponent(segs[i]);
    } else if (p !== segs[i]) {
      return null;
    }
  }
  return params;
}

async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) {
      throw new ApiError(413, "body_too_large", `Request body exceeds ${maxBytes} bytes`);
    }
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "Request body is not valid JSON");
  }
}

export interface AppOptions {
  readonly config: ServerConfig;
  readonly routes: readonly Route[];
  /** Injectable for tests. */
  readonly jobs?: JobManager;
}

export interface AppHandle {
  readonly server: Server;
  readonly jobs: JobManager;
  readonly start: () => Promise<{ readonly host: string; readonly port: number }>;
  readonly close: () => Promise<void>;
}

export function createApp(options: AppOptions): AppHandle {
  const { config, routes } = options;
  const jobs =
    options.jobs ??
    new JobManager({
      maxConcurrent: 1,
      maxQueued: config.maxQueuedJobs,
      jobTimeoutMs: config.jobTimeoutMs,
    });

  const serveStatic = (res: ServerResponse, pathname: string): boolean => {
    if (config.uiDist === "" || !existsSync(config.uiDist)) return false;
    const root = resolve(config.uiDist);
    const target = resolve(join(root, pathname));
    if (target !== root && !target.startsWith(`${root}/`)) return false;
    let file = target;
    if (!existsSync(file) || !statSync(file).isFile()) {
      // SPA fallback (hash routing — everything lives in index.html).
      const index = join(root, "index.html");
      if (!existsSync(index)) return false;
      file = index;
    }
    const type = MIME[extname(file)] ?? "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "X-Content-Type-Options": "nosniff",
    });
    createReadStream(file).pipe(res);
    return true;
  };

  const server = createServer((req, res) => {
    void handle(req, res).catch((err) => {
      console.error("[server] unhandled error:", err instanceof Error ? err.message : err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      }
      res.end(JSON.stringify({ error: { code: "internal", message: "Internal server error" } }));
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        Allow: "GET, POST, OPTIONS",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    if (pathname.startsWith("/api/")) {
      const route = routes.find(
        (r) =>
          r.method === req.method &&
          matchPattern(r.pattern, pathname.replace(/^\/api/, "")) !== null,
      );
      if (route === undefined) {
        sendJson(res, 404, {
          error: { code: "not_found", message: `No route for ${req.method} ${pathname}` },
        });
        return;
      }
      const params = matchPattern(route.pattern, pathname.replace(/^\/api/, ""));
      try {
        const body =
          req.method === "POST" ? await readJsonBody(req, config.maxBodyBytes) : undefined;
        const result = await route.handler({
          req,
          params: params ?? {},
          query: url.searchParams,
          body,
        });
        sendJson(res, 200, result ?? { ok: true });
      } catch (err) {
        if (err instanceof ApiError) {
          sendJson(res, err.status, { error: { code: err.code, message: err.message } });
        } else {
          console.error(
            "[server] handler error:",
            err instanceof Error ? `${err.name}: ${err.message}` : err,
          );
          sendJson(res, 500, {
            error: {
              code: "internal",
              message: err instanceof Error ? err.message : "Internal server error",
            },
          });
        }
      }
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      if (serveStatic(res, pathname === "/" ? "/index.html" : pathname)) return;
      sendJson(res, 404, { error: { code: "not_found", message: "Not found" } });
      return;
    }

    res.writeHead(405, { Allow: "GET, POST, OPTIONS" });
    res.end();
  }

  return {
    server,
    jobs,
    start: () =>
      new Promise((resolvePort) => {
        server.listen(config.port, config.host, () => {
          const addr = server.address();
          resolvePort({
            host: typeof addr === "object" && addr !== null ? addr.address : config.host,
            port: typeof addr === "object" && addr !== null ? addr.port : config.port,
          });
        });
      }),
    close: () =>
      new Promise((done, reject) => {
        server.close((err) => (err === undefined ? done() : reject(err)));
      }),
  };
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}
