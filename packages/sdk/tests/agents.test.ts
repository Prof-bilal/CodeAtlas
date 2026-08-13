import { describe, expect, it } from "vitest";
import { createAgentService } from "../src/index";

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
