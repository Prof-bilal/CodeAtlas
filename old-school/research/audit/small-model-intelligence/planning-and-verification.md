# Planning and Verification

Loop: **Task Analysis → Planning → Execution → Inspection → Verification →
Correction**, with deterministic components dominating analysis and
verification, and the model dominating judgment and authorship.

## 1. Task Analysis [D-first]

- Deterministic classifier (keywords + graph signals + file-path entities).
- Model refinement only when deterministic confidence < threshold.
- Output: category, entities, initial candidate files, ambiguity flags.

## 2. Planning [D skeleton + M annotations]

The `PlannerPort` builds the skeleton deterministically:
- candidate files (search + closure),
- dependency impact set (callers/callees via `@atlas/graph`),
- tests that cover touched symbols,
- config touchpoints,
- unknowns (entities not resolvable in the index),
- verification strategy (which checks apply: typecheck/tests/lint/graph).

The model (same model by default) annotates: step ordering, risk notes, gaps
it believes exist. The skeleton is authoritative; model annotations cannot
remove deterministic facts (mitigates "incorrect plan becomes authoritative" —
see risks.md).

## 3. Execution

One plan step per model round (small models degrade on multi-step prompts).
Each round's prompt contains: objective, current step, remaining steps,
AgentState summary, relevant context slice. Tools execute server-side with
policy + dedup (existing `tool-loop.ts` machinery).

## 4. Inspection [D]

After every tool round: `ResultInspector` normalizes results, flags empty /
failed / uninformative results, updates AgentState (`files_inspected`,
`known_facts`), and generates next-step hints. Failed tool calls produce a
deterministic recovery menu (alternate queries, wider hop, different tool).

## 5. Verification [D]

`VerifierPort` checks, cheapest first:

| Check | Deterministic? | Source |
|---|---|---|
| Cited files/paths exist | yes | FS + index |
| Cited symbols exist | yes | `@atlas/search` / parser index |
| Plan files addressed | yes | diff of answer vs plan |
| Typecheck | yes (opt-in command) | project toolchain |
| Unit tests | yes (opt-in command) | project toolchain |
| Lint | yes (opt-in) | project toolchain |
| Graph consistency | yes | re-index touched files, check edges |
| Output contract | yes | schema validation |
| Semantic correctness | no | Critic (M) |

**Security constraint:** verification commands are allow-listed per project,
argv-array spawned, opt-in, user-visible, with timeouts. No repository-derived
string is ever passed to a shell (Rule 4.7 of AGENTS.md).

## 6. Critic / Reviewer pass [M, bounded]

- **Default: same-model critique** against a **deterministic checklist**:
  (a) every plan file addressed? (b) all cited paths/symbols exist?
  (c) output contract satisfied? (d) claimed verification results match actual
  runs? (e) any unverifiable claims marked as such?
- **Separate critic model**: optional (`critic.model` config), recommended for
  cheap primary models; the critic must be ≥ primary capability to add value —
  benchmark decides (see benchmark-plan.md §experiments).
- **Deterministic validation always runs first**; the critic only sees
  verification output — it never replaces it.
- Bound: ≤1 revision cycle; critic findings are advisory to the reviser but
  deterministic findings are mandatory.

## 7. Correction loop

```text
fail(deterministic) → targeted re-retrieval (deterministic, based on which
  check failed) → revise → re-verify   (≤2 iterations)
fail(critic) → revise → re-verify      (≤1 revision)
still failing → final answer marked "unverified" + failure report
```

Stopping conditions prevent infinite loops; every abort produces a
verification report rather than a silent pass.
