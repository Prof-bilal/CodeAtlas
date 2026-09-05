# RUNBOOK — Executing the 2026-09 Fresh Benchmark

Step-by-step procedure to (re)produce a full matrix run. Follow phases in order;
record everything. This is intentionally runnable with the existing
`@atlas/benchmark` CLI (`atlas benchmark`) plus the config layers defined here.

## 0. Prerequisites

- Node `>=22.5.0`, pnpm (workspace uses pnpm 9.15.0), and `pnpm install` done.
- A configured runner: `opencode` (or `kilo`/`ollama`) — the same runner for the
  whole cycle.
- Tool credentials for Config C/D: `TAVILY_API_KEY`, `GITHUB_TOKEN` (see
  `configs/tools.json`). Config A/B do not need them.
- The repo(s) under test on disk: the `repos/01-small-app` clone and/or the
  CodeAtlas repo root (`--repo <path>`).

## 1. Pin the model & environment

Edit the `<set-me>` model string in all four `configs/config-*.json` to the same
value. Record in `report.md` (Methodology): model id, runner version, Node/OS,
hardware, date.

## 2. Task triage (do NOT skip)

For every task in `tasks/*.json` confirm per `tasks/README.md` (Task triage):
prompt achievable; `expected_*`/`gold_impact_files` match; `regression_tests`
run; bug tasks have `repo_prep` injector + `verify` (verify fails before,
passes after). Untriaged tasks are excluded from published results.

## 3. Prepare repos

```
# 01-small-app clone (clean working copy)
mkdir -p repos && cp -r ../../old-school/benchmarks/benchmark-repos/01-small-app repos/01-small-app
# bug tasks: run the repo_prep injector against the disposable copy, then verify fails
```

For CodeAtlas repo tasks: pass the monorepo root as `--repo`.

## 4. Run the four configs

The CLI runs one task at a time in a `mode`. For Config A use `--mode baseline`;
for B/C/D use `--mode codeatlas`. The harness axes map as:

```
Config A: atlas benchmark run <suite-A> --repo <repo> --mode baseline
Config B: atlas benchmark run <suite-B> --repo <repo> --mode codeatlas      # CodeAtlas MCP only
Config C: same as B, but enable the 3 MCP tools (web-search, web-fetch, github) in the agent's MCP set
Config D: same as C, AND resolve+inject the task's skill (skills/) into the prompt
```

Concretely, per suite:

```
atlas benchmark init --id fresh-a --agent opencode --model <model> --task-file tasks/tasks.projected.json --modes baseline
atlas benchmark run fresh-a --repo <repo> --mode baseline --force
atlas benchmark report fresh-a
```

Steps to materialize:

1. **Project** the rich manifests to runner task files:
   `node scripts/export-tasks.mjs` (or the documented conversion) → a
   `TaskFile` JSON with `prompt` = task prompt, `expected_files`,
   `expected_concepts`, `gold_impact_files`, `hidden_tests`, etc.
2. **Init** a suite from the task file with the relevant mode(s).
3. **Wire the axes** per config:
   - Tools C/D: add the three MCP servers next to the CodeAtlas MCP entry in the
     runner's global config (only for C/D, and only external-repo knowledge).
   - Skills D: for each task, `loadSkill(skillsDir, task.skill)` →
     `renderSkillInstructions(skill)` → prepend to the prompt before running.
     (The Skills loader exposes `discoverSkills`/`loadSkill`/`resolveSkillForTask`/
     `renderSkillInstructions` from `@atlas/benchmark`.)
4. **Run** each config's suite with `--force` (fresh) or without (resume).

## 5. Multi-run (Phase 9)

The seed configs set `runsPerTask: 5`. If a config's suite runs once per task,
loop the run step to collect ≥ 3 (preferred 5) runs per config × task. The store
keeps results per task×mode; tag distinct runs (run-1…run-n) when collecting for
variance.

## 6. Collect & preserve raw results

- Keep everything the runner persists (`.codeatlas/benchmarks/...` and any JSON).
- **Copy raw run artifacts into `raw-results/<date>/<config>-<task>-<run>.json`**
  and never overwrite (Phase: preserve raw results).
- Record tool-call traces and retrieval logs needed for context precision/recall
  (Phase 12) for the CodeAtlas modes.

### Pilot launch (2026-09-04)

- **Orchestrator:** `scripts/pilot-run.sh` — detached (`setsid`), resumable,
  runs the CLI from the monorepo root so `benchmarkRoot()` resolves the shared
  suite store; `--repo` directs the agent's context independently.
- **Robustness:** before each cell the orchestrator deletes any stale stored
  result and writes a nanosecond `launched` marker; a result is accepted only
  if its mtime is strictly newer than that marker (kills the stale-copy race).
- **Aggregator:** `scripts/pilot-aggregate.mjs` reads `raw-results/*/result.json`
  and emits per-cell, per-config, per-domain tables + A/B/C/D pair deltas.
- **Status probe:** `scripts/pilot-status.sh` (log tail, cells done, current cell).
- First cell A-FRONTEND-MEDIUM-01 completed in 460 s: score 2 (correct),
  1.25 M tokens (source `actual`), $0, 40 tool calls, `timedOut: false`.

### Orchestrator bugs found & fixed during pilot bring-up

1. **Suite lookup broke for non-monorepo repos.** `run_cell` used to
   `cd '$repo'` before invoking the CLI, so `benchmarkRoot()` (resolved from
   process cwd) looked for `.codeatlas` inside the target repo. Fix: run the
   CLI from the CodeAtlas root; keep `--repo` for the agent's cwd.
2. **Stale-result race in `wait_cell`.** `stored -nt run.log` evaluated true
   while `run.log` did not yet exist (nonexistent = infinitely old), so the
   22:00 stored result was copied as if fresh. Fix: delete the stale file
   before launch and require `result-mtime > launched` (nanosecond marker).
3. **`pkill` leaves orphaned cells.** Group-kill by pattern misses `setsid`
   children; PID-file based kill + explicit `kill -9 <pid>` per cell used
   instead.

## 7. Evaluate & score

- Run the evaluator (`evaluateTask`) over final texts + tool outputs.
- Execute appended/`hidden_tests` via the allow-listed test runner (ADR-015);
  run `regression_tests`; diff for `forbidden_changes`.
- Apply the correctness rubric (`metrics/scoring.md`) per run.
- Compute per-config × domain × difficulty aggregates (success, reliability, avg
  & median time, tokens, cost, tool calls, test-pass rate, regression rate).

## 8. Analyze

- Incremental value: D vs C vs B vs A on the **same** tasks (paired bootstrap /
  t-test).
- Domain winners; difficulty scaling; context efficiency; failure modes
  (classify: hallucination, wrong file, unnecessary context, incomplete fix,
  tool misuse, skill misuse, regression, timeout, loop).
- Speed vs quality: only claim improvement when quality improved too.

## 9. Write/refresh `report.md`

Fill each required section (Phase 17) from the measurements. Only actual,
preserved results go in. Mark any `not-measured` context metrics honestly.

## Anti-gaming checklist (final)

- [ ] Same model/prompt/repo/timeout/evaluator across configs.
- [ ] Prompt contains no `expected_*`/solution/hint.
- [ ] Bug tasks planted + verified, not inferred after the fact.
- [ ] Raw results preserved; no cherry-picking; failures included.
- [ ] No optimizing the implementation after seeing results.