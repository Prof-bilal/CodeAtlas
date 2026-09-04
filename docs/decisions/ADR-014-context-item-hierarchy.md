# ADR-014 — Hierarchical Context Items (tier + reason)

Date: 2026-08-30 · Status: Accepted (Phase 1, small-model intelligence audit)

## Context

The small-model intelligence audit
(`old-school/research/audit/small-model-intelligence/`) found that context delivery is flat:
`ContextItem` is a whole file + score, with no hierarchy, no explanation of
why a file was selected, and no dependency-closure expansion. Small models
perform significantly better when context arrives tiered (critical /
important / supporting / optional) with deterministic selection reasons.

## Decision

1. Extend the core `ContextItem` entity with two **optional** fields:
   `tier?: ContextTier` (`"critical" | "important" | "supporting" |
   "optional"`) and `reason?: string`.
1b. Extend it further with two **optional** structured fields (Phase 1 of the
   small-model intelligence execution plan — the plan's "ADR-016" item was
   folded into this ADR rather than adding a separate document):
   `ranges?: readonly LineRange[]` (1-based inclusive line ranges so Critical
   items can be delivered as slices instead of whole files) and
   `annotations?: Readonly<Record<string, string>>` (deterministic, structured
   provenance such as `{ testsFor: "src/auth.ts" }`). All fields are additive;
   absent means "whole file" / "no annotations".
2. The tier describes how essential the item is for the current task;
   budgets may consume top-tier-first but MUST NOT force compression below
   the quality bar (quality-first policy, audit Rule 6).
3. The `reason` is always produced **deterministically** (graph closure,
   test-file association, entity match) — never by a model (extends ADR-001
   "deterministic before AI").
4. Legacy producers that omit the fields stay valid; consumers must treat an
   absent tier as "unranked", not as any specific tier.
5. No change to `ContextBuilderService` ranking semantics (ADR-001 seam
   intact). Tiering is applied by the SDK's expanded-context assembly
   (`getExpandedContext`), not by rewriting the ranker.

## Consequences

- Purely additive; no storage schema change (tiers are computed at read
  time, not persisted).
- Future work (Phase 5+) can budget per tier and render hierarchies in
  slices/MCP payloads using the same fields.
