import { randomBytes } from "node:crypto";
import type { ContextScope, ExecutionMode, RoleDefinition, TaskPlan } from "@atlas/core";
import { PlanValidationError } from "./errors";

/** Input for building one role of a plan. */
export interface PlanRoleInput {
  /** Stable role id, unique within the plan (e.g. `"security"`). */
  readonly id: string;
  /** Human-readable role name (e.g. `"Review security"`). */
  readonly name: string;
  /** Provider/adapter id that runs the role (e.g. `"claude"`). */
  readonly provider: string;
  /** The sub-task delegated to this role. */
  readonly task: string;
  /** Context visibility: shared (default) or path-isolated. */
  readonly contextScope?: ContextScope;
  /** Per-role timeout in ms; defaults to the orchestrator's default. */
  readonly timeoutMs?: number;
  /** Per-role retry cap for retryable launch failures. */
  readonly maxRetries?: number;
}

/** Input for {@link buildPlan}: an explicit, bounded role list. */
export interface PlanInput {
  /** The original user task. */
  readonly task: string;
  /** Absolute repository the roles run in. */
  readonly repositoryPath: string;
  /** `"parallel"` (default) or `"sequential"`. */
  readonly mode?: ExecutionMode;
  /** The explicit roles to run (1..`MAX_PLAN_ROLES`). */
  readonly roles: readonly PlanRoleInput[];
}

/** The built-in "review" scenario's per-role providers. */
export interface ReviewProviders {
  readonly architecture: string;
  readonly security: string;
  readonly implementation: string;
}

/** Input for the built-in {@link reviewPlan} scenario (the example workflow). */
export interface ReviewPlanInput {
  readonly task: string;
  readonly repositoryPath: string;
  readonly providers: ReviewProviders;
  /** Optional timeout applied to every role. */
  readonly timeoutMs?: number;
  /** Optional retry cap applied to every role. */
  readonly maxRetries?: number;
}

/**
 * Hard cap on the number of roles a plan may contain. The orchestrator is an
 * explicit coordinator, not an autonomous swarm — plans are fixed role lists.
 */
export const MAX_PLAN_ROLES = 8;

/**
 * Build a bounded {@link TaskPlan} from an explicit role list. Deterministic:
 * the same input always produces the same role set (only the plan id is random).
 */
export function buildPlan(input: PlanInput): TaskPlan {
  validatePlanInput(input);
  const roles: readonly RoleDefinition[] = input.roles.map((role) => ({
    id: role.id,
    name: role.name,
    provider: role.provider,
    task: role.task,
    contextScope: role.contextScope ?? { type: "shared" },
    ...(role.timeoutMs !== undefined ? { timeoutMs: role.timeoutMs } : {}),
    ...(role.maxRetries !== undefined ? { maxRetries: role.maxRetries } : {}),
  }));
  return {
    id: newPlanId(),
    task: input.task,
    repositoryPath: input.repositoryPath,
    mode: input.mode ?? "parallel",
    roles,
  };
}

/**
 * The built-in known scenario: a parallel 3-role review workflow
 * (`Claude → Analyze architecture`, `Gemini → Review security`,
 * `Codex → Review implementation`). Each role gets the user task with a fixed,
 * role-specific instruction; context is shared. Roles are explicit — no
 * free-form autonomous delegation.
 */
export function reviewPlan(input: ReviewPlanInput): TaskPlan {
  const task = input.task.trim();
  if (task === "") {
    throw new PlanValidationError("task must not be empty.");
  }
  return buildPlan({
    task,
    repositoryPath: input.repositoryPath,
    mode: "parallel",
    roles: [
      {
        id: "architecture",
        name: "Analyze architecture",
        provider: input.providers.architecture,
        task: `Analyze the architecture relevant to the following task, focusing on structure, coupling, and maintainability.\n\nUser task: ${task}`,
        ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
        ...(input.maxRetries !== undefined ? { maxRetries: input.maxRetries } : {}),
      },
      {
        id: "security",
        name: "Review security",
        provider: input.providers.security,
        task: `Review the security of the code relevant to the following task, focusing on vulnerabilities, secrets handling, and unsafe patterns.\n\nUser task: ${task}`,
        ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
        ...(input.maxRetries !== undefined ? { maxRetries: input.maxRetries } : {}),
      },
      {
        id: "implementation",
        name: "Review implementation",
        provider: input.providers.implementation,
        task: `Review the implementation relevant to the following task, focusing on correctness, edge cases, and bugs.\n\nUser task: ${task}`,
        ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
        ...(input.maxRetries !== undefined ? { maxRetries: input.maxRetries } : {}),
      },
    ],
  });
}

/** Validate the shape of a plan input (throws {@link PlanValidationError}). */
function validatePlanInput(input: PlanInput): void {
  if (input.task.trim() === "") {
    throw new PlanValidationError("task must not be empty.");
  }
  if (input.repositoryPath.trim() === "") {
    throw new PlanValidationError("repositoryPath must not be empty.");
  }
  if (input.roles.length === 0) {
    throw new PlanValidationError("at least one role is required.");
  }
  if (input.roles.length > MAX_PLAN_ROLES) {
    throw new PlanValidationError(
      `a plan may contain at most ${MAX_PLAN_ROLES} roles, got ${input.roles.length}.`,
    );
  }
  const seen = new Set<string>();
  for (const role of input.roles) {
    if (role.id.trim() === "") {
      throw new PlanValidationError("every role must have a non-empty id.");
    }
    if (seen.has(role.id)) {
      throw new PlanValidationError(`duplicate role id "${role.id}".`);
    }
    seen.add(role.id);
    if (role.name.trim() === "") {
      throw new PlanValidationError(`role "${role.id}" must have a non-empty name.`);
    }
    if (role.provider.trim() === "") {
      throw new PlanValidationError(`role "${role.id}" must have a provider.`);
    }
    if (role.task.trim() === "") {
      throw new PlanValidationError(`role "${role.id}" must have a non-empty task.`);
    }
    if (role.timeoutMs !== undefined && role.timeoutMs <= 0) {
      throw new PlanValidationError(`role "${role.id}" timeoutMs must be positive.`);
    }
    if (role.maxRetries !== undefined && role.maxRetries < 0) {
      throw new PlanValidationError(`role "${role.id}" maxRetries must be non-negative.`);
    }
  }
}

/** A unique, short, CLI-safe plan id (8 hex chars). */
function newPlanId(): string {
  return randomBytes(4).toString("hex");
}
