import { runSetup } from "@prof-bilal/atlas-sdk";
import type { Command } from "commander";

interface SetupCommandOptions {
  readonly repo?: string;
  readonly tools?: string;
  readonly yes?: boolean;
  readonly dryRun?: boolean;
  readonly json?: boolean;
}

export function registerSetup(program: Command): void {
  program
    .command("setup")
    .description("Detect the project, recommend tools and Skills, and optionally install them")
    .option("--repo <path>", "Project root (default: current directory)")
    .option(
      "--tools <ids>",
      "Comma-separated tool or Skill ids (default: evidence-based recommendations)",
    )
    .option("--yes", "Approve the selected installs")
    .option("--dry-run", "Show the plan without installing anything")
    .option("--json", "Output machine-readable JSON")
    .action(async (opts: SetupCommandOptions) => {
      const selected =
        opts.tools === undefined
          ? undefined
          : opts.tools
              .split(",")
              .map((item) => item.trim())
              .filter((item) => item.length > 0);
      const result = await runSetup({
        ...(opts.repo === undefined ? {} : { root: opts.repo }),
        ...(selected === undefined ? {} : { selected }),
        ...(opts.yes === true ? { approve: true } : {}),
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

      const { profile, recommendations, installs, security } = result.value;
      console.log("\nCodeAtlas setup\n");
      console.log(
        `Project evidence: ${profile.evidence.length > 0 ? profile.evidence.join(", ") : "none"}`,
      );
      console.log("\nRecommendations:");
      for (const recommendation of recommendations) {
        console.log(`  - ${recommendation.id} (${recommendation.kind}): ${recommendation.reason}`);
      }
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
        console.log(
          "\nSetup is not complete. Review the results and rerun with --yes after approval.",
        );
        process.exitCode = 1;
      } else {
        console.log("\nATLAS ready: selected integrations are validated or already installed.");
      }
    });
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
