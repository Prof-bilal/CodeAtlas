import type { VscodeApi } from "../vscode-host";

/** The CodeAtlas configuration keys the chat panel reads (section `codeatlas`). */
export const CHAT_CONFIG_SECTION = "codeatlas";
export const DEFAULT_AGENT = "claude";
export const DEFAULT_CONTEXT_AUTO_INJECT = true;
export const DEFAULT_CONTEXT_BUDGET = 12000;

/** The chat-relevant slice of the `codeatlas.*` VS Code configuration. */
export interface ChatConfig {
  /** Agent used when no slash command (or `/auto`) names one. */
  readonly defaultAgent: string;
  /** Automatically assemble + inject a context package when launching. */
  readonly contextAutoInject: boolean;
  /** Maximum total tokens for the injected context package. */
  readonly contextBudget: number;
}

/** Read the chat configuration through the injectable host (host-agnostic). */
export function readChatConfig(host: VscodeApi): ChatConfig {
  const configuration = host.workspace.getConfiguration?.(CHAT_CONFIG_SECTION);
  return {
    defaultAgent:
      configuration?.get<string>(CHAT_DEFAULT_AGENT_KEY, DEFAULT_AGENT) ?? DEFAULT_AGENT,
    contextAutoInject:
      configuration?.get<boolean>(CHAT_AUTO_INJECT_KEY, DEFAULT_CONTEXT_AUTO_INJECT) ??
      DEFAULT_CONTEXT_AUTO_INJECT,
    contextBudget:
      configuration?.get<number>(CHAT_BUDGET_KEY, DEFAULT_CONTEXT_BUDGET) ?? DEFAULT_CONTEXT_BUDGET,
  };
}

/** Persist the default agent so bare input (and `/auto`) use it. */
export async function setDefaultAgent(host: VscodeApi, provider: string): Promise<void> {
  await host.workspace.updateConfiguration?.(CHAT_CONFIG_SECTION, CHAT_DEFAULT_AGENT_KEY, provider);
}

const CHAT_DEFAULT_AGENT_KEY = "defaultAgent";
const CHAT_AUTO_INJECT_KEY = "contextAutoInject";
const CHAT_BUDGET_KEY = "contextBudget";
