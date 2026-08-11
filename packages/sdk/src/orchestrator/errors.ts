/**
 * Typed errors for the Multi-Agent Orchestrator.
 */

/** Base class for every orchestrator error. */
export class OrchestratorError extends Error {
  public override readonly name: string = "OrchestratorError";
}

/**
 * Thrown when a plan is malformed (empty task, no roles, duplicate role ids,
 * empty role name/provider/task, or more roles than `MAX_PLAN_ROLES`). Plans
 * are explicit and bounded — this keeps the "no uncontrolled swarm" guarantee.
 */
export class PlanValidationError extends OrchestratorError {
  public override readonly name: string = "PlanValidationError";

  public constructor(message: string) {
    super(`Invalid task plan: ${message}`);
  }
}
