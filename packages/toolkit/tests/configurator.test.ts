import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentInfo, AgentPort } from "@atlas/core";
import { fail } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { type ConfigWriter, FsConfigWriter } from "../src/configurator-adapter";
import { ConfiguratorService } from "../src/configurator.service";

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
  return mkdtempSync(join(tmpdir(), "atlas-configurator-"));
}

describe("tool configurator", () => {
  it("configures only installed and declared agents, with a dry-run that writes nothing", async () => {
    const configHome = home();
    const service = new ConfiguratorService({ agentPort: agents("claude"), configHome });
    const result = await service.configure(
      { toolName: "my-tool", supportedAgents: ["claude", "gemini"] },
      { dryRun: true },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedTargets).toEqual([]);
    expect(result.value.changes.map((change) => change.target)).toEqual(["claude"]);
    expect(existsSync(join(configHome, ".claude.json"))).toBe(false);
  });

  it("merges unrelated settings and backs up before applying", async () => {
    const configHome = home();
    const path = join(configHome, ".gemini", "settings.json");
    const original = { theme: "dark", tools: { existing: { enabled: true } } };
    const service = new ConfiguratorService({
      agentPort: agents("gemini"),
      configHome,
      now: () => new Date("2026-01-02T03:04:05.000Z"),
    });
    mkdirSync(join(configHome, ".gemini"), { recursive: true });
    writeFileSync(path, JSON.stringify(original));
    const result = await service.configure({ toolName: "new-tool", supportedAgents: ["gemini"] });
    expect(result.ok).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({
      theme: "dark",
      tools: { existing: { enabled: true }, "new-tool": { enabled: true } },
    });
    expect(existsSync(`${path}.20260102T030405000Z.bak`)).toBe(true);
    expect(JSON.parse(readFileSync(`${path}.20260102T030405000Z.bak`, "utf8"))).toEqual(original);
  });

  it("refuses invalid config and rolls back a failed write", async () => {
    const configHome = home();
    const path = join(configHome, ".claude.json");
    const service = new ConfiguratorService({ agentPort: agents("claude"), configHome });
    writeFileSync(path, "not-json");
    const invalid = await service.configure({ toolName: "tool", supportedAgents: ["claude"] });
    expect(invalid.ok).toBe(true);
    if (invalid.ok) expect(invalid.value.failedTargets[0]?.target).toBe("claude");
  });

  it("restores the original file when applying the merged config fails", async () => {
    const configHome = home();
    const path = join(configHome, ".claude.json");
    const original = JSON.stringify({ keep: "me" });
    writeFileSync(path, original);
    const real = new FsConfigWriter();
    const writer: ConfigWriter = {
      read: (filePath) => real.read(filePath),
      copy: (from, to) => real.copy(from, to),
      remove: (filePath) => real.remove(filePath),
      write: async () => fail(new Error("simulated write failure")),
    };
    const service = new ConfiguratorService({ agentPort: agents("claude"), configHome, writer });
    const result = await service.configure({ toolName: "tool", supportedAgents: ["claude"] });
    expect(result.ok).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ keep: "me" });
  });

  it("uses target-specific MCP entry shapes", async () => {
    const configHome = home();
    const service = new ConfiguratorService({ agentPort: agents("opencode"), configHome });
    const result = await service.configure({
      toolName: "mcp-tool",
      supportedAgents: ["opencode"],
      mcp: true,
    });
    expect(result.ok).toBe(true);
    const document = JSON.parse(
      readFileSync(join(configHome, ".config", "opencode", "opencode.jsonc"), "utf8"),
    );
    expect(document.mcp["mcp-tool"].type).toBe("local");
    expect(document.mcp["mcp-tool"].command).toEqual(["mcp-tool"]);
    expect(document.mcp["mcp-tool"].enabled).toBe(true);
    expect(document.mcp["mcp-tool"].environment).toEqual({});
  });
});
