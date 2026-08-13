/**
 * The interactive TUI shell (`atlas tui`). Runs a readline loop over slash
 * commands against injected dependencies (Context SDK, Context Integration,
 * Toolkit, Session Port, Agent Port). Interactive AI CLI launches hand the
 * terminal to the child process and reclaim it when the session ends.
 */

import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  type AgentInfo,
  type AgentPort,
  type ContextIntegration,
  type ContextSDK,
  type IndexResult,
  type SessionPort,
  type ToolkitSDK,
  createAgentService,
  createContextIntegration,
  createContextSDK,
  createSessionManager,
  createToolkitSDK,
  indexProject,
  renderContextPackage,
} from "@atlas/sdk";
import { contextDbPath, renderSearchHits, resolveProjectRoot } from "../commands/search";
import { agentLabel } from "../commands/sessions";
import { installGuideFor, providerLabel } from "./guides";
import { type TuiIo, createReadlineIo } from "./io";
import {
  contextStateLabel,
  renderAgents,
  renderHeader,
  renderHelp,
  renderManualInstall,
  renderToolkitSidebar,
  sessionSummary,
} from "./render";
import { type AgentProvider, type TuiCommand, parseCommandLine } from "./router";

/** Everything the TUI needs, injectable for tests. */
export interface TuiDeps {
  readonly root: string;
  readonly dbPath: string;
  readonly context: ContextSDK;
  readonly integration: ContextIntegration;
  readonly toolkit: ToolkitSDK;
  readonly sessions: SessionPort;
  readonly agents: AgentPort;
}

/** Options for {@link runTui}. */
export interface RunTuiOptions {
  /** Project root; defaults to `ATLAS_ROOT`/`process.cwd()`. */
  readonly root?: string;
  /** Overrides (tests inject fakes). */
  readonly context?: ContextSDK;
  readonly integration?: ContextIntegration;
  readonly toolkit?: ToolkitSDK;
  readonly sessions?: SessionPort;
  readonly agents?: AgentPort;
  readonly io?: TuiIo;
}

/** Run the TUI until the user exits. */
export async function runTui(options: RunTuiOptions = {}): Promise<void> {
  const root = options.root === undefined ? resolveProjectRoot() : resolve(options.root);
  const dbPath = contextDbPath(root);
  const ownIo = options.io === undefined;
  const io = options.io ?? createReadlineIo();

  const context = options.context ?? createContextSDK({ dbPath });
  const sessions = options.sessions ?? createSessionManager();
  const agents = options.agents ?? createAgentService();
  const toolkit = options.toolkit ?? createToolkitSDK({ root });
  const integration = options.integration ?? createContextIntegration({ context, sessions });

  const deps: TuiDeps = { root, dbPath, context, integration, toolkit, sessions, agents };

  io.write(
    renderHeader({ repoLabel: basename(root), contextState: contextStateLabel(context.status()) }),
  );

  try {
    for (;;) {
      const line = await io.readLine("atlas> ");
      const command = parseCommandLine(line);
      if (command.kind === "exit") {
        break;
      }
      await dispatch(command, deps, io);
    }
  } finally {
    if (ownIo) {
      io.close();
    }
    if (options.context === undefined) {
      context.close();
    }
  }
}

/** Dispatch one parsed command; returns nothing (exit handled by caller). */
export async function dispatch(command: TuiCommand, deps: TuiDeps, io: TuiIo): Promise<void> {
  switch (command.kind) {
    case "help":
      io.write(renderHelp());
      return;
    case "status":
      io.write(await renderStatus(deps));
      return;
    case "scan":
      await runScan(deps, io);
      return;
    case "search":
      await runSearch(command.query, deps, io);
      return;
    case "context":
      await runContext(command.task, deps, io);
      return;
    case "agents":
      await runAgents(deps, io);
      return;
    case "toolkit":
      await runToolkit(deps, io);
      return;
    case "tools-install":
      await runToolsInstall(command.tool, deps, io);
      return;
    case "agent":
      await runAgent(command.provider, command.args, deps, io);
      return;
    case "unknown":
      io.write(`Unknown command: ${command.raw} — type /help for commands.`);
      return;
    case "empty":
      return;
    case "exit":
      return;
  }
}

/** `/status`: repository, context, agents, sessions, tools. */
async function renderStatus(deps: TuiDeps): Promise<string> {
  const lines = [
    `Repository: ${deps.root}`,
    `Context: ${contextStateLabel(deps.context.status())}`,
    `Sessions: ${sessionSummary(deps.sessions.getActiveSessions().length)}`,
  ];
  const agentResult = await deps.agents.detectAll();
  if (agentResult.ok) {
    lines.push(
      `Agents: ${
        agentResult.value
          .filter((agent) => agent.available)
          .map((agent) => agent.provider)
          .join(", ") || "none installed"
      }`,
    );
  }
  const toolkitResult = await deps.toolkit.overview();
  if (toolkitResult.ok) {
    lines.push(
      `Tools: ${toolkitResult.value.installed.map((tool) => tool.name).join(", ") || "none installed"}`,
    );
  }
  return lines.join("\n");
}

/** `/scan`: run the SDK indexer. */
async function runScan(deps: TuiDeps, io: TuiIo): Promise<void> {
  io.write("Scanning repository...");
  const result = await indexProject({ repositoryPath: deps.root, mode: "build" });
  if (!result.ok) {
    io.write(`Scan failed: ${result.error.message}`);
    return;
  }
  io.write(renderIndexResult(result.value));
}

/** Human summary of an {@link IndexResult}. */
export function renderIndexResult(result: IndexResult): string {
  return [
    `Indexed ${result.repositoryPath}`,
    `  files: ${result.files} (parsed ${result.parsedFiles}, skipped ${result.skippedFiles})`,
    `  symbols: ${result.symbols} · dependencies: ${result.dependencies}`,
    `  added ${result.added} · changed ${result.changed} · deleted ${result.deleted} · unchanged ${result.unchanged}`,
    `  manifest: ${result.manifestPath}`,
  ].join("\n");
}

/** `/search <query>`. */
async function runSearch(query: string, deps: TuiDeps, io: TuiIo): Promise<void> {
  if (query === "") {
    io.write("Usage: /search <query>");
    return;
  }
  if (!existsSync(deps.dbPath)) {
    io.write("No context index yet — run /scan first.");
    return;
  }
  io.write(renderSearchHits(query, deps.context.search.search(query, { limit: 10 })));
}

/** `/context <task>`. */
async function runContext(task: string, deps: TuiDeps, io: TuiIo): Promise<void> {
  if (task === "") {
    io.write("Usage: /context <task>");
    return;
  }
  if (!existsSync(deps.dbPath)) {
    io.write("No context index yet — run /scan first.");
    return;
  }
  io.write("Assembling context package...");
  const pkg = await deps.integration.buildPackage({ task });
  io.write(renderContextPackage(pkg));
}

/** `/agents`: list detected AI CLIs. */
async function runAgents(deps: TuiDeps, io: TuiIo): Promise<void> {
  const result = await deps.agents.detectAll();
  if (!result.ok) {
    io.write(result.error.message);
    return;
  }
  io.write(renderAgents(result.value));
}

/** `/toolkit`: installed + recommended tools sidebar. */
async function runToolkit(deps: TuiDeps, io: TuiIo): Promise<void> {
  const result = await deps.toolkit.overview();
  if (!result.ok) {
    io.write(result.error.message);
    return;
  }
  const installed = result.value.installed.map((tool) => ({
    name: tool.name,
    note: tool.security.trust,
  }));
  const recommended = result.value.recommended.map((tool) => ({
    name: tool.name,
    note: tool.description,
  }));
  io.write(renderToolkitSidebar(installed, recommended));
}

/** `/tools-install <tool>`: plan → confirm → install. */
async function runToolsInstall(tool: string, deps: TuiDeps, io: TuiIo): Promise<void> {
  if (tool === "") {
    io.write("Usage: /tools-install <tool>");
    return;
  }
  const plan = await deps.toolkit.planInstall(tool);
  if (!plan.ok) {
    io.write(plan.error.message);
    return;
  }
  const p = plan.value;
  io.write(`Plan: install ${p.toolName}`);
  io.write(`  effect: ${p.effect}`);
  io.write(`  command: ${p.command.binary} ${p.command.args.join(" ")}`);
  if (p.dangerous.length > 0) {
    io.write(`  flags: ${p.dangerous.join(", ")}`);
  }
  io.write(`  trust: ${p.security.trust} (${p.security.status})`);
  const answer = (await io.readLine(`Approve and install ${p.toolName}? [y/N] `))
    .trim()
    .toLowerCase();
  if (answer !== "y" && answer !== "yes") {
    io.write("Install cancelled.");
    return;
  }
  io.write(`Installing ${p.toolName}...`);
  const outcome = await deps.toolkit.install(p.toolName, { granted: true });
  if (!outcome.ok) {
    io.write(`Install failed: ${outcome.error.message}`);
    return;
  }
  const o = outcome.value;
  io.write(`Installed ${p.toolName} (exit ${o.exitCode ?? "n/a"}).`);
  io.write(
    `Verification: ${o.verification}${o.verificationNote !== null ? ` — ${o.verificationNote}` : ""}`,
  );
  if (o.manifestPath !== null) {
    io.write(`Manifest: ${o.manifestPath}`);
  }
}

/** `/claude` `/gemini` `/codex` `/opencode` `/cursor` `/grok`. */
async function runAgent(
  provider: AgentProvider,
  args: readonly string[],
  deps: TuiDeps,
  io: TuiIo,
): Promise<void> {
  const detected = await deps.agents.detectAgent(provider);
  const available = detected.ok && detected.value.available;
  if (!available) {
    const guide = installGuideFor(provider);
    if (guide.kind === "manual") {
      io.write(renderManualInstall(guide));
      return;
    }
    io.write(`${agentLabel(provider)} is not installed.`);
    io.write("Install it through the Toolkit (official npm channel):");
    io.write(`  npm install -g ${guide.npmPackage}`);
    io.write(`Or run /tools-install ${provider} to plan and approve it here.`);
    return;
  }
  await launchAgentInteractive(provider, args, deps, io);
}

/** Launch an installed AI CLI interactively; reclaim the terminal on exit. */
async function launchAgentInteractive(
  provider: AgentProvider,
  args: readonly string[],
  deps: TuiDeps,
  io: TuiIo,
): Promise<void> {
  const created = deps.sessions.createSession({ provider, repositoryPath: deps.root });
  if (!created.ok) {
    io.write(`Failed to create session: ${created.error.message}`);
    return;
  }
  const id = created.value.id;
  io.write(`Launching ${providerLabel(provider)} — exit the CLI to return here.`);
  io.suspend();
  try {
    const started = await deps.sessions.startSession(id, {
      interactive: true,
      ...(args.length > 0 ? { args } : {}),
    });
    if (!started.ok) {
      io.write(`Failed to launch: ${started.error.message}`);
      return;
    }
    await waitForTerminal(deps.sessions, id);
  } finally {
    io.resume();
  }
  const finished = deps.sessions.getSession(id);
  const code = finished?.exitCode;
  io.write(
    `${agentLabel(provider)} exited (${finished?.status ?? "STOPPED"}${code !== undefined && code !== null ? `, code ${code}` : ""}).`,
  );
}

/** Poll a session until it reaches a terminal state (interactive run). */
async function waitForTerminal(sessions: SessionPort, sessionId: string): Promise<void> {
  for (;;) {
    const session = sessions.getSession(sessionId);
    if (session === undefined || session.status === "STOPPED" || session.status === "FAILED") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** Format an `AgentInfo` (used by tests and `/agents`). */
export function formatAgentInfo(agent: AgentInfo): string {
  return agent.available
    ? `${agent.provider}: installed (${agent.path ?? agent.binary}${agent.version !== undefined ? `, ${agent.version}` : ""})`
    : `${agent.provider}: not installed`;
}

/** Type-only re-export so the surface is easy to import from tests. */
export type { AgentInfo };
