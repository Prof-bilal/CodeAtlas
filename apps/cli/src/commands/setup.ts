import { createInterface } from "node:readline/promises";
import { type SetupCandidate, type SetupPlan, planSetup, runSetup } from "@prof-bilal/atlas-sdk";
import type { Command } from "commander";

interface SetupCommandOptions {
  readonly repo?: string;
  readonly tools?: string;
  readonly yes?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
}

export interface SetupCommandServices {
  /** Injectable interactive prompt (tests); default reads stdin. */
  readonly prompt?: (question: string) => Promise<string>;
}

/**
 * Render the setup plan as a numbered menu. Only installable candidates are
 * numbered; first-party Skills that already ship with CodeAtlas are listed
 * separately because they need no installation. Pure, so it is unit-tested
 * and never depends on a TTY.
 */
const DESCRIPTION_LIMIT = 96;

export function renderSetupPlan(plan: SetupPlan): string {
  const lines = ["\nCodeAtlas setup\n", `Project: ${plan.root}`];
  lines.push(
    `Project evidence: ${plan.profile.evidence.length > 0 ? plan.profile.evidence.join(", ") : "none"}`,
  );

  // First-party Skills need no installation, so they are never numbered —
  // showing them as choices would invite installing a clone of a shipped file.
  const recommendedShipped = plan.available.filter((skill) => skill.recommended);
  lines.push("", "Recommended Skills — already available, no install needed:");
  if (recommendedShipped.length === 0) {
    lines.push("  none for this project");
  } else {
    for (const skill of recommendedShipped) {
      lines.push(`  ✓ ${skill.id} — ${truncate(skill.description)}`);
    }
  }
  lines.push(
    `  ${plan.available.length} built-in Skills ship with CodeAtlas; see them all with \`atlas skills\`.`,
  );

  const installable = plan.candidates;
  const recommended = installable.filter((candidate) => candidate.recommended);
  lines.push("", `Recommended Tools & Skills — installable (${recommended.length}):`);
  if (recommended.length === 0)
    lines.push("  none — the curated recommendations are built-in Skills");
  for (const candidate of recommended) lines.push(`  ${candidateLine(candidate, plan)}`);

  const optional = installable.filter((candidate) => !candidate.recommended);
  lines.push("", `Optional — installable from the catalog (${optional.length}):`);
  if (optional.length === 0) lines.push("  none");
  for (const candidate of optional) lines.push(`  ${candidateLine(candidate, plan)}`);
  return lines.join("\n");
}

function candidateLine(candidate: SetupCandidate, plan: SetupPlan): string {
  const index = plan.candidates.indexOf(candidate) + 1;
  const label = `${String(index).padStart(2, " ")}) `;
  const marks = [candidate.installed ? "installed" : null, `trust:${candidate.trust}`]
    .filter((value) => value !== null)
    .join(", ");
  const reason = candidate.reason === null ? "" : `\n      recommended: ${candidate.reason}`;
  return `${label}${candidate.id} [${candidate.kind}] (${marks}) — ${truncate(candidate.description)}${reason}`;
}

/** Keep the menu readable; `--json` always carries the full metadata. */
function truncate(value: string): string {
  return value.length <= DESCRIPTION_LIMIT ? value : `${value.slice(0, DESCRIPTION_LIMIT - 1)}…`;
}

/**
 * Parse a selection answer against the plan's candidate list. Accepts numbers
 * (`1,3`), ranges (`2-4`), `all`, and `none`/empty. Unknown entries are
 * ignored rather than fatal so a typo cannot install the wrong thing.
 */
export function parseSelection(input: string, candidates: readonly SetupCandidate[]): string[] {
  const answer = input.trim().toLowerCase();
  if (answer === "" || answer === "none" || answer === "n") return [];
  if (answer === "all" || answer === "*") return candidates.map((candidate) => candidate.id);
  const picked = new Set<string>();
  for (const part of answer.split(/[\s,]+/)) {
    if (part === "") continue;
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range !== null) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      for (let index = Math.min(start, end); index <= Math.max(start, end); index += 1) {
        const candidate = candidates[index - 1];
        if (candidate !== undefined) picked.add(candidate.id);
      }
      continue;
    }
    if (/^\d+$/.test(part)) {
      const candidate = candidates[Number(part) - 1];
      if (candidate !== undefined) picked.add(candidate.id);
    }
  }
  return [...picked];
}

async function ask(
  prompt: string,
  inject?: (question: string) => Promise<string>,
): Promise<string> {
  if (inject !== undefined) return inject(prompt);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
}

function isInteractive(options: SetupCommandOptions, services: SetupCommandServices): boolean {
  if (options.tools !== undefined || options.json === true || options.dryRun === true) return false;
  // Injected prompts make the flow testable without a TTY; otherwise require one.
  if (services.prompt !== undefined) return true;
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

export function registerSetup(program: Command, services: SetupCommandServices = {}): void {
  program
    .command("setup")
    .description("Detect the project, then choose which Tools and Skills to install")
    .option("--repo <path>", "Project root (default: current directory)")
    .option("--tools <ids>", "Comma-separated tool or Skill ids to install (skips the prompt)")
    .option("--yes", "Approve the selected installs")
    .option("--dry-run", "Show the plan without installing anything")
    .option("--json", "Output machine-readable JSON")
    .action(async (opts: SetupCommandOptions) => {
      const root = opts.repo;
      const plan = await planSetup(root === undefined ? {} : { root });
      if (!plan.ok) {
        console.error(`Setup failed: ${plan.error.message}`);
        process.exitCode = 1;
        return;
      }

      const interactive = isInteractive(opts, services);
      const preselected =
        opts.tools === undefined
          ? undefined
          : opts.tools
              .split(",")
              .map((item) => item.trim())
              .filter((item) => item.length > 0);

      // Interactive: show the plan, let the user pick, then confirm before
      // anything is installed. No path installs an unselected item.
      if (preselected === undefined && interactive) {
        console.log(renderSetupPlan(plan.value));
        const answer = await ask(
          "\nSelect items to install (numbers/ranges, e.g. 1,3-5; 'all'; 'none') [none]: ",
          services.prompt,
        );
        const selected = parseSelection(answer, plan.value.candidates);
        if (selected.length === 0) {
          console.log(
            "\nNothing selected — no Tools or Skills were installed. Run `atlas setup` again when you want them.",
          );
          return;
        }
        const confirm = await ask(
          `Install ${selected.length} selected item(s)? [y/N]: `,
          services.prompt,
        );
        if (!/^y(es)?$/i.test(confirm.trim())) {
          console.log("\nAborted — nothing was installed.");
          return;
        }
        await report({ root, selected, approve: true }, opts);
        return;
      }

      if (preselected === undefined || preselected.length === 0) {
        console.log(renderSetupPlan(plan.value));
        console.log(
          [
            "",
            "Nothing selected — no Tools or Skills were installed.",
            "Install what you need with:",
            "  atlas setup --tools <id>[,<id>] --yes",
            "  atlas tools install <id>",
            "",
          ].join("\n"),
        );
        return;
      }

      await report({ root, selected: preselected, approve: opts.yes === true }, opts);
    });
}

async function report(
  input: {
    readonly root: string | undefined;
    readonly selected: readonly string[];
    readonly approve: boolean;
  },
  opts: SetupCommandOptions,
): Promise<void> {
  const result = await runSetup({
    ...(input.root === undefined ? {} : { root: input.root }),
    selected: input.selected,
    ...(input.approve ? { approve: true } : {}),
    ...(opts.dryRun === true ? { dryRun: true } : {}),
  });
  if (!result.ok) {
    console.error(`Setup failed: ${result.error.message}`);
    process.exitCode = 1;
    return;
  }
  if (opts.json === true) {
    console.log(JSON.stringify(result.value, null, 2));
    if (!result.value.atlasReady) process.exitCode = 1;
    return;
  }

  const { installs, security } = result.value;
  console.log("\nInstall results:");
  if (installs.length === 0) console.log("  No tools or Skills selected.");
  for (const install of installs) {
    console.log(`  ${statusGlyph(install.status)} ${install.id}: ${install.note}`);
  }
  console.log("\nValidation:");
  for (const step of result.value.validation) {
    console.log(`  ${statusGlyph(step.status)} ${step.id}: ${step.note}`);
  }
  console.log("\nConfiguration:");
  for (const step of result.value.configuration) {
    console.log(`  ${statusGlyph(step.status)} ${step.id}: ${step.note}`);
  }
  console.log(`\n${result.value.atlas.banner}`);
  console.log(
    `TOOLS: ${result.value.atlas.tools.status} (${result.value.atlas.tools.installed} installed)`,
  );
  console.log(
    `SKILLS: ${result.value.atlas.skills.status} (${result.value.atlas.skills.installed} discovered)`,
  );
  console.log(`SECURITY: ${result.value.atlas.security.status} — Warden ${security.warden}`);
  for (const warning of result.value.atlas.warnings) console.log(`  Warning: ${warning}`);
  if (!result.value.atlas.ready) {
    console.log("\nSetup is not complete. Review the results and rerun with --yes after approval.");
    process.exitCode = 1;
  } else {
    console.log("\nATLAS ready: selected integrations are validated or already installed.");
  }
}

function statusGlyph(status: string): string {
  if (
    status === "installed" ||
    status === "already-installed" ||
    status === "validated" ||
    status === "configured"
  )
    return "✓";
  if (status === "planned" || status === "approval-required" || status === "skipped") return "!";
  return "✗";
}
