# CodeAtlas Change Policy

How changes are made to this repository — especially architectural ones.

---

## 1. Inspect before modifying

Before touching architecture or a working module:

1. **Inspect the current implementation** (source + tests) — do not assume it
   matches the original plan or the docs.
2. **Identify affected modules** using [MODULES.md](./MODULES.md) ownership and
   [DEPENDENCIES.md](./DEPENDENCIES.md) rules.
3. **Explain the trade-offs** of the change before writing code.
4. **Avoid unnecessary refactoring.** Refactor only when it serves the current
   change; never bundle unrelated restructuring with a feature/fix.

## 2. Preserve

- **Working code stays working.** Do not rewrite a working module "to clean it
  up" while changing behavior.
- **Public surfaces** (ports, `@atlas/*` exports used by other packages) stay
  backwards compatible where possible. Prefer additive changes (new methods,
  new adapters) over breaking ones. Breaking changes require an ADR and a
  deprecation note.
- **Existing abstractions** are the norm. Extend them before inventing new ones.

## 3. Large changes: the template

For architectural/large changes, write a short design note (in the PR or a
`docs/decisions/` ADR when the decision is major) following:

```text
Problem
   ↓
Current behavior
   ↓
Proposed design
   ↓
Impact (modules + dependency implications)
   ↓
Implementation plan
   ↓
Tests
```

## 4. Breaking-change policy

- Detect a breaking change by checking every `@atlas/*` importer (the ESLint
  matrix + grep for usages).
- Deprecate before removing: mark deprecated, keep a compat path, then remove.
- Record the decision in `docs/decisions/` (see the ADR README) for any
  breaking architectural change.

## 5. Scoping

- **Keep changes minimal and focused.** A PR has one purpose: feature, fix, or
  refactor — not a mix.
- Unrelated clean-up discovered during a change goes in a separate PR (and
  mention it), or is left alone.
- "Drive-by" edits to files outside the change's scope are rejected during
  review.

## 6. Verification before merge

Every change:

- [ ] `pnpm check` passes (typecheck + lint + format + test)
- [ ] affected tests updated/added
- [ ] docs updated if the contract changed, and a line in `CURRENT_STATE.md`
      if feature status changes
- [ ] no secrets, no implicit uploads, no dependency added without the
      six-question checklist ([DEPENDENCIES.md](./DEPENDENCIES.md))
- [ ] commit follows Conventional Commits

## 7. When to review vs. ask

- Requirements genuinely ambiguous → ask the user (don't guess a big design).
- Minor details → make a reasonable assumption and state it.
- Never: silently change architecture, silently delete functionality.