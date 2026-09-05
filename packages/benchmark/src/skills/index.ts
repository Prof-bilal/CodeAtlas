// @atlas/benchmark — Skills (minimal Agent Skills implementation).
//
// Export surface for the benchmark Skills capability: discovery, loading,
// validation, rendering, and task→skill resolution against the open Agent
// Skills format.

export type {
  DiscoveredSkill,
  Skill,
  SkillManifest,
  SkillReference,
  SkillResolution,
} from "./types";
export {
  MAX_SKILL_MARKDOWN_BYTES,
  MAX_SKILL_REFERENCE_BYTES,
  MAX_REFERENCE_FILES,
  discoverSkills,
  isValidSkillId,
  loadSkill,
  renderSkillInstructions,
  resolveSkillForTask,
  splitFrontmatter,
  tryReadSkill,
  validateSkill,
  SKILL_FILENAME,
} from "./loader";
