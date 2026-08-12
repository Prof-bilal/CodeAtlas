import type { InstallPlanCommand, ToolInstallMethodType, ToolInstallRequest } from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import {
  type AdapterPlan,
  type EcosystemAdapter,
  adapterProblems,
  baseBinaryName,
  validateInstallArg,
  validateVersionArg,
} from "./installer-adapter";
import { InstallInvalidRequestError } from "./installer-errors";

/**
 * A plain, exact semantic version (`1.2.3`, `v1.2.3`) — the only shape `cargo
 * --version` and `go install ...@<version>` understand. Anything else is
 * rejected loudly rather than silently approximated.
 */
const PLAIN_VERSION = /^v?\d+(?:\.\d+){0,2}$/;

/** A pip specifier clause (`==/>=/>/<=/</~=/!=` then a version) or a bare
 *  version. npm-style `^`/`~` are **not** pip syntax and are rejected. */
const PIP_CLAUSE = /^(?:==|>=|>|<=|<|~=|!=)?\s*\d+(?:\.\d+)*(?:\.\*)?$/;

function isPipSpecifier(range: string): boolean {
  return range.split(",").every((clause) => PIP_CLAUSE.test(clause.trim()));
}

function command(binary: string, args: readonly string[], cwd: string): InstallPlanCommand {
  return { binary, args, cwd };
}

function reject(problems: readonly string[]): Result<AdapterPlan> {
  return fail(new InstallInvalidRequestError(problems.join("; ")));
}

/** The most permissive ecosystem: `npm` accepts npm-style ranges verbatim. */
export class NpmAdapter implements EcosystemAdapter {
  public readonly method: ToolInstallMethodType = "npm";

  public build(request: ToolInstallRequest): Result<AdapterPlan> {
    const problems: string[] = [];
    adapterProblems(request, problems);
    const pkg = request.installation.package;
    const range = request.installation.versionRange;
    if (pkg === null) {
      return reject(problems.length > 0 ? problems : ["package is required"]);
    }
    const validated = validateInstallArg(pkg, "package", problems);
    if (validated === null) {
      return reject(problems);
    }
    if (range === null) {
      return ok(this.plan(request, validated, validated, null));
    }
    if (validateVersionArg(range, "versionRange", problems) === null) {
      return reject(problems);
    }
    return ok(this.plan(request, validated, `${validated}@${range}`, range));
  }

  private plan(
    request: ToolInstallRequest,
    pkg: string,
    spec: string,
    range: string | null,
  ): AdapterPlan {
    return {
      command: command("npm", ["install", "--global", spec], request.cwd),
      uninstallCommand: command("npm", ["uninstall", "--global", pkg], request.cwd),
      effect: `Install npm package "${pkg}" globally${range === null ? "" : ` at ${range}`} — the exact command is shown below before you approve it.`,
      dangerous: ["network access", "global install", "runs post-install hooks (package scripts)"],
      verifyBinary: baseBinaryName(pkg),
    };
  }
}

/** `pip install --user` writes to the user's site-packages (no admin needed). */
export class PipAdapter implements EcosystemAdapter {
  public readonly method: ToolInstallMethodType = "pip";

  public build(request: ToolInstallRequest): Result<AdapterPlan> {
    const problems: string[] = [];
    adapterProblems(request, problems);
    const pkg = request.installation.package;
    const range = request.installation.versionRange;
    if (pkg === null) {
      return reject(problems.length > 0 ? problems : ["package is required"]);
    }
    const validated = validateInstallArg(pkg, "package", problems);
    if (validated === null) {
      return reject(problems);
    }
    if (range === null) {
      return ok(this.plan(request, validated, validated, null));
    }
    if (validateVersionArg(range, "versionRange", problems) === null) {
      return reject(problems);
    }
    if (!isPipSpecifier(range)) {
      return reject([`versionRange "${range}" is not a pip specifier (use ==, >=, >, <=, <, ~=)`]);
    }
    return ok(this.plan(request, validated, `${validated}${range}`, range));
  }

  private plan(
    request: ToolInstallRequest,
    pkg: string,
    spec: string,
    range: string | null,
  ): AdapterPlan {
    return {
      command: command("pip", ["install", "--user", spec], request.cwd),
      uninstallCommand: command("pip", ["uninstall", "-y", pkg], request.cwd),
      effect: `Install Python package "${pkg}" into the user site-packages${range === null ? "" : ` (${range})`} — the exact command is shown below before you approve it.`,
      dangerous: [
        "network access",
        "installs into the user's Python environment",
        "runs package build scripts",
      ],
      verifyBinary: baseBinaryName(pkg),
    };
  }
}

/** `cargo install <crate>` compiles from crates.io into `~/.cargo/bin`. */
export class CargoAdapter implements EcosystemAdapter {
  public readonly method: ToolInstallMethodType = "cargo";

  public build(request: ToolInstallRequest): Result<AdapterPlan> {
    const problems: string[] = [];
    adapterProblems(request, problems);
    const pkg = request.installation.package;
    const range = request.installation.versionRange;
    if (pkg === null) {
      return reject(problems.length > 0 ? problems : ["package is required"]);
    }
    const validated = validateInstallArg(pkg, "package", problems);
    if (validated === null) {
      return reject(problems);
    }
    if (range === null) {
      return ok(this.plan(request, validated, null, null));
    }
    if (validateVersionArg(range, "versionRange", problems) === null) {
      return reject(problems);
    }
    const exact = range.trim().replace(/^v/, "");
    if (!PLAIN_VERSION.test(range)) {
      return reject([`versionRange "${range}" must be an exact version for cargo install`]);
    }
    return ok(this.plan(request, validated, exact, range));
  }

  private plan(
    request: ToolInstallRequest,
    pkg: string,
    version: string | null,
    range: string | null,
  ): AdapterPlan {
    const commandArgs =
      version === null ? ["install", pkg] : ["install", pkg, "--version", version];
    return {
      command: command("cargo", commandArgs, request.cwd),
      uninstallCommand: command("cargo", ["uninstall", pkg], request.cwd),
      effect: `Install crate "${pkg}" from crates.io${range === null ? "" : ` at ${range}`} — compiles from source into ~/.cargo/bin. The exact command is shown below before you approve it.`,
      dangerous: [
        "network access",
        "global install (into ~/.cargo/bin)",
        "compiles the crate from source",
      ],
      verifyBinary: baseBinaryName(pkg),
    };
  }
}

/** `go install <module>@<version>` (Go ≥1.16) writes into `$GOBIN`. */
export class GoAdapter implements EcosystemAdapter {
  public readonly method: ToolInstallMethodType = "go";

  public build(request: ToolInstallRequest): Result<AdapterPlan> {
    const problems: string[] = [];
    adapterProblems(request, problems);
    const pkg = request.installation.package;
    const range = request.installation.versionRange;
    if (pkg === null) {
      return reject(problems.length > 0 ? problems : ["package is required"]);
    }
    const validated = validateInstallArg(pkg, "package", problems);
    if (validated === null) {
      return reject(problems);
    }
    if (range === null) {
      return ok(this.plan(request, validated, "@latest", null));
    }
    if (validateVersionArg(range, "versionRange", problems) === null) {
      return reject(problems);
    }
    const trimmed = range.trim();
    if (trimmed === "*" || trimmed === "x" || trimmed === "X") {
      return ok(this.plan(request, validated, "@latest", range));
    }
    if (!PLAIN_VERSION.test(trimmed)) {
      return reject([`versionRange "${range}" must be an exact version (or *) for go install`]);
    }
    return ok(this.plan(request, validated, `@${trimmed.replace(/^v/, "")}`, range));
  }

  private plan(
    request: ToolInstallRequest,
    pkg: string,
    suffix: string,
    range: string | null,
  ): AdapterPlan {
    const spec = `${pkg}${suffix}`;
    return {
      command: command("go", ["install", spec], request.cwd),
      // Go has no module-uninstall command; rollback is unsupported and the
      // failed install is recorded honestly.
      uninstallCommand: null,
      effect: `Install Go module "${pkg}"${range === null ? "" : ` pinned to ${range}`} into $GOBIN — the exact command is shown below before you approve it.`,
      dangerous: ["network access", "global install (writes to $GOBIN or $GOPATH/bin)"],
      verifyBinary: baseBinaryName(pkg),
    };
  }
}
