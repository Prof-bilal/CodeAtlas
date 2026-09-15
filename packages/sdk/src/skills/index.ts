// @prof-bilal/atlas-sdk — Skills service (ADR-022)
//
// Composes the @prof-bilal/atlas-toolkit skills loader behind SkillPort.
// Default root is process.cwd(); reads from .codeatlas/skills/ by default.

import { join } from "node:path";
import type { DiscoveredSkill, RenderOptions, Skill, SkillError, SkillPort } from "@prof-bilal/atlas-core";
import { type Result, fail, ok } from "@prof-bilal/atlas-shared";
import {
  discoverSkills,
  listBuiltinSkills,
  loadBuiltinSkill,
  loadSkill as rawLoadSkill,
  validateSkill as rawValidateSkill,
  renderSkillInstructions,
  resolveSkillForTask,
  validateBuiltinSkill,
} from "@prof-bilal/atlas-toolkit";
import { addCustomSkill, createCustomSkill } from "./authoring";
import { SKILLS_SUBDIR } from "./constants";

/**
 * Resolve one or more skills into a single prompt-instruction block for
 * launch-time injection (ADR-022 ch.5).
 *
 * Resolution order per id: project custom Skills (`.codeatlas/skills/`)
 * first, then first-party built-ins. An id that resolves to neither is a
 * hard error — launch never silently proceeds without a requested skill.
 */
export interface ResolveSkillsOptions {
  /** Project root used to locate `.codeatlas/skills/` (defaults to cwd). */
  readonly root?: string | undefined;
  /** Pre-composed SkillPort (defaults to `createSkillService({ root })`). */
  readonly skills?: SkillPort | undefined;
  /** Include skill `references/` material in the rendered block. */
  readonly includeReferences?: boolean | undefined;
}

export interface ResolvedSkillBlock {
  /** Ids in the order they were requested and rendered. */
  readonly ids: readonly string[];
  /** The compiled instruction block (empty when `ids` is empty). */
  readonly instructions: string;
}

/**
 * Render one skill id (custom → built-in) through the existing SkillPort.
 * Returns a typed error message when the id matches no skill.
 */
export function resolveSkillInstructions(
  id: string,
  options: ResolveSkillsOptions = {},
): Result<ResolvedSkillBlock, Error> {
  if (typeof id !== "string" || id.trim() === "") {
    return fail(new Error("Skill id must be a non-empty string."));
  }
  const service = options.skills ?? createSkillService({ root: options.root });
  const skillsDir = join(options.root ?? process.cwd(), SKILLS_SUBDIR);

  // 1. Project custom skills take precedence over built-ins with the same id.
  const custom = service.loadSkill(skillsDir, id);
  if (custom.ok) {
    return ok({
      ids: [id],
      instructions: service.renderSkill(custom.value, {
        ...(options.includeReferences === undefined
          ? {}
          : { includeReferences: options.includeReferences }),
      }),
    });
  }

  // 2. First-party built-ins ship as canonical SKILL.md files.
  const builtin = loadBuiltinSkill(id);
  if (builtin !== null) {
    return ok({
      ids: [id],
      instructions: service.renderSkill(builtin, {
        ...(options.includeReferences === undefined
          ? {}
          : { includeReferences: options.includeReferences }),
      }),
    });
  }

  const known = [
    ...service.listSkills(skillsDir).map((s) => s.id),
    ...listBuiltinSkills().map((s) => s.id),
  ];
  return fail(
    new Error(
      `Skill "${id}" not found in project skills or built-ins. Available: ${known.length > 0 ? known.join(", ") : "(none)"}.`,
    ),
  );
}

/**
 * Resolve multiple skill ids into one combined instruction block. Duplicates
 * are removed while preserving first-request order. Fails on the first
 * unresolvable id so callers can abort before launching a session.
 */
export function resolveSkillsInstructions(
  ids: readonly string[],
  options: ResolveSkillsOptions = {},
): Result<ResolvedSkillBlock, Error> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    return ok({ ids: [], instructions: "" });
  }
  const parts: string[] = [];
  for (const id of unique) {
    const resolved = resolveSkillInstructions(id, options);
    if (!resolved.ok) return resolved;
    parts.push(resolved.value.instructions);
  }
  return ok({ ids: unique, instructions: parts.join("\n\n") });
}

/** A provenance-tagged skill available for recommendation/injection. */
export interface AvailableSkill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly path: string;
  readonly version?: string | undefined;
  readonly source: "custom" | "builtin";
}

/** One deterministic skill suggestion. */
export interface SkillRecommendation {
  readonly id: string;
  readonly description: string;
  readonly source: "custom" | "builtin";
}

/**
 * Merge project custom skills (`.codeatlas/skills/`) with first-party
 * built-ins into one provenance-tagged pool. A custom skill with the same id
 * as a built-in overrides it (project-owned precedence, matching resolution).
 */
export function availableSkills(root: string): readonly AvailableSkill[] {
  const service = createSkillService({ root });
  const skillsDir = join(root, SKILLS_SUBDIR);
  const custom = service.listSkills(skillsDir).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    path: s.path,
    ...(s.version !== undefined ? { version: s.version } : {}),
    source: "custom" as const,
  }));
  const customIds = new Set(custom.map((s) => s.id));
  const builtin = listBuiltinSkills()
    .filter((s) => !customIds.has(s.id))
    .map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      path: s.path,
      ...(s.version !== undefined ? { version: s.version } : {}),
      source: "builtin" as const,
    }));
  return [...custom, ...builtin].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Minimum significant-term overlaps between task and description before a
 * skill is recommended. One shared word ("before", "implement") is too weak
 * a signal; two signal a genuine workflow match.
 */
const MIN_RECOMMEND_TERMS = 2;

/**
 * Deterministic skill recommendation: score the task against every available
 * skill's description with the loader's term-overlap scorer
 * (`resolveSkillForTask`), then keep the best match only when it shares at
 * least {@link MIN_RECOMMEND_TERMS} significant terms with the task. At most
 * one suggestion; no AI, no invented confidence. Skills whose ids appear in
 * `exclude` (already injected) are never recommended.
 */
export function recommendSkillsForTask(
  task: string,
  options: ResolveSkillsOptions & { readonly exclude?: readonly string[] } = {},
): readonly SkillRecommendation[] {
  const root = options.root ?? process.cwd();
  const candidates = availableSkills(root).filter(
    (s) => options.exclude === undefined || !options.exclude.includes(s.id),
  );
  if (candidates.length === 0) return [];
  const scored = resolveSkillForTask(
    candidates.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      path: s.path,
      ...(s.version !== undefined ? { version: s.version } : {}),
    })),
    { prompt: task },
  );
  if (scored.skill === null || scored.reason === "none") return [];
  const matched = candidates.find((s) => s.id === scored.skill?.id);
  if (matched === undefined) return [];
  if (sharedTermCount(task, matched.description) < MIN_RECOMMEND_TERMS) return [];
  return [{ id: matched.id, description: matched.description, source: matched.source }];
}

/**
 * Count distinct significant terms (same shape as the loader's scorer:
 * alphanumeric runs of 4+ characters, lowercased) present in both texts.
 */
function sharedTermCount(a: string, b: string): number {
  const terms = new Set<string>();
  for (const match of a.toLowerCase().matchAll(/[a-z0-9][a-z0-9_-]{3,}/g)) {
    terms.add(match[0]);
  }
  if (terms.size === 0) return 0;
  const lowerB = b.toLowerCase();
  let count = 0;
  for (const term of terms) {
    if (lowerB.includes(term)) count += 1;
  }
  return count;
}

/** List the first-party workflow Skills shipped with CodeAtlas. */
export { listBuiltinSkills, loadBuiltinSkill, validateBuiltinSkill };
export { addCustomSkill, createCustomSkill };
export type {
  AddCustomSkillOptions,
  CreateCustomSkillOptions,
  CustomSkillWriteResult,
} from "./authoring";
export { SKILLS_SUBDIR };

export interface CreateSkillServiceOptions {
  /** Project root directory. Defaults to `process.cwd()`. */
  readonly root?: string | undefined;
}

/**
 * Create a SkillPort implementation backed by the toolkit skills loader.
 * Reads skills from `<root>/.codeatlas/skills/` by default.
 */
export function createSkillService(options: CreateSkillServiceOptions = {}): SkillPort {
  const root = options.root ?? process.cwd();

  return {
    listSkills(dir?: string): readonly DiscoveredSkill[] {
      const target = dir ?? join(root, SKILLS_SUBDIR);
      return discoverSkills(target) as DiscoveredSkill[];
    },

    loadSkill(dir: string, id: string): Result<Skill, SkillError> {
      const skill = rawLoadSkill(dir, id);
      if (skill === null) {
        return fail({ code: "not-found" as const, message: `Skill "${id}" not found in ${dir}` });
      }
      return ok(skill as Skill);
    },

    validateSkill(dir: string, id: string): readonly string[] {
      return rawValidateSkill(dir, id);
    },

    renderSkill(skill: Skill | DiscoveredSkill, opts?: RenderOptions): string {
      // The toolkit's renderSkillInstructions uses the same optional shape; cast
      // to bridge the exactOptionalPropertyTypes difference between packages.
      return renderSkillInstructions(
        skill as Parameters<typeof renderSkillInstructions>[0],
        opts as Parameters<typeof renderSkillInstructions>[1],
      );
    },
  };
}
