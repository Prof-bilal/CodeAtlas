# Architecture Decision Records

This directory records **major** architectural decisions using lightweight
Architecture Decision Records (ADRs). Trivial or reversible choices do **not**
get ADRs — keep the signal high.

## Format

```markdown
# ADR-<NNN>: <Decision title>

Status:     <Proposed | Accepted | Deprecated>
Date:       <YYYY-MM-DD>

Context:       — the forces / facts leading to the decision
Decision:      — what was decided
Alternatives:  — options considered and why they lost
Consequences:  — expected positive & negative effects, follow-ups
```

## Reading them

Start here for an overview, then open the numbered files. Each ADR may
supersede/update earlier ones (mark old ones `Deprecated`).

## Project layout

```text
README.md        ← this index
ADR-001.md       ...
ADR-002.md       ...
```

## Index

| ADR | Decision | Status | Date |
| --- | -------- | ------ | ---- |
| [ADR-001](./ADR-001.md) | `@prof-bilal/atlas-context` is a deterministic rank-and-assemble step behind `ContextBuilderPort` | Accepted (retroactive) | 2026-08-08 |
| [ADR-002](./ADR-002.md) | Orchestrate existing AI CLIs; do not reimplement their internals | Proposed | 2026-08-08 |
| [ADR-003](./ADR-003.md) | Search is a dedicated `@prof-bilal/atlas-search` module behind `SearchPort` (fuzzy + vector-ready scorer seam) | Accepted | 2026-08-08 |
| [ADR-004](./ADR-004.md) | MCP is a dedicated `@prof-bilal/atlas-mcp` package consuming the SDK, built on the official `@modelcontextprotocol/sdk`, deterministic-first tools | Accepted | 2026-08-08 |
| [ADR-005](./ADR-005.md) | The Context API/SDK is a read-first façade inside `@prof-bilal/atlas-sdk` (`createContextSDK`), hiding the database behind repositories; `@prof-bilal/atlas-context`'s deterministic ranker preserved behind its port | Accepted | 2026-08-09 |
| [ADR-006](./ADR-006.md) | Agent Toolkit is a curated, opt-in registry/installer/configurator for open-source tools — never blind `install.sh`, never fork/bundle third-party tools; ports in `core`, composed by SDK | Accepted | 2026-08-10 |
| [ADR-007](./ADR-007.md) | Agent Session Manager: `SessionPort` in `core`, implemented in `@prof-bilal/atlas-agents` (`SessionManager`), composed by the SDK (`createSessionManager`); in-memory, terminal sessions pruned | Accepted | 2026-08-10 |
| [ADR-008](./ADR-008.md) | Context → Agent integration lives inside `@prof-bilal/atlas-sdk` as a `context-integration` module (`createContextIntegration`, context packages delivered through `SessionPort`) | Accepted | 2026-08-11 |
| [ADR-009](./ADR-009.md) | Usage & Credits as a dedicated `@prof-bilal/atlas-usage` feature package behind `UsagePort` (tri-state actual/estimated/unknown provenance, `PricingSource` abstraction, budgets/limits, `atlas usage`) | Accepted | 2026-08-11 |
| [ADR-010](./ADR-010-security-trust-assessment.md) | Offline security assessment and trust-gated installation | Accepted | 2026-08-12 |
| [ADR-022](./ADR-022-skills-architecture.md) | Unified Skills: one Agent Skills format; `SkillPort` in `core`, loader extracted into `@prof-bilal/atlas-toolkit`, composed by the SDK (`createSkillService`); launch-time injection primary, additive MCP tools secondary; validated + approval-gated install/update | Proposed | 2026-09-12 |

---

*If you find yourself writing an ADR for a trivial detail, stop; write it in the
PR description instead.*
