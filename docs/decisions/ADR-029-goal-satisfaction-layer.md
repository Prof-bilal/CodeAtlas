# ADR-029: Goal satisfaction layer over the proof kernel

Status:     Accepted — implemented as [EXPERIMENTAL], 2026-10-28
Date:       2026-10-28
RFC:        [Goal Satisfaction Engine](../rfcs/goal-satisfaction-engine.md)
Matrix:     [Capability matrix](../rfcs/goal-satisfaction-matrix.md)
Related:    [ADR-028](./ADR-028-temporal-proof-kernel.md),
            [ADR-018](./ADR-018-verification-command-policy.md),
            [ADR-025](./ADR-025-task-ledger-handoff.md)

## Context

The implemented proof system answers a narrow, honest question: given explicit
proof obligations, does the observed repository state support them at their
declared levels? It does not answer whether a change achieved the user's goal,
because there is no structured goal. The only intent representation is
`ChangeSession.goal: string` (`packages/core/src/domain/proof.ts`), and
`ChangeReceipt.completion === "proven"` means proof completion, not goal
satisfaction.

Users and agents nevertheless read a passing test suite or a proven receipt as
"the goal is met". That is a status-laundering risk: execution facts, obligation
support and intent satisfaction are three different claims.

The existing kernel already contains the right seams: versioned sessions,
proposal staging and dismissal, revision-bound evidence, monotonic invalidation,
proof debt, blindspots, guarantee ceilings, receipts, portable import and a
seven-tool MCP profile. A goal layer can be added without a second proof system
if it is built as an additive projection and evaluator over those seams.

## Decision

Add a **Goal Satisfaction Layer** to `packages/proof`, with contracts in
`packages/core`, composition in `packages/sdk`, and delivery through the existing
`atlas prove` lifecycle and seven-tool MCP profile.

The layer consists of:

1. An optional, versioned `GoalContract` stored inside `ChangeSession`:
   desired outcomes (MUST/SHOULD/MAY), acceptance criteria (with an explicit
   `CriterionAssertion`), preserve contracts, forbidden outcomes, non-goals and
   open decisions.
2. A conservative `proposeGoalContract` compiler whose output is an untrusted
   draft; only an explicit human/host adoption can create adopted criteria.
   Model output may not contain actions, levels, severities, verdicts or
   evidence.
3. `IntentDebtItem[]`, separate from `ProofDebtItem[]`.
4. `projectGoalCoverage(session)`, an extension of `projectProofGraph`; no new
   graph database or goal store.
5. A deterministic evidence-adequacy matrix that maps criterion assertions to
   permitted evidence kinds and levels. A passing test cannot satisfy a
   `runtime-behavior` criterion.
6. A deterministic four-state goal evaluator (`SATISFIED`,
   `PARTIALLY_SATISFIED`, `UNSATISFIED`, `UNDETERMINED`) with exact precedence
   and anti-vacuity rules.
7. A `GoalSatisfactionReceipt` that extends `ChangeReceipt` without changing the
   meaning of `completion`.
8. A three-status UX: test status, proof status and goal status are always shown
   separately.
9. An offline benchmark whose primary safety metric is **False
   Goal-Satisfaction Rate (FGSR)**, gated at 0 on the deterministic corpus.

The governing invariant is unchanged in spirit from ADR-028:

> Models propose interpretations; deterministic code owns identity, validation,
> evidence adequacy and status; humans adopt intent; mutations invalidate
> evidence; uncertainty resolves to `UNDETERMINED`, never to fake confidence.

## Alternatives

| Alternative | Why rejected |
| --- | --- |
| Keep `goal: string` and add more proof obligations | Cannot represent preservation, prohibition, non-goals or ambiguity; still no coverage or adequacy judgement. |
| Add a second goal database/store | Splits session identity, invalidation and receipts; violates the single durable proof store. |
| Add a second graph service | `projectProofGraph` is already a projection of authoritative state; a second graph would duplicate truth. |
| Let an LLM judge goal satisfaction | Violates ADR-028 and the repository's trust model; produces unexplainable, non-deterministic verdicts. |
| Add `atlas goal` and `atlas_goal_*` MCP tools | Violates the single `atlas prove` lifecycle and the seven-tool budget; multiplies schema drift. |
| Use a probability/confidence score | Fake precision; the repository deliberately uses discrete statuses and reasons. |
| Auto-adopt model-proposed criteria | Destroys the human adoption boundary and the audit trail. |
| Rename `completion` to `goalStatus` | Breaking change for every existing receipt consumer; conflates proof and goal semantics. |
| Full behavioral equivalence / differential execution | Semantically unsolved and out of scope; conservative `unknown` is the honest default. |

## Consequences

Positive:

- The product can distinguish **tests passed**, **proof supported** and **goal
  satisfied**, with reasons and blockers for each.
- Intent gaps become visible before completion is claimed.
- The layer reuses the existing proof DAG, evidence, invalidation, persistence,
  CLI and MCP surfaces; no new package, database, graph store or tool.
- `UNDETERMINED` is a first-class, defensible outcome instead of a failure to
  fake confidence.
- FGSR gives the project a measurable safety property for the new claim.

Negative / costs:

- More session document content; bounded by 64 criteria, 128 outcomes and the
  existing 8 MiB session limit.
- More user-facing review work (adoption, open decisions).
- Adequacy is conservative and will report `partial`/`unknown` more often than a
  naive checker.
- Behavioral differential remains TS-family/contract-level and `unknown`
  elsewhere.
- The goal layer cannot prove criteria completeness; that limitation must remain
  explicit in docs and receipts.
- New tests and an offline benchmark increase CI time modestly.

Neutral / follow-ups:

- `ChangeSession.schemaVersion` stays 1 while `goalContract` is optional; a
  later bump to 2 (with dual read) is possible if a required contract is needed.
- `proof.db` stays v3; a `GoalContracts` table is deferred until measurements
  justify it.
- `atlas prove` gains `goals`, `adopt` and `coverage` operations but no new
  top-level command.
- `--require-goal` is opt-in; the default exit code remains proof-based until the
  Phase 12 benchmark and a release note.
- Control-plane goal gating is out of scope for this ADR.

## Implementation boundary

This ADR is accepted and the RFC's phases (0–12) are implemented as
`[EXPERIMENTAL]`. Release evidence is the deterministic 27-case corpus (FGSR
`0`, FUR `0`, gap recall `1`, deterministic) and the full local `pnpm check`;
see [goal satisfaction release evidence](../proof-system/14-goal-satisfaction.md).
The explicitly deferred list (scenario graph, semantic conflict adjudication,
full behavioral differential, verification-economy execution, external
attestations, new tools/stores, probability scores) remains out of scope. The
layer is opt-in: the default receipt/exit contract is unchanged, and no claim
beyond `[EXPERIMENTAL]` is made.
