import { join } from "node:path";
import {
  SKILLS_SUBDIR,
  type Skill,
  type SkillPort,
  addCustomSkill,
  availableSkills,
  createCustomSkill,
  createSkillService,
  listBuiltinSkills,
  loadBuiltinSkill,
  validateBuiltinSkill,
} from "@prof-bilal/atlas-sdk";
import type { Command } from "commander";

interface SkillsCommandOptions {
  readonly root?: string;
  readonly json?: boolean;
  readonly builtin?: boolean;
  readonly installed?: boolean;
}

/** One row of `atlas skills` output. `builtin` Skills ship with CodeAtlas. */
interface SkillListing {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version?: string | undefined;
  readonly path: string;
  readonly source: "builtin" | "installed";
}

function resolveRoot(opts: SkillsCommandOptions): string {
  return opts.root ?? process.cwd();
}

function skillsDir(root: string): string {
  return join(root, SKILLS_SUBDIR);
}

/**
 * Collect the Skills to display. The default is the merged view a user wants:
 * first-party built-ins plus project Skills from `.codeatlas/skills/`, with a
 * project Skill overriding a built-in of the same id (matching resolution).
 * `--builtin` and `--installed` narrow the view instead of hiding half the
 * library behind an opt-in flag.
 */
function collectSkills(root: string, opts: SkillsCommandOptions): readonly SkillListing[] {
  const service = createSkillService({ root });
  if (opts.builtin === true) {
    return listBuiltinSkills().map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      version: skill.version,
      path: skill.path,
      source: "builtin" as const,
    }));
  }
  if (opts.installed === true) {
    return service.listSkills(skillsDir(root)).map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      version: skill.version,
      path: skill.path,
      source: "installed" as const,
    }));
  }
  return availableSkills(root).map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    path: skill.path,
    source: skill.source === "builtin" ? ("builtin" as const) : ("installed" as const),
  }));
}

function emitSkillList(listings: readonly SkillListing[], opts: SkillsCommandOptions): void {
  if (opts.json === true) {
    console.log(JSON.stringify(listings, null, 2));
    return;
  }
  if (listings.length === 0) {
    console.log(
      opts.installed === true
        ? "No Skills installed in .codeatlas/skills/."
        : "No Skills are available.",
    );
    if (opts.installed === true) console.log("Install Skills with: atlas tools install <name>");
    return;
  }
  const builtins = listings.filter((entry) => entry.source === "builtin").length;
  console.log(
    `\nSkills (${listings.length}: ${builtins} built-in, ${listings.length - builtins} installed)\n`,
  );
  for (const skill of listings) {
    const version = skill.version !== undefined ? ` v${skill.version}` : "";
    const tag = skill.source === "installed" ? " [installed]" : "";
    console.log(`  ${skill.name}${version}${tag}`);
    console.log(`    ${skill.description}`);
  }
  if (listings.length - builtins === 0) {
    console.log("\nInspect one with: atlas skills <name>");
    console.log("Install more with: atlas skills add --from <dir>");
  }
}

/**
 * Print one Skill in full. Shared by `atlas skills info <id>` and the default
 * `atlas skills <id>` form, so inspecting a Skill does not require knowing
 * that the `info` subcommand exists.
 */
function emitSkillInfo(root: string, id: string, opts: SkillsCommandOptions): void {
  const resolved = resolveSkill(root, id, opts);
  if (resolved === null) {
    console.error(
      `Skill not found: ${id}. Available: ${availableIds(root).join(", ") || "(none)"}.`,
    );
    process.exitCode = 1;
    return;
  }
  const { skill, source } = resolved;

  if (opts.json === true) {
    console.log(
      JSON.stringify(
        {
          id: skill.id,
          name: skill.manifest.name,
          description: skill.manifest.description,
          version: skill.manifest.version,
          source,
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
  console.log(`\n${skill.manifest.name}${version} [${source}]`);
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

interface ResolvedSkill {
  readonly skill: Skill;
  readonly service: SkillPort;
  /** `builtin` when the first-party library satisfied the id. */
  readonly source: "builtin" | "installed";
}

/**
 * Resolve a Skill id the way launch/injection does: project Skills in
 * `.codeatlas/skills/` first, then the first-party built-ins. `--builtin`
 * restricts the lookup to the shipped library. Returns null when the id
 * matches neither.
 */
function resolveSkill(root: string, id: string, opts: SkillsCommandOptions): ResolvedSkill | null {
  if (opts.builtin === true) {
    const builtin = loadBuiltinSkill(id);
    return builtin === null
      ? null
      : { skill: builtin, service: createSkillService({ root }), source: "builtin" };
  }
  const service = createSkillService({ root });
  const installed = service.loadSkill(skillsDir(root), id);
  if (installed.ok) return { skill: installed.value, service, source: "installed" };
  const builtin = loadBuiltinSkill(id);
  return builtin === null ? null : { skill: builtin, service, source: "builtin" };
}

function availableIds(root: string): readonly string[] {
  return availableSkills(root).map((skill) => skill.id);
}

export function registerSkills(program: Command): void {
  const skills = program
    .command("skills")
    .alias("skill")
    .description("Discover, inspect, validate, and load built-in and installed Agent Skills");

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

  // atlas skills list — also the default action for bare `atlas skills`, so the
  // shipped library is discoverable without knowing a subcommand exists.
  //
  // `[id]` is deliberate: commander forwards an unknown first argument to the
  // default command, so `atlas skills systematic-debugging` lands here. With an
  // id we show that Skill in full instead of silently listing everything.
  skills
    .command("list [id]", { isDefault: true })
    .description(
      "List built-in and installed Skills, or show one Skill in full (default when no subcommand is given)",
    )
    .option("--root <path>", "Project root (default: current directory)")
    .option("--builtin", "Only first-party Skills shipped with CodeAtlas")
    .option("--installed", "Only Skills installed in .codeatlas/skills/")
    .option("--json", "Output as JSON")
    .action((id: string | undefined, opts: SkillsCommandOptions) => {
      const root = resolveRoot(opts);
      if (id !== undefined) {
        emitSkillInfo(root, id, opts);
        return;
      }
      emitSkillList(collectSkills(root, opts), opts);
    });

  // atlas skills info <id>
  skills
    .command("info <id>")
    .description("Show full information for a built-in or installed Skill")
    .option("--root <path>", "Project root (default: current directory)")
    .option("--builtin", "Restrict the lookup to first-party Skills")
    .option("--json", "Output as JSON")
    .action((id: string, opts: SkillsCommandOptions) => {
      emitSkillInfo(resolveRoot(opts), id, opts);
    });

  // atlas skills validate <id>
  skills
    .command("validate <id>")
    .description("Validate a built-in or installed Skill and report any problems")
    .option("--root <path>", "Project root (default: current directory)")
    .option("--builtin", "Restrict the lookup to first-party Skills")
    .option("--json", "Output as JSON")
    .action((id: string, opts: SkillsCommandOptions) => {
      const root = resolveRoot(opts);
      const resolved = resolveSkill(root, id, opts);
      const problems =
        resolved === null
          ? [`skill not found: ${id}`]
          : resolved.source === "builtin"
            ? validateBuiltinSkill(id)
            : resolved.service.validateSkill(skillsDir(root), id);

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
    .description("Load and render a built-in or installed Skill into a prompt block")
    .option("--root <path>", "Project root (default: current directory)")
    .option("--builtin", "Restrict the lookup to first-party Skills")
    .option("--no-references", "Exclude reference files from output")
    .action((id: string, opts: SkillsCommandOptions & { readonly references?: boolean }) => {
      const resolved = resolveSkill(resolveRoot(opts), id, opts);
      if (resolved === null) {
        console.error(`Skill not found: ${id}`);
        process.exit(1);
      }
      console.log(
        resolved.service.renderSkill(resolved.skill, {
          includeReferences: opts.references !== false,
        }),
      );
    });
}
