import { UnknownSessionError } from "@prof-bilal/atlas-agents";
import type {
  ClaimCheckResult,
  CriticConfig,
  Session,
  SessionOutput,
  SessionPort,
  UsagePort,
} from "@prof-bilal/atlas-core";
import { type Result, fail, ok } from "@prof-bilal/atlas-shared";
import type { ContextSDK } from "../context/sdk";
import { resolveSkillsInstructions } from "../skills/index";
import { type AssembleOptions, assembleContextPackage } from "./assemble";
import { type BriefingPort, createBriefingPort } from "./briefing";
import { type CriticReview, createCritic } from "./critic";
import { ContextAttachUnsupportedError, TaskLedgerNotFoundError } from "./errors";
import { renderHandoffPrompt } from "./handoff";
import type { ContextBriefing, ContextExplanation, ContextPackage } from "./models";
import { renderContextPackage, toContextExplanation } from "./render";
import { type ContextSlice, projectContextSlice } from "./slice";
import { detectStaleness } from "./staleness";
import {
  type TaskLedger,
  type TaskLedgerSummary,
  type TaskSessionRecord,
  computeFilesTouched,
  createTaskLedgerDocument,
  listTaskLedgers,
  loadTaskLedger,
  resolveTaskLedger,
  saveTaskLedger,
  withTaskProgress,
  withTaskSession,
} from "./task-ledger";

export {
  BRIEFING_PROMPT_TEMPLATE,
  createBriefingPort,
  type BriefingPort,
  type BriefingRequest,
  type BriefingResponse,
} from "./briefing";

export {
  DEFAULT_CRITIC_CONFIG,
  createCritic,
  runChecklist,
  type CriticConfig,
  type CriticReview,
} from "./critic";

export {
  assembleContextPackage,
  type AssembleInput,
  type AssembleOptions,
} from "./assemble";
export { applyBudget, DEFAULT_CONTEXT_BUDGET } from "./budget";
export { synthesize, type SynthesisInput } from "./synthesis";
export type { ContextSynthesis, ContextSynthesisKind } from "./models";
export type { ContextMode } from "@prof-bilal/atlas-core";
export { createClassifier } from "./classifier";

export {
  buildSymbolOutline,
  lineRangeOfSymbol,
  sliceContentByRanges,
  tierPriorityOf,
  TIER_PRIORITY,
  type OutlineSymbol,
} from "./hierarchy";
export {
  buildDigest,
  type DigestContent,
  type DigestEdge,
  type DigestFile,
  type DigestInput,
  type DigestManifest,
  type DigestModule,
  type DigestSymbol,
} from "./digest";
export { extractTaskEntities, type TaskEntities } from "./entities";
export { createPlanner } from "./planner";
export {
  applyPlanAnnotations,
  type ModelAnnotation,
  type PlanAnnotationResult,
} from "./plan-guard";
export {
  evaluateSufficiency,
  type SufficiencyFailure,
  type SufficiencyInput,
  type SufficiencyResult,
} from "./sufficiency";
export { denyFilter, type DenyFilterResult } from "./deny";
export {
  ContextAttachUnsupportedError,
  ContextPackageError,
  ContextSliceError,
  ContextSliceValidationError,
  TaskLedgerError,
  TaskLedgerNotFoundError,
  TaskLedgerValidationError,
} from "./errors";
export {
  DEFAULT_HANDOFF_MAX_TOKENS,
  renderHandoffPrompt,
  renderHandoffSection,
  sanitizeTaskProgress,
  type HandoffRenderOptions,
} from "./handoff";
export {
  MAX_FILES_TOUCHED,
  MAX_TASK_FILE_BYTES,
  MAX_TASK_OUTPUT_CHARS,
  SAFE_TASK_ID,
  TASKS_DIR_NAME,
  TASK_LEDGER_SCHEMA_VERSION,
  boundProgress,
  computeFilesTouched,
  contextTaskPath,
  contextTasksDir,
  createTaskLedgerDocument,
  emptyProgress,
  findTaskLedgerBySessionId,
  listTaskLedgers,
  loadTaskLedger,
  relativeHashes,
  resolveTaskLedger,
  saveTaskLedger,
  taskId,
  validateTaskLedger,
  withTaskProgress,
  withTaskSession,
  type TaskLedger,
  type TaskLedgerSummary,
  type TaskProgress,
  type TaskSessionRecord,
} from "./task-ledger";
export { collectInstructions, type ProjectInstruction } from "./instructions";
export type {
  BudgetRecord,
  ContextBriefing,
  ContextBudget,
  ContextExplanation,
  ContextExplanationItem,
  ContextItemKind,
  ContextItemSource,
  ContextPackage,
  ContextPackageItem,
  ExclusionRecord,
  StaleContextSignal,
  StalenessState,
} from "./models";
export {
  renderBriefingSection,
  renderContextBriefing,
  renderContextExplanation,
  renderContextPackage,
  toContextExplanation,
} from "./render";
export { detectStaleness } from "./staleness";
export {
  SLICE_STRATEGY,
  buildContextSlice,
  projectContextSlice,
  renderContextSlice,
  sliceId,
  sliceItemFenceLanguage,
  toContextSlice,
  type BuildSliceInput,
  type ContextSlice,
  type ContextSliceRepository,
} from "./slice";
export {
  CONTEXT_SLICE_SCHEMA_VERSION,
  MAX_SLICE_FILE_BYTES,
  SLICES_DIR_NAME,
  contextSlicePaths,
  contextSlicesDir,
  listContextSlices,
  loadContextSlice,
  saveContextSlice,
  validateContextSlice,
  validateContextSliceFile,
  type ContextSliceFile,
  type ContextSlicePaths,
  type ContextSliceSummary,
} from "./slice-store";

/** Inputs to {@link ContextIntegration.buildPackage} / {@link ContextIntegration.explain}. */
export interface BuildPackageInput extends AssembleOptions {
  readonly task: string;
}

/** Inputs to {@link ContextIntegration.launch}. */
export interface LaunchInput extends BuildPackageInput {
  /** Adapter/provider id, e.g. `"claude"` (validated by the session manager). */
  readonly provider: string;
  /** Repository path the session runs in. */
  readonly repositoryPath: string;
  /** Extra provider-specific args appended after any run-mode flags. */
  readonly args?: readonly string[];
  /** Extra environment entries for the child; never logged. */
  readonly env?: Readonly<Record<string, string>>;
  /** Override the prompt (default: the rendered context package). */
  readonly prompt?: string;
  /**
   * Skill ids (custom first, then built-ins) rendered as instruction blocks
   * and prepended to the session prompt (ADR-022 ch.5). Unknown ids fail the
   * launch before a session is created.
   */
  readonly skills?: readonly string[];
  /**
   * Pre-resolved skill instruction block; bypasses `skills` resolution (used
   * by consumers that already rendered the block, e.g. the CLI's fast-fail
   * path). When both are given, `prompt` wins, then `skillInstructions`,
   * then `skills`.
   */
  readonly skillInstructions?: string;
  /**
   * Pipe the child's stdout/stderr so prior work can be stored on the task
   * ledger. Default `true` for task-linked launches. Mutually exclusive with
   * interactive sessions (interactive wins inside SessionPort).
   */
  readonly captureOutput?: boolean;
  /**
   * Persist / append a task ledger under `.codeatlas/tasks/` (ADR-025).
   * Default `true`. Set `false` for throwaway launches that must not write.
   */
  readonly recordTask?: boolean;
  /** Reuse an existing task ledger instead of creating a new one. */
  readonly taskId?: string;
}

/** Inputs to {@link ContextIntegration.handoff}. */
export interface HandoffInput extends Omit<LaunchInput, "task" | "taskId" | "recordTask"> {
  /** Existing 16-hex task id, or omit when `fromSessionId` is set. */
  readonly taskId?: string;
  /** Session id recorded on a ledger (resolved when `taskId` is omitted). */
  readonly fromSessionId?: string;
}

/** Inputs to {@link ContextIntegration.attach}. */
export interface AttachInput extends BuildPackageInput {
  /** A session in `CREATED` state; live/terminal sessions are not attachable. */
  readonly sessionId: string;
  /** Skill ids to render and prepend to the prompt (same rules as launch). */
  readonly skills?: readonly string[];
  /** Pre-resolved skill instruction block (see {@link LaunchInput}). */
  readonly skillInstructions?: string;
}

/** Inputs to {@link ContextIntegration.buildSlice}. */
export interface BuildSliceRequest extends BuildPackageInput {
  /**
   * Refresh the index first when it is stale relative to the working tree
   * (default `true` — the same freshness contract as the MCP tools). A failed
   * refresh never blocks the slice: the staleness signal stays `stale` and the
   * slice is labeled honestly.
   */
  readonly autoRefresh?: boolean;
}

/** Options for {@link createContextIntegration}. */
export interface ContextIntegrationOptions {
  /** The read façade every package is assembled from. */
  readonly context: ContextSDK;
  /** The session port every package is delivered through. */
  readonly sessions: SessionPort;
  /** AI briefing port for `brief` (defaults to a provider-backed port). */
  readonly ai?: BriefingPort;
  /** Optional usage port; AI briefings are recorded with actual tokens. */
  readonly usage?: UsagePort;
  /** Critic configuration (defaults to same-model, 1 revision). */
  readonly criticConfig?: CriticConfig;
}

/**
 * The Context → Agent integration façade (ADR-008).
 *
 * Composes the read façade (`ContextSDK`) with the session manager
 * (`SessionPort`): it assembles a provider-independent {@link ContextPackage}
 * for a task, renders it, and delivers it when an AI CLI session starts. No
 * provider-specific logic lives here.
 */
export interface ContextIntegration {
  /** Assemble a budgeted, deny-filtered context package for a task. */
  buildPackage(input: BuildPackageInput): Promise<ContextPackage>;
  /** Assemble a package and project it to a content-free explanation. */
  explain(input: BuildPackageInput): Promise<ContextExplanation>;
  /**
   * Build a {@link ContextSlice} — the persisted projection of the package
   * that every selective-delivery channel serves. Applies the freshness
   * contract first (auto-refresh when stale) so slices are never silently
   * outdated.
   */
  buildSlice(input: BuildSliceRequest): Promise<ContextSlice>;
  /**
   * Assemble a package, create a session, and start it with the rendered
   * package as the prompt. Fails cleanly with the session manager's `Result`.
   */
  launch(input: LaunchInput): Promise<Result<Session>>;
  /**
   * Stop the previous session if it is still running, persist captured
   * progress, assemble the same task's context package, and start a **new**
   * session on `provider` with a handoff section (ADR-025). Sessions stay
   * provider-immutable.
   */
  handoff(input: HandoffInput): Promise<Result<Session>>;
  /** List persisted task ledgers for the integration's repository. */
  listTasks(): Promise<readonly TaskLedgerSummary[]>;
  /** Load one ledger by task id, or `null` when missing. */
  getTask(taskId: string): Promise<TaskLedger | null>;
  /**
   * Task id recorded for a session started by this process, if known.
   * Does not hit disk — use {@link getTask} / {@link listTasks} after restart.
   */
  getTaskIdForSession(sessionId: string): string | undefined;
  /**
   * Assemble a package and start an existing **`CREATED`** session with it.
   * Starting a live/terminal session is not supported by the non-interactive
   * adapters — that case reports a typed {@link ContextAttachUnsupportedError}.
   */
  attach(input: AttachInput): Promise<Result<Session>>;
  /**
   * Assemble a package deterministically (as {@link buildPackage}) and generate
   * an AI briefing of it. The briefing is additive and explicit: it never
   * changes the assembled package, and it fails cleanly when no provider is
   * configured. Consumers that do not want AI can ignore this method.
   */
  brief(input: BuildPackageInput): Promise<Result<ContextBriefing>>;
  /**
   * Run the critic on an answer: deterministic checklist + optional AI review.
   * Returns a CriticReview with issues and revision recommendations.
   * Undefined when the critic is not configured.
   */
  review?(
    answer: string,
    input: BuildPackageInput,
    claimResults: ClaimCheckResult,
  ): Promise<Result<CriticReview>>;
  /**
   * Retrieve the captured stdout/stderr of a session launched with
   * `captureOutput: true`, or `undefined` when the session is unknown or did
   * not capture output. The output stays available after the session reaches
   * a terminal state.
   */
  getSessionOutput(sessionId: string): SessionOutput | undefined;
}

/** Create the Context → Agent integration façade. */
export function createContextIntegration(options: ContextIntegrationOptions): ContextIntegration {
  const { context, sessions } = options;
  const ai =
    options.ai ?? createBriefingPort(options.usage === undefined ? {} : { usage: options.usage });
  const critic = createCritic(undefined, options.criticConfig);
  const sessionTaskIds = new Map<string, string>();
  const repo = (): string => context.config.repositoryPath;

  const recordSessionOnLedger = async (
    ledger: TaskLedger,
    session: Session,
    outputText: string | undefined,
    options: { readonly keepProgress?: boolean } = {},
  ): Promise<TaskLedger> => {
    let next = withTaskSession(ledger, sessionRecord(session));
    if (options.keepProgress !== true) {
      const files = await computeFilesTouched(ledger.repositoryPath, ledger.hashSnapshotAtStart);
      const lastOutput = outputText ?? "";
      next = withTaskProgress(next, {
        lastOutput,
        lastOutputTruncated: false,
        filesTouched: files.filesTouched,
        filesTouchedTruncated: files.truncated,
        filesTouchedUnknown: files.unknown,
        transcriptAvailable: lastOutput.trim() !== "",
      });
    }
    await saveTaskLedger(ledger.repositoryPath, next);
    sessionTaskIds.set(session.id, next.id);
    return next;
  };

  const startWithContext = async (input: LaunchInput, prompt: string): Promise<Result<Session>> => {
    const created = sessions.createSession({
      provider: input.provider,
      repositoryPath: input.repositoryPath,
    });
    if (!created.ok) {
      return created;
    }
    return sessions.startSession(created.value.id, {
      prompt,
      captureOutput: input.captureOutput !== false,
      ...(input.args !== undefined ? { args: input.args } : {}),
      ...(input.env !== undefined ? { env: input.env } : {}),
    });
  };

  return {
    async buildPackage(input: BuildPackageInput): Promise<ContextPackage> {
      const staleness = await detectStaleness(context);
      return assembleContextPackage({
        context,
        repositoryPath: context.config.repositoryPath,
        task: input.task,
        staleness,
        options: toAssembleOptions(input),
      });
    },

    async explain(input: BuildPackageInput): Promise<ContextExplanation> {
      return toContextExplanation(await this.buildPackage(input));
    },

    async buildSlice(input: BuildSliceRequest): Promise<ContextSlice> {
      let staleness = await detectStaleness(context);
      if (input.autoRefresh !== false && staleness.state === "stale" && context.isAvailable) {
        const refreshed = await context.refresh();
        if (refreshed.ok) {
          staleness = await detectStaleness(context);
        }
        // A failed refresh leaves the stale signal in place — the slice is
        // still built, and labeled STALE on every channel.
      }
      return projectContextSlice(context, input.task, staleness, toAssembleOptions(input));
    },

    async launch(input: LaunchInput): Promise<Result<Session>> {
      const pkg = await this.buildPackage(input);
      const skillsResult = await resolveLaunchSkillsBlock(
        input.skillInstructions,
        input.skills,
        context.config.repositoryPath,
      );
      if (!skillsResult.ok) {
        return skillsResult;
      }
      const skillsBlock = skillsResult.value;
      const base = input.prompt ?? renderContextPackage(pkg);
      const started = await startWithContext(
        input,
        skillsBlock === "" ? base : `${skillsBlock}\n\n${base}`,
      );
      if (!started.ok || input.recordTask === false) {
        return started;
      }
      const existing =
        input.taskId !== undefined
          ? await loadTaskLedger(input.repositoryPath, input.taskId)
          : null;
      const ledger =
        existing ??
        createTaskLedgerDocument({
          task: input.task,
          repositoryPath: input.repositoryPath,
          hashes: context.hashes(),
        });
      const output = sessions.getSessionOutput(started.value.id);
      await recordSessionOnLedger(ledger, started.value, output?.stdout);
      return started;
    },

    async handoff(input: HandoffInput): Promise<Result<Session>> {
      const id = input.taskId ?? input.fromSessionId;
      if (id === undefined || id.trim() === "") {
        return fail(new TaskLedgerNotFoundError(""));
      }
      let ledger: TaskLedger;
      try {
        ledger = await resolveTaskLedger(input.repositoryPath, id);
      } catch (error) {
        return fail(error instanceof Error ? error : new TaskLedgerNotFoundError(id));
      }
      const previous = ledger.sessions[ledger.sessions.length - 1];
      if (previous !== undefined) {
        const live = sessions.getSession(previous.sessionId);
        if (live !== undefined && isActiveStatus(live.status)) {
          await sessions.stopSession(live.id);
        }
        const snapshot = sessions.getSession(previous.sessionId) ?? live;
        const output = sessions.getSessionOutput(previous.sessionId);
        ledger = await recordSessionOnLedger(
          { ...ledger, sessions: ledger.sessions.slice(0, -1) },
          snapshot ?? syntheticSession(previous, ledger.repositoryPath),
          output?.stdout,
        );
      }
      const pkg = await this.buildPackage({
        task: ledger.task,
        ...toAssembleOptions(input),
      });
      const skillsResult = await resolveLaunchSkillsBlock(
        input.skillInstructions,
        input.skills,
        context.config.repositoryPath,
      );
      if (!skillsResult.ok) {
        return skillsResult;
      }
      const skillsBlock = skillsResult.value;
      const base = input.prompt ?? renderHandoffPrompt(pkg, ledger);
      const started = await startWithContext(
        {
          provider: input.provider,
          repositoryPath: input.repositoryPath,
          task: ledger.task,
          recordTask: false,
          ...toAssembleOptions(input),
          ...(input.prompt === undefined ? {} : { prompt: input.prompt }),
          ...(input.args === undefined ? {} : { args: input.args }),
          ...(input.env === undefined ? {} : { env: input.env }),
          ...(input.skills === undefined ? {} : { skills: input.skills }),
          ...(input.skillInstructions === undefined
            ? {}
            : { skillInstructions: input.skillInstructions }),
          ...(input.captureOutput === undefined ? {} : { captureOutput: input.captureOutput }),
        },
        skillsBlock === "" ? base : `${skillsBlock}\n\n${base}`,
      );
      if (!started.ok) {
        return started;
      }
      const output = sessions.getSessionOutput(started.value.id);
      await recordSessionOnLedger(ledger, started.value, output?.stdout, { keepProgress: true });
      return started;
    },

    listTasks(): Promise<readonly TaskLedgerSummary[]> {
      return listTaskLedgers(repo());
    },

    getTask(id: string): Promise<TaskLedger | null> {
      return loadTaskLedger(repo(), id);
    },

    getTaskIdForSession(sessionId: string): string | undefined {
      return sessionTaskIds.get(sessionId);
    },

    async attach(input: AttachInput): Promise<Result<Session>> {
      const pkg = await this.buildPackage(input);
      const skillsResult = await resolveLaunchSkillsBlock(
        input.skillInstructions,
        input.skills,
        context.config.repositoryPath,
      );
      if (!skillsResult.ok) {
        return skillsResult;
      }
      const skillsBlock = skillsResult.value;
      const session = sessions.getSession(input.sessionId);
      if (session === undefined) {
        return fail(new UnknownSessionError(input.sessionId));
      }
      if (session.status !== "CREATED") {
        return fail(new ContextAttachUnsupportedError(session.id, session.status));
      }
      const base = renderContextPackage(pkg);
      return sessions.startSession(session.id, {
        prompt: skillsBlock === "" ? base : `${skillsBlock}\n\n${base}`,
      });
    },

    async brief(input: BuildPackageInput): Promise<Result<ContextBriefing>> {
      const pkg = await this.buildPackage(input);
      const generated = await ai.generate({
        target: input.task,
        content: renderContextPackage(pkg),
      });
      if (!generated.ok) {
        return generated;
      }
      return ok({
        task: input.task,
        content: generated.value.content,
        metadata: generated.value.metadata,
        package: pkg,
      });
    },

    async review(
      answer: string,
      input: BuildPackageInput,
      claimResults: ClaimCheckResult,
    ): Promise<Result<CriticReview>> {
      const pkg = await this.buildPackage(input);
      const citedPaths = pkg.items
        .filter((item) => item.path !== null)
        .map((item) => item.path as string);
      const checklist = critic.check({
        answer,
        citedPaths,
        planTargets: [],
        claimResults,
      });
      return critic.review(answer, checklist, renderContextPackage(pkg));
    },

    getSessionOutput(sessionId: string): SessionOutput | undefined {
      return sessions.getSessionOutput(sessionId);
    },
  };
}

/** Narrow an integration input down to the pure assemble options. */
function toAssembleOptions(input: AssembleOptions): AssembleOptions {
  return {
    ...(input.budget !== undefined ? { budget: input.budget } : {}),
    ...(input.searchLimit !== undefined ? { searchLimit: input.searchLimit } : {}),
    ...(input.includeInstructions !== undefined
      ? { includeInstructions: input.includeInstructions }
      : {}),
    ...(input.explicitResolution !== undefined
      ? { explicitResolution: input.explicitResolution }
      : {}),
    ...(input.includeOverview !== undefined ? { includeOverview: input.includeOverview } : {}),
    ...(input.scopePaths !== undefined ? { scopePaths: input.scopePaths } : {}),
    ...(input.taskCategory !== undefined ? { taskCategory: input.taskCategory } : {}),
    ...(input.contextMode !== undefined ? { contextMode: input.contextMode } : {}),
    ...(input.brief !== undefined ? { brief: input.brief } : {}),
  };
}

function isActiveStatus(status: Session["status"]): boolean {
  return status === "STARTING" || status === "RUNNING" || status === "STOPPING";
}

function sessionRecord(session: Session): TaskSessionRecord {
  return {
    sessionId: session.id,
    provider: session.provider,
    model: session.model ?? null,
    status: session.status,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
  };
}

function syntheticSession(previous: TaskSessionRecord, repositoryPath: string): Session {
  return {
    id: previous.sessionId,
    agentId: previous.provider as Session["agentId"],
    provider: previous.provider,
    repositoryPath,
    status: previous.status as Session["status"],
    processId: undefined,
    startedAt: previous.startedAt,
    endedAt: previous.endedAt,
    exitCode: undefined,
    error: undefined,
    model: previous.model ?? undefined,
    tokenUsage: undefined,
  };
}

/**
 * Resolve the launch/attach skill inputs into an instruction block. Returns a
 * failed Result for unknown ids (the caller aborts before creating a session)
 * and an empty string when no skills were requested.
 */
async function resolveLaunchSkillsBlock(
  skillInstructions: string | undefined,
  skills: readonly string[] | undefined,
  repositoryPath: string,
): Promise<Result<string>> {
  if (skillInstructions !== undefined) {
    return ok(skillInstructions);
  }
  if (skills === undefined || skills.length === 0) {
    return ok("");
  }
  const resolved = resolveSkillsInstructions(skills, { root: repositoryPath });
  if (!resolved.ok) {
    return fail(resolved.error);
  }
  return ok(resolved.value.instructions);
}
