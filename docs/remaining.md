# CodeAtlas — Phase A (Skills) Remaining Work

> Completed audit (2026-09-13). This file records the Phase A work that was
> identified by the original scan and the implementation that closed it.

## Summary

All Phase A items are implemented: the shared Skills architecture, delivery
surfaces, security fixes, validation hardening, regression coverage, dependency
audit, and documentation updates.

## Completed

1. **Type-only `SkillPort` in `core`** — `packages/core/src/ports/skill.port.ts`
   defines and exports the skill contracts.

2. **Shared Skill loader** — `packages/toolkit/src/skills/` owns discovery,
   loading, validation, rendering, resolution, frontmatter parsing, path-safe
   IDs, bounded markdown, and bounded references.

3. **Benchmark compatibility** — `packages/benchmark/src/skills/` re-exports
   the Toolkit implementation; there is no duplicate loader.

4. **SDK composition** — `createSkillService()` implements `SkillPort` and reads
   the canonical `.codeatlas/skills/` directory. CLI and MCP use the SDK service.

5. **Benchmark task injection** — `TaskDefinition.skill` is resolved and
   injected into benchmark execution.

6. **CLI/MCP delivery** — `atlas skills list/info/validate/load` and MCP
   `list_skills`/`get_skill` are wired through the shared service.

7. **Skill installation** — `SkillAdapter` performs a path-safe shallow git
   clone into `.codeatlas/skills/<name>/`; the catalog contains the supported
   skill-installable records.

8. **Update approval bug fixed** — `packages/sdk/src/toolkit/facade.ts` now
   requires `approval?.granted === true` before running `git pull --ff-only`.
   An approval object with `granted: false` cannot authorize a skill update.

9. **Post-install validation implemented** —
   `packages/toolkit/src/installer.service.ts` calls `validateSkill()` after a
   skill clone finds `SKILL.md`. Invalid frontmatter, name mismatches, unreadable
   content, and size violations are recorded as `unverified` with diagnostic
   notes instead of `verified`.

10. **Filesystem hardening implemented** — `validateSkill()` catches read races
    between existence checking and file access and returns a diagnostic rather
    than throwing. Existing bounded/path-safe loader behavior remains intact.

11. **Regression coverage added** — Toolkit installer tests cover valid and
    invalid post-install skill content; SDK tests cover the denied-update path;
    benchmark skill tests continue to cover parsing, loading, validation, and
    resolution. Existing CLI/MCP registration and integration coverage remains
    in place.

12. **Dependency/dead-package audit documented** — `@prof-bilal/atlas-verifier` is now
    recorded in `DEPENDENCIES.md`, `MODULES.md`, `CURRENT_STATE.md`,
    `ARCHITECTURE.md`, and `FEATURE_STATUS.md`. `packages/common` remains an
    intentionally untracked source directory with no workspace package or
    imports and is not part of the build graph.

13. **Documentation freshness completed** — ADR-022 now records its accepted,
    implemented status and the two security fixes; canonical architecture and
    status documents describe the current implementation.

## Validation

- Targeted Vitest suites: 47 tests passed across Toolkit, SDK, and Benchmark.
- Type diagnostics: no diagnostics in the modified TypeScript files.
- The package-level `check` scripts were not defined for Toolkit/SDK; the root
  validation command should be used for the repository-wide check.
