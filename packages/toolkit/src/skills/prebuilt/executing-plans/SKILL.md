---
name: executing-plans
description: Execute an approved engineering plan in small checkpoints without silently expanding scope.
version: 1.0.0
allowed-tools: [atlas search, atlas inspect, atlas verify]
---

# Executing Plans

## Goal

Execute an approved plan in small, verifiable checkpoints — without silently expanding scope or hiding deviations.

## When to use

- An approved plan exists (e.g. from `writing-plans`) and implementation is starting.
- Resuming a partially executed plan.

## Workflow

1. Re-read the current code and tests before each implementation step.
2. Make one focused change at a time and preserve unrelated user work.
3. Run the step's narrow validation immediately; stop when evidence contradicts the plan.
4. Record deviations, new risks, and follow-up work instead of hiding them.
5. Review the diff for dependency direction, security, and accidental scope expansion.
6. Finish with the plan's acceptance checks and a factual implementation report.

## Required capabilities

- Repository understanding: search, inspect
- Verification: per-step validation commands

## Expected output

The implemented plan with a per-step report: what changed, what validated it, deviations recorded, and the acceptance checks' final status.

## Verification

- Each step's validation command ran at the time of the change, not batched at the end.
- The final report separates planned work from deviations and follow-ups.

## Rules / constraints

- No scope expansion beyond the plan; new discoveries become recorded follow-ups.
- Stop and report when evidence contradicts the plan instead of forcing it.

## Security considerations

- Re-check security-sensitive seams (process execution, paths, secrets) touched by each step.
- Never bypass approval boundaries to keep a checkpoint on schedule.
