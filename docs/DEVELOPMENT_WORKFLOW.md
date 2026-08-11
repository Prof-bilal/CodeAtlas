# CodeAtlas Development Workflow

The standard workflow every coding agent **and** human contributor follows, and
the reporting format at the end of each task.

---

## 1. The workflow

```text
Understand → Inspect → Plan → Implement → Test → Review → Document
```

1. **Understand** — read `AGENTS.md`, then the relevant docs from
   [DOCUMENTATION_MAP.md](./DOCUMENTATION_MAP.md).
2. **Inspect** — read the actual code + tests of the modules you'll touch.
   Never assume the code matches the plan or the docs.
3. **Plan** — identify the affected modules (ownership in
   [MODULES.md](./MODULES.md)), note dependency implications
   ([DEPENDENCIES.md](./DEPENDENCIES.md)), keep the change minimal
   ([CHANGE_POLICY.md](./CHANGE_POLICY.md)).
4. **Implement** — follow [CODE_QUALITY.md](./CODE_QUALITY.md) and
   [SECURITY.md](./SECURITY.md). Small commits, Conventional Commits.
5. **Test** — add/adjust tests per [TESTING.md](./TESTING.md); run `pnpm check`.
6. **Review** — self-review against the quality lens; address failure honestly.
   Never fabricate results.
7. **Document** — update docs if the contract, ownership, or feature status
   changed; add an ADR for major decisions.

---

## 2. Reporting format

After each task, report (concisely):

### What I changed
Brief summary of behavior.

### Why I changed it
The problem/motivation.

### Files changed
List of touched files.

### Tests added
What coverage the change introduced.

### Tests executed
Which test commands actually ran and their results.

### Remaining concerns
Anything unfinished, risky, or needing human review.

---

## 3. Claiming honesty

- **Never claim a feature exists unless code proves it** — `docs/CURRENT_STATE.md`
  is the arbiter, and it must be double-checked against code.
- **Never fabricate test results** — report exactly what ran (or that it did not).
- **State failures plainly**, including skipped steps and partial work.

## 4. The agent behavior contract

Agents **must**:
- inspect before editing,
- reuse existing code,
- ask when requirements are genuinely ambiguous,
- make reasonable, stated assumptions for minor details,
- keep changes minimal,
- preserve backwards compatibility where possible,
- test changes,
- report failures honestly.

Agents must **NOT**:
- fabricate test results,
- claim features exist when they don't,
- silently change architecture,
- add unnecessary libraries,
- delete functionality without approval,
- modify unrelated modules,
- commit secrets,
- expose user code,
- bypass security controls.