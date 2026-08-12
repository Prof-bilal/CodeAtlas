import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { CompatibilityPort, CompatibilityReport, ToolInstallRequest } from "@atlas/core";
import { type Result, ok } from "@atlas/shared";
import { describe, expect, it } from "vitest";
import {
  InstallApprovalDeniedError,
  InstallBlockedError,
  InstallFailedError,
  InstallInvalidRequestError,
  InstallNotCompatibleError,
  InstallUnsupportedMethodError,
} from "../src/installer-errors";
import { InstallerProcess, type InstallerSpawnFn } from "../src/installer-process";
import { InstallerService } from "../src/installer.service";
import { type TempDir, createTempDir } from "./helpers";

/**
 * Service-level tests for the Tool Installer (Task 22). No real network and no
 * real package manager — every external command is a controllable fake spawn,
 * and the process boundary is the real `InstallerProcess` wrapper so the
 * lifecycle (stdout capture, close/timeout handling) is exercised offline.
 * Every test uses a real temp dir as the project root (`cwd`), because the
 * installer refuses to work outside a real directory.
 */

const T0 = new Date("2026-08-12T12:00:00.000Z");

/** One recorded spawn, used to assert exact argument arrays + `shell: false`. */
interface SpawnCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly shell?: boolean | undefined;
}

type Behavior = (call: SpawnCall) => {
  exitCode: number | null;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
};

/** A controllable spawnFn: records every call and replays a scripted behavior. */
function makeProcess(
  calls: SpawnCall[],
  behavior: Behavior = () => ({ exitCode: 0 }),
): InstallerProcess {
  const spawnFn: InstallerSpawnFn = (command, args, options) => {
    const call: SpawnCall = {
      command,
      args,
      cwd: options.cwd,
      env: options.env,
      shell: options.shell,
    };
    calls.push(call);
    const b = behavior(call);
    // Chunk is pushed synchronously and the stream ended, so run()'s 'data'
    // handlers receive it before close.
    const stream = (content: string) => {
      const s = new Readable({ read() {} });
      if (content.length > 0) {
        s.push(content);
      }
      s.push(null);
      return s;
    };
    const stdout = stream(b.stdout ?? "");
    const stderr = stream(b.stderr ?? "");
    let close: ((code: number | null, signal: string | null) => void) | undefined;
    let error: ((e: Error) => void) | undefined;
    const proc = {
      pid: 1,
      stdout,
      stderr,
      kill: () => {
        close?.(null, "SIGTERM");
        return true;
      },
      on: (event: string, listener: unknown) => {
        if (event === "close") {
          close = listener as (code: number | null, signal: string | null) => void;
        }
        if (event === "error") {
          error = listener as (e: Error) => void;
        }
        return proc;
      },
    };
    // Macrotask: runs after the stream data has been delivered to 'data'.
    setTimeout(() => {
      if (b.error !== undefined) {
        error?.(b.error);
      } else {
        close?.(b.exitCode, b.signal ?? null);
      }
    }, 1);
    return proc;
  };
  return new InstallerProcess({ spawnFn, defaultTimeoutMs: 1000 });
}

class StubCompatibility implements CompatibilityPort {
  public constructor(private readonly report: CompatibilityReport) {}
  public async evaluate(): Promise<Result<CompatibilityReport>> {
    return ok(this.report);
  }
}

function compatibleReport(): CompatibilityReport {
  return {
    toolName: "fixture-tool",
    toolVersion: "1.0.0",
    overall: "compatible",
    notInstallable: false,
    checks: [],
  };
}

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
    cwd: "",
    ...overrides,
  };
}

interface ServiceOpts {
  compat?: CompatibilityPort;
  calls?: SpawnCall[];
  behavior?: Behavior;
  resolveBinary?: (binary: string) => string | null;
  readVersion?: (binary: string, args: readonly string[]) => string | null;
}

function service(opts: ServiceOpts = {}): InstallerService {
  return new InstallerService({
    compatibility: opts.compat ?? new StubCompatibility(compatibleReport()),
    process: makeProcess(opts.calls ?? [], opts.behavior),
    resolveBinary: opts.resolveBinary ?? (() => null),
    readVersion: opts.readVersion ?? (() => null),
    now: () => T0,
  });
}

/** A temp project root plus a request bound to it. */
function ctx(overrides: Partial<ToolInstallRequest> = {}): {
  temp: TempDir;
  req: () => ToolInstallRequest;
} {
  const temp = createTempDir();
  return { temp, req: () => request({ cwd: temp.root, ...overrides }) };
}

/** Assert a failure `Result` and return its error (narrows the union for TS). */
function failureOf<T>(result: Result<T>): Error {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected a failure Result");
  }
  return result.error;
}
describe("InstallerService.plan (build gates, nothing executes)", () => {
  it("returns an exact, reviewable plan and never runs the command", async () => {
    const calls: SpawnCall[] = [];
    const svc = service({ calls });
    const c = ctx();
    try {
      const result = await svc.plan(c.req());
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.method).toBe("npm");
      expect(result.value.command).toEqual({
        binary: "npm",
        args: ["install", "--global", "fixture-tool"],
        cwd: c.temp.root,
      });
      expect(result.value.dangerous).toEqual([
        "network access",
        "global install",
        "runs post-install hooks (package scripts)",
      ]);
      expect(result.value.verifyBinary).toBe("fixture-tool");
      expect(calls.length).toBe(0);
    } finally {
      c.temp.cleanup();
    }
  });

  it("exposes only the implemented (safe MVP) install types", () => {
    expect(service().implementedTypes).toEqual(["npm", "pip", "cargo", "go"]);
  });

  it("blocks an incompatible tool (fail-closed) before anything runs", async () => {
    const calls: SpawnCall[] = [];
    const svc = service({
      calls,
      compat: new StubCompatibility({
        ...compatibleReport(),
        overall: "incompatible",
        notInstallable: true,
      }),
    });
    const c = ctx();
    try {
      const result = await svc.plan(c.req());
      expect(result.ok).toBe(false);
      expect(failureOf(result)).toBeInstanceOf(InstallNotCompatibleError);
      expect(calls.length).toBe(0);
    } finally {
      c.temp.cleanup();
    }
  });

  it("fails closed on a blocked security status, even for a plan", async () => {
    const calls: SpawnCall[] = [];
    const svc = service({ calls });
    const c = ctx({ security: { status: "blocked", trust: "unverified" } });
    try {
      const result = await svc.plan(c.req());
      expect(result.ok).toBe(false);
      expect(failureOf(result)).toBeInstanceOf(InstallBlockedError);
      expect(calls.length).toBe(0);
    } finally {
      c.temp.cleanup();
    }
  });

  it("fails closed on a blocked trust level", async () => {
    const svc = service();
    const c = ctx({ security: { status: "unverified", trust: "blocked" } });
    try {
      const result = await svc.plan(c.req());
      expect(result.ok).toBe(false);
      expect(failureOf(result)).toBeInstanceOf(InstallBlockedError);
    } finally {
      c.temp.cleanup();
    }
  });

  it("rejects an unsupported install method (not in the MVP subset)", async () => {
    const svc = service();
    const c = ctx({ installation: { ...request().installation, type: "binary" } });
    try {
      const result = await svc.plan(c.req());
      expect(result.ok).toBe(false);
      expect(failureOf(result)).toBeInstanceOf(InstallUnsupportedMethodError);
    } finally {
      c.temp.cleanup();
    }
  });

  it("rejects an unsafe tool name that could escape .codeatlas/tools/", async () => {
    const svc = service();
    const c = ctx({ name: "../evil" });
    try {
      const result = await svc.plan(c.req());
      expect(result.ok).toBe(false);
      expect(failureOf(result)).toBeInstanceOf(InstallInvalidRequestError);
    } finally {
      c.temp.cleanup();
    }
  });

  it("rejects a non-directory working directory", async () => {
    const svc = service();
    const result = await svc.plan(request({ cwd: join(createTempDir().root, "no-such-dir") }));
    expect(result.ok).toBe(false);
    expect(failureOf(result)).toBeInstanceOf(InstallInvalidRequestError);
  });

  it("rejects a hostile package before any plan is produced", async () => {
    const svc = service();
    const c = ctx({ installation: { ...request().installation, package: "evil; rm -rf /" } });
    try {
      const result = await svc.plan(c.req());
      expect(result.ok).toBe(false);
      expect(failureOf(result)).toBeInstanceOf(InstallBlockedError);
    } finally {
      c.temp.cleanup();
    }
  });
});
describe("InstallerService.install (approval, verification, rollback)", () => {
  it("requires explicit approval and aborts before anything runs", async () => {
    const calls: SpawnCall[] = [];
    const svc = service({ calls });
    const c = ctx();
    try {
      const result = await svc.install(c.req(), { granted: false });
      expect(result.ok).toBe(false);
      expect(failureOf(result)).toBeInstanceOf(InstallApprovalDeniedError);
      expect(calls.length).toBe(0);
    } finally {
      c.temp.cleanup();
    }
  });

  it("installs, verifies, records a manifest, and never uses a shell", async () => {
    const calls: SpawnCall[] = [];
    const svc = service({
      calls,
      resolveBinary: () => "C:\\bin\\fixture-tool.exe",
      readVersion: () => "v1.2.3",
    });
    const c = ctx();
    try {
      const result = await svc.install(c.req(), { granted: true });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.verification).toBe("verified");
      expect(result.value.rollback).toBe("none");
      expect(result.value.exitCode).toBe(0);
      expect(result.value.recordedAt).toBe(T0.toISOString());
      expect(result.value.manifestPath).toBe(
        join(c.temp.root, ".codeatlas", "tools", "fixture-tool.json"),
      );
      expect(existsSync(result.value.manifestPath ?? "")).toBe(true);

      // Exactly one spawn, as an argument array with shell:false.
      expect(calls.length).toBe(1);
      expect(calls[0].command).toBe("npm");
      expect(calls[0].args).toEqual(["install", "--global", "fixture-tool"]);
      expect(calls[0].cwd).toBe(c.temp.root);
      expect(calls[0].shell).toBe(false);
      expect(calls[0].env).toBeDefined();
      // The recorded manifest carries provenance of the exact command.
      const manifest = JSON.parse(
        readFileSync(join(c.temp.root, ".codeatlas", "tools", "fixture-tool.json"), "utf8"),
      );
      expect(manifest.provenance.command).toEqual(["npm", "install", "--global", "fixture-tool"]);
      expect(manifest.provenance.recordedAt).toBe(T0.toISOString());
      expect(manifest.verification.status).toBe("verified");
    } finally {
      c.temp.cleanup();
    }
  });

  it("reports verification failed honestly when the binary is missing (but still records state)", async () => {
    const svc = service({ resolveBinary: () => null });
    const c = ctx();
    try {
      const result = await svc.install(c.req(), { granted: true });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.verification).toBe("failed");
      expect(result.value.verificationNote).toContain("not found on PATH");
      expect(result.value.manifestPath).not.toBeNull();
    } finally {
      c.temp.cleanup();
    }
  });

  it("reports verification failed when the installed version fails its declared range", async () => {
    const svc = service({
      resolveBinary: () => "C:\\bin\\fixture-tool.exe",
      readVersion: () => "v1.0.0",
    });
    const c = ctx({
      installation: { ...request().installation, versionRange: "^2.0.0" },
    });
    try {
      const result = await svc.install(c.req(), { granted: true });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      // The install command itself still ran with a pinned spec.
      expect(result.value.plan.command.args).toEqual([
        "install",
        "--global",
        "fixture-tool@^2.0.0",
      ]);
      expect(result.value.verification).toBe("failed");
      expect(result.value.verificationNote).toContain("does not satisfy");
    } finally {
      c.temp.cleanup();
    }
  });
});
describe("InstallerService.install — rollback & adversarial", () => {
  it("rolls back (uninstalls) on failure when the tool was not already present", async () => {
    const calls: SpawnCall[] = [];
    const svc = service({
      calls,
      resolveBinary: () => null, // tool not present before/after
      behavior: (call) => (call.args[0] === "uninstall" ? { exitCode: 0 } : { exitCode: 1 }),
    });
    const c = ctx();
    try {
      const result = await svc.install(c.req(), { granted: true });
      expect(result.ok).toBe(false);
      expect(failureOf(result)).toBeInstanceOf(InstallFailedError);
      if (!result.ok) {
        const err = result.error as InstallFailedError;
        expect(err.rollback).toBe("uninstalled");
        expect(err.log.join("\n")).toContain("rollback: uninstalled");
      }
      // install then a best-effort uninstall (rollback).
      expect(calls.length).toBe(2);
      expect(calls[0].args[0]).toBe("install");
      expect(calls[1].args[0]).toBe("uninstall");
    } finally {
      c.temp.cleanup();
    }
  });

  it("does not uninstall on failure when the tool was already present (no blind downgrade)", async () => {
    const calls: SpawnCall[] = [];
    const svc = service({
      calls,
      resolveBinary: () => "C:\\bin\\fixture-tool.exe", // present before
      behavior: () => ({ exitCode: 1 }),
    });
    const c = ctx();
    try {
      const result = await svc.install(c.req(), { granted: true });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect((result.error as InstallFailedError).rollback).toBe("none");
      }
      expect(calls.length).toBe(1); // no uninstall command was run
    } finally {
      c.temp.cleanup();
    }
  });

  it("records unsupported rollback honestly for go installs", async () => {
    const calls: SpawnCall[] = [];
    const svc = service({
      calls,
      behavior: () => ({ exitCode: 1 }),
    });
    const c = ctx({ installation: { ...request().installation, type: "go" } });
    try {
      const result = await svc.install(c.req(), { granted: true });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const err = result.error as InstallFailedError;
        expect(err.rollback).toBe("none");
        expect(err.log.join("\n")).toContain("rollback: not available");
      }
      expect(calls.length).toBe(1);
    } finally {
      c.temp.cleanup();
    }
  });

  it("rejects a hostile token before spawning (adversarial, service level)", async () => {
    const calls: SpawnCall[] = [];
    const svc = service({ calls });
    const c = ctx({
      installation: { ...request().installation, package: "evil;rm" },
    });
    try {
      const result = await svc.install(c.req(), { granted: true });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        return;
      }
      expect(calls.length).toBe(0);
      // The whole hostile token is ONE element of the array — never spliced
      // into a shell string — and the child is spawned with shell:false.
      expect(calls[0].args).toEqual(["install", "--global", "evil;rm"]);
      expect(calls[0].shell).toBe(false);
    } finally {
      c.temp.cleanup();
    }
  });

  it("never logs captured output lines that look like secrets (redacted)", async () => {
    const svc = service({
      resolveBinary: () => null,
      behavior: () => ({ exitCode: 0, stdout: "api_key=supersecretvalue" }),
    });
    const c = ctx();
    try {
      const result = await svc.install(c.req(), { granted: true });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      const joined = result.value.log.join("\n");
      expect(joined).toContain("redacted");
      expect(joined).not.toContain("supersecretvalue");
    } finally {
      c.temp.cleanup();
    }
  });
});
