---
name: testing
description: Write missing tests, fix broken tests, understand existing test architecture, prevent regressions
version: 1.0.0
allowed-tools: [web_search]
---

# Testing

Use this when the task involves writing missing tests, fixing broken tests, understanding existing test architecture, or regression prevention.

## Workflow
1. **Find the existing test architecture.** Locate the test runner, config, naming conventions, and closest existing tests to the code under test. Match the conventions.
2. **Understand the behavior under test first.** Read the implementation and identify the behavior/spec that should be locked in.
3. **Write tests that assert observable behavior**, not implementation details, unless the contract is explicit.
4. **Cover the edges the code already handles** (validation, authz, error paths, boundary values) — not just the happy path.
5. **For a broken test: diagnose root cause** (stale assertion, production bug, test-order dependence, flake) before editing. Fixing a test to make it pass is only correct when the assertion or fixture was wrong.
6. **Run the focused suite; then confirm no unrelated failures.**

## Checklist
- [ ] Identified the test framework/config/conventions in this repo
- [ ] Named and placed tests per existing conventions
- [ ] Asserted observable behavior, including edge/error cases
- [ ] Broken test: root-cause isolated (flaky vs prod bug vs wrong assertion)
- [ ] Focused suite green; no regressions in related suites

## Verification
Report exact commands run and their results (e.g. `vitest run <file>`). Tests must actually execute, not be skipped.

## Common failure prevention
- Don't weaken or delete a failing test to make the suite green.
- Don't mock away the behavior you claim to test (mocks should isolate I/O, not logic).
- Keep tests deterministic (no reliance on wall-clock/ordering unless intended).