// Copies the canonical prebuilt Skills tree into a build output directory.
//
// Usage (from a package directory): node ../../scripts/copy-prebuilt-skills.mjs dist/skills/prebuilt
//
// Why: `packages/toolkit/src/skills/prebuilt/<id>/SKILL.md` is the single
// source of truth for built-in Skills, and packages ship only `files:
// ["dist"]`. Bundled consumers (toolkit itself, apps/cli) therefore copy the
// tree next to their bundle so `prebuiltSkillRoot()` resolves at runtime.

import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const source = resolve(repoRoot, "packages/toolkit/src/skills/prebuilt");
const destination = resolve(process.argv[2] ?? ".");

mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
