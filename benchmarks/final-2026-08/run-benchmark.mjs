#!/usr/bin/env node
/**
 * CodeAtlas Final Benchmark Runner (benchmarks/final-2026-08)
 *
 * Runs the full benchmark: prepare repos, verify tools, index each repo,
 * measure CodeAtlas context assembly + toolkit, then execute every task twice
 * (baseline without CodeAtlas MCP, CodeAtlas with CodeAtlas MCP) via
 * `opencode run --format json`, capturing real per-step token/cost events.
 *
 * Usage:
 *   node run-benchmark.mjs            # run everything
 *   node run-benchmark.mjs --skip-index   # reuse existing indexes
 *   node run-benchmark.mjs --force        # rerun tasks that already have runs
 *   node run-benchmark.mjs --tasks-only   # only run agent tasks (reuse index/toolkit)
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const ATLAS = path.join(ROOT, "node_modules", ".bin", "atlas");
const MCP_BIN = path.join(ROOT, "node_modules", ".bin", "codeatlas-mcp");
const MODEL = "opencode/deepseek-v4-flash-free";
const OPENCODE = "opencode";

const flags = process.argv.slice(2);
const SKIP_INDEX = flags.includes("--skip-index");
const FORCE = flags.includes("--force");
const TASKS_ONLY = flags.includes("--tasks-only");

const REPOS = [
  { id: "repo-01", name: "winston", checkout: path.join(__dirname, "repos", "repo-01") },
  { id: "repo-02", name: "commander.js", checkout: path.join(__dirname, "repos", "repo-02") },
  { id: "repo-03", name: "axios", checkout: path.join(__dirname, "repos", "repo-03") },
  { id: "repo-04", name: "rxjs", checkout: path.join(__dirname, "repos", "repo-04") },
];

const DEFAULT_TIMEOUT_MS = 540_000;

// ---------------------------------------------------------------------------
// Process helpers (argument-array spawn only — no shell strings)
// ---------------------------------------------------------------------------
function runCmd(file, args, { timeoutMs = 300_000, cwd = ROOT } = {}) {
  const start = performance.now();
  const res = spawnSync(file, args, { encoding: "utf-8", timeout: timeoutMs, cwd, stdio: ["ignore", "pipe", "pipe"] });
  return {
    code: res.status,
    signal: res.signal,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    durationMs: Math.round(performance.now() - start),
  };
}

function runCmdAsync(file, args, { timeoutMs = DEFAULT_TIMEOUT_MS, cwd = ROOT, onLine } = {}) {
  return new Promise((resolve) => {
    const child = spawn(file, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let buffer = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => {
      const text = String(d);
      stdout += text;
      if (onLine) {
        buffer += text;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (t) onLine(t);
        }
      }
    });
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut: signal === "SIGKILL" });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: null, signal: null, stdout, stderr, error: String(err), timedOut: false });
    });
  });
}

// ---------------------------------------------------------------------------
// Environment snapshot
// ---------------------------------------------------------------------------
function cpuInfo() {
  try {
    const txt = fs.readFileSync("/proc/cpuinfo", "utf-8");
    const model = txt.match(/model name\s*:\s*(.+)/)?.[1]?.trim() ?? "unknown";
    const cores = txt.match(/^processor\s*:\s*\d+$/gm)?.length ?? 0;
    return { model, cores };
  } catch {
    return { model: "unknown", cores: 0 };
  }
}
function memInfo() {
  try {
    const txt = fs.readFileSync("/proc/meminfo", "utf-8");
    const total = txt.match(/MemTotal:\s*(\d+)/)?.[1];
    return total ? `${Math.round((Number(total) / 1024 / 1024) * 100) / 100} GiB` : "unknown";
  } catch {
    return "unknown";
  }
}
function versionOf(file, arg) {
  const r = spawnSync(file, [arg], { encoding: "utf-8", timeout: 15000, stdio: ["ignore", "pipe", "pipe"] });
  return (r.stdout || "").split("\n")[0]?.trim() || r.stderr?.trim() || "N/A";
}

function snapshotEnvironment() {
  const uname = spawnSync("uname", ["-r"], { encoding: "utf-8" }).stdout.trim();
  const cpu = cpuInfo();
  return {
    capturedAt: new Date().toISOString(),
    os: { platform: os.platform(), release: os.release(), kernel: uname },
    cpu,
    ram: memInfo(),
    node: process.version,
    opencode: versionOf(OPENCODE, "--version"),
    codeatlas_cli: versionOf(ATLAS, "--version"),
    git: versionOf("git", "--version"),
    go: versionOf("go", "version"),
    model: MODEL,
    provider: "opencode",
  };
}

// ---------------------------------------------------------------------------
// MCP startup probe
// ---------------------------------------------------------------------------
async function measureMcpStartup(repoAbsPath) {
  const reqs = [
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "probe", version: "1.0" } } }),
    "",
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    "",
  ];
  const start = performance.now();
  const child = spawn(MCP_BIN, [], { cwd: ROOT, env: { ...process.env, ATLAS_ROOT: repoAbsPath }, stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => (out += String(d)));
  child.stderr.on("data", () => {});
  try {
    for (const line of reqs) child.stdin.write(line + "\n");
    child.stdin.end();
    await new Promise((r) => setTimeout(r, 8000));
    child.kill("SIGKILL");
  } catch {
    /* ignore */
  }
  const initOk = out.includes('"initialize"') && out.includes('"serverInfo"');
  const toolsOk = out.includes('"tools/list"') || out.includes('"tools"');
  return { startupMs: Math.round(performance.now() - start), initOk, toolsOk, tools: (out.match(/"name":"[a-z_]+"/g) || []).map((m) => m.slice(8, -1)) };
}

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------
function extractFirstJson(text) {
  // Robustly pull the first balanced JSON object out of stdout that may also
  // contain human-readable trailers (e.g. the post-init "Recommended tools" text).
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function indexRepo(repoAbsPath) {
  const codeatlasDir = path.join(repoAbsPath, ".codeatlas");
  if (fs.existsSync(codeatlasDir)) fs.rmSync(codeatlasDir, { recursive: true, force: true });
  const res = runCmd(ATLAS, ["init", "--repo", repoAbsPath, "--json", "--tools", "none"], { timeoutMs: 900_000 });
  const parsed = extractFirstJson(res.stdout);
  let sizeBytes = 0;
  if (fs.existsSync(codeatlasDir)) {
    for (const f of walk(codeatlasDir)) sizeBytes += fs.statSync(f).size;
  }
  return {
    durationMs: res.durationMs,
    exitCode: res.code,
    stdout: res.stdout.slice(0, 4000),
    stderr: res.stderr.slice(0, 2000),
    parsed,
    indexSizeBytes: sizeBytes,
  };
}
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Toolkit measurement (machine-level)
// ---------------------------------------------------------------------------
function toolkitMeasure() {
  const commands = [
    ["tools", "overview", "--json"],
    ["tools", "categories", "--json"],
    ["tools", "search", "formatter", "--json"],
    ["tools", "search", "linter", "--json"],
    ["tools", "info", "ripgrep", "--json"],
    ["tools", "doctor", "--json"],
    ["agents", "status", "--json"],
  ];
  return commands.map((args) => {
    const res = runCmd(ATLAS, args, { timeoutMs: 120_000 });
    return {
      command: `atlas ${args.join(" ")}`,
      args,
      durationMs: res.durationMs,
      exitCode: res.code,
      stdoutPreview: res.stdout.slice(0, 600),
    };
  });
}

// ---------------------------------------------------------------------------
// CodeAtlas context assembly measurement (deterministic, per task)
// ---------------------------------------------------------------------------
function contextBuildMeasure(repoAbsPath, task) {
  const res = runCmd(ATLAS, ["context", "build", task.prompt, "--repo", repoAbsPath, "--json"], { timeoutMs: 120_000 });
  const parsed = extractFirstJson(res.stdout);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const content = items.map((i) => i.content ?? "").join("\n");
  const estimatedTokens = Math.ceil(content.length / 4);
  const budget = parsed?.budget ?? null;
  return {
    durationMs: res.durationMs,
    exitCode: res.code,
    itemCount: items.length,
    kinds: countKinds(items),
    estimatedTokens,
    budgetExceeded: budget?.exceeded ?? null,
    budgetRecord: budget,
    stderr: res.stderr.slice(0, 1000),
  };
}
function countKinds(items) {
  const m = {};
  for (const i of items) m[i.kind] = (m[i.kind] ?? 0) + 1;
  return m;
}

// ---------------------------------------------------------------------------
// opencode run + metric extraction
// ---------------------------------------------------------------------------
function parseRunEvents(lines) {
  const metrics = { input: 0, output: 0, reasoning: 0, total: 0, cacheWrite: 0, cacheRead: 0, cost: 0, steps: 0 };
  const texts = [];
  const toolCalls = [];
  const toolErrors = [];
  const timestamps = [];
  for (const line of lines) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.timestamp) timestamps.push(ev.timestamp);
    if (ev.type === "step_finish") {
      const t = ev.part?.tokens;
      if (t) {
        metrics.input += t.input ?? 0;
        metrics.output += t.output ?? 0;
        metrics.reasoning += t.reasoning ?? 0;
        metrics.total += t.total ?? 0;
        metrics.cacheWrite += t.cache?.write ?? 0;
        metrics.cacheRead += t.cache?.read ?? 0;
        metrics.cost += ev.cost ?? 0;
        metrics.steps += 1;
      }
    }
    if (ev.type === "text" && typeof ev.part?.text === "string") {
      texts.push(ev.part.text);
    }
    if (ev.type === "tool_use") {
      const p = ev.part ?? {};
      toolCalls.push({
        tool: p.tool ?? "unknown",
        callID: p.callID,
        status: p.state?.status ?? "unknown",
        input: p.input ?? {},
        output: p.state?.output ?? null,
        outputIsError: p.state?.isError ?? false,
        durationMs: p.time?.start && p.time?.end ? Math.round(p.time.end - p.time.start) : null,
      });
      if (p.state?.status === "error" || p.state?.isError) toolErrors.push(p.tool);
    }
  }
  const first = timestamps[0];
  const last = timestamps[timestamps.length - 1];
  return {
    metrics,
    finalText: texts[texts.length - 1] ?? "",
    allText: texts.join("\n"),
    textChunks: texts,
    toolCalls,
    toolErrors,
    eventSpanMs: first && last ? Math.round(last - first) : null,
  };
}

function writeOpenCodeConfig(repoAbsPath, enabled) {
  const cfgPath = path.join(repoAbsPath, "opencode.json");
  if (!enabled) {
    if (fs.existsSync(cfgPath)) fs.rmSync(cfgPath);
    return;
  }
  fs.writeFileSync(
    cfgPath,
    JSON.stringify(
      {
        mcp: {
          codeatlas: {
            type: "local",
            command: [MCP_BIN],
            enabled: true,
            environment: { ATLAS_ROOT: repoAbsPath },
          },
        },
      },
      null,
      2
    )
  );
}

async function runOcode(repoAbsPath, prompt, mode, timeoutMs) {
  const events = [];
  const start = performance.now();
  const res = await runCmdAsync(OPENCODE, ["run", "--format", "json", "--model", MODEL, "--dir", repoAbsPath, prompt], {
    timeoutMs,
    cwd: repoAbsPath,
    onLine: (l) => events.push(l),
  });
  const wallMs = Math.round(performance.now() - start);
  const parsed = parseRunEvents(events);
  return {
    mode,
    exitCode: res.code,
    timedOut: res.timedOut,
    wallMs,
    stderrPreview: res.stderr.slice(0, 2000),
    ...parsed,
    events,
  };
}

// ---------------------------------------------------------------------------
// Evaluation helpers
// ---------------------------------------------------------------------------
function norm(s) {
  return (s ?? "").toLowerCase().replace(/[_/-]/g, " ").replace(/\s+/g, " ").trim();
}
function conceptHits(concepts, finalText) {
  const n = norm(finalText);
  const hits = [];
  for (const c of concepts) {
    if (n.includes(norm(c))) hits.push(c);
  }
  return hits;
}
function fileHits(expectedFiles, haystack) {
  const n = norm(haystack);
  const hits = [];
  for (const f of expectedFiles) {
    const base = path.basename(f);
    if (n.includes(norm(base))) hits.push(f);
  }
  return hits;
}
function citedPaths(text, repoAbsPath) {
  // Extract plausible repo-relative paths cited by the agent and verify them.
  const patterns = [
    /\b(?:lib|src|test|tests|spec|packages|scripts|docs|tools|typings|bin)\/[A-Za-z0-9_./-]+\.(?:js|ts|tsx|jsx|mjs|cjs|d\.ts|json|md)/g,
  ];
  const found = new Set();
  for (const re of patterns) {
    for (const m of text.match(re) ?? []) {
      const p = m.replace(/[.,;:)"]+$/, "");
      if (fs.existsSync(path.join(repoAbsPath, p))) found.add(p);
      else if (fs.existsSync(path.join(repoAbsPath, p.replace(/^\.\//, "")))) found.add(p.replace(/^\.\//, ""));
    }
  }
  return [...found];
}

// ---------------------------------------------------------------------------
// Raw results / persistence
// ---------------------------------------------------------------------------
function repoDir(repoId) {
  return path.join(__dirname, repoId);
}
function saveJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function loadJson(file) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("CodeAtlas Final Benchmark (2026-08)");
  console.log("====================================");
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Model: ${MODEL}  Provider: opencode`);
  console.log(`Flags: skipIndex=${SKIP_INDEX} force=${FORCE} tasksOnly=${TASKS_ONLY}`);

  const env = snapshotEnvironment();
  saveJson(path.join(__dirname, "environment.json"), env);
  console.log(`Environment snapshot saved (node ${env.node}, opencode ${env.opencode}, atlas ${env.codeatlas_cli}).`);

  if (flags.includes("--env-only")) {
    console.log("--env-only: snapshot written, exiting.");
    return;
  }

  // Verify prerequisites
  const atlasOk = fs.existsSync(ATLAS);
  const mcpOk = fs.existsSync(MCP_BIN);
  if (!atlasOk || !mcpOk) {
    console.error("atlas CLI or codeatlas-mcp binary missing. Run `pnpm build` first.");
    process.exit(1);
  }

  // Toolkit measurement (machine-level; run once)
  let toolkit = null;
  const toolkitPath = path.join(__dirname, "toolkit-results.json");
  if (!TASKS_ONLY && !SKIP_INDEX) {
    console.log("\n[toolkit] Measuring CodeAtlas Toolkit (CLI)...");
    toolkit = toolkitMeasure();
    saveJson(toolkitPath, toolkit);
    for (const t of toolkit) console.log(`  ${t.command} -> ${t.durationMs}ms exit=${t.exitCode}`);
  } else {
    toolkit = loadJson(toolkitPath);
  }

  let grandTotal = { baseline: { tokens: 0, cost: 0 }, codeatlas: { tokens: 0, cost: 0 }, tasks: 0 };

  for (const repo of REPOS) {
    const tasks = loadJson(path.join(__dirname, "tasks", `${repo.id}.json`))?.tasks;
    if (!tasks) {
      console.error(`Task suite missing for ${repo.id}`);
      process.exit(1);
    }
    console.log(`\n${"=".repeat(64)}`);
    console.log(`REPO ${repo.id} — ${repo.name}  (${repo.checkout})`);
    console.log(`${"=".repeat(64)}`);

    if (!fs.existsSync(repo.checkout)) {
      console.error(`Checkout missing: ${repo.checkout}. Run the repo-prep step first.`);
      process.exit(1);
    }
    fs.mkdirSync(repoDir(repo.id), { recursive: true });
    fs.mkdirSync(path.join(repoDir(repo.id), "runs"), { recursive: true });

    // 1. Index (unless skipped)
    let index = null;
    const indexPath = path.join(repoDir(repo.id), "index-metrics.json");
    if (!SKIP_INDEX && !TASKS_ONLY) {
      console.log(`  [index] Running clean atlas init...`);
      index = indexRepo(repo.checkout);
      saveJson(indexPath, index);
      console.log(`  [index] ${index.durationMs}ms, exit=${index.exitCode}, parsed=${index.parsed ? "ok" : "FAIL"}, indexSize=${(index.indexSizeBytes / 1024 / 1024).toFixed(2)} MiB`);
      if (index.parsed) console.log(`          files=${index.parsed.files ?? index.parsed.filesIndexed ?? "?"} symbols=${index.parsed.symbols ?? index.parsed.symbolsIndexed ?? "?"} deps=${index.parsed.dependencies ?? index.parsed.dependenciesIndexed ?? "?"}`);
    } else {
      index = loadJson(indexPath);
      console.log(`  [index] using existing metrics (${index?.durationMs ?? "?"}ms)`);
    }

    // MCP startup probe
    let mcp = null;
    const mcpPath = path.join(repoDir(repo.id), "mcp-startup.json");
    if (!TASKS_ONLY) {
      console.log(`  [mcp] probing codeatlas-mcp startup against this repo...`);
      mcp = await measureMcpStartup(repo.checkout);
      saveJson(mcpPath, mcp);
      console.log(`  [mcp] startup ~${mcp.startupMs}ms init=${mcp.initOk} tools=${mcp.toolsOk} (${mcp.tools.length} tools)`);
    } else {
      mcp = loadJson(mcpPath);
    }

    // 2. Context assembly per task (deterministic)
    const contextBuilds = [];
    const ctxPath = path.join(repoDir(repo.id), "context-build-metrics.json");
    if (!TASKS_ONLY) {
      console.log(`  [context] measuring deterministic context assembly for ${tasks.length} tasks...`);
      for (const t of tasks) {
        const m = contextBuildMeasure(repo.checkout, t);
        contextBuilds.push({ taskId: t.id, ...m });
        console.log(`    ${t.id}: ${m.durationMs}ms items=${m.itemCount} estTokens=${m.estimatedTokens} exit=${m.exitCode}`);
      }
      saveJson(ctxPath, contextBuilds);
    } else {
      contextBuilds.push(...(loadJson(ctxPath) ?? []));
    }

    // 3. Run tasks in both modes
    const taskResults = [];
    for (const t of tasks) {
      const base = `${t.id}`;
      const baselineFile = path.join(repoDir(repo.id), "runs", `${base}-baseline.json`);
      const codeatlasFile = path.join(repoDir(repo.id), "runs", `${base}-codeatlas.json`);

      console.log(`\n  [task] ${t.id} (${t.category}) — ${t.prompt.slice(0, 70)}...`);

      const existingBaseline = loadJson(baselineFile);
      const existingCodeatlas = loadJson(codeatlasFile);

      let baseline = existingBaseline;
      if (!FORCE && baseline?.mode === "baseline" && baseline?.metrics?.steps > 0) {
        console.log(`    baseline: reusing existing run`);
      } else {
        console.log(`    baseline: opencode run (no CodeAtlas MCP)...`);
        writeOpenCodeConfig(repo.checkout, false);
        baseline = await runOcode(repo.checkout, t.prompt, "baseline", t.max_seconds ? t.max_seconds * 1000 : DEFAULT_TIMEOUT_MS);
        saveJson(baselineFile, { taskId: t.id, ...baseline });
        console.log(`      -> ${baseline.wallMs}ms tokens=${baseline.metrics.total} cost=${baseline.metrics.cost} exit=${baseline.exitCode} timedOut=${baseline.timedOut}`);
      }

      let codeatlas = existingCodeatlas;
      if (!FORCE && codeatlas?.mode === "codeatlas" && codeatlas?.metrics?.steps > 0) {
        console.log(`    codeatlas: reusing existing run`);
      } else {
        console.log(`    codeatlas: opencode run (CodeAtlas MCP enabled)...`);
        writeOpenCodeConfig(repo.checkout, true);
        codeatlas = await runOcode(repo.checkout, t.prompt, "codeatlas", t.max_seconds ? t.max_seconds * 1000 : DEFAULT_TIMEOUT_MS);
        saveJson(codeatlasFile, { taskId: t.id, ...codeatlas });
        const toolNames = codeatlas.toolCalls.map((c) => c.tool);
        console.log(`      -> ${codeatlas.wallMs}ms tokens=${codeatlas.metrics.total} cost=${codeatlas.metrics.cost} exit=${codeatlas.exitCode} tools=[${toolNames.join(", ")}]`);
      }
      writeOpenCodeConfig(repo.checkout, false);

      // Evaluation (automated pass; manual review refines scores later)
      const evalBaseline = evaluateTask(t, baseline.finalText, baseline.toolCalls, repo.checkout);
      const evalCodeatlas = evaluateTask(t, codeatlas.finalText, codeatlas.toolCalls, repo.checkout);

      const result = {
        id: t.id,
        category: t.category,
        prompt: t.prompt,
        baseline: {
          input_tokens: baseline.metrics.input,
          output_tokens: baseline.metrics.output,
          reasoning_tokens: baseline.metrics.reasoning,
          total_tokens: baseline.metrics.total,
          cache_write: baseline.metrics.cacheWrite,
          cache_read: baseline.metrics.cacheRead,
          cost: baseline.metrics.cost,
          steps: baseline.metrics.steps,
          duration_ms: baseline.wallMs,
          timed_out: baseline.timedOut,
          exit_code: baseline.exitCode,
          final_text: baseline.finalText,
          tool_calls: baseline.toolCalls.length,
          cited_files: evalBaseline.cited,
        },
        codeatlas: {
          input_tokens: codeatlas.metrics.input,
          output_tokens: codeatlas.metrics.output,
          reasoning_tokens: codeatlas.metrics.reasoning,
          total_tokens: codeatlas.metrics.total,
          cache_write: codeatlas.metrics.cacheWrite,
          cache_read: codeatlas.metrics.cacheRead,
          cost: codeatlas.metrics.cost,
          steps: codeatlas.metrics.steps,
          duration_ms: codeatlas.wallMs,
          timed_out: codeatlas.timedOut,
          exit_code: codeatlas.exitCode,
          final_text: codeatlas.finalText,
          tool_calls: codeatlas.toolCalls,
          tool_count: codeatlas.toolCalls.length,
          tool_errors: codeatlas.toolErrors,
          cited_files: evalCodeatlas.cited,
        },
        evaluation: {
          baseline: evalBaseline.eval,
          codeatlas: evalCodeatlas.eval,
          context_build: contextBuilds.find((c) => c.taskId === t.id) ?? null,
        },
      };
      taskResults.push(result);
      grandTotal.baseline.tokens += result.baseline.total_tokens;
      grandTotal.codeatlas.tokens += result.codeatlas.total_tokens;
      grandTotal.baseline.cost += result.baseline.cost;
      grandTotal.codeatlas.cost += result.codeatlas.cost;
      grandTotal.tasks += 1;
    }

    // Save per-repo raw results
    const raw = {
      repository: repo.id,
      name: repo.name,
      checkout: repo.checkout,
      commit: getCommit(repo.checkout),
      tasks: taskResults,
      index: index,
      mcp: mcp,
      toolkit: toolkit,
      context_builds: contextBuilds,
      environment: env,
      generatedAt: new Date().toISOString(),
    };
    saveJson(path.join(repoDir(repo.id), "raw-results.json"), raw);
    console.log(`\n  Saved raw-results.json for ${repo.id} (${taskResults.length} tasks).`);
  }

  console.log(`\n${"=".repeat(64)}`);
  console.log("Benchmark runs complete.");
  console.log(`Tasks executed: ${grandTotal.tasks}`);
  console.log(`Baseline total tokens: ${grandTotal.baseline.tokens}`);
  console.log(`CodeAtlas total tokens: ${grandTotal.codeatlas.tokens}`);
  console.log("Next: node generate-reports.mjs");
}

function getCommit(repoPath) {
  const r = spawnSync("git", ["-C", repoPath, "rev-parse", "HEAD"], { encoding: "utf-8" });
  return r.stdout.trim();
}

function evaluateTask(task, finalText, toolCalls, repoAbsPath) {
  const fileHaystack = finalText + "\n" + toolCalls.map((c) => (typeof c.output === "string" ? c.output : JSON.stringify(c.output ?? ""))).join("\n");
  const filesFound = fileHits(task.expected_files, fileHaystack);
  const conceptsFound = conceptHits(task.expected_concepts, finalText);
  const cited = citedPaths(finalText, repoAbsPath);
  const filesExpected = task.expected_files.length;
  const conceptsExpected = task.expected_concepts.length;
  const fileRatio = filesExpected ? filesFound.length / filesExpected : 0;
  const conceptRatio = conceptsExpected ? conceptsFound.length / conceptsExpected : 0;
  let score;
  let status;
  if (fileRatio >= 0.5 && conceptRatio >= 0.5) { score = 2; status = "correct"; }
  else if (fileRatio >= 0.2 || conceptRatio >= 0.2) { score = 1; status = "partially_correct"; }
  else if (finalText.trim().length > 20) { score = 0; status = "incorrect"; }
  else { score = 0; status = "failed"; }
  return {
    eval: {
      score,
      status,
      files_found: filesFound,
      files_expected: task.expected_files,
      file_ratio: Math.round(fileRatio * 100) / 100,
      concepts_found: conceptsFound,
      concepts_expected: task.expected_concepts,
      concept_ratio: Math.round(conceptRatio * 100) / 100,
      cited_files: cited,
    },
    cited,
  };
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});