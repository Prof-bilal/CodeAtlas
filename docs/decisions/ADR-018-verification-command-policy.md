# ADR-018 — Verification Command Policy

Date: 2026-08-30 · Status: Accepted (Phase 4, small-model intelligence audit)

## Context

The small-model intelligence audit found that small models hallucinate file
paths, symbol names, and code changes at a significantly higher rate than
large models. Phase 4 introduces a **verification layer** that catches
hallucinations by running deterministic claim checks (path existence, symbol
existence, plan coverage) and command runners (typecheck, tests, lint) after
the model produces an answer.

The execution plan (`docs/audit/small-model-intelligence/execution-plan.md`)
calls for a verification command policy (ADR-015 in the plan's numbering)
that governs how verification commands are spawned, validated, and sandboxed.

## Decision

1. **Per-project allow-list**: verification commands are configured in
   `.codeatlas/verify.json` at the repository root. The file is validated
   against a strict JSON schema. If absent, no commands are run (claim-only
   verification).

   Schema:
   ```json
   {
     "commands": {
       "typecheck": { "command": "npx", "args": ["tsc", "--noEmit"], "timeoutMs": 60000 },
       "tests": { "command": "npx", "args": ["vitest", "run"], "timeoutMs": 120000 },
       "lint": { "command": "npx", "args": ["eslint", "."], "timeoutMs": 60000 }
     },
     "enabled": true
   }
   ```

2. **argv-array spawn, never shell strings**: every command is spawned via
   `spawn(command, argsArray, { shell: false })`. The `command` field is
   resolved to an absolute path via `which`/`findExecutable` before spawning.
   No shell interpretation, no `$()`, no `&&` chains.

3. **Allow-list validation**: every argument is validated before spawning:
   - No leading `-` (flag injection prevention)
   - No control characters or whitespace tricks
   - No argument longer than 512 characters
   - The command itself must be in the allow-list (exact match on `command`
     field from `.codeatlas/verify.json`)

4. **Timeout enforcement**: every command has a per-invocation timeout
   (default 60s, configurable). On timeout, the process is killed with
   `SIGTERM` and the output is captured as a failure.

5. **Output capture**: stdout and stderr are captured with a 1 MiB cap per
   stream. Output beyond the cap is truncated with a `[truncated]` marker.

6. **User-visible**: every verification command is logged to stderr before
   execution so the user can see what is being run. The command and its
   arguments are printed.

7. **Claim checks first**: before running any commands, the verifier runs
   deterministic claim checks (path existence, symbol existence via SDK,
   plan coverage). These are pure, fast, and catch the majority of
   hallucinations without spawning any processes.

8. **Baseline-diff classification**: verification results are compared
   against a cached baseline of the untouched repository to distinguish
   pre-existing failures from introduced failures. Only introduced failures
   count against the model's answer quality.

## Consequences

- The verifier package (`@atlas/verifier`) is a new feature package behind
  `VerifierPort` in `@atlas/core`. It follows the existing package pattern
  (port in core, implementation in feature package, SDK composition).
- The `.codeatlas/verify.json` config is opt-in: projects that don't have it
  get claim-only verification (no command spawning).
- The spawn pattern mirrors the toolkit installer's security posture
  (`shell: false`, argv-array, allow-list, timeout, output cap).
- The baseline cache lives in `.codeatlas/verify-baseline.json` and is
  refreshed on `atlas update` or explicit `atlas verify --refresh-baseline`.
