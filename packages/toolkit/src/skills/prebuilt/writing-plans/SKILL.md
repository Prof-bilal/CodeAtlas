---
name: writing-plans
description: Convert an ambiguous engineering request into small implementation steps with evidence and checkpoints.
version: 1.0.0
allowed-tools: [atlas search, atlas inspect, atlas trace]
---

# Writing Plans

## Goal

Convert an ambiguous engineering request into small, independently verifiable implementation steps grounded in the current code.

## When to use

- A request is large, ambiguous, or cross-cutting.
- Before executing any multi-step implementation.

## Workflow

1. Restate the goal, non-goals, constraints, and current implementation status.
2. Identify the owning modules, existing abstractions, tests, and dependency boundaries.
3. Split the work into independently verifiable steps with explicit files and symbols.
4. Include security, migration, compatibility, and rollback considerations where relevant.
5. Define acceptance criteria and the command that will verify each step.
6. Prefer extending an existing port or service over introducing a parallel abstraction.

## Required capabilities

- Repository understanding: search, inspect, trace

## Expected output

A plan: goal/non-goals, steps with files/symbols, acceptance criteria and verification commands per step, plus security/compatibility/rollback notes.

## Verification

- Every step names the command that verifies it.
- Steps reference existing modules (verified by search/inspect), not invented abstractions.
- The plan is small enough to execute in checkpoints.

## Rules / constraints

- No parallel abstractions when an existing port/service fits.
- One purpose per step; no unrelated refactoring.

## Security considerations

- Include security and rollback considerations explicitly; do not defer them to implementation.
- Plans must respect approval boundaries and never schedule destructive operations as routine steps.
