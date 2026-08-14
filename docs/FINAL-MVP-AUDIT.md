# Final MVP Audit

Audit date: 2026-08-13  
Scope: full repository, CLI, SDK, feature packages, tests, security boundaries,
packaging, and documentation.

## 1. Executive Summary

CodeAtlas has a substantial, well-tested SDK and package implementation. The
audit found and fixed a standalone CLI packaging failure, invalid JSON behavior
for approved toolkit installs, unsafe toolkit defaults, configuration of tools
that were not installed, and several stale documentation claims.

The public indexing workflow is now available through `atlas init`, `atlas
build`, and `atlas update`. A real run against CodeAtlas indexed 336 supported
files, 6,669 symbols, and 11,358 dependency edges; the following no-change
update reported zero false changes. `explain` and top-level `doctor` remain
outside this MVP increment.

## 2. Current Architecture

The repository is a pnpm/TypeScript monorepo. Contracts live in `@atlas/core`,
implementations live in feature packages, `@atlas/sdk` composes them, and the
CLI/MCP/extension consume SDK façades. The main data path is:

`scanner → hashing → parser → graph → storage → search → Context SDK`.

Agent sessions are behind `AgentPort`/`SessionPort`; provider behavior is
adapter-owned. Toolkit installation/configuration/security are behind core
ports and composed by the SDK.

## 3. MVP Scope

### Core MVP

- Scanner, manifest, hashing, TypeScript parser/symbol index, graph, SQLite
  context store, ranked search, Context SDK.
- MCP and VS Code SDK consumers.

### MVP supporting

- Agent executable detection, sessions, context-to-agent packaging, usage
  accounting, toolkit registry/manifest/compatibility/security/installer/
  configurator, and `atlas context`/`atlas tools` surfaces.

### Optional/future

- Standalone slash-command router (`atlas /<agent>`; the **`atlas tui`**
  slash surface and interactive TTY handoff are v2 / not shipped — source
  untracked), embeddings, extra
  language parsers, benchmarking, recommendations, setup wizard, and advanced
  marketplace behavior.

### Not implemented

- Deterministic `explain` and top-level `doctor`.
- `@atlas/context` ranking/assembly remains an intentional ADR-001 stub.

## 4. Completed Features

The package-level implementations are present and covered by tests. The
Context SDK, MCP, sessions, usage, context integration, Toolkit Tasks 19–25,
provider adapters, and extension all have real code rather than only roadmap
entries.

## 5. Missing Features

| Issue | Severity | Location | Impact | Status |
| --- | --- | --- | --- | --- |
| Fresh-repository indexing CLI | P1 | `packages/sdk/src/indexing/indexer.ts`, `apps/cli/src/commands/indexing.ts` | Required first-run workflow | Fixed and tested against a real repository |
| Top-level explain/doctor | P2 | `apps/cli/src/commands/{explain,doctor}.ts` | Diagnostics and explanations are unavailable from the main CLI | Open; outside the focused fixes |
| Context ranking package | P2 | `packages/context` | The legacy ContextBuilder port is unavailable; Context SDK has its own deterministic assembly path | Intentional stub, ADR-001 |

## 6. Bugs Found

| Issue | Severity | Location | Impact | Status |
| --- | --- | --- | --- | --- |
| CLI build externalized workspace SDK packages | P1 | `tsup.config.base.ts` | Built CLI crashed before help with a missing `createToolkitSDK` export | Fixed: workspace aliases are bundled with `noExternal` and root resolution is config-based |
| `tools install --yes --json` printed two JSON documents | P1 | `apps/cli/src/commands/tools.ts` | Machine consumers could not parse output | Fixed and regression-tested |
| Unsupported install methods silently defaulted to npm | P1 | `packages/sdk/src/toolkit/facade.ts` | A tool could run the wrong ecosystem command | Fixed: returns an explicit unsupported-method error |
| Configure accepted registry records without installation | P1 | `packages/sdk/src/toolkit/facade.ts` | Could write configuration for a tool that was not installed | Fixed: loads and validates the installed Tool Manifest first |
| `context attach --repo` was declared but ignored | P2 | `apps/cli/src/commands/context.ts` | Misleading CLI contract | Fixed by removing the unused option |

## 7. Bugs Fixed

The fixes above were implemented without bypassing ports or adding provider/
target conditionals to the CLI. A new CLI test covers single-document JSON
output; focused CLI and SDK tests pass.

## 8. Security Findings

Positive evidence:

- Installer commands use argument arrays and `shell: false`.
- Toolkit manifests and registry overlays are schema-validated and path-safe.
- Security trust defaults to `unverified`; blocked tools are hard-gated.
- Configuration uses user-config roots, merge/backup/rollback behavior, and
  dry-run support.
- Context packages have deny filtering, budgets, exclusions, and staleness.
- No secrets were found committed or emitted by the audited CLI paths.

Remaining risks:

- Third-party package post-install scripts remain an explicitly surfaced risk;
  the installer requires approval but does not sandbox package managers (P1
  release risk for automatic installation).
- Repository instruction files can contain prompt-injection text. They are
  included only through the Context Integration’s explicit instruction policy;
  downstream agents must treat them as untrusted content (P2).
- Provider default model IDs are placeholders and should not be presented as
  production defaults (P2).

## 9. Performance Findings

Unit tests cover scanner walking, hashing diffs, parser batches, graph queries,
storage/search operations, context budgets, and cached summaries. The design
has the intended incremental hash seam, but no CLI indexing path exists to
prove end-to-end incremental performance. No new optimization was justified
before that path is implemented.

## 10. Testing Results

- `pnpm check`: **PASS**
- Typecheck: 20 workspace projects passed.
- ESLint: passed.
- Biome format check: passed; 357 files checked.
- Vitest: **71 files, 646 tests passed**.
- Focused CLI + SDK regression tests: **35 tests passed**.
- Full production build: **PASS** with elevated filesystem access required by
  the local esbuild sandbox.

## 11. CLI Testing

Built CLI smoke tests passed for `--help`, `tools --help`, `context --help`,
registry JSON search, install-plan JSON, context JSON, and missing-index search.
Unknown-command handling returns a nonzero Commander error. The five
Unknown-command handling returns a nonzero Commander error. The two remaining
placeholder commands are `explain` and top-level `doctor`.

## 12. Agent Testing

Agent executable detection, adapter seams, safe process spawning, timeouts,
session isolation, shutdown, output capture, orchestration, and context launch/
attach are covered by package tests. No real provider credentials or external
agent process was used, so real provider compatibility remains environment-
dependent.

## 13. Context Testing

Context integration tests cover package assembly, budgets, deny filtering,
exclusions, staleness, explanations, launch, attach, unsupported session
states, and CLI delegation. A built CLI run against the current repository
honestly reported `unavailable` because no context database exists.

## 14. Toolkit Testing

Registry, manifest validation, compatibility, security assessment, installer
adapters/process safety, configurator adapters, rollback/backup behavior, CLI
delegation, dry-run, trust display, and adversarial inputs are covered. The
audit additionally verified a real install plan without executing an install.
No real user configuration or package was modified.

## 15. Documentation Audit

Updated `AGENTS.md`, `CLAUDE.md`, `PROMPTS.md`, `README.md`, CLI docs, current
state, feature status, roadmap, architecture, Toolkit docs, contributor docs,
and documentation indexes to reflect Tasks 25–26, the eleven top-level CLI
commands, current Git metadata, and the still-planned indexing commands.

## 16. Dead Code / Cleanup

Intentional placeholders remain isolated in `coming-soon.ts` and the ADR-001
Context stub; they are documented rather than disguised as working features.
Console output in the CLI is user-facing rendering, not accidental debug
logging. Example/documentation `console.log` calls are instructional. The
untracked `.claude/settings.local.json` is local tooling state and was not
modified or included in product changes.

## 17. Known Limitations

- TypeScript is the only parser implementation; renamed imports and
  `export default <expr>` have documented cross-file limitations.
- Storage uses `node:sqlite`, requiring Node >=22.5.0, while most package
  metadata says >=20.19.0; this engine-version drift remains.
- Toolkit `update` reports local state and intentionally performs no network
  refresh. Toolkit removal cannot remove arbitrary third-party configuration
  without a removal contract.
- Full UI build succeeds but emits a CSS optimizer warning for malformed
  generated utility CSS; it is not a CLI/core blocker but should be cleaned up.

## 18. Remaining Risks

The remaining product risks are the intentionally absent top-level `explain`/
`doctor` commands and installing third-party packages
whose package managers may execute lifecycle scripts. Both must be addressed
before calling the product generally release-ready.

## 19. Recommended Next Steps

1. Make the Node engine requirement consistent with `node:sqlite`.
3. Decide whether package-manager lifecycle scripts need stronger isolation or
   a narrower installer policy.
4. Implement honest top-level `doctor` and deterministic `explain` only after
   the indexing workflow is usable.
5. Remove the UI CSS warning and replace placeholder provider model IDs with
   explicit user configuration requirements.

## 20. Final MVP Verdict

**🟢 MVP READY** for the defined deterministic indexing/context/toolkit scope,
with documented non-MVP limitations. A real developer can install the project,
run `atlas init` or `atlas build --repo <path>`, search the resulting index, and
run `atlas context <task>` without programmatic database setup.

### Scorecard

| Area | Verdict | Evidence |
| --- | --- | --- |
| Architecture | PASS | Ports, SDK composition, dependency lint pass |
| Core functionality | PASS | Real-repository indexing and no-change update verified |
| CLI | PASS | Built/help/tool/context/indexing surfaces work; explain/doctor are future scope |
| Context system | PASS | SDK/integration tests pass; legacy builder intentionally stubbed |
| Agent system | PASS | 70-file suite covers adapters/sessions/orchestration |
| Toolkit | PASS | Security/configuration/installer tests and smoke plan pass |
| Security | NEEDS WORK | Strong gates exist; lifecycle-script isolation remains |
| Performance | NEEDS WORK | No end-to-end CLI indexing benchmark |
| Testing | PASS | 646 tests pass, including adversarial toolkit coverage |
| Documentation | PASS | Claims synchronized with implementation and limitations |
| Installation | PASS | Standalone build fixed; first-run indexing verified |
| Production readiness | PASS | Core MVP workflow is usable with documented limitations |

Answer to the release question: **yes for the defined MVP scope**. Another
developer can install, index, search, and generate/launch context from a real
repository using the documented CLI. They will still encounter intentionally
unimplemented `explain` and top-level `doctor` commands.
