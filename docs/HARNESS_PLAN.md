# CodeAtlas Harness Program — Plan

> **Status: [PLANNED]** — this document is the approved program plan for the
> **Atlas Harness** (interactive TUI) and the **F01–F13 feature program** it
> hosts. It records the research, decisions, and phase order agreed on
> 2026-09-07. It is a *plan*, not a status claim: every feature below was
> double-checked against code, and nothing here should be marked
> [IMPLEMENTED] until it ships (see `docs/CURRENT_STATE.md`, the arbiter).

---

## 1. What the Harness is

The Atlas Harness is CodeAtlas's **interactive terminal UI** (`atlas tui`,
OpenCode-inspired): a chat cockpit where the user drives **multiple AI models
and agent CLIs together**, backed by CodeAtlas's context engine. It is the
missing front door for features that already exist behind SDK seams — and the
delivery vehicle for the F01–F13 program (§4).

Precedents researched (2026-09-07):

- **OpenCode** — `/models` picker, `provider_id/model_id` addressing, model
  resolution order (flag → config → last-used → first available), JSON themes
  with semantic tokens, custom slash commands (frontmatter + `$ARGUMENTS`),
  client/server architecture.
- **Aider** — `/model`, `/weak-model`, `/editor-model`, and `/architect`
  (two-model loop: planner model → editor model), the basis for our
  multi-model routing.
- **Decision:** OpenCode's TUI is a separate Go/SolidJS codebase and cannot be
  embedded; instead OpenCode (and Claude/Gemini/Codex) are **agents the harness
  drives** through the existing `SessionPort`/`AgentPort` seams.

## 2. Harness UI — mockups

### 2.1 Main screen — chat + sessions + status

```text
╭───────────────────────────────── ATLAS HARNESS ─────────────────────────────────╮
│  ▲ CodeAtlas          ~/Projects/CodeAtlas   main        index: fresh · 2m     │
│  model anthropic/claude-sonnet-4-5    planner gemini-3-pro    mode: BUILD      │
╰──────────────────────────────────────────────────────────────────────────────────╯

  you ▸ How does the session manager stop runaway processes?

  ● claude-sonnet-4.5 ▸ ─────────────────────────────────────────────────────────
    The SessionManager never escalates blindly. Look at
    packages/agents/src/session-manager.ts:

    › stopSession()  → SIGTERM, wait for exit
    › after timeout  → terminateSession() SIGKILL escalation
    › shutdown()     → stops every active session (orphan protection)

    Attached context: 8 files · 6.2k tokens · slice saved (.codeatlas/slices/)

  ◆ gemini-3-pro (planner) ▸ ────────────────────────────────────────────────────
    Plan: 1. read session-manager.ts:210-260   2. verify SIGTERM→SIGKILL test
          3. check ProcessRunner escalation path

  ── tool ─ atlas sessions list ────────────────────────────────────────────────
    claude  RUNNING  4m12s    gemini  RUNNING  0m38s    codex  STOPPED  exit 0

╭─ SESSIONS ─────────────────────╮  ╭─ INPUT ────────────────────────────────────╮
│ ● claude-sonnet-4.5   RUNNING  │  │ /mode▌                                     │
│ ● gemini-3-pro        RUNNING  │  ╰────────────────────────────────────────────╯
│ ○ codex-gpt-5.2       STOPPED  │   tab plan/build · ctrl+M models · ctrl+T sess
╰────────────────────────────────╯
╭──────────────────────────────────────────────────────────────────────────────────╮
│ BUILD · claude-sonnet-4.5   ↑8.4k ↓1.2k tok   budget 200k/500k   /help commands  │
╰──────────────────────────────────────────────────────────────────────────────────╯
```

### 2.2 `/models` overlay (OpenCode-style)

```text
        ╭─ Select model ─ provider_id/model_id ────────────────────────╮
        │ › anthropic/claude-sonnet-4-5        detected CLI ✓          │
        │   anthropic/claude-opus-4-5                                  │
        │   google/gemini-3-pro                detected CLI ✓          │
        │   openai/gpt-5.2-codex               detected CLI ✓          │
        │   ollama/qwen3-coder:32b             local ✓                 │
        │   opencode/default                   detected CLI ✓          │
        │                                                              │
        │   enter select · tab assign as: main/planner/reviewer · esc  │
        ╰──────────────────────────────────────────────────────────────╯
```

### 2.3 Multi-model loop (`/route`, `/architect`)

```text
 you ▸ /route planner=… executor=… reviewer=…
 you ▸ Add retry with backoff to the provider transport
       ┌──────────────────────────── harness loop ───────────────────────────┐
       │ 1. PLANNER   gemini-3-pro      → step plan (no file writes)         │
       │ 2. EXECUTOR  claude-sonnet-4.5 → implements steps, tool calls       │
       │ 3. REVIEWER  codex-gpt-5.2     → diff review, approve/revise        │
       │    ↺ revise loop (max 3)  ·  every turn wrapped with an atlas slice │
       └─────────────────────────────────────────────────────────────────────┘
```

## 3. Harness architecture & slash surface

### 3.1 Layout (dependency matrix preserved)

```text
apps/cli/src/tui/                 ← NEW (git-tracked)
  tui.tsx                         ink root: header/transcript/input/status/overlays
  harness-bridge.ts               THE ONLY SDK TOUCHPOINT:
                                  createSessionManager + createContextIntegration +
                                  createUsageService + createToolRegistry + createOrchestrator
  commands/registry.ts            slash registry (name, description, args, pinned model)
  commands/*.ts                   model, route, context, launch, sessions, usage, theme, tools…
  themes/{tokens.ts, atlas-dark.json, tokyonight.json, gruvbox.json}
  render/markdown.ts              minimal markdown renderer (no new deps)
apps/cli/src/commands/tui.ts      `atlas tui` — thin launcher, options injected for tests
```

Rules honored: CLI imports only `@atlas/sdk` (+ commander); no DB access; no
direct feature-package imports; provider specifics stay in adapters; argv-array
spawns only; no secrets in transcripts; tests use fake spawns/transport (no
network, no real CLIs).

**Dependency decision (per `docs/DEPENDENCIES.md` checklist):** add **`ink` +
`react`** to `apps/cli` (MIT, actively maintained, purpose-built for terminal
UIs). Alternative considered: zero-dep raw-ANSI renderer — rejected for
markdown/overlay brittleness; revisit if a zero-dep requirement emerges.

### 3.2 Slash commands (v1)

| Command | Backing seam |
|---|---|
| `/help`, `/quit` | registry |
| `/models`, `/model <provider/model>` | `AgentPort` detection + `ProviderChatAgent` |
| `/claude` `/gemini` `/codex` `/opencode` | `SessionPort` interactive launch (`stdio: "inherit"`) |
| `/launch <agent> <task>` | `createContextIntegration` → `buildSlice` → `SessionPort.startSession({prompt})` |
| `/context <question>` | `buildSlice` (same path as `atlas ask`) |
| `/sessions`, `/stop <id>` | `SessionPort.list/stop` |
| `/route planner=… executor=… reviewer=…`, `/architect <task>` | `createOrchestrator` (bounded roles, max 3 revise loops) |
| `/usage` | `createUsageService` (tri-state, budgets) |
| `/tools`, `/tools-install <tool>` | Toolkit registry/installer (approval-gated) |
| `/theme <name>` | theme loader (`.codeatlas/tui/themes/*.json`) |
| `/mode` (BUILD/PLAN) | PLAN forbids file-write launches (mirrors OpenCode's Tab agent switch) |
| `/connect` | provider key onboarding (Phase B) |
| `/freebuff` | opt-in credits/reels panel (Phase F) |

Keybinds: `Tab` mode, `Ctrl+M` models, `Ctrl+T` sessions, `Ctrl+R` freebuff,
`↑` history, `Esc` overlay.

Theme system: OpenCode-style semantic tokens (`primary`, `accent`, `error`,
`warning`, `text`, `textMuted`, `background*`, `border*`) as JSON under
`.codeatlas/tui/themes/*.json`, two built-ins shipped (atlas-dark, tokyonight).

## 4. F01–F13 — status vs. code (verified 2026-09-07) and gaps

Status tags use the repo convention and were verified against source, not docs.

| # | Feature | Status today | What's actually missing |
|---|---|---|---|
| F01 | Minimum Sufficient Context Engine | **[PARTIAL] — mostly built** | `buildSlice` + budget + deny + staleness + hierarchy tiers + sufficiency gate exist. Missing: graph-driven caller/callee closure expansion, intent-routed retrieval (the repo's own audit lists these P0/P1) |
| F02 | Adaptive Model Router | **[PLANNED]** (seams exist) | The router itself: task-class → model policy, fallback chains, budget/limit awareness. Built **on** `ChatAgentPort` + orchestrator roles + provider profiles (§5) |
| F03 | Context & Token Budget Manager | **[IMPLEMENTED]** core | `applyBudget`/`DEFAULT_CONTEXT_BUDGET`, usage budgets + hard limits exist. Missing: per-provider default budget table, cross-provider budget for multi-model loops |
| F04 | Knowledge Gap + Research Engine | **[PARTIAL]** seams only | Planner exposes `unknowns`; sufficiency gate exists; benchmark configs reference Tavily/web tools. Missing: runtime gap detector + opt-in allow-listed research tools feeding back into context |
| F05 | Verify → Repair → Escalate Loop | **[PARTIAL]** | `VerifierPort` + `@atlas/verifier` (claim checks, ADR-018 allow-listed commands), `atlas verify` exist. Missing: auto-repair retry and **escalation to a stronger model** (couples to F02) |
| F06 | Risk-Aware Tool Execution | **[IMPLEMENTED]** core | Tool-loop policy + denials + budgets; Toolkit `SecurityPort` trust states. Missing: unified risk policy across external agent-CLI sessions |
| F07 | Sandbox + Capability Security | **[PLANNED]** | No real sandboxing today. `ProcessRunner` is argv-only; verifier commands are allow-listed. Needs its own ADR (per-OS confinement is a large lift) |
| F08 | Prompt Injection + Secret Guard | **[PARTIAL]** | Slices treated as untrusted input; deny lists for secrets/sensitive paths; MCP hardening. Missing: dedicated injection detector on inbound repo content + outbound secret redaction at the context boundary |
| F09 | Change Impact & Blast Radius | **[PARTIAL]** seams | Graph (deps, paths, cycles) + orchestrator conflict detection exist. Missing: impact scorer + surface (CLI/TUI) |
| F10 | Agent Trace + Replay | **[PARTIAL]** | `executionTrace` on chat results, verification state, benchmark traces. Missing: persistent event log + replay (sessions are in-memory per ADR-007) |
| F11 | CI/CD Quality & Security Gate | **[PLANNED]** | Kernels exist (`atlas verify`, `atlas doctor`, benchmark). Missing: gate mode + CI wiring |
| F12 | Atlas Control Plane | **[PLANNED]** | Central authz/approvals/audit/rollback. Natural home: extend `apps/server` (ADR-013 pattern). Needs its own ADR |
| F13 | Specialized Autonomous Agent Orchestration | **[PARTIAL]** | `createOrchestrator` implemented (bounded roles, combine, conflicts). Missing: the specialist layer — router (F02) + research (F04) + verify/escalate (F05) composed into autonomous loops |

**Build-order implication:** F02 + F05-escalation are the multiplier — they
unlock F13 and turn the harness into the cockpit for it. The harness and this
feature program are **one program**, not two.

## 5. Free AI as the default (researched 2026-09-07 from provider docs)

CodeAtlas already has the adapter pattern for all of these (`ProviderPort`,
quarantined adapters in `packages/providers/src/adapters/`;
`ProviderChatAgent` already defaults to `ollama`).

| Provider | Cost | API compatibility | Verified limits | Effort |
|---|---|---|---|---|
| **Ollama (local)** | Free, unlimited, own hardware | Native adapter exists (`OllamaAdapter`, `createOllamaService`) | Machine's limits | **Zero — already the default** |
| **Groq free tier** | Free key, no card | OpenAI-compatible at `api.groq.com/openai/v1` | ~30 RPM / 1K req/day / 8K TPM per model (gpt-oss, llama, qwen families listed) | Small — one adapter entry |
| **OpenRouter `:free`** | Free key; daily caps scale with lifetime credits purchased | OpenAI-compatible at `openrouter.ai/api/v1` | Free variants (`:free` suffix) get RPM/RPD caps; **429 + `Retry-After` are first-class signals** | Small — same base as Groq |
| **Gemini free tier** | Free AI Studio key | Native adapter exists + OpenAI-compatible endpoint | Per-model RPM/RPD caps, reset midnight Pacific | Zero — `gemini.ts` exists; add free-tier key config |

Integration design:

1. **New adapters only** in `packages/providers/src/adapters/` (quarantine
   rule): `openrouter.ts` and `groq.ts` extend the existing
   `openai-compatible.ts` base — base URL + header quirks stay inside the
   adapter.
2. **Provider profiles** in `.codeatlas/config`: `tier: local | free | paid`,
   key env var (`OPENROUTER_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`), and
   rate-limit metadata. **Default = `local` (Ollama)**; nothing paid is touched
   without explicit user config; keys come from env, never logged
   (`docs/SECURITY.md`).
3. **Router-aware fallback chain** (heart of F02): try
   `local → free-tier → stronger free model → escalate to paid/explicit`. On
   429: honor `Retry-After`, then fall to the next chain entry. Per-provider
   RPM/RPD counters live in the usage store (`.codeatlas/usage.db`).

## 6. Freebuff — ads, credits, and "reels while the AI works"

### 6.1 The precedent (researched 2026-09-07)

**SponsorLink (2023):** an npm-ecosystem tool scanned developers' local repos
to target sponsor messages inside CLI output. The reaction was severe —
"privacy issues with SponsorLink" issues on packages like Moq, mass
uninstalls, and the sponsor ecosystem collapsed within weeks. Fatal mistakes:
**(a)** repo-derived data used for ad targeting; **(b)** ads injected into the
core workflow uninvited.

### 6.2 Verdict: viable only as an opt-in earn surface

**Viable — "Freebuff" as an opt-in panel:**

- A **user-opened panel** in the TUI (`Ctrl+R` / `/freebuff`) — a reels-style
  feed that plays **while agents work in the background**. The seam exists:
  sessions run supervised while the UI is idle; ink renders overlay/side
  panels trivially.
- **Earning = credits** applied against harness costs (credits pay for
  free-tier overflow or sponsored model credits — "this session was free via
  X").
- **Hard rules (non-negotiable, from the SponsorLink autopsy):**
  1. **Never** target ads with repository data — targeting is context-free,
     and the ad path never reads repo content (privacy rules).
  2. **Never** let ad/sponsor content enter the agent transcript or model
     context — it is untrusted input under F08; a hostile or sloppy ad must
     never become a prompt.
  3. **Opt-in + clearly labeled** — no interstitials, no mid-workflow popups,
     no auto-play with sound on start.
  4. Ad network calls live **only in the UI layer**, never in SDK/agent
     layers — the boundary is structural, not policy.

**Not viable:** forced/pre-roll ads before agent runs, repo-targeted ads, or
anything touching `@atlas/sdk` — that would repeat SponsorLink's exact failure
mode in a repo-indexing tool, the most trust-sensitive category there is.

**Recommendation:** build the **credit-sponsored variant first** (sponsors
underwrite model credits — zero ad-network dependency), keep the reels panel as
the opt-in earning surface behind a config flag, off by default. Same UX,
lower risk, launchable later without re-architecture.

## 7. Program plan — ADRs and phases

**ADRs (`docs/decisions/`, next numbers 019+; written when each phase starts):**

- **ADR-019:** Harness UI — ink-based TUI in `apps/cli` over SDK seams; slash
  registry; theme system; `provider/model` addressing.
- **ADR-020:** Adaptive Model Router — `local → free → paid` fallback chains,
  rate-limit-aware, behind a new `RouterPort` in `core` (provider logic stays
  quarantined in `@atlas/providers`).
- **ADR-021:** Free provider profiles & Freebuff credits ledger (usage-store
  extension; additive schema change per the database rules).
- Later: **ADR-022** Sandbox (F07), **ADR-023** Control Plane (F12) — each
  requires its own design cycle.

**Phases (each = code → tests → docs → `pnpm check`):**

| Phase | Scope | Features served |
|---|---|---|
| **A — Harness shell** | `atlas tui`, themes, `/help`, `/models`, `/model`, agent sessions, `/sessions`, `/stop` | Harness v1 |
| **B — Free default stack** | `openrouter.ts` + `groq.ts` adapters (quarantined), provider profiles + `tier`, default = Ollama, `/connect` onboarding, 429/`Retry-After` fallback, per-provider limit counters via `createUsageService` | F02 start, cost control |
| **C — Router + loop wiring** | `RouterPort` in core; SDK policy (task class → model chain → escalate on verify-fail); harness `/route`; orchestrator roles = specialist agents; `/usage` per turn | F02, F05, F13 v1 |
| **D — Context + research** | Graph closure expansion behind the existing scorer seam; gap detector (plan unknowns + sufficiency fails); opt-in allow-listed research tools with timeouts; `/research` | F01 remainder, F04 |
| **E — Guard rails** | Injection heuristics on inbound content; outbound secret redaction at the context-integration boundary; unified risk policy surface for agent sessions | F06 remainder, F08 |
| **F — Freebuff** | Credit ledger in usage store (additive migration); sponsored-credits redemption; opt-in reels panel (`Ctrl+R`) under the §6.2 hard rules; config-flagged **off** by default | Monetization |
| **G — P1 track** | F09 blast radius, F10 trace/replay persistence, F11 CI gate, F12 control plane — each scoped separately (F12 is effectively a sub-product) | P1 features |

## 8. Non-goals until their ADRs

- Real OS-level sandboxing (F07) — argv-only spawns + allow-listed commands
  remain the security model until ADR-022.
- Control-plane authz/approvals (F12) — until ADR-023.
- Multi-language parsers; embeddings; session persistence DB (sessions stay
  in-memory per ADR-007).
- Cloud/share features; any ad integration outside the UI layer.

## 9. Related documents

- `docs/CURRENT_STATE.md` — arbiter of what exists (update per phase).
- `docs/FEATURE_STATUS.md` — feature table (update per phase).
- `docs/DEPENDENCIES.md` — dependency-add checklist (ink/react rationale
  lives in ADR-019).
- `docs/AGENT_SESSIONS.md`, `docs/AGENT_ORCHESTRATOR.md` — session and
  orchestrator seams the harness drives.
- `docs/USAGE.md` (ADR-009) — usage store the provider profiles and credits
  ledger extend.
- `docs/SECURITY.md`, `docs/PRIVACY.md` — boundaries Freebuff and F08 must
  respect.

## 10. Expanded Provider Ecosystem — MiMo, GLM, Kimi, Qwen + more

All of these are **OpenAI-compatible** — they drop into the existing
`OpenAICompatibleAdapter` base class (the same pattern as the already-
implemented `DeepSeekAdapter`).

### 10.1 Provider compatibility matrix (verified 2026-09-07)

| Provider | Base URL | Free tier | Models (coding-relevant) | API compat | Effort |
|---|---|---|---|---|---|
| **DeepSeek** | `api.deepseek.com/v1` | Yes (limited) | `deepseek-v4-flash`, `deepseek-v4-pro` | OpenAI | **Already in codebase** |
| **Zhipu GLM** | `open.bigmodel.cn/api/paas/v4` | Yes | `GLM-5.3`, `GLM-5.3-Flash`, `GLM-4-Plus`, `GLM-4-Flash` | OpenAI SDK compatible | Small — one adapter |
| **Moonshot/Kimi** | `api.moonshot.cn/v1` | Yes | `kimi-k3`, `kimi-k2.7-code`, `kimi-k2.6` | OpenAI | Small — one adapter |
| **Alibaba Qwen/DashScope** | `dashscope.aliyuncs.com/compatible-mode/v1` | Yes | `qwen-coder-turbo`, `qwen-coder-plus`, `qwen-max` | OpenAI + Anthropic + native | Small — one adapter |
| **Groq** | `api.groq.com/openai/v1` | Yes (rate-limited) | `llama-3.3-70b`, `qwen-2.5`, `gpt-oss` | OpenAI | Already in plan |
| **OpenRouter** | `openrouter.ai/api/v1` | Yes (`:free` suffix) | Many | OpenAI | Already in plan |
| **Together AI** | `api.together.xyz/v1` | $5 free credit | 100+ OSS models | OpenAI | Small — one adapter |
| **Fireworks AI** | `api.fireworks.ai/inference/v1` | Fire Pass credits | 100+ OSS, Kimi K2 | OpenAI | Small — one adapter |
| **Ollama** | `localhost:11434` | Unlimited (local) | Any pulled model | Native | Already default |

### 10.2 What "MiMo" likely refers to

"MiMo" is ambiguous — three possibilities, all Chinese, all OpenAI-compatible:

- **MiniMax** (`api.minimax.io`) — `abab` text/chat models, free tier for new users
- **Moonshot/Kimi** (`api.moonshot.cn`) — `kimi-k3` flagship, free tier
- **Xiaomi MiMo** — Xiaomi's open-weight model (if API launched)

**Recommendation:** implement **Moonshot/Kimi** (best coding model, clear
OpenAI-compatible API, free tier) and **Zhipu GLM** (strong coding, free
tier, OpenAI SDK compatible). Add MiniMax if demand emerges. All three
use the same adapter pattern.

### 10.3 Integration pattern (unchanged)

Each new provider = one small class extending `OpenAICompatibleAdapter`:

```ts
export class KimiAdapter extends OpenAICompatibleAdapter {
  constructor(config, transport) {
    super("kimi", "kimi-k3", "https://api.moonshot.cn/v1", config, transport);
  }
}
```

Then register in `provider.service.ts` and add env var (`KIMI_API_KEY`,
`GLM_API_KEY`, `DASHSCOPE_API_KEY`) to `config.ts`. Provider logic stays
quarantined — no `if (provider === ...)` outside adapters.

## 11. Business Model

### 11.1 Reference: how the leaders make money

| Company | Model | Revenue insight |
|---|---|---|
| **Cursor** | Freemium ($20/mo Pro, Ultra, Teams, Enterprise) | **$2B recurring revenue** (doubled in 3 months, per Bloomberg); acquired by SpaceX Aug 2026 |
| **GitHub Copilot** | Seat-based ($10-19/mo) | 1.8M+ paid subscribers, 73K+ enterprises |
| **Replit** | Credits + seat | Usage-based compute + team features |
| **Tabnine** | Freemium → Enterprise | Free individual, $99/user/mo enterprise |
| **Continue.dev** | Open-core | Free OSS + paid cloud/enterprise |
| **PostHog** | Open-core | Free self-hosted + paid cloud |

### 11.2 CodeAtlas recommended model: open-core + credits marketplace

**Free tier (individuals, open-source, students):**

- Full context engine (scanner → graph → search → SDK)
- Local models (Ollama) — unlimited, free
- Basic TUI harness
- Community support
- All free-tier API models (Kimi, GLM, DeepSeek, Groq free, etc.)

**Pro tier ($15-25/mo per user):**

- Cloud sync (context DB, sessions, settings across machines)
- Advanced model routing (Cursor Router-style — picks the best model per
  task)
- Priority access to paid models (Claude, GPT, Gemini)
- Research engine (opt-in web tools feeding context)
- Team shared context and sessions
- Email support

**Team/Enterprise ($50-100/seat/mo):**

- Admin console, SSO, audit logs
- Self-hosted deployment option
- Custom model fine-tuning
- SLA, dedicated support
- Compliance (SOC 2, HIPAA path)

**Credits marketplace (usage-based, optional):**

- Buy model credits for premium providers
- Sponsor credits (companies underwrite free-tier usage)
- Tool/agent marketplace (take 10-15% fee on sales)

### 11.3 Why open-core wins for CodeAtlas

- The context engine is the moat — it's local-first, privacy-respecting,
  works offline
- Developers trust open-source dev tools (Continue.dev, PostHog, Supabase
  prove this)
- Free tier grows the user base; Pro/Team monetizes power users
- Enterprise deals require trust — open-source builds it

## 12. How to Earn While Giving Free AI

### 12.1 The free-tier monetization stack

| Revenue source | How it works | Example |
|---|---|---|
| **Sponsor credits** | AI labs/cloud providers sponsor free-tier model credits in exchange for visibility ("This session powered by Kimi") | Cursor's model sponsors, browser search deals |
| **Marketplace fees** | Take 10-15% of tool/agent sales in the marketplace | Cursor Marketplace, VS Code Marketplace |
| **Enterprise upsell** | Free for individuals → paid for teams (the "Slack model") | Continue.dev, PostHog, GitLab |
| **Cloud hosting** | Free local → paid cloud sync/agents | Figma, Notion, Replit |
| **GitHub Sponsors / Open Collective** | Community donations from users who value the tool | cURL, OpenWebUI, many OSS projects |
| **Grants** | Non-dilutive funding for open-source infrastructure | NLNet, Sovereign Tech Fund, GitHub Accelerator |

### 12.2 The math that makes it work

- **Free user acquisition cost**: $0 (organic, content, community)
- **Free user lifetime value**: $0 directly, but...
- **Conversion to paid**: 3-8% is typical for dev tools (Cursor, Copilot
  prove this)
- **If 100K free users → 5K paid at $20/mo = $1.2M ARR**
- **Sponsor credits**: Even non-paying users generate value (model usage
  data, marketplace activity, word-of-mouth)

### 12.3 Sponsor credits in detail (the "give free AI, earn" engine)

1. **AI labs sponsor credits**: Kimi/GLM/DeepSeek give free API credits to
   CodeAtlas → CodeAtlas shows "Powered by Kimi" in the free tier → Kimi
   gets user acquisition, CodeAtlas gets free AI for users
2. **Cloud providers sponsor**: AWS/GCP/Azure give credits for showcasing
   their model endpoints
3. **Tool sponsors**: Security tools, CI/CD tools sponsor the marketplace
   for visibility
4. **The key**: Sponsors pay for **distribution**, not for repo data
   (privacy rule from §6 still holds)

## 13. Marketing & Growth Strategy

### 13.1 Reference: what works for dev tools (from PostHog, Continue.dev, Cline, Sentry)

| Channel | Strategy | Priority |
|---|---|---|
| **Content (blog)** | 1 great technical article >>> 25 mediocre ones. Deep dives, not SEO fluff. | **#1 pre-PMF** |
| **GitHub** | Strong README, good docs, star campaigns, "Show HN" ready | **#1 always** |
| **Hacker News** | "Show HN: CodeAtlas — open-source AI context engine" — time it right | High-impact spikes |
| **Reddit** | r/programming, r/vscode, r/devops, r/selfhosted, r/machineLearning | Steady organic |
| **Twitter/X** | Personal accounts of founders 10x more effective than company account | Consistent presence |
| **Discord** | Community server for users, contributors, model providers | Retention + feedback |
| **Conferences** | GitHub Universe, KubeCon, AI Engineer Summit, VS Code Live | Post-PMF scaling |
| **Partnerships** | IDE extensions (VS Code, JetBrains), CI/CD integrations | Distribution |

### 13.2 Pre-product-market fit (now → first 10K users)

1. **Content depth over breadth** — write 3-5 genuinely useful deep-dive
   posts:
   - "How CodeAtlas gives any AI model perfect context about your repo"
   - "I replaced Cursor's context with an open-source alternative"
   - "Running Claude + Kimi + Ollama in one terminal with automatic model
     routing"
2. **GitHub polish** — README with GIF demo, one-line install, clear value
   prop
3. **Hacker News launch** — "Show HN" with a founder comment explaining
   the problem
4. **Reddit cross-post** — r/programming + r/vscode + r/selfhosted
5. **Discord community** — small, focused, founder-engaged

### 13.3 Post-product-market fit (10K → 100K users)

1. **Hire a developer who loves writing** onto the marketing team
   (PostHog's #1 advice)
2. **Paid ads** — only after PMF, target developers on GitHub, Stack
   Overflow, Twitter
3. **Sponsorships** — sponsor dev newsletters (TypeScript Weekly, DevOps
   Weekly), do bursts (3 months on, 3 off)
4. **Conference talks** — send engineers (not marketing) to speak;
   engineers trust engineers
5. **YouTube** — demos, tutorials, "how it works" (but expensive;
   prioritize after content/blog)

### 13.4 Key principles (from PostHog's experience)

- **Personal accounts 10x more effective** than company accounts
- **Don't try multiple channels at once** — master one, then expand
- **Treat your website like a product** — separate from marketing,
  engineering-owned
- **Hacker News is double-edged** — great for spikes, don't depend on it
- **"1 great article >>> 25 mediocre ones"** — quality compounds

## 14. Funding Strategy

### 14.1 Reference: AI dev tool funding landscape (2026)

| Company | Stage | Amount | Valuation | Notes |
|---|---|---|---|---|
| **Cursor** | Acquired | — | — | **Acquired by SpaceX** Aug 2026; $2B RR |
| **Nscale** (AI compute) | Pre-IPO | $3.5B | — | AI infrastructure |
| **Crusoe** | Series | $3B | $30B | AI compute |
| **AfterQuery** | YC | — | $3.2B | YC's fastest-ever unicorn |
| **Nvidia/Hugging Face** | Acquisition | $12.9B | — | Strategic acquisition |
| **Typical AI dev tool Seed** | Seed | $3-8M | — | Standard range |
| **Typical AI dev tool Series A** | Series A | $10-30M | $40-150M | With traction |

### 14.2 Funding path for CodeAtlas

**Phase 1: Bootstrap + Community (now → $0)**

- GitHub Sponsors + Open Collective (proven: $40M+ distributed via
  GitHub Sponsors)
- Build in public, grow organically
- Target: 1K GitHub stars, 100 Discord members, 10K monthly users

**Phase 2: Pre-seed/Seed ($2-5M, at 5K-20K users)**

- **Investors**: Y Combinator, AI2 Incubator, Mozilla Ventures, OSS
  Capital, Sequoia, a16z, Bessemer
- **What they look for**: User growth rate, retention, engagement, team,
  open-source traction
- **Metrics that matter**: Monthly active users, GitHub stars, Discord
  activity, conversion rate to paid
- **Use of funds**: 2-3 engineers, content/marketing, cloud
  infrastructure

**Phase 3: Series A ($10-30M, at $1-5M ARR)**

- **Trigger**: Clear product-market fit, 5K+ paid users, enterprise
  pipeline
- **Investors**: Tier-1 VCs (a16z, Sequoia, Bessemer, Accel)
- **Use of funds**: Scale team, enterprise features, sales, partnerships

**Alternative: Revenue-based (no dilution)**

- Pipe, Capchase, or similar once there's recurring revenue
- Grow without giving up equity

### 14.3 Non-dilutive funding (grants)

| Grant | Amount | Eligibility |
|---|---|---|
| **GitHub Sponsors** | Variable | Open-source project |
| **Open Collective** | Variable | Open-source community |
| **NLNet Foundation** | €5K-€50K | Open-source infrastructure |
| **Sovereign Tech Fund** | €10K-€500K | Open-source (EU-focused) |
| **GitHub Accelerator** | $20K + mentorship | Early-stage OSS |
| **Mozilla Ventures** | $500K+ | Open-source, privacy-respecting |
| **OSS Capital** | $1M+ | Open-source infrastructure |

### 14.4 What investors look for (the metrics)

1. **User growth rate** — month-over-month, organic > paid
2. **Retention** — do users come back? (DAU/MAU ratio)
3. **Engagement** — sessions per user, context builds per day
4. **Conversion** — free → paid rate (3-8% is healthy)
5. **GitHub stars** — proxy for developer mindshare
6. **Community** — Discord activity, contributors, PRs
7. **Team** — technical founders who ship
8. **Moat** — context engine is hard to replicate; open-source community
   is a moat

## 15. Updated phase roadmap

| Phase | Scope | Features served |
|---|---|---|
| **A — Harness shell** | `atlas tui`, themes, `/help`, `/models`, `/model`, agent sessions, `/sessions`, `/stop` | Harness v1 |
| **B — Free default stack** | `kimi.ts` + `glm.ts` + `dashscope.ts` + `openrouter.ts` + `groq.ts` adapters (quarantined), provider profiles + `tier`, default = Ollama, `/connect` onboarding, 429/`Retry-After` fallback, per-provider limit counters via `createUsageService` | F02 start, cost control |
| **C — Router + loop wiring** | `RouterPort` in core; SDK policy (task class → model chain → escalate on verify-fail); harness `/route`; orchestrator roles = specialist agents; `/usage` per turn | F02, F05, F13 v1 |
| **D — Context + research** | Graph closure expansion behind the existing scorer seam; gap detector (plan unknowns + sufficiency fails); opt-in allow-listed research tools with timeouts; `/research` | F01 remainder, F04 |
| **E — Guard rails** | Injection heuristics on inbound content; outbound secret redaction at the context-integration boundary; unified risk policy surface for agent sessions | F06 remainder, F08 |
| **F — Freebuff** | Credit ledger in usage store (additive migration); sponsored-credits redemption; opt-in reels panel (`Ctrl+R`) under the §6.2 hard rules; config-flagged **off** by default | Monetization |
| **G — P1 track** | F09 blast radius, F10 trace/replay persistence, F11 CI gate, F12 control plane — each scoped separately (F12 is effectively a sub-product) | P1 features |
| **H — Business launch** | Pro/Team pricing, credits marketplace, sponsor onboarding, GitHub Sponsors integration, `/usage` billing surface | Revenue |
| **I — Growth** | Content engine (blog), community (Discord), conference presence, IDE/CI partnerships, Hacker News launch | Users |

## 17. Feedback & Taste Learning System

### 17.1 What it does

After every task completion, CodeAtlas collects feedback, builds a **taste profile** for each user, and uses that profile to adapt future behavior. The longer you use CodeAtlas, the better it knows you.

### 17.2 Feedback collection (all of the above)

**Quick feedback (always shown):**

```
┌─────────────────────────────────────────┐
│  Task complete: "Build a login form"    │
│                                         │
│  How was the result?                    │
│  [👍]  [👎]  or click a star:          │
│  ★ ★ ★ ★ ☆  (4/5)                      │
│                                         │
│  [Add optional comment...]              │
│  [Save feedback]                        │
└─────────────────────────────────────────┘
```

**Detailed feedback (optional expand):**

```
  Code quality:     ★ ★ ★ ★ ★
  Correctness:      ★ ★ ★ ★ ☆
  Style match:      ★ ★ ★ ★ ★
  Verbosity:        ★ ★ ★ ☆ ☆  (too verbose)
  Speed:            ★ ★ ★ ★ ☆

  What worked well? [________________]
  What to improve?  [________________]
```

**Implicit feedback (automatic, no user action):**

| Signal | Interpretation |
|---|---|
| User accepts changes without editing | Strong positive |
| User edits output significantly | Partial negative |
| User re-runs the task | Negative (previous was bad) |
| User undoes changes | Strong negative |
| User switches models mid-task | Current model not working |
| User copies output to clipboard | Positive |

### 17.3 Taste profile (editable by user)

Stored locally at `.codeatlas/taste.json`:

```json
{
  "version": 1,
  "updated": "2026-09-07T10:30:00Z",
  "categories": {
    "code_style": {
      "functional": 0.85,
      "oop": 0.15,
      "preference": "functional"
    },
    "verbosity": {
      "concise": 0.70,
      "verbose": 0.30,
      "preference": "concise"
    },
    "languages": {
      "typescript": 0.80,
      "rust": 0.60,
      "python": 0.40,
      "preferred": ["typescript", "rust"]
    },
    "ui": {
      "style": "minimalist",
      "color_scheme": "dark",
      "framework": "tailwind",
      "library": "shadcn"
    },
    "architecture": {
      "file_size": "small",
      "composition": true,
      "monorepo": true
    },
    "models": {
      "planning": { "kimi-k3": 4.5, "glm-4": 4.2 },
      "execution": { "ollama-qwen3": 4.3, "deepseek-v4": 3.8 },
      "review": { "deepseek-v4": 4.0 }
    },
    "tools": {
      "confirm_before_write": true,
      "show_diff_first": true,
      "read_only_first": true
    }
  },
  "rules": [
    "Prefer functional programming patterns",
    "Keep functions under 30 lines",
    "Use TypeScript strict mode",
    "Minimal comments, self-documenting code",
    "Dark mode UI with Tailwind CSS"
  ]
}
```

**User can edit** via:
- `/taste` command in the TUI — opens interactive editor
- Direct edit of `.codeatlas/taste.json`
- `/taste reset` — start over
- `/taste explain` — show what Atlas learned and why

### 17.4 How taste is applied (strong override)

Taste is injected into the system prompt before every task:

```
SYSTEM PROMPT:
You are CodeAtlas, an AI coding agent. Complete the task below.

=== USER TASTE PROFILE (strong guidance) ===
Code style: Functional programming preferred (85% confidence)
Verbosity: Be concise, minimal comments (70% confidence)
Languages: TypeScript preferred, then Rust
UI: Minimalist design, dark mode, Tailwind CSS + shadcn
Architecture: Small files (<200 lines), composition over inheritance
Models: Use kimi-k3 for planning, ollama-qwen3 for execution
Safety: Show diff before writing, confirm before running commands

Violate these preferences only with good reason and explain why.

=== TASK ===
[user's task here]
```

**Strong means:**
- Taste profile overrides default behavior
- Model selection follows user's historical preferences
- Code style matches user's patterns
- If Atlas violates taste, it must explain why

### 17.5 Storage layers

| Layer | Location | Content | Privacy |
|---|---|---|---|
| **Local feedback** | `.codeatlas/feedback.db` | Full task history + ratings | Never leaves machine |
| **Local taste** | `.codeatlas/taste.json` | Derived preference profile | User-owned, editable |
| **Server analytics** | Atlas server (opt-in) | Anonymized aggregates only | User chooses what to send |
| **Taste sync** | Atlas server (opt-in) | Encrypted taste profile | Cross-machine sync |

### 17.6 Server analytics (opt-in, user controls)

**What users can share (granular permission):**

```
┌─────────────────────────────────────────┐
│  Help improve CodeAtlas (opt-in)        │
│                                         │
│  [x] Share anonymized ratings           │
│      (★★★★★ on tasks, no content)       │
│  [x] Share model performance            │
│      (which models work best)           │
│  [x] Share taste patterns               │
│      (code style preferences, no code)  │
│  [ ] Share task descriptions            │
│      (what people build)                │
│  [ ] Share context snippets             │
│      (code I work with)                 │
│                                         │
│  [Save preferences]  [View data]        │
└─────────────────────────────────────────┘
```

**What the server learns (global patterns):**
- Which models work best for which tasks
- Common user preferences (functional vs OOP, etc.)
- Frequent complaints and improvement areas
- Feature usage patterns

**What the server NEVER gets:**
- User's actual code
- Task descriptions (unless explicitly allowed)
- Identifying information
- Anything without explicit opt-in

### 17.7 Taste sync (cross-machine)

If user opts in:
- Taste profile encrypted and stored on server
- Sync across multiple machines
- `/taste sync` — pull latest taste from server
- `/taste export` — download taste profile
- `/taste import` — load taste profile on new machine

### 17.8 Feedback commands in TUI

| Command | Action |
|---|---|
| `/feedback` | Show feedback dialog for last task |
| `/feedback <id>` | Give feedback on specific past task |
| `/taste` | View and edit taste profile |
| `/taste explain` | Show why Atlas made specific choices |
| `/taste reset` | Clear taste profile and start over |
| `/taste sync` | Sync taste across machines |
| `/taste export` | Export taste to file |
| `/taste import` | Import taste from file |
| `/stats` | Show personal usage + feedback stats |

### 17.9 The virtuous cycle

```
Task completed
    ↓
User rates: ★★★★☆ "Good but too verbose"
    ↓
Taste profile updated: verbosity → concise (70% → 75%)
    ↓
Next task: system prompt says "be concise"
    ↓
Result is more concise
    ↓
User rates: ★★★★★ "Perfect"
    ↓
Taste profile reinforced: verbosity → concise (75% → 80%)
    ↓
(Keeps getting better)
```

### 17.10 Why this is a moat

| Competitor | Learns your taste? | Remembers across sessions? |
|---|---|---|
| Cursor | ❌ No | ❌ No |
| Claude Code | ❌ No | ❌ No |
| OpenCode | ❌ No | ❌ No |
| Aider | ❌ No | ❌ No |
| **CodeAtlas** | ✅ Yes | ✅ Yes |

The agent that **knows you** is the agent you don't switch away from. This is the stickiest feature possible.







