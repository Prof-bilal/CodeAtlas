# CodeAtlas AI Workflow

How to use CodeAtlas with an AI provider (local Ollama or a cloud provider) and
external AI coding CLIs (Claude, Gemini, Codex, OpenCode): connect a provider,
generate AI summaries, launch agent sessions with context, and read the token
usage / savings. Complements [AI_PROVIDERS.md](./AI_PROVIDERS.md) (how calls
are made), [USAGE.md](./USAGE.md) (tokens & credits), and
[AGENT_SESSIONS.md](./AGENT_SESSIONS.md) (session lifecycle).

> Everything here is **verified against the code**; where a surface is planned
> rather than implemented, it is tagged **[planned]**. CodeAtlas is
> **AI-optional**: every AI step below fails cleanly (or is skipped) when no
> provider is configured.

-

## 1. At a glance

```text
atlas ollama connect            connect a provider (local server or cloud key)
atlas ollama use <model>        select the active model for summarization
atlas providers                 confirm what is configured (keys never printed)
        │
atlas explain --ai <target>     AI summary of a file/module (opt-in, per call)
atlas search <query> --ai       AI summaries for the top file hits
atlas context launch "<task>" --provider opencode   launch an AI CLI with context
        │
atlas agents connect            register the CodeAtlas MCP server for AI tools
        │
atlas usage                     total tokens / cost / budgets
atlas sessions stop <id>        token impact: burned vs. without-CodeAtlas vs. saved
```

-

## 2. Connect a provider

### Local Ollama server

```bash
atlas ollama connect                  # no key → local server on http://localhost:11434
atlas ollama status                   # ✓ Connected / ○ Not connected
atlas ollama models                   # models the server exposes
atlas ollama use llama3               # select the active model
```

### Ollama Cloud (or a keyed provider)

```bash
atlas ollama connect --api-key <key> --save-key   # persist in ~/.codeatlas/providers.json (0600)
```

`--save-key` persists the key; without it the key is used in memory only. The
`OLLAMA_API_KEY` / `OLLAMA_BASE_URL` env vars are also honored.

### Cloud providers (claude / openai / gemini / deepseek)

These are configured through API keys found in the environment or the persisted
settings (`~/.codeatlas/providers.json`) — the `atlas providers` overview lists
them:

```bash
atlas providers          # ✓ claude — model …   /   ○ ollama — not configured
```

Default provider/model: `activeProvider`/`activeModel` in the settings file
(`atlas ollama use <model>` sets both to Ollama). Never set a key on the
command line beyond the prompt/option; keys are never printed.

> **Where do the keys go?** `~/.codeatlas/providers.json` (user-scoped,
> `0600`). Nothing is written into the repository and `.codeatlas/` stays
> gitignored. See [PRIVACY.md](./PRIVACY.md).

-

## 3. Generate AI summaries

Once a provider is configured, **`atlas explain --ai`** generates a fresh AI
summary (file or module) over the deterministic explanation:

```bash
atlas explain src/auth/auth-service.ts --ai
atlas explain src/auth --ai
```

- Deterministic data (symbols, dependencies, dependents, references) is always
  included; `--ai` only **adds** a generated summary.
- Without a configured provider it fails cleanly with a message.
- `atlas explain <target>` (no `--ai`) is fully deterministic and needs no AI.
- The AI summary pipeline is **content-hash cached** — unchanged files are not
  re-sent to the model.

The **MCP `get_summary` tool** does the same on demand
(`get_summary { target, generate: true }`) — see [MCP.md](./MCP.md).

**`atlas search <query> --ai`** summarizes the top hits while you work:

```bash
atlas search authentication --ai
```

- Deterministic ranked hits are unchanged; `--ai` **adds** an "AI summaries"
  section for the **top 5 file hits**.
- A stored summary is shown when one exists; otherwise a fresh one is generated
  (content-hash cached, same pipeline as `explain --ai`).
- Without a configured provider each hit fails cleanly with a message — the
  search itself always succeeds.

**`atlas init` / `atlas build` / `atlas update --summaries`** back-fill
summaries while indexing:

```bash
atlas build --summaries --repo /path/to/project
```

- Summarizes **every freshly parsed file** (all files on `build`/`init`, only
  `changed`/`added` files on incremental `update`); existing summaries for
  unchanged files are kept.
- Same pipeline as `explain --ai`/`search --ai`: content-hash cached, persisted
  into the context DB's `Summaries` table, and reported as
  `Summaries: <generated> (<failed> failed)`.
- Without a configured provider the build still succeeds — the failures are
  counted, never fatal.

-

## 4. Launch an AI coding CLI with context

### Non-interactive one-shot (recommended)

```bash
atlas context launch "fix the authentication flow" --provider opencode
atlas context launch "fix the authentication flow" --provider claude
atlas context launch "fix the authentication flow" --provider gemini
atlas context launch "fix the authentication flow" --provider codex
```

There is also a **standalone command per agent** that does the same thing with
the provider already implied:

```bash
atlas opencode "fix the authentication flow"     # ≡ context launch --provider opencode
atlas claude "fix the authentication flow"
atlas gemini "fix the authentication flow"
atlas codex "fix the authentication flow"
atlas opencode "fix the authentication flow" --ai  # prepends an AI briefing to the prompt
```

`atlas context launch`:

1. Builds a **budgeted, deny-filtered Context Package** from the index for the
   task (files, symbols, dependencies, overview, instructions);
2. creates a session for the agent provider;
3. starts the agent CLI in its non-interactive run mode
   (`opencode run "<context>"`, `claude -p "<context>"`, `gemini -p`, `codex exec`);
4. records a `session` usage event in `.codeatlas/usage.db`.

The provider ids are the agent adapters: `claude`, `gemini`, `codex`,
`opencode` (`packages/agents/src/adapters.ts`). Tune the package with
`--max-tokens-total`, `--no-instructions`, `--include-overview`, `--json`.

Preview what will be sent without launching:

```bash
atlas context "fix the authentication flow"
atlas context "fix the authentication flow" --explain   # why each item was chosen
```

> **Launching the agent is a real process spawn.** The agent CLI must be
> installed on PATH. If it is not, the session fails cleanly
> (`AgentCliNotFoundError`). CodeAtlas never builds a shell string — it spawns
> with an argument array (see [SECURITY.md](./SECURITY.md)).

### AI context briefing (`--ai`)

`--ai` adds an **AI briefing** of the assembled package on top of the
deterministic context — never instead of it (ADR-001). Requires a configured
provider; without one the command degrades cleanly and never exits non-zero
for the AI part alone:

```bash
atlas context "fix the authentication flow" --ai          # package + briefing section
atlas context "fix the authentication flow" --ai --json   # full ContextBriefing as JSON
atlas context launch "fix the authentication flow" --provider opencode --ai
                                                          # prepends the briefing to the session prompt
```

- `atlas context <task> --ai` prints the deterministic package **plus** an AI
  "context briefing" (overview + key points). On success in text mode the
  briefing is appended as a section; with `--json` the whole document is
  emitted. On failure it falls back to the deterministic package and prints
  `AI briefing unavailable: <reason>` (JSON mode: `aiMessage`), still exiting
  `0` for the deterministic part.
- `atlas context launch/attach --ai` prepends the rendered briefing to the
  session prompt; if the briefing fails, the session still launches with the
  deterministic package and a note is printed to stderr.
- Briefings are provider-backed through the SDK `ContextIntegration.brief()`
  (`BriefingPort`), content-hash cached like `explain --ai`.

### Register CodeAtlas MCP for interactive use

To give an **interactive** agent session access to the index, register the
CodeAtlas MCP server into the agent's config:

```bash
atlas agents connect --target opencode   # or: claude, gemini, codex, cursor, cline
atlas agents status                      # per-tool registration status
```

Then the agent can call `search_symbols`, `search_files`, `get_dependencies`,
`get_summary`, `explain_module`, `project_overview`, `read_file_range` while it
works — see [MCP.md](./MCP.md). This is what a prompt such as "use the codeatlas
mcp tools" enables: the agent queries the index itself and can generate
provider-backed summaries on demand (`get_summary { generate: true }`).

-

## 5. Sessions

```bash
atlas sessions               # list tracked sessions
atlas sessions info <id>     # provider, status, repository, pid, timestamps
atlas sessions stop <id>     # graceful stop + token-impact report
```

Sessions are created by `atlas context launch` (or programmatically through the
SDK `createSessionManager`). A session is one live instance of an external AI
CLI running in a repository; see [AGENT_SESSIONS.md](./AGENT_SESSIONS.md).

-

## 6. Tokens, usage, and savings

### Usage totals

```bash
atlas usage                  # summary — events, requests, tokens, cost, latency
atlas usage list             # per-event table (id, agent, provider, model, tokens, cost)
atlas usage list --provider ollama
atlas usage budgets          # budget status per scope
```

Every figure carries a provenance label: `actual` (provider-reported),
`estimated` (labeled heuristic), or `unknown` (no data — never invented). Cost is
computed from a static price table and is always labeled estimated.

### Token impact of a session

```bash
atlas context launch "fix the authentication flow" --provider opencode   # note the session id
atlas sessions stop <id>
```

`stop` prints:

```text
Token impact
Burned:            12,345 (estimated)
Without CodeAtlas: 98,000 (estimated)
Saved:             85,655 (estimated)
```

- **Burned** — tokens recorded against the session id (usage events).
- **Without CodeAtlas** — estimated cost of pasting the whole indexed repo
  (indexed bytes ÷ 4).
- **Saved** — the difference; stays `unknown` unless both sides are numeric.

These are estimates for orientation, never provider billing. See
[USAGE.md](./USAGE.md) for the full model.

-

## 7. A complete worked example

```bash
# 1. Index a project
atlas build --repo /path/to/project

# 2. Connect a local Ollama server and pick a model
atlas ollama connect
atlas ollama use llama3

# 3. Confirm the provider is live
atlas providers

# 4. Explain a file with an AI summary
atlas explain src/auth/auth-service.ts --ai --repo /path/to/project

# 5. Launch an OpenCode session seeded with repository context
atlas context launch "fix the authentication flow" --provider opencode repo /path/to/project

# 6. Track usage and stop
atlas usage
atlas sessions stop <session-id>
```

-

## 8. Status notes

| Surface | Status |
| - | - |
| Provider connect/status/use (`atlas ollama`, `atlas providers`) | **[IMPLEMENTED]** |
| Deterministic explain + opt-in AI summary (`atlas explain --ai`) | **[IMPLEMENTED]** |
| AI summaries on search (`atlas search <query> --ai`, top 5 file hits) | **[IMPLEMENTED]** |
| AI summaries during indexing (`atlas init`/`build`/`update --summaries`) | **[IMPLEMENTED]** — opt-in per run, cached + persisted, failures counted not fatal |
| Context Package build/explain (`atlas context`) | **[IMPLEMENTED]** |
| Agent session launch with context (`atlas context launch`) | **[IMPLEMENTED]** — non-interactive; prompt = rendered package |
| Agent MCP registration (`atlas agents connect`/`status`) | **[IMPLEMENTED]** |
| Usage summary/list/budgets (`atlas usage`) | **[IMPLEMENTED]** |
| Session token-impact (`atlas sessions stop`) | **[IMPLEMENTED]** — estimated, tri-state |
| Standalone agent launch (`atlas claude` / `gemini` / `codex` / `opencode` `<prompt...>`) | **[IMPLEMENTED]** — thin wrappers over `atlas context launch --provider <agent>`, `--ai` briefing supported |
| Interactive slash router (`atlas tui` `/claude`, `/cursor`, `/grok`, …) | **[PLANNED]** — v2 / not shipped |
| AI-enriched context package (`--ai` on `atlas context` build/launch/attach) | **[IMPLEMENTED]** |