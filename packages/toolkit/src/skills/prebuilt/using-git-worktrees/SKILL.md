---
name: using-git-worktrees
description: Isolate parallel or risky implementation work with safe Git worktree practices.
version: 1.0.0
allowed-tools: [atlas search, atlas verify]
---

# Git Worktrees

## Goal

Isolate parallel or risky implementation work in a Git worktree without endangering existing user changes.

## When to use

- Running risky or exploratory changes alongside a working tree.
- Parallelizing independent tasks in one repository.

## Workflow

1. Inspect the current branch and working tree before creating isolation.
2. Never discard or overwrite existing user changes.
3. Use a descriptive worktree path and branch name tied to the task.
4. Keep generated artifacts and secrets out of commits.
5. Validate and review the isolated change before integrating it.
6. Do not force-reset, force-push, or delete branches as part of routine work.

## Required capabilities

- Repository understanding: search
- Verification: project test commands (run inside the worktree)

## Expected output

An isolated worktree with the implemented change, validated in place, plus the integration step (merge/rebase/PR) left as an explicit, user-visible action.

## Verification

- The worktree branch contains only task-related changes.
- Validation ran inside the worktree, not assumed from the main checkout.
- No user changes were lost (verify before and after).

## Rules / constraints

- No history destruction: no force-push, branch deletion, or resets as routine steps.
- Clean up worktrees only after their changes are integrated or explicitly abandoned by the user.

## Security considerations

- Generated artifacts, evidence directories, and `.env` files must never be committed from the worktree.
- Git operations stay non-destructive; anything irreversible requires explicit user approval.
