# Goal-satisfaction capability matrix

Status: `[EXPERIMENTAL — IMPLEMENTED]`, 2026-10-28. This matrix preceded the
[Goal Satisfaction Engine RFC](./goal-satisfaction-engine.md). It remains an
audit of the existing proof system and the decisions the implementation reused;
it is not an independent correctness claim. Release evidence is in
[14-goal-satisfaction.md](../proof-system/14-goal-satisfaction.md).

Decision legend:

| Decision | Meaning |
| --- | --- |
| **KEEP** | Reuse unchanged; the existing contract is sufficient. |
| **EXTEND** | Additive change to an existing contract, file or function. |
| **BUILD** | New deterministic module **inside an existing package**, behind an existing seam. |
| **DEFER** | Design recorded; no implementation scheduled. |
| **REMOVE-AVOID** | Do not build a competing implementation; reuse the named abstraction. |

## 1. The 29 audited proof-system surfaces

These are the surfaces a goal layer must build on. "State" describes the code as
audited at `9ea06ec`; "Decision" describes what the goal layer does to it.

| # | Capability | Evidence (file · symbol) | State | Decision | Extension / new contract | Rationale |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Change sessions | `packages/core/src/domain/proof.ts` · `ChangeSession`, `ChangeSessionState`; `packages/proof/src/service.ts` · `createProofEngine().begin`; `packages/storage/src/proof-store.ts` · `ProofStore` | ALREADY EXISTS | **EXTEND** | Optional `goalContract?: GoalContract`; derived `goalStatus`, `intentDebt` and coverage are report fields, never new session state. Keep `schemaVersion: 1` until Phase 10. | The durable session is the only correct anchor. A second "goal session" store would fork identity, invalidation and receipts. |
| 2 | Goal capture | `packages/core/src/domain/proof.ts` · `ChangeSession.goal: string`; `service.ts` · `begin` (10,000-char bound) | PARTIAL | **EXTEND** | `GoalContract.goal` remains the headline; `DesiredOutcome[]` and `AcceptanceCriterion[]` carry structured intent. `ChangeSession.goal` stays for compatibility and is checked against the contract. | One free-text string cannot express outcomes, preservation, prohibitions, non-goals or unresolved decisions. |
| 3 | Requirement extraction | `packages/proof/src/service.ts` · `compile`; `packages/proof/src/compiler.ts` · `proposeObligations`; `ProofNode.kind === "Requirement"` | PARTIAL | **EXTEND** | An adopted `AcceptanceCriterion` deterministically compiles to one or more `Requirement`/`ProofObligation` nodes and stores `obligationIds`. Model proposals stay `model-proposed` until adopted. | Reuse the existing DAG, versioning and acyclicity checks; do not add a parallel obligation model. |
| 4 | Constraint extraction | `ProofNode.kind === "Constraint"`; `service.ts` · `validateJustifications` | PARTIAL | **EXTEND** | `PreserveContract` compiles to `Invariant` + `public-contract-unchanged`; `ForbiddenOutcome` compiles to `Constraint` + a deterministic detector. | Constraints already exist; the gap is a declared, adoptable intent record, not a new node kind. |
| 5 | Change boundary and authorization | `ChangeSession.boundary`, `.authorizedPaths`; `service.ts` · `scopes`; `truth.ts` · `unjustifiedMutations` | ALREADY EXISTS | **EXTEND** | `GoalContract.boundary` must equal the session boundary; drift is intent debt. Authorization remains path-level and explicit. | Boundary enforcement already works. The goal layer must detect when the contract and the session disagree, not weaken authorization. |
| 6 | Proof compiler | `service.ts` · `compile` (ID hashing, version bump, cycle check, weakening rejection); `compiler.ts` · `proposeObligations` | ALREADY EXISTS | **EXTEND** | New `proposeGoalContract` in `packages/proof/src/goal-compiler.ts` with the same untrusted-output discipline; returns a draft, never adopted criteria. | The compiler boundary is already the right place to separate model interpretation from deterministic validation. |
| 7 | Proof obligations and verification actions | `ProofObligation`, `VerificationAction`, `VerificationResult`; `service.ts` · `verify` | ALREADY EXISTS | **EXTEND** | Criterion-linked obligations carry `criterionIds`; the action union gains `text-present` and a TS-family `symbol-exists` predicate in Phase 7. | Obligations already execute safely. The goal layer needs deterministic falsifiers, not a new execution engine. |
| 8 | Temporal proof graph | `packages/proof/src/graph.ts` · `projectProofGraph`; `TemporalProofGraph` | ALREADY EXISTS | **EXTEND** | `projectGoalCoverage(session)` adds Goal/Outcome/Criterion/Preserve/Forbidden/NonGoal/Decision nodes and `requires`/`preserves`/`forbids`/`excludes`/`decides`/`verified_by` edges to the same projection output. | The graph is already a projection of authoritative state. Extending it preserves the "no second graph DB" rule. |
| 9 | Evidence | `Evidence`, `VerificationResult`; `service.ts` · `verify`; `truth.ts` · `invalidateEvidence` | ALREADY EXISTS | **EXTEND** | Optional `criterionIds`, `outcomeKind`, `adequacy`; a deterministic `assessAdequacy()` in `goal-truth.ts`. | Evidence already has revision, scope, level and freshness. Adequacy is a derived judgement over those fields, not a new evidence store. |
| 10 | Claims, assumptions, unknowns | `ProofNode.kind` `Claim` / `Assumption` / `Unknown`; default minimum levels in `compile` | ALREADY EXISTS | **KEEP** | Used unchanged for ambiguity, assumptions and unresolved interpretation. | The kinds already express uncertainty. Open decisions are intent-level, but an `Unknown` node remains the proof-level representation. |
| 11 | Invariants | `Invariant`; `truth.ts` · guarantee ceiling includes requirements and invariants | ALREADY EXISTS | **KEEP** | Preserve contracts map onto invariants. | Invariants already participate in the AND evaluation and ceiling. |
| 12 | Revision evidence | `RepositoryRevision`, `RepositoryArtifact.contracts`, `semanticHash`; `packages/sdk/src/proof/semantic.ts` · `semanticHash`, `publicContracts` | ALREADY EXISTS | **KEEP** | Preserve contracts bind to `contracts[].id` + `hash` at the adopted baseline revision. | This is the only conservative, deterministic contract identity available. No new semantic-equivalence claim is added. |
| 13 | Automatic invalidation | `truth.ts` · `changedPaths`, `topologyChanges`, `invalidateEvidence`; `service.ts` · `observe` | ALREADY EXISTS | **EXTEND** | Criterion revision, contract adoption and boundary changes stale linked evidence with explicit reasons (`goal-contract-changed`, `criterion-revised`, `preserve-baseline-changed`). | Monotonic staleness already exists; the goal layer must join it rather than maintain a second freshness clock. |
| 14 | Proof propagation | `truth.ts` · `evaluateProof` (AND dependencies, latest evidence by node/version) | ALREADY EXISTS | **KEEP** | Criterion status derives from linked obligation states; it does not re-implement propagation. | The recursive AND semantics are already tested and conservative. |
| 15 | Proof debt | `ProofDebtItem`; debt synthesis in `evaluateProof` | ALREADY EXISTS | **EXTEND** | A separate `IntentDebtItem[]` with `IntentDebtKind`. Never merge intent gaps into proof debt and never call either a completion percentage. | Intent gaps (missing criterion, ambiguity, unadopted outcome) are different failures from unsupported obligations. Conflating them hides the more important gap. |
| 16 | Blindspots | `Blindspot`; expected-investigation-set BFS in `truth.ts` | ALREADY EXISTS | **EXTEND** | `GoalBlindspot`: an affected artifact not covered by any adopted criterion's evidence scope. Reuse the existing BFS and coupling ranking. | Artifact-level blindspots are necessary but not sufficient; goal coverage needs the criterion projection. |
| 17 | Unintended semantic change | `truth.ts` · `semanticChanges`, `unjustifiedMutations`, `contractChanges` | ALREADY EXISTS | **EXTEND** | `UnintendedOutcome`: a structural conflict with a preserve contract, forbidden outcome or non-goal. Semantic equivalence remains explicitly unsupported. | Hash/contract deltas are deterministic. Do not infer behavioral intent from text. |
| 18 | Semantic change budget | `ChangeSession.semanticChangeBudget`; debt on exceed | ALREADY EXISTS | **KEEP** | Per-contract budgets are deferred. | The existing coarse budget already fails closed. A second budget model is unnecessary complexity. |
| 19 | Guarantee ceiling | `truth.ts` · `guaranteeCeiling` (min over requirements/invariants) | ALREADY EXISTS | **EXTEND** | `GoalGuaranteeCeiling` = min over adopted MUST criteria, their evidence adequacy, linked proof ceiling, language/parse limitations and verification catalog. | The ceiling is the honest upper bound. It must include intent-level gaps, otherwise a lexical check can look like behavioral proof. |
| 20 | Verification planner | `truth.ts` · `nextActions`, `settles`, `requiresAdoption` | ALREADY EXISTS | **EXTEND** | Add `falsifies: string[]` and `coversCriteria: string[]`; rank forbidden/preserve falsifiers before confirmations. Reuse the same cost classes. | The planner already ranks by severity, falsification and settled nodes per cost. The goal layer only adds the criterion projection. |
| 21 | Falsification planner | `truth.ts` · `nextActions`; `text-absent`, `public-contract-unchanged`, command-failure evidence | PARTIAL | **BUILD** | New deterministic `falsificationPlan(session)`: `text-present`, TS-family `symbol-exists`, preserve-contract delta, failed approved test, runtime predicate failure. No test synthesis. | Falsification is the highest-leverage way to avoid false satisfaction, but it is currently implicit in a few action kinds. |
| 22 | Proof levels | `ProofLevel` 0–5; `minimumLevel` per node | ALREADY EXISTS | **KEEP** | Criteria carry `requiredLevel`; no new level scale. | The ordinal policy vocabulary is sufficient. A second scale would be incomparable. |
| 23 | Change receipts | `ChangeReceipt`; `service.ts` · `prove` | ALREADY EXISTS | **EXTEND** | `GoalSatisfactionReceipt extends ChangeReceipt` with `testStatus`, `proofStatus`, `goalStatus`, `intentDebt`, `coverage`, `blockers`. Keep `completion` meaning **proof** completion. | Receipts are the delivery contract. Overloading `completion` to mean goal satisfaction would silently change every existing consumer. |
| 24 | Portable change state | `ProofPort.exportState` / `importState`; `packages/core/src/domain/control-plane.ts` · `HandoffState`; `packages/sdk/src/context-integration/handoff.ts` · `renderHandoffPrompt`; `task-ledger.ts` | ALREADY EXISTS | **EXTEND** | Export `goalContract` and intent-debt reasons; import revalidates and requires local re-adoption. Imported `goalStatus` is never trusted. | Rebinding already exists. Goal state must follow the same "intent travels, verdicts do not" rule. |
| 25 | Semantic coupling | `packages/proof/src/coupling.ts` · `rankCoupling`; `CouplingSignal` | ALREADY EXISTS | **KEEP** | May rank uninvestigated criterion candidates; never establishes truth. | Advisory ranking is already explicitly separated from evidence. |
| 26 | Historical co-change | `packages/sdk/src/proof/history.ts` · `historicalCoupling` | ALREADY EXISTS | **KEEP** | No change. | Existing bounded, opt-in history is sufficient for investigation ranking. |
| 27 | Agent and proof failure memory | `ProofStore.recordMemory`, `couplingMemory`; `ProofSDK.recordAgentMiss` | ALREADY EXISTS | **KEEP** | No change. | Memory is advisory and bounded. It must never set adequacy or goal status. |
| 28 | Proposal adoption and human review | `ProofProposal`; `stageProposals`, `dismissProposals`, `proposalDecisions`; `ProofSDK.propose`; `compiler.ts` provenance defaults | ALREADY EXISTS | **EXTEND** | `GoalContractDraft` is staged through the same proposal/decision mechanism. Adoption is an explicit, separate operation; rejection requires a bounded reason. | Reusing this mechanic is the cheapest way to keep "LLM proposes, human adopts, deterministic owns truth". |
| 29 | CLI lifecycle, MCP profile and control plane | `apps/cli/src/commands/prove.ts` · `registerProve`; `packages/mcp/src/proof.ts` · `PROOF_TOOL_NAMES`, `registerProofTools`; `packages/sdk/src/context-integration/control-plane.ts` · `options.proof` | ALREADY EXISTS | **EXTEND** | Add `goals`, `adopt`, `coverage` operations to `atlas prove`; optionally add `--require-goal`. Extend the existing seven MCP tool inputs/projections. No new top-level command, no new tool. | The lifecycle and the seven-tool budget are deliberate product constraints. The goal layer must fit them, not expand them. |

### Matrix summary

| Decision | Count | Surfaces |
| --- | --- | --- |
| **KEEP** | 9 | 10, 11, 12, 14, 18, 22, 25, 26, 27 |
| **EXTEND** | 19 | 1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 15, 16, 17, 19, 20, 23, 24, 28, 29 |
| **BUILD** | 1 | 21 (thin deterministic planner, existing package) |
| **DEFER** | 0 | — |
| **REMOVE-AVOID** | — | Any second proof store, second graph DB, new agent router, new package, new MCP tool, or model-owned verdict |

## 2. New goal-satisfaction surfaces

These do not exist today. Every **BUILD** lands inside `packages/proof` (or
`packages/core` for contracts) unless stated otherwise. No new package, database
or graph store is proposed.

| Surface | Proposed type / function | Decision | Priority | Reuses | Notes |
| --- | --- | --- | --- | --- | --- |
| Goal contract | `GoalContract`, `DesiredOutcome` | **BUILD** | P0 | `ChangeSession`, proposal adoption | Additive, optional. |
| Acceptance criteria | `AcceptanceCriterion`, `CriterionAssertion` | **BUILD** | P0 | `Requirement`, `ProofObligation` | Each adopted criterion compiles to existing nodes. |
| Preserve contracts | `PreserveContract` | **BUILD** | P1 | `RepositoryArtifact.contracts`, `publicContracts`, `Invariant` | Binds to a baseline contract hash. |
| Forbidden outcomes | `ForbiddenOutcome` | **BUILD** | P1 | `Constraint`, `text-absent` / `text-present` | Deterministic detector only. |
| Non-goals | `NonGoal` | **BUILD** | P1 | `boundary`, `authorizedPaths` | Structural overlap checks only. |
| Open decisions | `OpenDecision` | **BUILD** | P0 | `Unknown`, proposal decisions | A blocking open decision forces `UNDETERMINED`. |
| Goal draft compiler | `proposeGoalContract` | **BUILD** | P0 | `proposeObligations`, usage tracking | Untrusted output; no actions, levels or verdicts. |
| Human adoption | `adoptGoalContract`, `dismissGoalDraft` | **BUILD** | P0 | `stageProposals`, `dismissProposals` | Explicit; stales evidence; records reasons. |
| Intent debt | `IntentDebtItem`, `IntentDebtKind` | **BUILD** | P0 | Proof-debt pattern | Separate from `ProofDebtItem`. |
| Goal coverage graph | `projectGoalCoverage` | **EXTEND** | P1 | `projectProofGraph` | Projection only; no new store. |
| Goal coverage output | `GoalCoverageSummary` | **BUILD** | P1 | coverage graph | Counts and statuses, no percentages. |
| Intent drift | `IntentDrift`, `IntentDriftKind` | **BUILD** | P1 | invalidation, `proposalDecisions` | Detects weakened/expanded intent. |
| Unintended outcomes | `UnintendedOutcome` | **EXTEND** | P1 | `unjustifiedMutations`, `contractChanges` | Structural only. |
| Behavioral differential | `BehavioralDifferential` | **BUILD** | P2 | `semanticHash`, `publicContracts`, approved commands | Conservative; `unknown` is the default. |
| Spec conflict | `SpecConflict`, `SpecConflictKind` | **BUILD** | P1 | action targets, contract hashes, boundaries | Structural conflicts only; semantic conflicts become open decisions. |
| Goal blindspots | `GoalBlindspot` | **EXTEND** | P1 | `Blindspot` BFS | Criterion-scope projection. |
| Scenario graph | `ScenarioGraph` | **DEFER** | P2 | — | Optional; not needed for the status machine. |
| Outcome evidence kinds | `OutcomeEvidenceKind` | **EXTEND** | P0 | `Evidence` | Optional fields on existing evidence. |
| Evidence adequacy | `EvidenceAdequacy`, `assessAdequacy` | **BUILD** | P0 | assertion × action matrix | Deterministic; never model-set. |
| Goal guarantee ceiling | `GoalGuaranteeCeiling` | **EXTEND** | P0 | `guaranteeCeiling` | Includes intent gaps and limitations. |
| Counterexample search | `CounterexampleSearchResult` | **EXTEND** | P1 | `nextActions`, actions | Deterministic predicates only. |
| Falsification planner | `FalsificationPlan` | **EXTEND** | P1 | `nextActions.settles` | Adds `falsifies` / `coversCriteria`. |
| Verification economy | `VerificationEconomyPlan` | **DEFER** | P2 | `nextActions` cost classes | Design only; no execution in this RFC. |
| Goal status machine | `evaluateGoalSatisfaction` | **BUILD** | P0 | `evaluateProof`, intent debt, coverage | Deterministic; four states; no probabilities. |
| Three-status UX | `TestStatusSummary`, `ProofStatusSummary`, `GoalSatisfactionStatus` | **BUILD** | P0 | receipt/CLI/MCP projections | Test ≠ proof ≠ goal, always displayed separately. |
| Goal receipt | `GoalSatisfactionReceipt` | **EXTEND** | P0 | `ChangeReceipt` | Keeps legacy `completion`. |
| MCP surface | extended inputs/projection | **EXTEND** | P1 | seven tools | No new tools. |
| CLI lifecycle | `atlas prove goals/adopt/coverage` | **EXTEND** | P1 | `registerProve` | No new top-level command. |
| Migration | schema decision + dual read | **BUILD** | P0 | `ProofStore.get/put` | Additive, fail-closed. |
| Benchmark | FGSR corpus + harness | **BUILD** | P0 | mutation-evaluation pattern | False Goal-Satisfaction Rate is the gate. |

## 3. Explicitly rejected (REMOVE-AVOID)

| Rejected approach | Why |
| --- | --- |
| A second `goal.db` / `GoalStore` | Splits session identity, invalidation and receipts. Goal state must project from the existing session document. |
| A second graph database or `GoalGraphService` | `projectProofGraph` is already a projection. Add nodes/edges, not infrastructure. |
| A new `atlas goal` top-level command | Violates the single coherent `atlas prove` lifecycle and the documented command surface. |
| New MCP tools (`atlas_goal_*`) | Violates the seven-tool budget and multiplies schema drift. Extend existing inputs. |
| A new package `@prof-bilal/atlas-goal` | No ownership need; `packages/proof` already owns deterministic proof evaluation. |
| An LLM adjudicator for goal status | Violates ADR-028: models never establish completion. |
| Probability/confidence scores for goal satisfaction | The repository deliberately avoids fake precision; use four discrete states plus reasons. |
| Auto-adoption of model-proposed criteria | Destroys the human adoption boundary and the audit trail. |
| Conflating `completion: "proven"` with goal satisfaction | Existing consumers rely on the current meaning. Add a separate `goalStatus`. |
| Browser/benchmark server infrastructure | Out of scope per ADR-023; the benchmark is an offline test harness. |
