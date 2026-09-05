// @atlas/benchmark — Skills (minimal Agent Skills implementation)
//
// A minimal, dependency-free implementation of the open "Agent Skills" pattern
// (a folder with a SKILL.md that carries frontmatter metadata + markdown
// instructions, optionally with supporting `references/` files). Purpose: let a
// benchmark give a coding agent a reusable, task-specific skill so we can
// measure WITH-SKILL vs WITHOUT-SKILL outcomes (benchmark Config C vs D).
//
// Nothing here executes skill content — skills are pure instructions plus
// inert reference material. Loading is size-bounded and path-safe.

/** Metadata parsed from a skill's SKILL.md frontmatter. */
export interface SkillManifest {
  /** Unique, path-safe skill identifier (must equal the directory name). */
  readonly name: string;
  /** Short description the agent uses to decide when the skill applies. */
  readonly description: string;
  /** Semantic version string (e.g. "1.0.0"). Optional. */
  readonly version?: string | undefined;
  /** Tool names this skill may lean on (advisory, never grants nothing). */
  readonly allowedTools?: readonly string[] | undefined;
  /** Tool names the skill advises the agent to avoid. Advisory. */
  readonly disallowedTools?: readonly string[] | undefined;
  /**
   * If true the skill is intended to be invoked explicitly by the user rather
   * than auto-activated by the model. Advisory — the benchmark harness still
   * injects it for configured tasks.
   */
  readonly disableModelInvocation?: boolean | undefined;
}

/** A supporting file bundled inside a skill's `references/` directory. */
export interface SkillReference {
  /** Repository-of-the-skill-relative path, e.g. "references/checklist.md". */
  readonly relPath: string;
  /** Raw text content, size-bounded at load time. */
  readonly content: string;
}

/** A fully-loaded skill: metadata + body instructions + supporting files. */
export interface Skill {
  /** Normalized identifier, always equal to `manifest.name`. */
  readonly id: string;
  /** Parsed frontmatter metadata. Always present: name + description. */
  readonly manifest: SkillManifest;
  /** Raw markdown instruction body from SKILL.md (after frontmatter). */
  readonly body: string;
  /** Absolute path of the skill directory on disk. */
  readonly path: string;
  /** Bundled supporting files under `references/`. May be empty. */
  readonly references: readonly SkillReference[];
}

/**
 * Lightweight discovery record (Agent Skills progressive-disclosure stage 1):
 * only enough metadata to know a skill exists and when it might apply.
 */
export interface DiscoveredSkill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly path: string;
  readonly version?: string | undefined;
}

/** Outcome of resolving which skill (if any) applies to a task. */
export interface SkillResolution {
  /**
   * The resolved skill, or null when no applicable skill was found. May be a
   * fully-loaded `Skill` or a lightweight `DiscoveredSkill` (metadata only) —
   * call `renderSkillInstructions` to compile the instruction block and, when
   * an agent needs the full body, `loadSkill` by `id` first.
   */
  readonly skill: Skill | DiscoveredSkill | null;
  /**
   * The compiled instruction block to prepend to the agent prompt. Empty when
   * no skill matched. For a matching `DiscoveredSkill` this is metadata plus a
   * note to load the full body; for a loaded `Skill` it is the full body.
   */
  readonly renderedInstructions: string;
  /** Whether the matched record is fully loaded. */
  readonly loaded: boolean;
  /** Why this resolution was reached. */
  readonly reason: "name-match" | "description-match" | "none";
}
