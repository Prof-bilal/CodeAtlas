import type { AdoptGoalInput, GoalContractDraft, GoalDismissal } from "../domain/goal";
import type { ProofReport } from "../domain/proof";

/**
 * Goal intent procedures. Staging never adopts; adoption is always an explicit
 * call and never follows automatically from model output.
 */
export interface GoalPort {
  stageGoalDraft(id: string, draft: GoalContractDraft): Promise<void>;
  adoptGoalContract(id: string, input: AdoptGoalInput): Promise<ProofReport>;
  dismissGoalDraft(id: string, decisions: readonly GoalDismissal[]): Promise<ProofReport>;
}
