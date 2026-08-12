# ADR-010: Offline security assessment and trust-gated installation

- **Status:** Accepted
- **Date:** 2026-08-12
- **Scope:** `@atlas/core`, `@atlas/toolkit`, `@atlas/sdk`

## Decision

Task 24 adds `SecurityPort` in `@atlas/core` and a pure, offline
`SecurityAssessor` in `@atlas/toolkit`. The assessor evaluates metadata and
manifest-derived inputs with per-check verdicts, an overall risk level, and
exactly five trust states: `verified`, `reviewed`, `community`, `unverified`,
and `blocked`.

The default is `unverified`. Only a documented human checklist can promote a
tool to `reviewed` or `verified`; a failing security check maps to `blocked`.
The installer consumes the port result as a hard gate. An unverified tool needs
explicit install consent, while a blocked tool cannot be overridden.

## Security boundary

The assessor performs no network access, process execution, manifest-triggered
code execution, or repository writes. Command metadata is validated as data;
the installer continues to use argument-array spawns with `shell: false`.

## Consequences

- Security policy is injectable and unit-testable without credentials/network.
- Registry and manifest content remains untrusted even after schema validation.
- The broader CLI can render the assessment later without duplicating policy.
