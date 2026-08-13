import { describe, expect, it, vi } from "vitest";
import type { AgentChatPanel } from "../src/chat/agent-chat-panel";
import { registerChatCommands } from "../src/chat/commands";
import { FakeAgentPort } from "./chat-fakes";
import { type FakeHostRecords, createFakeHost } from "./fake-host";

function stubPanel(): {
  readonly panel: AgentChatPanel;
  readonly launchAgent: ReturnType<typeof vi.fn>;
  readonly stopAgent: ReturnType<typeof vi.fn>;
  readonly activeSessionId: ReturnType<typeof vi.fn>;
} {
  const launchAgent = vi.fn(async () => undefined);
  const stopAgent = vi.fn(async () => undefined);
  const activeSessionId = vi.fn(() => undefined);
  const panel = { launchAgent, stopAgent, activeSessionId } as unknown as AgentChatPanel;
  return { panel, launchAgent, stopAgent, activeSessionId };
}

interface CommandsHarness {
  readonly records: FakeHostRecords;
  readonly agents: FakeAgentPort;
  readonly launchAgent: ReturnType<typeof vi.fn>;
  readonly stopAgent: ReturnType<typeof vi.fn>;
  readonly activeSessionId: ReturnType<typeof vi.fn>;
  readonly dispose: () => void;
}

function register(): CommandsHarness {
  const { host, records } = createFakeHost();
  const agents = new FakeAgentPort();
  const { panel, launchAgent, stopAgent, activeSessionId } = stubPanel();
  const disposables = registerChatCommands({ host, panel, agents });
  return {
    records,
    agents,
    launchAgent,
    stopAgent,
    activeSessionId,
    dispose: () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    },
  };
}

describe("registerChatCommands", () => {
  it("registers the four chat commands", () => {
    const { records, dispose } = register();
    const commands = [...records.registeredCommands.keys()].sort();
    expect(commands).toEqual(
      [
        "codeatlas.chat.open",
        "codeatlas.agent.launch",
        "codeatlas.agent.stop",
        "codeatlas.agent.selectDefault",
      ].sort(),
    );
    dispose();
  });

  it("openChat reveals the chat view", async () => {
    const { records, dispose } = register();
    const open = records.registeredCommands.get("codeatlas.chat.open");
    await open?.();
    expect(records.executedCommands.map((entry) => entry.command)).toContain(
      "codeatlas-chat.focus",
    );
    dispose();
  });

  it("launchAgent focuses the chat and launches with a task", async () => {
    const { records, launchAgent, dispose } = register();
    const launch = records.registeredCommands.get("codeatlas.agent.launch");
    await launch?.({ task: "explain the build" });
    expect(records.executedCommands.map((entry) => entry.command)).toContain(
      "codeatlas-chat.focus",
    );
    expect(launchAgent).toHaveBeenCalledWith({ task: "explain the build" });
    dispose();
  });

  it("launchAgent forwards the provider", async () => {
    const { records, launchAgent, dispose } = register();
    const launch = records.registeredCommands.get("codeatlas.agent.launch");
    await launch?.("do a thing");
    expect(launchAgent).toHaveBeenCalledWith({ task: "do a thing" });
    dispose();
  });

  it("launchAgent with no usable args only focuses the chat", async () => {
    const { records, launchAgent, dispose } = register();
    const launch = records.registeredCommands.get("codeatlas.agent.launch");
    await launch?.();
    expect(launchAgent).not.toHaveBeenCalled();
    expect(records.executedCommands.map((entry) => entry.command)).toContain(
      "codeatlas-chat.focus",
    );
    dispose();
  });

  it("stopAgent with an explicit session id stops that session", async () => {
    const { records, stopAgent, dispose } = register();
    const stop = records.registeredCommands.get("codeatlas.agent.stop");
    await stop?.("s0001");
    expect(stopAgent).toHaveBeenCalledWith("s0001");
    dispose();
  });

  it("stopAgent with no session stops the newest active session", async () => {
    const { records, stopAgent, activeSessionId, dispose } = register();
    activeSessionId.mockReturnValue("s0002");
    const stop = records.registeredCommands.get("codeatlas.agent.stop");
    await stop?.();
    expect(activeSessionId).toHaveBeenCalled();
    expect(stopAgent).toHaveBeenCalledWith("s0002");
    dispose();
  });

  it("stopAgent with nothing active informs the user", async () => {
    const { records, stopAgent, dispose } = register();
    const stop = records.registeredCommands.get("codeatlas.agent.stop");
    await stop?.();
    expect(stopAgent).not.toHaveBeenCalled();
    expect(records.messages).toContain("info: No active agent session to stop.");
    dispose();
  });

  it("selectDefaultAgent persists the picked agent", async () => {
    const { records, dispose } = register();
    const select = records.registeredCommands.get("codeatlas.agent.selectDefault");
    await select?.();

    expect(records.quickPickItems.map((item) => item.label)).toEqual([
      "claude",
      "gemini",
      "codex",
      "opencode",
    ]);
    expect(records.config.get("codeatlas.defaultAgent")).toBe("claude");
    expect(records.messages).toContain("info: Default agent set to claude.");
    dispose();
  });
});
