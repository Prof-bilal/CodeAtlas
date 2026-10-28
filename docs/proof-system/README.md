# Mutation-aware change proof system

Status: **[EXPERIMENTAL]**, 2026-10-17. All nine scoped V1 phases now have executable
implementations, including lifecycle integrations and hardening described in
[implementation status](12-implementation-status.md). These documents distinguish
working capabilities from empirical release gates; they do not claim universal proof
of program correctness or measured improvement in agent quality.

The governing invariant is: models propose interpretations; executed repository
checks supply evidence; mutations invalidate evidence; proof dependencies
propagate loss of support upward.

## Index

- [Current architecture and audit](00-current-architecture.md)
- [Capability gaps and reuse decisions](01-gap-analysis.md)
- [Target architecture and ownership](02-target-architecture.md)
- [Data model, IDs and persistence](03-data-model.md)
- [Invalidation and propagation](04-invalidation-engine.md)
- [Proof compiler](05-proof-compiler.md)
- [Semantic coupling and memory](06-semantic-coupling.md)
- [Verification, debt and completion](07-verification-engine.md)
- [MCP and CLI API](08-mcp-api.md)
- [Implementation phases](09-implementation-phases.md)
- [Benchmark methodology](10-benchmark-plan.md)
- [Risks and difficult problems](11-risks.md)
- [Implemented follow-through, operation and limitations](12-implementation-status.md)
- [Public beta guarantees, packaging and release checklist](13-public-beta.md)
- [Goal satisfaction implementation and release evidence](14-goal-satisfaction.md)
- [ADR-028](../decisions/ADR-028-temporal-proof-kernel.md)
- **[EXPERIMENTAL]** [Goal Satisfaction Engine RFC](../rfcs/goal-satisfaction-engine.md)
  and [capability matrix](../rfcs/goal-satisfaction-matrix.md) — implemented
  test/proof/goal status separation, goal contracts, evidence adequacy and
  phases 0–12. Delivery is opt-in; the default receipt/exit contract is
  unchanged. See [release evidence](14-goal-satisfaction.md) and
  [ADR-029](../decisions/ADR-029-goal-satisfaction-layer.md).

## First run

Create an explicit JSON input, for example:

```json
{
  "goal": "Remove literal JWT references from src",
  "boundary": ["src"],
  "authorizedPaths": ["src"],
  "semanticChangeBudget": 5,
  "proposals": [
    {
      "key": "absence",
      "kind": "ProofObligation",
      "statement": "Literal JWT absent from observed src files",
      "minimumLevel": 1,
      "action": { "kind": "text-absent", "paths": ["src"], "target": "JWT" }
    },
    {
      "key": "goal",
      "kind": "Requirement",
      "statement": "Literal JWT absent from observed src files",
      "minimumLevel": 1,
      "dependsOn": ["absence"]
    }
  ]
}
```

Run `atlas prove begin --input change.json`, then
`atlas prove verify <changeId> --node <obligationId>` and
`atlas prove <changeId>`. Mutating supporting files before the last operation
reopens the proof. This example proves a bounded literal absence claim, not that
authentication behavior or dynamic consumers are correct.

For tests/builds, use an action of kind `command` whose target is a configured
verification category. The CLI requires `--approve-commands` on the verification
invocation. SDK callers pass explicit `ApprovedProofCommand` records. Command
definitions and claimed results cannot arrive through model-generated actions.

Run `atlas prove watch` for continuous local invalidation; the MCP proof profile
starts and closes the same SDK watcher automatically. `atlas prove history <id>`
reads immutable versions. `atlas prove import --input exported.json` recompiles
portable intent into a fresh local session without trusting old evidence,
receipts, IDs or authorizations. It establishes a new local baseline, not a signed
continuation of the original change's history.
