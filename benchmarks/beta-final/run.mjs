#!/usr/bin/env node
/**
 * CodeAtlas Beta Final Benchmark Runner
 *
 * Runs the full benchmark: index repos, then execute every task in both
 * baseline (no MCP) and codeatlas (with MCP) modes via `opencode run --format json`.
 *
 * Usage:
 *   node run.mjs                    # run everything
 *   node run.mjs --skip-index       # reuse existing indexes
 *   node run.mjs --force            # rerun tasks that already have runs
 *   node run.mjs --tasks-only       # only run agent tasks
 *   node run.mjs --repo small-app   # only run one repo
 *   node run.mjs --task SA-T01      # only run one task
 *   node run.mjs --mode baseline    # only run baseline mode
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
const MODEL = null; // Use opencode's default model
const OPENCODE = "opencode";

const flags = process.argv.slice(2);
const SKIP_INDEX = flags.includes("--skip-index");
const FORCE = flags.includes("--force");
const TASKS_ONLY = flags.includes("--tasks-only");
const ONLY_REPO = flags.find((f, i) => flags[i - 1] === "--repo") ?? null;
const ONLY_TASK = flags.find((f, i) => flags[i - 1] === "--task") ?? null;
const ONLY_MODE = flags.find((f, i) => flags[i - 1] === "--mode") ?? null;

const REPOS = [
  { id: "small-app", name: "Task Manager API", tasksFile: "small-app.json" },
  { id: "medium-api", name: "SaaS Platform API", tasksFile: "medium-api.json" },
  { id: "monorepo", name: "Project Management Platform", tasksFile: "monorepo.json" },
];

const DEFAULT_TIMEOUT_MS = 600_000;

// ---------------------------------------------------------------------------
// Process helpers
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
      if (buffer.trim()) onLine?.(buffer.trim());
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
  return {
    capturedAt: new Date().toISOString(),
    os: { platform: os.platform(), release: os.release() },
    cpu: cpuInfo(),
    ram: memInfo(),
    node: process.version,
    opencode: versionOf(OPENCODE, "--version"),
    codeatlas_cli: versionOf(ATLAS, "--version"),
    model: MODEL,
    provider: "opencode",
  };
}

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------
function extractFirstJson(text) {
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
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
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
  return { durationMs: res.durationMs, exitCode: res.code, parsed, indexSizeBytes: sizeBytes, stderr: res.stderr.slice(0, 2000) };
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
  } catch { /* ignore */ }
  const initOk = out.includes('"initialize"') && out.includes('"serverInfo"');
  const toolsOk = out.includes('"tools/list"') || out.includes('"tools"');
  return { startupMs: Math.round(performance.now() - start), initOk, toolsOk, tools: (out.match(/"name":"[a-z_]+"/g) || []).map((m) => m.slice(8, -1)) };
}

// ---------------------------------------------------------------------------
// Context assembly measurement
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
    estimatedTokens,
    budgetExceeded: budget?.exceeded ?? null,
  };
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
    if (ev.type === "text" && typeof ev.part?.text === "string") texts.push(ev.part.text);
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
    JSON.stringify({
      mcp: {
        codeatlas: {
          type: "local",
          command: [MCP_BIN],
          enabled: true,
          environment: { ATLAS_ROOT: repoAbsPath },
        },
      },
    }, null, 2)
  );
}

async function runOcode(repoAbsPath, prompt, mode, timeoutMs) {
  const events = [];
  const start = performance.now();
  const args = ["run", "--format", "json", "--dir", repoAbsPath, prompt];
  if (MODEL) args.splice(3, 0, "--model", MODEL);
  const res = await runCmdAsync(OPENCODE, args, {
    timeoutMs,
    cwd: repoAbsPath,
    onLine: (l) => events.push(l),
  });
  const wallMs = Math.round(performance.now() - start);
  const parsed = parseRunEvents(events);
  return { mode, exitCode: res.code, timedOut: res.timedOut, wallMs, stderrPreview: res.stderr.slice(0, 2000), ...parsed, events };
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
    eval: { score, status, files_found: filesFound, files_expected: task.expected_files, file_ratio: Math.round(fileRatio * 100) / 100, concepts_found: conceptsFound, concepts_expected: task.expected_concepts, concept_ratio: Math.round(conceptRatio * 100) / 100, cited_files: cited },
    cited,
  };
}

// ---------------------------------------------------------------------------
// Honest reporting (beta audit Fix 8): per-task breakdown, classification,
// and correlation analysis — never hide failures behind aggregates.
// ---------------------------------------------------------------------------
function classifyTask(t) {
  if (!t.success) return "FAILED";
  if (t.accuracyDelta < 0) return "REGRESSION";
  if (t.tokenSavingsPercent > 50 && t.accuracyDelta >= 0) return "WIN";
  return "NEUTRAL";
}

function generateReport(allResults) {
  // Pair baseline and codeatlas runs per task so every task gets an honest
  // side-by-side comparison.
  const byTask = new Map();
  for (const r of allResults) {
    const key = `${r.repoId}/${r.taskId}`;
    if (!byTask.has(key)) byTask.set(key, {});
    byTask.get(key)[r.mode] = r;
  }

  const perTask = [];
  for (const [key, pair] of byTask) {
    const b = pair.baseline;
    const c = pair.codeatlas;
    if (!b || !c) {
      perTask.push({ taskId: key, classification: "INCOMPLETE", reason: "missing baseline or codeatlas run" });
      continue;
    }
    const cScore = c.evaluation?.eval?.score ?? 0;
    const bScore = b.evaluation?.eval?.score ?? 0;
    const baselineTokens = b.metrics?.total ?? 0;
    const tokens = c.metrics?.total ?? 0;
    const savings = baselineTokens > 0 ? (100 * (baselineTokens - tokens)) / baselineTokens : 0;
    const entry = {
      taskId: key,
      taskType: c.category,
      success: cScore === 2,
      score: cScore,
      baselineScore: bScore,
      accuracyDelta: (cScore - bScore) / 2,
      tokens,
      baselineTokens,
      tokenSavingsPercent: Math.round(savings * 10) / 10,
      toolCalls: (c.toolCalls ?? []).length,
      baselineToolCalls: (b.toolCalls ?? []).length,
      durationMs: c.wallMs ?? 0,
      timedOut: Boolean(c.timedOut || b.timedOut),
    };
    entry.classification = classifyTask(entry);
    perTask.push(entry);
  }
  perTask.sort((a, b) => String(a.taskId).localeCompare(String(b.taskId)));

  const successfulTasks = perTask.filter((t) => t.success).length;
  const failedTasks = perTask.filter((t) => t.success === false).length;
  const report = {
    summary: {
      totalTasks: perTask.length,
      successfulTasks,
      failedTasks,
    },
    // Per-task breakdown (always included — the aggregate must never be the
    // only view; see AUDIT Fix 8).
    perTask,
    // Correlation analysis: where do savings and accuracy trade off?
    correlation: {
      highTokenSavings: perTask.filter((t) => t.tokenSavingsPercent > 50),
      accuracyLoss: perTask.filter((t) => t.accuracyDelta < 0),
      wins: perTask.filter((t) => t.classification === "WIN"),
      regressions: perTask.filter((t) => t.classification === "REGRESSION"),
      failures: perTask.filter((t) => t.classification === "FAILED"),
      timeouts: perTask.filter((t) => t.timedOut),
    },
    // Never hide failures behind aggregates.
    aggregateWarning:
      failedTasks > 0
        ? "⚠️ Some tasks failed. Aggregate metrics may be misleading. See perTask breakdown."
        : undefined,
  };
  return report;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
function repoDir(repoId) { return path.join(__dirname, "results", repoId); }
function saveJson(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function loadJson(file) { if (!fs.existsSync(file)) return null; try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return null; } }
function getCommit(repoPath) { const r = spawnSync("git", ["-C", repoPath, "rev-parse", "HEAD"], { encoding: "utf-8" }); return r.stdout.trim(); }

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("CodeAtlas Beta Final Benchmark");
  console.log("==============================");
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Model: ${MODEL}  Provider: opencode`);
  console.log(`Flags: skipIndex=${SKIP_INDEX} force=${FORCE} tasksOnly=${TASKS_ONLY} onlyRepo=${ONLY_REPO} onlyTask=${ONLY_TASK} onlyMode=${ONLY_MODE}`);

  const env = snapshotEnvironment();
  saveJson(path.join(__dirname, "results", "environment.json"), env);
  console.log(`Environment saved (node ${env.node}, opencode ${env.opencode}, atlas ${env.codeatlas_cli}).`);

  if (flags.includes("--env-only")) { console.log("--env-only: exiting."); return; }

  const atlasOk = fs.existsSync(ATLAS);
  const mcpOk = fs.existsSync(MCP_BIN);
  if (!atlasOk || !mcpOk) {
    console.error("atlas CLI or codeatlas-mcp binary missing. Run `pnpm build` first.");
    process.exit(1);
  }

  const grandTotal = { baseline: { tokens: 0, cost: 0, duration: 0, tasks: 0 }, codeatlas: { tokens: 0, cost: 0, duration: 0, tasks: 0 }, baseline_correct: 0, codeatlas_correct: 0, total_tasks: 0 };
  const allResults = [];

  for (const repo of REPOS) {
    if (ONLY_REPO && repo.id !== ONLY_REPO) continue;

    const tasksPath = path.join(__dirname, "tasks", repo.tasksFile);
    const tasksData = loadJson(tasksPath);
    if (!tasksData) { console.error(`Tasks missing: ${tasksPath}`); process.exit(1); }
    const repoPath = tasksData.path;

    console.log(`\n${"=".repeat(72)}`);
    console.log(`REPO: ${repo.id} — ${repo.name}`);
    console.log(`Path: ${repoPath}`);
    console.log(`${"=".repeat(72)}`);

    fs.mkdirSync(repoDir(repo.id), { recursive: true });
    fs.mkdirSync(path.join(repoDir(repo.id), "runs"), { recursive: true });

    // 1. Index
    let index = null;
    const indexPath = path.join(repoDir(repo.id), "index-metrics.json");
    if (!SKIP_INDEX && !TASKS_ONLY) {
      console.log(`  [index] Running clean atlas init...`);
      index = indexRepo(repoPath);
      saveJson(indexPath, index);
      console.log(`  [index] ${index.durationMs}ms exit=${index.exitCode} parsed=${index.parsed ? "ok" : "FAIL"} size=${(index.indexSizeBytes / 1024 / 1024).toFixed(2)} MiB`);
      if (index.parsed) console.log(`          files=${index.parsed.files ?? index.parsed.filesIndexed ?? "?"} symbols=${index.parsed.symbols ?? index.parsed.symbolsIndexed ?? "?"} deps=${index.parsed.dependencies ?? index.parsed.dependenciesIndexed ?? "?"}`);
    } else {
      index = loadJson(indexPath);
      console.log(`  [index] using existing (${index?.durationMs ?? "?"}ms)`);
    }

    // 2. MCP probe
    let mcp = null;
    if (!TASKS_ONLY) {
      console.log(`  [mcp] probing startup...`);
      mcp = await measureMcpStartup(repoPath);
      console.log(`  [mcp] ${mcp.startupMs}ms init=${mcp.initOk} tools=${mcp.toolsOk} (${mcp.tools.length} tools)`);
      saveJson(path.join(repoDir(repo.id), "mcp-startup.json"), mcp);
    }

    // 3. Context builds
    const contextBuilds = [];
    if (!TASKS_ONLY) {
      console.log(`  [context] measuring context assembly...`);
      for (const t of tasksData.tasks) {
        const m = contextBuildMeasure(repoPath, t);
        contextBuilds.push({ taskId: t.id, ...m });
        console.log(`    ${t.id}: ${m.durationMs}ms items=${m.itemCount} tokens=${m.estimatedTokens}`);
      }
      saveJson(path.join(repoDir(repo.id), "context-builds.json"), contextBuilds);
    }

    // 4. Run tasks
    for (const t of tasksData.tasks) {
      if (ONLY_TASK && t.id !== ONLY_TASK) continue;

      console.log(`\n  [task] ${t.id} (${t.category}) — ${t.prompt.slice(0, 80)}...`);

      for (const mode of ["baseline", "codeatlas"]) {
        if (ONLY_MODE && mode !== ONLY_MODE) continue;

        const resultFile = path.join(repoDir(repo.id), "runs", `${t.id}-${mode}.json`);
        const existing = loadJson(resultFile);

        if (!FORCE && existing?.metrics?.steps > 0) {
          console.log(`    ${mode}: reusing existing run (${existing.wallMs}ms, ${existing.metrics.total} tokens)`);
          const evalResult = evaluateTask(t, existing.finalText ?? "", existing.toolCalls ?? [], repoPath);
          allResults.push({ repoId: repo.id, taskId: t.id, category: t.category, mode, ...existing, evaluation: evalResult });
          if (mode === "baseline") { grandTotal.baseline.tokens += existing.metrics.total; grandTotal.baseline.cost += existing.metrics.cost; grandTotal.baseline.duration += existing.wallMs; grandTotal.baseline.tasks++; if (evalResult.eval.score === 2) grandTotal.baseline_correct++; }
          else { grandTotal.codeatlas.tokens += existing.metrics.total; grandTotal.codeatlas.cost += existing.metrics.cost; grandTotal.codeatlas.duration += existing.wallMs; grandTotal.codeatlas.tasks++; if (evalResult.eval.score === 2) grandTotal.codeatlas_correct++; }
          grandTotal.total_tasks++;
          continue;
        }

        console.log(`    ${mode}: running opencode...`);
        if (mode === "codeatlas") writeOpenCodeConfig(repoPath, true);
        else writeOpenCodeConfig(repoPath, false);

        const timeoutMs = t.max_seconds ? t.max_seconds * 1000 : DEFAULT_TIMEOUT_MS;
        const result = await runOcode(repoPath, t.prompt, mode, timeoutMs);
        writeOpenCodeConfig(repoPath, false);

        const evalResult = evaluateTask(t, result.finalText, result.toolCalls, repoPath);
        const toolNames = result.toolCalls.map((c) => c.tool);

        saveJson(resultFile, { taskId: t.id, category: t.category, ...result });
        allResults.push({ repoId: repo.id, taskId: t.id, category: t.category, mode, ...result, evaluation: evalResult });

        console.log(`      ${mode}: ${result.wallMs}ms tokens=${result.metrics.total} cost=${result.metrics.cost} exit=${result.exitCode} tools=[${toolNames.join(", ")}] score=${evalResult.eval.score}`);

        if (mode === "baseline") { grandTotal.baseline.tokens += result.metrics.total; grandTotal.baseline.cost += result.metrics.cost; grandTotal.baseline.duration += result.wallMs; grandTotal.baseline.tasks++; if (evalResult.eval.score === 2) grandTotal.baseline_correct++; }
        else { grandTotal.codeatlas.tokens += result.metrics.total; grandTotal.codeatlas.cost += result.metrics.cost; grandTotal.codeatlas.duration += result.wallMs; grandTotal.codeatlas.tasks++; if (evalResult.eval.score === 2) grandTotal.codeatlas_correct++; }
        grandTotal.total_tasks++;
      }
    }

    // Save per-repo summary
    const repoResults = allResults.filter((r) => r.repoId === repo.id);
    saveJson(path.join(repoDir(repo.id), "summary.json"), {
      repository: repo.id,
      name: repo.name,
      checkout: repoPath,
      commit: getCommit(repoPath),
      index, mcp, context_builds: contextBuilds,
      results: repoResults,
      environment: env,
      generatedAt: new Date().toISOString(),
    });
  }

  // Grand total
  saveJson(path.join(__dirname, "results", "grand-total.json"), { totals: grandTotal, allResults, environment: env, generatedAt: new Date().toISOString() });

  // Honest report (beta audit Fix 8): per-task breakdown + aggregate warning.
  const report = generateReport(allResults);
  saveJson(path.join(__dirname, "results", "report.json"), report);

  console.log(`\n${"=".repeat(72)}`);
  console.log("BENCHMARK COMPLETE");
  console.log(`${"=".repeat(72)}`);
  console.log(`Total tasks: ${grandTotal.total_tasks}`);
  console.log(`Baseline: ${grandTotal.baseline.tasks} tasks, ${grandTotal.baseline.tokens} tokens, ${grandTotal.baseline_correct}/${grandTotal.baseline.tasks} correct`);
  console.log(`CodeAtlas: ${grandTotal.codeatlas.tasks} tasks, ${grandTotal.codeatlas.tokens} tokens, ${grandTotal.codeatlas_correct}/${grandTotal.codeatlas.tasks} correct`);
  console.log(`\nPer-task classification (report.json):`);
  const counts = {};
  for (const t of report.perTask) counts[t.classification] = (counts[t.classification] ?? 0) + 1;
  for (const [cls, n] of Object.entries(counts)) console.log(`  ${cls}: ${n}`);
  for (const t of report.perTask) {
    if (t.classification === "FAILED" || t.classification === "REGRESSION" || t.classification === "INCOMPLETE") {
      console.log(`  ⚠️ ${t.taskId}: ${t.classification}${t.reason ? ` (${t.reason})` : ` score=${t.score} vs baseline=${t.baselineScore}`}`);
    }
  }
  if (report.aggregateWarning) console.log(report.aggregateWarning);
  console.log(`\nResults saved to: ${path.join(__dirname, "results")}`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
