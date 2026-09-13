// @atlas/sdk — Skills service (ADR-022)
//
// Composes the @atlas/toolkit skills loader behind SkillPort.
// Default root is process.cwd(); reads from .codeatlas/skills/ by default.

import { join } from "node:path";
import type { DiscoveredSkill, RenderOptions, Skill, SkillError, SkillPort } from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import {
  discoverSkills,
  loadSkill as rawLoadSkill,
  validateSkill as rawValidateSkill,
  renderSkillInstructions,
} from "@atlas/toolkit";

/** Sub-directory under the project root where installed skills live. */
export const SKILLS_SUBDIR = ".codeatlas/skills";

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
