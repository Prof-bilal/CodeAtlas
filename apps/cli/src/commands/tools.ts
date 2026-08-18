import {
  type ConfigureOutcome,
  type InstallApproval,
  type ToolkitDoctorEntry,
  type ToolkitSDK,
  createToolkitSDK,
} from "@atlas/sdk";
import type { Command } from "commander";

export interface ToolsCommandOptions {
  readonly toolkit?: ToolkitSDK;
}

interface CommonOptions {
  readonly json?: boolean;
}

interface ConfigureOptions extends CommonOptions {
  readonly dryRun?: boolean;
  readonly configHome?: string;
}

interface InstallOptions extends CommonOptions {
  readonly yes?: boolean;
  readonly note?: string;
}

export function registerTools(program: Command, options: ToolsCommandOptions = {}): void {
  const toolkit = options.toolkit ?? createToolkitSDK();
  const tools = program
    .command("tools")
    .description("Discover, install, configure, and inspect toolkit tools");

  tools
    .option("--category <cat>", "filter overview to tools in a category")
    .action(async (commandOptions: CommonOptions & { readonly category?: string }) => {
      if (commandOptions.category !== undefined) {
        const matches = toolkit.listByCategory(commandOptions.category);
        return emit(
          {
            tools: matches.map((t) => ({
              name: t.name,
              description: t.description,
              tier: t.tier,
              categories: t.categories,
            })),
          },
          commandOptions,
          renderCategoryTools,
        );
      }
      await run(toolkit.overview(), commandOptions, renderOverview);
    });

  tools
    .command("search <query>")
    .description("Search the curated tool registry")
    .option("--json", "print results as JSON")
    .option("--category <cat>", "filter results to tools in a category")
    .action((query: string, commandOptions: CommonOptions & { readonly category?: string }) => {
      if (commandOptions.category !== undefined) {
        const matches = toolkit.listByCategory(commandOptions.category);
        const filtered = matches.filter(
          (tool) =>
            tool.name.toLowerCase().includes(query.toLowerCase()) ||
            tool.description.toLowerCase().includes(query.toLowerCase()),
        );
        return emit(filtered, commandOptions, renderTools);
      }
      return emit(toolkit.search(query), commandOptions, renderTools);
    });

  tools
    .command("categories")
    .description("List all tool categories")
    .option("--json", "print results as JSON")
    .action((commandOptions: CommonOptions) => {
      const cats = toolkit.registry.listCategories();
      emit(cats, commandOptions, (value) =>
        value.length === 0 ? "No categories." : value.join("\n"),
      );
    });

  tools
    .command("info <tool>")
    .description("Show registry, security, and installed manifest details")
    .option("--json", "print details as JSON")
    .action(async (name: string, commandOptions: CommonOptions) =>
      run(toolkit.info(name), commandOptions, (value) => renderInfo(value)),
    );

  tools
    .command("install <tool>")
    .description(
      "Plan and install a tool through compatibility, security, approval, and verification",
    )
    .option("--yes", "approve the displayed install plan")
    .option("--note <note>", "record an approval note")
    .option("--json", "print the plan/result as JSON")
    .action(async (name: string, commandOptions: InstallOptions) => {
      const plan = await toolkit.planInstall(name);
      if (!plan.ok) return fail(plan.error);
      // JSON mode must produce one machine-readable document. The successful
      // outcome already contains the exact plan, so defer emission until the
      // install completes when both --json and --yes are supplied.
      if (commandOptions.json !== true || commandOptions.yes !== true) {
        emit(plan.value, commandOptions, (value) => renderInstallPlan(value));
      }
      if (commandOptions.yes !== true) {
        console.error("Installation not applied. Re-run with --yes after reviewing the plan.");
        process.exitCode = 1;
        return;
      }
      const approval: InstallApproval = {
        granted: true,
        ...(commandOptions.note !== undefined ? { note: commandOptions.note } : {}),
      };
      if (commandOptions.json === true) {
        const outcome = await toolkit.install(name, approval);
        if (!outcome.ok) return fail(outcome.error);
        emit({ plan: plan.value, outcome: outcome.value }, commandOptions, (value) =>
          JSON.stringify(value, null, 2),
        );
        return;
      }
      await run(toolkit.install(name, approval), commandOptions, renderInstallOutcome);
    });

  tools
    .command("remove <tool>")
    .description("Uninstall a tool through its Toolkit adapter")
    .option("--json", "print the result as JSON")
    .action(async (name: string, commandOptions: CommonOptions) =>
      run(toolkit.remove(name), commandOptions, (value) => renderSimple(value)),
    );

  tools
    .command("update")
    .description("Update all installed tools to their latest versions")
    .option("--json", "print the result as JSON")
    .option("--approve", "skip the per-tool approval prompt")
    .action(async (commandOptions: CommonOptions & { readonly approve?: boolean }) => {
      const approval: InstallApproval = { granted: commandOptions.approve === true };
      await run(toolkit.update(approval), commandOptions, renderUpdate);
    });

  tools
    .command("configure <tool>")
    .description("Configure an installed tool for supported, installed agents")
    .option("--config-home <path>", "user configuration root (for testing or managed environments)")
    .option("--dry-run", "render changes without writing")
    .option("--json", "print the plan/result as JSON")
    .action(async (name: string, commandOptions: ConfigureOptions) =>
      run(toolkit.configure(name, commandOptions), commandOptions, renderConfigureOutcome),
    );

  tools
    .command("doctor")
    .description("Reconcile installed manifests, integration state, and trust")
    .option("--json", "print the result as JSON")
    .action(async (commandOptions: CommonOptions) =>
      run(toolkit.doctor(), commandOptions, renderDoctor),
    );
}

async function run<T>(
  result: Promise<
    { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: Error }
  >,
  options: CommonOptions,
  render: (value: T) => string,
): Promise<void> {
  const resolved = await result;
  if (!resolved.ok) return fail(resolved.error);
  emit(resolved.value, options, render);
}

function emit<T>(value: T, options: CommonOptions, render: (value: T) => string): void {
  console.log(options.json === true ? JSON.stringify(value, null, 2) : render(value));
}

function fail(error: Error): void {
  console.error(error.message);
  process.exitCode = 1;
}

function renderOverview(value: {
  readonly recommended: readonly { readonly name: string }[];
  readonly installed: readonly {
    readonly name: string;
    readonly security: { readonly trust: string };
  }[];
}): string {
  return [
    "Recommended",
    ...value.recommended.map((tool) => `  ${tool.name}`),
    "",
    "Installed",
    ...value.installed.map((tool) => `  ✓ ${tool.name} [${tool.security.trust}]`),
    ...(value.installed.length === 0 ? ["  None"] : []),
  ].join("\n");
}

function renderCategoryTools(value: {
  readonly tools: readonly {
    readonly name: string;
    readonly description: string;
    readonly tier: string;
    readonly categories: readonly string[];
  }[];
}): string {
  return value.tools.length === 0
    ? "No tools found in this category."
    : value.tools.map((tool) => `  ${tool.name} [${tool.tier}] — ${tool.description}`).join("\n");
}

function renderTools(
  value: readonly { readonly name: string; readonly description: string; readonly trust: string }[],
): string {
  return value.length === 0
    ? "No tools found."
    : value.map((tool) => `${tool.name} [${tool.trust}] — ${tool.description}`).join("\n");
}

function renderInfo(value: {
  readonly tool: {
    readonly name: string;
    readonly description: string;
    readonly version: string;
    readonly trust: string;
    readonly security: { readonly status: string };
    readonly installMethods: readonly { readonly type: string }[];
    readonly dependencies: readonly { readonly name: string }[];
    readonly categories: readonly string[];
  };
  readonly manifest: {
    readonly toolVersion: string;
    readonly security: { readonly trust: string };
  } | null;
  readonly compatibility: {
    readonly overall: string;
    readonly checks: readonly {
      readonly label: string;
      readonly state: string;
      readonly detail: string | null;
    }[];
  } | null;
}): string {
  const lines = [
    `${value.tool.name} ${value.tool.version}`,
    value.tool.description,
    `Trust: ${value.tool.trust}`,
    `Security: ${value.tool.security.status}`,
    `Install methods: ${value.tool.installMethods.map((method) => method.type).join(", ")}`,
    `Categories: ${value.tool.categories.join(", ") || "none"}`,
    `Installed: ${value.manifest === null ? "no" : `yes (${value.manifest.security.trust})`}`,
  ];

  if (value.tool.dependencies.length > 0) {
    lines.push(`Dependencies: ${value.tool.dependencies.map((dep) => dep.name).join(", ")}`);
  }

  if (value.compatibility !== null) {
    lines.push(`\nCompatibility: ${value.compatibility.overall}`);
    for (const check of value.compatibility.checks) {
      const icon = check.state === "compatible" ? "✓" : check.state === "incompatible" ? "✗" : "?";
      const detail = check.detail !== null ? ` — ${check.detail}` : "";
      lines.push(`  ${icon} ${check.label}: ${check.state}${detail}`);
    }
  }

  return lines.join("\n");
}

function renderInstallPlan(value: {
  readonly toolName: string;
  readonly command: { readonly binary: string; readonly args: readonly string[] };
  readonly effect: string;
  readonly dangerous: readonly string[];
  readonly security: { readonly status: string; readonly trust: string; readonly risk: string };
}): string {
  return [
    `Install plan: ${value.toolName}`,
    `Trust: ${value.security.trust} / ${value.security.status} (${value.security.risk})`,
    `Command: ${JSON.stringify([value.command.binary, ...value.command.args])}`,
    value.effect,
    value.dangerous.length > 0
      ? `Warnings: ${value.dangerous.join(", ")}`
      : "No additional warnings.",
  ].join("\n");
}

function renderInstallOutcome(value: {
  readonly plan: { readonly security: { readonly trust: string } };
  readonly verification: string;
  readonly manifestPath: string | null;
}): string {
  return `Installed with trust ${value.plan.security.trust}; verification: ${value.verification}; manifest: ${value.manifestPath ?? "not recorded"}`;
}

function renderUpdate(value: {
  readonly registryTools: number;
  readonly installedTools: number;
  readonly updated: readonly {
    readonly name: string;
    readonly status: string;
    readonly note: string;
  }[];
  readonly note: string;
}): string {
  if (value.updated.length === 0) return "No installed tools to update.";
  return [
    ...value.updated.map((entry) => {
      const icon = entry.status === "updated" ? "✓" : entry.status === "error" ? "✗" : "–";
      return `  ${icon} ${entry.name}: ${entry.note}`;
    }),
    "",
    value.note,
  ].join("\n");
}

function renderSimple(value: object): string {
  return JSON.stringify(value, null, 2);
}
function renderDoctor(value: readonly ToolkitDoctorEntry[]): string {
  if (value.length === 0) return "No installed tools.";
  return value
    .map((entry) => {
      const compat =
        entry.compatibility !== null ? ` [compatibility: ${entry.compatibility.overall}]` : "";
      const conflicts =
        entry.conflicts.length > 0 ? ` [conflicts with: ${entry.conflicts.join(", ")}]` : "";
      return `${entry.name}: manifest=${entry.manifest}, integration=${entry.integration}, trust=${entry.trust}${compat}${conflicts}`;
    })
    .join("\n");
}
export function renderConfigureOutcome(outcome: ConfigureOutcome): string {
  const lines = [outcome.dryRun ? "Configuration dry run" : "Configuration complete"];
  if (outcome.appliedTargets.length > 0)
    lines.push(`Applied: ${outcome.appliedTargets.join(", ")}`);
  if (outcome.verifiedTargets.length > 0)
    lines.push(`Verified: ${outcome.verifiedTargets.join(", ")}`);
  if (outcome.skippedTargets.length > 0)
    lines.push(`Already configured: ${outcome.skippedTargets.join(", ")}`);
  for (const failure of outcome.failedTargets)
    lines.push(`Failed (${failure.target}): ${failure.error}`);
  if (
    outcome.appliedTargets.length === 0 &&
    outcome.failedTargets.length === 0 &&
    outcome.skippedTargets.length === 0
  )
    lines.push("No applicable installed targets.");
  return lines.join("\n");
}
