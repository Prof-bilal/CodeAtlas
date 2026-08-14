import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentInfo, AgentMcpTarget, AgentPort } from "@atlas/core";
import { describe, expect, it } from "vitest";
import { AGENT_MCP_TOOL_NAME, AgentMcpService } from "../src/agent-mcp";

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

function readSection(configHome: string, dir: string, file: string, key: string) {
  const document = JSON.parse(readFileSync(join(configHome, dir, file), "utf8"));
  return document[key][AGENT_MCP_TOOL_NAME];
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

  it("writes stdio entries for CLI agents with ATLAS_ROOT and registeredBy", async () => {
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
    expect(result.value.failedTargets).toEqual([]);
    const entry = readSection(configHome, ".claude", "settings.json", "mcpServers");
    expect(entry).toEqual({
      type: "stdio",
      command: "atlas",
      args: ["mcp"],
      env: { ATLAS_ROOT: "/repo" },
      registeredBy: "codeatlas",
    });
  });

  it("uses the local command shape for OpenCode and always-available host targets", async () => {
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
    expect(readSection(configHome, ".opencode", "config.json", "mcp")).toEqual({
      type: "local",
      command: ["codeatlas-mcp"],
      env: { ATLAS_ROOT: "/repo" },
      registeredBy: "codeatlas",
    });
    expect(readSection(configHome, ".cursor", "mcp.json", "mcpServers")).toEqual({
      type: "stdio",
      command: "codeatlas-mcp",
      args: [],
      env: { ATLAS_ROOT: "/repo" },
      registeredBy: "codeatlas",
    });
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
    expect(existsSync(join(configHome, ".claude", "settings.json"))).toBe(false);
  });

  it("merges existing user config and reports unparseable files as failed", async () => {
    const configHome = home();
    const claudePath = join(configHome, ".claude", "settings.json");
    const geminiPath = join(configHome, ".gemini", "settings.json");
    mkdirSync(join(configHome, ".gemini"), { recursive: true });
    mkdirSync(join(configHome, ".claude"), { recursive: true });
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
    expect(existsSync(join(configHome, ".claude", "settings.json"))).toBe(false);
  });
});
