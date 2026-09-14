// @atlas/toolkit — Built-in (prebuilt) workflow Skills.
//
// Canonical source of truth is the on-disk SKILL.md files under
// `src/skills/prebuilt/<id>/SKILL.md` — the same canonical format the custom
// skills loader consumes. Nothing here executes skill content; skills are pure
// instructions. This module locates the shipped files and reuses the EXISTING
// loader (`tryReadSkill`) so built-ins and custom skills share one format, one
// validation, one pipeline — no second format, no second loader.
//
// Root resolution (first existing wins) so the same code works when running
// from source, under vitest, or from a bundled app/installed package:
//   1. <module dir>/prebuilt                        (source layout)
//   2. walking up:  <dir>/skills/prebuilt           (shipped dist layout)
//   3. walking up:  <dir>/src/skills/prebuilt       (source layout from dist)
//   4. walking up:  <dir>/packages/toolkit/src/skills/prebuilt (monorepo CLI bundle)

import { statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidSkillId, tryReadSkill } from "./loader";
import type { DiscoveredSkill, Skill } from "./types";

/** The 13 shipped built-in workflow Skills (each a `prebuilt/<id>/` directory). */
export const BUILTIN_SKILL_IDS: readonly string[] = [
  "mcp-builder",
  "deep-research",
  "trail-of-bits-security-skills",
  "webapp-testing",
  "ui-check",
  "ui-research",
  "ui-build",
  "systematic-debugging",
  "verification-before-completion",
  "writing-plans",
  "executing-plans",
  "using-git-worktrees",
  "react-best-practices",
];

const MAX_WALK_UP = 8;

function isRealDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Locate the directory containing the built-in `prebuilt/<id>/SKILL.md` files.
 * Cached after the first successful lookup; falls back to the source-layout
 * path so error messages stay meaningful when nothing exists.
 */
export function prebuiltSkillRoot(): string {
  const fallback = resolve(dirname(fileURLToPath(import.meta.url)), "prebuilt");
  const here = dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let depth = 0; depth <= MAX_WALK_UP; depth += 1) {
    const candidates = [
      join(dir, "prebuilt"),
      join(dir, "skills", "prebuilt"),
      join(dir, "src", "skills", "prebuilt"),
      join(dir, "packages", "toolkit", "src", "skills", "prebuilt"),
    ];
    for (const candidate of candidates) {
      if (isRealDirectory(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir || !dir.includes(sep)) break;
    dir = parent;
  }
  return fallback;
}

/** List every built-in Skill that resolves and validates (metadata only). */
export function listBuiltinSkills(): readonly DiscoveredSkill[] {
  const discovered: DiscoveredSkill[] = [];
  for (const id of BUILTIN_SKILL_IDS) {
    const skill = loadBuiltinSkill(id);
    if (skill === null) continue;
    discovered.push({
      id: skill.id,
      name: skill.manifest.name,
      description: skill.manifest.description,
      path: skill.path,
      ...(skill.manifest.version !== undefined ? { version: skill.manifest.version } : {}),
    });
  }
  return discovered;
}

/**
 * Load one built-in Skill by id from the canonical SKILL.md file through the
 * EXISTING loader (same frontmatter rules, validation, path-safety, and
 * reference bounds as user-installed skills). Returns null when the id is
 * invalid or the file is missing/malformed.
 */
export function loadBuiltinSkill(id: string): Skill | null {
  if (!isValidSkillId(id)) return null;
  const skill = tryReadSkill(join(prebuiltSkillRoot(), id), id);
  if (skill === null) return null;
  // Hide the on-disk package location behind the stable builtin:// scheme,
  // matching the pre-existing contract for built-in skill paths.
  return { ...skill, path: `builtin://${id}` };
}

/**
 * Human-readable validation problems for one built-in Skill. Empty when valid;
 * mirrors `validateSkill` from the loader for parity with custom skills.
 */
export function validateBuiltinSkill(id: string): readonly string[] {
  if (!isValidSkillId(id)) return [`invalid skill id: "${id}"`];
  const dir = join(prebuiltSkillRoot(), id);
  const skill = tryReadSkill(dir, id);
  if (skill === null) return [`built-in skill not found or invalid: ${id}`];
  return [];
}

/** Absolute on-disk directory for one built-in skill (for diagnostics). */
export function prebuiltSkillDir(id: string): string {
  return join(prebuiltSkillRoot(), id);
}
