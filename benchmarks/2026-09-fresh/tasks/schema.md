# Task Manifest Schema — 2026-09 Fresh

Each task is a JSON object in `tasks/`. The rich manifest carries the mission's
required dimensions (domain, difficulty, external knowledge, tools, skill,
success criteria, regression tests) **plus** a projection onto the runnable
`TaskDefinition` shape used by `@atlas/benchmark` (`expected_files`,
`expected_concepts`, `gold_impact_files`, `hidden_tests`, `evaluation_method`,
`prompt`).

> **Anti-gaming rule:** `prompt` is the ONLY thing synthesized into
> `TaskDefinition.prompt` and sent to the agent. Every `expected_*`,
> `files_likely_involved`, `gold_impact_files`, `hidden_tests`, and
> `success_criteria` field is evaluator-only and is **never** placed in the
> prompt. File names/solutions must not appear in `prompt` or `description`.

## Canonical fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Unique, e.g. `BACKEND-EASY-01` |
| `domain` | enum | yes | See domains below |
| `difficulty` | enum | yes | `easy` \| `medium` \| `hard` \| `expert` |
| `repository` | string | yes | Repo root path (in-tree) or a `repos/` pinned dir |
| `commit` | string | yes | Pinned commit SHA (or `HEAD` for in-tree fixture; record SHA after authoring) |
| `description` | string | yes | Short task summary (human-readable, evaluator-facing) |
| `expected_behavior` | string | yes | What a correct solution looks like |
| `files_likely_involved` | string[] | yes | Repo-relative paths likely touched/relevant (evaluator-only) |
| `external_knowledge_required` | boolean | yes | Whether the repo alone is insufficient |
| `external_knowledge_note` | string | no | What external info is needed (not a solution) |
| `tools_allowed` | string[] | no | Subset of {web-search, web-fetch, github} that may help |
| `skill` | string \| null | yes | Skill id to inject in Config D (see `skills/`), or null |
| `prompt` | string | yes | **The realistic user request sent to the agent.** No solution leakage |
| `success_criteria` | string[] | yes | Observable, checkable pass conditions |
| `regression_tests` | string[] | no | Test paths/commands that must remain green |
| `evaluation_method` | string | yes | Automated + manual scoring procedure |

### TaskDefinition projection (for the runner)

| Field | Notes |
|---|---|
| `expected_files` | Evaluator gold — files whose mention in the answer earns credit |
| `expected_concepts` | Evaluator gold — concepts whose appearance earns credit |
| `gold_impact_files` | Files a correct code-touching task should affect |
| `forbidden_changes` | Files that must NOT be touched (overreach detection) |
| `hidden_tests` | Allow-listed test scripts executed by the runner (ADR-015 policy) |
| `max_seconds` | Per-task timeout override |

## Domains

`frontend`, `backend`, `full-stack`, `debugging`, `refactoring`, `testing`,
`external-knowledge`, `architecture`.

## Difficulty

| Level | Source of difficulty (not task length) |
|---|---|
| `easy` | Single-file, isolated |
| `medium` | Multi-file, one layer |
| `hard` | Cross-file/cross-layer reasoning, subtle diagnosis |
| `expert` | Cross-domain, ambiguous, external research, architectural |

## Repositories (Phase 7)

- **In-tree, runnable now:** `../../old-school/benchmarks/benchmark-repos/01-small-app` (Express + TS task API; 82 TS files), and the CodeAtlas monorepo itself (`../../`) for architecture/repository-understanding and the extension/server frontends.
- **Pinned external clones (recorded, `status: needs-clone`):** to be cloned into `repos/` by the operator from the pinned `commit` + origin recorded in each task. External knowledge tasks that need web/GitHub research are the primary target for Config C/D.

Record for any external repo: repository, commit SHA, language, framework, size, file count, task source, task difficulty (Phase 7 requirement) — captured in the task manifest.