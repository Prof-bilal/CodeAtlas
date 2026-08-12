import type { ToolInstallRequest } from "@atlas/core";
import type { Result } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import { baseBinaryName, validateSourceUrl } from "../src/installer-adapter";
import { CargoAdapter, GoAdapter, NpmAdapter, PipAdapter } from "../src/installer-adapters";
import { InstallInvalidRequestError } from "../src/installer-errors";

/**
 * Unit tests for the per-ecosystem install adapters (Task 22). The core
 * security assertion everywhere: the adapter emits an **argument array** —
 * never a shell string — and every value derived from the (untrusted) request
 * is validated before it can reach an argv element.
 */

function request(overrides: Partial<ToolInstallRequest> = {}): ToolInstallRequest {
  return {
    name: "fixture-tool",
    description: "A fixture tool.",
    toolVersion: "1.0.0",
    installation: {
      type: "npm",
      package: "fixture-tool",
      source: null,
      checksum: null,
      versionRange: null,
    },
    security: { status: "unverified", trust: "unverified" },
    compatibility: {
      toolName: "fixture-tool",
      toolVersion: "1.0.0",
      requirements: {
        os: [],
        runtimes: [],
        agents: [],
        mcp: false,
        architecture: [],
        permissions: [],
      },
      installMethod: null,
    },
    cwd: "C:\\work",
    ...overrides,
  };
}

/** Assert a failure `Result` and return its error (narrows the union for TS). */
function failureOf<T>(result: Result<T>): Error {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected a failure Result");
  }
  return result.error;
}

describe("NpmAdapter", () => {
  it("builds a global install with an argument array (no shell string)", () => {
    const result = new NpmAdapter().build(request());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const { command, uninstallCommand, verifyBinary } = result.value;
    expect(command).toEqual({
      binary: "npm",
      args: ["install", "--global", "fixture-tool"],
      cwd: "C:\\work",
    });
    expect(uninstallCommand?.args).toEqual(["uninstall", "--global", "fixture-tool"]);
    expect(verifyBinary).toBe("fixture-tool");
    expect(result.value.dangerous).toContain("network access");
    expect(result.value.effect).toContain("npm");
  });
});

describe("PipAdapter", () => {
  it("builds a --user pip install and a -y uninstall", () => {
    const result = new PipAdapter().build(
      request({ installation: { ...request().installation, type: "pip" } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.command).toEqual({
      binary: "pip",
      args: ["install", "--user", "fixture-tool"],
      cwd: "C:\\work",
    });
    expect(result.value.uninstallCommand?.args).toEqual(["uninstall", "-y", "fixture-tool"]);
  });
});
describe("CargoAdapter", () => {
  it("builds a cargo install (source-compiled) argument array", () => {
    const result = new CargoAdapter().build(
      request({ installation: { ...request().installation, type: "cargo" } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.command).toEqual({
      binary: "cargo",
      args: ["install", "fixture-tool"],
      cwd: "C:\\work",
    });
    expect(result.value.uninstallCommand?.args).toEqual(["uninstall", "fixture-tool"]);
    expect(result.value.dangerous).toContain("compiles the crate from source");
    expect(result.value.effect).toContain("crates.io");
  });

  it("uses --version for an exact pinned version", () => {
    const result = new CargoAdapter().build(
      request({
        installation: { ...request().installation, type: "cargo", versionRange: "1.2.3" },
      }),
    );
    expect(result.ok && result.value.command.args).toEqual([
      "install",
      "fixture-tool",
      "--version",
      "1.2.3",
    ]);
  });

  it("rejects a range cargo cannot express", () => {
    const result = new CargoAdapter().build(
      request({
        installation: { ...request().installation, type: "cargo", versionRange: "^1.2.3" },
      }),
    );
    expect(result.ok).toBe(false);
  });
});

describe("GoAdapter", () => {
  it("installs @latest when no version is pinned", () => {
    const result = new GoAdapter().build(
      request({ installation: { ...request().installation, type: "go" } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.command).toEqual({
      binary: "go",
      args: ["install", "fixture-tool@latest"],
      cwd: "C:\\work",
    });
    // Go has no module-uninstall; rollback is unsupported and reported honestly.
    expect(result.value.uninstallCommand).toBeNull();
  });

  it("pins an exact version with @<version>", () => {
    const result = new GoAdapter().build(
      request({
        installation: { ...request().installation, type: "go", versionRange: "1.2.3" },
      }),
    );
    expect(result.ok && result.value.command.args).toEqual(["install", "fixture-tool@1.2.3"]);
  });

  it("treats '*' as latest", () => {
    const result = new GoAdapter().build(
      request({
        installation: { ...request().installation, type: "go", versionRange: "*" },
      }),
    );
    expect(result.ok && result.value.command.args).toEqual(["install", "fixture-tool@latest"]);
  });
});
describe("adversarial input validation", () => {
  it("rejects a flag-like package (leading dash) before anything can run", () => {
    const result = new NpmAdapter().build(
      request({ installation: { ...request().installation, package: "--install=evil" } }),
    );
    expect(result.ok).toBe(false);
    expect(failureOf(result)).toBeInstanceOf(InstallInvalidRequestError);
  });

  it("rejects a package containing whitespace / shell syntax that could inject", () => {
    for (const hostile of ["evil; rm -rf /", "evil && rm -rf /", "evil -o x"]) {
      const result = new NpmAdapter().build(
        request({ installation: { ...request().installation, package: hostile } }),
      );
      expect(result.ok).toBe(false);
    }
  });

  it("rejects a package with control characters", () => {
    const result = new NpmAdapter().build(
      request({ installation: { ...request().installation, package: "evil\u0000x" } }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an oversized package value", () => {
    const result = new NpmAdapter().build(
      request({ installation: { ...request().installation, package: "a".repeat(600) } }),
    );
    expect(result.ok).toBe(false);
  });

  it("passes a dash-free, whitespace-free hostile token as ONE inert argv element (array, never a shell string)", () => {
    // 'evil;rm' has no whitespace and no leading dash, so it passes validation —
    // but because the adapter emits an argument array (not a shell string), it is
    // delivered to npm as a single literal argument and cannot inject anything.
    const result = new NpmAdapter().build(
      request({ installation: { ...request().installation, package: "evil;rm" } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.command.args).toEqual(["install", "--global", "evil;rm"]);
    // It is an array of strings; there is no concatenated shell command anywhere.
    for (const arg of result.value.command.args) {
      expect(typeof arg).toBe("string");
    }
  });

  it("rejects a hostile download source that is not an http(s) URL", () => {
    const problems: string[] = [];
    expect(validateSourceUrl("file:///etc/passwd", "source", problems)).toBeNull();
    expect(problems.length).toBeGreaterThan(0);
  });
});

describe("baseBinaryName", () => {
  it("derives the binary from the last path segment and strips a leading scope", () => {
    expect(baseBinaryName("@scope/tool")).toBe("tool");
    expect(baseBinaryName("github.com/org/tool")).toBe("tool");
    expect(baseBinaryName("plain-tool")).toBe("plain-tool");
  });
});
