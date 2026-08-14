/**
 * Pure renderers for the interactive TUI (`atlas tui`). All functions take
 * plain data and return strings; nothing here touches the terminal.
 */

import type { AgentInfo, ContextStatus } from "@atlas/sdk";

/** Header summary shown when the TUI starts. */
export interface HeaderInfo {
  readonly repoLabel: string;
  readonly contextState: string;
}

/** Draw a box around a set of lines. */
function box(title: string, lines: readonly string[]): string {
  const content = [title, ...lines];
  const width = Math.max(...content.map((line) => line.length)) + 2;
  const inner = (text: string): string => `│ ${text.padEnd(width)} │`;
  const border = `┌${"─".repeat(width + 2)}┐`;
  const footer = `└${"─".repeat(width + 2)}┘`;
  return [
    border,
    `│ ${title.padEnd(width)} │`,
    `├${"─".repeat(width + 2)}┤`,
    ...lines.map(inner),
    footer,
  ].join("\n");
}

/** Render the opening header block. */
export function renderHeader(info: HeaderInfo): string {
  return box("CodeAtlas · AI Context Engine", [
    `Repository: ${info.repoLabel}`,
    `Context: ${info.contextState}`,
    "Type /help for commands · /exit to leave",
  ]);
}

/** Human summary of a {@link ContextStatus}. */
export function contextStateLabel(status: ContextStatus): string {
  if (!status.available) {
    return "Not built — run /scan";
  }
  const date = status.lastUpdated === "" ? "" : ` · ${status.lastUpdated.slice(0, 10)}`;
  return `Ready · ${status.filesIndexed} files · ${status.symbolsIndexed} symbols${date}`;
}

/** Render the slash-command help text. */
export function renderHelp(): string {
  return [
    "Commands:",
    "  /scan                 Build or refresh the context index",
    "  /search <query>       Search files & symbols in the index",
    "  /context <task>       Assemble a context package for a task",
    "  /agents               List installed AI CLIs",
    "  /toolkit              Show repo tools (installed + recommended)",
    "  /tools-install <tool> Plan and install a tool from the catalog",
    "  /providers            Show AI provider status (Ollama, OpenAI, …)",
    "  /ollama [connect|disconnect|models|use <model>]",
    "                        Manage the optional Ollama AI provider",
    "  /claude [/gemini /codex /opencode] [args...]",
    "                        Launch an AI CLI in your terminal",
    "  /cursor /grok         Show install instructions for these CLIs",
    "  /status               Repository, context, agents, sessions, tools",
    "  /help                 Show this help",
    "  /exit (/quit)         Leave the TUI",
  ].join("\n");
}

/** Render the installed-AI-CLI list (`/agents`). */
export function renderAgents(agents: readonly AgentInfo[]): string {
  const lines = agents.map((agent) => {
    const version = agent.available && agent.version !== undefined ? `  ${agent.version}` : "";
    const state = agent.available ? "✓ installed" : "✗ not installed";
    return `  ${agent.provider.padEnd(10)} ${state}${version}`;
  });
  return box("Installed AI CLIs", lines);
}

/** One entry in the toolkit sidebar. */
export interface SidebarEntry {
  readonly name: string;
  readonly note?: string;
}

/** Render the `/toolkit` sidebar (installed + recommended tools). */
export function renderToolkitSidebar(
  installed: readonly SidebarEntry[],
  recommended: readonly SidebarEntry[],
): string {
  const lines: string[] = [];
  if (installed.length > 0) {
    lines.push("Installed:");
    for (const entry of installed) {
      lines.push(`  ✓ ${entry.name}${entry.note !== undefined ? ` [${entry.note}]` : ""}`);
    }
  } else {
    lines.push("Installed: none");
  }
  lines.push("Recommended:");
  for (const entry of recommended) {
    lines.push(`  • ${entry.name}${entry.note !== undefined ? ` — ${entry.note}` : ""}`);
  }
  lines.push("/tools-install <name> to install");
  return box("Toolkit", lines);
}

/** Render install guidance for a provider the Toolkit cannot install. */
export interface ManualInstallGuide {
  readonly label: string;
  readonly commands: readonly string[];
  readonly verify: string;
}

/** Render install guidance for a provider the Toolkit cannot install. */
export function renderManualInstall(guide: ManualInstallGuide): string {
  return [
    `${guide.label} is not installed and has no official npm package, so the Toolkit cannot install it.`,
    "Install it directly, then relaunch:",
    ...guide.commands.map((command) => `  $ ${command}`),
    `Verify with: ${guide.verify}`,
  ].join("\n");
}

/** Summarize the count of running sessions for `/status`. */
export function sessionSummary(count: number): string {
  return count === 0 ? "0 active sessions" : `${count} active session${count === 1 ? "" : "s"}`;
}

/** Render the `/providers` AI-provider overview. */
export function renderProvidersPanel(lines: readonly string[]): string {
  return box("AI Providers", lines);
}

/** Render the `/ollama` status panel. */
export function renderOllamaPanel(lines: readonly string[]): string {
  return box("Ollama", lines);
}
