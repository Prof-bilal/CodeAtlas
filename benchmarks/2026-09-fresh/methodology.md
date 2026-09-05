# Benchmark Methodology — 2026-09 Fresh

## Purpose

Measure the **current** CodeAtlas as an aid to an AI coding agent — not merely
whether it is faster, but whether it helps an agent understand repositories,
solve **harder** tasks, make fewer mistakes, use less unnecessary context, and
whether external **tools** and **Skills** add measurable value on top. This is a
fresh cycle; historical conclusions are not reused (their reports live under
`old-school/` and are not modified).

## 1. Models

One model per benchmark cycle, identical across all four configs (the anti-
gaming rule: never change the model between configurations). Set `<set-me>` in
`configs/config-*.json`. The runner (`opencode`/`kilo`/`ollama`, per
`packages/benchmark`) is fixed for the cycle. Free-tier local models make cost a
weak metric (reported as $0); the economically relevant metrics are then tokens
and time, and cost analysis is marked accordingly.

## 2. Repositories (Phase 7)

Real, multi-module repositories, recorded with commit SHA, language, framework,
size, file count, task source, and task difficulty:

- `01-small-app` — Express + TS task API (in-tree; ~82 TS files). Cloned into
  `repos/01-small-app` at run time so tasks run against a clean copy.
- `codeatlas` — the CodeAtlas monorepo itself (real pnpm+TS monorepo; large,
  cross-package dependencies) for architecture/frontend/full-stack/external
  tasks.
- Pinned external repos (recorded; `status: needs-clone`) for the React frontend
  cell and any domain requiring an unfamiliar external codebase.

Small/medium/large are represented. Context relevant to every task is
deliberately distributed across files (cross-file relationships are the
CodeAtlas advantage this benchmark probes).

## 3. Tasks, domains, difficulty (Phases 5, 6, 8)

- **8 domains:** frontend, backend, full-stack, debugging, refactoring, testing,
  external-knowledge, architecture — see `tasks/`.
- **4 difficulty levels:** easy, medium, hard, expert. Difficulty comes from
  reasoning, ambiguity, dependencies, cross-file relationships, external
  knowledge, and debugging complexity — **not** from longer prompts.
- **Structure:** every task is a rich manifest (`tasks/schema.md`) with
  `expected_behavior`, `files_likely_involved`, `external_knowledge_required`,
  `tools_allowed`, `skill`, `success_criteria`, `regression_tests`, plus the
  runner projection. **No solution is leaked** into the agent prompt.
- **Bug tasks** use `repo_prep`: a verifiable, known defect (or weak test) is
  planted into a disposable copy before the run and checked by a deterministic
  verify step.

## 4. Configurations (Phase 4)

| Config | CodeAtlas | Tools | Skills |
|---|---|---|---|
| A — Baseline | – | – | – |
| B — CodeAtlas Simple | + | – | – |
| C — CodeAtlas + Tools | + | + | – |
| D — CodeAtlas + Tools + Skills | + | + | + |

Everything else (model, task, prompt, repo+commit, machine, timeout, evaluator,
success criteria) is identical. See `configs/`.

### Tools (Phases 1, 3)
Selected after fresh web research (Agent Skills open standard; MCP tool survey):
**web-search**, **web-fetch**, **github** — see `configs/tools.json` for the full
per-tool justification (purpose, why, alternatives, benefit, downside, token &
latency cost, failure modes). Tools are restricted to knowledge **outside** the
repo (repository intelligence is CodeAtlas's job and is not duplicated).

### Skills (Phases 2, 5)
A minimal Skills capability was implemented:
- New module `packages/benchmark/src/skills/` (discovery → load → render →
  resolve), following the Agent Skills open standard (`SKILL.md` frontmatter +
  body + optional `references/`), dependency-free and tested (13 unit + 3
  integration tests, `pnpm exec vitest run packages/benchmark/tests/skills*.test.ts`).
- Benchmark skill set under `skills/`: frontend-debugging, backend-api,
  repository-debugging, testing, refactoring.
- In Config D the applicable skill is resolved and its instructions are
  injected into the prompt (progressive disclosure). Configs A/B/C run the same
  tasks **without** skills, enabling the WITH vs WITHOUT comparison.

## 5. Runs & evaluation (Phases 9, 10)

- **Multi-run:** ≥ 3 runs per config × task; 5 in the seed configs
  (`runsPerTask`). Single runs are never trusted.
- Same prompt, same evaluator across configs. Reports success rate, failures,
  avg/median time, tokens (input/output/total), estimated cost, tool calls,
  context usage, retries, test pass rate, regression rate.
- **Quality over speed:** speed, efficiency, correctness, reliability,
  regression-safety, repository understanding, research ability, and
  maintainability are reported as separate dimensions (Phase 10). Faster is not
  treated as better by itself.

## 6. Scoring & metrics (Phases 11, 12)

Raw dimensions are always visible (`metrics/`): Task Success, Correctness (0–4),
Reliability, Time, Input/Output/Total tokens, Estimated cost, Tool Calls,
Context Efficiency, Regression Rate, Test Pass Rate. Context precision/recall
are computed only when retrieval is reliably attributable (CodeAtlas modes);
otherwise reported `not-measured` — never fabricated.

## 7. Incremental value (Phase 13)

Answers produced: Does CodeAtlas help (B vs A)? Do tools help (C vs B)? Do
skills help (D vs C)? Does the complete harness outperform (D vs A)? Also: which
domains get the largest advantage. Significance via paired bootstrap / paired
t-test over runs.

## 8. Failure analysis (Phase 14)

Every config records failure modes: hallucinations, wrong file selection,
unnecessary context, incomplete fixes, incorrect assumptions, tool misuse,
skill misuse, regressions, test failures, timeouts, infinite/retry loops,
inability to understand architecture. The report explains *why* failures
occurred when evidence allows. Failures are not hidden and not cherry-picked.

## 9. Anti-gaming (Phase 15)

- The agent receives no expected file names, expected implementations, hidden
  hints, or benchmark-specific retrieval hints.
- Prompts are realistic user requests.
- Infrastructure is identical between configs except the changed axis.
- No post-hoc optimization on observed results; raw results are preserved.

## 10. Reproducibility

Artifacts: pinned configs, task manifests (with commit + repo), the seed
`01-small-app` copy and CodeAtlas commit recorded, run commands in `RUNBOOK.md`,
raw results preserved under `raw-results/`, and a fixed evaluator. A reviewer can
re-run any cell and the report regenerates from preserved raw results.