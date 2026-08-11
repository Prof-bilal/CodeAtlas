# External Agent Compatibility

How **Claude Code**, **OpenCode**, **Codex**, **Gemini CLI**, and any other
coding agent consume the same project instructions.

---

## 1. The goal

Every coding agent should follow the **same** architecture, conventions,
security rules, testing rules, and product principles — regardless of the tool
that spawned it.

We do **not** maintain a separate, conflicting instruction set per AI tool.

## 2. How it works

| Artifact | Who reads it |
| -------- | ------------ |
| **`AGENTS.md`** | The **single project-instruction file**. Claude Code, OpenCode, Codex, Gemini CLI and Cursor all read `AGENTS.md` (or an equivalent) at repo root. |
| **`CLAUDE.md`** | Claude Code-specific nudges; **defers** to `AGENTS.md` as authoritative (no duplicate rules). |
| **`docs/`** | The deep technical truth, referenced by AGENTS.md. Any agent can read these files. |
| **`README.md`** | Human/intro; not a rules file. |

The rule: **rules live once (AGENTS.md → docs/) and are referenced everywhere.** If
an agent variant only supports a subset of these files (e.g. only reads
`AGENTS.md`), it still gets the full picture because AGENTS.md points into
`docs/`.

## 3. The reference order each agent should follow

1. Read `AGENTS.md` (project rules + pointers).
2. Read `docs/CURRENT_STATE.md` (what is real today).
3. Read the relevant doc(s) for the module being touched.
4. Inspect the actual code & tests before changing anything.
5. Follow [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) and report in
   the shared format.

## 4. Tool-specific notes

- **Claude Code:** also has `CLAUDE.md`; it holds no new rules, only pointers +
  "AGENTS.md is authoritative." This avoids drift.
- **Codex / Gemini / OpenCode / Cursor:** use `AGENTS.md` + `docs/`. Do not mix
  your tool's own conventions on top; the repo conventions win.
- **Any agent without AGENTS.md support:** point it at
  `docs/DOCUMENTATION_MAP.md` (or this file) as the entry point.

## 5. Anti-patterns

- ❌ Crafting per-tool instructions that contradict AGENTS.md.
- ❌ Copy-pasting doc blocks into each agent's config so drift is inevitable.
- ❌ Treating `CLAUDE.md` as the source of truth (it defers).
- ❌ An agent claiming a feature exists based on docs alone — always verify
  against `docs/CURRENT_STATE.md` and the code.