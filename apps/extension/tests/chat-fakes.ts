import type {
  AgentId,
  AgentInfo,
  AgentPort,
  AgentRunRequest,
  AgentRunResult,
  BuildPackageInput,
  ContextIntegration,
  ContextPackage,
  ContextPackageItem,
  Session,
  SessionCreateRequest,
  SessionLaunchRequest,
  SessionOutput,
  SessionPort,
} from "@atlas/sdk";
import { type Result, fail, ok } from "@atlas/shared";

/** A fake `SessionPort` that records creations/stops without spawning anything. */
export class FakeSessionPort implements SessionPort {
  public readonly created: SessionCreateRequest[] = [];
  public readonly stopped: string[] = [];
  private readonly sessions = new Map<string, Session>();
  private nextId = 0;

  public createSession(request: SessionCreateRequest): Result<Session> {
    this.created.push(request);
    const id = `s${String(++this.nextId).padStart(4, "0")}`;
    const session: Session = {
      id,
      agentId: request.provider as AgentId,
      provider: request.provider,
      repositoryPath: request.repositoryPath,
      status: "CREATED",
      processId: undefined,
      startedAt: undefined,
      endedAt: undefined,
      exitCode: undefined,
      error: undefined,
    };
    this.sessions.set(id, session);
    return ok(session);
  }

  public async startSession(
    _sessionId: string,
    _launch?: SessionLaunchRequest,
  ): Promise<Result<Session>> {
    return fail(new Error("startSession is not used by the chat panel"));
  }

  public getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  public listSessions(): readonly Session[] {
    return [...this.sessions.values()];
  }

  public getActiveSessions(): readonly Session[] {
    return this.listSessions().filter((session) =>
      ["STARTING", "RUNNING", "STOPPING"].includes(session.status),
    );
  }

  public getSessionOutput(_sessionId: string): SessionOutput | undefined {
    return undefined;
  }

  public async stopSession(sessionId: string): Promise<Result<Session>> {
    this.stopped.push(sessionId);
    return ok(this.sessions.get(sessionId) as Session);
  }

  public async terminateSession(sessionId: string): Promise<Result<Session>> {
    this.stopped.push(sessionId);
    return ok(this.sessions.get(sessionId) as Session);
  }

  public async shutdown(): Promise<void> {}
}

/** A fake `ContextIntegration` that records builds and returns a canned package. */
export class FakeContextIntegration implements ContextIntegration {
  public readonly built: BuildPackageInput[] = [];
  /** Override per task; defaults to {@link makeContextPackage}. */
  public readonly packages = new Map<string, ContextPackage>();

  public async buildPackage(input: BuildPackageInput): Promise<ContextPackage> {
    this.built.push(input);
    return this.packages.get(input.task) ?? makeContextPackage(input.task);
  }

  public async explain(): Promise<never> {
    throw new Error("explain is not used by the chat panel");
  }

  public async launch(): Promise<Result<never>> {
    return fail(new Error("launch is not used by the chat panel"));
  }

  public async attach(): Promise<Result<never>> {
    return fail(new Error("attach is not used by the chat panel"));
  }
}

/** A fake `AgentPort` with a configurable set of installed CLIs. */
export class FakeAgentPort implements AgentPort {
  public readonly defaultProvider = "claude";
  public readonly installed = new Set<string>(["claude", "gemini", "codex", "opencode"]);

  public listAgents(): readonly string[] {
    return ["claude", "gemini", "codex", "opencode"];
  }

  public async detectAgent(provider: string): Promise<Result<AgentInfo>> {
    if (!this.installed.has(provider)) {
      return ok({ provider, binary: provider, available: false });
    }
    return ok({ provider, binary: provider, available: true, path: `/usr/local/bin/${provider}` });
  }

  public async detectAll(): Promise<Result<readonly AgentInfo[]>> {
    return ok(
      this.listAgents().map((provider) => ({
        provider,
        binary: provider,
        available: this.installed.has(provider),
        ...(this.installed.has(provider) ? { path: `/usr/local/bin/${provider}` } : {}),
      })),
    );
  }

  public async run(_request: AgentRunRequest): Promise<Result<AgentRunResult>> {
    return fail(new Error("run is not used by the chat panel"));
  }
}

/** A minimal, deterministic context package for a task. */
export function makeContextPackage(task: string): ContextPackage {
  const item: ContextPackageItem = {
    id: `file:/src/${task}.ts`,
    kind: "file",
    title: `/src/${task}.ts`,
    path: `/src/${task}.ts`,
    content: `export function ${task}() { return true; }`,
    score: 50,
    source: "search",
    reason: `Ranked search hit for "${task}".`,
    truncated: false,
    tokens: 8,
  };
  return {
    task,
    items: [item],
    staleness: {
      state: "fresh",
      available: true,
      lastUpdated: "2026-08-10T00:00:00.000Z",
      changed: [],
      added: [],
      deleted: [],
    },
    budget: {
      budget: { maxItems: 20, maxTokensPerItem: 2000, maxTokensTotal: 12000 },
      itemsRequested: 1,
      itemsIncluded: 1,
      tokensEstimated: 8,
      itemsDroppedByCount: [],
      itemsTruncated: [],
      droppedByTokens: [],
      budgetExceeded: false,
    },
    exclusions: { droppedPaths: [], droppedPatterns: [] },
  };
}
