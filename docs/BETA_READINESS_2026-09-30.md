# CodeAtlas beta readiness — 30 September 2026

**Verdict: hold a broad public beta launch.** The core is demonstrably working,
but security/privacy contracts and several advertised CLI workflows still have
reproducible defects. A narrowly scoped developer preview should explicitly
exclude persistent session management and describe the remaining limitations.
This audit records findings; it does not silently repair or release the product.

Audited revision: `b51a41365164fe731529d4022407591bccd3ed89`.
Declared CLI version: **0.5.1**. Environment: Linux, Node **24.21.0**, pnpm **9.15.0**.
The installed npm registry version and dist-tags were not release-verified.

## Evidence and scope

The review covered the repository inventory, architectural ownership, release
configuration, CLI command registration and source, indexing pipeline, parser,
storage migrations, MCP contracts, agent adapters and process/session handling,
provider boundaries, toolkit/Skills packaging, privacy documentation, and tests.
It combines repository-wide automated checks with targeted source review; it is
not a claim that every source line received a manual security audit.

| Check | Result |
| --- | --- |
| Frozen dependency installation | Passed; existing lockfile preserved |
| `pnpm build` | Passed across the monorepo |
| `pnpm check` | Passed: typecheck, lint, format, **132 test files / 1,394 tests** |
| Whole-repository SDK index | **504 parsed files, 11,541 symbols, 18,778 dependencies, 0 parser skips, 4 unresolved imports** at capture time |
| CLI surface introspection | **29 top-level commands**, complete recursive help captured |
| Small offline demo | **16 real commands succeeded**, including indexing, search, context export, Skills validation, and setup dry-run |
| Packed CLI installed outside workspace links | Version, search and all **13** built-in Skills work |
| Packed CLI symbol verification | **Failed incorrectly** for a searchable symbol |
| External CLI launch/session smoke | Starts a real process but shows no AI transcript; next invocation reports `No sessions.` |
| Workspace production dependency audit | **7 high + 11 moderate advisory entries**; 0 critical |
| Installed CLI production dependency audit | **0 reported advisories** in its external npm dependency tree; bundled code is not separately covered by that scan |
| Live OpenCode demonstration | Default provider rejected request for insufficient funds; explicit `opencode/big-pickle` run succeeded |

Logs, raw outputs, tarball and generated databases are under
`.release/beta-audit/` (gitignored). The captures use a synthetic three-file
authentication fixture. **No actual `.env`, credential, or private-key file was
read.** Only that public synthetic example was supplied to OpenCode. The real
repository index remained local; summaries were not requested.

## Launch blockers

### 1. Secret filename denial does not implement its advertised contract

**Priority: P1.** `packages/sdk/src/context-integration/deny.ts:29` uses
`/^\.env(?:\.\w+)?$/`. With harmless synthetic content, `.env` and `.env.local`
are denied, but `.env.production.local` and `.envrc` are accepted.
`credentials.json` is also accepted by the current exact-basename credentials
pattern. MCP path filtering delegates to this policy (`packages/mcp/src/deny.ts`).

This proves a policy gap, **not** that the default TypeScript/JavaScript indexing
path uploaded such files. Content filtering can catch some credentials, but
cannot substitute for a promised path-level exclusion.

Before release, make the filename contract explicit and consistent, add
regressions for multi-suffix names and credential bundles, and exercise context
assembly and MCP reads against hostile indexed input. Review sensitive directory
segments as well as basenames. Keep the existing SDK seam.

### 2. Automatic update checking conflicts with offline and JSON promises

**Priority: P1.** `apps/cli/src/index.ts:16` invokes the update checker after
ordinary commands. `apps/cli/src/update-checker.ts:70` launches
`npm view codeatlas-cli version` with a five-second timeout when its cache needs
refreshing. The checker has no opt-in/offline guard and writes notices to stdout
at lines 108–109.

The privacy document promises no default network traffic. Update checking does
not send repository source, but it is still implicit registry traffic. Its stdout
notice can also invalidate `--json` output or pollute stdio MCP communication
when an update is available. The existing tests check notice printing, rather
than protocol cleanliness or offline behavior.

There is also an independent reproduced stdout bug: the fixture's
`atlas init --tools none --json` output contains a complete JSON object followed
by `Skipped installing recommended tools.` Parsing the full stdout as JSON
fails with trailing data. Exit 0 does not establish valid machine-readable output.

Before release, make this behavior consistent with the privacy contract and
ensure JSON/MCP stdout carries only its protocol payload. Test cache-hit,
cache-miss, offline, newer-release and stdio cases with injected transports.

### 3. CLI sessions disappear between invocations; external AI output is hidden

**Priority: P1 for the advertised agent workflow.** SessionManager stores sessions
and handles in Maps (`packages/agents/src/session-manager.ts:74`). The sessions
command creates a new manager at registration (`apps/cli/src/commands/sessions.ts:166`),
and context launch creates a different manager (`apps/cli/src/commands/context.ts:602`).

Real smoke reproduction:

```text
atlas opencode "Explain authenticate without editing files. Do not run tools."
→ Session 7b3895cb started (opencode, RUNNING)
atlas sessions list
→ No sessions.
```

The context integration calls `startSession` without `interactive` or
`captureOutput` (`packages/sdk/src/context-integration/index.ts:298`). The process
manager defaults that path to `stdio: "ignore"` at lines 214–226. The CLI checks
for output immediately after starting; it neither captures this default
process's output nor waits to render its eventual result. The smoke returned
exit 0 even though the direct request on that configured provider reported
insufficient funds.

Before release, define a visible terminal/result handoff and reliable lifecycle
semantics. Cross-process recovery requires a deliberate design decision and
human review if it changes architecture. Alternatively narrow the preview's
advertised session guarantees. Add process-boundary tests, not only tests using
one injected manager.

### 4. Verification gives a false negative for an indexed symbol

**Priority: P1 if verification is part of the beta promise.** In the packaged
fixture, `atlas search authenticate --json` returns `authenticate` with score 100.
`atlas verify "Explain authentication" --paths auth.ts --symbols authenticate --json`
then reports that the symbol is missing and exits 1. Its path check passes.

The CLI resolves symbols from `project.overview("summary").topSymbols`
(`apps/cli/src/commands/verify.ts:108`) instead of querying the full symbol
interface. Overview highlights are not an exhaustive symbol list. The
`--refresh-baseline` flag is declared but unused by the action. The docs-drift
branch also relies on overview highlights and does not provide the advertised
full symbol audit.

Before release, reuse the SDK's symbol queries and baseline abstraction, add a
regression using a symbol outside overview highlights, and either implement or
withdraw the unused flag's claim. Do not weaken the failed symbol assertion.

### 5. Production dependency advisories need package-specific triage

**Priority: P1 release gate, pending reachability analysis.** `pnpm audit --prod`
reports seven high and eleven moderate entries involving `fast-uri`,
`brace-expansion`, `qs`, `hono`, and `ip-address`. Multiple entries concern the
same package. This is **not** proof of 18 exploitable CodeAtlas vulnerabilities.
In particular, the MCP server uses stdio, so HTTP-server advisories need a
reachability assessment rather than an assumed public attack surface.

For example, reviewed advisories describe host confusion and malformed IPv6
normalization in affected `fast-uri` versions:
[GHSA-5jgf-p345-68v8](https://github.com/advisories/GHSA-5jgf-p345-68v8) and
[GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc).
The captured dependency summary contains every advisory URL and patched range.

Before release, trace each affected dependency and bundled import, apply scoped
compatible updates or document a justified reachability exception, then rerun
the lockfile install, build, complete tests, package smoke, and dependency audit.
No dependency upgrade was mixed into this audit/video change.

## Completeness and release scope

| Area | Supported by inspected code and tests | Beta boundary |
| --- | --- | --- |
| shared/core | Typed contracts and shared primitives | No blocker observed in tested surfaces |
| scanner/hashing/parser | Ignore-aware scanning, hashing, TS/JS extraction | Other language parsers absent; aliases can remain unresolved |
| graph/storage/search/context/cache | Local persistence, graph queries, deterministic search and assembly | Large-repo and hostile-input assurance still need bounded release criteria |
| SDK | Composition, context integration, slices, plans, orchestration APIs | SDK APIs do not imply a shipped standalone plan-execution router |
| providers/summary | Configured adapters, explicit summaries/briefings | Every remote provider/model was not live-validated; select available models explicitly |
| agents | Adapter-based launches and in-process sessions | Cross-process session and output defects above |
| usage/metrics | Local records and tri-state measurement provenance | External CLI tokens often unknown; compression is estimated |
| toolkit | Registry, manifests, compatibility, installer, configurator, security, canonical Skills | Actual ecosystem installs/rollbacks were tested offline, not performed on this machine |
| verifier | Claim and configured-command infrastructure | CLI false negatives and unused baseline flag above |
| MCP | SDK consumer, 11 primary tool names + 4 advertised aliases | Documentation still includes older tool counts |
| CLI | 29 registered top-level commands; source and tarball work | Not every external service/machine-changing action was exercised live |
| VS Code extension | Implemented SDK consumer with passing tests | Private 0.0.0 package; no VSIX packaging/editor-host smoke here |

The shipped CLI has no `atlas tui`, slash router, `atlas browse`, or public server.
Do not market these as included features. SDK orchestration code exists, while
the future standalone routing surface remains a separate concern.

`docs/CURRENT_STATE.md` still states CLI 0.2.1 and workspace packages 0.0.0;
the CLI manifest is 0.5.1. Several architecture/security sections describe an
older MCP surface. The user-provided AGENTS guidance also contains older parser
and orchestration statements. Update these carefully against actual code before
launch, rather than replacing accurate current detail with old assumptions.

Other release checks: the CLI declares `dist/index.d.ts` while its build disables
declaration emission; correct that packaging claim. Test the claimed minimum
Node version, current Node 22, supported operating systems, and the SQLite runtime
inside supported VS Code hosts. This session ran on Node 24 only. CI builds and
checks on Linux/Node 22 but does not test packed installation. Add a packed CLI
smoke gate and verify the release version/dist-tag intentionally before publishing.

## Video and reproduction

The Remotion tutorial is in `examples/beta-video/` — kept **local-only** and
untracked as of 2026-10-04 (see `.gitignore`), so it is not part of a fresh
clone. It explains all 29 top-level commands, major subcommand workflows, and
the beta boundaries. `COMMANDS.md`
is generated recursively from the real Commander tree and includes every
registered subcommand and flag. `TRANSCRIPT.md`, `CHAPTERS.txt`, timed SRT captions,
captured-output excerpts and editable composition source accompany the MP4.

Reproduce the offline demo and repository index with:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm exec tsx scripts/capture-beta-demo.ts
```

The capture script does not invoke AI providers, execute configured verification
commands, or install tools. Live OpenCode and registry security audits are
separate, explicitly executed evidence collection steps.

No production implementation, schema, dependency direction, or public API was
changed by this task. Remaining work is the prioritized fixes and release checks
above; a passing suite alone is not a beta approval.
