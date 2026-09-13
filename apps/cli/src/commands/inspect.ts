// atlas inspect — live HTTP probe for running services.
// Uses Node built-ins only; no additional npm dependencies.

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import type { Command } from "commander";

interface InspectHttpOptions {
  readonly method?: string;
  readonly header?: string[];
  readonly body?: string;
  readonly timeout?: string;
  readonly allowRemote?: boolean;
  readonly json?: boolean;
}

interface HttpProbeResult {
  readonly url: string;
  readonly method: string;
  readonly statusCode: number | null;
  readonly statusText: string | null;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | null;
  readonly latencyMs: number;
  readonly error: string | null;
  readonly ok: boolean;
}

const MAX_BODY_BYTES = 256 * 1024; // 256 KB cap on response body

async function probeHttp(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  timeoutMs: number,
  allowRemote: boolean,
): Promise<HttpProbeResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      url,
      method,
      statusCode: null,
      statusText: null,
      headers: {},
      body: null,
      latencyMs: 0,
      error: `Invalid URL: ${url}`,
      ok: false,
    };
  }

  // Security: enforce localhost-only unless --allow-remote is set
  if (!allowRemote) {
    const host = parsed.hostname;
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1" && host !== "0.0.0.0") {
      return {
        url,
        method,
        statusCode: null,
        statusText: null,
        headers: {},
        body: null,
        latencyMs: 0,
        error: `Remote targets require --allow-remote (host: ${host})`,
        ok: false,
      };
    }
  }

  const requester = parsed.protocol === "https:" ? httpsRequest : httpRequest;
  const start = Date.now();

  return new Promise((resolve) => {
    const reqOptions = {
      method,
      hostname: parsed.hostname,
      port: parsed.port !== "" ? parsed.port : parsed.protocol === "https:" ? 443 : 80,
      path: parsed.pathname + parsed.search,
      headers,
      timeout: timeoutMs,
    };

    const req = requester(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      let total = 0;
      res.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total <= MAX_BODY_BYTES) chunks.push(chunk);
      });
      res.on("end", () => {
        const latencyMs = Date.now() - start;
        const responseBody = chunks.length > 0 ? Buffer.concat(chunks).toString("utf-8") : null;
        const responseHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === "string") responseHeaders[k] = v;
          else if (Array.isArray(v)) responseHeaders[k] = v.join(", ");
        }
        resolve({
          url,
          method,
          statusCode: res.statusCode ?? null,
          statusText: res.statusMessage ?? null,
          headers: responseHeaders,
          body: responseBody,
          latencyMs,
          error: null,
          ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
        });
      });
    });

    req.on("error", (err: Error) => {
      resolve({
        url,
        method,
        statusCode: null,
        statusText: null,
        headers: {},
        body: null,
        latencyMs: Date.now() - start,
        error: err.message,
        ok: false,
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({
        url,
        method,
        statusCode: null,
        statusText: null,
        headers: {},
        body: null,
        latencyMs: timeoutMs,
        error: "Request timed out",
        ok: false,
      });
    });

    if (body !== undefined) req.write(body);
    req.end();
  });
}

export function registerInspect(program: Command): void {
  const inspect = program
    .command("inspect")
    .description("Inspect running services (HTTP probes, network capture)");

  inspect
    .command("http <url>")
    .description("Send an HTTP probe request to a running service (localhost by default)")
    .option("-X, --method <method>", "HTTP method (GET, POST, PUT, ...)", "GET")
    .option(
      "-H, --header <header>",
      "Add a request header (key: value). Repeatable.",
      (v: string, a: string[]) => [...a, v],
      [] as string[],
    )
    .option("-d, --body <body>", "Request body (for POST/PUT/PATCH)")
    .option("--timeout <ms>", "Request timeout in milliseconds", "5000")
    .option("--allow-remote", "Allow non-localhost targets (requires explicit acknowledgement)")
    .option("--json", "Output results as JSON")
    .action(async (url: string, opts: InspectHttpOptions) => {
      const method = opts.method ?? "GET";
      const timeoutMs = opts.timeout !== undefined ? Number.parseInt(opts.timeout, 10) : 5000;
      const allowRemote = opts.allowRemote === true;

      const headers: Record<string, string> = {};
      for (const h of opts.header ?? []) {
        const colon = h.indexOf(":");
        if (colon > 0) {
          headers[h.slice(0, colon).trim()] = h.slice(colon + 1).trim();
        }
      }

      const probe = await probeHttp(url, method, headers, opts.body, timeoutMs, allowRemote);

      if (opts.json === true) {
        console.log(JSON.stringify(probe, null, 2));
        process.exit(probe.ok ? 0 : 1);
        return;
      }

      const statusIcon = probe.ok ? "✓" : "✗";
      console.log(`${statusIcon} ${probe.method} ${probe.url}`);
      console.log(`  Status: ${probe.statusCode ?? "N/A"} ${probe.statusText ?? ""}`);
      console.log(`  Latency: ${probe.latencyMs}ms`);

      if (probe.error !== null) {
        console.log(`  Error: ${probe.error}`);
      }

      if (probe.body !== null && probe.body.length > 0) {
        console.log(`  Body (${probe.body.length} chars):`);
        const preview = probe.body.length > 500 ? `${probe.body.slice(0, 500)}...` : probe.body;
        console.log(
          preview
            .split("\n")
            .map((l) => `    ${l}`)
            .join("\n"),
        );
      }

      process.exit(probe.ok ? 0 : 1);
    });
}
