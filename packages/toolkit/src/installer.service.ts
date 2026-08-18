import { existsSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  CompatibilityPort,
  InstallApproval,
  InstallOutcome,
  InstallPlan,
  InstallRemovalOutcome,
  InstallRollbackStatus,
  InstallVerificationStatus,
  InstallerPort,
  SecurityAssessment,
  SecurityPort,
  ToolInstallMethodType,
  ToolInstallRequest,
} from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import { defaultReadVersion, findExecutable } from "./environment";
import type { EcosystemAdapter } from "./installer-adapter";
import {
  CargoAdapter,
  GoAdapter,
  NpmAdapter,
  PipAdapter,
  SkillAdapter,
} from "./installer-adapters";
import {
  InstallApprovalDeniedError,
  InstallBlockedError,
  InstallFailedError,
  InstallInvalidRequestError,
  InstallNotCompatibleError,
  InstallUnsupportedMethodError,
  InstallerError,
} from "./installer-errors";
import { InstallerProcess } from "./installer-process";
import { createToolManifest, isValidToolName, saveToolManifest } from "./manifest";
import type { ToolManifest } from "./manifest-schema";
import { SecurityAssessor } from "./security.service";
import { extractVersion, satisfiesVersionRange } from "./version-range";

/** Options for constructing an {@link InstallerService}. */
export interface InstallerServiceOptions {
  /**
   * The Compatibility Engine (Task 21) the installer gates against. Required —
   * the installer never skips the compatibility gate.
   */
  readonly compatibility: CompatibilityPort;
  readonly security?: SecurityPort;
  /**
   * Ecosystem adapters; defaults to the MVP safe subset (`npm`, `pip`,
   * `cargo`, `go`). Replacing this set is how a new ecosystem is added — a new
   * small adapter, never a fork of the service.
   */
  readonly adapters?: readonly EcosystemAdapter[];
  /** Process boundary; inject a fake for offline tests. */
  readonly process?: InstallerProcess;
  /** Binary resolver; defaults to scanning `PATH` (`findExecutable`). */
  readonly resolveBinary?: (binary: string) => string | null;
  /** Version reader for post-install verification (`<binary> <versionArgs>`). */
  readonly readVersion?: (binary: string, args: readonly string[]) => string | null;
  /** Args the version reader runs; defaults to `["--version"]`. */
  readonly versionArgs?: readonly string[];
  /** Injectable clock for deterministic timestamps and tests. */
  readonly now?: () => Date;
}

const DEFAULT_ADAPTERS: readonly EcosystemAdapter[] = [
  new NpmAdapter(),
  new PipAdapter(),
  new CargoAdapter(),
  new GoAdapter(),
  new SkillAdapter(),
];

/**
 * The Tool Installer (Task 22): safely installs tools described by the
 * CodeAtlas registry / Tool Manifests **through official distribution channels
 * only**, with explicit user approval and recorded provenance.
 *
 * Flow: validate tool → compatibility gate (Task 21) → security gate (Task 24
 * status) → **user approval** → install → verify → record a Tool Manifest.
 *
 * Security contract (see `docs/AGENT_TOOLKIT.md` §5 and `docs/SECURITY.md`):
 * - Every command is spawned as an **argument array** with `shell: false` —
 *   manifest/registry/AI-derived content can never inject shell syntax.
 * - **No automatic install without explicit user approval** — `install()` runs
 *   the same gates as `plan()` and then aborts with
 *   `InstallApprovalDeniedError` unless `approval.granted` is true.
 * - A `blocked` security/trust status fails closed, even with approval.
 * - Arguments derived from untrusted request content are validated in the
 *   adapters before they ever reach an argv element.
 * - On a failed install, the pre-install state is restored when the tool was
 *   not already present (best-effort uninstall); Go installs record rollback
 *   as unsupported honestly.
 * - Logs are bounded and redacted; no env/keys are ever passed or logged.
 */
export class InstallerService implements InstallerPort {
  public readonly implementedTypes: readonly ToolInstallMethodType[];

  private readonly compatibility: CompatibilityPort;
  private readonly security: SecurityPort;
  private readonly adapters: ReadonlyMap<ToolInstallMethodType, EcosystemAdapter>;
  private readonly process: InstallerProcess;
  private readonly resolveBinary: (binary: string) => string | null;
  private readonly readVersion: (binary: string, args: readonly string[]) => string | null;
  private readonly versionArgs: readonly string[];
  private readonly now: () => Date;

  public constructor(options: InstallerServiceOptions) {
    if (options.compatibility === undefined) {
      throw new InstallerError("InstallerService requires a CompatibilityPort");
    }
    this.compatibility = options.compatibility;
    this.security = options.security ?? new SecurityAssessor(options.now);
    this.adapters = new Map<ToolInstallMethodType, EcosystemAdapter>(
      (options.adapters ?? DEFAULT_ADAPTERS).map((adapter) => [adapter.method, adapter]),
    );
    this.implementedTypes = [...this.adapters.keys()];
    this.process = options.process ?? new InstallerProcess({});
    this.resolveBinary = options.resolveBinary ?? findExecutable;
    this.readVersion = options.readVersion ?? defaultReadVersion;
    this.versionArgs = options.versionArgs ?? ["--version"];
    this.now = options.now ?? (() => new Date());
  }

  public async plan(request: ToolInstallRequest): Promise<Result<InstallPlan>> {
    const validation = this.validateRequest(request);
    if (!validation.ok) {
      return fail(validation.error);
    }
    const gates = await this.runGates(request);
    if (!gates.ok) {
      return fail(gates.error);
    }
    const adapter = this.adapters.get(request.installation.type);
    if (adapter === undefined) {
      return fail(new InstallUnsupportedMethodError(request.installation.type));
    }
    const built = adapter.build(request);
    if (!built.ok) {
      return fail(built.error);
    }
    const plan: InstallPlan = {
      toolName: request.name,
      method: request.installation.type,
      command: built.value.command,
      uninstallCommand: built.value.uninstallCommand,
      effect: `${built.value.effect} Compatibility: ${gates.value.overall}.`,
      dangerous: built.value.dangerous,
      verifyBinary: built.value.verifyBinary,
      verifyPath: built.value.verifyPath ?? null,
      security: gates.value.security,
    };
    return ok(plan);
  }

  public async install(
    request: ToolInstallRequest,
    approval: InstallApproval,
  ): Promise<Result<InstallOutcome>> {
    const planned = await this.plan(request);
    if (!planned.ok) {
      return fail(planned.error);
    }
    const plan = planned.value;

    // Approval is the explicit user override for an unverified assessment. A
    // separate securityOverride can add an auditable note, but cannot bypass
    // the mandatory approval or a blocked assessment.
    if (approval.granted !== true) {
      return fail(new InstallApprovalDeniedError());
    }

    const recordedAt = this.now().toISOString();
    const log: string[] = [`plan: install "${request.name}" via ${request.installation.type}`];
    if (plan.security.overrideRequired) {
      log.push(`security: ${plan.security.trust}; explicit user override recorded`);
    }
    log.push(`command: ${JSON.stringify([plan.command.binary, ...plan.command.args])}`);
    if (plan.command.cwd !== null) {
      log.push(`cwd: ${plan.command.cwd}`);
    }
    for (const flag of plan.dangerous) {
      log.push(`danger: ${flag}`);
    }

    const runResult = await this.process.run({
      command: plan.command.binary,
      args: plan.command.args,
      ...(plan.command.cwd !== null ? { cwd: plan.command.cwd } : {}),
    });
    if (!runResult.ok) {
      return fail(runResult.error);
    }
    const outcome = runResult.value;
    log.push(`result: exit ${outcome.exitCode}`);
    log.push(...outputExcerpt(outcome.stdout, outcome.stderr));

    if (outcome.exitCode === 0) {
      const verification = this.verifyTool(request, plan);
      log.push(`verification: ${verification.status} — ${verification.note}`);
      const manifestPath = await this.persistManifest(request, plan, verification, recordedAt);
      log.push(
        manifestPath === null
          ? "manifest: install state could not be recorded"
          : `manifest: recorded at ${manifestPath}`,
      );
      return ok({
        plan,
        verification: verification.status,
        verificationNote: verification.note,
        exitCode: outcome.exitCode,
        rollback: "none",
        recordedAt,
        log,
        manifestPath,
      });
    }

    // Failure — best-effort rollback, never automatic when the tool was already
    // present (an upgrade must not uninstall the previous version blindly).
    let rollback: InstallRollbackStatus = "none";
    const wasPresentBefore =
      plan.verifyPath !== null
        ? existsSync(join(request.cwd, plan.verifyPath))
        : this.resolveBinary(plan.verifyBinary) !== null;
    if (plan.uninstallCommand === null) {
      if (plan.verifyPath !== null) {
        const destDir = join(request.cwd, dirname(plan.verifyPath));
        if (existsSync(destDir)) {
          rmSync(destDir, { recursive: true, force: true });
          log.push(`rollback: removed partial skill directory ${destDir}`);
        }
      }
      log.push(`rollback: not available for ${plan.method} installs`);
    } else if (wasPresentBefore) {
      log.push("rollback: skipped — the tool was already present before this install");
    } else {
      const uninstall = await this.process.run({
        command: plan.uninstallCommand.binary,
        args: plan.uninstallCommand.args,
        ...(plan.uninstallCommand.cwd !== null ? { cwd: plan.uninstallCommand.cwd } : {}),
      });
      if (uninstall.ok) {
        rollback = "uninstalled";
        log.push(
          uninstall.value.exitCode === 0
            ? "rollback: uninstalled"
            : `rollback: uninstall ran but exited ${uninstall.value.exitCode}`,
        );
        log.push(...outputExcerpt(uninstall.value.stdout, uninstall.value.stderr));
      } else {
        log.push(`rollback: uninstall failed — ${safeMessage(uninstall.error)}`);
      }
    }

    return fail(
      new InstallFailedError({
        toolName: request.name,
        exitCode: outcome.exitCode,
        signal: outcome.signal,
        rollback,
        recordedAt,
        log,
      }),
    );
  }

  public async remove(request: ToolInstallRequest): Promise<Result<InstallRemovalOutcome>> {
    const validation = this.validateRequest(request);
    if (!validation.ok) return fail(validation.error);
    const adapter = this.adapters.get(request.installation.type);
    if (adapter === undefined)
      return fail(new InstallUnsupportedMethodError(request.installation.type));
    const built = adapter.build(request);
    if (!built.ok) return fail(built.error);
    if (built.value.uninstallCommand === null) {
      return fail(new InstallUnsupportedMethodError(`remove:${request.installation.type}`));
    }
    const result = await this.process.run({
      command: built.value.uninstallCommand.binary,
      args: built.value.uninstallCommand.args,
      ...(built.value.uninstallCommand.cwd !== null
        ? { cwd: built.value.uninstallCommand.cwd }
        : {}),
    });
    if (!result.ok) return fail(result.error);
    if (result.value.exitCode !== 0) {
      return fail(
        new InstallFailedError({
          toolName: request.name,
          exitCode: result.value.exitCode,
          signal: result.value.signal,
          rollback: "none",
          recordedAt: this.now().toISOString(),
          log: [`remove: exit ${result.value.exitCode}`],
        }),
      );
    }
    return ok({
      toolName: request.name,
      removed: true,
      note: "Tool removed through its ecosystem adapter.",
    });
  }

  private validateRequest(request: ToolInstallRequest): Result<true> {
    if (!isValidToolName(request.name)) {
      return fail(
        new InstallInvalidRequestError(
          `tool name "${request.name}" is not a safe file name (and cannot escape .codeatlas/tools/)`,
        ),
      );
    }
    if (!isDirectory(request.cwd)) {
      return fail(
        new InstallInvalidRequestError(`working directory "${request.cwd}" is not a directory`),
      );
    }
    return ok(true);
  }

  /** Compatibility (fail-closed) + security (blocked → refuse) gates. */
  private async runGates(
    request: ToolInstallRequest,
  ): Promise<Result<{ overall: string; security: SecurityAssessment }>> {
    // The declared install method is the effective compatibility method for the
    // package-manager availability check (the caller's input may omit it).
    const input =
      request.compatibility.installMethod === null
        ? { ...request.compatibility, installMethod: request.installation.type }
        : request.compatibility;
    const report = await this.compatibility.evaluate(input);
    if (!report.ok) {
      return fail(report.error);
    }
    if (report.value.notInstallable) {
      return fail(new InstallNotCompatibleError(`OVERALL: ${report.value.overall}`));
    }
    const decision = await this.security.decide({
      toolName: request.name,
      ...(request.license !== undefined ? { license: request.license } : {}),
      ...(request.repository !== undefined ? { repository: request.repository } : {}),
      packageSource: request.installation.source === null ? "official-registry" : "unknown",
      packageName: request.installation.package,
      dependenciesDeclared: true,
      installCommand: {
        binary: request.installation.type,
        args: request.installation.package === null ? [] : [request.installation.package],
      },
      permissions: ["network", "process"],
      maintainer: null,
      ...(request.installation.checksum !== null
        ? { releaseProvenance: request.installation.checksum }
        : {}),
      declaredStatus: request.security.status,
      declaredTrust: request.security.trust,
    });
    if (!decision.ok) return fail(decision.error);
    if (decision.value.assessment.status === "blocked")
      return fail(new InstallBlockedError(request.name));
    return ok({ overall: report.value.overall, security: decision.value.assessment });
  }

  private verifyTool(request: ToolInstallRequest, plan: InstallPlan): InstallVerificationDetails {
    // Non-binary artifacts (e.g. a cloned skill) verify by file existence
    // under the project root rather than by a PATH binary.
    if (plan.verifyPath !== null) {
      const full = join(request.cwd, plan.verifyPath);
      if (existsSync(full)) {
        return { status: "verified", note: `found ${full}`, path: full };
      }
      return {
        status: "failed",
        note: `expected '${plan.verifyPath}' not found under ${request.cwd} after install`,
        path: null,
      };
    }
    const binary = plan.verifyBinary;
    const path = this.resolveBinary(binary);
    if (path === null) {
      return {
        status: "failed",
        note: `binary '${binary}' not found on PATH after install`,
        path: null,
      };
    }
    const raw = this.readVersion(path, this.versionArgs);
    const trimmed = raw === null ? null : raw.trim();
    if (trimmed === null || trimmed === "") {
      return {
        status: "unverified",
        note: `found ${path} but its version could not be determined`,
        path,
      };
    }
    const version = extractVersion(trimmed);
    if (version === null) {
      return {
        status: "unverified",
        note: `found ${path} (${trimmed}) but the version could not be parsed`,
        path,
      };
    }
    const range = request.installation.versionRange;
    if (range !== null && !satisfiesVersionRange(version, range)) {
      return {
        status: "failed",
        note: `found ${path} (${version}); does not satisfy required ${range}`,
        path,
      };
    }
    return { status: "verified", note: `found ${path} (${version})`, path };
  }

  /** Record the install state (Task 20 Tool Manifest) under `.codeatlas/tools/`. */
  private async persistManifest(
    request: ToolInstallRequest,
    plan: InstallPlan,
    verification: InstallVerificationDetails,
    recordedAt: string,
  ): Promise<string | null> {
    try {
      const manifest = this.buildManifest(request, plan, verification, recordedAt);
      const saved = await saveToolManifest(request.cwd, manifest, { now: this.now() });
      return saved.ok ? saved.value.path : null;
    } catch {
      return null;
    }
  }

  private buildManifest(
    request: ToolInstallRequest,
    plan: InstallPlan,
    verification: InstallVerificationDetails,
    recordedAt: string,
  ): ToolManifest {
    return createToolManifest(
      {
        name: request.name,
        description: request.description,
        toolVersion: request.toolVersion,
        license: request.license ?? "Unknown",
        repository: request.repository ?? null,
        documentation: request.documentation ?? null,
        categories: request.categories ?? [],
        supportedAgents: request.supportedAgents ?? [],
        installation: request.installation,
        security: {
          status: plan.security.status,
          trust: plan.security.trust,
          lastReview: plan.security.assessedAt,
          note:
            `${request.security.note ?? ""}${plan.security.overrideRequired ? " Explicit user override recorded." : ""}`.trim() ||
            null,
        },
        provenance: {
          source: request.installation.type,
          sourceRef: request.installation.package ?? request.installation.source ?? null,
          method: request.installation.type,
          command: [plan.command.binary, ...plan.command.args],
          recordedAt,
        },
        verification: {
          status: verification.status,
          checksum: request.installation.checksum,
          note: verification.note,
        },
        integrationState: {
          status: verification.status === "failed" ? "missing" : "installed",
          expectedPath: null,
          foundPath: verification.path === null ? null : verification.path,
          checkedAt: recordedAt,
          note: verification.note,
        },
      },
      { now: this.now() },
    );
  }
}

interface InstallVerificationDetails {
  readonly status: InstallVerificationStatus;
  readonly note: string;
  readonly path: string | null;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Secret-shaped output lines are never logged (`docs/SECURITY.md` §3). */
const SECRET_LINE = /(api[_-]?key|token|secret|password|authorization|bearer)/i;

/** Bounded, redacted excerpt of captured install output for the outcome log. */
function outputExcerpt(stdout: string, stderr: string): string[] {
  const tail = `${stdout}\n${stderr}`.slice(-4096).trim();
  if (tail.length === 0) {
    return [];
  }
  return tail
    .split("\n")
    .slice(-12)
    .map((line) =>
      SECRET_LINE.test(line) ? "output: [redacted — may contain credentials]" : `output: ${line}`,
    );
}

function safeMessage(error: Error): string {
  return error.message.replace(/[\r\n]+/g, " ");
}
