---
name: systematic-debugging
description: Trace failures to their root cause before patching symptoms.
version: 1.0.0
allowed-tools: [atlas search, atlas inspect, atlas trace, atlas verify]
---

# Systematic Debugging

## Goal

Trace a failure to its root cause before changing any behavior, then verify the fix against the original failure.

## When to use

- A test, command, or runtime behavior fails and the cause is not yet known.
- A bug keeps reappearing after superficial fixes.

## Workflow

1. Reproduce the failure with the smallest reliable command or fixture.
2. Capture the exact error, inputs, environment assumptions, and failing path.
3. Trace from the symptom through callers, dependencies, state transitions, and boundaries (`atlas trace`, `atlas inspect`).
4. Form one falsifiable root-cause hypothesis at a time.
5. Add or run a regression test before changing behavior.
6. Make the smallest root-cause fix, then reproduce the original failure and run broader verification.

## Required capabilities

- Repository understanding: search, inspect, trace
- Verification: project test commands

## Expected output

Root cause (with the traced path), a regression test, the smallest fix, and re-run evidence showing the original failure is resolved.

## Verification

- The original failure was reproduced before the fix and re-run after it.
- The regression test fails without the fix and passes with it.
- Broader verification (typecheck/lint/tests) ran clean or its failures are reported.

## Rules / constraints

- Never patch symptoms without identifying a root cause; if the cause is genuinely unreachable, report that instead of guessing.
- One hypothesis at a time; record rejected hypotheses briefly.

## Security considerations

- Error messages and logs may contain secrets: never echo captured environment values, tokens, or `.env` content into reports.
- Never run repository scripts to "reproduce" unless they are the project's own documented commands.
