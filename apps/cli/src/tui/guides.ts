/**
 * Per-provider install guidance for the TUI. Toolkit-installable providers map
 * to an official npm package; the rest carry the vendor's official install
 * commands so the user can set them up outside CodeAtlas.
 */

import { agentLabel } from "../commands/sessions";
import type { AgentProvider } from "./router";

/** A provider the Toolkit can install (official npm package id). */
export interface CatalogGuide {
  readonly kind: "catalog";
  readonly provider: AgentProvider;
  readonly npmPackage: string;
}

/** A provider installed via the vendor's own channel. */
export interface ManualGuide {
  readonly kind: "manual";
  readonly provider: AgentProvider;
  readonly label: string;
  readonly commands: readonly string[];
  readonly verify: string;
}

export type AgentInstallGuide = CatalogGuide | ManualGuide;

/** Map a provider to its install guidance (platform-aware for manual ones). */
export function installGuideFor(provider: AgentProvider): AgentInstallGuide {
  switch (provider) {
    case "claude":
      return { kind: "catalog", provider, npmPackage: "@anthropic-ai/claude-code" };
    case "gemini":
      return { kind: "catalog", provider, npmPackage: "@google/gemini-cli" };
    case "codex":
      return { kind: "catalog", provider, npmPackage: "@openai/codex" };
    case "opencode":
      return { kind: "catalog", provider, npmPackage: "opencode-ai" };
    case "cursor":
      return {
        kind: "manual",
        provider,
        label: "Cursor CLI",
        commands:
          process.platform === "win32"
            ? ["irm 'https://cursor.com/install?win32=true' | iex"]
            : ["curl -fsSL https://cursor.com/install | bash"],
        verify: "agent --version",
      };
    case "grok":
      return {
        kind: "manual",
        provider,
        label: "Grok Build (xAI)",
        commands:
          process.platform === "win32"
            ? ["irm https://x.ai/cli/install.ps1 | iex"]
            : ["curl -fsSL https://x.ai/cli/install.sh | bash"],
        verify: "grok --version",
      };
  }
}

/** Short label for a provider, falling back to the provider id itself. */
export function providerLabel(provider: AgentProvider): string {
  const guide = installGuideFor(provider);
  return guide.kind === "manual" ? guide.label : agentLabel(provider);
}
