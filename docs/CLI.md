# CodeAtlas CLI

The command-line contract for the `atlas` binary.

> **Status:** the command *surface* exists. **`atlas search` is wired to the
> Context SDK**, **`atlas mcp` starts the MCP server**, **`atlas sessions`
> manages AI agent sessions**, **`atlas usage` reports AI usage &
> credits**, **`atlas tools` is SDK-backed**, **`atlas context` is wired**, and
> **`init`/`build`/`update` run the SDK indexer**. The interactive **`atlas tui`**
> (also opened by bare `atlas` on a TTY) provides the slash-command surface:
> `/scan`, `/search`, `/context`, `/agents`, `/toolkit`, `/tools-install`, and
> `/claude` `/gemini` `/codex` `/opencode` (detect → launch interactively →
> install) plus `/cursor` `/grok` (install guidance). `explain`/`doctor` still
> print `[atlas <cmd>] Coming Soon` and do not call any service. The detailed
> behavior below is the **contract** — flagged **[implemented]** / **[stubbed]**
> / **[planned]** per command.

---

## 1. Invocation

```bash
atlas <command> [options]
atlas --help
atlas --version
```

Options take precedence over environment/config where they overlap.

---

## 2. Command surface

### Existing commands (registered in `apps/cli/src/commands`)

| Command | Current behavior | Target contract |
| ------- | ---------------- | --------------- |
| `atlas init` | **[implemented]** | Initialize and index the current project; supports `--repo` and `--json`. Runs the SDK-owned indexer (`indexProject`, mode `build`). |
| `atlas build` | **[implemented]** | Build/resolve the context index: scan → hash → parse changed files → build graph → persist to the context DB via the SDK indexer (`indexProject`, mode `build`). Reports files/symbols/summaries counts. |
| `atlas update` | **[implemented]** | Incrementally update an existing index via the SDK indexer: reuse hashes, re-parse and merge only `changed`/`added` files, drop `deleted` files. No-op when nothing changed. |
| `atlas scan` | **[implemented]** | Show a hierarchical overview of a project tree (files, folders, languages, framework) with **no indexing** — metadata only, via `scanProjectOverview()` from the SDK. Options: `--repo <path>`, `--json`. |
| `atlas search <query...>` | **[implemented]** | Search the index (symbols, files, modules, dependencies, summaries) with ranked, fuzzy-aware results. Options: `--repo <path>`, `--limit <n>`, `--type <kind>` (repeatable), `--no-fuzzy`, `--json`. Reads `.codeatlas/context.db` via the **Context SDK** (`createContextSDK` — see [CONTEXT_SDK.md](./CONTEXT_SDK.md)); errors with exit code `1` when no index exists. |
| `atlas mcp` | **[implemented]** | Start the **MCP server** over stdio for the current project (option `--root <path>` overrides `ATLAS_ROOT`/cwd). `@atlas/mcp` tools read context through the Context SDK. See [MCP.md](./MCP.md). |
| `atlas sessions` / `atlas sessions list` | **[implemented]** | List tracked AI agent sessions (table). |
| `atlas sessions info <id>` | **[implemented]** | Show details for one session (provider, status, repository, pid, started/ended, exit code). Never prints keys/env. |
| `atlas sessions stop <id>` | **[implemented]** | Gracefully stop a running session (`✓ Session stopped`); missing/bad id exits `1` with a message. Sessions are created programmatically via the SDK (`createSessionManager`). |
| `atlas usage` (bare) | **[implemented]** | Print the usage summary (same as `atlas usage summary`). Reads `.codeatlas/usage.db` via `createUsageService()` from the SDK (ADR-009). See [USAGE.md](./USAGE.md). |
| `atlas usage summary` | **[implemented]** | Totals (events, requests, tokens, cost, avg latency) + budget status. `--json` → `{ statistics, budgets }`. Tri-state rendering: `unknown` where no data, `(estimated)` labels where a figure is an estimate. |
| `atlas usage list` | **[implemented]** | Table of recorded usage events (ID, agent, provider, model, tokens, cost, latency, when); "No usage recorded." when empty. `--json` → `{ records }`; `--provider <provider>` filters. |
| `atlas usage budgets` | **[implemented]** | Per-scope budget status lines; "No budgets." when none. `--json` → `{ budgets }`. |
| `atlas explain <target>` | **[stubbed]** `Coming Soon` | Explain a symbol or concept; deterministic mode first, AI explanation only when a provider is configured. |
| `atlas doctor` | **[stubbed]** `Coming Soon` | Diagnose installation & project issues (Node version, `.codeatlas` presence & integrity, agent binaries for the orchestrator, provider config sanity). |
| `atlas config` | **[planned]** — not registered | View/edit configuration (providers, keys source, agents, ignored dirs). Keys never printed. |
| `atlas agents` | **[planned]** — not registered | List discovered agent CLIs for the orchestrator (Direction B). The connection layer (`@atlas/agents` behind `AgentPort`) is implemented; the CLI command is not. |
| `atlas agents <name>` | **[planned]** — not registered | Launch/inspect a specific agent session. |
| `atlas tools` | **[implemented]** parent command | Agent Toolkit commands (Direction C — see [AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md)). |
| `atlas tools search <query>` | **[implemented]** | Search the curated tool registry; `--json` supported. |
| `atlas tools info <tool>` | **[implemented]** | Show registry, trust/security, and installed manifest state; `--json` supported. |
| `atlas tools install <tool>` | **[implemented]** | Show exact plan/trust/risk first; `--yes` provides explicit approval; `--json` supported. |
| `atlas tools remove <tool>` | **[implemented]** | Delegate ecosystem removal and remove the local manifest; `--json` supported. |
| `atlas tools update` | **[implemented]** | Report local registry and installed-tool state; `--json` supported. |
| `atlas tools doctor` | **[implemented]** | Reconcile installed manifests, integration state, and trust; `--json` supported. |
| `atlas tools configure <tool>` | **[implemented]** | Configure only installed agents/hosts declared by the tool; `--dry-run` renders exact changes, `--json` emits machine-readable output, and `--config-home` supports managed/test user-config roots. |
| `atlas context <task>` | **[implemented]** | Build and render a deny-filtered, budgeted Context Package; `--explain` renders content-free selection reasons, `--json` emits package/explanation data, and budget/instruction/overview flags tune SDK assembly. |
| `atlas context launch <task>` | **[implemented]** | Launch a provider session seeded with the rendered Context Package via `SessionPort`; requires `--provider`, supports `--repo`, `--json`, and tuning flags. |
| `atlas context attach <session-id> <task>` | **[implemented]** | Attach context to a `CREATED` session; live/terminal sessions return a clean exit-1 typed error. |
| `atlas tui` | **[implemented]** | Interactive terminal UI (requires a TTY). Header shows repository + context state; slash commands: `/scan` (SDK indexer), `/search <query>`, `/context <task>`, `/agents` (detected AI CLIs), `/toolkit` (installed + recommended tools sidebar), `/tools-install <tool>` (plan → confirm → install through the Toolkit), `/claude` `/gemini` `/codex` `/opencode` (detect → launch **interactively** with a terminal handoff → install via npm when missing), `/cursor` `/grok` (vendor install guidance), `/status`, `/help`, `/exit`. Bare `atlas` opens it when stdin is a TTY (help otherwise). |
| `atlas setup` | **[planned]** — not registered | Guided environment → agent → tool recommendation → install → configure → verify (no auto-install without consent). |

### Agent slash commands (Direction B)

```text
atlas /gemini <prompt...>   # [planned] standalone router (not yet registered)
atlas /claude <prompt...>
atlas /codex <prompt...>
atlas /opencode <prompt...>
```

A working slash surface **already exists inside `atlas tui`** (`/claude`,
`/gemini`, `/codex`, `/opencode`, `/cursor`, `/grok`), backed by `@atlas/agents`
+ the session manager + the Toolkit installer. The **standalone**
`atlas /<agent> <prompt>` router is **[planned]** and will land once the
orchestrator router ships (Phase 4 of the roadmap). The connection layer the
slash commands depend on (`@atlas/agents` behind
`AgentPort`) and the **Agent Session Manager** (`atlas sessions`) exist; the
standalone router does not. The planned `/tools` interface (Directory C) is
documented in [AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md).

---

## 3. Status legend used in this document

- **[implemented]** — the command runs real code and is wired to the SDK/MCP.
- **[stubbed]** — a command/surface is registered but prints `Coming Soon`.
- **[planned]** — no code; documented contract only.
- **(no tag)** — target behavior documented here; not yet reached.

> Distinguish *"documented"* from *"implemented"*: this file is the contract,
> [CURRENT_STATE.md](./CURRENT_STATE.md) + [FEATURE_STATUS.md](./FEATURE_STATUS.md)
> are the ground truth of what runs today.

---

## 4. Global conventions

- **Exit codes:** `0` success, `1` user/usage error (`atlas search` already
  exits `1` when no index exists), `2` internal/engine error (reserved).
- **Non-zero exit on failure** with a stderr message; no silent partial success.
- **`--json`** output flag for machine-readable output on data-returning
  commands — implemented on `search`, `scan`, `usage summary`, `usage list`,
  and `usage budgets`; proposed for the rest (build, status).
- **No business logic in the CLI.** Commands parse args and delegate to the SDK.
  The CLI imports only `@atlas/sdk` (enforced by eslint).
- **Help text** is the contract of record for users; update it when the contract changes.

---

## 5. CLI-to-SDK wiring

```text
atlas search   → createContextSDK({ dbPath }) → context.search.search(...)
atlas scan     → scanProjectOverview() → @atlas/scanner (metadata only)
atlas mcp      → @atlas/mcp startStdioServer({ root })
atlas sessions → createSessionManager() → SessionPort (list/get/stop)
atlas usage    → createUsageService({ filePath }) → UsagePort (summary/list/budgets)
atlas context  → createContextIntegration() → Context SDK / Context Package /
                 SessionPort
atlas tools          → createToolkitSDK() → Registry / Manifest / Compatibility /
                         Security / Installer / Configurator façade
atlas init/build/update → indexProject() → scanner → hashing → parser → graph →
                          ContextStore
atlas explain/doctor → "Coming Soon" (future: deterministic symbol explanation /
                       environment diagnostics)
```

Wired commands call exactly the SDK/`@atlas/mcp` surface they need and render
its results (text or `--json`); `atlas search` releases the SDK handle
(`context.close()`) afterwards. A command that only prints success when nothing
ran is a regression.

---

## 6. Security notes specific to the CLI

- Never echo API keys or full provider config (`atlas config` redacts).
- Never execute anything from the repository implicitly (that is the
  orchestrator's domain, with explicit consent).
- `--help` and error messages must not reveal environment secrets.
- Toolkit commands show trust/security and install details before execution;
  `tools install` requires `--yes` as explicit consent. The CLI delegates all
  Toolkit behavior to `createToolkitSDK()`.

---

## 7. Testing the CLI

- CLI tests assert the **command list**, **version**, **placeholder text**, and
  **`atlas search` end-to-end** against a fixture `.codeatlas/context.db`
  (including the missing-index error and `process.exitCode = 1`), in
  `apps/cli/tests/cli.test.ts`. See [TESTING.md](./TESTING.md).
