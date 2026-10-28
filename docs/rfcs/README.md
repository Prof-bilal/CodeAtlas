# Requests for Comments (RFCs)

RFCs are **design proposals**, not descriptions of shipped behavior. An RFC may
describe `[PLANNED]`, `[PARTIAL]` or `[EXPERIMENTAL]` work, but it must never be
read as evidence that the design exists in code. The source of truth for
implemented behavior remains [`docs/CURRENT_STATE.md`](../CURRENT_STATE.md),
[`docs/FEATURE_STATUS.md`](../FEATURE_STATUS.md) and the code itself.

## Status vocabulary

| Tag | Meaning |
| --- | --- |
| `[DRAFT]` | Under review; no decision yet. |
| `[ACCEPTED]` | Decision recorded; implementation may proceed in phases. |
| `[SUPERSEDED]` | Replaced by a later RFC or ADR. |
| `[DEFERRED]` | Deliberately not scheduled. |

RFC status is separate from implementation status. An accepted RFC with no
merged code is still `[PLANNED]` as a feature.

## Index

- [Goal-satisfaction capability matrix](./goal-satisfaction-matrix.md) —
  KEEP / EXTEND / BUILD / DEFER decisions for the 29 audited proof-system
  surfaces, followed by the new goal-satisfaction surfaces.
- [Goal Satisfaction Engine RFC](./goal-satisfaction-engine.md) — `[EXPERIMENTAL]`
  implemented architecture for distinguishing **test status**, **proof status**
  and **goal status** without building a second proof system; see the
  [release evidence](../proof-system/14-goal-satisfaction.md).

## Process

1. Audit the existing implementation and tests before designing.
2. Write the capability matrix first: every row must cite a file and symbol.
3. Write the RFC using the repository's dependency direction
   (`cli → sdk → feature packages → core → shared`).
4. Record any architectural decision as an ADR in
   [`docs/decisions/`](../decisions/README.md).
5. Only then implement, in small phases, with tests and a benchmark gate.

RFCs do not authorise implementation by themselves. A phase starts only when its
acceptance criteria and its "what not to build" boundary are agreed.
