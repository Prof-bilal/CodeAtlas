# ADR-016 — Package Placement for Planning Layer

Date: 2026-08-30 · Status: Accepted (Phase 2, small-model intelligence audit)

## Context

ADR-015 defines `TaskClassifierPort` and `PlannerPort` as type-only contracts
in `packages/core`. The execution plan (the archived planning notes)
specifies that implementations live in `@prof-bilal/atlas-sdk` (the existing composition
root for context-integration), not in new feature packages.

This ADR confirms the placement and explains why.

## Decision

1. **Ports (contracts)** go in `packages/core/src/ports/`:
   - `task-classifier.port.ts` — `TaskClassifierPort`, `TaskClassification`
   - `planner.port.ts` — `PlannerPort`, `TaskPlan`, `PlanStep`, `VerificationStrategy`

2. **Implementations** go in `packages/sdk/src/context-integration/`:
   - `classifier.ts` — deterministic keyword/graph classifier
   - `planner.ts` — deterministic plan builder (uses classifier + search + closure)

3. **No new feature package** is created for the planning layer. Rationale:
   - The classifier and planner are pure functions over existing SDK data
     (search, graph, entity extraction) — they do not need their own
     persistence, providers, or CLI surface.
   - `@prof-bilal/atlas-sdk` already owns `context-integration/` where entities,
     sufficiency, hierarchy, and assembly live — the planner is a natural
     extension of that module.
   - A separate `@prof-bilal/atlas-planner` package would add workspace complexity
     (tsup config, package.json, ESLint matrix entry) for a single module
     with no independent consumers.

4. The future `@prof-bilal/atlas-verifier` feature package (ADR-015, Phase 4) is
   **not** placed in `@prof-bilal/atlas-sdk` because it requires command execution
   (spawn, timeout, allow-list) — a qualitatively different concern from
   pure context assembly. That decision is deferred to ADR-017 (verification
   command policy).

5. The CLI (`apps/cli`) consumes the planner through `@prof-bilal/atlas-sdk` only —
   it never imports `classifier.ts` or `planner.ts` directly.

## Consequences

- The ESLint dependency matrix (`docs/architecture/DEPENDENCIES.md`) is unchanged:
  `@prof-bilal/atlas-sdk` already imports `@prof-bilal/atlas-core` + `@prof-bilal/atlas-shared`.
- The `Container` class in `packages/sdk/src/container.ts` is **not**
  modified — the classifier and planner are stateless functions, not
  services that need injection.
- The planner's dependency on `ContextSDK` (for search + graph) is
  satisfied at call-time, not at construction-time, keeping it testable
  with fixture data.
