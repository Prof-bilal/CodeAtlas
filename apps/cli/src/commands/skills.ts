import { join } from "node:path";
import { createSkillService } from "@atlas/sdk";
import type { Command } from "commander";

interface SkillsCommandOptions {
  readonly root?: string;
  readonly json?: boolean;
}

function resolveRoot(opts: SkillsCommandOptions): string {
  return opts.root ?? process.cwd();
}

export function registerSkills(program: Command): void {
  const skills = program
    .command("skills")
    .description("Discover, inspect, and load installed Agent Skills");

  // atlas skills list
  skills
    .command("list")
    .description("List installed skills from .codeatlas/skills/")
    .option("--root <path>", "Project root (default: current directory)")
    .option("--json", "Output as JSON")
    .action((opts: SkillsCommandOptions) => {
      const root = resolveRoot(opts);
      const service = createSkillService({ root });
      const skillsDir = join(root, ".codeatlas", "skills");
      const discovered = service.listSkills(skillsDir);

      if (opts.json === true) {
        console.log(JSON.stringify(discovered, null, 2));
        return;
      }

      if (discovered.length === 0) {
        console.log("No skills installed in .codeatlas/skills/");
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
    .description("Show full information for an installed skill")
    .option("--root <path>", "Project root (default: current directory)")
    .option("--json", "Output as JSON")
    .action((id: string, opts: SkillsCommandOptions) => {
      const root = resolveRoot(opts);
      const service = createSkillService({ root });
      const skillsDir = join(root, ".codeatlas", "skills");
      const result = service.loadSkill(skillsDir, id);

      if (!result.ok) {
        console.error(`Skill not found: ${id}`);
        console.error(result.error.message);
        process.exit(1);
      }

      const skill = result.value;

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
    .description("Validate an installed skill and report any problems")
    .option("--root <path>", "Project root (default: current directory)")
    .option("--json", "Output as JSON")
    .action((id: string, opts: SkillsCommandOptions) => {
      const root = resolveRoot(opts);
      const service = createSkillService({ root });
      const skillsDir = join(root, ".codeatlas", "skills");
      const problems = service.validateSkill(skillsDir, id);

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
    .description("Load and render a skill into a prompt-instruction block")
    .option("--root <path>", "Project root (default: current directory)")
    .option("--no-references", "Exclude reference files from output")
    .action((id: string, opts: SkillsCommandOptions & { readonly references?: boolean }) => {
      const root = resolveRoot(opts);
      const service = createSkillService({ root });
      const skillsDir = join(root, ".codeatlas", "skills");
      const result = service.loadSkill(skillsDir, id);

      if (!result.ok) {
        console.error(`Skill not found: ${id}`);
        console.error(result.error.message);
        process.exit(1);
      }

      const rendered = service.renderSkill(result.value, {
        includeReferences: opts.references !== false,
      });
      console.log(rendered);
    });
}
