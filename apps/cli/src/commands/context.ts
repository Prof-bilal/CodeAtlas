import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { createContextToolSourceFromSDK } from "@atlas/mcp";
import {
  type AssembleOptions,
  type ContextIntegration,
  type ContextMode,
  type ContextPackage,
  type ContextSlice,
  type Session,
  type TaskClassification,
  createClassifier,
  createContextIntegration,
  createContextSDK,
  createPlanner,
  createSessionManager,
  renderContextBriefing,
  renderContextExplanation,
  renderContextPackage,
  renderContextSlice,
  saveContextSlice,
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
  readonly plan?: boolean;
  readonly contextMode?: ContextMode;
}
interface ContextOptions extends CommonOptions {
  readonly explain?: boolean;
  readonly repo?: string;
}
interface ExportOptions {
  readonly for?: string;
  readonly repo?: string;
  readonly out?: string;
  readonly maxTokensTotal?: number;
  readonly inject?: boolean;
  readonly json?: boolean;
  readonly contextMode?: ContextMode;
}

/** What `atlas context export --for <agent>` writes (and where it injects). */
interface ExportTarget {
  /** The agent's instruction file at the repository root, or `null` (generic). */
  readonly instructionFile: string | null;
}

const EXPORT_TARGETS: Readonly<Record<string, ExportTarget>> = {
  claude: { instructionFile: "CLAUDE.md" },
  gemini: { instructionFile: "GEMINI.md" },
  codex: { instructionFile: "AGENTS.md" },
  opencode: { instructionFile: "AGENTS.md" },
  generic: { instructionFile: null },
};

/** Markers around the injected block (idempotent replace between them). */
const INJECT_START = "<!-- codeatlas:context-slice start -->";
const INJECT_END = "<!-- codeatlas:context-slice end -->";

function exportTargetHelp(): string {
  return `target agent (${Object.keys(EXPORT_TARGETS).join(", ")})`;
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
    .option("--context-mode <mode>", parseContextModeHelp(), parseContextMode)
    .option("--max-tokens-total <number>", "maximum estimated tokens", parsePositiveInteger, () =>
      Number.parseInt(process.env.MAX_TOKENS_TOTAL ?? "", 10),
    )
    .option("--include-instructions", "include project instruction files")
    .option("--no-instructions", "exclude project instruction files")
    .option("--include-overview", "include the project overview")
    .option("--no-overview", "exclude the project overview")
    .option("--ai", "add an AI briefing of the assembled package (requires a configured provider)")
    .option("--plan", "classify the task and include a deterministic plan in the output")
    .action(async (task: string, commandOptions: ContextOptions) =>
      runBuild(task, commandOptions, options.integration),
    );

  context
    .command("launch <task>")
    .description("Launch an AI CLI session seeded with safe repository context")
    .requiredOption("--provider <id>", "AI agent provider id")
    .option("--repo <path>", "repository path (defaults to ATLAS_ROOT or cwd)")
    .option("--json", "print the launched session as JSON")
    .option("--context-mode <mode>", parseContextModeHelp(), parseContextMode)
    .option("--max-tokens-total <number>", "maximum estimated tokens", parsePositiveInteger, () =>
      Number.parseInt(process.env.MAX_TOKENS_TOTAL ?? "", 10),
    )
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
    .option("--context-mode <mode>", parseContextModeHelp(), parseContextMode)
    .option("--max-tokens-total <number>", "maximum estimated tokens", parsePositiveInteger, () =>
      Number.parseInt(process.env.MAX_TOKENS_TOTAL ?? "", 10),
    )
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

  context
    .command("export <task>")
    .description("Export a context slice as a self-contained, agent-ready markdown file")
    .requiredOption("--for <agent>", exportTargetHelp())
    .option("--repo <path>", "repository path (defaults to ATLAS_ROOT or cwd)")
    .option("--out <file>", "output file (default .codeatlas/exports/<task>-<id>.md)")
    .option("--context-mode <mode>", parseContextModeHelp(), parseContextMode)
    .option("--max-tokens-total <number>", "maximum estimated tokens", parsePositiveInteger, () =>
      Number.parseInt(process.env.MAX_TOKENS_TOTAL ?? "", 10),
    )
    .option(
      "--no-inject",
      "do not append the instruction block to the target agent's instruction file",
    )
    .option("--json", "print the export outcome as JSON")
    .action(async (task: string, commandOptions: ExportOptions) =>
      runExport(task, commandOptions, options.integration),
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
      .option("--context-mode <mode>", parseContextModeHelp(), parseContextMode)
      .option("--max-tokens-total <number>", "maximum estimated tokens", parsePositiveInteger, () =>
        Number.parseInt(process.env.MAX_TOKENS_TOTAL ?? "", 10),
      )
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
        // When --plan is set, classify the task and include a plan in the output.
        let planOutput: string | undefined;
        if (options.plan === true) {
          const classify = createClassifier();
          const classification = classify(task);
          planOutput = renderPlanSection(task, classification, options.repo);
        }

        if (options.explain === true) {
          const value = await integration.explain({ task, ...assembleOptions(options) });
          const base =
            options.json === true
              ? JSON.stringify(value, null, 2)
              : renderContextExplanation(value);
          emit(planOutput !== undefined ? `${planOutput}\n\n${base}` : base, false, (x) => x);
        } else if (options.ai === true) {
          const briefing = await integration.brief({ task, ...assembleOptions(options) });
          if (briefing.ok) {
            const base =
              options.json === true
                ? JSON.stringify(briefing.value, null, 2)
                : renderContextBriefing(briefing.value);
            emit(planOutput !== undefined ? `${planOutput}\n\n${base}` : base, false, (x) => x);
          } else {
            const pkg = await integration.buildPackage({ task, ...assembleOptions(options) });
            const outcome = { package: pkg, aiMessage: briefing.error.message };
            const base =
              options.json === true
                ? JSON.stringify(outcome, null, 2)
                : renderContextAIOutcome(outcome);
            emit(planOutput !== undefined ? `${planOutput}\n\n${base}` : base, false, (x) => x);
          }
        } else {
          const value = await integration.buildPackage({ task, ...assembleOptions(options) });
          const base =
            options.json === true ? JSON.stringify(value, null, 2) : renderContextPackage(value);
          emit(planOutput !== undefined ? `${planOutput}\n\n${base}` : base, false, (x) => x);
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

/**
 * `atlas context export <task> --for <agent>`: build a context slice, write it
 * as a self-contained markdown file, and (unless `--no-inject`) append an
 * idempotent, marked instruction block to the target agent's instruction file
 * (`CLAUDE.md` for claude, `AGENTS.md` for codex/opencode, …) so the agent
 * knows the file exists and how to get a fresh one. The first injection backs
 * the instruction file up (Configurator backup pattern); never auto-commits.
 */
async function runExport(
  task: string,
  options: ExportOptions,
  injected?: ContextIntegration,
): Promise<void> {
  const target = EXPORT_TARGETS[options.for ?? ""];
  if (target === undefined) {
    console.error(`Unknown --for target "${options.for}". Valid targets: ${exportTargetHelp()}.`);
    process.exitCode = 1;
    return;
  }
  await withIntegration(
    injected,
    async (integration) => {
      try {
        const root = options.repo ?? resolveProjectRoot();
        const slice = await integration.buildSlice({
          task,
          ...(options.maxTokensTotal === undefined
            ? {}
            : { budget: { maxTokensTotal: options.maxTokensTotal } }),
          ...(options.contextMode === undefined ? {} : { contextMode: options.contextMode }),
        });

        const exportPath =
          options.out ??
          join(root, ".codeatlas", "exports", `${taskSlug(task)}-${slice.id.slice(0, 8)}.md`);
        await mkdir(dirname(exportPath), { recursive: true });
        await writeFile(
          exportPath,
          `${renderContextSlice(slice)}\n\n${handoffSection(slice)}\n`,
          "utf8",
        );
        // The canonical slice pair is saved too, so `--for` exports stay
        // listable alongside `atlas ask --save` output.
        const saved = await saveContextSlice(root, slice);

        let instructionFile: string | null = null;
        let injectedBlock = false;
        if (target.instructionFile !== null && options.inject !== false) {
          const outcome = await injectInstructionBlock(root, target.instructionFile, {
            task,
            slicePath: relative(root, exportPath),
          });
          instructionFile = target.instructionFile;
          injectedBlock = outcome.injected;
        }

        if (options.json === true) {
          console.log(
            JSON.stringify(
              {
                slice: {
                  id: slice.id,
                  task: slice.task,
                  items: slice.items.length,
                  tokensEstimated: slice.tokens.estimated,
                  stalenessState: slice.staleness.state,
                },
                exportPath,
                saved: { jsonPath: saved.jsonPath, markdownPath: saved.markdownPath },
                instructionFile,
                injected: injectedBlock,
              },
              null,
              2,
            ),
          );
          return;
        }
        console.log(`Exported: ${exportPath}`);
        console.log(`Saved: ${saved.jsonPath}`);
        console.log(`Saved: ${saved.markdownPath}`);
        if (instructionFile === null) {
          console.log("Instruction block: none (generic target)");
        } else {
          console.log(
            injectedBlock
              ? `Instruction block: updated in ${instructionFile} (backup: ${instructionFile}.atlas-backup)`
              : `Instruction block: ${instructionFile} unchanged (already present)`,
          );
        }
        if (slice.staleness.state === "stale") {
          console.error("Warning: the index was STALE when this slice was built.");
        }
      } catch (error) {
        reportContextError(error);
      }
    },
    options.repo,
  );
}

/** The agent-facing footer appended to every exported slice file. */
function handoffSection(slice: ContextSlice): string {
  return [
    "---",
    "",
    "## Agent handoff",
    "",
    `This slice was generated by CodeAtlas (strategy ${slice.retrieval.strategy}) for the task above. Only the ranked items above were selected — never assume the whole repository was included. For a fresh slice, run \`atlas ask "<task>"\` or the \`get_context_slice\` MCP tool.`,
  ].join("\n");
}

/** Slugify a task into a file-name-safe stem (short, deterministic). */
function taskSlug(task: string): string {
  const slug = task
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug === "" ? "task" : slug;
}

/**
 * Append (or replace) the marked CodeAtlas block in an instruction file.
 * Returns whether the file content changed. The first modification backs the
 * file up once; a re-export replaces the previous block instead of stacking.
 */
async function injectInstructionBlock(
  root: string,
  fileName: string,
  info: { readonly task: string; readonly slicePath: string },
): Promise<{ readonly injected: boolean }> {
  const filePath = join(root, fileName);
  const block = [
    INJECT_START,
    "",
    "### CodeAtlas context slice",
    "",
    `A ranked, budgeted context slice for "${info.task}" is saved at \`${info.slicePath}\`.`,
    "Read it before searching the repository for this task.",
    'Regenerate it with `atlas context export "<task>" --for <agent>` or query fresh context',
    "with `atlas ask` / the `get_context_slice` MCP tool.",
    "",
    INJECT_END,
  ].join("\n");

  let current: string | null = null;
  if (existsSync(filePath)) {
    current = await readFile(filePath, "utf8");
  }
  const start = current?.indexOf(INJECT_START) ?? -1;
  const end = current?.indexOf(INJECT_END) ?? -1;
  if (current !== null && start !== -1 && end !== -1 && end > start) {
    const updated = current.slice(0, start) + block + current.slice(end + INJECT_END.length);
    if (updated === current) {
      return { injected: false };
    }
    await writeFile(filePath, updated, "utf8");
    return { injected: true };
  }
  // First injection: back the user's file up before touching it.
  if (current !== null) {
    await copyFile(filePath, `${filePath}.atlas-backup`);
    await writeFile(filePath, `${current.replace(/\s*$/, "")}\n\n${block}\n`, "utf8");
  } else {
    await writeFile(filePath, `${block}\n`, "utf8");
  }
  return { injected: true };
}

/**
 * Open an integration for a repository (or reuse an injected one — the test
 * seam), run the action, and always close the SDK/metrics/usage handles.
 */
export async function withIntegration(
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
    await action(
      createContextIntegration({
        context,
        sessions: createSessionManager({
          contextToolSource: createContextToolSourceFromSDK(context),
        }),
        usage,
      }),
    );
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
    ...(options.contextMode === undefined ? {} : { contextMode: options.contextMode }),
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

const CONTEXT_MODES: readonly ContextMode[] = ["auto", "auto-escalate", "digest", "full", "off"];

/** Validate a `--context-mode` value against the context assembly modes (ADR-016). */
function parseContextMode(value: string): ContextMode {
  const mode = value as ContextMode;
  if (!CONTEXT_MODES.includes(mode)) {
    throw new Error(`--context-mode must be one of: ${CONTEXT_MODES.join(", ")}. Got "${value}".`);
  }
  return mode;
}

function parseContextModeHelp(): string {
  return "context assembly mode: auto (default), auto-escalate, digest, full, off";
}

// ── Plan rendering ─────────────────────────────────────────────────────────

function renderPlanSection(
  task: string,
  classification: TaskClassification,
  repo?: string,
): string {
  const lines = [
    "## Task Classification",
    "",
    `- **Category:** ${classification.category}`,
    `- **Subcategory:** ${classification.subcategory}`,
    `- **Confidence:** ${classification.confidence}`,
    `- **Reasoning:** ${classification.reasoning}`,
    "",
  ];
  if (classification.entities.filePaths.length > 0) {
    lines.push(`- **Files:** ${classification.entities.filePaths.join(", ")}`);
  }
  if (classification.entities.symbolNames.length > 0) {
    lines.push(`- **Symbols:** ${classification.entities.symbolNames.join(", ")}`);
  }
  lines.push("");

  // Build the plan if a repo path is available (for search/graph).
  if (repo !== undefined) {
    try {
      const root = repo ?? resolveProjectRoot();
      const sdk = createContextSDK({
        dbPath: contextDbPath(root),
        repositoryPath: root,
      });
      try {
        const planner = createPlanner(sdk);
        const planResult = planner.plan(task, classification);
        lines.push("## Plan", "");
        for (const step of planResult.steps) {
          lines.push(`### Step ${step.order}: ${step.action}`);
          lines.push(`> ${step.rationale}`);
          if (step.targetFiles.length > 0) {
            lines.push(`> Targets: ${step.targetFiles.join(", ")}`);
          }
          lines.push("");
        }
        if (planResult.unknowns.length > 0) {
          lines.push("**Unknowns:**");
          for (const unknown of planResult.unknowns) {
            lines.push(`- ${unknown}`);
          }
          lines.push("");
        }
        lines.push(`**Verification:** ${planResult.verificationStrategy}`);
      } finally {
        sdk.close();
      }
    } catch {
      // If the index is unavailable, skip the plan — the classification
      // header is still useful.
      lines.push("*(plan unavailable — index not found)*");
    }
  }

  return lines.join("\n");
}
