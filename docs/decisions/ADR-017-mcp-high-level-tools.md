# ADR-017 — MCP High-Level Tool Surface

Date: 2026-08-30 · Status: Accepted (Phase 3, small-model intelligence audit)

## Context

The MCP server (`@atlas/mcp`) currently exposes 7 low-level tools:
`search_symbols`, `search_files`, `get_summary`, `get_dependencies`,
`explain_module`, `project_overview`, `read_file_range`. These are
fine-grained building blocks that require the calling model to orchestrate
multi-step reasoning (classify → search → plan → retrieve) on its own.

Small models perform significantly better when given **high-level tools**
that encapsulate multi-step workflows: classify a task, build a plan, retrieve
context with a sufficiency gate, and inspect a symbol's full neighborhood.
The execution plan (`docs/audit/small-model-intelligence/execution-plan.md`)
calls for 4 new high-level tools, bringing the total to 11 (within the ≤12
cap).

## Decision

1. Add 4 new MCP tools, registered **before** the existing low-level tools
   so they appear first in `tools/list`:

   | Tool | Purpose | Wraps |
   |---|---|---|
   | `analyze_task` | Classify a task + extract entities | P2.2 classifier |
   | `create_plan` | Generate a deterministic plan from classification | P2.3 planner |
   | `find_relevant_context` | Retrieve ranked context with sufficiency gate + `next_steps` | P1.5 hierarchy + P1.6 sufficiency |
   | `inspect_symbol` | Full symbol neighborhood: declaration, callers, callees, tests | SDK symbol + dependency APIs |

2. **`analyze_task`** input: `{ task: string }`. Output: classification
   (category, subcategory, confidence, reasoning) + entities (paths, symbols,
   keywords). Pure, deterministic, no index required.

3. **`create_plan`** input: `{ task: string }`. Output: plan (steps, impact
   set, unknowns, verification strategy). Calls `analyze_task` internally
   then runs the planner. Requires an index for search/graph closure.

4. **`find_relevant_context`** input: `{ task: string, budget?: object }`.
   Output: context package items + `next_steps` (deterministic hints from
   the sufficiency gate). Every result includes `next_steps` — an array of
   strings telling the model what to do next (search broader, expand closure,
   check specific files). This is the `next_steps` convention from the
   execution plan.

5. **`inspect_symbol`** input: `{ symbol: string }` (name or id). Output:
   symbol declaration + callers + callees + test files. Uses the SDK's
   dependency API with `direction: "both"` filtered to the symbol, plus
   file-name convention (`*.test.ts`) for test discovery.

6. Tool ordering in `tools/list` (high-level first):
   1. `analyze_task`
   2. `create_plan`
   3. `find_relevant_context`
   4. `inspect_symbol`
   5. `search_symbols`
   6. `search_files`
   7. `get_summary`
   8. `get_dependencies`
   9. `explain_module`
   10. `project_overview`
   11. `read_file_range`

7. Total tool count: 11 (within the ≤12 cap). The high-level tools
   encapsulate the planning layer; the low-level tools remain available for
   fine-grained follow-up.

8. Every tool result that returns an object includes `next_steps: string[]`
   at the top level. For the high-level tools, `next_steps` comes from the
   sufficiency gate or the plan. For the low-level tools, `next_steps` is
   an empty array (no automated guidance needed for atomic operations).

## Consequences

- The 4 new tools wrap SDK modules (`createClassifier`, `createPlanner`,
  `assembleContextPackage`, SDK symbol/dependency APIs) — no direct database
  access, no new packages.
- The `next_steps` convention gives small models a deterministic recovery
  path when context is insufficient, instead of relying on the model to
  figure out what to do next.
- The tool count stays within the ≤12 cap; if more tools are needed in the
  future, low-level tools can be consolidated or gated behind a `detail`
  parameter.
