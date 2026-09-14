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
6. Verify the rendered flow with the project's tests and browser checks when available (`atlas browse`).

## Required capabilities

- Repository understanding: search, inspect
- Verification: project tests; browser observation when available

## Expected output

React changes following existing conventions, with explicit non-happy-path states, and verification evidence from tests and/or browser observation.

## Verification

- Rendered flow observed via tests or `atlas browse` after the final edit.
- Loading/empty/error/responsive states exist and behave, not just the happy path.

## Rules / constraints

- Follow the project's existing component and styling conventions; no parallel conventions.
- No speculative optimization without measurement.

## Security considerations

- Never render untrusted content as HTML (no `dangerouslySetInnerHTML` from page/user data).
- Keep secrets and provider keys out of client bundles and component state.
