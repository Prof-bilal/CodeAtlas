import type { SessionStatus } from "@atlas/sdk";

/**
 * The webview ↔ extension-host message protocol for the Agent Chat panel.
 *
 * The webview only ever talks to CodeAtlas through these `postMessage` /
 * `onDidReceiveMessage` envelopes — it never touches the context database, the
 * filesystem, or any `@atlas/*` package directly.
 */

/** An agent entry rendered in the webview sidebar. */
export interface ChatAgentInfo {
  readonly provider: string;
  readonly binary: string;
  readonly available: boolean;
  readonly version?: string;
  readonly isDefault: boolean;
}

/** A session rendered in the webview sidebar (a UI-facing view over `Session`). */
export interface ChatSessionView {
  readonly id: string;
  readonly provider: string;
  readonly repositoryPath: string;
  readonly status: SessionStatus;
  readonly processId?: number;
  readonly startedAt?: number;
  readonly endedAt?: number;
  readonly exitCode?: number | null;
  readonly error?: string;
}

/** Messages the webview sends to the extension host. */
export type ChatWebviewMessage =
  | { readonly type: "launchAgent"; readonly provider?: string; readonly task: string }
  | { readonly type: "stopAgent"; readonly sessionId: string }
  | { readonly type: "listAgents" }
  | { readonly type: "listSessions" };

/** Messages the extension host sends to the webview. */
export type ChatHostMessage =
  | {
      readonly type: "agentOutput";
      readonly sessionId: string;
      readonly stream: "stdout" | "stderr";
      readonly data: string;
    }
  | {
      readonly type: "agentStatus";
      readonly sessionId: string;
      readonly status: SessionStatus;
      readonly provider: string;
    }
  | {
      readonly type: "contextInfo";
      readonly sessionId: string;
      readonly items: number;
      readonly tokens: number;
      readonly staleness: string;
      readonly dropped: number;
    }
  | { readonly type: "agentsList"; readonly agents: readonly ChatAgentInfo[] }
  | { readonly type: "sessionsList"; readonly sessions: readonly ChatSessionView[] }
  | { readonly type: "error"; readonly message: string }
  | {
      readonly type: "config";
      readonly defaultAgent: string;
      readonly contextAutoInject: boolean;
      readonly contextBudget: number;
    };

/** Guard: is an unknown payload a well-formed webview message? */
export function isChatWebviewMessage(message: unknown): message is ChatWebviewMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const msg = message as Record<string, unknown>;
  switch (msg["type"]) {
    case "launchAgent":
      return (
        typeof msg["task"] === "string" &&
        (msg["provider"] === undefined || typeof msg["provider"] === "string")
      );
    case "stopAgent":
      return typeof msg["sessionId"] === "string";
    case "listAgents":
    case "listSessions":
      return true;
    default:
      return false;
  }
}
