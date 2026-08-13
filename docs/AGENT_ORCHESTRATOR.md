# Agent Orchestrator (Unified AI CLI)

> **Status: [PARTIAL]** — the standalone *router* (`atlas /claude`, …) described
> below does not exist yet. But the **Agent Session Manager is implemented**
> (Task 15): `SessionManager` behind `SessionPort`, composed by
> `createSessionManager()` in `@atlas/sdk`, exposed as `atlas sessions` — see
> [AGENT_SESSIONS.md](./AGENT_SESSIONS.md). Separately, the **multi-agent plan
> orchestrator** (Task 17) is implemented in `@atlas/sdk`
> (`createOrchestrator`: explicit role plans via `buildPlan`/`reviewPlan`,
> execution through `SessionPort` with timeouts/retries/cancellation, and
> deterministic result combining with conflict detection) — see
> [CURRENT_STATE.md](./CURRENT_STATE.md). And the **interactive TUI**
> (`atlas tui`, opened by bare `atlas` on a TTY) now provides a slash-command
> surface: `/claude`, `/gemini`, `/codex`, `/opencode` detect the installed CLI,
> launch it **interactively** (`SessionLaunchRequest.interactive`, `stdio:
> "inherit"`, no `-p` run-mode flags), and fall back to an approval-gated Toolkit
> install; `/cursor` and `/grok` show vendor install guidance; `/agents` and
> `/toolkit` cover discovery. This document remains the design contract for the
> **remaining** Direction B surface — the plan-executing router as a CLI/editor
> surface. Do **not** claim the standalone router or `atlas /claude` commands
> are implemented. Prerequisites that are real: the **AI CLI connection layer
> (`@atlas/agents`, behind `AgentPort`)** (adapters, executable detection,
> supervised process runs), the session manager, and the TUI. (See
> [CURRENT_STATE.md](./CURRENT_STATE.md).)

---

## 1. Purpose

CodeAtlas acts as a **unified CLI orchestrator**: you invoke one tool
(`atlas`), and it routes your request to whichever coding agent you pick —
launching the **already-installed** CLI for that agent rather than
reimplementing its internal behavior.

```
/gemini   → AgentRouter   → GeminiAdapter   → Gemini CLI process
/claude   → AgentRouter   → ClaudeAdapter   → Claude CLI process
/codex    → AgentRouter   → CodexAdapter    → Codex CLI process
/opencode → AgentRouter   → OpenCodeAdapter → OpenCode CLI process
/deepseek → AgentRouter   → DeepSeekAdapter → DeepSeek CLI process
```

### Design principle

> CodeAtlas orchestrates existing AI CLIs; it does **not** recreate their
> internal functionality.

A `/gemini explain AuthService` invocation should hand the *explaining* to the
installed Gemini CLI. CodeAtlas owns the **shell**, the **session**, and the
**environment** — never the agent's brain.

---

## 2. Components (planned)

```
atlas /<agent> <args...>
        │
        ▼
    Agent Router        – parses the slash command, resolves the agent name
        │
        ▼
    AgentAdapter        – knows HOW to launch one specific CLI
        │
        ▼
   Process Manager      – spawn, supervise, terminate, capture output
        │
        ▼
   Terminal / Session   – attach TTY or capture, multiplex if needed
```

### Agent Router
- Identifies the selected agent from the slash command (`/claude`, `/gemini`,
  `/codex`, `/opencode`, `/deepseek`, …).
- Unknown agent → clear error listing discovered agents.
- Forwards the remainder of the prompt as the agent invocation arguments.

### Agent adapters
- One adapter per external CLI: how to **locate** the binary (`which`, PATH,
  version pin), what binary/args to spawn, what env to set (API keys, workspace
  dir, flags), and how to interpret exit codes.
- Adapter registration mirrors the provider registry pattern
  (`register(name, adapter)`).

### Process & lifecycle management
- spawn, supervise, and terminate child processes;
- timeout handling (default + per-agent override);
- non-zero exit code → surfaced with stderr excerpt;
- unavailable CLI detection (binary missing → friendly message + `atlas doctor` hint).

### Terminal / session handling
- Support interactive TTY sessions for the spawned CLI.
- The design goal is **multiple concurrent agent sessions**, each with its own
  process group, so a user can run `/claude` on one task and `/codex` on another.

---

## 3. Example flows

```text
$ atlas /gemini explain AuthService
→ Router resolves "gemini"
→ GeminiAdapter spawns `gemini` (installed CLI)
→ process runs in a session; stdout/err streamed to the user
→ exit code surfaced; failures attributed to the agent CLI

$ atlas /codex write tests for the parser
→ CodexAdapter spawns `codex`
→ Codex CLI processes the shared CodeAtlas project context (AGENTS.md etc.)
```

---

## 4. Security & safety (non-negotiable)

Because this component spawns external processes on the user's machine, it is
the **highest-risk** surface. See [SECURITY.md](./SECURITY.md) — the short
list:

- **Binary discovery:** only spawn known agent names; resolve via the user's
  PATH/config, never from repo-controlled contents.
- **Arguments:** pass the user's prompt as arguments to the agent CLI with
  **proper escaping**; never pass raw repository-provided content as shell
  input.
- **No shell interpolation:** prefer `spawn(file, args[])` over
  `shell: true` for prompt arguments.
- **Keys in env only via user config**, never echoed to output.
- **Timeout & kill switches** on every child so a runaway agent can be stopped.
- Agent CLI's own security is out of scope (they are the user's chosen tools) —
  but CodeAtlas must not *amplify* risk (e.g. by injecting prompts that execute
  shell commands without consent).

---

## 5. Availability & errors

- **Unavailable CLI detection:** if the agent binary is not installed, print a
  clear error and suggest the install command / `atlas doctor`.
- **Exit codes:** map child exit codes and signals to actionable messages.
- **Environment configuration:** per-agent env (API keys, base URLs) come from
  user config files (`atlas config`), never from repo files — except where the
  user explicitly opts into repo-provided env.
- **Timeout handling:** default timeout per invocation; a timed-out process is
  **killed** and the partial output/exit reported honestly.

---

## 7. Relationship to the rest of CodeAtlas

- The orchestrator is a **second direction**, independent of the Context Engine.
  It composes through the **SDK** (or a dedicated `agent-router` package behind
  the SDK), not the context packages.
- It should reuse the *context* output where useful (e.g. `/claude fix` may
  ignore `.codeatlas/manifest.json`), but it must never *require* an index.
- Roadmap: [ROADMAP.md](./ROADMAP.md) Phase 4.