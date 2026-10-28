# Public beta release contract

Candidate: **0.7.0-beta.1**, opt-in proof features. Publication is a separate
maintainer action. This is not a default-on correctness product or a GA release.
The CLI and its local stdio proof MCP profile are the launch surface. The ChatGPT
connector/store submission and private VS Code extension are not launch gates
for this CLI beta and are not declared ready by it.

## Guarantees and trust boundary

- `atlas prove begin` persists explicit goal, baseline, requirements and policy.
  An absent check, unsupported action, unknown result or insufficient level does
  not become passing evidence because an agent says it passed.
- `check`, `verify` and `prove` reobserve repository state. Hash/revision changes,
  newly discovered dependencies and expired/environment-mismatched evidence
  invalidate dependent proof through deterministic propagation. Watch adds
  continuous invalidation while the process is running; it is not a daemon.
- A proven receipt is scoped to that session's approved obligations, policy,
  observed artifacts, declared environment and reported guarantee ceiling.
  A failing completion gate returns CLI exit status 1.
- Commands execute through the existing verifier with argument arrays, not
  model-supplied shell strings. CLI verification requires `--approve-commands`;
  SDK/MCP hosts explicitly supply capabilities. Caller-owned command configs
  cannot change after approval by mutation of the original object.
- Provider proposals require explicit host setup, approval and usage accounting;
  they remain staged intent, never evidence. No production probe is implicit.
  Runtime evidence requires an explicit predicate, expiry and trusted exact-revision
  deployment binding. The beta's normal tests need no credentials or network.
- Portable imports discard old evidence, receipts and mutation approvals and
  establish a new local baseline. Imported JSON is not a transferable attestation.

These guarantees assume the local process, SQLite files and trusted host adapters
are not maliciously modified. The database is not a tamper-proof authority.

## Explicit limitations

The scanner's deny/ignore policy bounds observation. External services, ignored
files, generated inputs and toolchain changes not represented by the host can
affect behavior without appearing as repository evidence. Parser resolution is
partial in several languages. Coupling and blindspot ranking are heuristics,
not a complete semantic dependency analysis. Public-contract checks are conservative
supported ESM syntax checks, not general type or runtime equivalence.

Incremental reference coverage is also incomplete: the existing
`packages/sdk/src/indexing/indexer.ts` carries forward usage edges only when
neither endpoint was touched. An unchanged caller's usage edge into a changed
declaration can therefore disappear until that caller is reparsed or a full
index build is requested. File import edges are regenerated, but absence of a
usage edge must **never** establish absence of a consumer. Proof's literal
absence actions read observed source bytes rather than interpreting missing
graph edges as a pass; coupling/impact ranking remains advisory. This existing
indexing limitation is not solved by the beta packaging work.

Checks are not hermetic. Arbitrary editors/processes do not obey proof leases.
An edit reverted entirely between before/after observations can evade detection.
Runtime adapters and declared command levels are trusted; a poorly selected
test can pass while behavior remains wrong. Requirements and assertion coverage
need human/host review. Levels describe evidence, not universal assurance.
L3 is not automatically stronger than every possible L1 check for every claim.

History is bounded per record/page but retained over time; monitor local disk
growth. There is no automatic pruning policy. Whole-repository observation and
conservative command invalidation can be costly on large repositories. Watchers
are process-local, and distributed/federated proof authority is not implemented.

Fixture mutation/ablation tests exercise regressions, not independent empirical
agent quality. False Done improvement, real-world blindspot recall and verification
cost gains are **unmeasured**. Do not advertise such gains until the paired,
held-out evaluations in [10-benchmark-plan.md](10-benchmark-plan.md) run.

## Try the candidate without publication

```bash
pnpm install --frozen-lockfile
pnpm build
node apps/cli/dist/index.js --version
node apps/cli/dist/index.js prove --help
node apps/cli/dist/index.js mcp --root /absolute/path/to/repo --profile proof
```

Use the [first-run intent JSON](README.md#first-run). Save it outside the target
repository, run `prove begin --repo <root> --input <file>`, copy the returned
change ID and obligation ID, then run `prove verify <changeId> --repo <root>
--node <obligationId>` and `prove <changeId> --repo <root>`. Modify a supporting
source file and rerun the receipt: it must no longer be proven until reverified.
Removing a literal is an L1 example, not an authentication migration proof.

For a local MCP client configure command `node` and arguments
`["/absolute/path/to/CodeAtlas/apps/cli/dist/index.js", "mcp", "--root",
"/absolute/path/to/repo", "--profile", "proof"]`. After publication the command
can be `atlas` with the same `mcp` arguments. There are exactly seven proof tools;
the default context profile is unchanged. CLI hosts do not implicitly grant
arbitrary command or provider execution to MCP callers.

## Reproducible release gate

`pnpm release:check` builds the workspace, runs typechecks/lint/format/tests and
then `pnpm release:smoke --online`. This release gate deliberately requires registry
access for a cold production dependency install; ordinary `pnpm check` does not.
Keep package builds serial and cap Vitest workers on
small machines (CI sets workspace concurrency 1 and min/max workers 1/2).

`scripts/release-smoke.mjs` packs the real CLI, installs its production tarball
with lifecycle scripts disabled into a fresh temporary directory outside the
workspace, then checks its version, real Python symbol parsing/WASM, 13 bundled
Skills, an unproven → proven → mutated/unproven timeline and the installed stdio
MCP handshake/seven-tool profile. Temporary repositories are removed on exit.
No source aliases or workspace dependencies are available to the installed CLI.
The MCP client driver uses the existing protocol test dependency, not a second
server implementation. Separate SDK tests check CommonJS and isolated dist Skill
resolution; these do not substitute for a fully published library dependency train.

Standalone `pnpm release:smoke` is offline by default, using cached dependencies.
It fails explicitly if a tarball is absent from the cache; existing workspace
links alone do not establish cache completeness. The authoritative release/CI
gate uses a genuinely cold registry check by explicitly running
`pnpm release:smoke --online` with network permission. This does not publish.
CI repeats the gate on Ubuntu Node 22.13.0, current 22/24 and macOS Node 24. Configured CI coverage
is not evidence of a successful remote run; record actual run links before release.
The unflagged CLI was reproduced failing on the previously advertised Node 22.5.0
(`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`); candidate engine metadata and doctor
now require **Node >=22.13.0**. Windows remains unverified unless tested separately;
report failures rather than treating engine metadata as a test result.

## Maintainer publication checklist

1. Review/version the changes on a clean worktree. Keep unrelated research and
   experiments out of the release commit. Confirm no secrets or fixture outputs
   entered packed files. Record commit, Node/pnpm versions and gate output.
2. Run `pnpm release:check` (including its cold tarball smoke). Require green remote
   CI on the supported matrix. No credentials/provider calls are needed.
3. Check `pnpm view codeatlas-cli dist-tags --json` and the candidate version for
   collisions immediately before release. Read-only registry inspection is safe;
   publication requires maintainer approval and registry access.
4. `pnpm release:cli` reruns the gates and publishes **only** `codeatlas-cli` with
   `--tag beta`. All candidate publishable manifests default to the `beta` tag.
   Do not use `latest` or `--no-git-checks`. Never publish from this task implicitly.
5. The CLI is self-contained apart from its declared third-party runtime dependencies;
   it does not require unpublished workspace packages. If also publishing SDK/MCP
   libraries, publish their workspace dependency train first in topological order,
   all at the candidate version and beta tag, then independently test registry installs.
   This CLI gate alone does not authorize or validate that whole publication train.
6. After publication, install the exact version into a new directory, verify the
   version and repeat the proof timeline. Verify `latest` did not move. Only then
   announce `npm install -g codeatlas-cli@beta` and link these limitations.

## Recovery and rollback

Close watchers, MCP servers and SDK clients before backing up or restoring state.
Copy the entire `.codeatlas/` directory while closed, including proof.db and any
SQLite sidecars; do not copy an open SQLite file alone. Existing context indexing
is not replaced. Proof schema v1/v2 upgrades add history/leases; discarded older
versions cannot be recovered. Imports intentionally start new proof histories.

Before trying the beta on important work, keep that closed-state backup. To
revert binaries install the last known-good exact CLI version and stop using
proof commands. Do not assume an older binary can downgrade a newer proof.db;
restore the matching closed-state backup when rollback is needed. Do not delete
source files or silently discard proof history as a recovery step. A maintainer
may move/remove the `beta` dist-tag after a bad release; do not overwrite an
existing version or move `latest` to compensate. Preserve bug evidence and
publish a new prerelease after a regression test and a fresh gate.

## Release evidence

Local validation on Linux, 2026-10-17:

- `pnpm release:check` passed under Node 26.8.2 / pnpm 9.15.0: full workspace
  build, typecheck, lint, formatting, **163 test files / 1,584 tests**, then the
  cold production CLI tarball install and proof/MCP smoke.
- The complete **163 files / 1,584 tests** also passed under the corrected
  minimum runtime, Node 22.13.0, after the nested-transaction fix. That run
  exercises source services plus the rebuilt SDK and MCP entry points.
- Cold tarball install/smoke passed under Node 22.13.0 and Node 24.22.0.
  The Node 24 smoke was repeated against the final rebuilt candidate.
- Fresh-process CommonJS imports, isolated ESM/CJS Skill lookup, caller-owned
  approval mutation, legacy SQLite nesting/rollback/recovery and release-train
  metadata all have executable regressions.
- Frozen-lockfile offline workspace installation and `git diff --check` passed.
  Standalone offline tarball smoke could not find a cached tree-sitter asset;
  this is not recorded as a pass. The cold online release gate passed and is
  now the authoritative CI/release packaging gate.
- The repository context index was refreshed incrementally using the local CLI.
  Its unresolved imports/reference-coverage limits remain analysis limits, not
  proof of complete dependency discovery.

No package was published, no tag or commit was pushed, no remote CI result for
these uncommitted changes was established, and no live-agent quality trial or
production runtime probe ran. Before publication, maintainer review/clean versioned
state, remote CI (including macOS) and the post-publication registry smoke remain
required. Windows is not validated. This evidence supports a bounded public beta,
not GA or a measured improvement claim.

**Goal-satisfaction layer, 2026-10-28:** local `pnpm check` passed under Node
24.22.1 / pnpm 9.15.0 with **172 files / 1,652 tests**, including the 27-case
goal benchmark (FGSR `0`, FUR `0`, gap recall `1`, deterministic). The layer is
`[EXPERIMENTAL]` and opt-in; the default receipt/exit contract is unchanged.
Goal status is not part of the existing beta gate and does not establish
live-agent quality. The cold packed-CLI smoke also passed with the goal
adoption/verification/`--require-goal` lifecycle. See
[goal satisfaction release evidence](14-goal-satisfaction.md).
