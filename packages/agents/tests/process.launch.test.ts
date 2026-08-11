import { describe, expect, it } from "vitest";
import { InvalidWorkingDirectoryError, ProcessSpawnError } from "../src/errors";
import { ProcessRunner } from "../src/process";
import { createFakeSpawn, flushStreams } from "./helpers";

describe("ProcessRunner.launch", () => {
  it("launches a long-running process and returns a handle with the pid", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn });

    const result = await runner.launch({ command: "/bin/fake", args: ["-p", "hi"], cwd: "." });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.pid).toBe(9001);
    expect(result.value.closed).toBe(false);
    expect(fake.records[0]?.command).toBe("/bin/fake");
    expect(fake.records[0]?.args).toEqual(["-p", "hi"]);
    expect(fake.records[0]?.options.shell).toBe(false);
    // Sessions do not capture output, so stdio defaults to "ignore".
    expect(fake.records[0]?.options.stdio).toBe("ignore");
  });

  it("passes through an explicit stdio mode", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn });

    await runner.launch({ command: "tool", args: [], cwd: ".", stdio: "pipe" });

    expect(fake.records[0]?.options.stdio).toBe("pipe");
  });

  it("validates the working directory like run()", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn });

    const result = await runner.launch({ command: "tool", args: [], cwd: "no-such-dir-xyz" });

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

    const result = await runner.launch({ command: "tool", args: [], timeoutMs: 0 });

    expect(result.ok).toBe(false);
    expect(fake.records).toHaveLength(0);
  });

  it("surfaces a spawn error as a closed process via onExit", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn });

    const result = await runner.launch({ command: "/nope", args: [], cwd: "." });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const handle = result.value;
    const exits: Array<[number | null, string | null]> = [];
    handle.onExit((code, signal) => exits.push([code, signal as string | null]));

    fake.processes[0]?.error(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    expect(exits).toEqual([[null, null]]);
    expect(handle.closed).toBe(true);
  });

  it("fires onExit with the exit code after close", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn });

    const result = await runner.launch({ command: "tool", args: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const handle = result.value;
    const exits: Array<[number | null, string | null]> = [];
    handle.onExit((code, signal) => exits.push([code, signal as string | null]));

    fake.processes[0]?.close(3);

    expect(exits).toEqual([[3, null]]);
    expect(handle.closed).toBe(true);
  });

  it("fires onExit immediately when a listener is registered after close", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn });

    const result = await runner.launch({ command: "tool", args: [] });
    if (!result.ok) {
      return;
    }
    const handle = result.value;
    fake.processes[0]?.close(0);

    const exits: Array<[number | null, string | null]> = [];
    handle.onExit((code, signal) => exits.push([code, signal as string | null]));

    expect(exits).toEqual([[0, null]]);
  });

  it("stop() sends SIGTERM and resolves once the child exits", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn });

    const result = await runner.launch({ command: "tool", args: [] });
    if (!result.ok) {
      return;
    }
    const handle = result.value;
    const proc = fake.processes[0];

    const stopping = handle.stop();
    expect(proc?.killCalls).toContain("SIGTERM");
    proc?.close(0);
    await stopping;
    expect(handle.closed).toBe(true);
  });

  it("stop() escalates to SIGKILL after the kill grace period", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn, killGraceMs: 5 });

    const result = await runner.launch({ command: "stubborn", args: [] });
    if (!result.ok) {
      return;
    }
    const handle = result.value;
    const proc = fake.processes[0];

    const stopping = handle.stop();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(proc?.killCalls).toContain("SIGKILL");
    proc?.close(null, "SIGKILL");
    await stopping;
  });

  it("terminate() sends SIGKILL immediately", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn });

    const result = await runner.launch({ command: "tool", args: [] });
    if (!result.ok) {
      return;
    }
    const handle = result.value;
    const proc = fake.processes[0];

    const terminating = handle.terminate();
    expect(proc?.killCalls).toContain("SIGKILL");
    proc?.close(null, "SIGKILL");
    await terminating;
    expect(handle.closed).toBe(true);
  });

  it("stop/terminate are no-ops once the process has closed", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn });

    const result = await runner.launch({ command: "tool", args: [] });
    if (!result.ok) {
      return;
    }
    const handle = result.value;
    const proc = fake.processes[0];
    proc?.close(0);

    await handle.stop();
    await handle.terminate();

    expect(proc?.killCalls).toHaveLength(0);
  });

  it("fails with ProcessSpawnError when the spawn function throws", async () => {
    const runner = new ProcessRunner({
      spawnFn: () => {
        throw new Error("boom");
      },
    });

    const result = await runner.launch({ command: "/nope", args: [] });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(ProcessSpawnError);
  });
});

describe("ProcessRunner.launch — output capture", () => {
  it("does not capture output when stdio is ignore (the default)", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn });

    const result = await runner.launch({ command: "tool", args: [] });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.readOutput()).toBeUndefined();
  });

  it("captures stdout and stderr when launched with stdio: pipe", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn });

    const result = await runner.launch({ command: "tool", args: [], stdio: "pipe" });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const proc = fake.processes[0];
    proc?.writeStdout("The architecture looks good.\n");
    proc?.writeStderr("note: nothing serious\n");
    await flushStreams();

    expect(result.value.readOutput()).toEqual({
      stdout: "The architecture looks good.\n",
      stderr: "note: nothing serious\n",
    });
  });

  it("keeps captured output readable after the process closes (partial output)", async () => {
    const fake = createFakeSpawn();
    const runner = new ProcessRunner({ spawnFn: fake.spawn });

    const result = await runner.launch({ command: "tool", args: [], stdio: "pipe" });
    if (!result.ok) {
      return;
    }
    const handle = result.value;
    const proc = fake.processes[0];
    proc?.writeStdout("collected so far");
    proc?.close(1);
    await flushStreams();

    expect(handle.closed).toBe(true);
    expect(handle.readOutput()?.stdout).toContain("collected so far");
  });
});
