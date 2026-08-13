import { describe, expect, it } from "vitest";
import { AgentChatPanel } from "../src/chat/agent-chat-panel";
import type { ChatConfig } from "../src/chat/config";
import { FakeAgentPort, FakeContextIntegration, FakeSessionPort } from "./chat-fakes";
import { type FakeHostRecords, FakeWebviewView, createFakeHost } from "./fake-host";

function makeChatConfig(overrides: Partial<ChatConfig> = {}): ChatConfig {
  return {
    defaultAgent: "claude",
    contextAutoInject: true,
    contextBudget: 12000,
    ...overrides,
  };
}

interface PanelHarness {
  readonly panel: AgentChatPanel;
  readonly view: FakeWebviewView;
  readonly records: FakeHostRecords;
  readonly sessions: FakeSessionPort;
  readonly integration: FakeContextIntegration;
  readonly agents: FakeAgentPort;
  readonly terminals: FakeHostRecords["createdTerminals"];
}

/** Build a resolved panel with fakes; `promptDelayMs: 0` keeps tests fast. */
async function resolvePanel(
  readConfig: () => ChatConfig = () => makeChatConfig(),
): Promise<PanelHarness> {
  const { host, records } = createFakeHost();
  const sessions = new FakeSessionPort();
  const integration = new FakeContextIntegration();
  const agents = new FakeAgentPort();
  const panel = new AgentChatPanel({
    host,
    sessions,
    integration,
    agents,
    repositoryPath: "/repo",
    readConfig,
    promptDelayMs: 0,
  });
  const view = new FakeWebviewView();
  await panel.resolveWebviewView(view);
  return {
    panel,
    view,
    records,
    sessions,
    integration,
    agents,
    terminals: records.createdTerminals,
  };
}

describe("AgentChatPanel", () => {
  it("renders the split-layout webview and seeds the sidebar on resolve", async () => {
    const { view } = await resolvePanel();
    expect(view.webview.html).toContain("CodeAtlas Agent Chat");
    expect(view.webview.html).toContain('id="sidebar"');

    const posted = view.webview.posted as readonly { type: string }[];
    const types = posted.map((message) => message.type);
    expect(types).toContain("agentsList");
    expect(types).toContain("sessionsList");
    expect(types).toContain("config");
  });

  it("launches the default agent with an auto-injected context package", async () => {
    const { panel, view, sessions, integration, terminals } = await resolvePanel();

    await panel.launchAgent({ task: "explain the build" });

    expect(sessions.created).toEqual([{ provider: "claude", repositoryPath: "/repo" }]);
    expect(integration.built).toHaveLength(1);
    expect(integration.built[0].task).toBe("explain the build");
    expect(integration.built[0].budget).toEqual({ maxTokensTotal: 12000 });

    expect(terminals).toHaveLength(1);
    const terminal = terminals[0];
    expect(terminal.name).toContain("CodeAtlas: claude");
    expect(terminal.sentText[0]).toEqual({ text: "/usr/local/bin/claude", addNewLine: undefined });
    expect(terminal.sentText[1].addNewLine).toBe(true);
    expect(terminal.sentText[1].text).toContain("explain the build");
    expect(terminal.shownCount).toBe(1);

    const posted = view.webview.posted as readonly Record<string, unknown>[];
    expect(posted.some((message) => message["type"] === "contextInfo")).toBe(true);
    expect(
      posted.some(
        (message) => message["type"] === "agentStatus" && message["status"] === "RUNNING",
      ),
    ).toBe(true);
  });

  it("resolves a /gemini slash command to the gemini provider", async () => {
    const { panel, view, terminals } = await resolvePanel();

    await panel.launchAgent({ task: "/gemini write a test" });

    expect(terminals[0].name).toContain("CodeAtlas: gemini");
    expect(terminals[0].sentText[0].text).toBe("/usr/local/bin/gemini");
    expect(
      view.webview.posted.some((message) => (message as { type: string }).type === "error"),
    ).toBe(false);
  });

  it("reports unknown slash commands as an error", async () => {
    const { panel, view, sessions, terminals } = await resolvePanel();

    await panel.launchAgent({ task: "/nope do a thing" });

    const errors = (view.webview.posted as readonly { type: string; message?: string }[]).filter(
      (message) => message.type === "error",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Unknown agent "/nope"');
    expect(sessions.created).toHaveLength(0);
    expect(terminals).toHaveLength(0);
  });

  it("skips context assembly when auto-inject is disabled", async () => {
    const { panel, view, integration, terminals } = await resolvePanel(() =>
      makeChatConfig({ contextAutoInject: false }),
    );

    await panel.launchAgent({ task: "just run" });

    expect(integration.built).toHaveLength(0);
    expect(terminals[0].sentText[1].text).toBe("just run");
    expect(
      (view.webview.posted as readonly Record<string, unknown>[]).some(
        (message) => message["type"] === "contextInfo",
      ),
    ).toBe(false);
  });

  it("fails cleanly when the provider CLI is not installed", async () => {
    const { panel, view, sessions, terminals, agents } = await resolvePanel();
    agents.installed.delete("codex");

    await panel.launchAgent({ task: "/codex do a thing" });

    const errors = (view.webview.posted as readonly { type: string; message?: string }[]).filter(
      (message) => message.type === "error",
    );
    expect(errors.some((error) => error.message?.includes("not installed"))).toBe(true);
    expect(sessions.created).toHaveLength(0);
    expect(terminals).toHaveLength(0);
  });

  it("accepts an explicit provider from the message envelope", async () => {
    const { panel, view, sessions, terminals } = await resolvePanel();

    await panel.launchAgent({ provider: "opencode", task: "refactor the parser" });

    expect(sessions.created[0].provider).toBe("opencode");
    expect(terminals[0].sentText[0].text).toBe("/usr/local/bin/opencode");
    expect(
      view.webview.posted.some((message) => (message as { type: string }).type === "error"),
    ).toBe(false);
  });

  it("streams terminal output and status to the webview", async () => {
    const { panel, view, terminals, sessions } = await resolvePanel();
    await panel.launchAgent({ task: "stream this" });
    const terminal = terminals[0];

    terminal.emitData("hello from the agent\n");

    const outputs = (
      view.webview.posted as readonly { type: string; sessionId: string; data?: string }[]
    ).filter((message) => message.type === "agentOutput");
    expect(
      outputs.some(
        (output) =>
          output.sessionId === sessions.listSessions()[0].id &&
          output.data === "hello from the agent\n",
      ),
    ).toBe(true);
  });

  it("stops a session by disposing its terminal", async () => {
    const { panel, view, terminals, sessions } = await resolvePanel();
    await panel.launchAgent({ task: "run forever" });
    const terminal = terminals[0];
    const sessionId = sessions.listSessions()[0].id;

    await panel.stopAgent(sessionId);

    expect(terminal.disposed).toBe(true);
    const statuses = (
      view.webview.posted as readonly { type: string; sessionId: string; status?: string }[]
    ).filter((message) => message.type === "agentStatus" && message.sessionId === sessionId);
    expect(statuses[statuses.length - 1].status).toBe("STOPPED");
  });

  it("finalizes a session as STOPPED when its terminal closes", async () => {
    const { panel, view, terminals, sessions } = await resolvePanel();
    await panel.launchAgent({ task: "will exit" });
    const terminal = terminals[0];
    const sessionId = sessions.listSessions()[0].id;

    terminal.emitClose();

    const statuses = (
      view.webview.posted as readonly { type: string; sessionId: string; status?: string }[]
    ).filter((message) => message.type === "agentStatus" && message.sessionId === sessionId);
    expect(statuses[statuses.length - 1].status).toBe("STOPPED");
  });

  it("reports the newest active session id", async () => {
    const { panel, sessions } = await resolvePanel();
    await panel.launchAgent({ task: "first" });
    const firstId = sessions.listSessions()[0].id;
    expect(panel.activeSessionId()).toBe(firstId);
  });

  it("handles messages arriving from the webview", async () => {
    const { view, sessions, terminals } = await resolvePanel();
    view.webview.emitMessage({ type: "launchAgent", task: "explain the build" });
    await flush();

    expect(sessions.created).toHaveLength(1);
    expect(terminals[0].sentText[1].text).toContain("explain the build");
  });

  it("shuts down by disposing terminals and detaching the view", async () => {
    const { panel, view, terminals } = await resolvePanel();
    await panel.launchAgent({ task: "cleanup" });
    const terminal = terminals[0];
    const postedBefore = view.webview.posted.length;

    await panel.shutdown();

    expect(terminal.disposed).toBe(true);
    terminal.emitData("after shutdown");
    expect(view.webview.posted).toHaveLength(postedBefore);
  });
});

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}
