import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAgentMcpService, createAgentService } from "../src/index";

describe("createAgentService", () => {
  it("returns an agent port with the built-in providers registered", () => {
    const agents = createAgentService();
    expect(agents.listAgents()).toEqual(["claude", "gemini", "codex", "opencode"]);
    expect(agents.defaultProvider).toBe("claude");
  });

  it("reports a missing CLI as unavailable without spawning", async () => {
    const agents = createAgentService({ resolveExecutable: () => null });
    const result = await agents.detectAgent("claude");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.available).toBe(false);
    expect(result.value.path).toBeUndefined();
  });

  it("detects all registered providers", async () => {
    const agents = createAgentService({ resolveExecutable: () => null });
    const result = await agents.detectAll();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toHaveLength(4);
    expect(result.value.every((info) => info.available === false)).toBe(true);
  });
});

describe("createAgentMcpService", () => {
  it("composes the AgentMcpPort over the default agent service", async () => {
    const configHome = mkdtempSync(join(tmpdir(), "atlas-sdk-agents-"));
    const agents = createAgentService({ resolveExecutable: () => null });
    const agentMcp = createAgentMcpService({ agents, root: "/repo", configHome });

    expect(agentMcp.targets).toEqual(["claude", "gemini", "codex", "opencode", "cursor", "cline"]);

    const status = await agentMcp.status();
    expect(status.ok).toBe(true);
    if (!status.ok) {
      return;
    }
    expect(status.value.entries).toHaveLength(6);
    expect(status.value.entries.filter((entry) => entry.available)).toHaveLength(2);
    expect(status.value.entries.find((entry) => entry.target === "cursor")?.available).toBe(true);
    expect(status.value.entries.find((entry) => entry.target === "cline")?.available).toBe(true);
    expect(status.value.entries.find((entry) => entry.target === "claude")?.available).toBe(false);
    expect(status.value.needsConfiguration).toBe(true);
  });
});
