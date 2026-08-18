import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type {
  CompatibilityPort,
  CompatibilityReport,
  ConfiguratorPort,
  ConfigureOutcome,
  InstallApproval,
  InstallOutcome,
  InstallPlan,
  InstallRemovalOutcome,
  InstallerPort,
  ToolInstallRequest,
  ToolRegistryPort,
  ToolRegistryRecord,
} from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import {
  type ToolManifest,
  listInstalledTools,
  loadToolManifest,
  toolManifestPath,
} from "@atlas/toolkit";
import { createCompatibilityEngine } from "./compatibility";
import { createConfigurator } from "./configurator";
import { createInstaller } from "./installer";
import { createToolRegistry } from "./registry";

export interface ToolkitDoctorEntry {
  readonly name: string;
  readonly manifest: "present" | "missing" | "invalid";
  readonly integration: string;
  readonly trust: string;
  readonly compatibility: CompatibilityReport | null;
  readonly conflicts: readonly string[];
}

export interface ToolkitRemoveOutcome extends InstallRemovalOutcome {
  readonly configuration: "not-managed" | "cleaned";
}

export interface ToolkitUpdateOutcome {
  readonly registryTools: number;
  readonly installedTools: number;
  readonly updated: readonly {
    readonly name: string;
    readonly status: "updated" | "unchanged" | "error";
    readonly note: string;
  }[];
  readonly note: string;
}

export interface ToolkitSDK {
  readonly registry: ToolRegistryPort;
  overview(): Promise<
    Result<{
      readonly recommended: readonly ToolRegistryRecord[];
      readonly installed: readonly ToolManifest[];
    }>
  >;
  search(query: string): readonly ToolRegistryRecord[];
  /** All tools in a given category. */
  listByCategory(category: string): readonly ToolRegistryRecord[];
  info(name: string): Promise<
    Result<{
      readonly tool: ToolRegistryRecord;
      readonly manifest: ToolManifest | null;
      readonly compatibility: CompatibilityReport | null;
    }>
  >;
  planInstall(name: string): Promise<Result<InstallPlan>>;
  install(name: string, approval: InstallApproval): Promise<Result<InstallOutcome>>;
  remove(name: string): Promise<Result<ToolkitRemoveOutcome>>;
  update(approval?: InstallApproval): Promise<Result<ToolkitUpdateOutcome>>;
  doctor(): Promise<Result<readonly ToolkitDoctorEntry[]>>;
  configure(
    name: string,
    options?: { readonly dryRun?: boolean; readonly configHome?: string },
  ): Promise<Result<ConfigureOutcome>>;
}

export interface CreateToolkitSDKOptions {
  readonly root?: string;
  readonly configHome?: string;
  readonly registry?: ToolRegistryPort;
  readonly installer?: InstallerPort;
  readonly configurator?: ConfiguratorPort;
  readonly compatibility?: CompatibilityPort;
}

export function createToolkitSDK(options: CreateToolkitSDKOptions = {}): ToolkitSDK {
  const root = options.root ?? process.cwd();
  const registry = options.registry ?? createToolRegistry();
  const compatibility = options.compatibility ?? createCompatibilityEngine();
  const installer = options.installer ?? createInstaller({ compatibility });
  const configurator = options.configurator ?? createConfigurator();

  async function manifests(): Promise<Result<readonly ToolManifest[]>> {
    const names = await listInstalledTools(root);
    if (!names.ok) return fail(names.error);
    const loaded: ToolManifest[] = [];
    for (const name of names.value) {
      const result = await loadToolManifest(toolManifestPath(root, name));
      if (!result.ok) return fail(result.error);
      if (result.value !== null) loaded.push(result.value);
    }
    return ok(loaded);
  }

  function request(record: ToolRegistryRecord): Result<ToolInstallRequest> {
    const method = record.installMethods.find((candidate) =>
      installer.implementedTypes.includes(candidate.type),
    );
    if (method === undefined) {
      return fail(
        new Error(
          `No supported installer is available for ${record.name}; declared methods: ${record.installMethods.map((item) => item.type).join(", ") || "none"}.`,
        ),
      );
    }
    const type = method.type;
    return ok({
      name: record.name,
      description: record.description,
      toolVersion: record.version,
      installation: {
        type,
        package: method?.packageId ?? record.name,
        source: null,
        checksum: null,
        versionRange: null,
        ...(method.note !== undefined ? { note: method.note } : {}),
      },
      security: {
        status: record.security.status,
        trust: record.trust,
        ...(record.security.note !== undefined ? { note: record.security.note } : {}),
      },
      compatibility: {
        toolName: record.name,
        toolVersion: record.version,
        requirements: {
          os: record.supportedOs,
          runtimes: [],
          agents: record.supportedAgents,
          mcp: record.installMethods.some((candidate) => candidate.type === "mcp"),
          architecture: [],
          permissions: [],
        },
        installMethod: type,
      },
      cwd: root,
      license: record.license,
      repository: record.repository,
      documentation: record.documentation,
      categories: record.categories,
      supportedAgents: record.supportedAgents,
    });
  }

  return {
    registry,
    async overview() {
      const installed = await manifests();
      if (!installed.ok) return fail(installed.error);
      // The recommended view is the curated Top-N (tier === "recommended"),
      // never every catalog tool (P2-01).
      const recommended = registry.listTools().filter((tool) => tool.tier === "recommended");
      return ok({ recommended, installed: installed.value });
    },
    search(query) {
      return registry.searchTools(query);
    },
    listByCategory(category) {
      return registry
        .listTools()
        .filter((tool) => tool.categories.some((c) => c.toLowerCase() === category.toLowerCase()));
    },
    async info(name) {
      const tool = registry.getTool(name);
      if (tool === undefined) return fail(new Error(`Tool not found: ${name}`));
      const loaded = await loadToolManifest(toolManifestPath(root, name));
      if (!loaded.ok) return fail(loaded.error);
      const method = tool.installMethods.find((candidate) =>
        installer.implementedTypes.includes(candidate.type),
      );
      const compatibilityResult = await compatibility.evaluate({
        toolName: tool.name,
        toolVersion: tool.version,
        requirements: {
          os: tool.supportedOs,
          runtimes: [],
          agents: tool.supportedAgents,
          mcp: tool.installMethods.some((candidate) => candidate.type === "mcp"),
          architecture: [],
          permissions: [],
        },
        installMethod: method?.type ?? null,
      });
      const compatibilityReport = compatibilityResult.ok ? compatibilityResult.value : null;
      return ok({ tool, manifest: loaded.value, compatibility: compatibilityReport });
    },
    async planInstall(name) {
      const tool = registry.getTool(name);
      if (tool === undefined) return fail(new Error(`Tool not found: ${name}`));
      const prepared = request(tool);
      if (!prepared.ok) return prepared;
      return installer.plan(prepared.value);
    },
    async install(name, approval) {
      const tool = registry.getTool(name);
      if (tool === undefined) return fail(new Error(`Tool not found: ${name}`));
      const prepared = request(tool);
      if (!prepared.ok) return prepared;
      return installer.install(prepared.value, approval);
    },
    async remove(name) {
      const tool = registry.getTool(name);
      if (tool === undefined) return fail(new Error(`Tool not found: ${name}`));
      const prepared = request(tool);
      if (!prepared.ok) return prepared;
      const path = toolManifestPath(root, name);
      // Skills are a clone on disk, not a package-manager artifact — removing
      // them is deleting the cloned directory plus the manifest, which is the
      // SDK's job (there is no ecosystem uninstall command).
      if (prepared.value.installation.type === "skill") {
        const skillDir = join(root, ".codeatlas", "skills", name);
        if (existsSync(skillDir)) await rm(skillDir, { recursive: true, force: true });
        if (existsSync(path)) await rm(path, { force: true });
        const cleaned = await configurator.unconfigure(name);
        return ok({
          toolName: name,
          removed: true,
          note: "Skill directory and manifest removed.",
          configuration: cleaned.ok && cleaned.value.length > 0 ? "cleaned" : "not-managed",
        });
      }
      const removed = await installer.remove(prepared.value);
      if (!removed.ok) return fail(removed.error);
      if (existsSync(path)) await rm(path, { force: true });
      const cleaned = await configurator.unconfigure(name);
      return ok({
        ...removed.value,
        configuration: cleaned.ok && cleaned.value.length > 0 ? "cleaned" : "not-managed",
        note:
          cleaned.ok && cleaned.value.length > 0
            ? `Tool removed. Agent configuration cleaned from ${cleaned.value.length} file(s).`
            : `${removed.value.note} No agent configuration was found to clean up.`,
      });
    },
    async update(approval) {
      const installed = await manifests();
      if (!installed.ok) return fail(installed.error);
      const execFileAsync = promisify(execFile);
      const results: {
        readonly name: string;
        readonly status: "updated" | "unchanged" | "error";
        readonly note: string;
      }[] = [];

      for (const manifest of installed.value) {
        const tool = registry.getTool(manifest.name);
        if (tool === undefined) {
          results.push({
            name: manifest.name,
            status: "unchanged",
            note: "Not in registry; skipped.",
          });
          continue;
        }
        const method = tool.installMethods.find((candidate) =>
          installer.implementedTypes.includes(candidate.type),
        );
        if (method === undefined) {
          results.push({
            name: manifest.name,
            status: "unchanged",
            note: "No supported installer.",
          });
          continue;
        }
        if (method.type === "skill") {
          const skillDir = join(root, ".codeatlas", "skills", manifest.name);
          if (!existsSync(skillDir)) {
            results.push({
              name: manifest.name,
              status: "error",
              note: "Skill directory missing.",
            });
            continue;
          }
          try {
            await execFileAsync("git", ["-C", skillDir, "pull", "--ff-only"]);
            results.push({
              name: manifest.name,
              status: "updated",
              note: "Skill updated via git pull.",
            });
          } catch {
            results.push({ name: manifest.name, status: "error", note: "git pull failed." });
          }
          continue;
        }
        if (approval === undefined) {
          results.push({
            name: manifest.name,
            status: "unchanged",
            note: "Approval required; re-run with approval to update.",
          });
          continue;
        }
        const requestResult = request(tool);
        if (!requestResult.ok) {
          results.push({ name: manifest.name, status: "error", note: requestResult.error.message });
          continue;
        }
        const installResult = await installer.install(requestResult.value, approval);
        if (installResult.ok) {
          results.push({
            name: manifest.name,
            status: "updated",
            note: "Re-installed successfully.",
          });
        } else {
          results.push({ name: manifest.name, status: "error", note: installResult.error.message });
        }
      }

      return ok({
        registryTools: registry.listTools().length,
        installedTools: installed.value.length,
        updated: results,
        note: `Updated ${results.filter((u) => u.status === "updated").length} of ${installed.value.length} installed tools.`,
      });
    },
    async doctor() {
      const installed = await manifests();
      if (!installed.ok) return fail(installed.error);

      // Build a map of tool name → list of installed tools sharing a package id.
      const packageOwners = new Map<string, string[]>();
      for (const manifest of installed.value) {
        const tool = registry.getTool(manifest.name);
        if (tool === undefined) continue;
        for (const method of tool.installMethods) {
          const pkg = method.packageId ?? manifest.name;
          const owners = packageOwners.get(pkg) ?? [];
          owners.push(manifest.name);
          packageOwners.set(pkg, owners);
        }
      }

      const entries: ToolkitDoctorEntry[] = [];
      for (const manifest of installed.value) {
        const tool = registry.getTool(manifest.name);
        let compatibilityReport: CompatibilityReport | null = null;
        if (tool !== undefined) {
          const method = tool.installMethods.find((candidate) =>
            installer.implementedTypes.includes(candidate.type),
          );
          const evalResult = await compatibility.evaluate({
            toolName: tool.name,
            toolVersion: tool.version,
            requirements: {
              os: tool.supportedOs,
              runtimes: [],
              agents: tool.supportedAgents,
              mcp: tool.installMethods.some((candidate) => candidate.type === "mcp"),
              architecture: [],
              permissions: [],
            },
            installMethod: method?.type ?? null,
          });
          if (evalResult.ok) compatibilityReport = evalResult.value;
        }

        // Detect conflicts: other installed tools sharing a package id.
        const conflicts: string[] = [];
        if (tool !== undefined) {
          for (const method of tool.installMethods) {
            const pkg = method.packageId ?? manifest.name;
            const owners = packageOwners.get(pkg);
            if (owners !== undefined) {
              for (const other of owners) {
                if (other !== manifest.name && !conflicts.includes(other)) {
                  conflicts.push(other);
                }
              }
            }
          }
        }

        entries.push({
          name: manifest.name,
          manifest: "present" as const,
          integration: manifest.integrationState.status,
          trust: manifest.security.trust,
          compatibility: compatibilityReport,
          conflicts,
        });
      }
      return ok(entries);
    },
    configure(name, configureOptions = {}) {
      const tool = registry.getTool(name);
      if (tool === undefined) return Promise.resolve(fail(new Error(`Tool not found: ${name}`)));
      return loadToolManifest(toolManifestPath(root, name)).then((loaded) => {
        if (!loaded.ok) return fail(loaded.error);
        if (loaded.value === null) {
          return fail(new Error(`Tool is not installed: ${name}`));
        }
        const manifest = loaded.value;
        return configurator.configure(
          {
            toolName: name,
            toolVersion: manifest.toolVersion,
            supportedAgents: manifest.supportedAgents,
            mcp: manifest.compatibility.mcp || manifest.installation.type === "mcp",
            ...(configureOptions.configHome !== undefined
              ? { configHome: configureOptions.configHome }
              : options.configHome !== undefined
                ? { configHome: options.configHome }
                : {}),
          },
          { dryRun: configureOptions.dryRun === true },
        );
      });
    },
  };
}
