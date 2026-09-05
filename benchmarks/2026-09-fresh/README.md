# 2026-09 Fresh — Comprehensive Benchmark

A fresh, reproducible measurement of **CodeAtlas as an agent aid**, comparing
four harness configurations across eight domains and four difficulty levels.
This is a new cycle: historical reports live under `old-school/` and are not
reused or modified.

## Status

- **Framework: built.** Configurations (A/B/C/D), methodology, metrics/scoring,
  seed task catalog (all 8 domains, all 4 difficulty levels), the 5-skill set,
  and the Skills MVP (`packages/benchmark/src/skills/`, tested) are in place.
- **Execution: pending on a runner machine with the harness tools.**
  Running the full matrix requires a configured runner (opencode/kilo/ollama),
  the selected MCP tools' credentials (`TAVILY_API_KEY`, `GITHUB_TOKEN`), the
  pinned repos, and task triage. See `RUNBOOK.md`. **No benchmark numbers are
  presented as results until a real matrix run is complete** — the framework
  does not fabricate numbers.

## What this determines (Phase 13)

Incremental value, on identical tasks/models/timeouts:

| Question | Comparison |
|---|---|
| Does CodeAtlas help? | Config B (CodeAtlas Simple) vs A (Baseline) |
| Do tools help? | Config C (+Tools) vs B |
| Do skills help? | Config D (+Tools+Skills) vs C |
| Does the complete harness win? | Config D vs A |

Plus: which domains benefit most, failure modes, context efficiency
(precision/recall), and speed-vs-quality analysis.

## Layout

```
2026-09-fresh/
├── README.md            ← this file
├── methodology.md        ← full protocol (Phases 1–15)
├── RUNBOOK.md            ← how to execute a matrix run
├── report.md             ← final report (Phase 17)
├── configs/              ← Config A–D + tools selection
├── skills/               ← 5 benchmark skills (SKILL.md)
├── tasks/                ← rich task manifests + schema
├── metrics/              ← metrics + correctness/scoring rubric
├── repos/                ← disposable clones for testing
└── raw-results/          ← preserved raw runs (never replaced)
```

## Skills MVP (implemented)

`packages/benchmark/src/skills/` implements the Agent Skills open-standard
pattern for the benchmark: discovery (metadata only) → load (full `SKILL.md` +
bounded `references/`) → render → task→skill resolution. Dependency-free and
path-safe. Verified by `pnpm exec vitest run packages/benchmark/tests/skills.test.ts`
and `skills-real.test.ts` (the latter proves the checked-in `skills/` set loads).

## Repositories under test (seed)

- `01-small-app` (Express+TS task API) — backend, testing, debugging,
  refactoring, and some full-stack cells.
- `codeatlas` (this monorepo) — architecture, frontend (in-tree extension),
  full-stack (server), and external-knowledge cells.
- Pinned external repos for the React frontend cell (`status: needs-clone`).

## Ground rules

- Only triaged tasks enter published results (`tasks/README.md`).
- Same model/prompt/repo/timeout/evaluator across all four configs.
- Raw results are preserved; aggregation is derived and raw values stay visible.
- Context precision/recall are reported only when reliably measurable.
- If a feature (CodeAtlas, tools, or skills) shows no measurable benefit, the
  report says so honestly.