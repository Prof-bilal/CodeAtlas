import type {
  AgentPort,
  CompatibilityCheck,
  CompatibilityEvaluationInput,
  CompatibilityPort,
  CompatibilityReport,
  CompatibilityRuntime,
  CompatibilityState,
  ToolInstallMethodType,
} from "@atlas/core";
import { type Result, ok } from "@atlas/shared";
import { EnvironmentDetector, findExecutable } from "./environment";
import { CompatibilityError } from "./errors";
import type { ToolManifest } from "./manifest-schema";
import { extractVersion, satisfiesVersionRange } from "./version-range";

/** Options for constructing a {@link CompatibilityEngineService}. */
export interface CompatibilityEngineOptions {
  /**
   * AI-CLI detection source. The engine routes every agent availability/version
   * check through this port and **never** reimplements executable detection.
   */
  readonly agentPort: AgentPort;
  /** Detected environment; defaults to the real {@link EnvironmentDetector}. */
  readonly environment?: EnvironmentDetector;
}

/**
 * The Compatibility Engine (Task 21): determines whether a tool **can safely
 * operate in the user's environment** before any install or configuration step.
 *
 * It compares a tool's declared compatibility requirements (from a Tool
 * Manifest) against the detected environment — OS, architecture, runtimes,
 * package-manager availability, AI CLIs (via `AgentPort`), MCP, and declared
 * permissions — and returns one of four states with per-check evidence.
 *
 * It **never installs anything** and **never fails open**: an `incompatible`
 * tool is reported as not installable here. `unknown` means "cannot determine"
 * and is flagged, never guessed.
 */
export class CompatibilityEngineService implements CompatibilityPort {
  private readonly agentPort: AgentPort;
  private readonly environment: EnvironmentDetector;

  public constructor(options: CompatibilityEngineOptions) {
    if (options.agentPort === undefined) {
      throw new CompatibilityError(
        "CompatibilityEngineService requires an AgentPort for AI-CLI detection",
      );
    }
    this.agentPort = options.agentPort;
    this.environment = options.environment ?? new EnvironmentDetector();
  }

  public async evaluate(input: CompatibilityEvaluationInput): Promise<Result<CompatibilityReport>> {
    const checks: CompatibilityCheck[] = [];
    checks.push(this.checkOs(input.requirements.os));
    checks.push(this.checkArchitecture(input.requirements.architecture));
    checks.push(this.checkRuntimes(input.requirements.runtimes));
    checks.push(await this.checkAgents(input.requirements.agents));
    if (input.requirements.mcp) {
      checks.push(this.checkMcp());
    }
    if (input.installMethod !== null) {
      const packageManager = this.checkPackageManager(input.installMethod);
      if (packageManager !== null) {
        checks.push(packageManager);
      }
    }
    const permissions = this.checkPermissions(input.requirements.permissions);
    if (permissions !== null) {
      checks.push(permissions);
    }

    const overall = aggregateOverall(checks);
    return ok({
      toolName: input.toolName,
      toolVersion: input.toolVersion,
      overall,
      checks,
      notInstallable: overall === "incompatible",
    });
  }

  /** Evaluate a Tool Manifest's declared compatibility requirements. */
  public async evaluateManifest(manifest: ToolManifest): Promise<Result<CompatibilityReport>> {
    return this.evaluate({
      toolName: manifest.name,
      toolVersion: manifest.toolVersion,
      requirements: manifest.compatibility,
      installMethod: manifest.installation.type,
    });
  }

  private checkOs(declared: readonly string[]): CompatibilityCheck {
    if (declared.length === 0) {
      return {
        id: "os",
        label: "OS",
        state: "compatible",
        detail: `running on ${this.environment.os} (no OS requirement declared)`,
        advisory: false,
      };
    }
    const matched = declared.some((candidate) => normalizeOs(candidate) === this.environment.os);
    return {
      id: "os",
      label: "OS",
      state: matched ? "compatible" : "incompatible",
      detail: matched
        ? `running on ${this.environment.os}`
        : `running on ${this.environment.os}; requires ${declared.join(", ")}`,
      advisory: false,
    };
  }

  private checkArchitecture(declared: readonly string[]): CompatibilityCheck {
    if (declared.length === 0) {
      return {
        id: "architecture",
        label: "Architecture",
        state: "compatible",
        detail: `running on ${this.environment.architecture} (no architecture requirement declared)`,
        advisory: false,
      };
    }
    const matched = declared.some(
      (candidate) => normalizeArch(candidate) === normalizeArch(this.environment.architecture),
    );
    return {
      id: "architecture",
      label: "Architecture",
      state: matched ? "compatible" : "incompatible",
      detail: matched
        ? `running on ${this.environment.architecture}`
        : `running on ${this.environment.architecture}; requires ${declared.join(", ")}`,
      advisory: false,
    };
  }

  private checkRuntimes(declared: readonly CompatibilityRuntime[]): CompatibilityCheck {
    if (declared.length === 0) {
      return {
        id: "runtimes",
        label: "Runtimes",
        state: "compatible",
        detail: "no runtime requirement declared",
        advisory: false,
      };
    }
    const subChecks: CompatibilityCheck[] = declared.map((runtime) => this.checkRuntime(runtime));
    return {
      id: "runtimes",
      label: "Runtimes",
      state: combineSubChecks(subChecks),
      detail: null,
      advisory: false,
      subChecks,
    };
  }

  private checkRuntime(runtime: CompatibilityRuntime): CompatibilityCheck {
    const info = this.environment.findRuntime(runtime.name);
    const label = `${runtime.name}${runtime.versionRange === null ? "" : ` ${runtime.versionRange}`}`;
    if (!info.available) {
      return {
        id: `runtime:${runtime.name}`,
        label,
        state: "incompatible",
        detail: `required runtime '${runtime.name}' not found on PATH`,
        advisory: false,
      };
    }
    if (info.version === null) {
      return {
        id: `runtime:${runtime.name}`,
        label,
        state: "unknown",
        detail: `found ${info.binary} but its version could not be determined`,
        advisory: false,
      };
    }
    if (runtime.versionRange === null) {
      return {
        id: `runtime:${runtime.name}`,
        label,
        state: "compatible",
        detail: `found ${info.binary} (${info.version})`,
        advisory: false,
      };
    }
    const detected = extractVersion(info.version);
    if (detected === null) {
      return {
        id: `runtime:${runtime.name}`,
        label,
        state: "unknown",
        detail: `found ${info.binary} (${info.version}) but its version could not be parsed`,
        advisory: false,
      };
    }
    const satisfied = satisfiesVersionRange(detected, runtime.versionRange);
    return {
      id: `runtime:${runtime.name}`,
      label,
      state: satisfied ? "compatible" : "incompatible",
      detail: satisfied
        ? `found ${info.binary} (${info.version})`
        : `found ${info.binary} (${info.version}); requires ${runtime.versionRange}`,
      advisory: false,
    };
  }

  private async checkAgents(declared: readonly string[]): Promise<CompatibilityCheck> {
    if (declared.length === 0) {
      return {
        id: "agents",
        label: "AI agents",
        state: "compatible",
        detail: "no agent requirement declared",
        advisory: false,
      };
    }
    const subChecks: CompatibilityCheck[] = [];
    for (const agent of declared) {
      subChecks.push(await this.checkAgent(agent));
    }
    return {
      id: "agents",
      label: "AI agents",
      state: combineSubChecks(subChecks),
      detail: null,
      advisory: false,
      subChecks,
    };
  }

  private async checkAgent(agent: string): Promise<CompatibilityCheck> {
    const result = await this.agentPort.detectAgent(agent);
    if (result.ok && result.value.available) {
      const version = result.value.version === undefined ? "" : ` v${result.value.version}`;
      return {
        id: `agent:${agent}`,
        label: agent,
        state: "compatible",
        detail: `found ${result.value.binary}${version}`,
        advisory: false,
      };
    }
    if (result.ok) {
      return {
        id: `agent:${agent}`,
        label: agent,
        state: "incompatible",
        detail: `AI CLI '${result.value.binary}' not found on PATH`,
        advisory: false,
      };
    }
    return {
      id: `agent:${agent}`,
      label: agent,
      state: "unknown",
      detail: `cannot determine availability of '${agent}': ${result.error.message}`,
      advisory: false,
    };
  }

  private checkMcp(): CompatibilityCheck {
    const node = this.environment.findRuntime("node");
    const detail = node.available
      ? `MCP servers run on Node.js — found ${node.binary} (${node.version ?? "unknown version"})`
      : "tool requires MCP, which needs a Node.js runtime — not found on PATH";
    return {
      id: "mcp",
      label: "MCP support",
      state: node.available ? "compatible" : "incompatible",
      detail,
      advisory: false,
    };
  }

  private checkPackageManager(installMethod: ToolInstallMethodType): CompatibilityCheck | null {
    // binary / github-release installs fetch an artifact (no package manager);
    // mcp packages install through their own ecosystem's manager (npm/pip),
    // which the declared installation method does not yet name; skill installs
    // clone a repository with git (checked separately).
    if (
      installMethod === "binary" ||
      installMethod === "github-release" ||
      installMethod === "mcp"
    ) {
      return null;
    }
    if (installMethod === "skill") {
      return this.checkSkillRuntime();
    }
    const info = this.environment.findPackageManager(installMethod);
    return {
      id: "package-manager",
      label: `${installMethod} package manager`,
      state: info.available ? "compatible" : "incompatible",
      detail: info.available
        ? `found ${info.binary} on PATH`
        : `package manager '${info.binary}' not found on PATH (required for ${installMethod} installs)`,
      advisory: false,
    };
  }

  private checkSkillRuntime(): CompatibilityCheck {
    const git = findExecutable("git");
    return {
      id: "package-manager",
      label: "git",
      state: git === null ? "incompatible" : "compatible",
      detail:
        git === null ? "git not found on PATH (required for skill installs)" : "found git on PATH",
      advisory: false,
    };
  }

  private checkPermissions(declared: readonly string[]): CompatibilityCheck | null {
    if (declared.length === 0) {
      return null;
    }
    return {
      id: "permissions",
      label: "Permissions",
      state: "unknown",
      detail: `declared permissions: ${declared.join(", ")} — availability is enforced by the installer's consent flow, not pre-verified here`,
      advisory: true,
    };
  }
}

/**
 * Combine a group's sub-checks into one of the four states:
 * - any sub-check incompatible → `incompatible` when none is usable,
 *   otherwise `partially-compatible`;
 * - otherwise any unknown → `unknown` (flagged, never guessed);
 * - otherwise `compatible`.
 */
function combineSubChecks(subChecks: readonly CompatibilityCheck[]): CompatibilityState {
  const states = subChecks.map((check) => check.state);
  if (states.includes("incompatible")) {
    const anyUsable = states.includes("compatible") || states.includes("partially-compatible");
    return anyUsable ? "partially-compatible" : "incompatible";
  }
  if (states.includes("unknown")) {
    return "unknown";
  }
  if (states.includes("partially-compatible")) {
    return "partially-compatible";
  }
  return "compatible";
}

/**
 * Overall verdict, **fail-closed**: any incompatible non-advisory check →
 * `incompatible`; else any unknown → `unknown`; else any partial →
 * `partially-compatible`; else `compatible`. Advisory checks (permissions) are
 * reported but never downgrade the verdict.
 */
function aggregateOverall(checks: readonly CompatibilityCheck[]): CompatibilityState {
  const required = checks.filter((check) => !check.advisory);
  const states = required.map((check) => check.state);
  if (states.includes("incompatible")) {
    return "incompatible";
  }
  if (states.includes("unknown")) {
    return "unknown";
  }
  if (states.includes("partially-compatible")) {
    return "partially-compatible";
  }
  return "compatible";
}

function normalizeOs(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "windows" || normalized === "win" || normalized === "win32") {
    return "win32";
  }
  if (normalized === "macos" || normalized === "mac" || normalized === "osx") {
    return "darwin";
  }
  if (normalized === "unix") {
    return "linux";
  }
  return normalized;
}

function normalizeArch(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  if (normalized === "amd64" || normalized === "x8664" || normalized === "x64_64") {
    return "x64";
  }
  if (normalized === "aarch64" || normalized === "armv8") {
    return "arm64";
  }
  return normalized;
}
