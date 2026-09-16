# CodeAtlas Upgrade Plan — Capabilities Beyond Skills

Date: 2026-09-13 · Status: Research (nothing implemented)
Inputs: 2026-09-12 engineering audit (7/10 Skills-readiness), ADR-022 (unified
Skills architecture), 2026-09-13 product/technical research pass.

---

## 1. Executive Verdict

> **What should CodeAtlas actually become?**

**The capability layer between an AI coding agent and the real world: a
deterministic, local-first set of *capabilities* (understand, browse, execute,
inspect, trace, compare, test, evaluate) that Skills orchestrate into
workflows — delivered through the existing port/adapter/SDK/MCP architecture.**

The strategic insight the research confirmed: skills define *how* to work;
capabilities define *what is possible*. Dozens of skills on top of a weak
capability base produce better-worded prompts. A strong capability base makes
every skill — and every skill in the ecosystem, installable via the existing
Toolkit — measurably more effective.

Three research findings anchor this thesis:

1. **The ecosystem has converged on our architecture.** Microsoft's Playwright
   team now ships `playwright-cli` and explicitly recommends **CLI + Skills
   over MCP for coding agents**, citing token efficiency ("CLI invocations are
   more token-efficient: they avoid loading large tool schemas and verbose
   accessibility trees into the model context" — playwright.dev/docs/
   getting-started-cli; the `microsoft/playwright-mcp` README points coding
   agents at CLI+SKILLS). This independently validates ADR-022's two central
   choices: skills as the instruction-distribution mechanism, and narrow,
   token-efficient delivery over wide MCP tool surfaces.
2. **Capabilities are commoditized; *curation + integration* is the moat.**
   Playwright MCP/CLI, Chrome DevTools MCP, Schemathesis, Squawk, Semgrep,
   dependency-cruiser, Stryker, Gitleaks, OpenTelemetry GenAI — every
   capability on our wishlist already exists as a mature, installable
   technology. CodeAtlas should not rebuild them; it should make them
   **discoverable, compatible-checked, security-gated, contextually wired to
   the indexed repository, and orchestratable by skills** — exactly what the
   Toolkit pipeline (registry → compatibility → security → approval → install
   → manifest) already does for 47 skill records and dozens of tools.
3. **The unrealized asset is the index.** Every competitor connects agents to
   *generic* browser/API/DB tools. CodeAtlas is one of very few platforms with
   a **persistent, deterministic, cross-file index** (symbols, imports,
   call-graph seeds) of the user's repository. Capabilities that *combine*
   the index with live execution (blast radius on a diff, endpoint→route→DB
   tracing, docs-drift against indexed symbols, architecture conformance) are
   genuinely differentiated because they are grounded in *this* repository —
   not in the model's guesses.

The thesis in one sentence: **developers install CodeAtlas instead of
bolting skills onto a raw agent because CodeAtlas gives the agent a
grounded model of their code plus safe, curated, token-efficient access to
the tools that can act on it — and because the agent can then see what it
built, run it, trace it, and verify it instead of assuming it works.**

---

## 2. Capability Map

| # | Capability | Status in CodeAtlas today | Gap |
|---|-----------|---------------------------|-----|
| 1 | **Understand** (repo → symbols → deps → ranked context) | ✅ [IMPLEMENTED] — scanner/parser/graph/storage/search, `createContextSDK` | TS-only parser |
| 2 | **Research** (web/docs reading) | ⚠️ Partial — skills can instruct agents to use their native web tools | No first-party fetch/browse |
| 3 | **Browse** (open, navigate, click, screenshot, console) | ❌ Missing — no browser capability; only catalog records pointing at Playwright | New Toolkit tool + skill |
| 4 | **Execute** (run apps, tests, commands safely) | ⚠️ Partial — verifier allow-listed runners, benchmark runners, installer spawns | No general dev-server capability |
| 5 | **Inspect** (HTTP, network, DB, runtime) | ❌ Missing | HTTP probe is the cheapest win |
| 6 | **Trace** (endpoint→service→DB, perf) | ❌ Missing | Requires Execute+Inspect first |
| 7 | **Compare** (diff, visual, contract) | ⚠️ Partial — hashing infrastructure exists; no screenshot/contract diff | Screenshot diff = small primitive |
| 8 | **Test** (run, generate, verify) | ⚠️ Partial — verifier + benchmark run tests; no generation | Generation is skill-level |
| 9 | **Evaluate** (completion reports, QA loop) | ❌ Missing — benchmark evaluates *tasks*, nothing evaluates *output* | Structure exists to host it |
| 10 | **Review** (impact, risk, blast radius) | ❌ Missing — graph package has the data, nothing exposes it over diffs | Highest differentiator/effort ratio |
| 11 | **Remember** (cross-session memory) | ⚠️ Partial — `.codeatlas/` snapshots, usage DB, tool manifests | Snapshots ≠ findings memory |

Legend: ✅ [IMPLEMENTED] / ⚠️ [PARTIAL] / ❌ [MISSING] — statuses verified
against code per the 2026-09-12 audit.

The map makes the strategy legible: **Understand is done and is the moat.
Browse/Execute/Inspect are the missing interaction tier. Review/Evaluate are
the highest-value capabilities *only CodeAtlas can build***, because they fuse
the index with the interaction tier.

---

## 3. Feature Research by Domain

Every row answers the 13 product questions in compressed form (existing
solutions → what they miss → whether CodeAtlas can/should do it). Difficulty:
S/M/L. Priority: P0/P1/P2/reject.

### 3.1 Frontend / Visual

| Feature | Existing solutions | CodeAtlas opportunity | Type | Diff | Value | Pri |
|---|---|---|---|---|---|---|
| Deep website research (design extraction) | Chrome extensions (Design Token Extractor, Pluck, dembrandt), screenshot-to-code tools | Extract design facts via browser eval (computed styles, font stacks, spacing scale, palette, breakpoints) into a *structured token file* the agent reads — deterministic, not vision-based | **BOTH** (capability: design-extract via browser eval; skill: research workflow) | M | High | **P1** |
| Live browser capability | Playwright MCP, Chrome DevTools MCP, playwright-cli, browser-use | Do **not** build a browser engine. Curate Playwright MCP/CLI as Toolkit tools + ship a `web-qa` skill that drives them. Add thin context: read the console/screenshot artifacts into ranked context | **SKILL** (+ catalog curation) | S | High | **P0** |
| Visual QA loop | Playwright screenshot testing, BackstopJS, Argos/Percy/Chromatic (cloud, CI-oriented) | The loop (build→open→screenshot→compare→fix) is *agent-driven*; CodeAtlas provides: screenshot-diff primitive (pixelmatch-class, ~1 dep), artifact storage under `.codeatlas/`, skill defining the loop | **BOTH** | S–M | High | **P0** |
| Final output evaluation | None for agent output specifically; CI dashboards approximate | `atlas evaluate` report per ADR-022-style structure: requirements/build/tests/browser-QA/a11y (axe-core via browser)/visual results + optional lightweight human rating (Good/Needs-work stored locally in `.codeatlas/` only — explicitly not telemetry) | **CAPABILITY** (report) + skill (when to run) | M | Medium | **P1** |

**Key research finding:** the deep-research feature must be
**computed-style extraction, not screenshot vision**. The Playwright team
built their entire agent stack on structured data *instead of* vision models
("Uses Playwright's accessibility tree, not pixel-based input") because it is
deterministic and token-cheap. Design extraction via `browser.eval(() =>
getComputedStyle(...))` over a few hundred tokens (typography, palette,
spacing, breakpoints) is cheap, reproducible, and diffable — the visual
quality bar comes from the *QA loop* (screenshots), not from the *research*
step (tokens).

### 3.2 Backend

| Feature | Existing solutions | CodeAtlas opportunity | Type | Diff | Value | Pri |
|---|---|---|---|---|---|---|
| Endpoint discovery from code | Framework-specific routers; OpenAPI generators (usually runtime) | Static: index route registrations (`router.get(...)`, decorators) via the existing parser into the graph; cross-reference with OpenAPI/HAR at runtime | **CAPABILITY** (graph extension) | M | High | **P1** |
| API exercise / contract check | Schemathesis (property-based, schema-first), Dredd, HAR tooling | Cheap probe capability: HTTP request against localhost with capture of status/latency/shape; schema-first fuzzing stays Schemathesis's job via Toolkit | **CAPABILITY** (http-probe) | S | High | **P1** |
| Endpoint→service→DB tracing | OpenTelemetry (runtime, full standard), APMs | OTel is the right backbone — do not rebuild. CodeAtlas adds the *static half*: map route handler → indexed call path → storage call sites, then attach OTel spans when available | **BOTH** | L | Medium | **P2** |
| Reproduce→inspect→fix→verify | Framework debug modes | Orchestration skill over Execute+Inspect capabilities | **SKILL** | S | Medium | **P1** |

**Differentiation call:** a generic HTTP probe is table stakes; the
*differentiated* version feeds results back through `createContextSDK` —
"here are the 3 handlers behind `/api/checkout`, here's the failing one at
`packages/billing/src/charge.ts:88`, here's the DB write it makes."

### 3.3 Database

| Feature | Existing solutions | CodeAtlas opportunity | Type | Diff | Value | Pri |
|---|---|---|---|DB---|---|---|
| Schema understanding / relationship mapping | Squaremap SQL parsers, schema spy tools, DB introspection | Parse migration/schema files *statically* (Prisma/Drizzle/SQL) with the existing parser pipeline — no live DB needed | **CAPABILITY** (parser adapters) | M | Medium | **P2** |
| Migration safety | **Squawk** (Postgres migration linter, open source, CLI) | Do not rebuild. Curate Squawk via Toolkit + a migration-safety skill. Impact layer: which app code writes to the altered table (index query) | **SKILL** (+ curation) | S | High | **P1** |
| Query analysis / app-schema mismatch | sqlfluff, SlowQL, ORM linters | Detect string/ORM queries referencing columns that don't exist in the indexed schema — pure index-join problem, genuinely novel | **CAPABILITY** | L | Medium | **P2** |
| Index/performance analysis | `EXPLAIN`, pg tools | Live-DB dependent; out of scope until Execute/Inspect mature | — | L | Low | **Reject (for now)** |

### 3.4 Security

| Feature | Existing solutions | CodeAtlas opportunity | Type | Diff | Value | Pri |
|---|---|---|---|---|---|---|
| Secrets detection | **Gitleaks**, truffleHog (mature, fast, CLI) | Curate via Toolkit; skill for when/where to run | **SKILL** | S | Medium | **P1** |
| SAST | **Semgrep**, CodeQL (mature, CLI, SARIF) | Curate via Toolkit; SARIF→context adapter so findings land as ranked context items near the affected symbols | **SKILL** + SARIF adapter | S–M | High | **P1** |
| Attack-surface / authz-flow / data-flow | CodeQL data-flow, Semgrep OSS rules, custom taint | True taint analysis is a research project (reject). Surface *discovery* = graph queries (public endpoints, env reads, exec calls) — feasible incrementally | **CAPABILITY** (graph queries) | M–L | Medium | **P2** |
| Dangerous code-path detection | Semgrep rules | Same as above — rules curation, not new engine | **SKILL** | S | Medium | **P2** |

**Security stance (non-negotiable):** defensive only. No offensive
recon/fuzzing capabilities; verification stays inside the verifier's
allow-listed runners (ADR-018 policy).

### 3.5 Code Review

| Feature | Existing solutions | CodeAtlas opportunity | Type | Diff | Value | Pri |
|---|---|---|---|---|---|---|
| Change impact / blast radius | Research (call-graph CIA), Cloudflare/RippleCI-style tools; graph-backed MCP tools exist but thin | **The flagship.** Diff → indexed symbols → reverse-dep closure → affected tests/endpoints/docs, with risk scoring by fan-in/out | **CAPABILITY** (graph query over diff) | M | **Very High** | **P0** |
| Behavioral diff / regression prediction | LLM reviewers guess; semantic-diff research is immature | Frame honestly: *structural* impact now; *behavioral* prediction later via test selection (below) | — | L | Medium | **P2** |
| Reviewer guidance / affected tests | CodeRabbit etc. (cloud, PR-centric, closed) | Local-first: `atlas impact` → affected tests via test↔symbol mapping; feeds Code Review + Testing skills | **CAPABILITY** | M | High | **P0** |

**Why this is the moat:** it requires a cross-file symbol graph — which
CodeAtlas already builds — and no generic agent has it. Cloud competitors
(CodeRabbit, Graphite Diamond) can't do it local-first.

### 3.6 Testing

| Feature | Existing solutions | CodeAtlas opportunity | Type | Diff | Value | Pri |
|---|---|---|---|---|---|---|
| Test execution | Existing: verifier + benchmark runners | Already present — reuse, don't rebuild | — | — | — | — |
| Test↔code mapping / affected tests | Jest/Vitest `--related`, some coverage tools | `atlas impact --tests` — index already contains test files and their imports | **CAPABILITY** | S | High | **P0** |
| Test-case generation | LLM-native; Stryker ecosystem guides quality | **SKILL** (prompt workflow using impact + context), plus mutation testing via Toolkit (Stryker) as verification | **SKILL** | S | Medium | **P1** |
| Coverage/mutation | Stryker (mutation, mature) | Toolkit curation only | **SKILL** | S | Medium | **P2** |
| Browser/API testing | Playwright test, Schemathesis | Via the P0/P1 browser and http-probe capabilities | **SKILL** | S | Medium | **P1** |

### 3.7 Debugging

| Feature | Existing solutions | CodeAtlas opportunity | Type | Diff | Value | Pri |
|---|---|---|---|---|---|---|
| Understand→reproduce→trace→inspect→fix→verify loop | Agent-native prompting; trace-driven research frameworks (TraceCoder et al.) are multi-agent research, not products | The loop itself is a **skill**; what makes it *real* is the underlying primitives: run (Execute), console/HTTP capture (Inspect), error→symbol→call-path resolution (index) | **SKILL** (workflow) over P0–P1 capabilities | S | High | **P1** |
| Error→code grounding | Stack traces → files, done ad hoc by agents | `atlas trace` — parse stack trace, resolve frames through the index, return call-path + source context | **CAPABILITY** | S–M | High | **P1** |
| Time-travel/reverse debugging | rr, Undo (native, heavy) | Reject for CodeAtlas scope — different problem domain | — | — | — | **Reject** |

**Honest answer to the user's core question:** yes — CodeAtlas can provide
real tooling beyond "debug better" prompting, but it is (a) the
error→symbol→call-path grounding primitive, and (b) execution capture in the
loop. The *loop* is instructions; the *grounding* is a capability.

### 3.8 Performance

| Feature | Existing solutions | CodeAtlas opportunity | Type | Diff | Value | Pri |
|---|---|---|---|---|---|---|
| Bundle analysis | webpack-bundle-analyzer, source-map-explorer, Lighthouse treemaps | Curate via Toolkit; skill interprets results with repo context | **SKILL** | S | Medium | **P2** |
| Web perf (Lighthouse) | Lighthouse CLI, debugguy etc. | Curate via Toolkit (it's already a CLI); skill layer | **SKILL** | S | Medium | **P2** |
| Runtime/request tracing | OpenTelemetry GenAI semantic conventions (now standardized), OTel backends | Do not build a tracing backend. Optionally: OTel span *reading* adapter for Inspect/Trace | **CAPABILITY** (optional adapter) | M | Medium | **P2** |
| CodeAtlas's own perf | — | Audit already flagged indexing/parser bottlenecks; separate track, not a feature | — | — | — | P1 (internal) |

### 3.9 DevOps

| Feature | Existing solutions | CodeAtlas opportunity | Type | Diff | Value | Pri |
|---|---|---|---|---|---|---|
| Env/CI parity, config validation | direnv, dotenv-linter, CI linters | Weak differentiation; config *comparison* capability is generic diffing | **CAPABILITY** (small) | S | Low | **P3** |
| Dependency/runtime mismatch | Engines checks, renovate etc. | Already partially present via Toolkit `EnvironmentDetector`/CompatibilityPort — extend rather than add | **CAPABILITY** (exists) | S | Medium | **P2** |
| Deployment preflight / migration risk | Release tooling is CI-specific | Migration-risk = Squawk + index-impact combination (see DB) | **SKILL** | M | Medium | **P2** |

### 3.10 Documentation

| Feature | Existing solutions | CodeAtlas opportunity | Type | Diff | Value | Pri |
|---|---|---|---|---|---|---|
| Docs-drift detection | Claude/OpenCode skill ecosystem has doc-drift skills (AST-based staleness scoring); no dominant standard tool | **Genuinely strong fit**: detect documented CLI commands/APIs that no longer exist, undocumented exports — all index queries against docs; CodeAtlas's own docs discipline (AGENTS.md §4.12) dogfoods it | **CAPABILITY** | M | High | **P1** |
| API docs validation | TS docgen tools | Index export surface vs `docs/` claims — same engine | **CAPABILITY** | M | Medium | **P1** |

### 3.11 Architecture

| Feature | Existing solutions | CodeAtlas opportunity | Type | Diff | Value | Pri |
|---|---|---|---|---|---|---|
| Arch graph / boundary violations / cycles | dependency-cruiser, madge, eslint-plugin-boundaries | CodeAtlas's graph already has this data for TS. Expose as queries + risk report; curate dependency-cruiser for polyglot/JS-specific rules | **CAPABILITY** (expose existing) | S–M | High | **P1** |
| God modules / coupling | NDepend-style metrics | Dependency-matrix + fan-in/out over the index | **CAPABILITY** | S | Medium | **P2** |
| Arch-aware refactoring | — | Later: impact + context in one refactor skill | **SKILL** | M | Medium | **P2** |

### 3.12 Git / Change Intelligence

| Feature | Existing solutions | CodeAtlas opportunity | Type | Diff | Value | Pri |
|---|---|---|---|---|---|---|
| Semantic commit/PR generation | LLM-native everywhere | **SKILL** over the diff+impact capability — grounded in what actually changed structurally | **SKILL** | S | Medium | **P1** |
| Breaking-change detection | API extractors (api-extractor), semver tools | Index the previous snapshot (`.codeatlas/` snapshots exist) → diff export surface → breaking-change report | **CAPABILITY** | M | High | **P1** |
| Changelog generation | Many tools | Skill over the same data | **SKILL** | S | Low | **P2** |
| Change risk scoring | Graph CIA research | Part of the P0 impact capability | **CAPABILITY** | M | High | **P0** |

---

## 4. Competitive / Technology Landscape (what we learn from each)

| Technology | What it is | What CodeAtlas learns |
|---|---|---|
| **playwright-cli** (Microsoft, 2026) | Token-efficient browser CLI for coding agents, with **installable skills** (`playwright-cli install --skills`) | The direct playbook: capability = CLI commands; workflow = installable skills. Also proof that CLI+skills beats fat MCP surfaces for coding agents. Curate it; write skills against it |
| **Playwright MCP / Chrome DevTools MCP** | Official MCP browser servers (a11y-tree based / DevTools protocol) | Alternative channel for IDE-style loops; MCP-first delivery is declining for coding agents — keep MCP surface narrow per ADR-022 |
| **browser-use** | Python browser-agent framework, cloud pivot | Their infra (profiles, recordings) shows where *not* to go — CodeAtlas stays local-first; no browser cloud |
| **Schemathesis** | Property-based API testing from OpenAPI | Schema-first fuzzing stays external; our http-probe capability covers the simple contract-check case |
| **Squawk** | Postgres migration linter | Perfect Toolkit citizen; pair with index-based "which code writes this table" impact |
| **Semgrep / Gitleaks / CodeQL** | SAST / secrets engines | Curate via Toolkit; add SARIF→context adapter so findings become ranked context items |
| **Stryker** | Mutation testing | Verification primitive for test-generation skills |
| **dependency-cruiser / madge** | JS/TS boundary & cycle enforcement | Our graph duplicates this *for indexed languages*; expose it rather than depend on it; curate for the rest |
| **CodeRabbit / Graphite Diamond** | Cloud AI PR review | Validate demand; our differentiator is local-first + repo-grounded (index), not cloud model quality |
| **OpenTelemetry GenAI conventions** | Standardized agent/runtime telemetry | Don't build telemetry; optionally *read* spans; our local `.codeatlas/` artifacts stay flat files |
| **Argos/Percy/Chromatic/BackstopJS** | Visual regression (cloud/CI) | The agent-driven loop needs only a pixel-diff primitive + stored baselines — commodity tech (pixelmatch-class), no platform |
| **dembrandt / Design Token Extractor** | Design-token extraction | Confirms demand; our edge is doing it deterministically via browser eval and storing tokens as diffable files |

---

## 5. Architecture Impact (per high-priority capability)

The governing rule from the audit holds: **every capability enters through an
existing seam.** No new framework, no new config, no event bus.

| Capability | Host | Port | SDK | CLI/MCP | Security | Optional? |
|---|---|---|---|---|---|---|
| **Skills (ADR-022)** | `@prof-bilal/atlas-toolkit` (loader moved from benchmark) + `SkillPort` in core | `SkillPort` | `createSkillService()` | `atlas skills list/info/load` (SDK only); launch-time injection | Post-install validation, approval-gated updates (closes audit HIGH finding) | n/a — P0 foundation |
| **Impact / blast radius** | `@prof-bilal/atlas-graph` (new query service) + `@prof-bilal/atlas-sdk` composition | `ImpactPort` (diff→affected symbols/tests/docs) | `createImpactService()` | `atlas impact`; MCP `analyze_impact` (additive) | Read-only over the index | Opt-in command |
| **Browser QA** | **No new package** — Toolkit catalog + skills; screenshot-diff primitive in `@prof-bilal/atlas-shared` or toolkit utils | none (tool orchestration) | skill delivery only | Skills; artifacts under `.codeatlas/qa/` | Browser runs only via approved Toolkit installs; never auto-launch; no unrestricted file access (mirror Playwright's `--allow-unrestricted-file-access` default-off) | Optional dependency |
| **Evaluate report** | `@prof-bilal/atlas-sdk` (aggregation over verifier/benchmark/qa artifacts) | none (pure aggregation) | `createEvaluationService()` | `atlas evaluate` | Read-only aggregation + local-only human feedback | Opt-in |
| **HTTP probe** | `@prof-bilal/atlas-toolkit` or small `@prof-bilal/atlas-inspect` module in SDK | `InspectPort` (probe/request capture) | `createInspectService()` | `atlas inspect http` | **Explicit per-target approval** (network egress), localhost-default, no cred sending (docs/reference/SECURITY.md rules) | Opt-in |
| **Trace (error grounding)** | `@prof-bilal/atlas-sdk` (stack-parse + index resolve) | none (pure function over index) | part of context SDK surface | `atlas trace` | Read-only | Opt-in |
| **Docs drift** | `@prof-bilal/atlas-sdk` or `@prof-bilal/atlas-verifier` extension | none (index queries) | part of verify surface | `atlas verify --docs` | Read-only | Opt-in |
| **Breaking-change report** | `@prof-bilal/atlas-sdk` (snapshot diff) | none | part of impact service | `atlas impact --breaking` | Read-only | Opt-in |

Dependency-matrix note: `@prof-bilal/atlas-verifier` is currently missing from the ESLint
`ALL_PACKAGES` matrix (audit finding) — fix that *before* extending verifier.

---

## 6. Recommended Roadmap

### P0 — Build first (foundation + flagship)

1. **Ship ADR-022 Skills** (already decided): loader extraction → `SkillPort`
   → `createSkillService()` → launch-time injection → `atlas skills` CLI.
   *Includes the two security fixes: approval-gated skill updates; mandatory
   post-install validation.*
2. **Impact capability** (`ImpactPort`, `atlas impact`): diff → affected
   symbols/tests/docs with risk scoring. Highest differentiator/effort ratio
   in the whole plan; unlocks review, testing, commit, and breaking-change
   skills simultaneously.
3. **Browser QA skill + curated Playwright tools** (no new engine): catalog
   `playwright-cli`/Playwright MCP records if not present; ship `web-qa` skill
   implementing build→open→screenshot→compare→fix; small screenshot-diff
   primitive; artifacts under `.codeatlas/qa/`.

### P1 — Build after P0 validation

4. **HTTP probe / inspect capability** (explicit approval, localhost default).
5. **`atlas evaluate` completion report** (aggregates build/test/qa/a11y;
   optional local-only human rating).
6. **Docs-drift capability** (`atlas verify --docs`; dogfood on CodeAtlas).
7. **Breaking-change report** (`atlas impact --breaking` via snapshot diff).
8. **Trace capability** (stack-trace → indexed call path grounding).
9. **Security curation wave**: Squawk/Gitleaks/Semgrep records + SARIF→context
   adapter + security-review skills.
10. **Architecture conformance surface** (cycles/boundaries/god-modules from
    the graph; curate dependency-cruiser for non-indexed stacks).

### P2 — Advanced capabilities

11. Static endpoint discovery (framework adapters) + endpoint→DB mapping.
12. Static schema understanding (Prisma/SQL parsers) + app/schema mismatch.
13. Attack-surface graph queries; OTel span-reading adapter.
14. Design-token extraction capability (computed-style eval) feeding the QA
    loop; mutation testing curation (Stryker); bundle/Lighthouse curation.
15. Internal: fix audit P1 hygiene (verifier ESLint entry, `@prof-bilal/atlas-common`
    orphan, `estimateTokens` dedup) — *before or during* the first capability
    that touches verifier.

### Don't Build

- **A browser engine or browser cloud** — Playwright exists; curate it.
- **A taint-analysis/security engine** — research-grade effort, Semgrep/CodeQL
  exist; surface *discovery* queries are enough.
- **A tracing/observability backend** — OTel is the standard; read, don't host.
- **A second skills framework / skill marketplace** — one registry, one
  format (ADR-022).
- **A new config system** — per-capability config joins the existing
  per-package config files (`.codeatlasrc`/`docs/configurations.md` patterns);
  no new precedence rules.
- **An event bus / plugin runtime / DI container / agent runtime** — the
  port/adapter + SDK composition model already covers extension.
- **Behavioral-diff/regression *prediction*** — frame as test selection now;
  prediction is research-grade.
- **Time-travel debugging, live-DB perf analysis** — out of scope, wrong layer.

---

## 7. Example Agent Workflows (capabilities × skills)

**UI (P0 stack):**
Research (skill: token extraction via browser eval) → Understand (context SDK)
→ Build → Browse (playwright-cli) → Compare (screenshot diff vs reference
artifacts) → Evaluate (`atlas evaluate` + a11y) → Fix (impact-guided).

**Backend (P1 stack):**
Understand → Run (dev-server skill) → Inspect (http-probe) → Trace
(endpoint→handler→DB via index) → Test (affected tests) → Fix → Verify.

**Security (P1 stack):**
Understand → Trace (surface discovery via graph) → Inspect (Semgrep/Gitleaks
via Toolkit, SARIF→context) → Test (verifier runners) → Review (impact) →
Evaluate.

**Debugging (P1 stack):**
Understand → Reproduce (Execute) → Trace (`atlas trace` grounds the error to
indexed call path) → Inspect → Fix → Reproduce → Verify (affected tests only).

**Review/PR (P0 stack):**
Understand → Impact (`atlas impact`) → affected tests → semantic commit/PR
skill → breaking-change report → reviewer notes.

---

## 8. Final Product Thesis

> **Why install CodeAtlas instead of just using an AI coding agent with
> skills?**

Because skills alone are instructions, and instructions can't see. An agent
with skills but no capabilities will still: guess at design details instead of
extracting them, assume its UI works instead of screenshotting it, review a
diff without knowing what the change touches, and debug by vibes instead of
by call path.

The research shows every *capability* on our list already exists somewhere —
but scattered, uncurated, un-gated, and un-grounded. What doesn't exist is a
**local-first platform that (1) holds a deterministic, persistent model of
the user's repository, (2) safely wires curated capabilities to it, and
(3) orchestrates them with skills** — so the agent works from evidence about
*this codebase* instead of priors about code in general.

That is the product: **skills define workflows; CodeAtlas provides the
grounded understanding and the safe capability surface that make those
workflows real.** The 2026-09-12 audit scored Skills-readiness 7/10 — good
enough to start; the roadmap above closes the remaining gaps (verifier
matrix entry, approval-gated updates, post-install validation) *before* the
capability wave lands on them.

---

*Audit evidence base: 2026-09-12 engineering audit (all findings cited to
file:line in that report; 7/10 readiness score with per-subsystem scores).
Research basis: playwright.dev/docs/getting-started-cli and
github.com/microsoft/playwright-mcp (CLI+SKILLS positioning),
github.com/browser-use/browser-use, schemathesis.readthedocs.io,
squawkhq.com, github.com/semgrep/semgrep (+ Semgrep 2026 skill-guides),
github.com/sverweij/dependency-cruiser, stryker-mutator.io,
argos-ci.com/blog/best-visual-regression-testing-tools,
opentelemetry.io/blog/2026/genai-observability, and the 13-question
evaluation applied per feature in §3. Nothing in this document has been
implemented; no files outside this document and ADR-022 were modified.*
