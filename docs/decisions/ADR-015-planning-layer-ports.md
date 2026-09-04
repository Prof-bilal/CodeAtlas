# ADR-015 — Planning Layer Core Ports (TaskClassifierPort, PlannerPort)

Date: 2026-08-30 · Status: Accepted (Phase 2, small-model intelligence audit)

## Context

The small-model intelligence audit found that small models perform
significantly better when given an explicit task classification and a
deterministic plan before answering. Today the context pipeline treats all
tasks uniformly: a single lexical query feeds the ranker, and the model
receives flat context with no structural guidance.

The execution plan (`old-school/research/audit/small-model-intelligence/execution-plan.md`)
calls for a **planning layer** that sits between context assembly and the
model prompt: classify the task, produce a deterministic plan (steps, impact
set, unknowns, verification strategy), and attach the plan to the context
package so the model has a structured scaffold.

## Decision

1. Add two new **type-only ports** in `packages/core/src/ports/`:
   - `TaskClassifierPort` — deterministic task classification with confidence.
   - `PlannerPort` — deterministic plan generation from classifier output +
     context search + dependency closure.

2. `TaskClassifierPort` contract:
   ```ts
   interface TaskClassifierPort {
     classify(task: string): TaskClassification;
   }
   interface TaskClassification {
     category: ContextTaskCategory;       // reuse existing union
     subcategory: string;                  // e.g. "auth-bug", "api-feature"
     confidence: number;                   // 0..1
     reasoning: string;                    // deterministic explanation
     entities: TaskEntities;               // from P1.2 entity extraction
   }
   ```
   The implementation is **deterministic keyword/graph scoring** — no AI.
   A model-refinement hook is stubbed (accepts an optional provider for
   future use) but the default path is pure computation.

3. `PlannerPort` contract:
   ```ts
   interface PlannerPort {
     plan(task: string, classification: TaskClassification): TaskPlan;
   }
   interface TaskPlan {
     steps: readonly PlanStep[];
     impactSet: readonly string[];         // file paths the plan expects to touch
     unknowns: readonly string[];          // things the plan cannot resolve deterministically
     verificationStrategy: VerificationStrategy;
   }
   interface PlanStep {
     order: number;
     action: string;                      // deterministic, human-readable
     targetFiles: readonly string[];      // files this step touches
     rationale: string;                   // why this step
   }
   type VerificationStrategy = "none" | "claim-checks" | "command-runners";
   ```

4. The plan is **additive** to the context package — it appears as a new
   item kind (`"plan"`) at the top of the rendered context, after
   instructions and before critical-tier files. No existing item is removed
   or reordered.

5. The plan-authority guard (P2.5) ensures model annotations are
   additive-only: a model may append notes to a plan step but never
   delete, reorder, or contradict a deterministic step. Conflicts escalate
   to re-retrieval, not silent override.

## Consequences

- Purely additive — no storage schema change, no breaking change to
  `ContextBuilderPort` (ADR-001 seam intact).
- The classifier and planner are composed in `@atlas/sdk` behind these
  ports, following the existing pattern (SDK owns composition, core owns
  contracts).
- Future phases (P4 verification, P5 iterative loop, P6 critic) build on
  these ports without redesigning them.
