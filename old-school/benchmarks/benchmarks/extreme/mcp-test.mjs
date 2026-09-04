#!/usr/bin/env node
/**
 * MCP server stress driver for the extreme benchmark.
 *
 * Spawns `atlas mcp --root <repo>`, performs the MCP initialize handshake,
 * then exercises every CodeAtlas tool (project_overview, search_symbols,
 * search_files, get_dependencies, explain_module, get_summary,
 * read_file_range), measuring latency, memory, errors, and response sizes.
 * Also runs concurrent-request tests (5/10/25 parallel calls).
 *
 * Usage:
 *   node benchmarks/extreme/mcp-test.mjs --repo <path> [--concurrency N]
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = path.resolve(HERE, "../../apps/cli/dist/index.js");

const args = process.argv.slice(2);
const repo = args[args.indexOf("--repo") + 1];
if (!repo) {
  console.error("usage: mcp-test.mjs --repo <path> [--concurrency N]");
  process.exit(2);
}

class McpClient {
  constructor(child) {
    this.child = child;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    this.latencies = [];
    this.errors = [];
    this.onMessage = null;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      this.buffer += chunk;
      let idx;
      while ((idx = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 1);
        if (line.trim().length === 0) continue;
        try {
          const msg = JSON.parse(line);
          if (this.onMessage) this.onMessage(msg);
          const pending = this.pending.get(msg.id);
          if (pending) {
            this.pending.delete(msg.id);
            pending.resolve(msg);
          }
        } catch (err) {
          this.errors.push({ phase: "parse", error: String(err), line: line.slice(0, 500) });
        }
      }
    });
    child.stderr.on("data", (d) => {
      this.errors.push({ phase: "stderr", error: String(d).slice(0, 1000) });
    });
  }

  send(method, params) {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      const payload = { jsonrpc: "2.0", id, method, params };
      this.child.stdin.write(JSON.stringify(payload) + "\n");
    });
  }

  async call(method, params) {
    const start = performance.now();
    const res = await this.send(method, params);
    const ms = performance.now() - start;
    return { ms, res };
  }
}

function rssOf(pid) {
  try {
    const fs = await_import("node:fs");
    const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
    const m = /VmRSS:\s+(\d+)/.exec(status);
    return m ? Number(m[1]) / 1024 : 0;
  } catch {
    return 0;
  }
}

function await_import(name) {
  return import(name);
}

async function main() {
  const child = spawn(process.execPath, [ATLAS, "mcp", "--root", repo], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const client = new McpClient(child);
  const startedAt = Date.now();

  const t0 = performance.now();
  const initRes = await client.call("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "extreme-bench", version: "1.0.0" },
  });
  const initMs = performance.now() - t0;
  if (initRes.res.error) {
    console.error("initialize failed:", JSON.stringify(initRes.res.error));
    process.exit(1);
  }
  await client.call("notifications/initialized", {});

  const listRes = await client.call("tools/list", {});
  const tools = (listRes.res.result?.tools ?? []).map((t) => t.name);
  const startupMs = Date.now() - startedAt;

  const results = {
    startupMs,
    initMs: Math.round(initMs),
    tools,
    requests: [],
    errors: client.errors,
    peakRssMb: 0,
    exitSignal: null,
  };

  let peakRss = 0;
  const rssTimer = setInterval(() => {
    const r = rssOf(child.pid);
    if (r > peakRss) peakRss = r;
  }, 500);

  const searchable = repo.includes("repo-5000")
    ? ["Validator0000Service", "authenticate", "user", "Payment", "createSession"]
    : ["Validator0000Service", "authenticate", "user", "Payment", "createSession", "ConfigManager"];

  const requestPlan = [
    ["project_overview", {}],
    ["search_symbols", { query: searchable[0] }],
    ["search_symbols", { query: searchable[1] }],
    ["search_symbols", { query: searchable[2], limit: 10 }],
    ["search_files", { query: "validator" }],
    ["search_files", { query: "login" }],
    ["get_dependencies", { node: "packages/payments/src/validator-0000.ts" }],
    ["get_dependencies", { node: "packages/shared/src/util-0000.ts", direction: "incoming", limit: 50 }],
    ["explain_module", { path: "packages/payments" }],
    ["get_summary", { target: "packages/payments", kind: "module" }],
    ["read_file_range", { path: "packages/payments/src/validator-0000.ts", startLine: 1, endLine: 40 }],
    ["read_file_range", { path: "packages/payments/src/validator-0000.ts", startLine: 2500, endLine: 2540 }],
  ];

  const done = [];
  for (const [tool, params] of requestPlan) {
    const t = performance.now();
    const res = await client.call("tools/call", { name: tool, arguments: params });
    const ms = Math.round(performance.now() - t);
    const result = res.res.result;
    const text = JSON.stringify(result ?? res.res.error ?? "").slice(0, 500);
    done.push({ tool, ms, sizeBytes: text.length, ok: !res.res.error, error: res.res.error?.message ?? null, head: text });
    client.errors.push(...(res.res.error ? [{ phase: "tool", tool, error: res.res.error.message }] : []));
  }
  results.requests = done;

  // Concurrency tests
  const concurrencyLevels = [5, 10, 25];
  const concResults = [];
  for (const n of concurrencyLevels) {
    const t = performance.now();
    const responses = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        client.call("tools/call", {
          name: "search_symbols",
          arguments: { query: searchable[i % searchable.length] },
        }),
      ),
    );
    const wall = Math.round(performance.now() - t);
    const okCount = responses.filter((r) => !r.res.error).length;
    concResults.push({
      level: n,
      wallMs: wall,
      ok: okCount,
      errors: n - okCount,
      perRequestMs: responses.map((r) => Math.round(r.ms)),
    });
  }
  results.concurrency = concResults;

  clearInterval(rssTimer);
  results.peakRssMb = Math.round(peakRss);

  child.stdin.end();
  const exitPromise = new Promise((resolve) => {
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
  const exit = await Promise.race([exitPromise, new Promise((r) => setTimeout(() => r(null), 5000))]);
  results.exit = exit;

  console.log(JSON.stringify(results, null, 2));
}

await main();