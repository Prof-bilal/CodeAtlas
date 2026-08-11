import { randomBytes } from "node:crypto";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import type {
  AgentId,
  Session,
  SessionCreateRequest,
  SessionLaunchRequest,
  SessionOutput,
  SessionPort,
  SessionStatus,
} from "@atlas/core";
import { fail, ok, type Result } from "@atlas/shared";
import type { AgentAdapter } from "./adapter";
import { AgentService, type ExecutableResolver } from "./agent.service";
import { AgentCliNotFoundError, UnknownAgentError } from "./errors";
import { ProcessRunner, type RunningProcess } from "./process";
import {
  InvalidRepositoryPathError,
  SessionStateError,
  UnknownSessionError,
} from "./session-errors";

/** Options for constructing a {@link SessionManager}. */
export interface SessionManagerOptions {
  /** Provider adapters; defaults to the four built-ins. */
  readonly adapters?: readonly AgentAdapter[];
  /** Binary resolver; defaults to PATH scanning (`findExecutable`). */
  readonly resolveExecutable?: ExecutableResolver;
  /** Process supervisor; inject a fake for offline tests. */
  readonly processRunner?: ProcessRunner;
  /** Provider used by the connection layer when a request omits one. */
  readonly defaultProvider?: string;
  /**
   * Cap on how many already-finished sessions are retained in memory before the
   * oldest terminal entries are pruned (default 100). Live sessions are never
   * pruned.
   */
  readonly maxRetainedSessions?: number;
}

/** Non-terminal states that still own (or are acquiring) a live process. */
const ACTIVE_STATUSES: readonly SessionStatus[] = ["STARTING", "RUNNING", "STOPPING"];
const DEFAULT_MAX_RETAINED = 100;

/**
 * The in-memory Agent Session Manager.
 *
 * Implements `SessionPort` by building on the existing connection layer
 * (`AgentService`) and process layer (`ProcessRunner.launch`). It owns the
 * session lifecycle and bookkeeping only — all low-level process execution,
 * provider argument building, and CLI detection stay in the layers beneath it.
 *
 * Guarantees:
 * - **Independent sessions** — each session lives in its own entry, with its
 *   own process handle, repository, status, timestamps, exit code, and error.
 *   One session's failure never touches another's.
 * - **No double actions** — state guards and idempotent process handles prevent
 *   duplicate starts, double-termination, and duplicate cleanup under
 *   concurrency.
 * - **No stuck sessions** — `STARTING` fails to `FAILED` instead of lingering;
 *   an unresponsive process during stop is finalized to `STOPPED` with a note.
 */
export class SessionManager implements SessionPort {
  private readonly agentService: AgentService;
  private readonly runner: ProcessRunner;
  private readonly maxRetained: number;
  /** Live session records, created to terminal, keyed by session id. */
  private readonly sessions = new Map<string, Session>();
  /** Live process handles for RUNNING/STOPPING sessions. */
  private readonly handles = new Map<string, RunningProcess>();
  /** Captured output of sessions launched with `captureOutput`, kept after exit. */
  private readonly outputs = new Map<string, SessionOutput>();
  private shuttingDown = false;

  public constructor(options: SessionManagerOptions = {}) {
    this.runner = options.processRunner ?? new ProcessRunner();
    this.agentService = new AgentService({
      // Omit undefined keys so `exactOptionalPropertyTypes` is satisfied.
      ...(options.adapters !== undefined ? { adapters: options.adapters } : {}),
      ...(options.resolveExecutable !== undefined
        ? { resolveExecutable: options.resolveExecutable }
        : {}),
      processRunner: this.runner,
      ...(options.defaultProvider !== undefined
        ? { defaultProvider: options.defaultProvider }
        : {}),
    });
    this.maxRetained = options.maxRetainedSessions ?? DEFAULT_MAX_RETAINED;
  }

  // ── session lifecycle ────────────────────────────────────────────────────

  public createSession(request: SessionCreateRequest): Result<Session> {
    if (!this.agentService.hasAgent(request.provider)) {
      return fail(new UnknownAgentError(request.provider));
    }
    if (!isDirectory(request.repositoryPath)) {
      return fail(new InvalidRepositoryPathError(request.repositoryPath));
    }
    const id = this.newSessionId();
    const repositoryPath = resolve(request.repositoryPath);
    const session: Session = {
      id,
      agentId: request.provider as AgentId,
      provider: request.provider,
      repositoryPath,
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
    sessionId: string,
    launch?: SessionLaunchRequest,
  ): Promise<Result<Session>> {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      return fail(new UnknownSessionError(sessionId));
    }
    if (this.shuttingDown) {
      return fail(
        new SessionStateError(
          sessionId,
          `Session ${sessionId} cannot start: the manager is shutting down.`,
        ),
      );
    }
    if (session.status !== "CREATED") {
      return fail(
        new SessionStateError(
          sessionId,
          `Session ${sessionId} cannot be started while ${session.status}.`,
        ),
      );
    }
    this.update(sessionId, { status: "STARTING", error: undefined });

    // Resolve the CLI binary provider-aware (no process is spawned for this).
    const binary = this.agentService.resolveBinary(session.provider);
    if (!binary.ok) {
      this.failSession(sessionId, binary.error.message);
      return binary;
    }
    if (binary.value === null) {
      const notFound = new AgentCliNotFoundError(
        this.agentService.binaryOf(session.provider) ?? session.provider,
        session.provider,
      );
      this.failSession(sessionId, notFound.message);
      return fail(notFound);
    }

    const argsResult = this.agentService.buildArgsFor(session.provider, {
      prompt: launch?.prompt ?? "",
      ...(launch?.args !== undefined ? { args: launch.args } : {}),
    });
    if (!argsResult.ok) {
      this.failSession(sessionId, argsResult.error.message);
      return argsResult;
    }

    // Delegate process execution to the process layer (never spawn here).
    const outcome = await this.runner.launch({
      command: binary.value,
      args: argsResult.value,
      cwd: session.repositoryPath,
      ...(launch?.env !== undefined ? { env: launch.env } : {}),
      stdio: launch?.captureOutput === true ? "pipe" : "ignore",
    });
    if (!outcome.ok) {
      this.failSession(sessionId, outcome.error.message);
      return outcome;
    }

    const handle = outcome.value;
    // Shutdown may have begun while we were launching — never leave a child
    // running past shutdown.
    if (this.shuttingDown) {
      this.failSession(sessionId, "manager shut down before the session could start");
      await handle.terminate();
      return fail(
        new SessionStateError(
          sessionId,
          `Session ${sessionId} could not start because the manager is shutting down.`,
        ),
      );
    }

    this.update(sessionId, {
      status: "RUNNING",
      processId: handle.pid,
      startedAt: Date.now(),
    });
    this.handles.set(sessionId, handle);
    handle.onExit((code, signal) => {
      this.handleExit(sessionId, code, signal);
    });
    // Re-read the snapshot: a super-fast exit may already have transitioned it.
    return ok(this.sessions.get(sessionId) as Session);
  }

  // ── inspection ────────────────────────────────────────────────────────────

  public getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  public listSessions(): readonly Session[] {
    return [...this.sessions.values()];
  }

  public getActiveSessions(): readonly Session[] {
    return this.listSessions().filter((session) => ACTIVE_STATUSES.includes(session.status));
  }

  public getSessionOutput(sessionId: string): SessionOutput | undefined {
    const captured = this.outputs.get(sessionId);
    if (captured !== undefined) {
      return captured;
    }
    // A live handle may still be running; expose its captured output so far.
    const handle = this.handles.get(sessionId);
    return handle?.readOutput();
  }

  // ── stopping / termination ────────────────────────────────────────────────

  public async stopSession(sessionId: string): Promise<Result<Session>> {
    return this.stopLike(sessionId, false);
  }

  public async terminateSession(sessionId: string): Promise<Result<Session>> {
    return this.stopLike(sessionId, true);
  }

  /** `force=false` is a graceful stop (SIGTERM → SIGKILL); `force=true` is SIGKILL. */
  private async stopLike(sessionId: string, force: boolean): Promise<Result<Session>> {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      return fail(new UnknownSessionError(sessionId));
    }
    if (session.status === "STOPPED" || session.status === "FAILED") {
      return fail(
        new SessionStateError(sessionId, `Session ${sessionId} is already ${session.status}.`),
      );
    }
    if (session.status === "STARTING") {
      // No process handle exists yet; fail clearly instead of leaving a stuck
      // session or racing the in-flight launch.
      return fail(
        new SessionStateError(
          sessionId,
          `Session ${sessionId} is still starting; try again in a moment.`,
        ),
      );
    }
    if (session.status === "STOPPING") {
      // A stop/terminate is already in flight — idempotent; report the current state.
      return ok(this.sessions.get(sessionId) as Session);
    }

    const handle = this.handles.get(sessionId);
    if (handle === undefined) {
      return fail(
        new SessionStateError(sessionId, `Session ${sessionId} has no running process to stop.`),
      );
    }

    this.update(sessionId, { status: "STOPPING" });
    if (force) {
      await handle.terminate();
    } else {
      await handle.stop();
    }

    const after = this.sessions.get(sessionId) as Session;
    if (after.status !== "STOPPING") {
      // The process exit listener already transitioned the session.
      return ok(after);
    }
    // The process refused to exit within the kill grace period. Finalize so no
    // session is left stuck in STOPPING; the OS now owns the (best-effort-killed)
    // child, and CodeAtlas is not leaking an uncontrolled progression.
    const finalized = this.update(sessionId, {
      status: "STOPPED",
      endedAt: Date.now(),
      error: force
        ? "process did not terminate after SIGKILL"
        : "process did not exit after a stop was requested",
    });
    this.captureOutput(sessionId, handle);
    this.handles.delete(sessionId);
    this.prune();
    return ok(finalized);
  }

  // ── shutdown / orphan protection ─────────────────────────────────────────

  public async shutdown(): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    this.shuttingDown = true;
    for (const session of this.getActiveSessions()) {
      await this.stopSession(session.id);
    }
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /** React to the child process closing: update status/timestamps/exit code. */
  private handleExit(sessionId: string, code: number | null, signal: NodeJS.Signals | null): void {
    const handle = this.handles.get(sessionId);
    if (handle !== undefined) {
      this.captureOutput(sessionId, handle);
    }
    this.handles.delete(sessionId);
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      return;
    }
    // Already finalized (e.g. an unresponsive process was finalized to STOPPED);
    // a tardy close must not flip a terminal session to FAILED.
    if (session.status === "STOPPED" || session.status === "FAILED") {
      return;
    }

    let status: SessionStatus;
    let error: string | undefined;
    if (session.status === "STOPPING") {
      // We initiated the stop — the exit is the expected outcome.
      status = "STOPPED";
      error = undefined;
    } else if (code === 0) {
      status = "STOPPED";
      error = undefined;
    } else if (code !== null) {
      status = "FAILED";
      error = `process exited with code ${code}`;
    } else if (signal !== null) {
      status = "FAILED";
      error = `process was terminated by signal ${signal}`;
    } else {
      status = "FAILED";
      error = "process failed to start or exited unexpectedly";
    }

    this.update(sessionId, {
      status,
      endedAt: Date.now(),
      exitCode: code,
      ...(error !== undefined ? { error } : {}),
    });
    this.prune();
  }

  /** `STARTING → FAILED` on any pre/post-launch failure, with a safe message. */
  private failSession(sessionId: string, message: string): void {
    this.handles.delete(sessionId);
    this.update(sessionId, {
      status: "FAILED",
      endedAt: Date.now(),
      error: message,
    });
    this.prune();
  }

  /** Keep a handle's captured output (when any) so it stays readable after exit. */
  private captureOutput(sessionId: string, handle: RunningProcess): void {
    const output = handle.readOutput();
    if (output !== undefined) {
      this.outputs.set(sessionId, output);
    }
  }

  /** Replace a session snapshot (immutable-ish update pattern). */
  private update(sessionId: string, patch: Partial<Session>): Session {
    const current = this.sessions.get(sessionId);
    if (current === undefined) {
      throw new Error(`Unexpected missing session: ${sessionId}`);
    }
    const next: Session = { ...current, ...patch };
    this.sessions.set(sessionId, next);
    return next;
  }

  /** Drop the oldest terminal sessions once the retention cap is exceeded. */
  private prune(): void {
    if (this.sessions.size <= this.maxRetained) {
      return;
    }
    const terminalIds: string[] = [];
    for (const [id, session] of this.sessions) {
      if (session.status === "STOPPED" || session.status === "FAILED") {
        terminalIds.push(id);
      }
    }
    for (const id of terminalIds) {
      if (this.sessions.size <= this.maxRetained) {
        break;
      }
      this.sessions.delete(id);
      this.outputs.delete(id);
    }
  }

  /** A unique, short, CLI-safe session id (8 hex chars), never the OS pid. */
  private newSessionId(): string {
    for (;;) {
      const id = randomBytes(4).toString("hex");
      if (!this.sessions.has(id)) {
        return id;
      }
    }
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
