import { AgentCliNotFoundError, ProcessSpawnError } from "@atlas/agents";
import type {
  RoleDefinition,
  RoleResult,
  RoleStatus,
  RunStatus,
  Session,
  SessionPort,
  SessionStatus,
  TaskPlan,
} from "@atlas/core";
import type { ContextIntegration } from "../context-integration/index";
import { renderContextPackage } from "../context-integration/index";
import type { ContextPackage } from "../context-integration/models";

/** Options for {@link executePlan}. */
export interface ExecuteOptions {
  readonly sessions: SessionPort;
  readonly integration: ContextIntegration;
  readonly plan: TaskPlan;
  /** Applied to roles that omit their own `timeoutMs`; `undefined` = no timeout. */
  readonly defaultTimeoutMs?: number;
  /** Applied to roles that omit their own `maxRetries`. */
  readonly defaultMaxRetries?: number;
  /** How often the executor polls a session for its terminal state. */
  readonly pollIntervalMs?: number;
  /** True once the run should stop (user cancel / abort on another role's failure). */
  readonly isCancelled?: () => boolean;
  /**
   * Fired with the results collected so far whenever a role completes (and once
   * at the end). Lets the caller expose a live combined status view.
   */
  readonly onProgress?: (results: readonly RoleResult[]) => void;
}

/** The outcome of executing a plan: the run status plus per-role results. */
export interface ExecuteOutcome {
  readonly status: RunStatus;
  readonly results: readonly RoleResult[];
}

const DEFAULT_POLL_INTERVAL_MS = 20;
const DEFAULT_MAX_RETRIES = 0;

/**
 * The Executor: drives `SessionPort` (never spawning directly) to run each role
 * of a plan, in parallel or sequentially, applying per-role timeouts, bounded
 * retries for retryable launch failures, cancellation (including "one failure
 * stops the remaining roles"), and honest partial-output reporting. It never
 * reimplements process management — everything goes through `SessionPort`.
 */
export async function executePlan(options: ExecuteOptions): Promise<ExecuteOutcome> {
  const { sessions, integration, plan, defaultTimeoutMs, defaultMaxRetries } = options;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const isCancelled = options.isCancelled ?? (() => false);

  /** Set when any role fails/times out — remaining roles are then cancelled. */
  const abort = { aborted: false };
  /** Every session this run started, so cleanup never leaves orphans. */
  const sessionIds: string[] = [];

  const runOne = (role: RoleDefinition, priorFindings: string): Promise<RoleResult> =>
    runRole({
      role,
      priorFindings,
      sessions,
      integration,
      plan,
      defaultTimeoutMs,
      defaultMaxRetries,
      pollIntervalMs,
      isCancelled,
      abort,
      sessionIds,
    });

  try {
    if (plan.roles.length === 0) {
      return { status: "failed", results: [] };
    }
    if (plan.mode === "sequential") {
      return await executeSequential(plan, runOne, isCancelled, abort, options);
    }
    const outcomes = await Promise.all(plan.roles.map((role) => runOne(role, "")));
    options.onProgress?.(outcomes);
    return { status: runStatusOf(outcomes, isCancelled()), results: outcomes };
  } catch (error) {
    const results = plan.roles.map((role) => failedOutcome(role, safeMessage(error)));
    options.onProgress?.(results);
    return { status: "failed", results };
  } finally {
    // Never leave orphan children behind, whatever the outcome.
    for (const sessionId of sessionIds) {
      await terminateIfActive(sessions, sessionId);
    }
  }
}

/** Sequential mode: roles run in order; later roles consume earlier results. */
async function executeSequential(
  plan: TaskPlan,
  runOne: (role: RoleDefinition, priorFindings: string) => Promise<RoleResult>,
  isCancelled: () => boolean,
  abort: { aborted: boolean },
  options: ExecuteOptions,
): Promise<ExecuteOutcome> {
  const results: RoleResult[] = [];
  const findings: string[] = [];

  for (const role of plan.roles) {
    if (isCancelled() || abort.aborted) {
      results.push(cancelledOutcome(role));
      continue;
    }
    const outcome = await runOne(role, findings.join("\n\n"));
    results.push(outcome);
    options.onProgress?.([...results]);
    const finding = findingOf(outcome);
    if (finding !== null) {
      findings.push(finding);
    }
    // A failed/timed-out role cancels the remaining roles (they would build on
    // unreliable input).
    if (outcome.status === "failed" || outcome.status === "timed-out") {
      for (const rest of plan.roles.slice(results.length)) {
        results.push(cancelledOutcome(rest));
      }
      options.onProgress?.([...results]);
      break;
    }
  }
  return { status: runStatusOf(results, isCancelled()), results };
}

/**
 * Run one role. A failed/timed-out role signals the shared abort so that
 * concurrent sibling roles cancel themselves promptly (one failure stops the
 * run) instead of only being marked after `Promise.all` resolves.
 */
async function runRole(options: {
  role: RoleDefinition;
  priorFindings: string;
  sessions: SessionPort;
  integration: ContextIntegration;
  plan: TaskPlan;
  defaultTimeoutMs: number | undefined;
  defaultMaxRetries: number | undefined;
  pollIntervalMs: number;
  isCancelled: () => boolean;
  abort: { aborted: boolean };
  sessionIds: string[];
}): Promise<RoleResult> {
  const outcome = await runRoleUnwrapped(options);
  if (outcome.status === "failed" || outcome.status === "timed-out") {
    options.abort.aborted = true;
  }
  return outcome;
}

/** Run one role: assemble context, launch a session, watch until terminal. */
async function runRoleUnwrapped(options: {
  role: RoleDefinition;
  priorFindings: string;
  sessions: SessionPort;
  integration: ContextIntegration;
  plan: TaskPlan;
  defaultTimeoutMs: number | undefined;
  defaultMaxRetries: number | undefined;
  pollIntervalMs: number;
  isCancelled: () => boolean;
  abort: { aborted: boolean };
  sessionIds: string[];
}): Promise<RoleResult> {
  const { role, priorFindings, sessions, integration, plan, isCancelled, abort, sessionIds } =
    options;
  const maxRetries = role.maxRetries ?? options.defaultMaxRetries ?? DEFAULT_MAX_RETRIES;
  let retries = 0;

  for (;;) {
    if (isCancelled() || abort.aborted) {
      return cancelledOutcome(role);
    }

    // 1. The role's input is a sub-task plus its Context Package (Task 16).
    const pkg = await buildRolePackage(integration, plan, role);

    // 2. Render the prompt: the context package plus any prior findings.
    const prompt = renderPrompt(pkg, priorFindings, role);

    // 3. Create + start the session through SessionPort (never spawn here).
    const created = sessions.createSession({
      provider: role.provider,
      repositoryPath: plan.repositoryPath,
    });
    if (!created.ok) {
      if (isRetryable(created.error) && retries < maxRetries) {
        retries += 1;
        await sleep(options.pollIntervalMs);
        continue;
      }
      return failedOutcome(role, created.error.message, retries);
    }
    const sessionId = created.value.id;
    const started = await sessions.startSession(sessionId, { prompt, captureOutput: true });
    if (!started.ok) {
      if (isRetryable(started.error) && retries < maxRetries) {
        retries += 1;
        await sleep(options.pollIntervalMs);
        continue;
      }
      return failedOutcome(role, started.error.message, retries);
    }
    sessionIds.push(sessionId);
    const startedAt = started.value.startedAt;

    // 4. Watch until terminal, a timeout, or cancellation.
    const timeoutMs = role.timeoutMs ?? options.defaultTimeoutMs;
    const deadline = timeoutMs === undefined ? undefined : Date.now() + timeoutMs;

    for (;;) {
      if (isCancelled() || abort.aborted) {
        await terminateQuietly(sessions, sessionId);
        return cancelledOutcome(
          role,
          sessionId,
          retries,
          startedAt,
          readOutput(sessions, sessionId),
        );
      }
      if (deadline !== undefined && Date.now() >= deadline) {
        await terminateQuietly(sessions, sessionId);
        return timedOutOutcome(
          role,
          sessionId,
          retries,
          startedAt,
          readOutput(sessions, sessionId),
        );
      }
      const snapshot = sessions.getSession(sessionId);
      if (snapshot !== undefined && isTerminal(snapshot.status)) {
        return terminalOutcome(role, snapshot, retries, startedAt, readOutput(sessions, sessionId));
      }
      await sleep(options.pollIntervalMs);
    }
  }
}

/** Assemble the role's Context Package, applying an isolated scope when set. */
async function buildRolePackage(
  integration: ContextIntegration,
  _plan: TaskPlan,
  role: RoleDefinition,
): Promise<ContextPackage> {
  return integration.buildPackage({
    task: role.task,
    ...(role.contextScope.type === "isolated" ? { scopePaths: role.contextScope.paths } : {}),
  });
}

/** Render the launch prompt: context package plus prior findings (sequential). */
function renderPrompt(pkg: ContextPackage, priorFindings: string, role: RoleDefinition): string {
  const base = renderContextPackage(pkg);
  if (priorFindings.trim() === "") {
    return base;
  }
  return (
    `${base}\n\n# Findings from earlier roles (${role.name})\n` +
    `Build on these results; do not repeat or silently contradict them.\n\n${priorFindings}`
  );
}

/** Map a terminal session snapshot to a role result. */
function terminalOutcome(
  role: RoleDefinition,
  snapshot: Session,
  retries: number,
  startedAt: number | undefined,
  output: { stdout: string; stderr: string } | undefined,
): RoleResult {
  const status: RoleStatus =
    snapshot.status === "STOPPED" && snapshot.exitCode === 0
      ? "succeeded"
      : snapshot.status === "STOPPED"
        ? "stopped"
        : "failed";
  return {
    role,
    sessionId: snapshot.id,
    status,
    exitCode: snapshot.exitCode,
    error: snapshot.error,
    stdout: output?.stdout ?? "",
    stderr: output?.stderr ?? "",
    timedOut: false,
    retries,
    startedAt,
    endedAt: snapshot.endedAt,
  };
}

function failedOutcome(role: RoleDefinition, message: string, retries = 0): RoleResult {
  return {
    role,
    sessionId: undefined,
    status: "failed",
    exitCode: undefined,
    error: message,
    stdout: "",
    stderr: "",
    timedOut: false,
    retries,
    startedAt: undefined,
    endedAt: Date.now(),
  };
}

function cancelledOutcome(
  role: RoleDefinition,
  sessionId?: string,
  retries = 0,
  startedAt?: number,
  output?: { stdout: string; stderr: string },
): RoleResult {
  return {
    role,
    sessionId,
    status: "cancelled",
    exitCode: undefined,
    error: undefined,
    stdout: output?.stdout ?? "",
    stderr: output?.stderr ?? "",
    timedOut: false,
    retries,
    startedAt,
    endedAt: Date.now(),
  };
}

function timedOutOutcome(
  role: RoleDefinition,
  sessionId: string,
  retries: number,
  startedAt: number | undefined,
  output: { stdout: string; stderr: string } | undefined,
): RoleResult {
  return {
    role,
    sessionId,
    status: "timed-out",
    exitCode: undefined,
    error: "Role exceeded its timeout; reporting the partial output collected so far.",
    stdout: output?.stdout ?? "",
    stderr: output?.stderr ?? "",
    timedOut: true,
    retries,
    startedAt,
    endedAt: Date.now(),
  };
}

/** Only retryable launch failures (CLI missing, spawn error) may be retried. */
function isRetryable(error: unknown): boolean {
  return error instanceof AgentCliNotFoundError || error instanceof ProcessSpawnError;
}

/** The run status: succeeded iff every started role succeeded. */
function runStatusOf(results: readonly RoleResult[], cancelled: boolean): RunStatus {
  const started = results.filter((result) => result.status !== "cancelled");
  if (started.length === 0) {
    return cancelled ? "cancelled" : "failed";
  }
  if (started.every((result) => result.status === "succeeded")) {
    return "succeeded";
  }
  return cancelled ? "cancelled" : "failed";
}

/** Attributed finding text a later sequential role can consume. */
function findingOf(result: RoleResult): string | null {
  const text = result.stdout.trim();
  if (text === "") {
    return null;
  }
  return `## ${result.role.name} (${result.role.provider}) — ${result.status}\n${text}`;
}

function readOutput(
  sessions: SessionPort,
  sessionId: string,
): { stdout: string; stderr: string } | undefined {
  return sessions.getSessionOutput(sessionId);
}

async function terminateQuietly(sessions: SessionPort, sessionId: string): Promise<void> {
  await sessions.terminateSession(sessionId);
}

async function terminateIfActive(sessions: SessionPort, sessionId: string): Promise<void> {
  const snapshot = sessions.getSession(sessionId);
  if (snapshot !== undefined && isActive(snapshot.status)) {
    await terminateQuietly(sessions, sessionId);
  }
}

function isTerminal(status: SessionStatus): boolean {
  return status === "STOPPED" || status === "FAILED";
}

function isActive(status: SessionStatus): boolean {
  return status === "STARTING" || status === "RUNNING" || status === "STOPPING";
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
