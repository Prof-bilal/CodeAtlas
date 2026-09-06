# CodeAtlas MCP Migration Guide (V2 — Phase 6 Release)

> Source: `CODEATLAS-MCP-V2-IMPLEMENTATION-PLAN.md` §12 + §17 Phase 4 + Phase 6.
> Status: **release cut** — the 4 deprecated tools have been removed from the
> protocol. Calls to `analyze_task`, `create_plan`, `verify_answer`, and
> `explain_module` now return `Method not found`.

## Protocol surface (Phase 6)

**8 legacy tools + 4 canonical aliases = 12 advertised names.**

| Legacy | Canonical (preferred) | Notes |
|---|---|---|
| `find_relevant_context` | `context_for` | Identical I/O. Add `brief: true` for pointer-only items. |
| `get_dependencies` | `dependencies_of` | Identical I/O + `depth 1..3` (default 1). |
| `project_overview` | `overview` | Identical I/O. `detail:"full"` returns a `warning`. |
| `read_file_range` | `read_range` | Identical I/O. |

Both spellings return identical results. `PROTOCOL_TOOL_NAMES` in
`packages/mcp/src/tools.ts` is the contract test source of truth.

## Removed tools (Phase 6 release cut)

| Tool | Replacement |
|---|---|
| `analyze_task` | `context_for` (classification is internal to assembly; call it directly). |
| `create_plan` | `context_for` + `dependencies_of` with `depth: 2`. The planner's impact-set logic stays in `@atlas/sdk` for internal use. |
| `verify_answer` | Run your own checks. The verifier package stays in the repo for harness use. |
| `explain_module` | `overview` + `search_files` + `dependencies_of` (scoped by path). |

Calls to removed tools return `Method not found` with a pointer to this document.

## New / changed parameters

- `get_dependencies` / `dependencies_of`: new `depth` (integer 1..3, default
  1). `1` = direct edges (legacy behavior, now with `hop:1` + `path`
  attribution). `2..3` = bounded BFS with cycle-safe visited tracking;
  every edge carries `hop` + `path` (ordered node ids seed → far endpoint).
  `depth` is ignored without `node`. Server-clamped to 1..3.
- `find_relevant_context` / `context_for`: `brief` (already shipped, Phase 3)
  returns one-line pointers instead of full text.
- `project_overview` / `overview`: `detail:"full"` now returns a `warning`
  string steering callers to `summary` + targeted reads.
- `inspect_symbol`: `callers`/`callees` capped at 25 each with
  `callerOverflow`/`calleeOverflow` strings + `confidence` (`high`/`medium`/`low`).

## Score / envelope changes (already live)

- Scores normalized to **0..1** (`score`), raw 0..100 dual-emitted as
  `rawScore`, plus `confidence` (`high`/`medium`/`low`).
- Every object result carries `freshness` + `timings`
  (`probeMs`/`searchMs`/`assemblyMs`/`responseBytes`).
- `find_relevant_context`: verbose `nextSteps[]` compacted; single `hint`
  string + `refine` when insufficient.
- `get_dependencies` default `limit` is **25** (max 1000).

## CLI / extension call sites

Grep `analyze_task|create_plan|verify_answer|explain_module` across
`apps/cli` + `apps/extension` before the release cut. Known hits (verified
2026-09-06):

- `apps/cli/src/commands/benchmark.ts:166-172` — scoring-weight map keys
  (not tool calls; no migration needed, left as-is).
- `apps/cli/README.md:74` — tool list prose (updated alongside this doc).

No CLI or extension code path invokes the deprecated tools over MCP; the
tool-loop bridge (`packages/mcp/src/tool-bridge.ts`) re-exports whatever
`TOOLS` + `HANDLERS` declare, so it follows the cut automatically.
