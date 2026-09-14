import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Result, fail, ok } from "@atlas/shared";
import { createAtlasCompletion } from "./completion";
import { createSkillService } from "./skills/index";
import { type ToolkitSDK, createToolkitSDK } from "./toolkit/facade";
import { createWardenService } from "./warden";

export interface SetupProjectProfile {
  readonly frontend: boolean;
  readonly backend: boolean;
  readonly mcpSensitive: boolean;
  readonly evidence: readonly string[];
}

export interface SetupRecommendation {
  readonly id: string;
  readonly kind: "tool" | "skill";
  readonly reason: string;
}

export interface SetupInstallResult {
  readonly id: string;
  readonly status: "planned" | "installed" | "already-installed" | "approval-required" | "error";
  readonly note: string;
}

export interface SetupStepResult {
  readonly id: string;
  readonly status: "planned" | "validated" | "configured" | "skipped" | "error";
  readonly note: string;
}

export interface SetupReport {
  readonly root: string;
  readonly profile: SetupProjectProfile;
  readonly recommendations: readonly SetupRecommendation[];
  readonly selected: readonly string[];
  readonly installs: readonly SetupInstallResult[];
  readonly validation: readonly SetupStepResult[];
  readonly configuration: readonly SetupStepResult[];
  readonly toolsInstalled: number;
  readonly skillsInstalled: number;
  readonly security: {
    readonly warden: "enabled" | "available" | "not-installed";
    readonly note: string;
  };
  readonly atlas: ReturnType<typeof createAtlasCompletion>;
  readonly atlasReady: boolean;
}

export interface SetupOptions {
  readonly root?: string;
  readonly selected?: readonly string[];
  readonly approve?: boolean;
  readonly dryRun?: boolean;
  readonly toolkit?: ToolkitSDK;
}

/**
 * Run the deterministic first-run setup flow. It only installs when both
 * `approve` and `dryRun === false` are set; discovery and recommendations never
 * execute external commands.
 */
export async function runSetup(options: SetupOptions = {}): Promise<Result<SetupReport>> {
  const root = options.root ?? process.cwd();
  const profile = detectProject(root);
  const toolkit = options.toolkit ?? createToolkitSDK({ root });
  const recommendations = recommend(profile, toolkit);
  const selected = normalizeSelection(options.selected, recommendations);
  const existing = await toolkit.overview();
  if (!existing.ok) return fail(existing.error);
  const installed = new Set(existing.value.installed.map((manifest) => manifest.name));
  const installs: SetupInstallResult[] = [];

  for (const id of selected) {
    if (installed.has(id)) {
      installs.push({ id, status: "already-installed", note: "Already installed; skipped." });
      continue;
    }
    if (options.dryRun === true) {
      installs.push({ id, status: "planned", note: "Would install after explicit approval." });
      continue;
    }
    if (options.approve !== true) {
      installs.push({
        id,
        status: "approval-required",
        note: "Skipped: rerun with --yes to approve installation.",
      });
      continue;
    }
    const result = await toolkit.install(id, {
      granted: true,
      note: "Approved by atlas setup --yes",
    });
    installs.push(
      result.ok
        ? {
            id,
            status: "installed",
            note:
              result.value.verificationNote ?? `Install completed (${result.value.verification}).`,
          }
        : { id, status: "error", note: result.error.message },
    );
  }

  const successfulEntries = installs.filter(
    (entry) => entry.status === "installed" || entry.status === "already-installed",
  );

  const validation: SetupStepResult[] = [];
  const configuration: SetupStepResult[] = [];
  for (const entry of installs) {
    if (entry.status === "planned") {
      validation.push({
        id: entry.id,
        status: "planned",
        note: "Would validate after installation.",
      });
      configuration.push({
        id: entry.id,
        status: "planned",
        note: "Would configure after validation.",
      });
      continue;
    }
    if (entry.status !== "installed" && entry.status !== "already-installed") {
      validation.push({
        id: entry.id,
        status: "skipped",
        note: `Skipped because install was ${entry.status}.`,
      });
      configuration.push({
        id: entry.id,
        status: "skipped",
        note: "Skipped because validation was not run.",
      });
      continue;
    }
    const inspected = await toolkit.info(entry.id);
    if (!inspected.ok || inspected.value.manifest === null) {
      const note = !inspected.ok ? inspected.error.message : "Installed manifest was not found.";
      validation.push({ id: entry.id, status: "error", note });
      configuration.push({
        id: entry.id,
        status: "skipped",
        note: "Skipped because validation failed.",
      });
      continue;
    }
    validation.push({
      id: entry.id,
      status: "validated",
      note: "Installed manifest and compatibility state verified.",
    });
    const configured = await toolkit.configure(entry.id);
    if (!configured.ok) {
      configuration.push({ id: entry.id, status: "error", note: configured.error.message });
    } else {
      const outcome = configured.value;
      configuration.push({
        id: entry.id,
        status: "configured",
        note:
          outcome.appliedTargets.length > 0 || outcome.verifiedTargets.length > 0
            ? `Configured ${outcome.appliedTargets.length + outcome.verifiedTargets.length} target(s).`
            : "No applicable configuration targets; installation remains valid.",
      });
    }
  }
  const skillIds = new Set(
    selected.filter((id) =>
      toolkit.registry.getTool(id)?.installMethods.some((method) => method.type === "skill"),
    ),
  );
  const skillService = createSkillService({ root });
  const skillCount = skillService.listSkills(join(root, ".codeatlas", "skills")).length;
  const wardenStatus = createWardenService().status();
  const warden = wardenStatus.installed ? "available" : "not-installed";
  const blockers = [
    ...installs
      .filter((entry) => entry.status !== "installed" && entry.status !== "already-installed")
      .map((entry) => `${entry.id}: ${entry.note}`),
    ...validation
      .filter((step) => step.status !== "validated")
      .map((step) => `${step.id} validation: ${step.note}`),
    ...configuration
      .filter((step) => step.status !== "configured")
      .map((step) => `${step.id} configuration: ${step.note}`),
  ];
  const atlas = createAtlasCompletion({
    toolsInstalled: successfulEntries.filter((entry) => !skillIds.has(entry.id)).length,
    skillsInstalled: skillCount,
    warden,
    blockers,
  });

  return ok({
    root,
    profile,
    recommendations,
    selected,
    installs,
    validation,
    configuration,
    toolsInstalled: successfulEntries.filter((entry) => !skillIds.has(entry.id)).length,
    skillsInstalled: skillCount,
    security: {
      warden,
      note: wardenStatus.note,
    },
    atlas,
    atlasReady: atlas.ready,
  });
}

function detectProject(root: string): SetupProjectProfile {
  const evidence: string[] = [];
  const packageJson = readPackageJson(join(root, "package.json"));
  const dependencies = new Set([
    ...Object.keys(packageJson?.dependencies ?? {}),
    ...Object.keys(packageJson?.devDependencies ?? {}),
  ]);
  const frontend =
    ["react", "next", "vite", "vue", "svelte", "@angular/core"].some((name) =>
      dependencies.has(name),
    ) ||
    existsSync(join(root, "src", "App.tsx")) ||
    existsSync(join(root, "src", "App.jsx"));
  if (frontend) evidence.push("frontend markers");

  const backend =
    ["express", "fastify", "@nestjs/core", "koa", "hono"].some((name) => dependencies.has(name)) ||
    ["pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml"].some((name) =>
      existsSync(join(root, name)),
    );
  if (backend) evidence.push("backend/runtime markers");

  const mcpSensitive =
    dependencies.has("@modelcontextprotocol/sdk") ||
    existsSync(join(root, "mcp.json")) ||
    existsSync(join(root, ".mcp.json"));
  if (mcpSensitive) evidence.push("MCP markers");

  return { frontend, backend, mcpSensitive, evidence };
}

function recommend(profile: SetupProjectProfile, toolkit: ToolkitSDK): SetupRecommendation[] {
  const ids = new Set<string>();
  const result: SetupRecommendation[] = [];
  const add = (id: string, reason: string): void => {
    if (ids.has(id) || toolkit.registry.getTool(id) === undefined) return;
    ids.add(id);
    const record = toolkit.registry.getTool(id);
    result.push({
      id,
      kind: record?.installMethods.some((method) => method.type === "skill") ? "skill" : "tool",
      reason,
    });
  };

  if (profile.frontend) {
    add(
      "playwright-cli",
      "Frontend markers detected; browser and responsive verification is useful.",
    );
    add("webapp-testing", "Frontend markers detected; add a repeatable web testing workflow.");
    add("react-best-practices", "React-compatible project detected; use the curated UI guidance.");
  }
  if (profile.backend) {
    add(
      "systematic-debugging",
      "Backend/runtime markers detected; add a reproducible debugging workflow.",
    );
    add(
      "verification-before-completion",
      "Backend/runtime markers detected; verify changes before reporting success.",
    );
  }
  if (profile.mcpSensitive) {
    add("mcp-builder", "MCP markers detected; use the curated MCP implementation workflow.");
  }
  if (result.length === 0) {
    add(
      "deep-research",
      "No project-specific markers detected; start with a general research workflow.",
    );
    add("verification-before-completion", "Every project benefits from explicit verification.");
  }
  return result;
}

function normalizeSelection(
  selected: readonly string[] | undefined,
  recommendations: readonly SetupRecommendation[],
): string[] {
  const values = selected === undefined ? recommendations.map((item) => item.id) : selected;
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function readPackageJson(path: string): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} | null {
  if (!existsSync(path)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const dependencies = record["dependencies"];
    const devDependencies = record["devDependencies"];
    return {
      ...(isStringMap(dependencies) ? { dependencies } : {}),
      ...(isStringMap(devDependencies) ? { devDependencies } : {}),
    };
  } catch {
    return null;
  }
}

function isStringMap(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}
