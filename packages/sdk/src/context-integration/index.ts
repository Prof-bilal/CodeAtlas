import { UnknownSessionError } from "@atlas/agents";
import type { Session, SessionOutput, SessionPort, UsagePort } from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import type { ContextSDK } from "../context/sdk";
import { type AssembleOptions, assembleContextPackage } from "./assemble";
import { type BriefingPort, createBriefingPort } from "./briefing";
import { ContextAttachUnsupportedError } from "./errors";
import type { ContextBriefing, ContextExplanation, ContextPackage } from "./models";
import { renderContextPackage, toContextExplanation } from "./render";
import { type ContextSlice, projectContextSlice } from "./slice";
import { detectStaleness } from "./staleness";

export {
  BRIEFING_PROMPT_TEMPLATE,
  createBriefingPort,
  type BriefingPort,
  type BriefingRequest,
  type BriefingResponse,
} from "./briefing";

export {
  assembleContextPackage,
  type AssembleInput,
  type AssembleOptions,
} from "./assemble";
export { applyBudget, DEFAULT_CONTEXT_BUDGET } from "./budget";
export {
  buildSymbolOutline,
  lineRangeOfSymbol,
  sliceContentByRanges,
  tierPriorityOf,
  TIER_PRIORITY,
  type OutlineSymbol,
} from "./hierarchy";
export { createClassifier } from "./classifier";
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
} from "./errors";
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
}

/** Inputs to {@link ContextIntegration.attach}. */
export interface AttachInput extends BuildPackageInput {
  /** A session in `CREATED` state; live/terminal sessions are not attachable. */
  readonly sessionId: string;
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
      const created = sessions.createSession({
        provider: input.provider,
        repositoryPath: input.repositoryPath,
      });
      if (!created.ok) {
        return created;
      }
      return sessions.startSession(created.value.id, {
        prompt: input.prompt ?? renderContextPackage(pkg),
        ...(input.args !== undefined ? { args: input.args } : {}),
        ...(input.env !== undefined ? { env: input.env } : {}),
      });
    },

    async attach(input: AttachInput): Promise<Result<Session>> {
      const pkg = await this.buildPackage(input);
      const session = sessions.getSession(input.sessionId);
      if (session === undefined) {
        return fail(new UnknownSessionError(input.sessionId));
      }
      if (session.status !== "CREATED") {
        return fail(new ContextAttachUnsupportedError(session.id, session.status));
      }
      return sessions.startSession(session.id, {
        prompt: renderContextPackage(pkg),
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

    getSessionOutput(sessionId: string): SessionOutput | undefined {
      return sessions.getSessionOutput(sessionId);
    },
  };
}

/** Narrow an integration input down to the pure assemble options. */
function toAssembleOptions(input: BuildPackageInput): AssembleOptions {
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
  };
}
