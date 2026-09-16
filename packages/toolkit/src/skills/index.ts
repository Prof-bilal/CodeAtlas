// @prof-bilal/atlas-toolkit — Skills module public API
//
// Dependency-free Agent Skills loader owned by @prof-bilal/atlas-toolkit (ADR-022).
// All types and functions are re-exported for consumers.

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
  SKILL_FILENAME,
  discoverSkills,
  isValidSkillId,
  loadSkill,
  renderSkillInstructions,
  resolveSkillForTask,
  splitFrontmatter,
  tryReadSkill,
  validateSkill,
} from "./loader";
export {
  BUILTIN_SKILL_IDS,
  listBuiltinSkills,
  loadBuiltinSkill,
  prebuiltSkillDir,
  prebuiltSkillRoot,
  validateBuiltinSkill,
} from "./builtin";
