# ADR-022 — Unified Skills Architecture (SkillPort, Toolkit Extraction, Delivery Channels)

Date: 2026-09-12 · Status: Accepted and implemented

> **Note (2026-09-16):** the benchmark package this ADR extracted the loader
> from (`packages/benchmark/src/skills/`) was later removed from the
> repository — see [ADR-023](./ADR-023-remove-browser-and-benchmark-subsystems.md).
> The Skills architecture defined here is unchanged; the loader lives in
> `@prof-bilal/atlas-toolkit` and is the single Skills implementation.

> Source: the 2026-09-12 engineering architecture audit (audit-only, cited
> findings below were verified against code on that date).

## Context

Two unconnected "skill" concepts exist in the codebase today:

1. **Skills as installable artifacts** (Toolkit, Tasks 19–24):
   `ToolInstallMethodType` includes `"skill"`
   (`packages/core/src/ports/tool-registry.port.ts:100`); `SkillAdapter`
   shallow-git-clones skill repos into `<root>/.codeatlas/skills/<name>/`
   (`packages/toolkit/src/installer-adapters.ts`, `SkillAdapter`); the shipped
   catalog contains 47 skill-installable records
   (`packages/toolkit/src/catalog.json`); Tool Manifests record the install
   (`.codeatlas/tools/<name>.json`). After installation, the Toolkit validates the cloned `SKILL.md` before recording
   verification; the SDK, CLI, MCP, and benchmark surfaces load/render skills through
   the shared loader and port.

2. **Skills as a content format** (Benchmark):
   `packages/benchmark/src/skills/` implements the open **Agent Skills**
   pattern (`SKILL.md` + frontmatter + `references/`) with a dependency-free,
   size-bounded, path-safe loader (`loader.ts`: `discoverSkills`, `loadSkill`,
   `tryReadSkill`, `renderSkillInstructions`, `validateSkill`,
   `resolveSkillForTask`). It is exported from `@prof-bilal/atlas-benchmark` but has
   **zero production consumers** — grep finds `discoverSkills`/`loadSkill`
   usage only in its own module, its re-exports, and its tests. Benchmark task
   JSON carries `"skill": "backend-api"`
   (`benchmarks/2026-09-fresh/tasks/backend.json:13`), but `TaskDefinition`
   (`packages/core/src/ports/benchmark.port.ts`) has no `skill` field and
   `BenchmarkService.runTask` passes only `task.prompt` to runners — the
   with-skill vs without-skill measurement (Config C vs D) is not wired.

Two additional audit findings force the security posture of this decision:

- **Approval bypass (fixed):** `ToolkitSDK.update()` requires
  `approval?.granted === true` before running `git pull --ff-only` on an
  installed skill.
- **Post-install content validation (fixed):** skill installs validate the
  installed `SKILL.md` frontmatter and size bounds; invalid content is recorded
  as `unverified`, not `verified`.

Finally, the format question: a future production Skills layer must not fork
the Agent Skills format the benchmark already implements, and must not create
a second registry, a new config system, or a new package family.

## Decision

1. **One canonical format** — the open **Agent Skills** pattern already
   implemented in `packages/benchmark/src/skills/` (`SKILL.md`, path-safe id,
   frontmatter `name`/`description`/`version`/`allowed-tools`/
   `disallowed-tools`/`disable-model-invocation`, bounded `references/`).
   No alternative format is introduced.

2. **A new type-only port in `core`** — `packages/core/src/ports/skill.port.ts`:

   ```ts
   interface SkillPort {
     /** Lightweight discovery records (progressive-disclosure stage 1). */
     listSkills(root?: string): readonly DiscoveredSkill[];
     /** Load the full skill (stage 2): body + bounded references, validated. */
     loadSkill(root: string, id: string): Result<Skill, SkillError>;
     /** Deterministic diagnostics for a skill directory. */
     validateSkill(root: string, id: string): readonly string[];
     /** Compile a skill into a prompt-instruction block (stage 3 helper). */
     renderSkill(skill: Skill | DiscoveredSkill, options?: RenderOptions): string;
   }
   ```

   Matching (which skill applies to a task) is **not** part of the port.
   Resolution policy is caller-owned: the benchmark harness keeps its lexical
   `resolveSkillForTask` as a harness tool; production consumers use explicit
   selection (`--skill <id>`, task fields, CLI flags). Auto-activation by
   content matching may be added later behind an explicit opt-in, never as a
   default.

3. **Implementation moves to `@prof-bilal/atlas-toolkit`** — skills are already Toolkit
   artifacts (installed by `SkillAdapter`, recorded in Tool Manifests, covered
   by Compatibility/Security gates). The loader core (`types.ts` + the pure
   functions in `loader.ts`) is extracted from `packages/benchmark/src/skills/`
   into `packages/toolkit/src/skills/`. `@prof-bilal/atlas-benchmark` **re-exports** the
   moved API so existing imports and `benchmarks/2026-09-fresh` fixtures keep
   working. No new package is created (see Alternatives).

4. **The SDK composes it** — `createSkillService()` in `@prof-bilal/atlas-sdk`
   (`packages/sdk/src/skills/`), defaulting to `root = cwd` and reading only
   `.codeatlas/skills/` through the port. Consumers (CLI, MCP, benchmark,
   server) never read skill files directly — the same discipline that holds
   for context (`createContextSDK`) and tools (`createToolkitSDK`).

5. **Delivery channels (in priority order):**
   - **Launch-time injection (primary):** `ContextIntegration.launch()` /
     `buildPackage()` prepend the rendered skill block to the prompt, as a
     dedicated `instructions`-tier item (`ContextItemKind` already supports
     instruction-tier content) marked with skill provenance. Delivered through
     the existing `SessionPort` — no new delivery mechanism.
   - **MCP tools (secondary, additive):** `list_skills` and `get_skill`
     following the declarative `TOOLS` pattern in `packages/mcp/src/tools.ts`
     (+ `PROTOCOL_TOOL_NAMES`). Via `tool-bridge.ts` they automatically become
     available to the Ollama tool loop (`ContextToolSource`). Progressive
     disclosure is preserved: `list_skills` returns metadata only; `get_skill`
     returns the full body + references, size-bounded.
   - **Not resources/prompts:** no MCP resource or prompt registration for
     skills now — no resource/prompt machinery exists in the server and no
     client consumes it; revisit only when a concrete client appears.

6. **Security rules (fail-closed, non-negotiable):**
   - **Post-install validation is mandatory.** After `SkillAdapter` clone,
     run the loader's validation (frontmatter, name↔directory match, size
     bounds) before recording the Tool Manifest; a failing skill is reported
     honestly and marked `unverified` in the manifest.
   - **Skill updates require explicit approval.** The `git pull --ff-only`
     path in `ToolkitSDK.update()` moves behind the same `InstallApproval`
     gate as ecosystem re-installs (shows repo URL, current ref, and outcome
     before `--yes`). This closes the audit's HIGH finding.
   - **Skills are untrusted content.** Rendered skill blocks are labeled with
     their origin (registry record name + `trust`/`security` snapshot) and are
     never executed — the loader reads files, nothing more. `docs/reference/SECURITY.md`
     gains a Skills section documenting the prompt-injection surface.
   - **Tool Manifest extension (additive, schema v2):** per-skill policy
     fields (e.g. `skill: { format: "agent-skills", validatedAt,
     referencesBytes }`). Unknown fields are already preserved; no new config
     file format is introduced.

7. **Benchmark wiring** — `TaskDefinition` gains an optional
   `skill?: string` (additive; existing task JSON already carries the field);
   `BenchmarkService.runTask` resolves the named skill through the SDK
   service and prepends `renderSkill()` output to `RunnerRequest.prompt`.
   The seed corpus stays in `benchmarks/2026-09-fresh/skills/`. This is the
   first measured consumer and keeps Config C/D honest.

## Alternatives

- **New `@prof-bilal/atlas-skills` package.** Rejected: the loader is a small pure
  module with no independent persistence/providers, exactly the situation
  ADR-016 rejected a package for. Toolkit already owns the install/configure/
  trust lifecycle; splitting content handling from artifact handling would
  put one feature across two packages for no dependency reason. Revisit only
  if the module grows parsing/registry complexity beyond toolkit's scope.
- **Implementation inside `@prof-bilal/atlas-sdk` only** (ADR-016-style placement).
  Rejected: unlike the planning layer (pure functions over SDK data), skills
  are Toolkit-managed artifacts with manifests and a security lifecycle that
  already live in `@prof-bilal/atlas-toolkit`; hosting the loader beside them keeps the
  artifact story in one package and avoids SDK growing another subsystem.
- **Custom CodeAtlas skill format** (JSON/YAML schema richer than
  frontmatter). Rejected: forks the open Agent Skills pattern the ecosystem
  and the benchmark already use; the frontmatter subset is sufficient and
  dependency-free.
- **Skills as MCP resources/prompts.** Rejected for now (see Decision 5).
- **A skill execution engine.** Rejected outright: skills are inert
  instructions; executing their content would create a threat model the
  project does not want (the verifier's allow-listed command runners remain
  the only sanctioned execution path, per ADR-018).
- **Second registry for skills.** Rejected: `ToolRegistryPort` records already
  carry skill install methods with per-field provenance; a parallel registry
  would duplicate curation, trust, and overlay logic.

## Consequences

- `@prof-bilal/atlas-toolkit` gains `skills/` (loader) — still imports only
  `core` + `shared`; the ESLint dependency matrix is unchanged. `@prof-bilal/atlas-core`
  gains one type-only port. `@prof-bilal/atlas-sdk` gains `createSkillService()` (it
  already imports `@prof-bilal/atlas-toolkit`).
- `@prof-bilal/atlas-benchmark` keeps its public re-exports — no consumer break; its
  private resolution heuristic stays harness-only.
- Additive CLI surface later (`atlas skills list/info/load/apply`) through
  `@prof-bilal/atlas-sdk` only; nothing existing changes.
- Security posture improves: the update-approval gap is closed, installed
  skills become validated content, and the untrusted-content model is
  documented.
- MCP protocol surface grows by two additive tools (contract tests extend
  `PROTOCOL_TOOL_NAMES`); the 8+4 legacy surface is untouched.
- Token-efficiency note: skills must not become always-on prompt weight —
  launch-time injection and explicit selection keep them per-task. The
  benchmark's Config C/D measurement is the gate for any default-on behavior.
- **External validation (2026-09-13):** Microsoft's Playwright team now ships
  `playwright-cli` with an explicit **CLI + Skills** model for coding agents,
  stating that "coding agents increasingly favor CLI-based workflows exposed
  as SKILLs over MCP because CLI invocations are more token-efficient"
  (playwright.dev/docs/getting-started-cli; github.com/microsoft/playwright-mcp
  README, "Playwright MCP vs Playwright CLI"). This independently confirms this
  ADR's two central choices: skills as the primary instruction-distribution
  mechanism, and CLI capability commands over wide MCP tool surfaces. It also
  informs the capability roadmap in `docs/archive/UPGRADE-RESEARCH.md`: **browser/visual
  capabilities should enter CodeAtlas as curated Toolkit tools + Skills, not
  as a first-party MCP surface**.

## Amendment 1 — 2026-09-13: research validation & capability-layer scope

The product/technical research pass (2026-09-13, summarized in `docs/archive/UPGRADE-RESEARCH.md`)
validates this ADR and bounds its scope:

1. **Format & delivery validated by ecosystem convergence.** Playwright
   (`playwright-cli install --skills`), Anthropic (Agent Skills), and the
   Claude/OpenCode skill ecosystems have converged on the same shape this ADR
   selects: `SKILL.md` + frontmatter, progressive disclosure, explicit
   selection, CLI-first delivery. No format changes.
2. **Skills are the instruction tier of a larger capability story.** Skills
   alone do not make workflows powerful — the research identifies missing
   *capabilities* (browser control, API exercise, tracing) that skills should
   orchestrate. Capability primitives enter via the **existing Toolkit
   pipeline** (registry → compatibility → security → approval → install →
   manifest) or as SDK-composed ports; they do **not** create a new framework.
   See `docs/archive/UPGRADE-RESEARCH.md` §Capability Map and §Roadmap.
3. **Nothing in this amendment changes the port, placement, or security
   clauses above.** The browser/API capability work is additive and tracked in
   `docs/archive/UPGRADE-RESEARCH.md`'s P0–P2 roadmap, not here.

## Follow-ups (tracked, not part of this decision)

1. P1: extend `docs/architecture/CONTEXT_STORAGE.md` (`.codeatlas/skills/`, `slices/`) and
   `docs/FEATURE_STATUS.md` rows.
2. P1: audit-finding cleanup adjacent to this ADR — `@prof-bilal/atlas-verifier`
   missing from the ESLint `ALL_PACKAGES`/matrix, unused `@prof-bilal/atlas-storage`
   dependency in `packages/verifier`, orphan `packages/common`.
3. P2: deduplicate `estimateTokens` copies (`@prof-bilal/atlas-shared` canonical,
   `@prof-bilal/atlas-usage` re-export, benchmark private copy).
