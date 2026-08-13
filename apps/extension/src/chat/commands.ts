import type { AgentPort } from "@atlas/sdk";
import type { VscodeApi, VscodeDisposable, VscodeQuickPickItem } from "../vscode-host";
import type { AgentChatPanel } from "./agent-chat-panel";
import { setDefaultAgent } from "./config";
import { CHAT_AGENT_PROVIDERS } from "./slash";

/** Everything the chat commands need. */
export interface ChatCommandContext {
  readonly host: VscodeApi;
  readonly panel: AgentChatPanel;
  /** CLI detection for `selectDefault` (installed status in the quick-pick). */
  readonly agents: AgentPort;
}

/** Register the Agent Chat commands against the host. */
export function registerChatCommands(ctx: ChatCommandContext): VscodeDisposable[] {
  const handlers: Record<string, (...args: unknown[]) => Promise<void> | void> = {
    "codeatlas.chat.open": () => openChat(ctx),
    "codeatlas.agent.launch": (args) => launchAgent(ctx, args),
    "codeatlas.agent.stop": (args) => stopAgent(ctx, args),
    "codeatlas.agent.selectDefault": () => selectDefaultAgent(ctx),
  };
  const disposables: VscodeDisposable[] = [];
  for (const [command, handler] of Object.entries(handlers)) {
    disposables.push(ctx.host.views.registerCommand(command, handler));
  }
  return disposables;
}

/** `Atlas: Open Agent Chat` — reveal the chat webview view. */
export async function openChat(ctx: ChatCommandContext): Promise<void> {
  await ctx.host.commands.executeCommand("codeatlas-chat.focus");
}

/**
 * `Atlas: Launch Agent` — reveal the chat panel and launch with the given
 * task/provider. The argument is either a task string, `{ task, provider? }`,
 * or `{ provider }` (launching with the panel focused for input).
 */
export async function launchAgent(ctx: ChatCommandContext, args: unknown): Promise<void> {
  await ctx.host.commands.executeCommand("codeatlas-chat.focus");
  const input = normalizeLaunchArgs(args);
  if (input !== null) {
    await ctx.panel.launchAgent(input);
  }
}

/** `Atlas: Stop Agent` — stop the given session, or the newest active one. */
export async function stopAgent(ctx: ChatCommandContext, args: unknown): Promise<void> {
  const sessionId = normalizeSessionId(args);
  if (sessionId !== undefined) {
    await ctx.panel.stopAgent(sessionId);
    return;
  }
  const active = ctx.panel.activeSessionId();
  if (active === undefined) {
    await ctx.host.window.showInformationMessage("No active agent session to stop.");
    return;
  }
  await ctx.panel.stopAgent(active);
}

/** `Atlas: Select Default Agent` — quick-pick the agent for bare input. */
export async function selectDefaultAgent(ctx: ChatCommandContext): Promise<void> {
  const detected = await ctx.agents.detectAll();
  const options: VscodeQuickPickItem[] = detected.ok
    ? detected.value.map((agent) => ({
        label: agent.provider,
        description: agent.available
          ? `installed (${agent.path ?? agent.binary}${agent.version !== undefined ? `, ${agent.version}` : ""})`
          : "not installed",
      }))
    : CHAT_AGENT_PROVIDERS.map((provider) => ({ label: provider }));
  const picked = await ctx.host.window.showQuickPick(options, { placeHolder: "Default agent" });
  if (picked === undefined) {
    return;
  }
  await setDefaultAgent(ctx.host, picked.label);
  await ctx.host.window.showInformationMessage(`Default agent set to ${picked.label}.`);
}

/** Accept a string task, `{ task }`, `{ task, provider }`, or `{ provider }`. */
function normalizeLaunchArgs(
  args: unknown,
): { readonly provider?: string; readonly task: string } | null {
  if (typeof args === "string" && args.trim() !== "") {
    return { task: args };
  }
  if (typeof args === "object" && args !== null) {
    const record = args as Record<string, unknown>;
    const task = typeof record["task"] === "string" ? record["task"] : "";
    const provider = typeof record["provider"] === "string" ? record["provider"] : undefined;
    if (task.trim() === "" && provider === undefined) {
      return null;
    }
    return { ...(provider === undefined ? {} : { provider }), task };
  }
  return null;
}

function normalizeSessionId(args: unknown): string | undefined {
  if (typeof args === "string" && args.trim() !== "") {
    return args;
  }
  if (typeof args === "object" && args !== null) {
    const sessionId = (args as Record<string, unknown>)["sessionId"];
    return typeof sessionId === "string" ? sessionId : undefined;
  }
  return undefined;
}
