---
name: refactoring
description: Refactor code safely, reduce duplication, preserve behavior, improve structure across multiple files
version: 1.0.0
allowed-tools: []
disallowed-tools: []
---

# Refactoring

Use this when the task is a refactor: restructuring, de-duplication, renaming, or improving structure while preserving observable behavior.

## Workflow
1. **Establish a safety net.** Identify which tests cover the code being restructured. If none exist, note it and prefer behavior-preserving transformations; add a regression test where it is cheap and high-value.
2. **Map current behavior.** Enumerate inputs, outputs, and side effects of every call site you will touch.
3. **Refactor in small, behavior-preserving steps** (compose → extract → move), so each step is independently reviewable and each preserves the tests.
4. **Do not mix refactor with feature change.** If you must, separate them and say so explicitly.
5. **Re-run the relevant tests after each step.**

## Checklist
- [ ] Safety net identified (tests that cover the change surface)
- [ ] Call sites enumerated and behavior mapped
- [ ] Refactor split into small behavior-preserving steps
- [ ] No undocumented behavior change introduced
- [ ] Relevant tests pass at each step
- [ ] Reported any coverage gap created or left

## Verification
The same tests pass before and after. List which tests cover the refactored area and the commands that prove parity.

## Common failure prevention
- Don't "improve" semantics while restructuring — flag any semantic change explicitly.
- Don't refactor unrelated modules in the same change.
- Don't drop tests that document edge behavior.