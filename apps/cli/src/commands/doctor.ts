import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type {
  AgentMcpPort,
  AgentMcpStatus,
  AgentPort,
  FreshnessSignal,
  OllamaStatus,
  ProviderStatus,
} from "@atlas/sdk";
import {
  createAgentMcpService,
  createAgentService,
  createContextSDK,
  createOllamaService,
  createProviderService,
} from "@atlas/sdk";
import type { Command } from "commander";
import { contextDbPath, resolveProjectRoot } from "./search";

/** Parsed `atlas doctor` CLI options. */
export interface DoctorCliOptions {
  readonly repo?: string;
  readonly json?: boolean;
}

/** Inject real SDK services, or fakes in tests. */
export interface DoctorServices {
  readonly agents?: AgentPort;
  readonly agentMcp?: AgentMcpPort;
  readonly providers?: { readonly status: () => readonly ProviderStatus[] };
  readonly ollama?: { readonly status: () => OllamaStatus };
}

/** Options accepted by {@link registerDoctor}. */
export interface DoctorCommandOptions {
  readonly doctor?: DoctorServices;
}

/** A single diagnostic verdict. */
export type DoctorVerdict = "PASS" | "WARN" | "FAIL";

/** One line of the doctor report. */
export interface DoctorCheck {
  readonly name: string;
  readonly verdict: DoctorVerdict;
  readonly detail: string;
}

/** The complete doctor report for a repository. */
export interface DoctorReport {
  readonly repositoryPath: string;
  readonly checks: readonly DoctorCheck[];
  /** False when any check failed; the CLI exits 1 then. */
  readonly healthy: boolean;
}

const MINIMUM_NODE = [22, 5, 0];

export function registerDoctor(program: Command, options: DoctorCommandOptions = {}): void {
  program
    .command("doctor")
    .description("Diagnose the CodeAtlas installation and this repository's index")
    .option("--repo <path>", "repository path (defaults to ATLAS_ROOT or cwd)")
    .option("--json", "print the report as JSON")
    .action(async (commandOptions: DoctorCliOptions) => {
      const root =
        commandOptions.repo === undefined ? resolveProjectRoot() : resolve(commandOptions.repo);
      const report = await runDoctor(root, options.doctor);
      if (commandOptions.json === true) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(renderDoctorReport(report));
      }
      if (!report.healthy) {
        process.exitCode = 1;
      }
    });
}

/** Run every diagnostic check against the SDK (no direct database access). */
export async function runDoctor(
  root: string,
  services: DoctorServices = {},
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  checkNodeRuntime(checks);
  await checkIndex(checks, root);
  await checkAgents(checks, services.agents ?? createAgentService());
  await checkAgentMcp(checks, services.agentMcp ?? createAgentMcpService());
  checkProviders(checks, services.providers ?? createProviderService());
  checkOllama(checks, services.ollama ?? createOllamaService());
  return {
    repositoryPath: root,
    checks,
    healthy: checks.every((check) => check.verdict !== "FAIL"),
  };
}

function checkNodeRuntime(checks: DoctorCheck[]): void {
  const [major, minor, patch] = process.versions.node
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  const ok =
    major > MINIMUM_NODE[0] ||
    (major === MINIMUM_NODE[0] &&
      (minor > MINIMUM_NODE[1] || (minor === MINIMUM_NODE[1] && patch >= MINIMUM_NODE[2])));
  checks.push({
    name: "Node runtime",
    verdict: ok ? "PASS" : "FAIL",
    detail: `Node ${process.versions.node} (requires >= ${MINIMUM_NODE.join(".")} for node:sqlite)`,
  });
}

async function checkIndex(checks: DoctorCheck[], root: string): Promise<void> {
  const dbPath = contextDbPath(root);
  if (!existsSync(dbPath)) {
    checks.push({
      name: "Context index",
      verdict: "FAIL",
      detail: `No index found at ${dbPath}. Run 'atlas build' (or 'atlas init').`,
    });
    return;
  }

  const context = createContextSDK({ repositoryPath: root });
  try {
    const status = context.status();
    const freshness = await context.freshness();
    checks.push({
      name: "Context index",
      verdict: freshness.available ? "PASS" : "FAIL",
      detail: `Database: ${dbPath}; ${status.filesIndexed} files, ${status.symbolsIndexed} symbols (updated ${status.lastUpdated})`,
    });
    checks.push({
      name: "Index freshness",
      verdict: freshnessVerdict(freshness),
      detail: freshnessDetail(freshness),
    });
  } finally {
    context.close();
  }

  const manifestPath = joinManifestPath(root);
  checks.push({
    name: "Project manifest",
    verdict: existsSync(manifestPath) ? "PASS" : "WARN",
    detail: existsSync(manifestPath)
      ? `Manifest: ${manifestPath}`
      : "No .codeatlas/manifest.json — generated on the next build.",
  });
}

function freshnessVerdict(freshness: FreshnessSignal): DoctorVerdict {
  switch (freshness.state) {
    case "fresh":
      return "PASS";
    case "unavailable":
      return "FAIL";
    case "stale":
      return "WARN";
    default:
      return "WARN";
  }
}

function freshnessDetail(freshness: FreshnessSignal): string {
  const changed = freshness.changed.length;
  const added = freshness.added.length;
  const deleted = freshness.deleted.length;
  const changes = [];
  if (changed > 0) changes.push(`${changed} changed`);
  if (added > 0) changes.push(`${added} added`);
  if (deleted > 0) changes.push(`${deleted} deleted`);
  const summary = changes.length > 0 ? ` — ${changes.join(", ")}` : "";
  return `State: ${freshness.state}${summary}. Run 'atlas update' to refresh.`;
}

async function checkAgents(checks: DoctorCheck[], agents: AgentPort): Promise<void> {
  const result = await agents.detectAll();
  if (!result.ok) {
    checks.push({ name: "AI agents", verdict: "FAIL", detail: result.error.message });
    return;
  }
  const installed = result.value.filter((agent) => agent.available);
  checks.push({
    name: "AI agents",
    verdict: installed.length > 0 ? "PASS" : "WARN",
    detail:
      installed.length > 0
        ? installed.map((agent) => `${agent.provider} (${agent.path ?? agent.binary})`).join(", ")
        : "No AI coding CLIs detected. Install one (Claude Code, Gemini, Codex, OpenCode) to enable /agents.",
  });
}

async function checkAgentMcp(checks: DoctorCheck[], agentMcp: AgentMcpPort): Promise<void> {
  const result = await agentMcp.status();
  if (!result.ok) {
    checks.push({ name: "Agent MCP", verdict: "FAIL", detail: result.error.message });
    return;
  }
  checks.push({ name: "Agent MCP", verdict: "PASS", detail: renderMcpStatus(result.value) });
}

function renderMcpStatus(status: AgentMcpStatus): string {
  const installed = status.entries.filter((entry) => entry.available);
  if (installed.length === 0) {
    return "No AI coding tools installed; MCP registration not applicable.";
  }
  const registered = installed.filter((entry) => entry.configured);
  return `Registered for ${registered.length}/${installed.length} installed tools${status.needsConfiguration ? " — run 'atlas agents connect'." : "."}`;
}

function checkProviders(
  checks: DoctorCheck[],
  providers: { readonly status: () => readonly ProviderStatus[] },
): void {
  const statuses = providers.status();
  const configured = statuses.filter((status) => status.configured);
  const missingKeys = statuses.filter(
    (status) => status.configured && !status.hasApiKey && status.name !== "ollama",
  );
  checks.push({
    name: "AI providers",
    verdict: configured.length > 0 ? "PASS" : "WARN",
    detail:
      configured.length > 0
        ? configured
            .map((status) => `${status.name}${status.hasApiKey ? "" : " (missing key)"}`)
            .join(", ")
        : "No AI providers configured — summaries stay deterministic until one is set up.",
  });
  if (missingKeys.length > 0) {
    checks.push({
      name: "Provider keys",
      verdict: "WARN",
      detail: `${missingKeys.map((status) => status.name).join(", ")} configured without an API key.`,
    });
  }
}

function checkOllama(checks: DoctorCheck[], ollama: { readonly status: () => OllamaStatus }): void {
  const status = ollama.status();
  checks.push({
    name: "Ollama",
    verdict: status.connected ? "PASS" : "WARN",
    detail: status.connected
      ? `Connected (${status.mode})${status.model === null ? "" : ` — model ${status.model}`}.`
      : "Not connected — run 'atlas ollama connect' to enable local AI summarization.",
  });
}

/** Render the doctor report as readable text. */
export function renderDoctorReport(report: DoctorReport): string {
  const lines = [`CodeAtlas doctor — ${report.repositoryPath}`, ""];
  for (const check of report.checks) {
    const glyph = check.verdict === "PASS" ? "✓" : check.verdict === "FAIL" ? "✗" : "○";
    lines.push(`${glyph} [${check.verdict}] ${check.name}`);
    lines.push(`    ${check.detail}`);
  }
  lines.push("", report.healthy ? "All checks passed." : "One or more checks failed (exit 1).");
  return lines.join("\n");
}

function joinManifestPath(root: string): string {
  return resolve(root, ".codeatlas", "manifest.json");
}
