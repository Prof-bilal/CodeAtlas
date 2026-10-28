# V1 phase completion and operational contract

Status: **[EXPERIMENTAL]**, 2026-10-17. Phases 0–8 have executable implementations.
This means the bounded V1 described below, not general software correctness,
universal semantic equivalence, distributed proof authority or demonstrated
improvement on live coding agents. The original architecture audit describes
the pre-proof branch; this document records the follow-through on that foundation.

## Ownership and implementation

- `packages/core/src/domain/proof.ts` and `ports/proof.port.ts`: public entities,
  levels, proposal/evidence/action contracts and ports. Optional fields preserve
  existing session documents and task consumers.
- `packages/proof/src/service.ts`: sessions, bounded deterministic compilation,
  node versioning, proposal staging, explicit mutation authorization, safe intent
  import and completion receipts. `truth.ts`: old/new dependency BFS, AND proof
  propagation, expiry/environment invalidation, debt, explained investigation
  expectations and capability-based next actions. `graph.ts`: typed graph view of
  authoritative state, not a second graph database. `compiler.ts`: strict,
  bounded model proposal parsing through ProviderPort only.
- `packages/storage/src/proof-store.ts`: additive proof schema v3; context.db is
  unchanged. Atomic CAS writes append compressed immutable session versions.
  Owner-bound expiring SQLite leases serialize cooperating proof SDK processes.
  Decompression and page size are bounded; no silent audit-history pruning.
- `packages/sdk/src/proof/index.ts`: composition of scanner/hash/index/ContextSDK,
  verifier, usage, watcher and optional runtime inspection. Environment identity
  hashes declared toolchain/runtime/capability settings without persisting secrets.
  `semantic.ts` extracts line-stable exported declaration IDs and conservative
  syntax contracts; aliases retain private support declarations and dependency
  closure checks prevent simply ignoring referenced types.
- `packages/sdk/src/context-integration/{control-plane,task-ledger,work-packet,handoff}.ts`:
  optional proof change ID survives provider switches and budgets; an injected
  ProofPort prevents completion without a proven receipt. SessionPort and existing
  verification remain the only execution framework. No proof port means legacy
  behavior, not an implicit proof claim.
- `packages/mcp/src/proof.ts`: still seven tools, automatic continuous source/Git
  metadata watching, bounded staged proposals/history and safe portable rebinding.
  `apps/cli/src/commands/prove.ts`: begin/understand/authorize/check/status/verify/
  receipt/export/import/history/watch; only explicit configured commands execute.

## Running and host configuration

Begin with explicit obligations, verify their actions, then request a receipt.
Use `atlas prove watch --repo <root>` for a long-running local subscription; the
proof MCP profile manages this automatically. Watches are process-local services,
not an installed daemon. SDK users await watcher.close() before sdk.close().
Status/prove always reobserve, regardless of whether a watcher was available.

Model interpretation requires proposalProvider, proposalUsage and explicit
propose approval. WorkPacket bounds and deny filters apply; output is staged,
provenance-marked unresolved work. Adoption is explicit and no model can supply
evidence, authorization or command definitions through this path.

Host-approved commands have levels and optional investigates scopes. Their
invalidation scope remains global, but exit zero alone does not establish that
every file was investigated. Synthesized planner suggestions are marked
requiresAdoption; the host must review actual assertion coverage.

An explicit public-contract-unchanged constraint compares exported syntax from
baseline/current supported ESM sources and their indexed dependency closure.
Authorization does not bypass a failing constraint. Unknown CommonJS/global or
unsupported syntax cannot establish this check. Inferred contracts may report
implementation changes conservatively. This is an L1 syntax guarantee, not proof
of arbitrary inferred TypeScript compatibility or runtime behavior.

Host command definitions and runtime predicate data are snapshotted at creation;
mutating caller-owned configuration cannot silently replace an approval. Trusted
service/deployment callbacks remain host capabilities. Recreate the SDK with a new declared
environment identity when approved capabilities or external toolchains change;
the fingerprint is not a replacement for recording those external inputs.

Runtime L5 requires an approved InspectPort predicate and deployment adapter
binding the service to the exact working-tree revision before and after probing.
The host supplies environmentIdentity and a bounded TTL; response bodies,
headers and credentials are never copied to proof.db. No network probes run
implicitly and a mismatched deployment is unknown. Offline tests inject probes;
no production deployment has been verified by this implementation task.

Portable import recompiles intent with new local IDs and baseline, dropping all
old evidence, receipts and mutation approvals. It cannot certify the historical
change against the original checkout. Exported records remain untrusted local
data, not signed portable proof.

## Goal satisfaction layer (2026-10-28)

The additive goal-satisfaction layer is implemented behind `GoalPort` and
`ProofSDK` and delivered through the existing `atlas prove` lifecycle and
seven-tool MCP profile. It adds optional goal contracts, explicit adoption,
evidence adequacy, intent debt, coverage/blindspots, four-state goal status,
structural drift/specification checks, a conservative behavioral differential,
goal receipts, export v2 and opt-in `--require-goal`. Deterministic code alone
computes goal status; models, MCP callers and receipts cannot set it. The
default receipt and CLI exit contract are unchanged.

Release evidence is the deterministic 27-case corpus in
`packages/proof/tests/goal-satisfaction-evaluation.test.ts` (FGSR `0`, FUR `0`,
gap recall `1`, deterministic, no oracle mismatches). This is a safety smoke
test with hand-authored offline labels, not live-agent or general-correctness
evidence. See [goal satisfaction implementation and release evidence](14-goal-satisfaction.md)
for the status model, test locations and non-goals.

## Migration, safety and remaining release work

Opening v1/v2 proof.db adds history/leases and seeds the latest retained version;
previously discarded intermediate states cannot be reconstructed. Task changeId
is optional and validated; legacy v1/v2 task ledgers remain readable. Context
indexes and normal MCP tools are not replaced. Unrelated experiments are untouched.

Proof leases do not lock arbitrary editors or make checks hermetic. A mutation
that returns to identical bytes entirely between observations can evade detection.
Ignored/external files and unresolved parser/runtime coupling remain explicit
guarantee limits. Full rename/move identity, learned cost models, signed receipts,
generic alternative-proof algebra and advanced incremental frameworks are not
necessary V1 features and were not introduced.

Run the mutation, lifecycle, compiler, storage, SDK, control-plane, CLI and MCP
tests plus pnpm check. The executable mutation corpus remains a fixture gate,
not an independently validated live-agent benchmark. Before default-on release,
run paired held-out agents with fixed budgets and hidden deterministic tests as
specified in 10-benchmark-plan.md. Do not claim lower False Done rates or tuned
coupling weights until those experiments actually run.

Pre-launch-hardening local validation: workspace build plus refreshed affected bundles passed;
pnpm check passed all 160 test files / 1,577 tests, typechecks, lint and formatting.
See [recorded evaluation](10-benchmark-plan.md) for fixture metrics and limits.
The [beta release checklist](13-public-beta.md) adds packaged-install and runtime
compatibility gates; its status must not be inferred from this earlier result.
