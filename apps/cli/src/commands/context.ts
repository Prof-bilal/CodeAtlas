import {
  createContextIntegration,
  createContextSDK,
  createSessionManager,
  type AssembleOptions,
  type ContextIntegration,
  type Session,
  renderContextExplanation,
  renderContextPackage,
} from "@atlas/sdk";
import type { Command } from "commander";
import { contextDbPath, resolveProjectRoot } from "./search";

export interface ContextCommandOptions {
  readonly integration?: ContextIntegration;
}
interface CommonOptions {
  readonly json?: boolean;
  readonly maxTokensTotal?: number;
  readonly includeInstructions?: boolean;
  readonly includeOverview?: boolean;
}
interface ContextOptions extends CommonOptions {
  readonly explain?: boolean;
}
interface LaunchOptions extends CommonOptions {
  readonly provider: string;
  readonly repo?: string;
}
interface AttachOptions extends CommonOptions {
  readonly repo?: string;
}

export function registerContext(program: Command, options: ContextCommandOptions = {}): void {
  const context = program
    .command("context <task>")
    .description("Build safe, budgeted repository context for an AI agent")
    .option("--explain", "show content-free item sources, scores, and reasons")
    .option("--json", "print the package or explanation as JSON")
    .option("--max-tokens-total <number>", "maximum estimated tokens", parsePositiveInteger)
    .option("--include-instructions", "include project instruction files")
    .option("--no-instructions", "exclude project instruction files")
    .option("--include-overview", "include the project overview")
    .option("--no-overview", "exclude the project overview");
  context.action(async (task: string, commandOptions: ContextOptions) =>
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
    .action(async (task: string, commandOptions: LaunchOptions) =>
      runLaunch(task, commandOptions, options.integration),
    );

  context
    .command("attach <sessionId> <task>")
    .description("Attach safe repository context to a CREATED session")
    .option("--repo <path>", "repository path (defaults to ATLAS_ROOT or cwd)")
    .option("--json", "print the attached session as JSON")
    .option("--max-tokens-total <number>", "maximum estimated tokens", parsePositiveInteger)
    .option("--include-instructions", "include project instruction files")
    .option("--no-instructions", "exclude project instruction files")
    .option("--include-overview", "include the project overview")
    .option("--no-overview", "exclude the project overview")
    .action(async (sessionId: string, task: string, commandOptions: AttachOptions) =>
      runAttach(sessionId, task, commandOptions, options.integration),
    );
}

async function runBuild(
  task: string,
  options: ContextOptions,
  injected?: ContextIntegration,
): Promise<void> {
  await withIntegration(injected, async (integration) => {
    try {
      if (options.explain === true) {
        const value = await integration.explain({ task, ...assembleOptions(options) });
        emit(value, options.json === true, renderContextExplanation);
      } else {
        const value = await integration.buildPackage({ task, ...assembleOptions(options) });
        emit(value, options.json === true, renderContextPackage);
      }
    } catch (error) {
      reportContextError(error);
    }
  });
}

async function runLaunch(
  task: string,
  options: LaunchOptions,
  injected?: ContextIntegration,
): Promise<void> {
  await withIntegration(injected, async (integration) => {
    try {
      const root = options.repo ?? resolveProjectRoot();
      const result = await integration.launch({
        task,
        provider: options.provider,
        repositoryPath: root,
        ...assembleOptions(options),
      });
      if (!result.ok) {
        reportContextError(result.error);
        return;
      }
      emit(result.value, options.json === true, renderSession);
    } catch (error) {
      reportContextError(error);
    }
  });
}

async function runAttach(
  sessionId: string,
  task: string,
  options: AttachOptions,
  injected?: ContextIntegration,
): Promise<void> {
  await withIntegration(injected, async (integration) => {
    try {
      const result = await integration.attach({ sessionId, task, ...assembleOptions(options) });
      if (!result.ok) {
        reportContextError(result.error);
        return;
      }
      emit(result.value, options.json === true, renderSession);
    } catch (error) {
      reportContextError(error);
    }
  });
}

async function withIntegration(
  injected: ContextIntegration | undefined,
  action: (integration: ContextIntegration) => Promise<void>,
): Promise<void> {
  if (injected !== undefined) {
    await action(injected);
    return;
  }
  const root = resolveProjectRoot();
  const context = createContextSDK({ dbPath: contextDbPath(root), repositoryPath: root });
  try {
    await action(createContextIntegration({ context, sessions: createSessionManager() }));
  } finally {
    context.close();
  }
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
