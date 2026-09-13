// @atlas/sdk — HTTP Inspect service
// Thin HTTP probe using Node built-ins. Requires localhost by default (security).
// NOTE: Export this module from packages/sdk/src/index.ts to surface it through
// the @atlas/sdk public API when ready.

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import type { HttpProbeResult, HttpProbeTarget, InspectPort } from "@atlas/core";
import { fail, ok } from "@atlas/shared";

const MAX_BODY_BYTES = 256 * 1024; // 256 KB cap on response body

export interface CreateInspectServiceOptions {
  /**
   * If true, allow non-localhost targets. Default: false (localhost only).
   * Set to true only when the user has explicitly approved network egress.
   */
  readonly allowRemote?: boolean | undefined;
}

export function createInspectService(options: CreateInspectServiceOptions = {}): InspectPort {
  async function probeOne(target: HttpProbeTarget): Promise<HttpProbeResult> {
    const method = target.method ?? "GET";
    const timeoutMs = target.timeoutMs ?? 5000;

    let parsed: URL;
    try {
      parsed = new URL(target.url);
    } catch {
      return {
        url: target.url,
        method,
        statusCode: null,
        statusText: null,
        headers: {},
        body: null,
        latencyMs: 0,
        error: `Invalid URL: ${target.url}`,
        ok: false,
      };
    }

    // Security: enforce localhost-only unless allowRemote is explicitly set
    if (options.allowRemote !== true) {
      const host = parsed.hostname;
      if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1" && host !== "0.0.0.0") {
        return {
          url: target.url,
          method,
          statusCode: null,
          statusText: null,
          headers: {},
          body: null,
          latencyMs: 0,
          error: `Remote targets require explicit approval (host: ${host})`,
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
        headers: { ...(target.headers ?? {}) },
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
          const body = chunks.length > 0 ? Buffer.concat(chunks).toString("utf-8") : null;
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === "string") headers[k] = v;
            else if (Array.isArray(v)) headers[k] = v.join(", ");
          }
          resolve({
            url: target.url,
            method,
            statusCode: res.statusCode ?? null,
            statusText: res.statusMessage ?? null,
            headers,
            body,
            latencyMs,
            error: null,
            ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
          });
        });
      });

      req.on("error", (err: Error) => {
        resolve({
          url: target.url,
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
          url: target.url,
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

      if (target.body !== undefined) req.write(target.body);
      req.end();
    });
  }

  return {
    async probeHttp(target) {
      try {
        const result = await probeOne(target);
        return ok(result);
      } catch (err) {
        return fail(err instanceof Error ? err : new Error(String(err)));
      }
    },
    async probeHttpBatch(targets) {
      try {
        const results = await Promise.all(targets.map(probeOne));
        return ok(results);
      } catch (err) {
        return fail(err instanceof Error ? err : new Error(String(err)));
      }
    },
  };
}
