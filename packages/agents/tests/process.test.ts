import { describe, expect, it } from "vitest";
import { InvalidWorkingDirectoryError, ProcessSpawnError } from "../src/errors";
import { ProcessRunner } from "../src/process";
import { createFakeSpawn, flushStreams } from "./helpers";

describe("ProcessRunner", () => {
  it("spawns with an argument array, never a shell string", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn });

    const pending = runner.run({ command: "/bin/fake", args: ["-p", "hi"], cwd: "." });
    fake.processes[0]?.close(0);
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(fake.records[0]?.command).toBe("/bin/fake");
    expect(fake.records[0]?.args).toEqual(["-p", "hi"]);
    expect(fake.records[0]?.options.shell).toBe(false);
    expect(fake.records[0]?.options.cwd).toBe(".");
    expect(fake.records[0]?.options.env).toMatchObject(process.env);
  });

  it("captures stdout and stderr and reports the exit code", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn });

    const pending = runner.run({ command: "tool", args: [] });
    const proc = fake.processes[0];
    expect(proc).toBeDefined();
    proc?.writeStdout("hello");
    proc?.writeStderr("oops");
    await flushStreams();
    proc?.close(3);
    const result = await pending;

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.exitCode).toBe(3);
    expect(result.value.stdout).toBe("hello");
    expect(result.value.stderr).toBe("oops");
    expect(result.value.signal).toBeNull();
    expect(result.value.timedOut).toBe(false);
  });

  it("kills the child on timeout and reports partial output", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn, killGraceMs: 5 });

    const pending = runner.run({ command: "slow", args: [], timeoutMs: 10 });
    const proc = fake.processes[0];
    expect(proc).toBeDefined();
    proc?.writeStdout("partial");
    await flushStreams();
    await new Promise((resolve) => setTimeout(resolve, 25));
    proc?.close(null, "SIGTERM");
    const result = await pending;

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.timedOut).toBe(true);
    expect(result.value.exitCode).toBeNull();
    expect(result.value.signal).toBe("SIGTERM");
    expect(result.value.stdout).toBe("partial");
    expect(proc?.killCalls).toContain("SIGTERM");
  });

  it("escalates to SIGKILL after the grace period", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn, killGraceMs: 5 });

    const pending = runner.run({ command: "stubborn", args: [], timeoutMs: 10 });
    const proc = fake.processes[0];
    expect(proc).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(proc?.killCalls).toContain("SIGKILL");
    proc?.close(null, "SIGKILL");
    const result = await pending;
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.timedOut).toBe(true);
  });

  it("fails with ProcessSpawnError when the child errors on spawn", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn });

    const pending = runner.run({ command: "/nope", args: [] });
    fake.processes[0]?.error(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const result = await pending;

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(ProcessSpawnError);
  });

  it("fails with InvalidWorkingDirectoryError for a bad cwd", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn });

    const result = await runner.run({
      command: "tool",
      args: [],
      cwd: "no-such-dir-xyz",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(InvalidWorkingDirectoryError);
    expect(fake.records).toHaveLength(0);
  });

  it("rejects a non-positive timeout", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn });

    const result = await runner.run({ command: "tool", args: [], timeoutMs: 0 });

    expect(result.ok).toBe(false);
    expect(fake.records).toHaveLength(0);
  });
});
