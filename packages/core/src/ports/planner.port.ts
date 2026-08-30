import type { TaskClassification } from "./task-classifier.port";

/**
 * A single step in a deterministic task plan (Phase 2, P2.3).
 *
 * Steps are ordered and each carries its target files and rationale.
 * The model may append notes but never delete, reorder, or contradict
 * a deterministic step (plan-authority guard, P2.5).
 */
export interface PlanStep {
  /** 1-based order in the plan. */
  readonly order: number;
  /** Deterministic, human-readable action description. */
  readonly action: string;
  /** File paths this step expects to touch. */
  readonly targetFiles: readonly string[];
  /** Why this step is necessary (deterministic reasoning). */
  readonly rationale: string;
}

/**
 * The verification strategy the plan recommends for validating the answer.
 *
 * - `"none"`: no verification (comprehension tasks).
 * - `"claim-checks"`: deterministic path/symbol existence checks (Phase 4).
 * - `"command-runners"`: typecheck/tests/lint via allow-listed commands
 *   (Phase 4, ADR-017).
 */
export type VerificationStrategy = "none" | "claim-checks" | "command-runners";

/**
 * A deterministic context plan (Phase 2, P2.3).
 *
 * Generated from classifier output + context search + dependency closure.
 * The plan is attached to the context package as a new item kind (`"plan"`).
 */
export interface ContextPlan {
  /** Ordered steps to complete the task. */
  readonly steps: readonly PlanStep[];
  /** File paths the plan expects to touch (union of all step targets). */
  readonly impactSet: readonly string[];
  /** Things the plan cannot resolve deterministically (need model judgment). */
  readonly unknowns: readonly string[];
  /** Recommended verification strategy. */
  readonly verificationStrategy: VerificationStrategy;
}

/**
 * Deterministic task planner port (Phase 2, ADR-015).
 *
 * Produces a structured plan from a classification + context. The
 * implementation composes classifier output, entity extraction, search
 * results, and dependency closure — all deterministic, no AI.
 */
export interface PlannerPort {
  /**
   * Generate a deterministic plan for a classified task.
   *
   * @param task - The raw user task text.
   * @param classification - The classifier's output for this task.
   * @returns A plan with steps, impact set, unknowns, and verification strategy.
   */
  plan(task: string, classification: TaskClassification): ContextPlan;
}
