import type { Result } from "@prof-bilal/atlas-shared";

/** Metadata parsed from a skill's SKILL.md frontmatter. */
export interface SkillManifest {
  readonly name: string;
  readonly description: string;
  readonly version?: string | undefined;
  readonly allowedTools?: readonly string[] | undefined;
  readonly disallowedTools?: readonly string[] | undefined;
  readonly disableModelInvocation?: boolean | undefined;
}

/** A supporting file bundled inside a skill's `references/` directory. */
export interface SkillReference {
  readonly relPath: string;
  readonly content: string;
}

/** A fully-loaded skill: metadata + body instructions + supporting files. */
export interface Skill {
  readonly id: string;
  readonly manifest: SkillManifest;
  readonly body: string;
  readonly path: string;
  readonly references: readonly SkillReference[];
}

/** Lightweight discovery record (progressive-disclosure stage 1). */
export interface DiscoveredSkill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly path: string;
  readonly version?: string | undefined;
}

/** Error kinds returned by SkillPort operations. */
export interface SkillError {
  readonly code: "not-found" | "invalid" | "io-error";
  readonly message: string;
}

/** Options for rendering a skill into a prompt-instruction block. */
export interface RenderOptions {
  readonly includeReferences?: boolean | undefined;
}

/**
 * Port for loading, validating, and rendering Agent Skills.
 * Implemented in `@prof-bilal/atlas-toolkit`, composed in `@prof-bilal/atlas-sdk`.
 */
export interface SkillPort {
  /** Lightweight discovery (stage 1): list all skills in `dir`. */
  listSkills(dir: string): readonly DiscoveredSkill[];
  /** Load the full skill (stage 2): body + references, validated. */
  loadSkill(dir: string, id: string): Result<Skill, SkillError>;
  /** Deterministic diagnostics for a skill directory. */
  validateSkill(dir: string, id: string): readonly string[];
  /** Compile a skill into a prompt-instruction block (stage 3 helper). */
  renderSkill(skill: Skill | DiscoveredSkill, options?: RenderOptions): string;
}
