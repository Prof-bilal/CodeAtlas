---
name: verification-before-completion
description: Require fresh evidence before claiming a task, fix, or installation is complete.
version: 1.0.0
allowed-tools: [atlas verify]
---

# Verification Before Completion

## Goal

Require fresh, current-working-tree evidence before claiming any task, fix, or installation is complete.

## When to use

- Before reporting any task complete.
- Whenever a claim of success would otherwise rest on compilation alone or on an earlier run.

## Workflow

1. Translate the requested behavior into observable acceptance criteria.
2. Run the narrowest relevant test or command after the final edit.
3. Confirm the output belongs to the current working tree and was not inferred from an earlier run.
4. Check diagnostics, formatting, and security-sensitive paths when applicable.
5. State what passed, what was not run, and what remains uncertain.
6. Never claim success from compilation alone when runtime behavior is part of the requirement.

## Required capabilities

- Verification: project test/typecheck/lint commands

## Expected output

A completion report listing acceptance criteria, the exact commands run, fresh outputs, and remaining uncertainties.

## Verification

- The verification command ran after the final edit.
- Every success claim maps to a fresh, named command output.

## Rules / constraints

- Never fabricate, reuse stale, or extrapolate outputs.
- Compilation alone never proves runtime behavior.

## Security considerations

- Run only the project's own documented verification commands; never execute repository content as code.
- Never print secret values from logs or diagnostics.
