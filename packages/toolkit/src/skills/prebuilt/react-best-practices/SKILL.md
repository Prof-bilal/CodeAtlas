---
name: react-best-practices
description: Keep React changes aligned with component boundaries, accessibility, state ownership, and measurable rendering behavior.
version: 1.0.0
allowed-tools: [atlas search, atlas inspect, atlas verify]
---

# React Best Practices

## Goal

Keep React changes aligned with component boundaries, accessibility, state ownership, and measured rendering behavior.

## When to use

- Adding or changing React components, state, or styling.
- Reviewing a React diff for structural or accessibility regressions.

## Workflow

1. Inspect the existing component, routing, state, styling, and test conventions before editing.
2. Keep state as local as possible and preserve stable component boundaries.
3. Prefer semantic HTML, keyboard support, visible focus, and accessible labels.
4. Handle loading, empty, error, overflow, and responsive states explicitly.
5. Avoid speculative memoization and broad rewrites; measure or test behavior when performance matters.
6. Verify the rendered flow with the project's own tests; report any check they cannot express as *could not run*.

## Required capabilities

- Repository understanding: search, inspect
- Verification: the project's own tests, typecheck, and lint

## Expected output

React changes following existing conventions, with explicit non-happy-path states, and verification evidence from the project's own checks.

## Verification

- The rendered flow is verified by tests that actually ran, or listed as *could not run* — never inferred from code alone.
- Loading/empty/error/responsive states exist and behave, not just the happy path.

## Rules / constraints

- Follow the project's existing component and styling conventions; no parallel conventions.
- No speculative optimization without measurement.

## Security considerations

- Never render untrusted content as HTML (no `dangerouslySetInnerHTML` from page/user data).
- Keep secrets and provider keys out of client bundles and component state.
