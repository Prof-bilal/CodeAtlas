# Proposed Architecture — CodeAtlas as an Agent Intelligence Layer

## Target flow

```text
                        USER
                          │
                          ▼
               Request Understanding  ──  [D] TaskClassifierPort
                          │               (deterministic, model-refined)
                          ▼
              Repository Intelligence
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
   Repo Memory       Retrieval Planner     Graph Service
   (digest,          (search + closure     (existing
    conventions)      profile by task)      @atlas/graph)
        └─────────────────┼──────────────────┘
                          ▼
                 Context Builder (hierarchical, tiered)
                          │
                          ▼
                  Sufficiency Gate  ── insufficient ──► expand & retry (N≤2)
                          │ sufficient
                          ▼
                     Task Planner      ──  [D skeleton + M annotations]
                          │
                          ▼
              ┌──►  Small Model  (execute one plan step)
              │              │
              │              ▼
              │       Tool Executor  ──► Result Inspector [D]
              │              │
              └──── round ───┘  (bounded)
                          │
                          ▼
                  Result Inspector  [D: normalize, cite-check]
                          │
                          ▼
                     Validator   [D: tests/typecheck/graph]
                    ┌────┴─────┐
                    ▼          ▼
                 pass       fail → Critic (M, checklist) → revise → re-validate
                    │          (bounded revisions ≤1–2)
                    ▼
             Final Answer + Verification Report

Legend: [D] deterministic component, [M] model component.
```

## Components

| Component | Type | Home (proposed) | Responsibility |
|---|---|---|---|
| TaskClassifierPort | D-first | `packages/core` port; impl in `@atlas/sdk` (or new `@atlas/intel`) | Classify task, extract entities, confidence |
| RetrievalProfile | D | `@atlas/context` extension | Per-category retrieval/boost/pinning policy |
| ContextExpander | D | `@atlas/search` scorer seam + SDK `getRelevantContext` v2 | Closure expansion, hierarchy, ranges |
| SufficiencyGate | D | `@atlas/sdk` | Block answering until coverage predicate holds |
| PlannerPort | D-skeleton | `packages/core` port; impl in `@atlas/sdk` | Deterministic plan skeleton; model annotations |
| AgentState | D | `@atlas/sdk` `context-tools` | Structured JSON state re-injected per round |
| ToolExecutor | D | existing `tool-loop.ts` evolution | Execute tools with policy, dedup, error taxonomy |
| ResultInspector | D | new, beside `tool-loop.ts` | Normalize tool results; detect failed/uninformative results |
| VerifierPort | D | `packages/core` port; impl `@atlas/verifier` (new feature pkg) | Run tests/typecheck/lint, path/graph checks |
| CriticPort | M | `packages/core` port; impl in `@atlas/sdk` via `ProviderPort` | Checklist-bounded review, ≤1 revision |
| RepoMemory | D+M | `@atlas/summary` extension | Auto-generated digest, cached, refreshed on update |

Composition stays in `@atlas/sdk` (`container.ts`), consumers keep using
`createContextSDK` — consistent with `docs/ARCHITECTURE.md` extension points.

## State model (AgentState)

```json
{
  "task": { "raw": "…", "category": "bug", "confidence": 0.82, "entities": [] },
  "plan": { "steps": [], "files": [], "unknowns": [], "verification": [] },
  "known_facts": [],
  "unknowns": [],
  "files_inspected": [],
  "tools_used": [],
  "changes": [],
  "verification": { "runs": [], "claims_checked": [] },
  "risks": [],
  "round": 0
}
```

Rules: state is deterministic-owned (system updates it from tool results and
verification outputs); the model may propose updates via structured output.
State is rendered compactly into each round's prompt.

## Loops and stopping conditions

| Loop | Bound | Stop condition |
|---|---|---|
| Context expansion | N ≤ 2 expansions | Sufficiency predicate satisfied or no new unique files |
| Tool rounds | `MAX_TOOL_ROUNDS` (existing) | Final answer, cap, low-growth note (existing) |
| Verification→fix | ≤ 2 iterations | All verification checks pass, or failure classified as pre-existing/unrelated |
| Critic revisions | ≤ 1 | All checklist items pass or no new issues |
| Global | Wall-clock + total-token budget | Abort with partial answer + verification report |

Every loop records its reason for stopping in the final report — the answer is
never silently truncated.

## Data flow invariants preserved

- All context reads still via `createContextSDK` (no DB access from the loop).
- Verification executes only user-visible, allow-listed commands with
  argv-array spawn (`docs/SECURITY.md`); opt-in per project.
- Provider logic stays in adapters; the critic uses `ProviderPort` like any
  other model call.
- Indexing path untouched; incremental hashing respected.

## What does NOT change

- The MCP tool protocol shape (tools added, schemas stable).
- The existing CLI commands (`ask`, `context`, `explain`) gain richer output
  fields; existing flags keep working.
- ADR-001 deterministic ranking stays AI-optional.
