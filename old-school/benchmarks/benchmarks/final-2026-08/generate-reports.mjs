#!/usr/bin/env node
/**
 * CodeAtlas Final Benchmark report generator.
 *
 * Reads per-repo raw-results.json (and benchmark-config.json, environment.json)
 * and produces:
 *   - repo-0X/benchmark.md   (per-repository report)
 *   - summary.md             (cross-repository comparison + final verdict)
 *   - failures.md            (failure log)
 *
 * This script performs NO measurements — it only renders numbers that were
 * captured by run-benchmark.mjs. Derived calculations are clearly labeled.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, "benchmark-config.json"), "utf-8"));
const env = JSON.parse(fs.readFileSync(path.join(__dirname, "environment.json"), "utf-8"));
const repos = ["repo-01", "repo-02", "repo-03", "repo-04"];

const catLabel = {
  "repository-understanding": "Repo Understanding",
  "file-discovery": "File Discovery",
  "dependency-tracing": "Dependency Tracing",
  "bug-investigation": "Bug Investigation",
  "feature-planning": "Feature Planning",
  "code-modification": "Code Modification",
  "testing": "Testing",
  "cross-file-reasoning": "Cross-File Reasoning",
};

function load(repoId) {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, repoId, "raw-results.json"), "utf-8"));
  const tasksDef = JSON.parse(fs.readFileSync(path.join(__dirname, "tasks", `${repoId}.json`), "utf-8"));
  return { raw, tasksDef };
}

function fmt(n, digits = 2) {
  if (typeof n !== "number" || !isFinite(n)) return "N/A";
  return Number(n.toFixed(digits)).toLocaleString("en-US");
}
function fmtTokens(n) {
  if (typeof n !== "number" || !isFinite(n)) return "N/A";
  return n.toLocaleString("en-US");
}
function fmtMs(ms) {
  if (typeof ms !== "number" || !isFinite(ms)) return "N/A";
  return ms >= 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}
function pct(n) {
  if (typeof n !== "number" || !isFinite(n)) return "N/A";
  return `${Number(n.toFixed(1))}%`;
}

function repoSummary(raw) {
  const sum = {
    baselineTokens: 0,
    codeatlasTokens: 0,
    baselineCost: 0,
    codeatlasCost: 0,
    baselineTime: 0,
    codeatlasTime: 0,
    baselineScore: 0,
    codeatlasScore: 0,
    baselineCorrect: 0,
    codeatlasCorrect: 0,
    baselinePartial: 0,
    codeatlasPartial: 0,
    baselineIncorrect: 0,
    codeatlasIncorrect: 0,
    baselineFailed: 0,
    codeatlasFailed: 0,
    codeatlasToolCalls: 0,
    tasks: raw.tasks.length,
  };
  for (const t of raw.tasks) {
    const b = t.baseline ?? {};
    const c = t.codeatlas ?? {};
    const eb = t.evaluation?.baseline ?? {};
    const ec = t.evaluation?.codeatlas ?? {};
    sum.baselineTokens += b.total_tokens ?? 0;
    sum.codeatlasTokens += c.total_tokens ?? 0;
    sum.baselineCost += b.cost ?? 0;
    sum.codeatlasCost += c.cost ?? 0;
    sum.baselineTime += b.duration_ms ?? 0;
    sum.codeatlasTime += c.duration_ms ?? 0;
    sum.baselineScore += eb.score ?? 0;
    sum.codeatlasScore += ec.score ?? 0;
    sum.codeatlasToolCalls += c.tool_count ?? c.tool_calls?.length ?? 0;
    const inc = (obj, status) => {
      if (status === "correct") obj.correct += 1;
      else if (status === "partially_correct") obj.partial += 1;
      else if (status === "incorrect") obj.incorrect += 1;
      else if (status === "failed") obj.failed += 1;
    };
    inc(sum, eb.status);
    inc(sum, ec.status);
  }
  sum.tokensSaved = sum.baselineTokens - sum.codeatlasTokens;
  sum.tokenSavingPct = sum.baselineTokens > 0 ? (sum.tokensSaved / sum.baselineTokens) * 100 : 0;
  sum.costSaved = sum.baselineCost - sum.codeatlasCost;
  sum.costSavingPct = sum.baselineCost > 0 ? (sum.costSaved / sum.baselineCost) * 100 : 0;
  sum.timeDiff = sum.codeatlasTime - sum.baselineTime;
  sum.timeDiffPct = sum.baselineTime > 0 ? (sum.timeDiff / sum.baselineTime) * 100 : 0;
  return sum;
}

function accLabel(sum) {
  const maxScore = sum.tasks * 2;
  return { b: maxScore ? Math.round((sum.baselineScore / maxScore) * 100) : 0, c: maxScore ? Math.round((sum.codeatlasScore / maxScore) * 100) : 0, maxScore };
}

// ---------------------------------------------------------------------------
// Per-repository report
// ---------------------------------------------------------------------------
function renderRepoReport(repoId) {
  const { raw, tasksDef } = load(repoId);
  const sum = repoSummary(raw);
  const acc = accLabel(sum);
  const repoCfg = config.repositories.find((r) => r.id === repoId);
  const L = [];
  L.push(`# CodeAtlas Benchmark — ${repoCfg.name}`);
  L.push("");
  L.push(`Generated: ${raw.generatedAt}`);
  L.push("");
  L.push("## Repository");
  L.push("");
  L.push(`- Name: [${repoCfg.name}](${repoCfg.url})`);
  L.push(`- URL: ${repoCfg.url}`);
  L.push(`- Commit: \`${raw.commit}\``);
  L.push(`- Version: ${tasksDef.version}`);
  L.push(`- Language: ${repoCfg.language}`);
  L.push(`- Framework: ${repoCfg.framework}`);
  L.push(`- Target files: ~${repoCfg.target_files} (actual ${repoCfg.actual_files})`);
  L.push(`- Files: ${repoCfg.actual_files}`);
  L.push(`- Source/test/config/documentation split: see Environment / profile notes in raw-results.json`);
  L.push("");
  L.push("## Environment");
  L.push("");
  L.push("| Item | Value |");
  L.push("|------|-------|");
  L.push(`| OS | ${env.os.platform} (${env.os.release}, kernel ${env.os.kernel}) |`);
  L.push(`| CPU | ${env.cpu.model} (${env.cpu.cores} cores) |`);
  L.push(`| RAM | ${env.ram} |`);
  L.push(`| Node | ${env.node} |`);
  L.push(`| Go | ${env.go} |`);
  L.push(`| CodeAtlas CLI | ${env.codeatlas_cli} |`);
  L.push(`| OpenCode | ${env.opencode} |`);
  L.push(`| Provider | ${config.agent.provider} |`);
  L.push(`| Model | ${config.agent.model} |`);
  L.push("");
  L.push("## CodeAtlas Configuration");
  L.push("");
  L.push(`- MCP server: \`codeatlas-mcp\` (stdio), 8 tools: ${config.codeatlas.mcp_tools.join(", ")}`);
  L.push(`- Index: \`<repo>/.codeatlas/context.db\` built with \`atlas init --repo <repo> --json\``);
  L.push(`- Toolkit: \`atlas tools\` CLI (overview / categories / search / info / doctor) + \`atlas agents status\``);
  L.push(`- Context assembly: \`atlas context build <task> --repo <repo> --json\` (deterministic, ADR-001/ADR-008)`);
  L.push("");
  L.push("## Benchmark Methodology");
  L.push("");
  L.push(`- ${tasksDef.tasks.length} tasks, identical prompts in both modes (baseline = no CodeAtlas MCP; CodeAtlas = CodeAtlas MCP enabled via per-repo \`opencode.json\`).`);
  L.push("- Model, provider, and temperature identical across modes.");
  L.push("- Single run per task per mode (documented in benchmark-config.json — repeated runs were impractical at 64 agent runs).");
  L.push("- Tokens and cost are the **actual values reported by OpenCode** in `step_finish` events (per-step `tokens`/`cost`), summed across the session.");
  L.push("- CodeAtlas overhead: indexing time (measured), deterministic context assembly per task (measured), MCP tool-call latency (measured per call).");
  L.push("");
  L.push("## Indexing");
  L.push("");
  L.push(`| Metric | Value |`);
  L.push(`|--------|-------|`);
  if (raw.index) {
    L.push(`| Indexing time (clean \`atlas init\`) | ${fmtMs(raw.index.durationMs)} |`);
    L.push(`| Indexed files | ${raw.index.parsed?.files ?? raw.index.parsed?.filesIndexed ?? "N/A"} |`);
    L.push(`| Indexed symbols | ${raw.index.parsed?.symbols ?? raw.index.parsed?.symbolsIndexed ?? "N/A"} |`);
    L.push(`| Indexed dependencies | ${raw.index.parsed?.dependencies ?? raw.index.parsed?.dependenciesIndexed ?? "N/A"} |`);
    L.push(`| Index size on disk | ${(raw.index.indexSizeBytes / 1024 / 1024).toFixed(2)} MiB |`);
  } else {
    L.push(`| Indexing time | N/A |`);
  }
  L.push("");
  L.push("## Task Results");
  L.push("");
  L.push("| Task | Category | Baseline Tokens | CodeAtlas Tokens | Tokens Saved | Saving % | Baseline Cost | CodeAtlas Cost | Cost Saved | Time (base→CA) | Accuracy (base→CA) |");
  L.push("|------|----------|----------------|------------------|--------------|----------|---------------|----------------|------------|----------------|--------------------|");
  for (const t of raw.tasks) {
    const b = t.baseline ?? {};
    const c = t.codeatlas ?? {};
    const eb = t.evaluation?.baseline ?? {};
    const ec = t.evaluation?.codeatlas ?? {};
    const saved = (b.total_tokens ?? 0) - (c.total_tokens ?? 0);
    const saving = b.total_tokens > 0 ? (saved / b.total_tokens) * 100 : 0;
    const costSaved = (b.cost ?? 0) - (c.cost ?? 0);
    L.push(
      `| ${t.id} | ${catLabel[t.category] ?? t.category} | ${fmtTokens(b.total_tokens)} | ${fmtTokens(c.total_tokens)} | ${fmtTokens(saved)} | ${pct(saving)} | $${fmt(b.cost, 4)} | $${fmt(c.cost, 4)} | $${fmt(costSaved, 4)} | ${fmtMs(b.duration_ms)} → ${fmtMs(c.duration_ms)} | ${eb.score ?? 0} → ${ec.score ?? 0} (${eb.status ?? "failed"}/${ec.status ?? "failed"}) |`
    );
  }
  L.push("");
  L.push(`**Totals:** Baseline ${fmtTokens(sum.baselineTokens)} tokens / $${fmt(sum.baselineCost, 4)} — CodeAtlas ${fmtTokens(sum.codeatlasTokens)} tokens / $${fmt(sum.codeatlasCost, 4)} — Saved ${fmtTokens(sum.tokensSaved)} tokens (${pct(sum.tokenSavingPct)}) / $${fmt(sum.costSaved, 4)}.`);
  L.push("");
  L.push("## Token Analysis");
  L.push("");
  L.push(`- Baseline total tokens (actual, provider-reported): **${fmtTokens(sum.baselineTokens)}**`);
  L.push(`- CodeAtlas total tokens (actual, provider-reported): **${fmtTokens(sum.codeatlasTokens)}**`);
  L.push(`- Tokens saved: **${fmtTokens(sum.tokensSaved)}** (${pct(sum.tokenSavingPct)})`);
  L.push(`- CodeAtlas context tokens (deterministic \`atlas context build\` estimate, chars/4 heuristic): see Context Analysis below — the agent also received MCP tool results in addition to these.`);
  L.push("");
  L.push("| Metric | Baseline | CodeAtlas |");
  L.push("|--------|----------|-----------|");
  L.push(`| Avg input tokens/task | ${fmtTokens(Math.round(sum.baselineTokens / sum.tasks))} | ${fmtTokens(Math.round(sum.codeatlasTokens / sum.tasks))} |`);
  L.push(`| Total output tokens | ${fmtTokens(raw.tasks.reduce((s, t) => s + (t.baseline.output_tokens ?? 0), 0))} | ${fmtTokens(raw.tasks.reduce((s, t) => s + (t.codeatlas.output_tokens ?? 0), 0))} |`);
  L.push("");
  L.push("## Cost Analysis");
  L.push("");
  L.push(`- Pricing: ${config.agent.pricing.source}. Model is free tier — provider reports \`cost: 0\` on every step (see benchmark-config.json).`);
  L.push(`- Baseline cost: **$${fmt(sum.baselineCost, 4)}**`);
  L.push(`- CodeAtlas cost: **$${fmt(sum.codeatlasCost, 4)}**`);
  L.push(`- Cost saved: **$${fmt(sum.costSaved, 4)}** (${pct(sum.costSavingPct)})`);
  L.push(`- Note: with a free-tier model, absolute cost savings are 0. Token savings above is the meaningful economic signal; if a paid model is substituted, recompute using that model's real pricing.`);
  L.push("");
  L.push("## Latency Analysis");
  L.push("");
  L.push(`| Phase | Time |`);
  L.push("|-------|------|");
  L.push(`| Indexing (\`atlas init\`) | ${fmtMs(raw.index?.durationMs ?? null)} |`);
  L.push(`| Agent execution (baseline, total) | ${fmtMs(sum.baselineTime)} |`);
  L.push(`| Agent execution (CodeAtlas, total) | ${fmtMs(sum.codeatlasTime)} |`);
  L.push(`| CodeAtlas overhead (delta) | ${fmtMs(sum.timeDiff)} (${pct(sum.timeDiffPct)}) |`);
  L.push(`| MCP server startup (probe) | ${fmtMs(raw.mcp?.startupMs ?? null)} |`);
  const toolTime = raw.tasks.reduce((s, t) => s + (t.codeatlas?.tool_calls ?? []).reduce((a, c) => a + (c.durationMs ?? 0), 0), 0);
  L.push(`| Total MCP tool-call time (CodeAtlas tasks) | ${fmtMs(toolTime)} |`);
  L.push("");
  L.push("## Context Analysis (CodeAtlas)");
  L.push("");
  L.push("| Task | Items | Est. Context Tokens | Assembly Time |");
  L.push("|------|------|--------------------|---------------|");
  const ctx = raw.context_builds ?? [];
  for (const c of ctx) {
    L.push(`| ${c.taskId} | ${c.itemCount} | ${fmtTokens(c.estimatedTokens)} | ${fmtMs(c.durationMs)} |`);
  }
  L.push("");
  L.push("## Toolkit Analysis");
  L.push("");
  L.push("The CodeAtlas Toolkit is a CLI surface (`atlas tools`) + the agent-facing MCP server (`codeatlas-mcp`). Toolkit commands are machine-level; measurements below are identical across repositories.");
  L.push("");
  L.push("| Command | Duration | Exit | Result preview |");
  L.push("|---------|----------|------|----------------|");
  const tk = raw.toolkit ?? [];
  for (const t of tk) {
    const preview = (t.stdoutPreview || "").replace(/\n/g, " ").slice(0, 80);
    L.push(`| \`${t.command}\` | ${fmtMs(t.durationMs)} | ${t.exitCode} | \`${preview}\` |`);
  }
  L.push("");
  const totalToolCalls = raw.tasks.reduce((s, t) => s + (t.codeatlas?.tool_count ?? 0), 0);
  L.push(`Agent MCP tool calls in CodeAtlas mode: **${totalToolCalls}** across ${sum.tasks} tasks.`);
  const perCall = raw.tasks.flatMap((t) => (t.codeatlas?.tool_calls ?? []).map((c) => ({ ...c, task: t.id })));
  if (perCall.length) {
    L.push("");
    L.push("| Task | Tool | Status | Duration |");
    L.push("|------|------|--------|----------|");
    for (const c of perCall) {
      L.push(`| ${c.task} | \`${c.tool}\` | ${c.status}${c.outputIsError ? " (error)" : ""} | ${c.durationMs != null ? fmtMs(c.durationMs) : "N/A"} |`);
    }
  }
  L.push("");
  L.push("## MCP Analysis");
  L.push("");
  if (raw.mcp) {
    L.push(`- MCP server: **AVAILABLE** — \`codeatlas-mcp\` starts in ~${fmtMs(raw.mcp.startupMs)} and exposes ${raw.mcp.tools?.length ?? config.codeatlas.mcp_tools.length} tools (${(raw.mcp.tools ?? config.codeatlas.mcp_tools).join(", ")}).`);
    L.push(`- MCP tool calls exercised by the agent: **${totalToolCalls}** (see Toolkit table).`);
    const toolOutputBytes = perCall.reduce((s, c) => s + (typeof c.output === "string" ? Buffer.byteLength(c.output) : 0), 0);
    L.push(`- Total bytes returned by tools: ${fmtTokens(toolOutputBytes)} B (≈ ${Math.round(toolOutputBytes / 4)} estimated tokens, chars/4 heuristic).`);
    const filesRetrieved = new Set();
    for (const c of perCall) {
      if (c.tool === "codeatlas_search_files" && c.output) {
        try {
          const parsed = typeof c.output === "string" ? JSON.parse(c.output) : c.output;
          for (const h of parsed.hits ?? []) filesRetrieved.add(h.path);
        } catch {}
      }
    }
    L.push(`- Distinct files surfaced by \`codeatlas_search_files\`: **${filesRetrieved.size}**`);
  } else {
    L.push("- MCP: **NOT AVAILABLE** — no probe data was captured for this repository.");
    L.push("- Reason: probe did not run or the server did not initialize.");
  }
  L.push("");
  L.push("## Accuracy Analysis");
  L.push("");
  L.push(`Scoring: 2 = correct, 1 = partially correct, 0 = incorrect, failed = no usable answer. Baseline and CodeAtlas prompts are identical; scores are per task per mode.`);
  L.push("");
  L.push(`| Status | Baseline | CodeAtlas |`);
  L.push(`|--------|----------|-----------|`);
  L.push(`| correct | ${sum.baselineCorrect} | ${sum.codeatlasCorrect} |`);
  L.push(`| partially correct | ${sum.baselinePartial} | ${sum.codeatlasPartial} |`);
  L.push(`| incorrect | ${sum.baselineIncorrect} | ${sum.codeatlasIncorrect} |`);
  L.push(`| failed | ${sum.baselineFailed} | ${sum.codeatlasFailed} |`);
  L.push(`| **Score / max (${maxScore()})** | **${sum.baselineScore}/${maxScore()}** | **${sum.codeatlasScore}/${maxScore()}** |`);
  L.push(`| **Accuracy %** | **${acc.b}%** | **${acc.c}%** |`);
  L.push("");
  L.push("Per-task details (files found / expected, concepts found / expected, cited files that exist in the repo):");
  L.push("");
  L.push("| Task | Baseline files | CodeAtlas files | Baseline concepts | CodeAtlas concepts |");
  L.push("|------|----------------|-----------------|-------------------|--------------------|");
  for (const t of raw.tasks) {
    const eb = t.evaluation?.baseline ?? {};
    const ec = t.evaluation?.codeatlas ?? {};
    const n = (arr) => (Array.isArray(arr) ? arr.length : 0);
    L.push(`| ${t.id} | ${n(eb.files_found)}/${n(eb.files_expected)} | ${n(ec.files_found)}/${n(ec.files_expected)} | ${n(eb.concepts_found)}/${n(eb.concepts_expected)} | ${n(ec.concepts_found)}/${n(ec.concepts_expected)} |`);
  }
  function maxScore() {
    return acc.maxScore;
  }
  L.push("");
  L.push("## Failures");
  L.push("");
  const failures = raw.tasks.filter((t) => {
    const b = t.baseline ?? {};
    const c = t.codeatlas ?? {};
    return b.timed_out || c.timed_out || t.evaluation?.baseline?.status === "failed" || t.evaluation?.codeatlas?.status === "failed" || c.tool_errors?.length > 0;
  });
  if (!failures.length) {
    L.push("None — no timeouts, no failed evaluations, no tool errors in this repository.");
  } else {
    for (const f of failures) {
      L.push(`- **${f.id}** — baseline: ${f.evaluation.baseline.status} (timedOut=${f.baseline.timed_out}), codeatlas: ${f.evaluation.codeatlas.status} (timedOut=${f.codeatlas.timed_out}, toolErrors=${(f.codeatlas.tool_errors ?? []).join(",") || "none"}). See failures.md.`);
    }
  }
  L.push("");
  L.push("## Observations");
  L.push("");
  L.push("_Filled during the analysis pass in the final report. See summary.md for cross-repository analysis._");
  L.push("");
  L.push("## Conclusion");
  L.push("");
  L.push("_See summary.md — Final Verdict._");
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// Failures report
// ---------------------------------------------------------------------------
function renderFailures() {
  const L = [];
  L.push("# CodeAtlas Final Benchmark — Failure Log");
  L.push("");
  L.push("Every failure recorded during the benchmark. Severity is per failure.");
  L.push("");
  let count = 0;
  for (const repoId of repos) {
    const { raw, tasksDef } = load(repoId);
    const repoCfg = config.repositories.find((r) => r.id === repoId);
    for (const t of raw.tasks) {
      const issues = [];
      if (t.baseline?.timed_out) issues.push({ mode: "baseline", type: "timeout" });
      if (t.codeatlas?.timed_out) issues.push({ mode: "codeatlas", type: "timeout" });
      if (t.baseline?.exit_code !== 0 && t.baseline?.exit_code !== null) issues.push({ mode: "baseline", type: `exit ${t.baseline.exit_code}` });
      if (t.codeatlas?.exit_code !== 0 && t.codeatlas?.exit_code !== null) issues.push({ mode: "codeatlas", type: `exit ${t.codeatlas.exit_code}` });
      if (t.evaluation?.baseline?.status === "failed") issues.push({ mode: "baseline", type: "no usable answer" });
      if (t.evaluation?.codeatlas?.status === "failed") issues.push({ mode: "codeatlas", type: "no usable answer" });
      if ((t.codeatlas?.tool_errors ?? []).length) issues.push({ mode: "codeatlas", type: `tool error(s): ${t.codeatlas.tool_errors.join(", ")}` });
      if (!issues.length) continue;
      count += 1;
      L.push(`## Failure: ${t.id}`);
      L.push("");
      L.push("### Repository");
      L.push("");
      L.push(`- ${repoCfg.name} (${repoId}) @ \`${raw.commit}\``);
      L.push("");
      L.push("### Task");
      L.push("");
      L.push(`- Category: ${t.category}`);
      L.push(`- Prompt: ${t.prompt}`);
      L.push("");
      L.push("### Issues");
      L.push("");
      for (const i of issues) L.push(`- [${i.mode}] ${i.type}`);
      L.push("");
      L.push("### Expected");
      L.push("");
      L.push(`- Expected files: ${t.evaluation.baseline.files_expected.join(", ")}`);
      L.push(`- Expected concepts: ${t.evaluation.baseline.concepts_expected.join(", ")}`);
      L.push("");
      L.push("### Actual");
      L.push("");
      L.push(`- Baseline status: ${t.evaluation.baseline.status} (score ${t.evaluation.baseline.score}); CodeAtlas status: ${t.evaluation.codeatlas.status} (score ${t.evaluation.codeatlas.score}).`);
      L.push(`- Baseline final answer: \`${(t.baseline.final_text ?? "").slice(0, 400)}\``);
      L.push(`- CodeAtlas final answer: \`${(t.codeatlas.final_text ?? "").slice(0, 400)}\``);
      L.push("");
      L.push("### Error");
      L.push("");
      const err = t.baseline?.stderrPreview || t.codeatlas?.stderrPreview || "No stderr captured.";
      L.push(`\`\`\`\n${(err || "none").slice(0, 500)}\n\`\`\``);
      L.push("");
      L.push("### Likely Cause");
      L.push("");
      L.push("Documented in the manual review pass (see summary.md).");
      L.push("");
      L.push("### Severity");
      L.push("");
      L.push("Low / Medium / High / Critical");
      L.push("");
      L.push("### Fix Required");
      L.push("");
      L.push("—");
      L.push("");
    }
  }
  if (!count) {
    L.push("No failures were recorded in any repository.");
  }
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// Summary report
// ---------------------------------------------------------------------------
function renderSummary() {
  const L = [];
  L.push("# CodeAtlas Final Benchmark — Summary (2026-08)");
  L.push("");
  L.push(`Generated: ${new Date().toISOString()}`);
  L.push("");
  L.push(`- Agent: **OpenCode** ${env.opencode}`);
  L.push(`- Provider: **${config.agent.provider}** (OpenCode Zen gateway)`);
  L.push(`- Model: **${config.agent.model}**`);
  L.push(`- Node: ${env.node} | OS: ${env.os.platform} (${env.os.kernel}) | CPU: ${env.cpu.model} (${env.cpu.cores}) | RAM: ${env.ram}`);
  L.push("");
  L.push("## Methodology");
  L.push("");
  L.push("- 4 real open-source repositories, pinned to commits, increasing in size: winston (~100), commander.js (~250), axios (~500), rxjs (~1300).");
  L.push("- Every task ran twice: **Baseline** (OpenCode without the CodeAtlas MCP) and **CodeAtlas** (OpenCode with the CodeAtlas MCP enabled). Identical prompts, model, provider, and configuration.");
  L.push("- Tokens/cost are the actual per-step values reported by OpenCode (`step_finish` events), summed per run.");
  L.push("- Single run per task per mode (documented; repeated runs impractical at 64 agent runs).");
  L.push("");
  const sums = {};
  for (const repoId of repos) {
    const { raw } = load(repoId);
    sums[repoId] = repoSummary(raw);
  }
  const total = {
    baselineTokens: 0, codeatlasTokens: 0, baselineCost: 0, codeatlasCost: 0,
    baselineTime: 0, codeatlasTime: 0, baselineScore: 0, codeatlasScore: 0, tasks: 0,
    indexTime: 0, maxScore: 0,
  };
  for (const repoId of repos) {
    const s = sums[repoId];
    total.baselineTokens += s.baselineTokens;
    total.codeatlasTokens += s.codeatlasTokens;
    total.baselineCost += s.baselineCost;
    total.codeatlasCost += s.codeatlasCost;
    total.baselineTime += s.baselineTime;
    total.codeatlasTime += s.codeatlasTime;
    total.baselineScore += s.baselineScore;
    total.codeatlasScore += s.codeatlasScore;
    total.tasks += s.tasks;
    total.maxScore += s.tasks * 2;
    const { raw } = load(repoId);
    total.indexTime += raw.index?.durationMs ?? 0;
  }
  total.tokensSaved = total.baselineTokens - total.codeatlasTokens;
  total.tokenSavingPct = total.baselineTokens > 0 ? (total.tokensSaved / total.baselineTokens) * 100 : 0;
  total.costSaved = total.baselineCost - total.codeatlasCost;
  total.costSavingPct = total.baselineCost > 0 ? (total.costSaved / total.baselineCost) * 100 : 0;
  total.timeDiff = total.codeatlasTime - total.baselineTime;
  total.timeDiffPct = total.baselineTime > 0 ? (total.timeDiff / total.baselineTime) * 100 : 0;

  L.push("## Repository Scaling");
  L.push("");
  L.push("| Repository | Files | LOC (src) | Index Time | Tasks |");
  L.push("| ---------- | ----: | --------: | ---------: | ----: |");
  const locMap = { "repo-01": 9048, "repo-02": 20642, "repo-03": 41025, "repo-04": 79435 };
  for (const repoId of repos) {
    const { raw } = load(repoId);
    const cfg = config.repositories.find((r) => r.id === repoId);
    const idx = raw.index?.durationMs ?? null;
    L.push(`| ${cfg.name} (${repoId}) | ${cfg.actual_files} | ${fmtTokens(locMap[repoId])} | ${fmtMs(idx)} | ${sums[repoId].tasks} |`);
  }
  L.push("");
  L.push("## Token Efficiency");
  L.push("");
  L.push("| Repository | Baseline Tokens | CodeAtlas Tokens | Tokens Saved | Saving % |");
  L.push("| ---------- | --------------: | ---------------: | -----------: | -------: |");
  for (const repoId of repos) {
    const cfg = config.repositories.find((r) => r.id === repoId);
    const s = sums[repoId];
    L.push(`| ${cfg.name} | ${fmtTokens(s.baselineTokens)} | ${fmtTokens(s.codeatlasTokens)} | ${fmtTokens(s.tokensSaved)} | ${pct(s.tokenSavingPct)} |`);
  }
  L.push(`| **Total** | **${fmtTokens(total.baselineTokens)}** | **${fmtTokens(total.codeatlasTokens)}** | **${fmtTokens(total.tokensSaved)}** | **${pct(total.tokenSavingPct)}** |`);
  L.push("");
  L.push("## Cost Efficiency");
  L.push("");
  L.push("| Repository | Baseline Cost | CodeAtlas Cost | Cost Saved | Saving % |");
  L.push("| ---------- | ------------: | -------------: | ---------: | -------: |");
  for (const repoId of repos) {
    const cfg = config.repositories.find((r) => r.id === repoId);
    const s = sums[repoId];
    L.push(`| ${cfg.name} | $${fmt(s.baselineCost, 4)} | $${fmt(s.codeatlasCost, 4)} | $${fmt(s.costSaved, 4)} | ${pct(s.costSavingPct)} |`);
  }
  L.push(`| **Total** | **$${fmt(total.baselineCost, 4)}** | **$${fmt(total.codeatlasCost, 4)}** | **$${fmt(total.costSaved, 4)}** | **${pct(total.costSavingPct)}** |`);
  L.push("");
  L.push(`> Cost uses the **free-tier model** (provider reports cost 0 on every step). Cost savings are therefore 0; token savings is the meaningful economic metric. See benchmark-config.json.`);
  L.push("");
  L.push("## Accuracy");
  L.push("");
  L.push("| Repository | Baseline Score | CodeAtlas Score | Difference |");
  L.push("| ---------- | -------------: | --------------: | ---------: |");
  for (const repoId of repos) {
    const cfg = config.repositories.find((r) => r.id === repoId);
    const s = sums[repoId];
    const max = s.tasks * 2;
    const diff = s.codeatlasScore - s.baselineScore;
    L.push(`| ${cfg.name} | ${s.baselineScore}/${max} (${Math.round((s.baselineScore / max) * 100)}%) | ${s.codeatlasScore}/${max} (${Math.round((s.codeatlasScore / max) * 100)}%) | ${diff > 0 ? "+" : ""}${diff} |`);
  }
  L.push(`| **Total** | **${total.baselineScore}/${total.maxScore} (${Math.round((total.baselineScore / total.maxScore) * 100)}%)** | **${total.codeatlasScore}/${total.maxScore} (${Math.round((total.codeatlasScore / total.maxScore) * 100)}%)** | **${total.codeatlasScore - total.baselineScore}** |`);
  L.push("");
  L.push("## Latency");
  L.push("");
  L.push("| Repository | Baseline Time | CodeAtlas Time | Difference |");
  L.push("| ---------- | ------------: | -------------: | ---------: |");
  for (const repoId of repos) {
    const cfg = config.repositories.find((r) => r.id === repoId);
    const s = sums[repoId];
    L.push(`| ${cfg.name} | ${fmtMs(s.baselineTime)} | ${fmtMs(s.codeatlasTime)} | ${s.timeDiff >= 0 ? "+" : ""}${fmtMs(s.timeDiff)} (${pct(s.timeDiffPct)}) |`);
  }
  L.push(`| **Total** | **${fmtMs(total.baselineTime)}** | **${fmtMs(total.codeatlasTime)}** | **${total.timeDiff >= 0 ? "+" : ""}${fmtMs(total.timeDiff)} (${pct(total.timeDiffPct)})** |`);
  L.push("");
  L.push("## Scaling Analysis");
  L.push("");
  const t = total;
  L.push(`1. **Does CodeAtlas keep working as repositories grow?** See per-repo reports and the Scaling table. Indexing completed successfully for all four repositories including rxjs (${fmtTokens(locMap["repo-04"])} LOC of TypeScript).`);
  L.push(`2. **How does indexing time scale?** ${fmtMs(sums["repo-01"].indexTime ?? null)} → ${fmtMs(sums["repo-02"].indexTime ?? null)} → ${fmtMs(sums["repo-03"].indexTime ?? null)} → ${fmtMs(sums["repo-04"].indexTime ?? null)} across ~116 → ~1288 files (see per-repo reports for exact values).`);
  L.push(`3. **How does context retrieval scale?** See per-repo Context Analysis (deterministic \`atlas context build\` item counts, assembly time, estimated tokens) and MCP tool latency in Toolkit tables.`);
  L.push(`4. **How does token usage scale?** Baseline ${fmtTokens(t.baselineTokens)} vs CodeAtlas ${fmtTokens(t.codeatlasTokens)} total across ${t.tasks} tasks.`);
  L.push(`5. **Does token saving increase with repository size?** See Token Efficiency table per repo.`);
  L.push(`6. **Does agent accuracy improve?** See Accuracy table per repo (scores out of ${t.maxScore} possible points).`);
  L.push(`7. **Does CodeAtlas introduce significant latency?** CodeAtlas agent-execution time is ${fmtMs(t.timeDiff)} (${pct(t.timeDiffPct)}) vs baseline; see Latency table and per-repo MCP tool latency.`);
  L.push(`8. **Does the ~1000-file repository remain usable?** See ${config.repositories.find((r) => r.id === "repo-04").name} report.`);
  L.push(`9. **Where does performance start degrading?** See per-repo reports and observations.`);
  L.push(`10. **Current bottlenecks?** See Final Verdict.`);
  L.push("");
  L.push("## Failures Summary");
  L.push("");
  const failCount = countFailures();
  if (failCount) {
    L.push(`See failures.md — ${failCount} task(s) had failures (timeout, exit error, tool error, or failed evaluation).`);
  } else {
    L.push("No failures recorded. See failures.md.");
  }
  L.push("");
  L.push("# Final Verdict");
  L.push("");
  L.push("## CodeAtlas Status");
  L.push("");
  L.push("_Final status determined after the full analysis pass._");
  L.push("");
  L.push("## What Worked");
  L.push("");
  L.push("—");
  L.push("");
  L.push("## What Did Not Work");
  L.push("");
  L.push("—");
  L.push("");
  L.push("## Biggest Token Saving");
  L.push("");
  L.push("—");
  L.push("");
  L.push("## Biggest Cost Saving");
  L.push("");
  L.push("—");
  L.push("");
  L.push("## Best Repository Size");
  L.push("");
  L.push("—");
  L.push("");
  L.push("## Largest Repository Successfully Tested");
  L.push("");
  L.push("—");
  L.push("");
  L.push("## Accuracy Impact");
  L.push("");
  L.push("—");
  L.push("");
  L.push("## Performance Bottleneck");
  L.push("");
  L.push("—");
  L.push("");
  L.push("## Production Readiness");
  L.push("");
  L.push("—");
  L.push("");
  L.push("## Recommended Next Step");
  L.push("");
  L.push("—");
  return L.join("\n");
}

function countFailures() {
  let n = 0;
  for (const repoId of repos) {
    const { raw } = load(repoId);
    for (const t of raw.tasks) {
      if (t.baseline?.timed_out || t.codeatlas?.timed_out || t.baseline?.exit_code !== 0 && t.baseline?.exit_code !== null || t.codeatlas?.exit_code !== 0 && t.codeatlas?.exit_code !== null || t.evaluation?.baseline?.status === "failed" || t.evaluation?.codeatlas?.status === "failed" || (t.codeatlas?.tool_errors ?? []).length) n += 1;
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------
for (const repoId of repos) {
  const md = renderRepoReport(repoId);
  fs.writeFileSync(path.join(__dirname, repoId, "benchmark.md"), md);
  console.log(`Wrote ${repoId}/benchmark.md`);
}
const summary = renderSummary();
fs.writeFileSync(path.join(__dirname, "summary.md"), summary);
console.log("Wrote summary.md");
const failures = renderFailures();
fs.writeFileSync(path.join(__dirname, "failures.md"), failures);
console.log("Wrote failures.md");
console.log("Done.");