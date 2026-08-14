/**
 * Slash-command router for the interactive TUI (`atlas tui`). Pure and
 * side-effect free so the parser is trivially unit-testable.
 */

/** The agent providers the TUI knows about (installed via CLI or installer). */
export type AgentProvider = "claude" | "gemini" | "codex" | "opencode" | "cursor" | "grok";

/** Providers shipped in the AI CLI catalog (installable through the Toolkit). */
export const CATALOG_AGENT_PROVIDERS: readonly AgentProvider[] = [
  "claude",
  "gemini",
  "codex",
  "opencode",
];

/** Providers without an official npm package (install guidance only). */
export const MANUAL_AGENT_PROVIDERS: readonly AgentProvider[] = ["cursor", "grok"];

export const AGENT_PROVIDERS: readonly AgentProvider[] = [
  ...CATALOG_AGENT_PROVIDERS,
  ...MANUAL_AGENT_PROVIDERS,
];

/** A command that only carries its kind. */
export type SimpleCommandKind =
  | "help"
  | "status"
  | "scan"
  | "agents"
  | "toolkit"
  | "providers"
  | "exit";

/** `/ollama` sub-actions (bare `/ollama` shows status). */
export type OllamaAction = "connect" | "disconnect" | "models" | "use";

/** Every command the router can produce. */
export type TuiCommand =
  | { readonly kind: SimpleCommandKind }
  | { readonly kind: "agent"; readonly provider: AgentProvider; readonly args: readonly string[] }
  | {
      readonly kind: "ollama";
      readonly action: OllamaAction | null;
      readonly args: readonly string[];
    }
  | { readonly kind: "search"; readonly query: string }
  | { readonly kind: "context"; readonly task: string }
  | { readonly kind: "tools-install"; readonly tool: string }
  | { readonly kind: "unknown"; readonly raw: string }
  | { readonly kind: "empty" };

const OLLAMA_ACTIONS: readonly string[] = ["connect", "disconnect", "models", "use"];

/** Parse one user input line into a command (never throws). */
export function parseCommandLine(line: string): TuiCommand {
  const trimmed = line.trim();
  if (trimmed === "") {
    return { kind: "empty" };
  }
  const [head, ...rest] = trimmed.split(/\s+/);
  const lower = head.toLowerCase();
  switch (lower) {
    case "/help":
      return { kind: "help" };
    case "/status":
      return { kind: "status" };
    case "/scan":
      return { kind: "scan" };
    case "/agents":
      return { kind: "agents" };
    case "/toolkit":
      return { kind: "toolkit" };
    case "/providers":
      return { kind: "providers" };
    case "/exit":
    case "/quit":
      return { kind: "exit" };
    case "/search":
      return { kind: "search", query: rest.join(" ").trim() };
    case "/context":
      return { kind: "context", task: rest.join(" ").trim() };
    case "/tools-install":
      return { kind: "tools-install", tool: rest.join(" ").trim() };
    case "/ollama": {
      const [action, ...tail] = rest;
      if (action !== undefined && OLLAMA_ACTIONS.includes(action.toLowerCase())) {
        return {
          kind: "ollama",
          action: action.toLowerCase() as OllamaAction,
          args: tail,
        };
      }
      return { kind: "ollama", action: null, args: [] };
    }
    default:
      if (lower.startsWith("/")) {
        const provider = lower.slice(1);
        if ((AGENT_PROVIDERS as readonly string[]).includes(provider)) {
          return {
            kind: "agent",
            provider: provider as AgentProvider,
            args: rest,
          };
        }
      }
      return { kind: "unknown", raw: trimmed };
  }
}
