import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentInfo, AgentMcpTarget, AgentPort } from "@atlas/core";
import { describe, expect, it } from "vitest";
import { AGENT_MCP_TOOL_NAME, AgentMcpService } from "../src/agent-mcp";
import { parseTomlDocument } from "../src/configurator-toml";

class FakeAgents implements AgentPort {
  public readonly defaultProvider = "claude";
  public constructor(private readonly infos: readonly AgentInfo[]) {}
  public listAgents(): readonly string[] {
    return this.infos.map((info) => info.provider);
  }
  public async detectAgent(provider: string) {
    const info = this.infos.find((item) => item.provider === provider);
    return { ok: true as const, value: info ?? { provider, binary: provider, available: false } };
  }
  public async detectAll() {
    return { ok: true as const, value: this.infos };
  }
  public async run() {
    return { ok: false as const, error: new Error("not used") };
  }
}

function agents(...providers: string[]): AgentPort {
  return new FakeAgents(
    providers.map((provider) => ({ provider, binary: provider, available: true })),
  );
}

function home(): string {
  return mkdtempSync(join(tmpdir(), "atlas-agent-mcp-"));
}

/** Read `configHome/<dir>/<file>` (or `configHome/<file>` when `dir` is null)
 *  as JSON/JSONC and return `document[key][toolName]`. */
function readSection(configHome: string, dir: string | null, file: string, key: string): unknown {
  const path = dir === null ? join(configHome, file) : join(configHome, dir, file);
  const raw = readFileSync(path, "utf8");
  const document = JSON.parse(raw) as Record<string, Record<string, unknown>>;
  return document[key]?.[AGENT_MCP_TOOL_NAME];
}

describe("agent MCP registration", () => {
  it("reports status: installed agents marked, host targets always available", async () => {
    const configHome = home();
    const service = new AgentMcpService({
      agentPort: agents("claude"),
      root: "/repo",
      configHome,
    });
    const result = await service.status();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byTarget = new Map(result.value.entries.map((entry) => [entry.target, entry]));
    expect(byTarget.get("claude")?.available).toBe(true);
    expect(byTarget.get("claude")?.configured).toBe(false);
    expect(byTarget.get("gemini")?.available).toBe(false);
    expect(byTarget.get("cursor")?.available).toBe(true);
    expect(result.value.needsConfiguration).toBe(true);
  });

  it("writes stdio entries for Claude into ~/.claude.json mcpServers", async () => {
    const configHome = home();
    const service = new AgentMcpService({
      agentPort: agents("claude"),
      root: "/repo",
      configHome,
    });
    const result = await service.configure({ targets: ["claude"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedTargets).toEqual(["claude"]);
    expect(result.value.verifiedTargets).toEqual(["claude"]);
    const entry = readSection(configHome, null, ".claude.json", "mcpServers");
    expect(entry).toEqual({
      type: "stdio",
      command: "atlas",
      args: ["mcp"],
      env: { ATLAS_ROOT: "/repo" },
    });
  });

  it("writes schema-clean stdio entries for Gemini (strict settings schema)", async () => {
    const configHome = home();
    const service = new AgentMcpService({
      agentPort: agents("gemini"),
      root: "/repo",
      configHome,
    });
    const result = await service.configure({ targets: ["gemini"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = readSection(configHome, ".gemini", "settings.json", "mcpServers");
    expect(entry).toEqual({
      type: "stdio",
      command: "atlas",
      args: ["mcp"],
      env: { ATLAS_ROOT: "/repo" },
    });
    expect(Object.keys(entry as object).sort()).toEqual(["args", "command", "env", "type"]);
  });

  it("writes the local command shape for OpenCode into ~/.config/opencode/opencode.jsonc", async () => {
    const configHome = home();
    const service = new AgentMcpService({
      agentPort: agents("opencode"),
      root: "/repo",
      configHome,
      command: "codeatlas-mcp",
      args: [],
    });
    const result = await service.configure({ targets: ["opencode", "cursor"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedTargets).toEqual(["opencode", "cursor"]);
    const opencodeEntry = readSection(configHome, ".config/opencode", "opencode.jsonc", "mcp");
    expect(opencodeEntry).toEqual({
      type: "local",
      command: ["codeatlas-mcp"],
      enabled: true,
      environment: { ATLAS_ROOT: "/repo" },
    });
    const cursorEntry = readSection(configHome, ".cursor", "mcp.json", "mcpServers");
    expect(cursorEntry).toEqual({
      type: "stdio",
      command: "codeatlas-mcp",
      args: [],
      env: { ATLAS_ROOT: "/repo" },
    });
  });

  it("writes a real [mcp_servers.codeatlas] table into Codex's config.toml", async () => {
    const configHome = home();
    const service = new AgentMcpService({
      agentPort: agents("codex"),
      root: "/repo",
      configHome,
    });
    const result = await service.configure({ targets: ["codex"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedTargets).toEqual(["codex"]);
    expect(result.value.verifiedTargets).toEqual(["codex"]);
    const raw = readFileSync(join(configHome, ".codex", "config.toml"), "utf8");
    const document = parseTomlDocument(raw);
    expect(document.ok).toBe(true);
    if (!document.ok) return;
    const section = document.value["mcp_servers"] as Record<string, unknown>;
    expect(section[AGENT_MCP_TOOL_NAME]).toEqual({
      command: "atlas",
      args: ["mcp"],
      env: { ATLAS_ROOT: "/repo" },
    });
    expect(raw).toContain("[mcp_servers.codeatlas]");
  });

  it("merges a comment-heavy Codex config.toml without touching unrelated bytes", async () => {
    const configHome = home();
    const codexPath = join(configHome, ".codex", "config.toml");
    mkdirSync(join(configHome, ".codex"), { recursive: true });
    writeFileSync(
      codexPath,
      [
        "# user comment that must survive",
        'model = "gpt-5-mini"',
        "",
        "[mcp_servers.node_repl]",
        'command = "node_repl.exe"',
        "",
        "[projects.'c:\\some\\path']",
        'trust_level = "trusted"',
        "",
      ].join("\n"),
    );
    const service = new AgentMcpService({
      agentPort: agents("codex"),
      root: "/repo",
      configHome,
    });
    const result = await service.configure({ targets: ["codex"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const merged = readFileSync(codexPath, "utf8");
    expect(merged).toContain("# user comment that must survive");
    expect(merged).toContain('model = "gpt-5-mini"');
    expect(merged).toContain('command = "node_repl.exe"');
    expect(merged).toContain("[mcp_servers.codeatlas]");
    expect(merged).toContain('command = "atlas"');
    expect(merged).toContain("[projects.'c:\\some\\path']");
    const document = parseTomlDocument(merged);
    expect(document.ok).toBe(true);
  });

  it("skips targets that are already configured and only writes for installed agents", async () => {
    const configHome = home();
    const service = new AgentMcpService({
      agentPort: agents("claude"),
      root: "/repo",
      configHome,
    });
    await service.configure({ targets: ["claude"] });
    const second = await service.configure({ targets: ["claude", "gemini", "cursor"] });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.skippedTargets).toContain("claude");
    expect(second.value.appliedTargets).toEqual(["cursor"]);
    expect(existsSync(join(configHome, ".gemini", "settings.json"))).toBe(false);
  });

  it("dry-run plans without writing anything", async () => {
    const configHome = home();
    const service = new AgentMcpService({
      agentPort: agents("claude"),
      root: "/repo",
      configHome,
    });
    const result = await service.configure({ targets: ["claude"], dryRun: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedTargets).toEqual([]);
    expect(result.value.changes.map((change) => change.target)).toEqual(["claude"]);
    expect(existsSync(join(configHome, ".claude.json"))).toBe(false);
  });

  it("merges existing user config and reports unparseable files as failed", async () => {
    const configHome = home();
    const claudePath = join(configHome, ".claude.json");
    const geminiPath = join(configHome, ".gemini", "settings.json");
    mkdirSync(join(configHome, ".gemini"), { recursive: true });
    writeFileSync(claudePath, JSON.stringify({ theme: "dark", mcpServers: { other: {} } }));
    writeFileSync(geminiPath, "not-json");
    const service = new AgentMcpService({
      agentPort: agents("claude", "gemini"),
      root: "/repo",
      configHome,
    });
    const result = await service.configure({ targets: ["claude", "gemini"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedTargets).toEqual(["claude"]);
    expect(result.value.failedTargets[0]?.target).toBe("gemini");
    const merged = JSON.parse(readFileSync(claudePath, "utf8"));
    expect(merged.theme).toBe("dark");
    expect(merged.mcpServers[AGENT_MCP_TOOL_NAME]).toBeDefined();
  });

  it("only configures the explicitly selected targets", async () => {
    const configHome = home();
    const service = new AgentMcpService({
      agentPort: agents("claude", "gemini"),
      root: "/repo",
      configHome,
    });
    const result = await service.configure({ targets: ["gemini" as AgentMcpTarget] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedTargets).toEqual(["gemini"]);
    expect(existsSync(join(configHome, ".claude.json"))).toBe(false);
  });
});
