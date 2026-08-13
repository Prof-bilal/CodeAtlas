import {
  type AgentPort,
  type ContextIntegration,
  type Session,
  type SessionPort,
  type SessionStatus,
  buildInteractiveArgs,
  renderContextPackage,
} from "@atlas/sdk";
import type {
  VscodeApi,
  VscodeDisposable,
  VscodeTerminal,
  VscodeWebviewView,
  VscodeWebviewViewProvider,
} from "../vscode-host";
import type { ChatConfig } from "./config";
import {
  type ChatAgentInfo,
  type ChatHostMessage,
  type ChatSessionView,
  isChatWebviewMessage,
} from "./messages";
import { parseLaunchInput } from "./slash";
import { buildChatWebviewHtml, newChatWebviewNonce } from "./webview";

/** Everything the Agent Chat panel needs; injectable for headless tests. */
export interface AgentChatDeps {
  readonly host: VscodeApi;
  /** The SDK session manager (`createSessionManager`) — sessions are created/tracked here. */
  readonly sessions: SessionPort;
  /** The SDK context integration (`createContextIntegration`) — packages assembled here. */
  readonly integration: ContextIntegration;
  /** The SDK agent connection layer (`createAgentService`) — CLI detection only. */
  readonly agents: AgentPort;
  /** The repository the panel launches agents in. */
  readonly repositoryPath: string;
  /** Read the live `codeatlas.*` configuration (default agent, budget, auto-inject). */
  readonly readConfig: () => ChatConfig;
  /** Delay before the context prompt is typed into the terminal (tests use 0). */
  readonly promptDelayMs?: number;
}

/**
 * The VS Code Agent Chat webview view. Implements `VscodeWebviewViewProvider`:
 * renders the split-layout chat panel, parses slash commands in the extension
 * host, assembles context through the Context Integration, launches agents in
 * a real integrated terminal, and pipes terminal output back to the webview.
 *
 * The panel never reaches for the context database, the filesystem, or any
 * `@atlas/*` package — every read goes through the injected SDK services.
 */
export class AgentChatPanel implements VscodeWebviewViewProvider {
  private view: VscodeWebviewView | null = null;
  private messageDisposable: VscodeDisposable | null = null;
  private disposeDisposable: VscodeDisposable | null = null;
  /** UI-facing session views, keyed by session id (created via `SessionPort`). */
  private readonly sessionViews = new Map<string, ChatSessionView>();
  /** Live terminals, keyed by session id (the interactive process surface). */
  private readonly terminals = new Map<string, VscodeTerminal>();

  public constructor(private readonly deps: AgentChatDeps) {}

  // ── provider lifecycle ───────────────────────────────────────────────────

  public async resolveWebviewView(webviewView: VscodeWebviewView): Promise<void> {
    this.view = webviewView;
    this.messageDisposable = webviewView.webview.onDidReceiveMessage((message) => {
      void this.handleMessage(message);
    });
    this.disposeDisposable = webviewView.onDidDispose(() => {
      this.view = null;
      this.messageDisposable?.dispose();
      this.disposeDisposable?.dispose();
      this.messageDisposable = null;
      this.disposeDisposable = null;
    });
    // Set html AFTER listeners so the webview's initial postMessage calls
    // (listAgents / listSessions) are already captured when they fire.
    webviewView.webview.html = buildChatWebviewHtml({
      cspSource: webviewView.webview.cspSource,
      nonce: newChatWebviewNonce(),
    });
    await this.refreshAgents();
    await this.refreshSessions();
    this.post({ type: "config", ...this.deps.readConfig() });
  }

  /** Release the panel: dispose terminals and unsubscribe from the webview. */
  public async shutdown(): Promise<void> {
    for (const terminal of this.terminals.values()) {
      terminal.dispose();
    }
    this.terminals.clear();
    this.sessionViews.clear();
    this.messageDisposable?.dispose();
    this.disposeDisposable?.dispose();
    this.messageDisposable = null;
    this.disposeDisposable = null;
    this.view = null;
  }

  public dispose(): void {
    void this.shutdown();
  }

  // ── webview → host message handling ───────────────────────────────────────

  private async handleMessage(message: unknown): Promise<void> {
    if (!isChatWebviewMessage(message)) {
      return;
    }
    switch (message.type) {
      case "launchAgent":
        await this.launchAgent({
          task: message.task,
          ...(message.provider === undefined ? {} : { provider: message.provider }),
        });
        return;
      case "stopAgent":
        await this.stopAgent(message.sessionId);
        return;
      case "listAgents":
        await this.refreshAgents();
        return;
      case "listSessions":
        await this.refreshSessions();
        return;
    }
  }

  // ── launch / stop ─────────────────────────────────────────────────────────

  /** Resolve the input (slash parsing in the host) and launch interactively. */
  public async launchAgent(input: {
    readonly provider?: string;
    readonly task: string;
  }): Promise<void> {
    const selection = parseLaunchInput(input.task, input.provider);
    switch (selection.kind) {
      case "empty":
        return;
      case "unknown":
        this.post({ type: "error", message: selection.message });
        return;
      case "auto":
        await this.launchInteractive({
          provider: this.deps.readConfig().defaultAgent,
          task: selection.task,
        });
        return;
      case "default":
        await this.launchInteractive({
          provider: this.deps.readConfig().defaultAgent,
          task: selection.task,
        });
        return;
      case "launch":
        await this.launchInteractive({ provider: selection.provider, task: selection.task });
        return;
    }
  }

  /** Stop a running session: dispose its terminal (the process surface). */
  public async stopAgent(sessionId: string): Promise<void> {
    const session = this.sessionViews.get(sessionId);
    if (session === undefined) {
      this.post({ type: "error", message: `Unknown session: ${sessionId}` });
      return;
    }
    const terminal = this.terminals.get(sessionId);
    if (terminal !== undefined) {
      terminal.dispose();
      this.terminals.delete(sessionId);
    }
    this.finalizeSession(sessionId, "STOPPED");
    await this.refreshSessions();
  }

  /** The id of the most recently started active session, if any. */
  public activeSessionId(): string | undefined {
    const active = [...this.sessionViews.values()]
      .filter((session) => session.status === "RUNNING" || session.status === "STARTING")
      .sort((left, right) => (right.startedAt ?? 0) - (left.startedAt ?? 0));
    return active[0]?.id;
  }

  // ── the launch flow ───────────────────────────────────────────────────────

  private async launchInteractive(input: {
    readonly provider: string;
    readonly task: string;
  }): Promise<void> {
    const { provider, task } = input;
    const config = this.deps.readConfig();

    // 1. Assemble + render the context package (when auto-inject is enabled).
    let prompt = task;
    let contextSummary: {
      items: number;
      tokens: number;
      staleness: string;
      dropped: number;
    } | null = null;
    if (config.contextAutoInject) {
      try {
        const pkg = await this.deps.integration.buildPackage({
          task,
          budget: { maxTokensTotal: config.contextBudget },
        });
        prompt = renderContextPackage(pkg);
        contextSummary = {
          items: pkg.budget.itemsIncluded,
          tokens: pkg.budget.tokensEstimated,
          staleness: pkg.staleness.state,
          dropped: pkg.exclusions.droppedPaths.length,
        };
      } catch (error) {
        this.post({ type: "error", message: `Context assembly failed: ${safeMessage(error)}` });
        return;
      }
    }

    // 2. Detect the installed CLI (provider-specific facts stay in the adapters).
    const detected = await this.deps.agents.detectAgent(provider);
    if (!detected.ok) {
      this.post({ type: "error", message: detected.error.message });
      return;
    }
    if (!detected.value.available) {
      this.post({
        type: "error",
        message: `${provider} is not installed. Install it and try again (e.g. \`npm install -g ${detected.value.binary}\`).`,
      });
      return;
    }
    const interactiveArgs = buildInteractiveArgs(provider);
    if (!interactiveArgs.ok) {
      this.post({ type: "error", message: interactiveArgs.error.message });
      return;
    }

    // 3. Create a session through the session manager (tracked, validated).
    const created = this.deps.sessions.createSession({
      provider,
      repositoryPath: this.deps.repositoryPath,
    });
    if (!created.ok) {
      this.post({ type: "error", message: created.error.message });
      return;
    }
    const session = created.value;
    this.sessionViews.set(session.id, toSessionView(session));
    await this.refreshSessions();

    // 4. Report context + launch status to the webview.
    if (contextSummary !== null) {
      this.post({ type: "contextInfo", sessionId: session.id, ...contextSummary });
    }
    this.post({
      type: "agentOutput",
      sessionId: session.id,
      stream: "stdout",
      data: `> Launching ${provider}…\n`,
    });

    // 5. Create the integrated terminal and pipe its output back to the webview.
    const terminal = this.deps.host.terminals.createTerminal({
      name: `CodeAtlas: ${provider} (${session.id})`,
      cwd: this.deps.repositoryPath,
    });
    this.terminals.set(session.id, terminal);
    terminal.onDidWriteData((data) => {
      this.post({ type: "agentOutput", sessionId: session.id, stream: "stdout", data });
    });
    terminal.onDidClose(() => {
      this.terminals.delete(session.id);
      this.finalizeSession(session.id, "STOPPED");
      void this.refreshSessions();
    });

    // 6. Launch the CLI interactively (no `-p`), then inject the prompt.
    const binary = detected.value.path ?? detected.value.binary;
    terminal.sendText(buildTerminalCommand(binary, interactiveArgs.value));
    terminal.show();
    this.updateSession(session.id, { status: "RUNNING", startedAt: Date.now() });
    this.post({ type: "agentStatus", sessionId: session.id, status: "RUNNING", provider });
    await this.refreshSessions();

    await delay(this.deps.promptDelayMs ?? DEFAULT_PROMPT_DELAY_MS);
    terminal.sendText(prompt, true);
  }

  // ── refresh ───────────────────────────────────────────────────────────────

  /** Re-detect the installed AI CLIs and push the sidebar list. */
  public async refreshAgents(): Promise<void> {
    const detected = await this.deps.agents.detectAll();
    if (!detected.ok) {
      this.post({ type: "error", message: detected.error.message });
      return;
    }
    const defaultAgent = this.deps.readConfig().defaultAgent;
    const agents: ChatAgentInfo[] = detected.value.map((agent) => ({
      provider: agent.provider,
      binary: agent.binary,
      available: agent.available,
      isDefault: agent.provider === defaultAgent,
      ...(agent.version !== undefined ? { version: agent.version } : {}),
    }));
    this.post({ type: "agentsList", agents });
  }

  /** Push the tracked session list to the sidebar. */
  public async refreshSessions(): Promise<void> {
    this.post({ type: "sessionsList", sessions: [...this.sessionViews.values()] });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private updateSession(sessionId: string, patch: Partial<ChatSessionView>): void {
    const current = this.sessionViews.get(sessionId);
    if (current === undefined) {
      return;
    }
    const next = { ...current, ...patch };
    this.sessionViews.set(sessionId, next);
    this.post({ type: "agentStatus", sessionId, status: next.status, provider: next.provider });
  }

  private finalizeSession(sessionId: string, status: SessionStatus): void {
    const current = this.sessionViews.get(sessionId);
    if (current === undefined) {
      return;
    }
    const next: ChatSessionView = { ...current, status, endedAt: Date.now() };
    this.sessionViews.set(sessionId, next);
    this.post({ type: "agentStatus", sessionId, status, provider: next.provider });
  }

  private post(message: ChatHostMessage): void {
    void this.view?.webview.postMessage(message);
  }
}

/** Map a session-manager `Session` to the serializable webview view. */
function toSessionView(session: Session): ChatSessionView {
  return {
    id: session.id,
    provider: session.provider,
    repositoryPath: session.repositoryPath,
    status: session.status,
    ...(session.processId !== undefined ? { processId: session.processId } : {}),
    ...(session.startedAt !== undefined ? { startedAt: session.startedAt } : {}),
    ...(session.endedAt !== undefined ? { endedAt: session.endedAt } : {}),
    ...(session.exitCode !== undefined && session.exitCode !== null
      ? { exitCode: session.exitCode }
      : {}),
    ...(session.error !== undefined ? { error: session.error } : {}),
  };
}

/** Build the shell command that launches an interactive CLI (trusted values only). */
function buildTerminalCommand(binary: string, args: readonly string[]): string {
  return [quote(binary), ...args.map(quote)].join(" ");
}

/** Quote a trusted token for the terminal's shell (binary paths can contain spaces). */
function quote(value: string): string {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_PROMPT_DELAY_MS = 500;
