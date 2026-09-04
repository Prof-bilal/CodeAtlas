# The Intelligence Layer — Deterministic vs Model-Based

Governing rule (extends ADR-001 "Deterministic Before AI"):

> **Never ask the model for a fact CodeAtlas can compute. Never trust the
> model for a claim CodeAtlas can check.**

## Division of labor

| Capability | Deterministic (CodeAtlas computes) | Model-based (model reasons) |
|---|---|---|
| Task classification | Keyword/pattern classifier with confidence; graph signals (e.g. task mentions a failing test → bug) | Refine ambiguous classification only, with the deterministic result shown |
| Files involved | Search + dependency closure + test/config pinning | Confirm/extend; request more via one tool call |
| Relationships | `@atlas/graph` edges, callers/callees, shortest path, cycles | Interpret meaning of relationships |
| Plan skeleton | Steps implied by graph (change X → must update callers C1..Cn, tests T1..Tm) | Order, wording, risk judgment, gaps |
| Unknowns detection | Plan references files/symbols not in index; search below score threshold | Decide whether a gap blocks the task |
| Verification | Run tests/typecheck/lint; path existence; graph consistency; expected-file-changes diff | Judge whether a failing check is task-related; propose fix |
| Summaries/briefing | Cache, hashing, budget, structure (`summary.service.ts`, `briefing.ts`) | Generate text |
| Critique | Deterministic checklist (cited files exist, all plan files addressed, output contract satisfied) | Qualitative review of reasoning and correctness |
| Confidence | Score/coverage/verification metrics | Optional self-report (never trusted alone) |
| Tool orchestration | High-level tools that execute multi-step pipelines | Low-level tools for narrow lookups |
| Error recovery | Retry taxonomy, deterministic alternatives (alternate queries, wider hops) | Choose among offered alternatives |

## Components of the intelligence layer

1. **TaskClassifierPort** — deterministic classifier first (keyword/pattern
   scoring over task text + graph signals), model refinement only when
   confidence is low. Output: category (bug/feature/refactor/explain/debug),
   entities (file/symbol names found in task), confidence.
2. **PlannerPort** — deterministic skeleton from graph + classifier + search:
   files, dependency closure, tests for those files, config touchpoints,
   unknowns, verification strategy. Model may annotate; the skeleton is
   authoritative (see risks.md for the "incorrect plan becomes authoritative"
   risk and its mitigation).
3. **ContextExpander** (inside `@atlas/search`/SDK) — closure expansion +
   hierarchy tiers (see context-strategy.md).
4. **SufficiencyGate** — deterministic predicate over plan + retrieved context
   (see context-strategy.md §Sufficiency).
5. **VerifierPort** — deterministic verification runs + claim checks
   (see planning-and-verification.md).
6. **CriticPort** — model-based reviewer constrained by a deterministic
   checklist (see planning-and-verification.md §Critic).
7. **AgentState** — structured intermediate state persisted per session
   (see proposed-architecture.md).
8. **RepoMemory** — auto-generated repository knowledge, cached like summaries.

## What stays model-based, deliberately

- Interpreting *why* code is structured the way it is.
- Writing the actual fix/explanation text.
- Judging whether a verification failure is caused by the change.
- Qualitative critique.

## Anti-patterns to avoid

- Asking the model to "find the relevant files" when the graph can close over
  them deterministically.
- Asking the model to verify its own syntax claims when `tsc` can.
- Adding agents without a measured purpose (Rule 8): every model-based
  component must beat its deterministic alternative on the benchmark, or it is
  cut.
- Token minimization as a goal (Rule 6): budgets exist to prevent explosion,
  not to maximize compression.
