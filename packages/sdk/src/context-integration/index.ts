import { fail, type Result } from "@atlas/shared";
import { UnknownSessionError } from "@atlas/agents";
import type { Session, SessionPort } from "@atlas/core";
import type { ContextSDK } from "../context/sdk";
import { assembleContextPackage, type AssembleOptions } from "./assemble";
import { detectStaleness } from "./staleness";
import { renderContextPackage, toContextExplanation } from "./render";
import type { ContextExplanation, ContextPackage } from "./models";
import { ContextAttachUnsupportedError } from "./errors";

export {
  assembleContextPackage,
  type AssembleInput,
  type AssembleOptions,
} from "./assemble";
export {
  applyBudget,
  DEFAULT_CONTEXT_BUDGET,
  estimateTokens,
} from "./budget";
export { denyFilter, type DenyFilterResult } from "./deny";
export { ContextAttachUnsupportedError, ContextPackageError } from "./errors";
export {
  collectInstructions,
  type ProjectInstruction,
} from "./instructions";
export type {
  BudgetRecord,
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
  renderContextExplanation,
  renderContextPackage,
  toContextExplanation,
} from "./render";
export { detectStaleness } from "./staleness";

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

/** Options for {@link createContextIntegration}. */
export interface ContextIntegrationOptions {
  /** The read façade every package is assembled from. */
  readonly context: ContextSDK;
  /** The session port every package is delivered through. */
  readonly sessions: SessionPort;
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
}

/** Create the Context → Agent integration façade. */
export function createContextIntegration(options: ContextIntegrationOptions): ContextIntegration {
  const { context, sessions } = options;

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
  };
}
