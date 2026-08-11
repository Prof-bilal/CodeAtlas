import { createAgentAdapter, type AgentAdapter } from "./adapter";

/**
 * The built-in AI CLI adapters. Each is a thin, provider-specific configuration
 * for a well-known external CLI. The exact non-interactive run flags are
 * documented per CLI but were **not** live-verified against installed tools in
 * this repository — they are the common documented defaults and can be
 * overridden per configuration.
 */
export const builtinAdapters: readonly AgentAdapter[] = [
  createAgentAdapter({
    name: "claude",
    binary: "claude",
    // `claude -p "..."` runs Claude Code in non-interactive print mode.
    runMode: ["-p"],
    env: {},
  }),
  createAgentAdapter({
    name: "gemini",
    binary: "gemini",
    // `gemini -p "..."` runs the Gemini CLI in non-interactive print mode.
    runMode: ["-p"],
    env: {},
  }),
  createAgentAdapter({
    name: "codex",
    binary: "codex",
    // `codex exec "..."` runs OpenAI Codex in one-shot exec mode.
    runMode: ["exec"],
    env: {},
  }),
  createAgentAdapter({
    name: "opencode",
    binary: "opencode",
    // `opencode run "..."` runs OpenCode in non-interactive run mode.
    runMode: ["run"],
    env: {},
  }),
];
