# CodeAtlas Documentation Map

Where each piece of knowledge lives, and how AI agents should navigate it.

---

## 1. Hierarchy

```
AGENTS.md
    │  project-wide rules for every coding agent (Claude Code, OpenCode, Codex, Gemini, …)
    ▼
docs/
    │  Detailed technical truth, one subject per file
    ▼
README.md
    │  Public project introduction (what it is, how to install/run)
```

- **AGENTS.md** stays **concise** — rules and pointers, not essays.
- **Detailed technical information** belongs in `docs/`, referenced by AGENTS.md.
- **README.md** stays a friendly public intro; it links to the docs, not a
  duplicate of them.

## 2. The docs index

| Path | Subject |
| ---- | ------- |
| `docs/CURRENT_STATE.md` | What actually exists vs. planned (status tags). **Read first.** |
| `docs/ARCHITECTURE.md` | Canonical architecture (both product directions). |
| `docs/MODULES.md` | Module ownership ("who owns what"). |
| `docs/CONTEXT.md` | How CodeAtlas understands a repository — the full pipeline (scan → hash → parse → graph → store → search → SDK) and its lifecycle. |
| `docs/CONTEXT_SDK.md` | The Context API/SDK — the single read interface consumers use. |
| `docs/DEPENDENCIES.md` | Allowed import directions + dependency-add policy. |
| `docs/AI_PROVIDERS.md` | Provider interface & adapters. |
| `docs/USAGE.md` | AI Usage & Credits: tri-state actual/estimated/unknown provenance, pricing abstraction, budgets/limits, collection seams, `atlas usage`. |
| `docs/AGENT_ORCHESTRATOR.md` | Unified AI CLI orchestrator (implemented, Task 17): bounded agent roles, execution, result combination. |
| `docs/AGENT_SESSIONS.md` | Agent Session Manager (implemented): session lifecycle, states, CLI commands, failure/shutdown behavior. |
| `docs/AGENT_TOOLKIT.md` | Agent Toolkit (design contract; registry + manifest implemented, Tasks 19–20): curated tool registry/install/config/security. |
| `docs/TOOL_REGISTRY.md` | Tool Registry (implemented, Task 19): record schema, per-field provenance, shipped catalog + local overlay, SDK surface. |
| `docs/TOOL_MANIFEST.md` | Tool Manifest (implemented, Task 20): per-installed-tool state schema, `.codeatlas/tools/` layout, untrusted-input validation. |
| `docs/CLI.md` | The `atlas` CLI contract. |
| `docs/MCP.md` | The MCP server: configuration + full tool reference. |
| `docs/VSCODE.md` | The VS Code extension (`@atlas/extension`): what it does and how it consumes the SDK. |
| `docs/CONTEXT_STORAGE.md` | The `.codeatlas/` directory. |
| `docs/SECURITY.md` | Security rules. |
| `docs/PRIVACY.md` | Privacy rules (local-first). |
| `docs/TESTING.md` | Testing policy. |
| `docs/CODE_QUALITY.md` | Coding standards. |
| `docs/CHANGE_POLICY.md` | How changes happen. |
| `docs/FEATURE_STATUS.md` | Status tags across features. |
| `docs/ROADMAP.md` | Phased roadmap. |
| `docs/AGENT_COMPATIBILITY.md` | How external agents consume these instructions. |
| `docs/DEVELOPMENT.md` | Developer setup & commands (prerequisites, install, build/test, debugging, env variables). |
| `docs/DEVELOPMENT_WORKFLOW.md` | The standard agent workflow + reporting format. |
| `docs/CONTRIBUTING.md` | Practical contributor guide (setup, standards, PRs, security reporting). |
| `docs/DOCUMENTATION_AUDIT.md` | Self-audit of this docs system. |
| `docs/decisions/README.md` | ADR index (format + which decisions are recorded). |

## 3. Navigating for a task

- **New to the repo?** Read `AGENTS.md` → `docs/CURRENT_STATE.md` →
  `docs/ARCHITECTURE.md`.
- **About to modify a module?** Also read `docs/MODULES.md` +
  `docs/DEPENDENCIES.md` (ownership + allowed imports).
- **Touch an indexer/analyzer?** Read `docs/CONTEXT.md` (the pipeline) +
  `docs/MODULES.md`.
- **Touch provider calls / usage / credits?** Read `docs/AI_PROVIDERS.md` +
  `docs/USAGE.md`.
- **Tooling/setup?** Read `docs/DEVELOPMENT.md`. **Contributing?** Read
  `docs/CONTRIBUTING.md`.
- **Behavior change?** Read `docs/TESTING.md` + `docs/CHANGE_POLICY.md`.
- **Anything touching processes/secrets?** Read `docs/SECURITY.md` +
  `docs/PRIVACY.md`.

## 4. Rules

- One **single source of truth** per concept. If two docs disagree, the more
  canonical one wins (AGENTS.md → CURRENT_STATE/ARCHITECTURE → the rest) and
  the contradiction is a bug to fix.
- Feature status is *always* double-checked against code before being claimed —
  never mark implemented without looking.
- Doc changes follow the same review as code (`pnpm check` where relevant,
  link check).