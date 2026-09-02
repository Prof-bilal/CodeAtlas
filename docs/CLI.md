# CodeAtlas CLI

The command-line contract for the `atlas` binary.

> **Status:** the command *surface* exists. **`atlas search` is wired to the
> Context SDK**, **`atlas mcp` starts the MCP server**, **`atlas sessions`
> manages AI agent sessions**, **`atlas usage` reports AI usage &
> credits**, **`atlas tools` is SDK-backed**, **`atlas context` is wired**, and
> **`init`/`build`/`update` run the SDK indexer**. **`atlas explain`** resolves a
> symbol/file/module/concept deterministically (and generates an AI summary only
> with an explicit `--ai` flag when a provider is configured), and **`atlas
> doctor`** runs a diagnostic checklist (exit `1` on failure). The interactive
> **`atlas tui`** is **v2 / not shipped** — its source stays on disk but is
> untracked, and bare `atlas` always prints help. The detailed behavior below is
> the **contract** — flagged **[implemented]** / **[stubbed]** / **[planned]**
> per command.

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
| `atlas init` | **[implemented]** | Initialize and index the current project; supports `repo`, `json`, and `--summaries`. Runs the SDK-owned indexer (`indexProject`, mode `build`). |
| `atlas build` | **[implemented]** | Build/resolve the context index: scan → hash → parse changed files → build graph → persist to the context DB via the SDK indexer (`indexProject`, mode `build`). Reports files/symbols/summaries counts. `--summaries` generates an AI file summary for every parsed file after indexing (explicit opt-in, content-hash cached, persisted to the Summaries table, failures counted not fatal). |
| `atlas update` | **[implemented]** | Incrementally update an existing index via the SDK indexer: reuse hashes, re-parse and merge only `changed`/`added` files, drop `deleted` files. No-op when nothing changed. `--summaries` generates AI summaries for the re-parsed files only. |
| `atlas scan` | **[implemented]** | Show a hierarchical overview of a project tree (files, folders, languages, framework) with **no indexing** — metadata only, via `scanProjectOverview()` from the SDK. Options: `--repo <path>`, `--json`. |
| `atlas search <query...>` | **[implemented]** | Search the index (symbols, files, modules, dependencies, summaries) with ranked, fuzzy-aware results. Options: `repo <path>`, `limit <n>`, `type <kind>` (repeatable), `no-fuzzy`, `json`, `--ai`. `--ai` additionally generates (or reuses stored) AI summaries for the **top 5 file hits** via `summaries.generateFile` — explicit opt-in, content-hash cached, fails cleanly without a configured provider; deterministic hits are unchanged. Reads `.codeatlas/context.db` via the **Context SDK** (`createContextSDK` — see [CONTEXT_SDK.md](./CONTEXT_SDK.md)); errors with exit code `1` when no index exists. |
| `atlas mcp` | **[implemented]** | Start the **MCP server** over stdio for the current project (option `--root <path>` overrides `ATLAS_ROOT`/cwd). `@atlas/mcp` tools read context through the Context SDK. See [MCP.md](./MCP.md). |
| `atlas sessions` / `atlas sessions list` | **[implemented]** | List tracked AI agent sessions (table). |
| `atlas sessions info <id>` | **[implemented]** | Show details for one session (provider, status, repository, pid, started/ended, exit code). Never prints keys/env. |
| `atlas sessions stop <id>` | **[implemented]** | Gracefully stop a running session (`✓ Session stopped`), then print a **token-impact** report: tokens the session burned (usage records scoped to its session id, read from `.codeatlas/usage.db`), the estimated "without CodeAtlas" baseline (whole-repo source tokens = indexed file bytes ÷ 4), and tokens saved. Tri-state: `unknown` when a figure has no data. `--ai`-free, deterministic. Missing/bad id exits `1` with a message. Sessions are created programmatically via the SDK (`createSessionManager`) or `atlas context launch`. |
| `atlas usage` (bare) | **[implemented]** | Print the usage summary (same as `atlas usage summary`). Reads `.codeatlas/usage.db` via `createUsageService()` from the SDK (ADR-009). See [USAGE.md](./USAGE.md). |
| `atlas usage summary` | **[implemented]** | Totals (events, requests, tokens, cost, avg latency) + budget status. `--json` → `{ statistics, budgets }`. Tri-state rendering: `unknown` where no data, `(estimated)` labels where a figure is an estimate. |
| `atlas usage list` | **[implemented]** | Table of recorded usage events (ID, agent, provider, model, tokens, cost, latency, when); "No usage recorded." when empty. `--json` → `{ records }`; `--provider <provider>` filters. |
| `atlas usage budgets` | **[implemented]** | Per-scope budget status lines; "No budgets." when none. `--json` → `{ budgets }`. |
| `atlas explain <target>` | **[implemented]** | Explain a symbol, file, module, or concept from the index. Deterministic first: a file path resolves to its content + stored summary + dependencies; a module path to `modules.explain`; a symbol name to `getSymbol` + `findReferences` + dependencies; anything else to `getRelevantContext`. `--ai` generates a fresh AI summary (file/module only) via `summaries.generateFile`/`generateModule` — explicit opt-in, fails cleanly without a configured provider. Options `--repo <path>`, `--json`, `--ai`. Exit `1` when no index exists. |
| `atlas doctor` | **[implemented]** | Diagnose installation & project health. Checks: Node runtime `>=22.5.0` (for `node:sqlite`), context index (`createContextSDK.status` + `freshness` + `.codeatlas/manifest.json`), AI agents (`createAgentService.detectAll`), agent MCP registration (`createAgentMcpService.status`), provider sanity + Ollama status (**never prints keys**). PASS/WARN/FAIL output; exit `1` on any FAIL. Options `--repo <path>`, `--json`. |
| `atlas config` | **[planned]** — not registered | View/edit configuration (providers, keys source, agents, ignored dirs). Keys never printed. |
| `atlas agents` / `atlas agents status` | **[implemented]** | Show each AI coding tool (claude, gemini, codex, opencode, cursor, cline) and whether the CodeAtlas MCP server is registered for it (`createAgentMcpService`). `--json` supported. |
| `atlas agents connect` | **[implemented]** | Register the CodeAtlas MCP server for installed, supported agents. Options: `--target <target>`, `--config-home <path>`, `--dry-run`, `--json`. |
| `atlas providers` | **[implemented]** | Show the status of all AI providers (configured / has key / model, default provider+model). `--json` supported. Keys never printed. |
| `atlas ollama` | **[implemented]** parent command | Connect, inspect, and manage the optional Ollama provider. |
| `atlas ollama status` | **[implemented]** | Show Ollama connection status (connected, mode, base URL, key, selected model). `--json` supported. |
| `atlas ollama connect` | **[implemented]** | Test and save the Ollama connection (local server or Ollama Cloud key); prompts for the key when a TTY is present. Options: `--api-key`, `--base-url`, `--save-key`, `--json`. |
| `atlas ollama disconnect` | **[implemented]** | Clear the saved Ollama connection (env keys kept). |
| `atlas ollama models` | **[implemented]** | List models exposed by the Ollama server. `--json` supported. |
| `atlas ollama use <model>` | **[implemented]** | Select the active Ollama model for context summarization. |
| `atlas benchmark` | **[implemented]** parent command | Context-quality benchmark framework (`@atlas/benchmark` behind `BenchmarkPort`, ADR-012 — see [benchmark.md](./benchmark.md)). |
| `atlas benchmark init` | **[implemented]** | Create a suite (`--id`, `--name`, `--agent opencode\|ollama`, `--model`, plus `--repo` for a starter task file or `--task-file` to import one). |
| `atlas benchmark run <suite>` | **[implemented]** | Run tasks in baseline + codeatlas modes (`--repo` required; `--task`, `--mode`, `--force` optional). Resumes completed runs; auto-indexes unindexed repos before codeatlas runs. |
| `atlas benchmark status <suite>` | **[implemented]** | Show suite progress (`completed/total`); `--json` supported. |
| `atlas benchmark report <suite>` | **[implemented]** | Render the report — Markdown by default, `--format json\|html`, or `--json`. |
| `atlas tools` | **[implemented]** parent command | Agent Toolkit commands (Direction C — see [AGENT_TOOLKIT.md](./AGENT_TOOLKIT.md)). |
| `atlas tools search <query>` | **[implemented]** | Search the curated tool registry; `--json` supported. |
| `atlas tools info <tool>` | **[implemented]** | Show registry, trust/security, and installed manifest state; `--json` supported. |
| `atlas tools install <tool>` | **[implemented]** | Show exact plan/trust/risk first; `--yes` provides explicit approval; `--json` supported. |
| `atlas tools remove <tool>` | **[implemented]** | Delegate ecosystem removal and remove the local manifest; `--json` supported. |
| `atlas tools update` | **[implemented]** | Update all installed tools to their latest versions. Skills are updated via `git pull --ff-only`; ecosystem tools (npm/pip/cargo/go) are re-installed through the approved adapter. `--approve` grants blanket approval for the update run; without it, ecosystem tools are skipped and only skills are updated. Reports per-tool status (updated/unchanged/error). `--json` supported. |
| `atlas tools doctor` | **[implemented]** | Reconcile installed manifests, integration state, and trust; `--json` supported. |
| `atlas tools configure <tool>` | **[implemented]** | Configure only installed agents/hosts declared by the tool; `--dry-run` renders exact changes, `--json` emits machine-readable output, and `--config-home` supports managed/test user-config roots. |
| `atlas context <task>` | **[implemented]** | Build and render a deny-filtered, budgeted Context Package (explicit form: `atlas context build <task>`); `explain` renders content-free selection reasons, `json` emits package/explanation data, `--ai` appends a provider-backed AI context briefing (degrades to the deterministic package when no provider is configured), and budget/instruction/overview flags tune SDK assembly. `--context-mode <mode>` (ADR-016: `auto`/`auto-escalate`/`digest`/`full`/`off`) selects the assembly regime; digest packages include the deterministic engine-analysis synthesis (ADR-017). |
| `atlas context launch <task>` | **[implemented]** | Launch a provider session seeded with the rendered Context Package via `SessionPort`; requires `provider`, supports `repo`, `json`, `--ai` (prepends the briefing to the session prompt), `--context-mode`, and tuning flags. |
| `atlas context attach <session-id> <task>` | **[implemented]** | Attach context to a `CREATED` session; `--ai` prepends a briefing to the prompt; `--context-mode` supported; live/terminal sessions return a clean exit-1 typed error. |
| `atlas claude <prompt...>` | **[implemented]** | Launch the `claude` AI CLI seeded with a Context Package for the prompt (sugar over `atlas context launch --provider claude`); `--ai` prepends an AI briefing, `json`/budget/instruction/overview/`--context-mode` flags match `context launch`. |
| `atlas gemini <prompt...>` | **[implemented]** | Launch the `gemini` AI CLI seeded with a Context Package for the prompt (`--ai` briefing supported). |
| `atlas codex <prompt...>` | **[implemented]** | Launch the `codex` AI CLI seeded with a Context Package for the prompt (`--ai` briefing supported). |
| `atlas opencode <prompt...>` | **[implemented]** | Launch the `opencode` AI CLI seeded with a Context Package for the prompt (`--ai` briefing supported). |
| `atlas tui` | **[v2 / not shipped]** — not registered | Interactive terminal UI (slash commands, interactive agent launch/install). Source lives on disk in `apps/cli/src/tui/` but is **git-untracked** so fresh clones build without it; bare `atlas` prints help. Slash surface returns as a v2 follow-up. |
| `atlas setup` | **[planned]** — not registered | Guided environment → agent → tool recommendation → install → configure → verify (no auto-install without consent). |

### Agent launch commands (Direction B)

```text
atlas claude <prompt...>       # [implemented] standalone launch with context
atlas gemini <prompt...>
atlas codex <prompt...>
atlas opencode <prompt...>
```

Each `atlas <agent> <prompt...>` command is a thin wrapper over
`atlas context launch <prompt> --provider <agent>`: it assembles a budgeted,
deny-filtered Context Package for the prompt and starts the agent CLI seeded
with it. `--ai` prepends an AI context briefing to the prompt (degrades
cleanly to the deterministic package without a configured provider). Tuning
flags match `atlas context launch`: `--repo <path>`, `--json`,
`--max-tokens-total <number>`, `--context-mode <mode>`,
`--include-instructions`, `--no-instructions`, `--include-overview`,
`--no-overview`. These cover the agents that have a
defined launch adapter (`@atlas/agents`); the interactive **slash surface**
(`/claude`, `/cursor`, `/grok`, …) inside `atlas tui` remains **v2 / not
shipped** (untracked, see `atlas tui` above).

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
atlas explain/doctor → createContextSDK(status/freshness/symbols/files/modules/
                        summaries/search) + createAgentService/detectAll +
                        createAgentMcpService/status + createProviderService/
                        createOllamaService (doctor); explain resolves
                        deterministically and generates AI summaries only with
                        `--ai` when a provider is configured
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
  (including the missing-index error and `process.exitCode = 1`), plus
  **`atlas explain`** (symbol/file/JSON/missing-index) and **`atlas doctor`**
  (healthy exit, `--json` report, human rendering) in
  `apps/cli/tests/cli.test.ts`. See [TESTING.md](./TESTING.md).
