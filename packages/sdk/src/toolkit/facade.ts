import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import type {
  ConfiguratorPort,
  ConfigureOutcome,
  InstallApproval,
  InstallOutcome,
  InstallPlan,
  InstallerPort,
  InstallRemovalOutcome,
  ToolInstallRequest,
  ToolRegistryPort,
  ToolRegistryRecord,
} from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import {
  loadToolManifest,
  listInstalledTools,
  toolManifestPath,
  type ToolManifest,
} from "@atlas/toolkit";
import { createConfigurator } from "./configurator";
import { createInstaller } from "./installer";
import { createToolRegistry } from "./registry";

export interface ToolkitDoctorEntry {
  readonly name: string;
  readonly manifest: "present" | "missing" | "invalid";
  readonly integration: string;
  readonly trust: string;
}

export interface ToolkitRemoveOutcome extends InstallRemovalOutcome {
  readonly configuration: "not-managed";
}

export interface ToolkitUpdateOutcome {
  readonly registryTools: number;
  readonly installedTools: number;
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
  info(
    name: string,
  ): Promise<Result<{ readonly tool: ToolRegistryRecord; readonly manifest: ToolManifest | null }>>;
  planInstall(name: string): Promise<Result<InstallPlan>>;
  install(name: string, approval: InstallApproval): Promise<Result<InstallOutcome>>;
  remove(name: string): Promise<Result<ToolkitRemoveOutcome>>;
  update(): Promise<Result<ToolkitUpdateOutcome>>;
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
}

export function createToolkitSDK(options: CreateToolkitSDKOptions = {}): ToolkitSDK {
  const root = options.root ?? process.cwd();
  const registry = options.registry ?? createToolRegistry();
  const installer = options.installer ?? createInstaller();
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
      return ok({ recommended: registry.listTools(), installed: installed.value });
    },
    search(query) {
      return registry.searchTools(query);
    },
    async info(name) {
      const tool = registry.getTool(name);
      if (tool === undefined) return fail(new Error(`Tool not found: ${name}`));
      const loaded = await loadToolManifest(toolManifestPath(root, name));
      if (!loaded.ok) return fail(loaded.error);
      return ok({ tool, manifest: loaded.value });
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
      const removed = await installer.remove(prepared.value);
      if (!removed.ok) return fail(removed.error);
      const path = toolManifestPath(root, name);
      if (existsSync(path)) await rm(path, { force: true });
      return ok({
        ...removed.value,
        configuration: "not-managed" as const,
        note: `${removed.value.note} Configuration cleanup is not available for targets without a removal contract.`,
      });
    },
    async update() {
      const installed = await manifests();
      if (!installed.ok) return fail(installed.error);
      return ok({
        registryTools: registry.listTools().length,
        installedTools: installed.value.length,
        note: "Registry is loaded from the curated catalog and local overlay; no network refresh is performed.",
      });
    },
    async doctor() {
      const installed = await manifests();
      if (!installed.ok) return fail(installed.error);
      return ok(
        installed.value.map((manifest) => ({
          name: manifest.name,
          manifest: "present" as const,
          integration: manifest.integrationState.status,
          trust: manifest.security.trust,
        })),
      );
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
