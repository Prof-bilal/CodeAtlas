# MCP, CLI and SDK API

## Compatibility and selection

The default MCP context profile retains all existing tools/aliases/resources.
Opt into exactly seven proof tools with `atlas mcp --profile proof`, SDK
`createMcpServer({toolProfile: "proof"})` or standalone `ATLAS_MCP_PROFILE=proof`.
The ChatGPT plugin's existing adapter profile remains unchanged.

All proof tools have `readOnlyHint:false`: even status/context/check refresh and
persist a proof projection. Tool results use `{result, nextSteps}`; failures are
`isError:true` text without structured success content. Report projections omit
full hash snapshots, include revisions/debt/limitations, and enforce a 100,000
character response cap. The proof profile is local stateful orchestration, not
a claim that existing read-only tools gained execution authority.

## Seven tools

- `atlas_begin_change`: goal, optional boundary/authorized paths/budget/proposals;
  also optional `goalContract` (already-adopted intent) or `proposedGoal`
  (unadopted draft). Captures baseline and compiles explicit state. Default has
  an unproven goal. Alternatively portableState rebinds exported intent with new
  local IDs/baseline, discarding imported evidence and approval.
- `atlas_understand`: changeId and proposals; adds/revises versioned requirements,
  constraints, claims and obligations with resolved prerequisites.
  Optional `goalDraft` stages goal intent without adopting it; `adoptGoal` with
  `approved:true` and explicit criterion keys adopts it; `dismissGoal` requires
  bounded reasons. Adoption assigns deterministic IDs, links obligations, stales
  intent-bound evidence and is idempotent for identical contract content.
  `propose:true, approved:true` requests staged model proposals only when a host
  configured ProviderPort/usage. An approved justifications array links mutation
  scopes to existing intent nodes; it never bypasses constraints or evidence.
  Approved dismissals require explicit reasons and retain decisions in history;
  empty proposal updates cannot silently clear unreviewed work.
- `atlas_context`: changeId and optional token budget (512–12,000); existing
  WorkPacket plus compact proof status focused on unresolved work.
- `atlas_check`: changeId; observes mutations, invalidates and recomputes debt.
  Optional agentMiss records safe observed artifact co-occurrence and a hashed
  reason for advisory failure memory, never evidence or automatic causality.
- `atlas_status`: changeId; same fresh observation and compact status projection.
  Optional exportState exports portable intent/state; historyAfter pages compact
  immutable revision/node history without dumping archived snapshots into context.
  Goal projections include separate `goalStatus`, criterion/coverage/debt
  summaries and blockers; they never replace `completion`.
- `atlas_verify`: changeId and nodeId; executes the node's stored action. No
  executable, verdict or arbitrary evidence body can be supplied by the caller.
- `atlas_prove`: changeId; computes fresh completion and persists a receipt. The
  receipt keeps legacy `completion`/`policyVersion` and adds separate
  `goalStatus`, `goalPolicyVersion: 1`, intent debt, coverage and criterion buckets.

Goal inputs and projections are additive to the same seven tools; there is no
`atlas_goal_*` tool. A model, caller or receipt cannot supply a goal status.

Command execution requires `proofCommands` supplied to createMcpServer by the
host. The stdio/CLI proof profile starts with no approved commands. Static checks
are still usable. An application wanting commands must explicitly configure them
through the SDK API; no environment variable imports arbitrary repository commands.
Hosts may pass proofOptions for ProviderPort/usage/runtime adapters. The proof
profile automatically starts and closes the SDK's existing incremental watcher.

## SDK and CLI

`createProofSDK({repositoryPath, commands?, historyCommits?})` provides begin,
understand, revise, check, verify, prove, goal, goalGraph, adoptGoal,
stageGoalDraft, dismissGoalDraft, differential, exportState, importState,
authorize, stageProposals, dismissProposals, propose, graph, history, watch,
recordAgentMiss and close.
Inputs/outputs use core types re-exported by the SDK. ProofPort and the store/
repository ports allow deterministic offline tests without model credentials.

CLI operations:

```text
atlas prove begin --input change.json
atlas prove understand <changeId> --input proposals.json
atlas prove check <changeId>
atlas prove status <changeId>
atlas prove verify <changeId> --node <nodeId> [--approve-commands]
atlas prove goals <changeId>
atlas prove adopt <changeId> --input goal.json
atlas prove coverage <changeId>
atlas prove <changeId> [--require-goal]
atlas prove receipt <changeId>
atlas prove export <changeId>
atlas prove import --input exported.json
atlas prove authorize <changeId> --input justifications.json
atlas prove history <changeId>
atlas prove watch
```

`--repo` selects the repository. JSON output is machine-readable. A receipt with
not-proven/blocked sets exit status 1. `--require-goal` adds a separate exit
condition: it exits 1 unless `goalStatus` is `SATISFIED`; it does not change the
default receipt exit behavior or turn a goal status into proof completion.
`goals` returns the full goal report, `coverage` returns the coverage projection,
and `adopt` accepts a staged draft or `{draft, criterionKeys}` with explicit
adoption. Export re-observes first; it is portable data, not authority to accept
evidence in another checkout. Legacy `atlas verify` retains its existing
behavior; callers must use proof receipts for the new gate. Inputs are bounded,
non-redirected JSON files. SDK callers close watches before close(); watch
shutdown drains the current indexing/invalidation callback.

Goal status remains `[EXPERIMENTAL]`; see
[goal satisfaction release evidence](./14-goal-satisfaction.md).
