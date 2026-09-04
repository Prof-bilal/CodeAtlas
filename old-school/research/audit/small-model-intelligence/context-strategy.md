# Context Strategy — Quality First

Philosophy: **maximum useful intelligence per model interaction.** Budgets
prevent explosion; they do not force compression below the quality bar.

## 1. Retrieval strategy

Today: single lexical query → top-k → whole files (`context-builder.service.ts`).

Proposed:
- **Query decomposition** [D]: deterministic entity extraction from the task
  (file paths, symbol names, keywords); one search per entity, merged.
- **Task profile** [D]: extend `ContextTaskCategory` with per-profile policies:

| Task | Retrieve (in order) |
|---|---|
| Bug fix | implementation → direct callers/callees (1 hop) → tests of touched files → config/env refs → error handling sites |
| Feature | module architecture → similar existing features (graph neighborhoods) → interfaces/ports → models/types → tests |
| Refactor | dependency closure (2 hops) → all callers → implementations → tests |
| Explain | relevant implementation (symbol ranges) → relationships → docs/summaries |

- **Semantic retrieval** [optional later]: embedding `RelevanceScorer` in
  `@atlas/search` (the seam exists) — measured against lexical baseline, only
  kept if the benchmark proves it (Rule 8/11).

## 2. Dependency-closure expansion [D] — highest-value change

Given seed files (search hits):
1. callers + callees (1 hop; extendable to 2 with budget check).
2. tests referencing the touched symbols/files (graph `contains`/reference
   edges + filename convention `*.test.ts`).
3. config touchpoints (files matched by scanner framework signals + grep of
   imports of config modules).
4. interface/port definitions implemented by touched classes.

Each expanded file is annotated: `reason: "caller of authenticate()"`.
Annotation is what a small model cannot derive itself.

## 3. Context hierarchy

```text
Repository → Project digest (repo memory)
  → Module header (purpose, exports)          [Supporting]
  → File: symbol outline + doc comments       [Important]
  → File: relevant line RANGES (not whole)    [Critical]
  → Relationship annotations between items    [Critical]
  → Tests for touched files (outline + key cases) [Important]
  → Config/instructions (AGENTS.md, manifest) [Supporting]
```

Tiers: **Critical** (files to change + their direct contracts), **Important**
(callers/callees/tests), **Supporting** (summaries, config, instructions),
**Optional** (nice-to-have). Budgets are consumed top-tier-first; optional is
dropped only when over budget. Budgets are generous by default (quality first).

## 4. Context ordering

Render order = reading order for the model:
1. Task + classification + plan
2. Project digest (short)
3. Critical files (ranges, annotated)
4. Relationships map (who calls whom)
5. Important context (tests, related files)
6. Supporting (summaries, instructions)
7. Sufficiency note + next-step hints

## 5. Summaries vs raw code

- Raw code: for Critical tier files (must be exact, version-checked via
  existing hashing/`expectedHash` machinery).
- Summaries: for Important/Supporting breadth (module/folder purpose).
- AI summaries remain opt-in and cached (`summary.service.ts` pattern).
- Hierarchy beats both: outline → range → whole file only when truly needed.

## 6. Context expansion loop (interactive)

Trigger [D]: sufficiency gate fails, or model emits structured
`need_context: {what, why}` (bounded N≤2 expansions).
Deterministic response: profile-guided closure around the referenced files —
not another blind search.

## 7. Context sufficiency gate [D]

Insufficient when ANY of:
- plan references files/symbols not in the index (and not genuinely new);
- no search hit above a calibrated min-score for the primary entity;
- critical tier empty for a code-modification task;
- graph closed over 0 dependencies for a multi-file task (suspicious).

On insufficient: auto-run one deterministic expansion, then one guided model
request for gaps; only then allow answering. If still insufficient, the system
says so explicitly in the answer header — never silently answers from nothing.

## 8. Token quality ratio

Target metric: `useful tokens / total tokens`, where usefulness is measured
by the benchmark (did the file/symbol/range end up used in a correct answer —
proxied by plan/answer citations and verification success). Report it per task
profile in benchmarks. When large context wins (small repos, whole-feature
tasks), spend it — but measure the ratio to detect noise.

## 9. Repeated context & caching

Repo memory and file outlines are cached by content hash (existing
`summary.service.ts`/`briefing.ts` pattern) — re-sending stable context costs
nothing on cached providers and is fine even uncached. Do not dedupe context
that serves a different tier/purpose.
