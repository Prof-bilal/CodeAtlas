import {
  type AssembleOptions,
  type ContextIntegration,
  type ContextPackage,
  type Session,
  createContextIntegration,
  createContextSDK,
  createSessionManager,
  renderContextBriefing,
  renderContextExplanation,
  renderContextPackage,
} from "@atlas/sdk";
import type { Command } from "commander";
import { openMetrics } from "./metrics";
import { contextDbPath, resolveProjectRoot } from "./search";
import { openUsage } from "./usage";

export interface ContextCommandOptions {
  readonly integration?: ContextIntegration;
}
interface CommonOptions {
  readonly json?: boolean;
  readonly maxTokensTotal?: number;
  readonly includeInstructions?: boolean;
  readonly includeOverview?: boolean;
  readonly ai?: boolean;
}
interface ContextOptions extends CommonOptions {
  readonly explain?: boolean;
  readonly repo?: string;
}
interface LaunchOptions extends CommonOptions {
  readonly provider: string;
  readonly repo?: string;
}

/** Options for the standalone `atlas <agent> <prompt...>` launch commands. */
interface AgentLaunchOptions extends CommonOptions {
  readonly repo?: string;
}

/**
 * The agents with a defined launch adapter (`packages/agents/src/adapters.ts`).
 * Each gets a standalone `atlas <agent> <prompt...>` command that is a thin
 * wrapper around the same context → session launch path as
 * `atlas context launch <task> --provider <agent>`.
 */
const AGENT_LAUNCH_TARGETS: readonly string[] = ["claude", "gemini", "codex", "opencode"];

/** The `atlas context <task> --ai` build output when the AI briefing could not be generated: the deterministic package plus the failure message. */
interface ContextAIOutcome {
  readonly package: ContextPackage;
  readonly aiMessage: string;
}

export function registerContext(program: Command, options: ContextCommandOptions = {}): void {
  const context = program
    .command("context")
    .description("Build safe, budgeted repository context for an AI agent");

  context
    .command("build <task>", { isDefault: true })
    .description("Build safe, budgeted repository context for an AI agent")
    .option("--repo <path>", "repository path (defaults to ATLAS_ROOT or cwd)")
    .option("--explain", "show content-free item sources, scores, and reasons")
    .option("--json", "print the package or explanation as JSON")
    .option("--max-tokens-total <number>", "maximum estimated tokens", parsePositiveInteger)
    .option("--include-instructions", "include project instruction files")
    .option("--no-instructions", "exclude project instruction files")
    .option("--include-overview", "include the project overview")
    .option("--no-overview", "exclude the project overview")
    .option("--ai", "add an AI briefing of the assembled package (requires a configured provider)")
    .action(async (task: string, commandOptions: ContextOptions) =>
      runBuild(task, commandOptions, options.integration),
    );

  context
    .command("launch <task>")
    .description("Launch an AI CLI session seeded with safe repository context")
    .requiredOption("--provider <id>", "AI agent provider id")
    .option("--repo <path>", "repository path (defaults to ATLAS_ROOT or cwd)")
    .option("--json", "print the launched session as JSON")
    .option("--max-tokens-total <number>", "maximum estimated tokens", parsePositiveInteger)
    .option("--include-instructions", "include project instruction files")
    .option("--no-instructions", "exclude project instruction files")
    .option("--include-overview", "include the project overview")
    .option("--no-overview", "exclude the project overview")
    .option(
      "--ai",
      "prepend an AI briefing of the package to the session prompt (requires a configured provider)",
    )
    .action(async (task: string, commandOptions: LaunchOptions) =>
      runLaunch(task, commandOptions, options.integration),
    );

  context
    .command("attach <sessionId> <task>")
    .description("Attach safe repository context to a CREATED session")
    .option("--json", "print the attached session as JSON")
    .option("--max-tokens-total <number>", "maximum estimated tokens", parsePositiveInteger)
    .option("--include-instructions", "include project instruction files")
    .option("--no-instructions", "exclude project instruction files")
    .option("--include-overview", "include the project overview")
    .option("--no-overview", "exclude the project overview")
    .option(
      "--ai",
      "prepend an AI briefing of the package to the session prompt (requires a configured provider)",
    )
    .action(async (sessionId: string, task: string, commandOptions: CommonOptions) =>
      runAttach(sessionId, task, commandOptions, options.integration),
    );
}

/**
 * Register a standalone `atlas <agent> <prompt...>` command for every agent
 * with a launch adapter. Each is sugar for
 * `atlas context launch <prompt> --provider <agent>`, sharing the exact same
 * launch path (`runLaunch`) so the briefing, budget, and rendering behavior is
 * identical.
 */
export function registerAgentRouter(program: Command, options: ContextCommandOptions = {}): void {
  for (const agent of AGENT_LAUNCH_TARGETS) {
    program
      .command(agent)
      .description(`Launch the ${agent} AI coding CLI with safe repository context for <prompt...>`)
      .argument("<prompt...>", "what you want the agent to do")
      .option("--repo <path>", "repository path (defaults to ATLAS_ROOT or cwd)")
      .option("--json", "print the launched session as JSON")
      .option("--max-tokens-total <number>", "maximum estimated tokens", parsePositiveInteger)
      .option("--include-instructions", "include project instruction files")
      .option("--no-instructions", "exclude project instruction files")
      .option("--include-overview", "include the project overview")
      .option("--no-overview", "exclude the project overview")
      .option(
        "--ai",
        "prepend an AI briefing of the package to the session prompt (requires a configured provider)",
      )
      .action(async (promptArgs: string[], commandOptions: AgentLaunchOptions) =>
        runLaunch(
          promptArgs.join(" "),
          { ...commandOptions, provider: agent },
          options.integration,
        ),
      );
  }
}

async function runBuild(
  task: string,
  options: ContextOptions,
  injected?: ContextIntegration,
): Promise<void> {
  await withIntegration(
    injected,
    async (integration) => {
      try {
        if (options.explain === true) {
          const value = await integration.explain({ task, ...assembleOptions(options) });
          emit(value, options.json === true, renderContextExplanation);
        } else if (options.ai === true) {
          const briefing = await integration.brief({ task, ...assembleOptions(options) });
          if (briefing.ok) {
            emit(briefing.value, options.json === true, renderContextBriefing);
          } else {
            const pkg = await integration.buildPackage({ task, ...assembleOptions(options) });
            emit(
              { package: pkg, aiMessage: briefing.error.message },
              options.json === true,
              renderContextAIOutcome,
            );
          }
        } else {
          const value = await integration.buildPackage({ task, ...assembleOptions(options) });
          emit(value, options.json === true, renderContextPackage);
        }
      } catch (error) {
        reportContextError(error);
      }
    },
    options.repo,
  );
}

async function runLaunch(
  task: string,
  options: LaunchOptions,
  injected?: ContextIntegration,
): Promise<void> {
  await withIntegration(
    injected,
    async (integration) => {
      try {
        const root = options.repo ?? resolveProjectRoot();
        let prompt: string | undefined;
        if (options.ai === true) {
          const briefing = await integration.brief({ task, ...assembleOptions(options) });
          if (briefing.ok) {
            prompt = renderContextBriefing(briefing.value);
          } else {
            console.error(`AI briefing unavailable: ${briefing.error.message}`);
          }
        }
        const result = await integration.launch({
          task,
          provider: options.provider,
          repositoryPath: root,
          ...assembleOptions(options),
          ...(prompt === undefined ? {} : { prompt }),
        });
        if (!result.ok) {
          reportContextError(result.error);
          return;
        }
        emit(result.value, options.json === true, renderSession);
        const output = integration.getSessionOutput(result.value.id);
        if (output?.stdout) {
          console.log(output.stdout);
        }
        await recordSessionUsage(root, result.value);
      } catch (error) {
        reportContextError(error);
      }
    },
    options.repo,
  );
}

async function runAttach(
  sessionId: string,
  task: string,
  options: CommonOptions,
  injected?: ContextIntegration,
): Promise<void> {
  await withIntegration(injected, async (integration) => {
    try {
      let prompt: string | undefined;
      if (options.ai === true) {
        const briefing = await integration.brief({ task, ...assembleOptions(options) });
        if (briefing.ok) {
          prompt = renderContextBriefing(briefing.value);
        } else {
          console.error(`AI briefing unavailable: ${briefing.error.message}`);
        }
      }
      const result = await integration.attach({
        sessionId,
        task,
        ...assembleOptions(options),
        ...(prompt === undefined ? {} : { prompt }),
      });
      if (!result.ok) {
        reportContextError(result.error);
        return;
      }
      emit(result.value, options.json === true, renderSession);
      const output = integration.getSessionOutput(result.value.id);
      if (output?.stdout) {
        console.log(output.stdout);
      }
    } catch (error) {
      reportContextError(error);
    }
  });
}

async function withIntegration(
  injected: ContextIntegration | undefined,
  action: (integration: ContextIntegration) => Promise<void>,
  repositoryPath?: string,
): Promise<void> {
  if (injected !== undefined) {
    await action(injected);
    return;
  }
  const root = repositoryPath ?? resolveProjectRoot();
  const metrics = openMetrics(root);
  const usage = openUsage(root);
  const context = createContextSDK({
    dbPath: contextDbPath(root),
    repositoryPath: root,
    metrics,
    usage,
  });
  try {
    await action(createContextIntegration({ context, sessions: createSessionManager(), usage }));
  } finally {
    context.close();
    metrics.flush();
    metrics.close();
    usage.close();
  }
}

/**
 * Best-effort: record a usage event so the launched session shows up in
 * `.codeatlas/usage.db` and `atlas sessions stop` can report its token impact.
 * When the session has actual token data (from a chat agent like Ollama), a
 * `source: "provider"` event is recorded with the exact counts. Otherwise a
 * `source: "session"` event is recorded. Never fails the launch.
 */
function recordSessionUsage(root: string, session: Session): Promise<void> {
  return (async () => {
    try {
      const usage = openUsage(root);
      try {
        if (session.tokenUsage !== undefined) {
          await usage.record({
            source: "provider",
            provider: session.provider,
            model: session.model ?? "unknown",
            agent: session.provider,
            sessionId: session.id,
            requestCount: 1,
            latencyMs: 0,
            inputTokens: session.tokenUsage.inputTokens,
            outputTokens: session.tokenUsage.outputTokens,
            totalTokens: session.tokenUsage.totalTokens,
          });
        } else {
          await usage.record({
            source: "session",
            provider: session.provider,
            agent: session.provider,
            sessionId: session.id,
            requestCount: 1,
          });
        }
      } finally {
        usage.close();
      }
    } catch {
      // Best-effort: never fail a successful launch because usage could not be
      // recorded (e.g. the usage store cannot be opened).
    }
  })();
}

function assembleOptions(options: CommonOptions): AssembleOptions {
  return {
    ...(options.maxTokensTotal === undefined
      ? {}
      : { budget: { maxTokensTotal: options.maxTokensTotal } }),
    ...(options.includeInstructions === undefined
      ? {}
      : { includeInstructions: options.includeInstructions }),
    ...(options.includeOverview === undefined ? {} : { includeOverview: options.includeOverview }),
  };
}

function emit<T>(value: T, json: boolean, render: (value: T) => string): void {
  console.log(json ? JSON.stringify(value, null, 2) : render(value));
}
function renderContextAIOutcome(outcome: ContextAIOutcome): string {
  return `${renderContextPackage(outcome.package)}\n\nAI briefing unavailable: ${outcome.aiMessage}`;
}
function renderSession(session: Session): string {
  return `Session ${session.id} started (${session.provider}, ${session.status})`;
}
function reportContextError(error: unknown): void {
  console.error(error instanceof Error ? error.message : "Context command failed.");
  process.exitCode = 1;
}
function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`--max-tokens-total must be a positive integer, got "${value}"`);
  return parsed;
}
