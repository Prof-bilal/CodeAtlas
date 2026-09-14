import { join } from "node:path";
import {
  addCustomSkill,
  createCustomSkill,
  createSkillService,
  listBuiltinSkills,
  loadBuiltinSkill,
  validateBuiltinSkill,
} from "@atlas/sdk";
import type { Command } from "commander";

interface SkillsCommandOptions {
  readonly root?: string;
  readonly json?: boolean;
  readonly builtin?: boolean;
}

function resolveRoot(opts: SkillsCommandOptions): string {
  return opts.root ?? process.cwd();
}

function emitSkillWrite(
  result: {
    readonly skill: {
      readonly id: string;
      readonly manifest: { readonly description: string };
      readonly path: string;
    };
    readonly path: string;
    readonly created: boolean;
  },
  json: boolean,
): void {
  const value = {
    id: result.skill.id,
    description: result.skill.manifest.description,
    path: result.path,
    created: result.created,
  };
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.log(
    `✓ ${result.created ? "Created" : "Added"} Skill ${result.skill.id} at ${result.path}`,
  );
}

export function registerSkills(program: Command): void {
  const skills = program
    .command("skills")
    .description("Discover, inspect, and load installed Agent Skills");

  // atlas skills create <id>
  skills
    .command("create <id>")
    .description("Create a validated custom Skill template")
    .requiredOption("--description <text>", "Skill description")
    .option("--root <path>", "Project root (default: current directory)")
    .option("--force", "Replace an existing Skill")
    .option("--json", "Output as JSON")
    .action(
      async (
        id: string,
        opts: SkillsCommandOptions & { readonly description: string; readonly force?: boolean },
      ) => {
        const result = await createCustomSkill({
          id,
          description: opts.description,
          ...(opts.root === undefined ? {} : { root: opts.root }),
          ...(opts.force === true ? { force: true } : {}),
        });
        if (!result.ok) {
          console.error(result.error.message);
          process.exitCode = 1;
          return;
        }
        emitSkillWrite(result.value, opts.json === true);
      },
    );

  // atlas skills add --from <directory>
  skills
    .command("add")
    .description("Validate and add a custom Skill directory to .codeatlas/skills/")
    .requiredOption("--from <path>", "Source Skill directory")
    .option("--id <id>", "Destination Skill id (defaults to source directory name)")
    .option("--root <path>", "Project root (default: current directory)")
    .option("--force", "Replace an existing Skill")
    .option("--json", "Output as JSON")
    .action(
      async (
        opts: SkillsCommandOptions & {
          readonly from: string;
          readonly id?: string;
          readonly force?: boolean;
        },
      ) => {
        const result = await addCustomSkill({
          sourceDir: opts.from,
          ...(opts.id === undefined ? {} : { id: opts.id }),
          ...(opts.root === undefined ? {} : { root: opts.root }),
          ...(opts.force === true ? { force: true } : {}),
        });
        if (!result.ok) {
          console.error(result.error.message);
          process.exitCode = 1;
          return;
        }
        emitSkillWrite(result.value, opts.json === true);
      },
    );

  // atlas skills list
  skills
    .command("list")
    .description("List installed Skills or first-party built-in Skills")
    .option("--root <path>", "Project root (default: current directory)")
    .option("--builtin", "List the first-party Skills shipped with CodeAtlas")
    .option("--json", "Output as JSON")
    .action((opts: SkillsCommandOptions) => {
      const root = resolveRoot(opts);
      const service = createSkillService({ root });
      const skillsDir = join(root, ".codeatlas", "skills");
      const discovered =
        opts.builtin === true ? listBuiltinSkills() : service.listSkills(skillsDir);

      if (opts.json === true) {
        console.log(JSON.stringify(discovered, null, 2));
        return;
      }

      if (discovered.length === 0) {
        console.log(
          opts.builtin === true
            ? "No built-in Skills are available."
            : "No skills installed in .codeatlas/skills/.",
        );
        if (opts.builtin !== true)
          console.log("Install skills with: atlas tools install <skill-name>");
        return;
      }

      console.log(`\nInstalled Skills (${discovered.length}):\n`);
      for (const skill of discovered) {
        const version = skill.version !== undefined ? ` v${skill.version}` : "";
        console.log(`  ${skill.name}${version}`);
        console.log(`    ${skill.description}`);
      }
    });

  // atlas skills info <id>
  skills
    .command("info <id>")
    .description("Show full information for an installed or built-in Skill")
    .option("--root <path>", "Project root (default: current directory)")
    .option("--builtin", "Read a first-party Skill shipped with CodeAtlas")
    .option("--json", "Output as JSON")
    .action((id: string, opts: SkillsCommandOptions) => {
      const root = resolveRoot(opts);
      const service = createSkillService({ root });
      const skillsDir = join(root, ".codeatlas", "skills");
      const result = service.loadSkill(skillsDir, id);
      const skill = opts.builtin === true ? loadBuiltinSkill(id) : result.ok ? result.value : null;

      if (skill === null) {
        console.error(`Skill not found: ${id}`);
        if (opts.builtin !== true && !result.ok) console.error(result.error.message);
        process.exit(1);
      }

      if (opts.json === true) {
        console.log(
          JSON.stringify(
            {
              id: skill.id,
              name: skill.manifest.name,
              description: skill.manifest.description,
              version: skill.manifest.version,
              allowedTools: skill.manifest.allowedTools,
              disallowedTools: skill.manifest.disallowedTools,
              path: skill.path,
              references: skill.references.map((r) => r.relPath),
              bodyLength: skill.body.length,
            },
            null,
            2,
          ),
        );
        return;
      }

      const version = skill.manifest.version !== undefined ? ` v${skill.manifest.version}` : "";
      console.log(`\n${skill.manifest.name}${version}`);
      console.log(`  ${skill.manifest.description}`);
      console.log(`  Path: ${skill.path}`);
      if ((skill.manifest.allowedTools?.length ?? 0) > 0) {
        console.log(`  Allowed tools: ${skill.manifest.allowedTools?.join(", ")}`);
      }
      if (skill.references.length > 0) {
        console.log(`  References: ${skill.references.map((r) => r.relPath).join(", ")}`);
      }
      console.log("\n--- Instructions ---\n");
      console.log(skill.body.trim());
    });

  // atlas skills validate <id>
  skills
    .command("validate <id>")
    .description("Validate an installed or built-in Skill and report any problems")
    .option("--root <path>", "Project root (default: current directory)")
    .option("--builtin", "Validate a first-party Skill shipped with CodeAtlas")
    .option("--json", "Output as JSON")
    .action((id: string, opts: SkillsCommandOptions) => {
      const root = resolveRoot(opts);
      const service = createSkillService({ root });
      const skillsDir = join(root, ".codeatlas", "skills");
      const problems =
        opts.builtin === true ? validateBuiltinSkill(id) : service.validateSkill(skillsDir, id);

      if (opts.json === true) {
        console.log(JSON.stringify({ id, valid: problems.length === 0, problems }, null, 2));
        return;
      }

      if (problems.length === 0) {
        console.log(`✓ Skill "${id}" is valid.`);
      } else {
        console.error(`✗ Skill "${id}" has ${problems.length} problem(s):`);
        for (const p of problems) {
          console.error(`  - ${p}`);
        }
        process.exit(1);
      }
    });

  // atlas skills load <id>
  skills
    .command("load <id>")
    .description("Load and render an installed or built-in Skill into a prompt block")
    .option("--root <path>", "Project root (default: current directory)")
    .option("--builtin", "Read a first-party Skill shipped with CodeAtlas")
    .option("--no-references", "Exclude reference files from output")
    .action((id: string, opts: SkillsCommandOptions & { readonly references?: boolean }) => {
      const root = resolveRoot(opts);
      const service = createSkillService({ root });
      const skillsDir = join(root, ".codeatlas", "skills");
      const result = service.loadSkill(skillsDir, id);
      const skill = opts.builtin === true ? loadBuiltinSkill(id) : result.ok ? result.value : null;

      if (skill === null) {
        console.error(`Skill not found: ${id}`);
        if (opts.builtin !== true && !result.ok) console.error(result.error.message);
        process.exit(1);
      }

      const rendered = service.renderSkill(skill, {
        includeReferences: opts.references !== false,
      });
      console.log(rendered);
    });
}
