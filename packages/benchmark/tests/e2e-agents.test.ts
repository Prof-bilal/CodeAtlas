import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContextToolSourceFromSDK } from "@atlas/mcp";
import {
  ToolUsingChatAgent,
  createContextSDK,
  createProviderService,
  indexProject,
} from "@atlas/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { OllamaRunner } from "../src/runner/ollama";
import { OpenCodeRunner } from "../src/runner/opencode";

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

/** Write a small but real TypeScript project and index it with the SDK indexer. */
function seedRepo(root: string): void {
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src", "math.ts"),
    "export function double(value: number) { return value * 2; }\nexport const TAU = Math.PI * 2;\n",
  );
  writeFileSync(
    join(root, "src", "index.ts"),
    'import { double } from "./math";\nexport const answer = double(21);\n',
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Chain 1: Ollama → CodeAtlas tool loop → context → Ollama
// ────────────────────────────────────────────────────────────────────────────

interface CapturedRequest {
  readonly model?: string;
  readonly tools?: Array<{ function?: { name?: string } }>;
  readonly tool_choice?: string;
  readonly messages?: Array<{ role: string; content?: unknown; tool_call_id?: string }>;
}

interface ChatChoice {
  readonly index: number;
  readonly message: Record<string, unknown>;
  readonly finish_reason: string;
}

function chatResponse(choices: ChatChoice[], usage: Record<string, number>): string {
  return JSON.stringify({
    id: "chatcmpl-e2e",
    object: "chat.completion",
    created: 1,
    model: "e2e-test-model",
    choices,
    usage,
  });
}

/** A local mock of Ollama's OpenAI-compatible endpoint (no external network). */
function startMockOllama(): Promise<{
  readonly baseUrl: string;
  readonly requests: CapturedRequest[];
  close(): Promise<void>;
}> {
  const requests: CapturedRequest[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST" || req.url?.endsWith("/v1/chat/completions") !== true) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end("{}");
      return;
    }
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      raw += chunk;
    });
    req.on("end", () => {
      let body: CapturedRequest = {};
      try {
        body = JSON.parse(raw) as CapturedRequest;
      } catch {
        body = {};
      }
      requests.push(body);

      const messages = body.messages ?? [];
      const hasToolResult = messages.some((m) => m.role === "tool");
      if (!hasToolResult) {
        // Round 1: ask for repository context via search_symbols.
        respond(
          res,
          chatResponse(
            [
              {
                index: 0,
                finish_reason: "tool_calls",
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_e2e_1",
                      type: "function",
                      function: { name: "search_symbols", arguments: '{"query":"double"}' },
                    },
                  ],
                },
              },
            ],
            { prompt_tokens: 120, completion_tokens: 18, total_tokens: 138 },
          ),
        );
        return;
      }

      // Round 2: final answer once context has been provided.
      respond(
        res,
        chatResponse(
          [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content:
                  "E2E_CONTEXT_MARKER double(value) multiplies its input by 2; it lives in math.ts next to TAU.",
              },
            },
          ],
          { prompt_tokens: 340, completion_tokens: 24, total_tokens: 364 },
        ),
      );
    });
  });

  const listening = new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  return listening.then(() => ({
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  }));
}

function respond(res: ServerResponse, body: string): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(body);
}

describe("E2E: Ollama → CodeAtlas tool loop → context", () => {
  it("feeds indexed repository context back to the model through the bounded tool loop", async () => {
    const repo = tempRoot("atlas-e2e-ollama-repo-");
    seedRepo(repo);
    const indexed = await indexProject({ repositoryPath: repo, mode: "build" });
    expect(indexed.ok).toBe(true);

    const ollama = await startMockOllama();
    try {
      // Persisted provider selection, exactly as `atlas ollama use` would leave it.
      const configPath = join(repo, "providers.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          activeProvider: "ollama",
          activeModel: "e2e-test-model",
          ollama: { mode: "local", baseUrl: ollama.baseUrl, model: "e2e-test-model" },
        }),
      );

      const providers = createProviderService({ env: {}, configPath });
      const sdk = createContextSDK({ repositoryPath: repo });
      try {
        const toolSource = createContextToolSourceFromSDK(sdk);
        const agent = new ToolUsingChatAgent(providers, toolSource, ["ollama"]);
        const runner = new OllamaRunner(agent);

        const result = await runner.execute({
          prompt: "Where is the double function defined and what does it do?",
          repositoryPath: repo,
          mode: "codeatlas",
          timeoutMs: 15_000,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.error).toBeUndefined();
        expect(result.value.exitCode).toBeNull();
        expect(result.value.timedOut).toBe(false);

        // The final answer is the model's round-2 text (proving the loop closed).
        expect(result.value.finalText).toContain("E2E_CONTEXT_MARKER");

        // Token metrics come from the provider's actual usage on the last turn.
        expect(result.value.metrics.source).toBe("actual");
        expect(result.value.metrics.input).toBe(340);
        expect(result.value.metrics.output).toBe(24);
        expect(result.value.metrics.total).toBe(364);

        // The executed tool call is recorded as successful.
        expect(result.value.toolCalls).toHaveLength(1);
        expect(result.value.toolCalls[0]?.name).toBe("search_symbols");
        expect(result.value.toolCalls[0]?.callId).toBe("call_e2e_1");
        expect(result.value.toolCalls[0]?.status).toBe("success");
        expect(result.value.toolCalls[0]?.isError).toBe(false);

        // Wire-level assertions: what the model actually sent and received.
        expect(ollama.requests).toHaveLength(2);

        const first = ollama.requests[0];
        expect(first.model).toBe("e2e-test-model");
        expect(first.tool_choice).toBe("auto");
        const toolNames = (first.tools ?? []).map((t) => t.function?.name);
        expect(toolNames).toContain("search_symbols");
        expect(toolNames).toContain("project_overview");
        expect((first.messages ?? []).map((m) => m.role)).toEqual(["user"]);

        const second = ollama.requests[1];
        const secondMessages = second.messages ?? [];
        expect(secondMessages.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
        const toolMessage = secondMessages[2];
        expect(toolMessage?.tool_call_id).toBe("call_e2e_1");
        // The tool result must carry real indexed context (the symbol we seeded),
        // not an error — this is the proof that CodeAtlas served the model.
        const toolContent = String(toolMessage?.content ?? "");
        expect(toolContent).toContain("double");
        expect(toolContent.toLowerCase()).not.toContain('"error"');
      } finally {
        sdk.close();
      }
    } finally {
      await ollama.close();
    }
  }, 30_000);
});

// ────────────────────────────────────────────────────────────────────────────
// Chain 1: OpenCode → CodeAtlas MCP → Tools (real MCP server over stdio)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Write a fake `opencode` executable that spawns the real CodeAtlas MCP
 * binary, performs the JSON-RPC handshake, calls tools, and emits the
 * JSONL event stream the `OpenCodeRunner` expects.
 */
function writeFakeOpenCodeWithMcp(dir: string, mcpBin: string): string {
  const bin = join(dir, "fake-opencode-mcp.mjs");
  writeFileSync(
    bin,
    `#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

// OpenCodeRunner passes: node fake.mjs run --format json --model X --dir REPO PROMPT
// repo is argv[4] (after "run", "--format", "json", "--model", "X", "--dir")
const repoArgIdx = process.argv.indexOf("--dir");
const repoPath = repoArgIdx !== -1 ? process.argv[repoArgIdx + 1] : process.cwd();

const mcp = spawn(process.execPath, [${JSON.stringify(mcpBin)}], {
  env: { ...process.env, ATLAS_ROOT: repoPath },
  stdio: ["pipe", "pipe", "pipe"],
});

const emit = (event) => process.stdout.write(JSON.stringify(event) + "\\n");
const rl = createInterface({ input: mcp.stdout });
let msgId = 0;
const pending = new Map();

function send(msg) {
  const line = JSON.stringify(msg) + "\\n";
  mcp.stdin.write(line);
}

function call(method, params) {
  return new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    send({ jsonrpc: "2.0", id, method, params });
  });
}

rl.on("line", (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id !== undefined && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

try {
  // 1. Initialize
  const init = await call("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "fake-opencode", version: "0.0.0" },
  });
  if (init.error) throw new Error("initialize failed: " + JSON.stringify(init.error));

  // 2. Send initialized notification (no response expected)
  send({ jsonrpc: "2.0", method: "notifications/initialized" });

  // 3. List tools
  const tools = await call("tools/list", {});
  const toolNames = (tools.result?.tools ?? []).map((t) => t.name);

  // 4. Call search_symbols
  emit({ type: "step_start", timestamp: Date.now() });
  const searchStart = Date.now();
  const searchResult = await call("tools/call", {
    name: "search_symbols",
    arguments: { query: "double", limit: 5 },
  });
  const searchDuration = Date.now() - searchStart;
  const searchOutput = JSON.stringify(searchResult.result ?? searchResult.error ?? {});
  emit({
    type: "tool_use",
    part: {
      tool: "search_symbols",
      callID: "call_opencode_1",
      state: { status: "done", output: searchOutput, isError: !!searchResult.error },
      time: { start: searchStart, end: searchStart + searchDuration },
    },
  });

  // 5. Call project_overview
  const overviewStart = Date.now();
  const overviewResult = await call("tools/call", {
    name: "project_overview",
    arguments: {},
  });
  const overviewDuration = Date.now() - overviewStart;
  const overviewOutput = JSON.stringify(overviewResult.result ?? overviewResult.error ?? {});
  emit({
    type: "tool_use",
    part: {
      tool: "project_overview",
      callID: "call_opencode_2",
      state: { status: "done", output: overviewOutput, isError: !!overviewResult.error },
      time: { start: overviewStart, end: overviewStart + overviewDuration },
    },
  });

  // 6. Emit metrics and final answer
  emit({
    type: "step_finish",
    part: { tokens: { input: 250, output: 80, reasoning: 0, total: 330, cache: { write: 0, read: 0 } } },
    cost: 0.0,
  });

  const searchHits = searchResult.result?.structuredContent?.hits ?? [];
  const overviewCounts = overviewResult.result?.structuredContent?.counts ?? {};
  emit({
    type: "text",
    part: {
      text: "Found " + searchHits.length + " symbols for 'double' in a project with " +
        (overviewCounts.files ?? "unknown") + " files. E2E_OPencode_CHAIN_MARKER",
    },
  });

  mcp.stdin.end();
} catch (err) {
  emit({ type: "text", part: { text: "ERROR: " + String(err) } });
  mcp.stdin.end();
  process.exit(1);
}
`,
  );
  chmodSync(bin, 0o755);
  return bin;
}

describe("E2E: OpenCode → CodeAtlas MCP → Tools", () => {
  it("spawns the real MCP server, calls tools over JSON-RPC, and captures results through the runner", async () => {
    const repo = tempRoot("atlas-e2e-opencode-mcp-");
    seedRepo(repo);
    const indexed = await indexProject({ repositoryPath: repo, mode: "build" });
    expect(indexed.ok).toBe(true);

    const mcpBin = join(import.meta.dirname ?? ".", "../../mcp/dist/bin.js");
    const bin = writeFakeOpenCodeWithMcp(repo, mcpBin);
    const runner = new OpenCodeRunner({ openCodeBin: bin });

    const result = await runner.execute({
      prompt: "Summarize the project using CodeAtlas tools",
      repositoryPath: repo,
      mode: "codeatlas",
      timeoutMs: 30_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.error).toBeUndefined();
    expect(result.value.exitCode).toBe(0);
    expect(result.value.timedOut).toBe(false);

    // The final text must contain the marker proving the full chain executed.
    expect(result.value.finalText).toContain("E2E_OPencode_CHAIN_MARKER");

    // Token metrics came from the step_finish event.
    expect(result.value.metrics.source).toBe("actual");
    expect(result.value.metrics.input).toBe(250);
    expect(result.value.metrics.output).toBe(80);
    expect(result.value.metrics.total).toBe(330);

    // Both tool calls were recorded.
    expect(result.value.toolCalls).toHaveLength(2);
    expect(result.value.toolCalls[0]?.name).toBe("search_symbols");
    expect(result.value.toolCalls[0]?.callId).toBe("call_opencode_1");
    expect(result.value.toolCalls[0]?.status).toBe("success");
    expect(result.value.toolCalls[1]?.name).toBe("project_overview");
    expect(result.value.toolCalls[1]?.callId).toBe("call_opencode_2");
    expect(result.value.toolCalls[1]?.status).toBe("success");
  }, 30_000);
});

// ────────────────────────────────────────────────────────────────────────────
// Chain 2a: benchmark runner ↔ opencode CLI contract
// ────────────────────────────────────────────────────────────────────────────

/**
 * Write a fake `opencode` executable that emits a realistic `--format json`
 * event stream. Scenarios are selected through environment variables so each
 * test can drive success, failure, and timeout paths offline.
 */
function writeFakeOpenCode(dir: string, env: Record<string, string>): string {
  const bin = join(dir, "fake-opencode.mjs");
  const exitCode = env["FAKE_EXIT_CODE"] ?? "";
  const delayMs = env["FAKE_DELAY_MS"] ?? "0";
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const emit = (event) => process.stdout.write(JSON.stringify(event) + "\\n");

const exitCode = ${JSON.stringify(exitCode)} || undefined;
const delayMs = Number(${JSON.stringify(delayMs)});
if (delayMs > 0) {
  await sleep(delayMs);
}
if (exitCode !== undefined) {
  process.stderr.write("fake-opencode: simulated failure\\n");
  emit({ type: "text", part: { text: "partial output before crash" } });
  process.exit(Number(exitCode));
}

emit({ type: "step_start", timestamp: Date.now() });
emit({
  type: "tool_use",
  part: {
    tool: "project_overview",
    callID: "tc_e2e_1",
    state: { status: "done", output: '{"counts":{"files":3}}', isError: false },
    time: { start: 1000, end: 1042 },
  },
});
emit({
  type: "step_finish",
  part: { tokens: { input: 120, output: 48, reasoning: 0, total: 168, cache: { write: 0, read: 7 } } },
  cost: 0.0021,
});
emit({ type: "text", part: { text: "The project exposes 3 files; overview retrieved." } });
`,
  );
  chmodSync(bin, 0o755);
  return bin;
}

describe("E2E: opencode CLI runner contract", () => {
  it("parses tokens, cost, tool calls, and the final answer from the JSONL stream", async () => {
    const dir = tempRoot("atlas-e2e-oc-ok-");
    seedRepo(dir);
    const bin = writeFakeOpenCode(dir, {});
    const runner = new OpenCodeRunner({ openCodeBin: bin });

    const result = await runner.execute({
      prompt: "Summarize the project",
      repositoryPath: dir,
      mode: "codeatlas",
      timeoutMs: 15_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.error).toBeUndefined();
    expect(result.value.exitCode).toBe(0);
    expect(result.value.timedOut).toBe(false);

    expect(result.value.finalText).toBe("The project exposes 3 files; overview retrieved.");

    expect(result.value.metrics.source).toBe("actual");
    expect(result.value.metrics.input).toBe(120);
    expect(result.value.metrics.output).toBe(48);
    expect(result.value.metrics.reasoning).toBe(0);
    expect(result.value.metrics.total).toBe(168);
    expect(result.value.metrics.cacheWrite).toBe(0);
    expect(result.value.metrics.cacheRead).toBe(7);
    expect(result.value.cost).toBeCloseTo(0.0021, 10);

    expect(result.value.toolCalls).toHaveLength(1);
    const call = result.value.toolCalls[0];
    expect(call?.name).toBe("project_overview");
    expect(call?.callId).toBe("tc_e2e_1");
    expect(call?.isError).toBe(false);
    expect(call?.status).toBe("success");
    expect(call?.durationMs).toBe(42);
  }, 30_000);

  it("reports non-zero exits as errors while keeping partial events", async () => {
    const dir = tempRoot("atlas-e2e-oc-fail-");
    seedRepo(dir);
    const bin = writeFakeOpenCode(dir, { FAKE_EXIT_CODE: "3" });
    const runner = new OpenCodeRunner({ openCodeBin: bin });

    const result = await runner.execute({
      prompt: "This task fails",
      repositoryPath: dir,
      mode: "baseline",
      timeoutMs: 15_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.exitCode).toBe(3);
    expect(result.value.error).toContain("exit code 3");
    expect(result.value.timedOut).toBe(false);
    // Events emitted before the crash still count.
    expect(result.value.finalText).toBe("partial output before crash");
  }, 30_000);

  it("kills the child at timeoutMs and reports timedOut", async () => {
    const dir = tempRoot("atlas-e2e-oc-slow-");
    seedRepo(dir);
    const bin = writeFakeOpenCode(dir, { FAKE_DELAY_MS: "5000" });
    const runner = new OpenCodeRunner({ openCodeBin: bin });

    const start = Date.now();
    const result = await runner.execute({
      prompt: "This task hangs",
      repositoryPath: dir,
      mode: "baseline",
      timeoutMs: 400,
    });
    const elapsed = Date.now() - start;

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.timedOut).toBe(true);
    expect(result.value.exitCode).toBeNull();
    expect(elapsed).toBeLessThan(4000);
  }, 30_000);
});
