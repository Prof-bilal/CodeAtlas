# RFC: Goal Satisfaction Engine

Status: `[EXPERIMENTAL — PHASES 0–12 IMPLEMENTED]`, 2026-10-28
Decision record: [ADR-029](../decisions/ADR-029-goal-satisfaction-layer.md)
Preceding audit: [Goal-satisfaction capability matrix](./goal-satisfaction-matrix.md)
Governing prior art: [ADR-028](../decisions/ADR-028-temporal-proof-kernel.md),
[proof-system index](../proof-system/README.md)

Implementation status: all phases (0–12) are implemented behind the existing
`ProofPort` / `GoalPort` seam, with additive contracts in `packages/core`, the
evaluator and adoption lifecycle in `packages/proof`, composition in
`packages/sdk`, and delivery through `atlas prove` and the existing seven-tool
MCP profile. This includes goal status, intent debt, coverage and blindspots,
structural drift/specification conflicts, the conservative behavioral
differential, the goal receipt, export v2, and the offline benchmark.

The layer is **`[EXPERIMENTAL]`**, not a claim of general goal correctness. Its
release evidence is the deterministic 27-case corpus in
`packages/proof/tests/goal-satisfaction-evaluation.test.ts`: FGSR `0`, FUR `0`,
coverage-gap recall `1`, no oracle mismatches and deterministic output. That is
an offline, hand-authored oracle, not live-agent or production evidence. The
default proof receipt and exit status are unchanged; goal gating is opt-in via
`--require-goal`. See
[implementation and release evidence](../proof-system/14-goal-satisfaction.md)
for the exact commands, limits and non-goals.

---

## 1. Summary and decision

CodeAtlas already has a **mutation-aware change proof system**: explicit
obligations, revision-bound evidence, monotonic invalidation, proof debt,
guarantee ceilings and receipts. That system answers a narrow question:

> Given an explicit set of proof obligations, does the observed repository state
> support them at the declared levels?

It does **not** answer the question a user actually asks:

> Did this change achieve the goal, without breaking what had to be preserved?

This RFC proposes a **Goal Satisfaction Engine (GSE)** as an additive layer over
the existing proof kernel. It introduces:

- a structured `GoalContract` (desired outcomes, acceptance criteria, preserve
  contracts, forbidden outcomes, non-goals, open decisions);
- a conservative **acceptance-criteria compiler** where a model may propose a
  draft and a human must explicitly adopt it;
- **intent debt**, separate from proof debt;
- a **goal coverage projection** over the existing `projectProofGraph`, with no
  new graph store;
- **evidence adequacy**, so a passing test cannot silently stand in for a
  behavioral goal;
- a deterministic **goal satisfaction state machine** with exactly four states:
  `SATISFIED`, `PARTIALLY_SATISFIED`, `UNSATISFIED`, `UNDETERMINED`;
- a **three-status UX** that always shows test status, proof status and goal
  status separately;
- a `GoalSatisfactionReceipt` that extends `ChangeReceipt` without changing the
  meaning of its existing `completion` field;
- a benchmark whose critical safety metric is **False Goal-Satisfaction Rate**.

**Decision:** the layer, its invariants and the phased plan in §20 are accepted
and implemented as `[EXPERIMENTAL]`; see
[ADR-029](../decisions/ADR-029-goal-satisfaction-layer.md).

The central invariant:

> Tests are execution facts. Proof is obligation support under explicit policy.
> Goal satisfaction is an adopted intent judgement over both. None of the three
> may be silently substituted for another.

## 2. Scope, non-goals, and claims discipline

### 2.1 In scope

- Structuring intent for a single change session in a single repository.
- Compiling adopted criteria into existing proof obligations.
- Deterministically evaluating whether adopted criteria are satisfied.
- Exposing gaps (intent debt, coverage gaps, blindspots, drift, conflicts).
- Receipts and portable handoff that preserve intent but never imported verdicts.
- Minimal CLI/MCP surface changes inside the existing `atlas prove` lifecycle and
  the existing seven-tool MCP profile.

### 2.2 Out of scope

- General program correctness or formal verification.
- Semantic equivalence of arbitrary code.
- Automatic test synthesis or autonomous repair.
- Multi-repository or organization-wide goal portfolios.
- A new agent router, a new package, a new database, a new graph store, or new
  MCP tools.
- Probability, confidence or "percent complete" scores.
- Letting a model decide that a criterion is satisfied or a goal is complete.

### 2.3 Claims discipline

The RFC uses the repository's vocabulary:

| Tag | Meaning in this document |
| --- | --- |
| **[IMPLEMENTED]** | Exists and is tested in the audited code. |
| **[PARTIAL]** | Exists with known gaps. |
| **[EXPERIMENTAL]** | Exists but is not a stability guarantee. |
| **[PLANNED]** | Designed here; no code. |
| **[DEFERRED]** | Deliberately excluded from this RFC's phases. |

Nothing in this RFC may be cited as evidence that the goal layer exists. The
matrix is the audit; this document is the proposal.

## 3. Audit baseline and method

Audited at commit `9ea06ec` (2026-10-28), on a clean working tree, against the
repository's own rules in `AGENTS.md` and `docs/contributing/CHANGE_POLICY.md`.

Method:

1. Read the proof contracts, ports, implementation, storage, SDK composition,
   MCP profile, CLI lifecycle and their tests.
2. Read all 13 `docs/proof-system/*.md` documents and ADR-028.
3. Read adjacent systems that must be reused: the control plane, work packet,
   task ledger, handoff, verifier, graph and context SDK.
4. For each of the 29 audited surfaces, record exact files/symbols, current
   state and a KEEP/EXTEND/BUILD/DEFER decision in the
   [matrix](./goal-satisfaction-matrix.md).
5. Only then design upward from the existing seams.

Files inspected for the audit include:

- `packages/core/src/domain/proof.ts`, `packages/core/src/ports/proof.port.ts`
- `packages/proof/src/{service,truth,compiler,coupling,graph,index}.ts`
- `packages/storage/src/proof-store.ts`
- `packages/sdk/src/proof/{index,semantic,history}.ts`
- `packages/sdk/src/context-integration/{control-plane,work-packet,task-ledger,handoff}.ts`
- `packages/verifier/src/*`
- `packages/mcp/src/proof.ts`, `packages/mcp/src/server.ts`
- `apps/cli/src/commands/prove.ts`
- `packages/proof/tests/*`, `packages/sdk/tests/proof-lifecycle.test.ts`,
  `packages/mcp/tests/proof.test.ts`, `apps/cli/tests/prove.test.ts`

The audit found **no existing** `GoalContract`, acceptance-criterion, intent-debt,
evidence-adequacy, drift, conflict or goal-status implementation. The only intent
representation is `ChangeSession.goal: string`.

## 4. What exists today

### 4.1 The proof kernel

`packages/proof/src/service.ts` `createProofEngine` compiles bounded proposals
into a versioned, acyclic DAG (`compile`), observes revisions through injected
ports (`observe`), executes only stored actions (`verify`), and produces receipts
(`prove`). `truth.ts` `evaluateProof` computes AND support, staleness,
contradiction, debt, blindspots, next actions and the guarantee ceiling.

`packages/core/src/domain/proof.ts` defines the whole vocabulary: `ProofLevel`
0–5, `ProofStatus`, `ProofNodeKind` (`Requirement`, `Constraint`, `Invariant`,
`Claim`, `Assumption`, `Unknown`, `ProofObligation`), `RepositoryRevision`,
`Evidence`, `ChangeReceipt` and `ChangeSession`.

Persistence is a single JSON session document per change in
`packages/storage/src/proof-store.ts` (`ProofSessions`, immutable gzip
`ProofHistory`, advisory `ProofMemoryEvents`, `ProofLeases`), schema v3.

Delivery is `packages/sdk/src/proof/index.ts` (`createProofSDK`), a seven-tool
MCP profile (`packages/mcp/src/proof.ts`), and `atlas prove`
(`apps/cli/src/commands/prove.ts`).

### 4.2 What the completion gate actually means

`prove` returns `completion: "proven"` when:

- at least one `Requirement` node exists;
- every `Requirement` is `supported`;
- no CRITICAL/HIGH debt remains;
- the observation is complete.

That is **proof completion under explicit obligations**. It is not goal
satisfaction. A session with a single existential `artifact-exists` requirement
can be `proven` while missing the user's actual outcomes. ADR-028 is explicit
that models never establish completion, and the proof docs are explicit that the
receipt is not universal correctness.

### 4.3 Adjacent systems that already solve parts of the problem

- **Proposal/adoption:** `stageProposals`, `dismissProposals`,
  `proposalDecisions`, `ProofProposal.provenance`, `ProofSDK.propose`. Model
  output is already untrusted and staged.
- **Preserve mechanics:** `RepositoryArtifact.contracts`,
  `publicContracts()`, `public-contract-unchanged`, `contractChanges`.
- **Validation/falsification:** `artifact-exists`, `text-absent`, approved
  commands (`L2`/`L3`/`L4`), runtime probes (`L5`).
- **Impact and blindspots:** dependency projection in `observe`, reverse
  closure in `invalidateEvidence`, expected-investigation-set BFS in
  `evaluateProof`.
- **Portable intent:** `exportState`/`importState`, `HandoffState`,
  `renderHandoffPrompt`, task ledger.
- **Human control:** `--approve-commands`, `approved: true`, path authorization,
  explicit justifications.

The goal layer must reuse these, not replace them.

## 5. Gap analysis: test status ≠ proof status ≠ goal status

| # | Gap | Evidence in current code | Consequence |
| --- | --- | --- | --- |
| G1 | No structured goal | `ChangeSession.goal: string` | Acceptance, preservation, prohibition and ambiguity are unrepresentable. |
| G2 | Tests can look like proof | `atlas verify` (claim verifier) and control-plane `complete` are separate; `prove` only sees obligations | A green suite or an agent exit code can be socially read as "done", even though the receipt never said so. |
| G3 | Obligations are the only intent | `compile`; default `goal` requirement | Nothing checks that the obligations *cover* what the user wanted. |
| G4 | No declared preservation | `publicContracts` detects changes; no adopted preserve contract | A contract change is reported, but not judged against an explicit "must not change" intent. |
| G5 | No forbidden outcomes | `text-absent` is an action, not an intent record | Prohibitions exist only if someone happens to encode one obligation. |
| G6 | No non-goals or open decisions | No types | Scope creep and ambiguity are invisible. |
| G7 | Intent gaps collapse into proof debt | `ProofDebtItem` only | A missing criterion looks like an unsupported node. The more important failure is hidden. |
| G8 | Blindspots are artifact-level | `Blindspot` from `evaluateProof` | No mapping from affected artifacts to criteria; coverage is unmeasured. |
| G9 | No drift detection | Proposal decisions exist; no staleness on goal text | Criteria can be weakened after evidence without reopening the judgement. |
| G10 | No goal status | `ChangeReceipt.completion` is proof completion | There is no honest answer to "was the goal met?" |
| G11 | No adequacy model | `minimumLevel` is per node | A passing test at L3 can support a "behavior" requirement even when its assertions do not cover the criterion's scope. |
| G12 | No false-satisfaction benchmark | `mutation-evaluation.test.ts` measures stale/proven, not goal truth | There is no safety metric for the new claim. |

The gap is **not** "add more checks". It is "represent intent explicitly, map it
to the existing checks honestly, and refuse to answer when the mapping is
inadequate".

## 6. The three-status model

Every goal-aware surface reports three independent statuses.

### 6.1 Test status (execution facts)

```ts
export interface TestStatusSummary {
  readonly commands: readonly {
    key: string;
    level: 2 | 3 | 4;
    result: "pass" | "fail" | "unknown";
    revision: string;
    stale: boolean;
  }[];
  readonly outcome: "passing" | "failing" | "mixed" | "not-run" | "stale";
}
```

Derived only from executed, approved commands recorded as evidence. A test status
is never promoted to a proof or goal status.

### 6.2 Proof status (obligation support)

```ts
export interface ProofStatusSummary {
  readonly nodes: readonly ProofNodeState[];
  readonly completion: "proven" | "not-proven" | "blocked";
  readonly ceiling: ProofLevel;
  readonly debt: readonly ProofDebtItem[];
}
```

Exactly the existing `ProofReport` projection. `completion` keeps its current
meaning.

### 6.3 Goal status (adopted-intent judgement)

```ts
export type GoalSatisfactionStatus =
  | "SATISFIED"
  | "PARTIALLY_SATISFIED"
  | "UNSATISFIED"
  | "UNDETERMINED";
```

Definitions:

- **SATISFIED** — every adopted MUST criterion is supported by *sufficient*
  evidence at or above its required level; every MUST outcome is mapped; no
  forbidden outcome is detected; every preserve contract is unchanged or
  explicitly justified; no blocking intent debt or decision remains and no
  blocking proof debt remains on criterion-linked obligations;
  the repository observation is complete; the goal guarantee ceiling meets the
  policy requirement.
- **PARTIALLY_SATISFIED** — no contradiction and no blocking unknown, but at
  least one MUST criterion has only partial evidence/level. Unsupported SHOULD
  criteria are reported in coverage but do not downgrade the MUST verdict.
- **UNSATISFIED** — a MUST criterion is contradicted, a forbidden outcome is
  detected, or a preserve contract changed without an adopted justification.
- **UNDETERMINED** — the honest default: no adopted contract, no MUST outcome,
  an open blocking decision, an ambiguous/missing criterion, stale or unknown
  evidence, incomplete observation, or blocking linked proof debt.

Precedence is evaluated in this order: **UNSATISFIED → UNDETERMINED →
PARTIALLY_SATISFIED → SATISFIED**. A detected failure is never masked by an
unknown elsewhere.

The three statuses are always displayed together. No surface may render a green
test as a green goal.

## 7. Goal contract and intent records

The contract is a bounded, versioned document stored inside `ChangeSession`.
It is additive and optional.

```ts
export interface GoalContract {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly goal: string;
  readonly desiredOutcomes: readonly DesiredOutcome[];
  readonly criteria: readonly AcceptanceCriterion[];
  readonly preserveContracts: readonly PreserveContract[];
  readonly forbiddenOutcomes: readonly ForbiddenOutcome[];
  readonly nonGoals: readonly NonGoal[];
  readonly openDecisions: readonly OpenDecision[];
  readonly boundary: readonly string[];
  readonly authorizedPaths: readonly string[];
  readonly adoptedAtRevision: string;
  readonly provenance: "user" | "model-proposed" | "mixed";
}

export interface DesiredOutcome {
  readonly id: string;
  readonly key: string;
  readonly statement: string;
  readonly priority: "MUST" | "SHOULD" | "MAY";
  readonly criterionIds: readonly string[];
  readonly provenance: "user" | "model-proposed" | "derived";
}

export type CriterionAssertion =
  | "artifact-presence"
  | "literal-presence"
  | "literal-absence"
  | "symbol-presence"
  | "contract-unchanged"
  | "type-sound"
  | "build-succeeds"
  | "test-suite-passes"
  | "runtime-behavior"
  | "review-only";

export interface AcceptanceCriterion {
  readonly id: string;
  readonly key: string;
  readonly version: number;
  readonly statement: string;
  readonly assertion: CriterionAssertion;
  readonly severity: ProofSeverity;
  readonly requiredLevel: ProofLevel;
  readonly outcomeIds: readonly string[];
  readonly dependsOn: readonly string[];
  readonly provenance: "user" | "model-proposed" | "derived";
  readonly adoptedAtRevision: string;
  readonly obligationIds: readonly string[];
  readonly evidenceKinds: readonly OutcomeEvidenceKind[];
  readonly limitations?: readonly string[];
}

export interface PreserveContract {
  readonly id: string;
  readonly artifact: string;
  readonly contractId: string;
  readonly name: string;
  readonly baselineHash: string;
  readonly severity: ProofSeverity;
  readonly provenance: "user" | "model-proposed" | "derived";
  readonly obligationIds: readonly string[];
}

export interface ForbiddenOutcome {
  readonly id: string;
  readonly statement: string;
  readonly detector: VerificationAction;
  readonly severity: ProofSeverity;
  readonly provenance: "user" | "model-proposed" | "derived";
}

// `detector` uses the existing `VerificationAction` union at Phase 0.
// Phase 7 extends that union with the read-only `text-present` and TS-family
// `symbol-exists` predicates; until then a criterion that needs them evaluates
// to UNKNOWN rather than guessing.

export interface NonGoal {
  readonly id: string;
  readonly statement: string;
  readonly reason: string;
  readonly paths: readonly string[];
}

export interface OpenDecision {
  readonly id: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly status: "open" | "decided" | "deferred";
  readonly blocking: boolean;
  readonly blocks: readonly string[];
  readonly decision?: string;
  readonly decidedBy?: string;
  readonly decidedAtRevision?: string;
}
```

Design rules:

1. **`assertion` is the hinge.** A criterion must declare *what kind of claim*
   it is. This is what makes evidence adequacy deterministic. A `statement` alone
   is never enough to accept evidence.
2. **IDs are deterministic.** `id = digest(sessionId, "criterion", key)`,
   mirroring `compile`'s node identity. `version` increments on adoption of a
   revision; a version change stales linked evidence.
3. **Bounds.** At most 64 criteria, 128 outcomes, 64 preserve contracts, 64
   forbidden outcomes, 64 non-goals, 32 open decisions, 10,000 characters per
   statement. Exceeding a bound fails closed.
4. **No actions in model output.** `ForbiddenOutcome.detector` and criterion
   `obligationIds` are assigned by deterministic compilation after adoption. A
   model draft may suggest a detector *kind*, but never executable text.
5. **`boundary` must equal the session boundary.** A mismatch is
   `boundary-mismatch` intent debt, not a silent merge.
6. **`ChangeSession.goal` remains.** It is checked against `GoalContract.goal`;
   divergence is `goal-text-diverged` drift.

## 8. Acceptance criteria compiler and adoption

### 8.1 The split

| Responsibility | Owner | Never allowed |
| --- | --- | --- |
| Read repository context and propose candidate outcomes/criteria/risks | Model (`proposeGoalContract`) | Set adoption, status, level, severity or adequacy |
| Validate shape, bound fields, assign IDs, link to obligations | Deterministic compiler | Invent a threshold or a requirement the user did not adopt |
| Decide that the criteria are the right criteria | Human (or explicit host policy) | Happen implicitly from a model response |
| Evaluate evidence and produce status | Deterministic evaluator | Be overridden by model text |

### 8.2 Draft type

```ts
export interface GoalContractDraft {
  readonly schemaVersion: 1;
  readonly goal: string;
  readonly desiredOutcomes: readonly {
    key: string;
    statement: string;
    priority: "MUST" | "SHOULD" | "MAY";
    criterionKeys: readonly string[];
  }[];
  readonly criteria: readonly {
    key: string;
    statement: string;
    assertion: CriterionAssertion;
    outcomeKeys: readonly string[];
    dependsOn?: readonly string[];
    evidenceKinds?: readonly OutcomeEvidenceKind[];
  }[];
  readonly preserveCandidates: readonly {
    artifact: string;
    contractId?: string;
    name?: string;
  }[];
  readonly forbiddenCandidates: readonly {
    statement: string;
    detectorKind: "text-present" | "artifact-exists" | "symbol-exists";
    target: string;
    paths: readonly string[];
  }[];
  readonly nonGoals: readonly { statement: string; reason: string; paths: readonly string[] }[];
  readonly openQuestions: readonly {
    question: string;
    options: readonly string[];
    blocks: readonly string[];
  }[];
  readonly limitations: readonly string[];
}
```

`proposeGoalContract` reuses `proposeObligations`'s discipline:

- input packet is bounded (64,000 chars) and built by the existing
  `buildWorkPacket`; repository text is untrusted data;
- output must be JSON with an exact allowlist of fields;
- at most 32 criteria per draft;
- no `action`, `command`, `level`, `severity`, `status`, `evidence` or `verdict`
  fields;
- numeric thresholds (timeouts, percentages, counts, rates) are never produced or
  defaulted by the compiler; if an outcome needs one, it becomes an
  `OpenDecision` and blocks the affected MUST criterion until a human supplies
  the value;
- invalid JSON, unknown fields, duplicate keys or oversized strings fail closed;
- the provider call is usage-tracked through `withUsageTracking`, exactly like
  proof proposals.

### 8.3 Adoption

Adoption reuses the existing proposal/decision mechanics rather than inventing a
second review system:

- `stageGoalDraft(changeId, draft)` stores `proposedGoal` only if no draft is
  already staged (mirroring `stageProposals`).
- `adoptGoalContract(changeId, { keys, decisions, approved })` requires
  `approved === true`; it compiles the selected keys into a new `GoalContract`
  version, resolves outcome/criterion links and criterion→obligation links, and
  stales all linked evidence with `goal-contract-changed`.
- `dismissGoalDraft(changeId, decisions)` requires a bounded reason per key,
  mirroring `dismissProposals`, and appends to `goalProposalDecisions`.
- A model draft is never auto-adopted, even when every field is valid.
- Adoption is idempotent only for an identical contract content hash; otherwise
  it creates a new version.

Adoption is the **only** operation that can create an adopted criterion. This is
the single most important safety property of the layer.

## 9. Intent debt

Intent debt is unresolved *intent* work, not unsupported proof work.

```ts
export type IntentDebtKind =
  | "missing-criterion"
  | "ambiguous-criterion"
  | "unadopted-draft"
  | "unmapped-outcome"
  | "open-decision"
  | "unsupported-preserve"
  | "unfalsifiable-forbidden"
  | "goal-contract-stale"
  | "intent-drift"
  | "spec-conflict"
  | "inadequate-evidence"
  | "non-goal-overlap"
  | "boundary-mismatch"
  | "no-must-outcome";

export interface IntentDebtItem {
  readonly id: string;
  readonly kind: IntentDebtKind;
  readonly severity: ProofSeverity;
  readonly subject: string;
  readonly reason: string;
  readonly blocks: readonly string[];
}
```

Rules:

- Intent debt and proof debt are separate arrays in the report and the receipt.
  They may both block goal satisfaction, but they are never summed, merged or
  converted into a percentage.
- Every item has a stable `id = digest(subject, kind, reason)`, a bounded reason
  and an explicit `blocks` list.
- The following are **blocking** (`CRITICAL`/`HIGH`): missing MUST criterion,
  unmapped MUST outcome, blocking open decision, `no-must-outcome`, stale goal
  contract, unresolved structural spec conflict, boundary mismatch, inadequate
  evidence for a MUST criterion.
- `unadopted-draft` is `MEDIUM` unless it contains a MUST outcome, in which case
  it is `HIGH`.
- `unsupported-preserve` and `unfalsifiable-forbidden` are `HIGH` when they
  protect a MUST outcome, otherwise `MEDIUM`.
- Intent debt is derived on every `check`/`prove`; it is not persisted as
  authoritative state.

## 10. Goal coverage graph and output

### 10.1 Projection, not a second graph

`projectGoalCoverage(session)` is added next to `projectProofGraph` and returns
the same shape extended with goal nodes and edges. It reads only the
authoritative `ChangeSession`. It does not persist, cache or mutate.

```ts
export interface GoalCoverageGraph {
  readonly nodes: readonly {
    id: string;
    kind:
      | "Goal"
      | "DesiredOutcome"
      | "AcceptanceCriterion"
      | "PreserveContract"
      | "ForbiddenOutcome"
      | "NonGoal"
      | "OpenDecision"
      | "ProofObligation"
      | "Evidence"
      | "RepositoryArtifact";
    version?: number;
    status?: GoalSatisfactionStatus | ProofStatus;
  }[];
  readonly edges: readonly {
    from: string;
    to: string;
    kind:
      | "requires"
      | "preserves"
      | "forbids"
      | "excludes"
      | "decides"
      | "verified_by"
      | "evidenced_by"
      | "affects"
      | "drifts_from";
    observedRevision: string;
  }[];
  readonly gaps: readonly { criterionId: string; missing: string }[];
}
```

Edge semantics:

- `Goal → DesiredOutcome`: `requires`
- `DesiredOutcome → AcceptanceCriterion`: `requires`
- `AcceptanceCriterion → ProofObligation`: `verified_by`
- `ProofObligation → Evidence`: `evidenced_by`
- `PreserveContract → RepositoryArtifact`: `preserves`
- `ForbiddenOutcome → RepositoryArtifact`: `forbids`
- `NonGoal → RepositoryArtifact`: `excludes`
- `OpenDecision → AcceptanceCriterion`: `decides`
- `AcceptanceCriterion → AcceptanceCriterion`: `drifts_from` when a later adopted
  version weakens or expands the prior one

The projection is a **view**. Deleting it loses no truth.

### 10.2 Coverage output

```ts
export interface GoalCoverageSummary {
  readonly outcomes: { total: number; must: number; mapped: number; unmapped: number };
  readonly criteria: {
    total: number;
    supported: number;
    partial: number;
    contradicted: number;
    stale: number;
    unknown: number;
  };
  readonly preserveContracts: { total: number; verified: number; changed: number; unknown: number };
  readonly forbiddenOutcomes: { total: number; clear: number; detected: number; unknown: number };
  readonly artifacts: { changed: number; covered: number; blindspots: number };
  readonly status: "complete" | "partial" | "absent";
}
```

`status` is `complete` only when there is at least one MUST outcome, every MUST
outcome is mapped to at least one adopted criterion, every MUST criterion has
evidence in scope, and no goal blindspot remains. Otherwise `partial` or
`absent`.

Counts only. No percentages, no "coverage score".

## 11. Intent drift, unintended outcomes, behavioral differential, spec conflict, goal blindspots

### 11.1 Intent drift

```ts
export type IntentDriftKind =
  | "goal-text-diverged"
  | "criterion-weakened"
  | "criterion-strengthened-unadopted"
  | "boundary-expanded"
  | "authorization-expanded"
  | "preserve-baseline-changed"
  | "outcome-unmapped"
  | "non-goal-violated";

export interface IntentDrift {
  readonly id: string;
  readonly kind: IntentDriftKind;
  readonly subject: string;
  readonly from: string;
  readonly to: string;
  readonly reason: string;
}
```

Deterministic detectors:

- `ChangeSession.goal !== GoalContract.goal` → `goal-text-diverged`.
- An adopted criterion version whose `requiredLevel` decreased, `severity`
  decreased, `assertion` changed to a weaker one (`runtime-behavior` →
  `review-only`, `test-suite-passes` → `review-only`), or `outcomeIds` lost a
  MUST outcome → `criterion-weakened`. **Any weakening is `UNSATISFIED` policy**,
  because the prior judgement no longer applies.
- A staged draft criterion with a MUST outcome that is not adopted →
  `criterion-strengthened-unadopted` (intent debt, `UNDETERMINED`).
- `boundary` expanded relative to the adopted contract → `boundary-expanded`.
- `authorizedPaths` expanded without a new contract version →
  `authorization-expanded`.
- A preserve contract's current contract hash differs from the adopted
  `baselineHash` → `preserve-baseline-changed` (also an `UNSATISFIED` blocker
  unless explicitly justified by an adopted decision).
- A MUST outcome with no criterion → `outcome-unmapped`.
- A changed artifact inside a non-goal path → `non-goal-violated`.

Drift detection never interprets natural language. It compares structure:
versions, levels, severities, assertion kinds, IDs, paths, hashes.

### 11.2 Unintended outcomes

```ts
export interface UnintendedOutcome {
  readonly id: string;
  readonly kind: "preserve-changed" | "forbidden-detected" | "non-goal-touched" | "contract-added";
  readonly subject: string;
  readonly reason: string;
  readonly severity: ProofSeverity;
}
```

Built from `semanticChanges`, `contractChanges`, preserve hashes, forbidden
detectors and non-goal path overlap. Structural only. A semantic change that
merely *looks* unrelated is not labelled unintended.

### 11.3 Behavioral differential

```ts
export interface BehavioralDifferential {
  readonly status: "unchanged" | "changed" | "unknown";
  readonly scope: readonly string[];
  readonly changes: readonly {
    artifact: string;
    kind: "contract" | "test-outcome" | "runtime-outcome";
    before: string;
    after: string;
  }[];
  readonly limitations: readonly string[];
}
```

Conservative rules:

- Exported contract deltas (existing `contractChanges`) are `changed` for
  TS-family artifacts.
- A test outcome delta is `changed` only when the same approved command ran on
  both baseline and current with the same environment identity.
- A runtime delta is `changed` only when both probes were deployment-bound to
  the compared revisions.
- Everything else is `unknown`. The default is `unknown`, never `unchanged`.
- No claim of semantic equivalence. The type is a *differential*, not a proof.

### 11.4 Spec conflict

```ts
export type SpecConflictKind =
  | "contradictory-assertions"
  | "preserve-vs-change"
  | "forbidden-vs-required"
  | "non-goal-vs-boundary"
  | "duplicate-key-divergence"
  | "unresolvable-ambiguity";

export interface SpecConflict {
  readonly id: string;
  readonly kind: SpecConflictKind;
  readonly subjects: readonly string[];
  readonly reason: string;
  readonly blocking: boolean;
}
```

Deterministic detectors only for structural conflicts:

- two criteria with the same `target`/`paths` but opposite `literal-presence`
  and `literal-absence` assertions;
- a `PreserveContract` whose artifact is also authorized for semantic change
  without an adopted decision;
- a `ForbiddenOutcome` whose detector target is required by another criterion;
- a `NonGoal` path inside the session boundary that a criterion must change;
- two adopted criteria with the same key but divergent statements/versions;
- anything that requires natural-language interpretation becomes an
  `OpenDecision` and `UNDETERMINED`, never a guessed conflict.

### 11.5 Goal blindspots

Extend `Blindspot` with a criterion projection:

```ts
export interface GoalBlindspot {
  readonly artifact: string;
  readonly risk: ProofSeverity;
  readonly reasons: readonly string[];
  readonly criterionIds: readonly string[];
  readonly investigated: boolean;
}
```

An artifact is a goal blindspot when it is affected by the change (existing
expected-investigation closure) and is not covered by the evidence scope of any
adopted criterion whose outcome it could affect. The existing BFS, coupling
ranking and `investigatedPaths` remain authoritative.

## 12. Outcome evidence and evidence adequacy

### 12.1 Extend evidence additively

```ts
export type OutcomeEvidenceKind =
  | "artifact-exists"
  | "text-absent"
  | "text-present"
  | "symbol-exists"
  | "type-check"
  | "build"
  | "test"
  | "contract-unchanged"
  | "runtime-probe"
  | "manual-review";

export type EvidenceAdequacy = "sufficient" | "partial" | "insufficient" | "unknown";
```

`Evidence` gains three optional fields: `criterionIds`, `outcomeKind`,
`adequacy`. Existing evidence remains valid (fields absent). Adequacy is
recomputed deterministically on every evaluation, not trusted from storage.

### 12.2 The adequacy matrix

`assessAdequacy(criterion.assertion, evidence.outcomeKind, evidence.level, scope)`
is a pure function. `—` means `insufficient`.

| assertion \ evidence | artifact-exists | text-present | text-absent | symbol-exists | L2 type/build | L3 test | contract-unchanged | L5 runtime | manual-review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `artifact-presence` | sufficient L1 | — | — | — | — | — | — | — | partial |
| `literal-presence` | — | sufficient L1 | — | — | — | — | — | — | partial |
| `literal-absence` | — | — | sufficient L1 only for a declared literal scope | — | — | — | — | — | partial |
| `symbol-presence` | — | — | — | sufficient L1 (TS-family) | — | — | — | — | partial |
| `contract-unchanged` | — | — | — | — | — | — | sufficient L1 | — | partial |
| `type-sound` | — | — | — | — | sufficient L2 | — | — | — | insufficient |
| `build-succeeds` | — | — | — | — | sufficient L2 | — | — | — | insufficient |
| `test-suite-passes` | — | — | — | — | — | sufficient L3 only if `investigates` covers the criterion scope, else partial | — | — | partial |
| `runtime-behavior` | — | — | — | — | — | — | — | sufficient L5 only if deployment-bound, else unknown | partial (never sufficient for MUST) |
| `review-only` | — | — | — | — | — | — | — | — | never sufficient for MUST; may resolve an open decision at L1 |

Additional rules:

- Missing evidence is `unknown`, never `sufficient`.
- Stale evidence is `unknown` for status purposes, even if its last result was
  `pass`.
- A criterion's `requiredLevel` is a floor; adequacy can be `partial` even when
  the level is met if the evidence kind does not match the assertion.
- `test-suite-passes` is deliberately weaker than `runtime-behavior`. A test can
  satisfy "the suite passes"; it cannot satisfy "the runtime behavior holds"
  unless the criterion was adopted as a runtime criterion and a bound probe ran.
- Unsupported languages, parse errors and ignored files produce `unknown` with a
  limitation, never `sufficient`.
- Adequacy is never supplied by a model, a receipt or an MCP caller.

## 13. Goal guarantee ceiling, counterexample search, falsification planner, verification economy

### 13.1 Goal guarantee ceiling

```ts
export interface GoalGuaranteeCeiling {
  readonly level: ProofLevel;
  readonly limitations: readonly string[];
  readonly drivers: readonly { criterionId: string; level: ProofLevel; reason: string }[];
}
```

The ceiling is the minimum of:

- each adopted MUST criterion's `requiredLevel` and its achieved adequacy level;
- the linked proof obligations' `guaranteeCeiling`;
- repository observation completeness (incomplete ⇒ ceiling 0);
- language/parser support (unsupported ⇒ at most L1/unknown for that criterion);
- the host-approved verification catalog (no approved L3/L5 ⇒ cannot exceed the
  available level);
- explicit `limitations` on criteria and the revision.

No probability. A ceiling is an ordinal policy bound.

### 13.2 Counterexample search

```ts
export interface CounterexampleSearchResult {
  readonly criterionId: string;
  readonly strategy:
    | "literal-present"
    | "symbol-present"
    | "contract-changed"
    | "test-failed"
    | "runtime-predicate-failed"
    | "non-goal-path-touched";
  readonly found: boolean | "unknown";
  readonly detail: string;
}
```

Strategies reuse existing determinism:

- `text-present` (new) for forbidden literals and for falsifying a
  `literal-absence` claim;
- `symbol-exists` (new, TS-family via the indexed graph) for falsifying
  "no consumers" claims;
- `contract-changed` from `RepositoryArtifact.contracts` deltas;
- `test-failed` from an approved command's `fail`;
- `runtime-predicate-failed` from a bound `InspectPort` probe;
- `non-goal-path-touched` from path overlap.

Unsupported language, missing index edge, dynamic construction or ignored files
yield `"unknown"`, never `false`.

### 13.3 Falsification planner

Extend `ProofReport.nextActions` entries with:

```ts
readonly falsifies?: readonly string[];
readonly coversCriteria?: readonly string[];
```

Ranking order becomes:

1. CRITICAL/HIGH forbidden or preserve falsifiers;
2. CRITICAL/HIGH criterion contradictions;
3. criteria whose evidence is partial/unknown with low-cost falsifiers;
4. remaining confirmations.

The existing `settles()` closure and cost classes are reused. The planner never
executes; `verify` remains the only execution path and still requires an
explicit node and, for commands, host approval.

### 13.4 Verification economy (design only)

A future `VerificationEconomyPlan` would choose a minimal set of actions that
maximises criteria settled per cost unit, reusing the existing cost classes and
`settles` closure. This RFC **does not implement it**. It is recorded here to
prevent a later parallel planner. Constraints if it is ever built:

- no runtime duration estimates presented as facts;
- no auto-execution;
- no claim that fewer tests preserve confidence without paired held-out
  evidence;
- no probability of goal satisfaction.

## 14. Deterministic goal satisfaction state machine

```ts
export interface CriterionState {
  readonly criterionId: string;
  readonly status: "supported" | "partial" | "contradicted" | "stale" | "unknown";
  readonly level: ProofLevel;
  readonly adequacy: EvidenceAdequacy;
  readonly evidenceIds: readonly string[];
  readonly reasons: readonly string[];
}

export interface GoalSatisfactionReport {
  readonly contract: GoalContract | null;
  readonly status: GoalSatisfactionStatus;
  readonly criteria: readonly CriterionState[];
  readonly testStatus: TestStatusSummary;
  readonly proofStatus: ProofStatusSummary;
  readonly intentDebt: readonly IntentDebtItem[];
  readonly proofDebt: readonly ProofDebtItem[];
  readonly coverage: GoalCoverageSummary;
  readonly ceiling: GoalGuaranteeCeiling;
  readonly blockers: readonly GoalBlocker[];
  readonly limitations: readonly string[];
}
```

### 14.1 Per-criterion evaluation

```
SUPPORTED   := fresh evidence, adequacy=sufficient, level >= requiredLevel,
               no contradiction, criterion version current
PARTIAL     := fresh evidence, adequacy=partial, or level < requiredLevel
CONTRADICTED:= fresh fail, or a forbidden detector fires for this criterion
STALE       := evidence stale, or criterion version changed after evidence
UNKNOWN     := no adopted evidence, adequacy=unknown, unsupported language,
               unresolved open decision, or missing criterion
```

### 14.2 Global evaluation (exact precedence)

```
1. UNSATISFIED if:
   - any MUST criterion is CONTRADICTED, or
   - any forbidden outcome is detected (positive evidence), or
   - any preserve contract changed without an adopted justification, or
   - any criterion was weakened after adoption (drift policy).

2. UNDETERMINED if:
   - no GoalContract, or
   - no DesiredOutcome with priority MUST, or
   - any blocking intent debt exists, or
   - any blocking proof debt exists on a criterion-linked obligation, or
   - repository observation is incomplete, or
   - any MUST criterion is UNKNOWN or STALE, or
   - coverage.status !== "complete", or
   - any blocking OpenDecision is unresolved.

3. PARTIALLY_SATISFIED if:
   - no contradiction, no blocking unknown, but
   - at least one MUST criterion is PARTIAL.
   (Unsupported SHOULD criteria are reported in coverage but do not downgrade
   the MUST verdict.)

4. SATISFIED if:
   - every MUST outcome is mapped and every MUST criterion is SUPPORTED,
   - no forbidden outcome, no preserve violation, no blocking intent/proof debt,
   - coverage.status === "complete",
   - ceiling.level >= policy minimum for every MUST criterion.
```

### 14.3 Anti-vacuity rules

- Zero adopted criteria ⇒ `UNDETERMINED`, never `SATISFIED`.
- Zero MUST outcomes ⇒ `UNDETERMINED` with `no-must-outcome`.
- A MUST outcome with no criterion ⇒ `UNDETERMINED` with `unmapped-outcome`.
- A `review-only` criterion can never make a MUST outcome `SATISFIED`.
- An empty evidence array is never support.
- A model cannot call the evaluator, inject a status, or write a receipt.

### 14.4 Determinism

The evaluator is a pure function of `ChangeSession` plus the current
`ProofReport`. It must produce byte-identical output for identical inputs. No
timestamps, random IDs or environment reads are allowed in the status decision.
Receipt IDs reuse the existing `digest([session.id, session.version, ...])`
pattern.

## 15. Goal satisfaction receipt and portable handoff

### 15.1 Receipt

```ts
export interface GoalSatisfactionReceipt extends ChangeReceipt {
  readonly receiptKind: "goal-satisfaction";
  readonly goalPolicyVersion: 1;
  readonly goalContractVersion: number | null;
  readonly goalStatus: GoalSatisfactionStatus;
  readonly testStatus: TestStatusSummary;
  readonly proofStatus: ProofStatusSummary;
  readonly intentDebt: readonly IntentDebtItem[];
  readonly coverage: GoalCoverageSummary;
  readonly satisfiedCriteria: readonly string[];
  readonly partialCriteria: readonly string[];
  readonly unsatisfiedCriteria: readonly string[];
  readonly undeterminedCriteria: readonly string[];
  readonly blockers: readonly GoalBlocker[];
}
```

Compatibility rules:

- `ChangeReceipt.completion` keeps its exact current meaning and values
  (`proven` / `not-proven` / `blocked`). It is **not** renamed or overloaded.
- `ChangeReceipt.policyVersion` stays `1`; the goal layer adds its own
  `goalPolicyVersion: 1` so existing readers do not need to reinterpret the
  proof policy.
- `goalStatus` is a new, independent field.
- `intentDebt` is never merged into `debt`.
- `limitations` always includes the current revision limitations plus the
  explicit statement that goal satisfaction is bounded by adopted criteria and
  observed evidence, not universal correctness.
- The receipt is a local record, not a signed attestation.

### 15.2 Portable handoff

Export adds:

```ts
{
  exportVersion: 2,
  session: { /* existing ChangeSession fields */ },
  goalContract: { /* adopted contract or null */ },
  goalIntentDebt: [ /* reasons, no verdicts */ ]
}
```

Import rules:

- Accept `exportVersion` 1 and 2.
- Revalidate every field with the same bounds as adoption.
- Recompile intent into new local IDs at a freshly observed baseline.
- **Discard** imported `goalStatus`, evidence, receipts, adoption approvals and
  criterion versions.
- Require local re-adoption before a goal status other than `UNDETERMINED` is
  possible.
- Never trust imported contract IDs or obligation IDs.

This matches the existing `importState` rule: intent travels; verdicts do not.

## 16. SDK, MCP, and CLI surface changes

### 16.1 SDK

Additive methods on `ProofSDK` (not `ProofPort`, unless a port is needed for
tests):

```ts
proposeGoal(changeId: string, approval: { approved: boolean; maxTokens?: number }): Promise<GoalContractDraft>;
adoptGoal(changeId: string, input: AdoptGoalInput): Promise<ProofReport>;
dismissGoal(changeId: string, decisions: readonly { key: string; reason: string }[]): Promise<ProofReport>;
goalGraph(changeId: string): Promise<GoalCoverageGraph>;
goal(changeId: string): Promise<GoalSatisfactionReport>;
```

`ProofPort` gains only what the engine needs to evaluate and persist a contract.
The `ProofRepositoryPort` is unchanged: no new execution capability is required
for the goal layer beyond the Phase 7 predicates.

### 16.2 MCP — extend, never add

Keep `PROOF_TOOL_NAMES` at exactly seven. No `atlas_goal_*` tools.

| Tool | Additive change |
| --- | --- |
| `atlas_begin_change` | Optional `goalContract` (already-adopted document) for portable/restart flows; still validated. |
| `atlas_understand` | Optional `goalDraft` (untrusted, staged) and `adoptGoal: { approved: true, keys }`; dismissals reuse the existing reason requirement. |
| `atlas_context` | Unchanged input; packet task text includes top intent debt reasons. |
| `atlas_check` / `atlas_status` | Projection adds `goalStatus`, `intentDebt`, `coverage`, `testStatus`, `proofStatus`. No new tool. |
| `atlas_verify` | Unchanged; criterion-linked obligations resolve by ID. |
| `atlas_prove` | Returns `GoalSatisfactionReceipt`; legacy `completion` remains. |

Response cap stays 100,000 characters. Goal projections omit full evidence
bodies and use counts plus IDs, exactly like the existing proof projection.

### 16.3 CLI — one lifecycle

No new top-level command. Extend `atlas prove`:

```text
atlas prove begin --input change.json
atlas prove understand <id> --input proposals.json
atlas prove goals <id>                         # adopted contract, intent debt, 3 statuses
atlas prove adopt <id> --input goal.json       # explicit adoption
atlas prove coverage <id>                      # coverage summary/graph
atlas prove check <id>
atlas prove status <id>
atlas prove verify <id> --node <id> [--approve-commands]
atlas prove <id>                               # receipt with test/proof/goal status
atlas prove export <id>
atlas prove import --input exported.json
atlas prove history <id>
atlas prove watch
```

Exit code policy:

- Default: unchanged — exit 1 when `completion !== "proven"`.
- `--require-goal`: exit 1 unless `goalStatus === "SATISFIED"`.
- The default is **not** flipped by this RFC. Flipping requires the Phase 12
  benchmark gate and a release note, because it changes automation behavior.

## 17. Persistence, migration, and compatibility

### 17.1 What does not change

- `proof.db` remains schema v3. No new table is required for this design: the
  contract travels inside the session document, exactly like nodes/evidence.
- `context.db` is untouched.
- `ProofStore` still enforces the 8 MiB session bound, optimistic versions and
  immutable gzip history.
- `projectProofGraph` remains the only graph projection module.

### 17.2 Document schema

`ChangeSession.schemaVersion` stays `1` while `goalContract` is optional.

- Old sessions load unchanged; `goalContract` is `undefined`; goal status is
  `UNDETERMINED` with `no-must-outcome`/missing contract reasons.
- New sessions may include `goalContract`.
- `ProofStore.get()` continues to accept `schemaVersion === 1`.

Phase 10 makes the decision explicitly:

- If measurements show that optional persistence is sufficient, keep v1
  indefinitely with optional fields.
- If a required contract is needed, bump to `schemaVersion: 2`, add a dual-read
  path (`1 | 2`), write 2 going forward, and normalize v1 to
  `goalContract: null`. No destructive migration.
- A `GoalContracts` table (proof.db v4) is **deferred** until query/size
  measurements justify it. If added, it is additive with a backfill from the
  JSON body and a dual-read window.

### 17.3 Failure behavior

- Unknown fields in a goal contract or draft fail closed.
- Oversized contracts/drafts fail closed with a bounded error.
- Invalid paths use the existing `scopes()` validation.
- A malformed imported contract fails the whole import; it is never partially
  applied.
- A contract that references an unknown obligation/outcome key fails adoption.
- A session whose contract version is newer than the code's supported schema is
  rejected with a clear error, not silently downgraded.

### 17.4 Compatibility matrix

| Consumer | Before | After |
| --- | --- | --- |
| `ChangeReceipt` readers | `completion`, `debt`, etc. | Same fields, same meanings; new optional fields ignored. |
| `atlas prove` scripts | exit 1 on not-proven | Unchanged unless `--require-goal`. |
| MCP proof profile | seven tools | seven tools; additive inputs/projections. |
| Portable v1 export | accepted | still accepted; becomes `UNDETERMINED` until locally adopted. |
| Control plane | `options.proof` gate | Unchanged; may later pass a goal-aware policy, but not in this RFC. |

## 18. Safety, security, privacy, and trust boundaries

1. **Model output is untrusted.** Goal drafts are data. They cannot contain
   commands, actions, levels, severities, thresholds, adoption decisions or
   verdicts. Unknown fields are rejected, not ignored.
2. **Adoption is explicit.** No code path may adopt a model draft implicitly.
   `approved: true` plus a human/host decision is required. Tests must assert
   this for every entry point.
3. **Deterministic ownership.** IDs, links, adequacy, debt, coverage, status,
   ceiling and receipts are computed by code. A model cannot write any of them.
4. **No shell.** The goal layer adds no command execution. Phase 7 predicates
   are read-only queries. Existing argv-array execution and `--approve-commands`
   remain the only execution path.
5. **No new data exfiltration.** Drafts are built from the existing bounded
   `WorkPacket`; repository text remains untrusted data in the prompt. No
   whole-repository upload.
6. **Sensitive content.** Goal statements may contain sensitive text. They use
   the same session storage boundary and `denyFilter` checks as proof
   statements. Errors redact the repository root and input paths as today.
7. **No network in tests.** Provider calls are mocked. The benchmark is offline.
8. **Fail closed.** Unsupported language, incomplete observation, stale
   evidence, missing approval and ambiguous intent all reduce to `UNKNOWN` /
   `UNDETERMINED`, never to `SATISFIED`.
9. **No fake precision.** No probabilities, confidence intervals, percentages or
   "score" fields. Four states plus reasons.
10. **Trust boundary.** A local database owner can tamper with receipts. The
    receipt is an audit aid, not a cryptographic attestation.

## 19. Benchmark and False Goal-Satisfaction Rate

### 19.1 Why a new benchmark

The existing `mutation-evaluation.test.ts` measures whether mutations stale
evidence and whether the proof gate avoids false `proven` receipts. It does not
measure whether a `SATISFIED` goal status is true. The new layer needs its own
safety metric.

### 19.2 Metric definitions

- **False Goal-Satisfaction Rate (FGSR)** — the fraction of evaluated runs where
  the engine reports `SATISFIED` but an independent, hand-authored oracle says
  the goal is not satisfied. **Primary safety metric. Gate: 0 on the
  deterministic corpus.**
- **False Unsatisfaction Rate (FUR)** — the fraction where the engine reports
  `UNSATISFIED` but the oracle says satisfied. Reported, not a hard gate in the
  first release; it measures over-conservatism.
- **UNDETERMINED precision/recall** — whether the engine says `UNDETERMINED`
  exactly when the fixture is genuinely under-specified.
- **Adequacy confusion** — the 4×9 assertion/action matrix compared with
  hand-labelled expected adequacy.
- **Coverage-gap recall** — seeded intent gaps (missing criterion, unmapped
  outcome, open decision, blindspot) that the engine must report.
- **Determinism** — two runs over identical input produce identical status,
  blockers and receipt digest.
- **Compatibility** — v1 sessions/imports still load and report `UNDETERMINED`.

### 19.3 Corpus design

Fixtures are offline JSON/TypeScript, independent of the evaluator:

1. **Happy path** — adopted MUST criteria, sufficient evidence ⇒ `SATISFIED`.
2. **Passing tests, unmet goal** — suite passes but a behavior criterion has no
   adequate evidence ⇒ `UNDETERMINED` or `PARTIALLY_SATISFIED`, never
   `SATISFIED`. This is the headline FGSR case.
3. **Passing tests, forbidden outcome present** — ⇒ `UNSATISFIED`.
4. **Passing tests, preserve contract broken** — ⇒ `UNSATISFIED`.
5. **Failing tests, goal still met** — e.g. a non-required flaky command fails;
   the MUST criteria are type/build criteria with sufficient evidence ⇒
   `SATISFIED`, with test status `failing` shown separately. (FUR case.)
6. **No criteria** — ⇒ `UNDETERMINED`, never vacuous satisfaction.
7. **Unmapped MUST outcome** — ⇒ `UNDETERMINED` with intent debt.
8. **Open blocking decision** — ⇒ `UNDETERMINED`.
9. **Stale evidence after mutation** — ⇒ `UNKNOWN`/`UNDETERMINED`.
10. **Incomplete observation** — ⇒ `UNDETERMINED`.
11. **Ambiguous criterion** — ⇒ `UNDETERMINED`, never guessed.
12. **Weakened criterion after evidence** — ⇒ `UNSATISFIED` with drift reason.
13. **Model draft omits a MUST outcome** — adoption is allowed only if the human
    accepts; the engine must not infer the omission as satisfaction.
14. **Prompt injection in repository text** — draft validation rejects or the
    draft remains unadopted; no status change.
15. **Unsupported language** — contract-dependent criterion ⇒ `UNKNOWN`.
16. **Test without declared `investigates`** — adequacy `partial`, not
    `sufficient`.
17. **Review-only MUST criterion** — ⇒ `UNDETERMINED`, never `SATISFIED`.
18. **Contradictory assertions** — ⇒ `UNSATISFIED`/`UNDETERMINED` with a
    structural conflict, not a guess.

Each fixture records: input session, oracle `goalStatus`, oracle blockers, and
the expected three statuses. The oracle is hand-authored from the ROADMAP safety
cases. Independent review and a larger held-out corpus remain follow-up work;
the current labels are not presented as production ground truth.

### 19.4 Harness and release gate

- Location: `packages/proof/tests/goal-satisfaction-evaluation.test.ts` (inline
  cases; each needs a full `ChangeSession`).
- Runs in `pnpm check`; no network, no provider credentials.
- Asserts FGSR = 0, determinism, adequacy matrix rows, debt recall, and
  compatibility.
- Reports FUR and UNDETERMINED precision as informational metrics in the test
  output and the release evidence.
- Phase 12's deterministic gates are met: 27 cases, FGSR = 0, FUR = 0, gap
  recall = 1, deterministic output, and `pnpm check` green locally on Node 24.22.1 (a Node 22.13+ rerun remains required). Independent
  review and held-out data are required before any status beyond
  `[EXPERIMENTAL]`.

## 20. Phased implementation, risks, deferrals, success criteria

### 20.1 Priority map

| Priority | Surfaces | Rule |
| --- | --- | --- |
| **P0** | Contracts, session persistence, draft/adoption, intent debt, adequacy, status machine, receipt, migration, FGSR seed | Required for any honest goal status. |
| **P1** | Coverage graph/output, drift, unintended outcomes, preserve/forbidden, counterexample, falsification, CLI/MCP | Required for a usable product surface. |
| **P2** | Behavioral differential, verification economy, scenario graph, semantic conflict, external attestation | Valuable, not required for the first honest release. |

### 20.2 Phases 0–12

Each phase lists the 14 required fields. A phase is not started until the
previous phase's acceptance criteria are met.

#### Phase 0 — Contracts, policy vocabulary, ADR

- **Goal:** freeze additive core types and policy defaults; no runtime behavior
  change.
- **Why now:** every later phase must compile against stable types; prevents a
  parallel goal model.
- **Reused code:** `ProofLevel`, `ProofSeverity`, `VerificationAction`,
  `ProofProposal.provenance`, proposal adoption vocabulary.
- **Files:** `packages/core/src/domain/goal.ts` (new), `packages/core/src/index.ts`,
  `docs/decisions/ADR-029-goal-satisfaction-layer.md`.
- **Domain:** `GoalContract`, `DesiredOutcome`, `AcceptanceCriterion`,
  `CriterionAssertion`, `PreserveContract`, `ForbiddenOutcome`, `NonGoal`,
  `OpenDecision`, `IntentDebtItem`, `GoalSatisfactionStatus`,
  `GoalSatisfactionReceipt`.
- **Storage:** none.
- **SDK:** type re-exports only.
- **MCP:** none.
- **CLI:** none.
- **Tests:** compile-time/type tests and schema-shape unit tests; no evaluator.
- **Benchmarks:** none.
- **Risks:** type churn; keep every session field optional.
- **Acceptance:** `pnpm check` green; no runtime diff; ADR and matrix accepted.
- **What not to build:** evaluator, persistence, CLI/MCP, graph projection.

#### Phase 1 — Session integration and additive persistence

- **Goal:** persist an optional `goalContract`; round-trip export/import; no
  status computation.
- **Why now:** the contract needs a durable anchor before compilation.
- **Reused code:** `begin`, `save`, `ProofStore.get/put`, `exportState`,
  `importState`, `scopes`.
- **Files:** `packages/core/src/domain/proof.ts`,
  `packages/proof/src/service.ts`, `packages/storage/src/proof-store.ts`,
  `packages/sdk/src/proof/index.ts`.
- **Domain:** optional `goalContract`; `GoalContract.id/version`; bounds.
- **Storage:** JSON session body only; no new table; `get()` accepts absent;
  keep the 8 MiB bound.
- **SDK:** `BeginChangeInput.goalContract?`; export includes it; import strips
  adoption and status.
- **MCP:** none.
- **CLI:** none.
- **Tests:** old session loads; new session round-trips; import discards
  adoption/evidence/status; oversize and path-invalid contracts fail closed.
- **Benchmarks:** none.
- **Risks:** document growth; enforce 64 criteria/128 outcomes.
- **Acceptance:** existing proof tests unchanged and green; new round-trip tests.
- **What not to build:** compiler, status machine, receipt changes.

#### Phase 2 — Goal draft compiler and explicit adoption

- **Goal:** model proposes a validated `GoalContractDraft`; a human adopts or
  dismisses it explicitly.
- **Why now:** criteria are the input to every later judgement.
- **Reused code:** `proposeObligations`, `stageProposals`, `dismissProposals`,
  `proposalDecisions`, `withUsageTracking`, `buildWorkPacket`.
- **Files:** `packages/proof/src/goal-compiler.ts` (new),
  `packages/proof/src/service.ts`, `packages/sdk/src/proof/index.ts`.
- **Domain:** `GoalContractDraft`, `AdoptGoalInput`, `proposedGoal`,
  `goalProposalDecisions`.
- **Storage:** staged draft and decisions in the session document, bounded.
- **SDK:** `proposeGoal`, `adoptGoal`, `dismissGoal`; provider and usage injected
  exactly like `propose`.
- **MCP:** none.
- **CLI:** none.
- **Tests:** adversarial provider output (unknown fields, commands, levels,
  thresholds, oversized strings, duplicate keys); no auto-adoption; adoption
  stales evidence; dismissal requires a reason.
- **Benchmarks:** draft-validity corpus (not FGSR yet).
- **Risks:** model overreach; strict allowlist and bounded counts.
- **Acceptance:** there is no code path from model output to an adopted
  criterion without an explicit `adoptGoal` call; tests assert it.
- **What not to build:** status machine, coverage graph, CLI/MCP.

#### Phase 3 — Goal coverage projection

- **Goal:** `projectGoalCoverage(session)` extends the existing projection with
  goal nodes/edges.
- **Why now:** visibility precedes judgement; users need to see gaps before the
  engine says anything.
- **Reused code:** `projectProofGraph`, `TemporalProofGraph`, deterministic ID
  helpers.
- **Files:** `packages/proof/src/graph.ts` (or `goal-graph.ts` imported by it),
  `packages/core/src/domain/proof.ts`, `packages/sdk/src/proof/index.ts`.
- **Domain:** `GoalCoverageGraph`, new node/edge kinds.
- **Storage:** none; projection only.
- **SDK:** `goalGraph(changeId)`.
- **MCP:** none.
- **CLI:** none.
- **Tests:** deterministic node/edge sets; duplicate-free; unknown link fails
  closed; cap (e.g. 4,000 nodes) enforced.
- **Benchmarks:** projection time on a 1,000-node fixture; no full rescan.
- **Risks:** graph explosion; enforce caps and projection-only semantics.
- **Acceptance:** no new store; projection reconstructs from session alone.
- **What not to build:** a second graph service/database.

#### Phase 4 — Intent debt, goal blindspots, coverage summary

- **Goal:** compute `IntentDebtItem[]`, `GoalBlindspot[]` and
  `GoalCoverageSummary`.
- **Why now:** exposes uncertainty before any status claim.
- **Reused code:** proof-debt generation pattern, blindspot BFS,
  `rankCoupling`, `investigatedPaths`.
- **Files:** `packages/proof/src/goal-truth.ts` (new),
  `packages/sdk/src/proof/index.ts`.
- **Domain:** `IntentDebtKind`, `IntentDebtItem`, `GoalBlindspot`,
  `GoalCoverageSummary`.
- **Storage:** derived only; no persistence.
- **SDK:** `check` returns a `goal` block with debt/coverage.
- **MCP:** none.
- **CLI:** none.
- **Tests:** every debt kind; unmapped MUST outcome; open decision; boundary
  mismatch; blindspot not covered; no percentages in output.
- **Benchmarks:** seeded gap recall.
- **Risks:** noise; every item needs a bounded reason and a subject.
- **Acceptance:** all debt is structured and explainable; no score fields.
- **What not to build:** status machine or receipt.

#### Phase 5 — Outcome evidence and evidence adequacy

- **Goal:** link evidence to criteria and compute deterministic adequacy.
- **Why now:** without adequacy, a passing test can masquerade as goal support.
- **Reused code:** `Evidence`, `VerificationResult`, `verify`,
  `publicContracts`, `investigatedPaths`.
- **Files:** `packages/core/src/domain/proof.ts`,
  `packages/proof/src/goal-truth.ts`, `packages/sdk/src/proof/index.ts`.
- **Domain:** `OutcomeEvidenceKind`, `EvidenceAdequacy`, optional evidence
  fields, `assessAdequacy`.
- **Storage:** optional evidence fields inside the session document.
- **SDK:** criterion→obligation mapping; `verify` unchanged.
- **MCP:** none.
- **CLI:** none.
- **Tests:** full assertion×action matrix; unsupported language ⇒ unknown;
  test without `investigates` ⇒ partial; stale evidence ⇒ unknown.
- **Benchmarks:** adequacy confusion matrix.
- **Risks:** false sufficiency; default to `partial`/`unknown`.
- **Acceptance:** `test-suite-passes` can never be sufficient for
  `runtime-behavior`; tests assert it.
- **What not to build:** new execution or a second evidence store.

#### Phase 6 — Deterministic goal satisfaction state machine

- **Goal:** `evaluateGoalSatisfaction(session)` with the four states and exact
  precedence.
- **Why now:** this is the core judgement the product needs.
- **Reused code:** `evaluateProof`, intent debt, coverage, adequacy.
- **Files:** `packages/proof/src/goal-truth.ts`,
  `packages/core/src/domain/proof.ts`, `packages/sdk/src/proof/index.ts`.
- **Domain:** `GoalSatisfactionStatus`, `CriterionState`, `GoalSatisfactionReport`,
  `GoalBlocker`.
- **Storage:** derived; not persisted as truth.
- **SDK:** `check` returns `goalStatus`, criteria states and blockers.
- **MCP:** none.
- **CLI:** none.
- **Tests:** precedence table; vacuity; incomplete observation; stale evidence;
  contradiction; no-contract session; determinism.
- **Benchmarks:** seed FGSR corpus (status only).
- **Risks:** precedence bugs; property-based tests for ordering.
- **Acceptance:** no MUST outcome ⇒ `UNDETERMINED`; no model can set status;
  identical inputs ⇒ identical output.
- **What not to build:** receipt, CLI/MCP, attestation.

#### Phase 7 — Counterexample search and falsification planner

- **Goal:** deterministic falsifiers for forbidden/preserve/absence claims.
- **Why now:** falsification is the cheapest defence against false satisfaction.
- **Reused code:** `text-absent`, `public-contract-unchanged`, approved commands,
  runtime probes, `nextActions`, `settles`.
- **Files:** `packages/core/src/domain/proof.ts`,
  `packages/proof/src/service.ts` (validation),
  `packages/proof/src/truth.ts`, `packages/sdk/src/proof/index.ts` (execute).
- **Domain:** `text-present`, TS-family `symbol-exists`, `FalsificationPlan`,
  `CounterexampleSearchResult`.
- **Storage:** evidence only; no new tables.
- **SDK:** execute the new read-only predicates via the indexed graph; unsupported
  language ⇒ `unknown`.
- **MCP:** none in this phase; schema enum extended in Phase 11.
- **CLI:** none.
- **Tests:** forbidden literal present; dynamic construction ⇒ unknown; no shell;
  symbol predicate on unsupported language ⇒ unknown.
- **Benchmarks:** falsifier detection rate on seeded forbidden outcomes.
- **Risks:** negative-search limits; declare scope and limitations.
- **Acceptance:** a detected forbidden literal yields `UNSATISFIED`, not
  `UNDETERMINED`.
- **What not to build:** test synthesis or a query language.

#### Phase 8 — Intent drift, preserve/forbidden violations, structural spec conflict

- **Goal:** detect weakened/expanded intent and structural conflicts.
- **Why now:** without drift detection, evidence can survive a goal rewrite.
- **Reused code:** invalidation reasons, `proposalDecisions`, contract hashes,
  boundary/authorization paths, action targets.
- **Files:** `packages/proof/src/goal-truth.ts`,
  `packages/proof/src/truth.ts`.
- **Domain:** `IntentDrift`, `SpecConflict`, `UnintendedOutcome`.
- **Storage:** decisions and limitations only.
- **SDK:** `check` projection.
- **MCP:** none.
- **CLI:** none.
- **Tests:** weakened criterion; expanded boundary/authorization; preserve
  baseline change; contradictory assertions; non-goal overlap; semantic conflict
  becomes an open decision.
- **Benchmarks:** drift recall on seeded edits.
- **Risks:** semantic conflicts cannot be decided deterministically; route to
  `OpenDecision`.
- **Acceptance:** any adoption weakening ⇒ `UNSATISFIED` or `UNDETERMINED` with
  a reason; no guessed conflict.
- **What not to build:** LLM adjudication of conflicts.

#### Phase 9 — Conservative behavioral differential

- **Goal:** baseline/current differential for declared scopes; TS-family
  contracts; optional paired test/runtime evidence.
- **Why now:** preserve contracts need more than a hash comparison.
- **Reused code:** `semanticHash`, `publicContracts`, approved commands, runtime
  probes.
- **Files:** `packages/proof/src/differential.ts` (new),
  `packages/sdk/src/proof/index.ts`.
- **Domain:** `BehavioralDifferential`.
- **Storage:** evidence only.
- **SDK:** `differential(changeId)`.
- **MCP:** none.
- **CLI:** none.
- **Tests:** contract change detected; formatting ignored; unsupported language
  ⇒ unknown; no equivalence claim; paired-run requirement.
- **Benchmarks:** differential precision on seeded contract edits.
- **Risks:** cost and false equivalence; opt-in, default `unknown`.
- **Acceptance:** never reports `unchanged` without comparable evidence on both
  sides.
- **What not to build:** full differential execution or semantic equivalence.

#### Phase 10 — Goal receipt, three-status UX, portable handoff

- **Goal:** emit `GoalSatisfactionReceipt`; show test/proof/goal statuses;
  export/import v2.
- **Why now:** the layer needs a delivery contract before UI wiring.
- **Reused code:** `ChangeReceipt`, `prove`, export/import, handoff rendering.
- **Files:** `packages/core/src/domain/proof.ts`,
  `packages/proof/src/service.ts`, `packages/sdk/src/proof/index.ts`,
  proof-system docs.
- **Domain:** receipt, summaries, blockers.
- **Storage:** bounded receipts; schema decision (stay v1 optional or bump v2
  with dual read).
- **SDK:** `prove` returns the extended receipt; legacy fields preserved.
- **MCP:** none.
- **CLI:** none (Phase 11 renders it).
- **Tests:** receipt fields; legacy `completion`; import discards status; export
  v1/v2 compatibility.
- **Benchmarks:** receipt determinism.
- **Risks:** dual-status confusion; document the meanings explicitly.
- **Acceptance:** three statuses are separate fields; `completion` is unchanged.
- **What not to build:** signed attestations.

#### Phase 11 — CLI and MCP minimal surface

- **Goal:** wire `goals`, `adopt`, `coverage` into `atlas prove` and extend the
  seven MCP tools.
- **Why now:** end-to-end usability.
- **Reused code:** `registerProve`, `registerProofTools`, `project`, `denyFilter`,
  response cap.
- **Files:** `apps/cli/src/commands/prove.ts`, `packages/mcp/src/proof.ts`,
  `docs/proof-system/08-mcp-api.md`, CLI/MCP tests.
- **Domain:** strict input schemas.
- **Storage:** none.
- **SDK:** already exposed.
- **MCP:** add `goalDraft`/`adoptGoal` to `atlas_understand`; add goal projection
  to check/status/prove; keep seven tools; keep 100k cap.
- **CLI:** add `goals`, `adopt`, `coverage`; add `--require-goal`; keep default
  exit code.
- **Tests:** CLI operations; `PROOF_TOOL_NAMES.length === 7`; strict schemas;
  no new top-level command.
- **Benchmarks:** projection size under cap.
- **Risks:** surface creep; enforce the tool/command budget in tests.
- **Acceptance:** no new tool, no new top-level command; legacy behavior default.
- **What not to build:** `atlas goal`, `atlas_goal_*`, a new MCP profile.

#### Phase 12 — Benchmark, hardening, release gate

- **Goal:** prove the safety property with FGSR and harden the layer.
- **Why now:** the claim "goal satisfied" is only credible with a false-positive
  measurement.
- **Reused code:** `mutation-evaluation.test.ts` corpus pattern, offline
  fixtures, existing `ProofStore`.
- **Files:** `packages/proof/tests/goal-satisfaction-evaluation.test.ts`,
  `packages/proof/tests/goal-truth.test.ts`,
  `packages/proof/tests/goal-adoption.test.ts`,
  `packages/sdk/tests/goal-predicates.test.ts`,
  `packages/sdk/tests/goal-sdk.test.ts`,
  `packages/mcp/tests/proof.test.ts`, `apps/cli/tests/prove.test.ts`,
  `docs/proof-system/{10,12,13,14}.md`.
- **Domain:** none.
- **Storage:** none.
- **SDK:** none.
- **MCP:** none.
- **CLI:** none.
- **Tests:** FGSR = 0; FUR reported; UNDETERMINED precision/recall; adequacy
  matrix; determinism; legacy compatibility; no network.
- **Benchmarks:** FGSR, FUR, gap recall, projection/runtime bounds.
- **Risks:** oracle bias; hand-author and independently review labels.
- **Acceptance:** FGSR = 0 on the deterministic corpus; `pnpm check` green;
  docs mark the layer `[EXPERIMENTAL]` with explicit limits.
- **What not to build:** probability calibration or a "confidence" score.

**Implementation record (2026-10-28).** The corpus is inline in
`goal-satisfaction-evaluation.test.ts` because every fixture needs a full
`ChangeSession`; it covers the RFC's safety cases plus forbidden/preserve
unknowns and unsupported-language predicates. The recorded run is 27 cases with
FGSR `0`, FUR `0`, gap recall `1`, `mismatches: []` and
`deterministic: true`. The evaluator and adequacy matrix also have focused unit
tests, while SDK, MCP and CLI tests exercise the real lifecycle. These remain
deterministic offline fixtures with hand-authored labels; they are not
independently reviewed production data and do not establish agent quality.

### 20.3 Hardest problems (ranked)

1. **Intent-to-criterion completeness.** No deterministic system can prove it
   captured everything the user meant. Mitigation: explicit outcomes, MUST/SHOULD
   priority, open decisions, adoption, and `UNDETERMINED` when coverage is
   incomplete. This is unsolved in general and must be stated as a limitation.
2. **Evidence adequacy.** A passing test is not a behavioral proof. Mitigation:
   `CriterionAssertion` × evidence matrix, `investigates` scope, `partial` by
   default, no model-set adequacy.
3. **Adoption quality.** Humans may rubber-stamp a model draft. Mitigation:
   staged drafts, explicit decisions, reasons for dismissal, weakening detection,
   and receipts that name the adopted contract version.
4. **Structural vs semantic spec conflict.** Deterministic code can only detect
   structural contradictions. Mitigation: route semantic ambiguity to
   `OpenDecision` and `UNDETERMINED`.
5. **Behavioral differential without language semantics.** Only TS-family
   contract deltas are conservative. Mitigation: `unknown` by default, no
   equivalence claim, opt-in paired runs.
6. **Coverage without a second graph.** Extending the projection risks graph
   explosion and duplicate truth. Mitigation: projection-only, caps, no store.
7. **Status laundering.** Users and agents want to read a green test as a green
   goal. Mitigation: three statuses, separate fields, tests that assert no
   promotion path.
8. **Migration and compatibility.** Existing sessions, receipts and scripts must
   keep working. Mitigation: optional fields, dual read, unchanged `completion`,
   opt-in exit code.
9. **FGSR oracle validity.** A benchmark is only as good as its independent
   labels. Mitigation: hand-authored oracle, independent review, adversarial
   fixtures, determinism checks.
10. **Untrusted model path.** Prompt injection and overreach. Mitigation: strict
    allowlist, no actions/levels/verdicts, explicit adoption, deny filters.

### 20.4 Explicitly deferred

- `ScenarioGraph` and scenario-based acceptance.
- Full behavioral differential execution / differential testing.
- Semantic spec-conflict detection via LLM/NLP adjudication.
- Auto-adoption of any model draft.
- New MCP tools or a new MCP profile.
- A new package, database, graph store or goal store.
- Per-contract semantic budgets.
- External attestations, signed receipts or cross-organization trust.
- Cross-repository or portfolio goal contracts.
- Verification-economy execution (design only).
- Automatic test synthesis or autonomous repair.
- Probability/confidence scores for goal satisfaction.
- `atlas goal` as a top-level command.
- A `GoalContracts` SQL table (revisit only with measurements).

### 20.5 Success criteria

The RFC is successful when all of the following hold:

1. ADR-029 is accepted and the matrix is reviewed.
2. Phases 0–6 are merged with `pnpm check` green and no regression to the
   existing proof suite.
3. No code path allows a model, MCP caller or receipt to set goal status;
   tests assert this for every entry point.
4. A session with no adopted contract reports `UNDETERMINED`, never
   `SATISFIED`.
5. A passing test suite cannot produce `SATISFIED` for a criterion whose
   assertion is `runtime-behavior`; the adequacy matrix is tested.
6. The MCP proof profile still has exactly seven tools.
7. `atlas prove` remains the only top-level proof command; default exit codes are
   unchanged.
8. FGSR = 0 on the deterministic corpus at Phase 12, with FUR and UNDETERMINED
   precision reported.
9. Portable export/import preserves intent and discards verdicts.
10. Documentation marks the layer `[EXPERIMENTAL]` with the limitations above and
    never claims universal correctness or measured agent-quality improvement.

### 20.6 Open decisions for review

| # | Decision | Recommendation |
| --- | --- | --- |
| 1 | `schemaVersion` bump vs optional fields | Stay at 1 while optional; decide at Phase 10 based on measurements. |
| 2 | SHOULD/MAY blocking policy | SHOULD is reported but non-blocking; MAY is advisory. |
| 3 | `--require-goal` default | Keep opt-in in this RFC; revisit after the Phase 12 gate. |
| 4 | New action kinds vs polarity flag | New `text-present` and `symbol-exists` kinds; clearer validation and MCP schema. |
| 5 | Draft slot | Separate `proposedGoal` from `proposed` obligations to keep intent review distinct. |
| 6 | Persist `goalStatus`? | Recompute; persist only in the receipt. |
| 7 | `review-only` policy | Never sufficient for MUST; may resolve an open decision at L1. |
| 8 | Goal contract ID | Deterministic digest of session ID + content hash; version increments on adoption. |

---

## Appendix A — Reuse map (what not to rebuild)

| Need | Reuse |
| --- | --- |
| Session identity, versions, bounds | `ChangeSession`, `ProofStore`, `save`/`observe` |
| Proposal staging and dismissal | `stageProposals`, `dismissProposals`, `proposalDecisions` |
| Model calls and usage limits | `ProviderPort`, `withUsageTracking`, `proposeObligations` pattern |
| Repository observation | `observe`, `RepositoryRevision`, `snapshot` |
| Invalidation | `invalidateEvidence`, `changedPaths`, `topologyChanges` |
| Obligation evaluation | `evaluateProof`, `ProofNodeState` |
| Blindspots and ranking | expected-investigation BFS, `rankCoupling`, `investigatedPaths` |
| Contract identity | `RepositoryArtifact.contracts`, `publicContracts` |
| Execution | `VerificationAction`, `repository.execute`, `--approve-commands` |
| Graph projection | `projectProofGraph` |
| Portable intent | `exportState`, `importState`, `HandoffState`, `renderHandoffPrompt` |
| CLI/MCP delivery | `registerProve`, `registerProofTools`, `project` |
| Benchmark pattern | `mutation-evaluation.test.ts` |

## Appendix B — Status vocabulary used in receipts

| Field | Values | Meaning |
| --- | --- | --- |
| `testStatus.outcome` | `passing`, `failing`, `mixed`, `not-run`, `stale` | Execution facts only. |
| `proofStatus.completion` | `proven`, `not-proven`, `blocked` | Existing proof completion. |
| `goalStatus` | `SATISFIED`, `PARTIALLY_SATISFIED`, `UNSATISFIED`, `UNDETERMINED` | Adopted-intent judgement. |
| `coverage.status` | `complete`, `partial`, `absent` | Whether obligations cover adopted intent. |
| `intentDebt` | structured items | Unresolved intent. |
| `debt` | structured items | Unresolved proof. |

No field is a probability, percentage or confidence score.
