import { EventEmitter } from "node:events";
import type { VerifyConfig } from "@prof-bilal/atlas-core";
import { describe, expect, it } from "vitest";
import { type CommandRunnerDeps, runCommands } from "../src/runners.js";

type SpawnFn = NonNullable<CommandRunnerDeps["spawnFn"]>;

function fakeProcess(): {
  handle: ReturnType<SpawnFn>;
  emitClose: (code: number) => void;
  emitError: (err: Error) => void;
  emitStdout: (chunk: string) => void;
  emitStderr: (chunk: string) => void;
} {
  const bus = new EventEmitter();
  const stdoutBus = new EventEmitter();
  const stderrBus = new EventEmitter();
  return {
    handle: {
      pid: 12345,
      stdout: stdoutBus as unknown as NodeJS.ReadableStream,
      stderr: stderrBus as unknown as NodeJS.ReadableStream,
      on: (event, cb) => {
        bus.on(event, cb);
      },
      kill: () => {},
    },
    emitClose: (code) => {
      bus.emit("close", code);
    },
    emitError: (err) => {
      bus.emit("error", err);
    },
    emitStdout: (chunk) => {
      stdoutBus.emit("data", chunk);
    },
    emitStderr: (chunk) => {
      stderrBus.emit("data", chunk);
    },
  };
}

function fakeSpawnFn(exitCode: number, stdout = "", stderr = ""): SpawnFn {
  return () => {
    const proc = fakeProcess();
    setTimeout(() => {
      if (stdout) proc.emitStdout(stdout);
      if (stderr) proc.emitStderr(stderr);
      proc.emitClose(exitCode);
    }, 10);
    return proc.handle;
  };
}

function fakeSpawnFnError(message: string): SpawnFn {
  return () => {
    const proc = fakeProcess();
    setTimeout(() => {
      proc.emitError(new Error(message));
    }, 10);
    return proc.handle;
  };
}

describe("runCommands", () => {
  it("returns empty array when config is disabled", async () => {
    const config: VerifyConfig = { enabled: false, commands: {} };
    const result = await runCommands(config, "/tmp", {});
    expect(result).toEqual([]);
  });

  it("runs a single command successfully", async () => {
    const config: VerifyConfig = {
      enabled: true,
      commands: {
        typecheck: { command: "echo", args: ["hello"], timeoutMs: 5000 },
      },
    };
    const result = await runCommands(config, "/tmp", {
      spawnFn: fakeSpawnFn(0, "hello\n"),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.exitCode).toBe(0);
    expect(result[0]?.stdout).toContain("hello");
    expect(result[0]?.timedOut).toBe(false);
    expect(result[0]?.preExisting).toBe(false);
  });

  it("runs multiple commands", async () => {
    const config: VerifyConfig = {
      enabled: true,
      commands: {
        typecheck: { command: "tsc", args: ["--noEmit"], timeoutMs: 5000 },
        lint: { command: "eslint", args: ["."], timeoutMs: 5000 },
      },
    };
    const result = await runCommands(config, "/tmp", {
      spawnFn: fakeSpawnFn(0),
    });
    expect(result).toHaveLength(2);
    expect(result[0]?.command).toBe("tsc");
    expect(result[1]?.command).toBe("eslint");
  });

  it("captures stderr on failure", async () => {
    const config: VerifyConfig = {
      enabled: true,
      commands: {
        typecheck: { command: "echo", args: ["fail"], timeoutMs: 5000 },
      },
    };
    const result = await runCommands(config, "/tmp", {
      spawnFn: fakeSpawnFn(1, "", "error: Type 'string' is not assignable"),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.exitCode).toBe(1);
    expect(result[0]?.stderr).toContain("error");
  });

  it("handles process errors gracefully", async () => {
    const config: VerifyConfig = {
      enabled: true,
      commands: {
        typecheck: { command: "echo", args: ["test"], timeoutMs: 5000 },
      },
    };
    const result = await runCommands(config, "/tmp", {
      spawnFn: fakeSpawnFnError("ENOENT"),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.exitCode).toBe(1);
    expect(result[0]?.stderr).toContain("Process error");
  });

  it("rejects flag injection in arguments", async () => {
    const config: VerifyConfig = {
      enabled: true,
      commands: {
        lint: { command: "eslint", args: ["--config", "../../etc/passwd"], timeoutMs: 5000 },
      },
    };
    const result = await runCommands(config, "/tmp", {
      spawnFn: fakeSpawnFn(0),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.exitCode).toBe(1);
    expect(result[0]?.stderr).toContain("Flag injection rejected");
  });

  it("rejects control characters in arguments", async () => {
    const config: VerifyConfig = {
      enabled: true,
      commands: {
        lint: { command: "eslint", args: ["hello\x00world"], timeoutMs: 5000 },
      },
    };
    const result = await runCommands(config, "/tmp", {
      spawnFn: fakeSpawnFn(0),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.exitCode).toBe(1);
    expect(result[0]?.stderr).toContain("Control characters rejected");
  });

  it("rejects arguments longer than 512 chars", async () => {
    const longArg = "a".repeat(513);
    const config: VerifyConfig = {
      enabled: true,
      commands: {
        lint: { command: "eslint", args: [longArg], timeoutMs: 5000 },
      },
    };
    const result = await runCommands(config, "/tmp", {
      spawnFn: fakeSpawnFn(0),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.exitCode).toBe(1);
    expect(result[0]?.stderr).toContain("Argument too long");
  });

  it("uses default timeout when not specified", async () => {
    const config: VerifyConfig = {
      enabled: true,
      commands: {
        test: { command: "vitest", args: ["run"] },
      },
    };
    // Should not hang — default timeout is 60s but we test the config is accepted
    const result = await runCommands(config, "/tmp", {
      spawnFn: fakeSpawnFn(0, "passed\n"),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.exitCode).toBe(0);
  });
});
