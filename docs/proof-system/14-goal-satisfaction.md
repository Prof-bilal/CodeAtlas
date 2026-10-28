# Goal satisfaction layer — implementation and release evidence

Status: **[EXPERIMENTAL]**, 2026-10-28. This document records what the additive
goal-satisfaction layer actually implements, the evidence used for its first
release gate, and the limits that remain. It does not claim general goal
correctness, behavioral equivalence, live-agent improvement or production
calibration.

Governing design: [Goal Satisfaction Engine RFC](../rfcs/goal-satisfaction-engine.md),
[capability matrix](../rfcs/goal-satisfaction-matrix.md),
[ADR-029](../decisions/ADR-029-goal-satisfaction-layer.md).

## 1. What changed

The layer is an additive projection over the existing temporal proof kernel. It
adds no package, database, graph store, top-level CLI command or MCP tool.

| Area | Implementation |
| --- | --- |
| Contracts | `packages/core/src/domain/goal.ts`, `ports/goal.port.ts`: optional goal contract/draft, reports, intent debt, coverage, differential and receipt types. `ChangeSession.goalContract` and `goalContractHistory` remain optional. |
| Adoption | `packages/proof/src/service.ts`: strict draft validation, explicit approval, deterministic IDs, linked proof obligations, generated forbidden/preserve obligations, history (last 8), stale evidence on change, idempotent re-adoption. |
| Evaluation | `packages/proof/src/goal-truth.ts`: adequacy matrix, four-state status, intent debt, coverage, blindspots, drift/spec conflicts, unintended outcomes, blockers and ceiling. |
| Differential | `packages/proof/src/differential.ts`: conservative structural comparison with `status: "unknown"`; it never claims behavioral equivalence. |
| Receipt | `GoalSatisfactionReceipt` extends `ChangeReceipt` with separate `testStatus`, `proofStatus`, `goalStatus`, intent debt, coverage, criterion states and blockers. Legacy `completion` / `policyVersion` keep their meanings. |
| Export/import | Export is additively v2 (`exportVersion: 2`, `goalIntentDebt`); import accepts v1/v2, discards verdicts/evidence/adoption, and re-stages adopted intent as an unadopted draft. |
| CLI | `atlas prove goals|adopt|coverage`, plus opt-in `--require-goal`. Default receipt and exit behavior are unchanged. |
| MCP | Goal draft/adopt/dismiss inputs on `atlas_understand`, goal projections on existing tools. `PROOF_TOOL_NAMES` remains exactly seven. |
| Predicates | Read-only `text-present`, `artifact-exists`, and TS/JS-family `symbol-exists`; verification still runs only through `atlas prove verify` / `atlas_verify`. |

## 2. Status ownership and precedence

Deterministic code alone computes IDs, adequacy, status, receipts and the goal
judgement. No model, MCP caller or receipt can set goal status. There is no
probability, percentage or confidence field.

Goal status is one of `SATISFIED`, `PARTIALLY_SATISFIED`, `UNSATISFIED` or
`UNDETERMINED`. Precedence is `UNSATISFIED` → `UNDETERMINED` →
`PARTIALLY_SATISFIED` → `SATISFIED`.

The evaluation is deliberately fail-closed. In particular, `UNDETERMINED` is
returned for:

- no adopted contract, no `MUST` outcome, or an unmapped `MUST` outcome;
- an unlinked/ambiguous criterion, an open blocking decision, or an unadopted
  staged draft;
- an unevaluated forbidden predicate or an unverifiable preserve contract;
- incomplete observation, stale/unknown `MUST` evidence, or review-only `MUST`
  evidence;
- a coverage blindspot, contract history newer than the adopted contract, a
  boundary mismatch, or a non-goal overlap;
- any blocking intent debt or linked proof debt;
- a required level the host has not approved through its verification catalog.

`PARTIALLY_SATISFIED` is used only when the evidence is adequate but below the
declared level, or explicitly partial, and no higher-severity condition applies.
A passing test is never sufficient for `runtime-behavior`; test evidence without
`investigates` scope is at best partial. `review-only` can never produce
`SATISFIED`.

Forbidden/preserve intent materializes as ordinary proof obligations. It is not
a second verification path: `verify` remains the only execution path.

## 3. Release evidence

Primary benchmark command:

```bash
pnpm vitest run packages/proof/tests/goal-satisfaction-evaluation.test.ts
```

Recorded result on 2026-10-28:

```json
{"cases":27,"fgsr":0,"fur":0,"gapRecall":1,"mismatches":[],"deterministic":true}
```

- **FGSR (False Goal-Satisfaction Rate):** `0` on the deterministic corpus. No
  case reported `SATISFIED` when the hand-authored oracle said otherwise.
- **FUR (False Unsatisfaction Rate):** `0` on this corpus; reported for
  over-conservatism, not treated as sufficient safety evidence.
- **Coverage-gap recall:** `1`; seeded missing/unmapped/open/unknown gaps were
  reported.
- **Determinism:** `true`; two evaluations of identical input serialized
  identically.
- **Adequacy matrix:** focused assertions cover sufficient/partial/insufficient/
  unknown rows, including artifact presence, literal presence/absence, type
  soundness, test evidence, runtime probes and review-only evidence.

The corpus is inline in `goal-satisfaction-evaluation.test.ts` because each case
builds a full `ChangeSession`. It includes satisfied and partial cases,
forbidden and preserve failures, unevaluated forbidden/preserve intent, stale
evidence, incomplete observation, unmapped `MUST` outcomes, open decisions,
contract drift/conflict, boundary/non-goal violations, unsupported-language
symbols, test-without-investigation evidence, prompt-injection-looking repository
text and unrelated failing tests. Labels are hand-authored; they have not been
independently reviewed as production ground truth.

Supporting focused tests:

- `packages/proof/tests/goal-truth.test.ts` — evaluator, adequacy, debt,
  blindspots and determinism.
- `packages/proof/tests/goal-adoption.test.ts` — adoption, staling, generated
  forbidden/preserve obligations and safety rejection.
- `packages/proof/tests/goal-contract.test.ts`,
  `goal-compiler.test.ts`, `goal-graph.test.ts` — contracts, compiler, coverage.
- `packages/sdk/tests/goal-sdk.test.ts`,
  `goal-predicates.test.ts` — SDK lifecycle, receipts, export/import and
  read-only predicates.
- `packages/mcp/tests/proof.test.ts` — seven-tool profile, goal adoption and
  projections.
- `apps/cli/tests/prove.test.ts` — independent statuses, default exit behavior,
  `--require-goal`, `goals`/`adopt`/`coverage`.

The focused proof/SDK/MCP/CLI run passed **73 files / 804 tests**. `pnpm
typecheck`, `pnpm lint`, `pnpm format:check` and the full workspace `pnpm check`
passed on 2026-10-28 with **172 files / 1,652 tests** under Node 24.22.1 / pnpm 9.15.0. The MCP audit suite has a
15-second per-test timeout and has timed out under heavy parallel load in one
run, so rerun `pnpm check` on the target Node 22.13+ environment before
publishing; it passed both in isolation and in the recorded full run.

The cold packed-CLI smoke (`pnpm release:smoke --online`) also passed from the
production tarball under the same runtime. It exercises begin/verify/prove,
adopts the smoke goal, verifies its linked absence obligation, checks
`--require-goal`, then mutates the source and confirms the default receipt and
goal gate both fail. The smoke does not use a provider or live agent.

## 4. Limits and non-goals

- **Intent completeness is undecidable.** The engine can prove the adopted
  criteria, not that adoption captured everything the user meant. Missing intent
  is surfaced as `UNDETERMINED` where detectable, never guessed.
- **The benchmark is offline and small.** FGSR `0` on 27 hand-authored cases is
  a safety smoke test, not a statistical guarantee or live-agent evaluation.
  Production/agent evidence would need paired, blinded runs and independent
  labels.
- **Adequacy is a fixed matrix, not semantic understanding.** Passing tests,
  type checks and literal checks are evidence classes with explicit limits.
  Dynamic consumers, generated code and deployment behavior remain unknown.
- **`symbol-exists` is TS/JS-family only.** Missing grammars or unsupported
  languages degrade to `unknown`, not language-wide absence.
- **The differential is structural.** It reports changed/preserved structure
  conservatively and remains `unknown` about behavioral equivalence.
- **Forbidden/preserve detectors are read-only and narrow.** Explicit adoption
  supports `text-present`, `artifact-exists` and `symbol-exists`; direct
  contracts may also carry `text-absent`. Model drafts cannot supply commands or
  execution instructions.
- **No confidence scores.** The layer intentionally has no probability,
  percentage or model-authored confidence; `UNDETERMINED` is preferred over fake
  certainty.
- **Opt-in only.** Goal status is additive. A default receipt still exits `1`
  only when proof completion is not `proven`; `--require-goal` adds a separate
  exit condition.
- **No new surface.** No `atlas goal` command, no `atlas_goal_*` tool, no new
  package/store/graph. The seven-tool MCP profile is fixed.

## 5. Release checklist

- [x] Core/proof/SDK/MCP/CLI implementation and focused tests.
- [x] Offline FGSR/FUR/gap-recall/adequacy/determinism corpus passing.
- [x] Typecheck, lint and format checks green.
- [x] Docs distinguish `[EXPERIMENTAL]` implementation from general correctness.
- [x] Final `pnpm check` green on the local Node 24.22.1 environment (172 files /
  1,652 tests); rerun on the Node 22.13+ target before publishing. The MCP audit
  suite is load-sensitive and timed out once under parallel load, then passed
  both in isolation and in the recorded full run.
- [x] Cold packed-CLI smoke passed (`pnpm release:smoke --online`), including the
  goal adoption/verification/`--require-goal` lifecycle.
- [ ] Independent review of the corpus labels and a larger held-out set before
  any claim beyond `[EXPERIMENTAL]`.
