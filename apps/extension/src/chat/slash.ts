/**
 * Slash-command parsing for the Agent Chat panel.
 *
 * The parser deliberately runs in the **extension host**, not the webview, so
 * untrusted webview text is interpreted in the trusted layer. The future
 * slash-command router for the orchestrator TTY is a separate task — this is
 * only the input-bar parser for launching agents.
 */

/** The agent providers the chat panel can launch directly. */
export const CHAT_AGENT_PROVIDERS: readonly string[] = ["claude", "gemini", "codex", "opencode"];

/** What a raw input line resolves to. */
export type LaunchSelection =
  | { readonly kind: "empty" }
  | { readonly kind: "launch"; readonly provider: string; readonly task: string }
  | { readonly kind: "auto"; readonly task: string }
  | { readonly kind: "default"; readonly task: string }
  | { readonly kind: "unknown"; readonly message: string };

/**
 * Parse one input line:
 * - `/claude fix the login bug` → explicit provider + task;
 * - `/auto fix bug` → auto-select (placeholder for the future Task 29 classifier);
 * - `fix the login bug` (bare text) → the configured default agent;
 * - an unknown `/…` prefix → `unknown` (the panel reports it as an error).
 *
 * An explicit `provider` from the message envelope wins over anything in the
 * text (that path is used by `codeatlas.agent.launch`).
 */
export function parseLaunchInput(task: string, explicitProvider?: string): LaunchSelection {
  if (explicitProvider !== undefined && task.trim() !== "") {
    return { kind: "launch", provider: explicitProvider, task: task.trim() };
  }
  const trimmed = task.trim();
  if (trimmed === "") {
    return { kind: "empty" };
  }
  const [head, ...rest] = trimmed.split(/\s+/);
  const lower = head.toLowerCase();
  if (lower.startsWith("/")) {
    const name = lower.slice(1);
    if (name === "auto") {
      return { kind: "auto", task: rest.join(" ").trim() };
    }
    if ((CHAT_AGENT_PROVIDERS as readonly string[]).includes(name)) {
      return { kind: "launch", provider: name, task: rest.join(" ").trim() };
    }
    return {
      kind: "unknown",
      message: `Unknown agent "/${name}". Use /claude, /gemini, /codex, /opencode, or /auto.`,
    };
  }
  return { kind: "default", task: trimmed };
}
