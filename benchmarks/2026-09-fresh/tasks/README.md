# Tasks — 2026-09 Fresh (seed catalog)

## Scope and honesty

This is the **seed task catalog** for the fresh benchmark: a real, runnable set
covering all 8 domains and all 4 difficulty levels, authored to the schema in
`schema.md`. It is intentionally a *starter set* — the defensible way to build a
benchmark is to grow it and to **triage every task** (see "Task triage" below)
before a full 4-config run. No task may be added/kept if its premise cannot be
verified; the mission's anti-gaming rules (Phase 15) apply to every entry.

## Repository mapping (`repository` → run-time path)

| Logical key | Path at run time |
|---|---|
| `repos/01-small-app` | Clone of `old-school/benchmarks/benchmark-repos/01-small-app` into `benchmarks/2026-09-fresh/repos/01-small-app` — the runner indexes this copy |
| `codeatlas` | The CodeAtlas monorepo root itself (passed as `--repo <repo-root>`); used for architecture/frontend/full-stack/external tasks **about a real multi-module repo** |
| `repos/<external>` | Pinned external clone (record commit + origin). Tasks with `"status": "needs-clone"` require the operator to pin before first run |

`01-small-app` is an in-tree Express + TypeScript task API (JWT auth, RBAC, task
CRUD, filtering, pagination). Because tasks run against a **copy** (never the
source tree), the original `old-school/.../01-small-app` stays pristine.

## Why `repo_prep` and bug tasks

Debugging/testing tasks use a strict `repo_prep` design: an evaluator-authored
script injects a **known, verifiable defect** (or weak test) into a disposable
copy *before* the agent starts. This guarantees:

- The bug is real and reproduceable (never inferred or fabricated post-hoc).
- A deterministic `verify` step checks the fix.
- The prompt never reveals the defect (no solution leakage).

Until a `repo_prep` script exists for a bug task, that task must not be run for
published results (it would be unverifiable).

## Task triage (required before a full run)

For every task, an evaluator must confirm and record:

1. The prompt is achievable against the pinned repo+commit.
2. `expected_files` / `expected_concepts` / `gold_impact_files` match reality.
3. `regression_tests` actually exist and run.
4. For bug tasks: a `repo_prep` injector + `verify` script exists and the verify
   step fails before the fix and passes after.
5. No field shown above leaks information that is `expected_*` or `success_*`
   material into the agent `prompt`.

Only triaged tasks enter the published matrix. Untriaged ones stay listed here
as `status: untriaged` and are excluded from results until triaged.

## Seed coverage

| File | Domain | Difficulty in seed |
|---|---|---|
| `backend.json` | backend | easy, medium, hard |
| `debugging.json` | debugging | hard, expert (repo_prep) |
| `testing.json` | testing | medium, hard (repo_prep) |
| `refactoring.json` | refactoring | medium, hard |
| `architecture.json` | architecture | easy, medium |
| `frontend.json` | frontend | medium (in-tree), hard (needs-clone React) |
| `fullstack.json` | full-stack | medium, expert |
| `external-knowledge.json` | external-knowledge | hard, expert (tools required; skills intentionally null) |

> Domain coverage note: the seed already spans all 8 domains and all 4
> difficulty levels. To meet the preferred per-cell sample size (Phase 9),
> expand each domain × difficulty cell to ≥ 3 triaged tasks before treating the
> numbers as statistically meaningful.