import type { GoalContract, GoalContractDraft, GoalSatisfactionReceipt } from "../domain/goal";
import type {
  ChangeSession,
  InvestigationRule,
  MutationJustification,
  ProofProposal,
  ProofReport,
  RepositoryRevision,
  VerificationAction,
  VerificationResult,
} from "../domain/proof";

/** Optimistic writes make parallel clients reject lost updates. */
export interface ProofStorePort {
  get(id: string): ChangeSession | null;
  put(session: ChangeSession, expectedVersion: number | null): void;
  close(): void;
}
export interface ProofRepositoryPort {
  observe(): Promise<RepositoryRevision>;
  execute(
    action: VerificationAction,
    revision: RepositoryRevision,
    baseline?: RepositoryRevision,
  ): Promise<VerificationResult>;
}
export interface BeginChangeInput {
  readonly goal: string;
  readonly boundary?: readonly string[];
  readonly authorizedPaths?: readonly string[];
  readonly semanticChangeBudget?: number;
  readonly proposals?: readonly ProofProposal[];
  readonly investigationRules?: readonly InvestigationRule[];
  readonly justifications?: readonly MutationJustification[];
  /** Already-adopted goal intent; validated before persistence. */
  readonly goalContract?: GoalContract;
  /** Staged, unadopted goal intent; never treated as adopted. */
  readonly proposedGoal?: GoalContractDraft;
}
export interface ProofPort {
  begin(input: BeginChangeInput): Promise<ProofReport>;
  understand(id: string, proposals: readonly ProofProposal[]): Promise<ProofReport>;
  revise(id: string, nodeId: string, statement: string): Promise<ProofReport>;
  check(id: string): Promise<ProofReport>;
  verify(id: string, nodeId: string): Promise<ProofReport>;
  prove(id: string): Promise<GoalSatisfactionReceipt>;
  exportState(id: string): Promise<ChangeSession>;
  /** Recompile intent into a NEW local session; imported evidence/verdicts are never trusted. */
  importState(state: unknown): Promise<ProofReport>;
  authorize(id: string, justifications: readonly MutationJustification[]): Promise<ProofReport>;
  stageProposals(id: string, proposals: readonly ProofProposal[]): Promise<void>;
  dismissProposals(
    id: string,
    decisions: readonly { key: string; reason: string }[],
  ): Promise<ProofReport>;
  close(): void;
}
