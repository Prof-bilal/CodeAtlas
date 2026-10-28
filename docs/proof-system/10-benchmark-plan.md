# Mutation-proof evaluation

Reuse Vitest, temporary fixture repositories and existing SDK/MCP fixture
patterns. ADR-023 removed the old benchmark package/server; this evaluation
requires neither to return. Unit and integration tests remain offline.

## Deterministic corpus

The initial executable corpus is `packages/proof/tests/mutation-evaluation.test.ts`:
48 scripted timelines over six named source areas and eight mutation/control
cases. It reports invalidation recall/noise, incorrect proven outcomes and
propagation/store p50/p95. It isolates proof logic with injected execution;
SDK/MCP integration suites separately exercise real files and commands. It is
not a benchmark of real agents or six independently curated production repos.

`packages/proof/tests/coupling-evaluation.test.ts` adds six frozen ranking fixtures
with independent missed-artifact labels, deliberate noise and an undersampled
rare dependency. It reports static-only versus full-signal Recall@2 and precision
without tuning weights against those fixtures. This is an executable ablation
sanity check, not held-out production evidence or measured agent improvement.
`packages/sdk/tests/proof-lifecycle.test.ts` exercises source/Git-only watch events,
cross-client leases, proposal approval/usage, conservative contract falsification,
environment invalidation, action adoption and revision-bound runtime adapters.

`packages/proof/tests/goal-satisfaction-evaluation.test.ts` is a separate offline
corpus for the goal-satisfaction layer. It measures False Goal-Satisfaction Rate
(FGSR), False Unsatisfaction Rate (FUR), coverage-gap recall, adequacy-matrix
rows and determinism. The recorded 27-case run reports FGSR `0`, FUR `0`, gap
recall `1` and deterministic output. Labels are hand-authored; this is not an
independent production benchmark. See
[goal satisfaction release evidence](14-goal-satisfaction.md).

Build baseline repositories with known requirements, explicit obligations,
source graphs and hidden mutations: function body, shared interface, added
consumer, removed dependency, failing supporting test, changed configuration,
requirement rewrite, no-op update, formatting-only edit and edit-during-check.
Keep ground-truth affected obligations separate from inputs to the agent.

Run each timeline through both SDK and MCP. Compare indexed effects with hidden
expected effects; do not use the proof engine itself as the oracle. Core tests
inject revisions/results to isolate propagation. SDK tests mutate actual files
and execute harmless local commands. Record restart and concurrent-client cases.

Metrics:

- Invalidation recall: expected stale obligations detected / expected stale.
- False invalidation: independent fresh obligations unnecessarily reopened.
- False Proof Rate: invalid hidden mutations receiving proven receipts.
- False Done Rate: agent completion claims accepted despite hidden debt.
- Blindspot Recall@k and precision@k against independently labeled missed files.
- Verification cost: executed actions, wall time and dependent obligations settled.
- Context cost: estimated tokens, response bytes and MCP calls; separately label
  estimates and actual provider usage through existing UsagePort.
- Latency p50/p95: observe/scan, hash, index update, propagation and persistence.
- Storage: bytes per session/revision and behavior at bounds.

## Agent evaluation

Use paired runs on the same model/task/commit with (a) existing context tools and
(b) proof profile. Fix budgets/permissions/provider versions; randomize run order,
use multiple seeds, blind the outcome grader and prevent hidden patch/history
leakage. Agents receive the same initial repository and user goal. Hidden tests
determine correctness; an LLM explanation is not the primary grader.

Report confidence intervals and per-task outcomes. Tune coupling thresholds on
training cases only; ablate static-only, static+history and full memory ranking.
Do not infer False Done improvement from scripted lifecycle tests. V1's offline
tests demonstrate known invariants, not statistical evidence of agent quality.

## Release criteria

Deterministic gates require every seeded critical supporting mutation to reopen
proof, zero proven receipts for missing/stale/contradicted critical checks, and
explicit unknowns on unobservable evidence. These are fixture acceptance gates,
not a claim of zero false proofs on arbitrary software. Freeze performance and
token baselines before setting regression thresholds; publish p95 and absolute
cost alongside deltas. Live-agent quality must be non-inferior at comparable
budget before default-on rollout; require measured improvement for any stronger
product claim.

## Earlier kernel checkpoint (2026-10-17)

- Workspace `pnpm build` passed; the affected storage/SDK/MCP/plugin/CLI bundles
  were also rebuilt after final lifecycle cleanup. Existing CommonJS
  `import.meta` warnings remain; fresh-process ESM imports are tested.
- `pnpm check` passed with serial workspace typechecks and two Vitest workers:
  157 test files and 1,553 tests. The final run used the approved host environment
  because HTTP integration tests need localhost sockets. Earlier sandbox socket
  errors and stale-build subprocess failures were resolved in that run.
- The 48 scripted mutation timelines detected all 36 expected invalidations,
  with zero false invalidations on their 12 controls and zero incorrect proven
  outcomes. This is fixture correctness evidence, not a real-agent quality claim.
- SDK, CLI and real MCP transport tests exercise prove -> external edit -> stale,
  persistence/restart, failed checks, intent revisions, additions and command
  approval. A raw-byte hashing regression covers distinct invalid UTF-8 bytes.
- The rebuilt local index refreshed 38 files without a full parse rebuild.
  Legacy context budgeting/freshness limitations found during that check are
  recorded in the current architecture audit and remain outside this kernel change.

## Completed V1 follow-through validation (2026-10-17)

- Full workspace build passed. Core/storage/proof/SDK/MCP/extension/plugin/CLI
  were rebuilt again after the final changes; existing CommonJS import.meta
  warnings remain unrelated to this feature. Fresh-process ESM packaging tests pass.
- Final frozen-source pnpm check passed: **160 files, 1,577 tests**, including
  workspace typechecking, ESLint dependency boundaries and Biome formatting.
  Workspace package checks ran serially and Vitest used two workers; the approved
  host environment permitted the existing localhost integration tests.
- The 48 scripted mutation timelines still detected **36/36** expected
  invalidations, with zero false invalidations on the 12 controls and zero
  incorrectly proven outcomes. These are fixture results, not live-agent quality.
- Six frozen coupling fixtures yielded static Recall@2 of 2/6 versus full-signal
  5/6, with precision 5/7 and one missed rare dependency. Deliberate noise and
  undersampling remain visible; no weights were tuned or production gains claimed.
- Added coverage includes Git-only/source watching, watcher cleanup/restart calls,
  two-client leases and v2 migration, immutable history, environment/expiry staleness,
  model approval/usage/staging/reasoned rejection, portable rebinding, contract
  falsification, actual investigation scope, prioritized action adoption, safe miss
  memory, policy downgrade rejection and proof-gated cross-provider continuity.
- No live provider benchmark or production deployment probe ran. Those require
  explicit host configuration and remain release evidence, not fabricated results.
