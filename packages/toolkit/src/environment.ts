import { execFileSync } from "node:child_process";
import { constants, accessSync } from "node:fs";
import { delimiter, extname, isAbsolute, join } from "node:path";

/**
 * A small PATH resolver used by the Environment Detector to find package
 * managers and runtimes. AI-CLI availability is deliberately **not** resolved
 * here — that goes through `AgentPort` (via `@atlas/agents`); `@atlas/toolkit`
 * cannot import `@atlas/agents`, so this resolver is a narrow local copy used
 * only for non-agent ecosystem binaries.
 */
export function findExecutable(
  binary: string,
  options: { pathEnv?: string; pathext?: string } = {},
): string | null {
  const pathEnv = options.pathEnv ?? process.env["PATH"] ?? "";
  const pathext = options.pathext ?? process.env["PATHEXT"] ?? "";

  if (isAbsolute(binary) || binary.includes("/") || binary.includes("\\")) {
    return isExecutable(binary) ? binary : null;
  }

  const dirs = pathEnv.split(delimiter).filter((dir) => dir.length > 0);
  const extensions =
    process.platform === "win32" ? pathext.split(";").filter((ext) => ext.length > 0) : [""];
  for (const dir of dirs) {
    for (const ext of extensions) {
      const candidate = extname(binary) === "" ? `${binary}${ext}` : binary;
      if (isExecutable(join(dir, candidate))) {
        return join(dir, candidate);
      }
    }
  }
  return null;
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** A detected runtime (Node, Python, Go, .NET, …). */
export interface RuntimeInfo {
  /** The declared runtime name (as written in the manifest). */
  readonly name: string;
  /** The binary actually resolved (e.g. `"python3"`), or the canonical one. */
  readonly binary: string;
  readonly available: boolean;
  /** Raw version text detected (e.g. `"v22.14.0"`), or `null` when unknown. */
  readonly version: string | null;
}

/** A detected package manager (npm, pip, cargo, go). */
export interface PackageManagerInfo {
  readonly name: string;
  readonly binary: string;
  readonly available: boolean;
}

/**
 * Options for {@link EnvironmentDetector}. Every primitive is injectable so
 * tests run fully offline and deterministic.
 */
export interface EnvironmentDetectorOptions {
  /** Defaults to `process.platform` (`"win32"`, `"linux"`, `"darwin"`). */
  readonly platform?: string;
  /** Defaults to `process.arch` (`"x64"`, `"arm64"`, …). */
  readonly arch?: string;
  /** Defaults to `process.version` (only used for the `node` runtime). */
  readonly nodeVersion?: string;
  /** Binary resolver; defaults to scanning `PATH` (see {@link findExecutable}). */
  readonly findExecutable?: (binary: string) => string | null;
  /**
   * Version reader for arbitrary runtimes; runs `<binary> <args>` and returns
   * the raw output (or `null` when it cannot be determined). Defaults to a
   * short, no-shell `execFileSync` wrapper.
   */
  readonly readVersion?: (binary: string, args: readonly string[]) => string | null;
}

const RUNTIME_LOOKUP: Readonly<Record<string, RuntimeSpec>> = {
  node: { versionArgs: ["--version"], candidates: ["node"] },
  nodejs: { versionArgs: ["--version"], candidates: ["node"] },
  python: { versionArgs: ["--version"], candidates: ["python", "python3"] },
  python3: { versionArgs: ["--version"], candidates: ["python3"] },
  go: { versionArgs: ["version"], candidates: ["go"] },
  golang: { versionArgs: ["version"], candidates: ["go"] },
  dotnet: { versionArgs: ["--version"], candidates: ["dotnet"] },
  ".net": { versionArgs: ["--version"], candidates: ["dotnet"] },
  java: { versionArgs: ["-version"], candidates: ["java"] },
  jdk: { versionArgs: ["-version"], candidates: ["java"] },
  ruby: { versionArgs: ["--version"], candidates: ["ruby"] },
  rustc: { versionArgs: ["--version"], candidates: ["rustc"] },
  rust: { versionArgs: ["--version"], candidates: ["rustc"] },
  php: { versionArgs: ["--version"], candidates: ["php"] },
};

interface RuntimeSpec {
  readonly versionArgs: readonly string[];
  readonly candidates: readonly string[];
}

const PACKAGE_MANAGER_BINARIES: Readonly<Record<string, readonly string[]>> = {
  npm: ["npm"],
  pip: ["pip", "pip3"],
  cargo: ["cargo"],
  go: ["go"],
};

/**
 * The Environment Detector (Task 21): reports the static properties of the
 * user's machine (OS, architecture, Node version) and resolves the availability
 * of runtimes and package managers **on demand** (only what a tool declares).
 * All detection is read-only and offline — no network, no implicit installs.
 */
export class EnvironmentDetector {
  public readonly os: string;
  public readonly architecture: string;
  private readonly nodeVersion: string;
  private readonly findExecutable: (binary: string) => string | null;
  private readonly readVersion: (binary: string, args: readonly string[]) => string | null;

  public constructor(options: EnvironmentDetectorOptions = {}) {
    this.os = options.platform ?? process.platform;
    this.architecture = options.arch ?? process.arch;
    this.nodeVersion = options.nodeVersion ?? process.version;
    this.findExecutable = options.findExecutable ?? findExecutable;
    this.readVersion = options.readVersion ?? defaultReadVersion;
  }

  /** Detect one runtime; only runs a version command when the binary exists. */
  public findRuntime(name: string): RuntimeInfo {
    const key = name.trim().toLowerCase();
    if (key === "node" || key === "nodejs") {
      const available = this.findExecutable("node") !== null;
      return {
        name,
        binary: "node",
        available,
        version: available ? this.nodeVersion : null,
      };
    }
    const spec = RUNTIME_LOOKUP[key] ?? {
      versionArgs: ["--version"],
      candidates: [key],
    };
    for (const binary of spec.candidates) {
      if (this.findExecutable(binary) !== null) {
        const raw = this.readVersion(binary, spec.versionArgs);
        const version = raw === null ? null : raw.trim();
        return { name, binary, available: true, version: version === "" ? null : version };
      }
    }
    return { name, binary: spec.candidates[0], available: false, version: null };
  }

  /** Detect one package manager by availability (no version command). */
  public findPackageManager(name: string): PackageManagerInfo {
    const key = name.trim().toLowerCase();
    const candidates = PACKAGE_MANAGER_BINARIES[key] ?? [key];
    for (const binary of candidates) {
      if (this.findExecutable(binary) !== null) {
        return { name, binary, available: true };
      }
    }
    return { name, binary: candidates[0], available: false };
  }
}

const VERSION_TIMEOUT_MS = 10_000;

/**
 * Default version reader: run `<binary> <args>` with an **argument array** (no
 * shell), a short timeout, and combined stdout/stderr (some runtimes, e.g.
 * `java`, report their version on stderr). Returns `null` when the command
 * fails or produces no output.
 */
export function defaultReadVersion(binary: string, args: readonly string[]): string | null {
  try {
    const stdout = execFileSync(binary, [...args], {
      encoding: "utf8",
      timeout: VERSION_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const text = String(stdout ?? "").trim();
    return text.length > 0 ? text : null;
  } catch (error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    if (typeof stderr === "string" || Buffer.isBuffer(stderr)) {
      const text = String(stderr).trim();
      if (text.length > 0) {
        return text;
      }
    }
    return null;
  }
}
