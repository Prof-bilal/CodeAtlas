import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { type Result, fail, ok } from "@prof-bilal/atlas-shared";
import { type Skill, isValidSkillId, loadSkill, tryReadSkill } from "@prof-bilal/atlas-toolkit";
import { SKILLS_SUBDIR } from "./constants";

export interface CreateCustomSkillOptions {
  readonly root?: string;
  readonly id: string;
  readonly description: string;
  readonly force?: boolean;
}

export interface AddCustomSkillOptions {
  readonly root?: string;
  readonly sourceDir: string;
  readonly id?: string;
  readonly force?: boolean;
}

export interface CustomSkillWriteResult {
  readonly skill: Skill;
  readonly path: string;
  readonly created: boolean;
}

export async function createCustomSkill(
  options: CreateCustomSkillOptions,
): Promise<Result<CustomSkillWriteResult>> {
  const id = options.id.trim();
  const description = options.description.trim();
  if (!isValidSkillId(id)) return fail(new Error(`Invalid Skill id: "${options.id}".`));
  if (description.length === 0) return fail(new Error("Skill description must not be empty."));

  const root = options.root ?? process.cwd();
  const destination = join(root, SKILLS_SUBDIR, id);
  const prepared = await prepareDestination(destination, options.force === true);
  if (!prepared.ok) return prepared;

  const markdown = `---\nname: ${id}\ndescription: ${description}\nversion: 1.0.0\n---\n\n# ${id}\n\n## Workflow\n\n1. Understand the task and inspect the relevant repository context.\n2. Make the smallest safe change that satisfies the request.\n3. Verify the result with focused tests and report evidence.\n`;
  try {
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, "SKILL.md"), markdown, "utf8");
  } catch (error) {
    return fail(new Error(`Unable to create Skill "${id}": ${String(error)}`));
  }
  return readWrittenSkill(destination, id, true);
}

export async function addCustomSkill(
  options: AddCustomSkillOptions,
): Promise<Result<CustomSkillWriteResult>> {
  const sourceDir = options.sourceDir;
  const sourceId = options.id?.trim() || basename(sourceDir);
  if (!isValidSkillId(sourceId)) return fail(new Error(`Invalid Skill id: "${sourceId}".`));

  const sourceSkill = tryReadSkill(sourceDir, sourceId);
  if (sourceSkill === null) {
    return fail(
      new Error(`Source Skill is invalid: expected a valid ${join(sourceDir, "SKILL.md")}.`),
    );
  }
  const root = options.root ?? process.cwd();
  const destination = join(root, SKILLS_SUBDIR, sourceId);
  const prepared = await prepareDestination(destination, options.force === true);
  if (!prepared.ok) return prepared;

  try {
    await mkdir(join(destination, "references"), { recursive: sourceSkill.references.length > 0 });
    await writeFile(join(destination, "SKILL.md"), renderSourceMarkdown(sourceSkill), "utf8");
    for (const reference of sourceSkill.references) {
      const target = join(destination, "references", reference.relPath);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, reference.content, "utf8");
    }
  } catch (error) {
    return fail(new Error(`Unable to add Skill "${sourceId}": ${String(error)}`));
  }
  return readWrittenSkill(destination, sourceId, false);
}

async function prepareDestination(destination: string, force: boolean): Promise<Result<void>> {
  if (!existsSync(destination)) return ok(undefined);
  if (!force) {
    return fail(
      new Error(`Skill destination already exists: ${destination}. Use --force to replace it.`),
    );
  }
  try {
    await rm(destination, { recursive: true, force: true });
    return ok(undefined);
  } catch (error) {
    return fail(new Error(`Unable to replace Skill destination: ${String(error)}`));
  }
}

async function readWrittenSkill(
  destination: string,
  id: string,
  created: boolean,
): Promise<Result<CustomSkillWriteResult>> {
  const skill = loadSkill(join(destination, ".."), id);
  if (skill === null) return fail(new Error(`Created Skill "${id}" failed validation.`));
  return ok({ skill, path: destination, created });
}

function renderSourceMarkdown(skill: Skill): string {
  const frontmatter = [
    "---",
    `name: ${skill.manifest.name}`,
    `description: ${skill.manifest.description}`,
    ...(skill.manifest.version === undefined ? [] : [`version: ${skill.manifest.version}`]),
    ...(skill.manifest.allowedTools === undefined
      ? []
      : [`allowed-tools: [${skill.manifest.allowedTools.join(", ")}]`]),
    ...(skill.manifest.disallowedTools === undefined
      ? []
      : [`disallowed-tools: [${skill.manifest.disallowedTools.join(", ")}]`]),
    ...(skill.manifest.disableModelInvocation === undefined
      ? []
      : [`disable-model-invocation: ${skill.manifest.disableModelInvocation}`]),
    "---",
    "",
  ].join("\n");
  return `${frontmatter}${skill.body.trimEnd()}\n`;
}
