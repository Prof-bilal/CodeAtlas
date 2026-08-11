import { describe, expect, it } from "vitest";
import type { AgentRunRequest } from "@atlas/core";
import type { AgentAdapter } from "../src/adapter";
import { AgentService } from "../src/agent.service";
import { AgentCliNotFoundError, AgentConfigError, UnknownAgentError } from "../src/errors";
import { ProcessRunner } from "../src/process";
import { createFakeSpawn, flushStreams } from "./helpers";

/** Stub resolver that reports a fixed "installed" path for every binary. */
function installedResolver(pathEnv?: string): (binary: string) => string | null {
  const base = pathEnv ?? "C:\\tools";
  return (binary) => (binary.length > 0 ? `${base}/${binary}` : null);
}

describe("AgentService", () => {
  it("registers the built-in providers by default", () => {
    const service = new AgentService({ resolveExecutable: installedResolver() });
    expect(service.listAgents()).toEqual(["claude", "gemini", "codex", "opencode"]);
  });

  it("registers custom adapters", () => {
    const service = new AgentService({ resolveExecutable: installedResolver() });
    const custom: AgentAdapter = {
      name: "deepseek",
      binary: "deepseek",
      versionArgs: ["--version"],
      env: {},
      buildArgs: (request) => [request.prompt],
      parseVersion: (stdout) => stdout.trim() || undefined,
    };
    service.register(custom);
    expect(service.listAgents()).toContain("deepseek");
  });

  describe("detection", () => {
    it("reports available=false when the binary is missing", async () => {
      const service = new AgentService({
        resolveExecutable: () => null,
        processRunner: new ProcessRunner({ spawnFn: createFakeSpawn().spawn }),
      });
      const result = await service.detectAgent("claude");
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.available).toBe(false);
      expect(result.value.path).toBeUndefined();
    });

    it("detects version by running the binary with version args", async () => {
      const fake = createFakeSpawn();
      const service = new AgentService({
        resolveExecutable: installedResolver(),
        processRunner: new ProcessRunner({ spawnFn: fake.spawn }),
      });
      const pending = service.detectAgent("claude");
      const proc = fake.processes[0];
      expect(proc).toBeDefined();
      expect(fake.records[0]?.args).toEqual(["--version"]);
      proc?.writeStdout("claude version 2.1.0\n");
      await flushStreams();
      proc?.close(0);
      const result = await pending;

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.available).toBe(true);
      expect(result.value.path).toContain("claude");
      expect(result.value.version).toBe("2.1.0");
    });

    it("detectAll returns one entry per provider", async () => {
      const fake = createFakeSpawn({ autoRespond: true });
      const service = new AgentService({
        resolveExecutable: installedResolver(),
        processRunner: new ProcessRunner({ spawnFn: fake.spawn }),
      });
      const result = await service.detectAll();
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value).toHaveLength(4);
      expect(result.value.every((info) => info.available)).toBe(true);
      expect(fake.records).toHaveLength(4);
    });
  });

  describe("run", () => {
    it("fails with UnknownAgentError for an unknown provider", async () => {
      const fake = createFakeSpawn();
      const service = new AgentService({
        resolveExecutable: installedResolver(),
        processRunner: new ProcessRunner({ spawnFn: fake.spawn }),
      });
      const result = await service.run({ provider: "nope", prompt: "hi" });
      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error).toBeInstanceOf(UnknownAgentError);
    });

    it("fails with AgentCliNotFoundError when the CLI is missing", async () => {
      const fake = createFakeSpawn();
      const service = new AgentService({
        resolveExecutable: () => null,
        processRunner: new ProcessRunner({ spawnFn: fake.spawn }),
      });
      const result = await service.run({ prompt: "hi" });
      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error).toBeInstanceOf(AgentCliNotFoundError);
      expect(fake.records).toHaveLength(0);
    });

    it("builds provider-specific arguments and passes the working directory", async () => {
      const fake = createFakeSpawn();
      const service = new AgentService({
        resolveExecutable: installedResolver(),
        processRunner: new ProcessRunner({ spawnFn: fake.spawn }),
      });
      const cwd = process.cwd();
      const request: AgentRunRequest = {
        provider: "claude",
        prompt: "explain AuthService",
        cwd,
      };
      const pending = service.run(request);
      const proc = fake.processes[0];
      proc?.close(0);
      await pending;

      expect(fake.records[0]?.command).toContain("claude");
      expect(fake.records[0]?.args).toEqual(["-p", "explain AuthService"]);
      expect(fake.records[0]?.options.cwd).toBe(cwd);
      expect(fake.records[0]?.options.shell).toBe(false);
    });

    it("uses provider runMode per adapter (gemini, codex, opencode)", async () => {
      const fake = createFakeSpawn();
      const service = new AgentService({
        resolveExecutable: installedResolver(),
        processRunner: new ProcessRunner({ spawnFn: fake.spawn }),
      });
      const cases: Array<[string, string[]]> = [
        ["gemini", ["-p", "hello"]],
        ["codex", ["exec", "hello"]],
        ["opencode", ["run", "hello"]],
      ];
      for (const [provider, expectedArgs] of cases) {
        const pending = service.run({ provider, prompt: "hello" });
        fake.processes[fake.processes.length - 1]?.close(0);
        await pending;
        expect(fake.records[fake.records.length - 1]?.args).toEqual(expectedArgs);
      }
    });

    it("surfaces the child exit code and captured output", async () => {
      const fake = createFakeSpawn();
      const service = new AgentService({
        resolveExecutable: installedResolver(),
        processRunner: new ProcessRunner({ spawnFn: fake.spawn }),
      });
      const pending = service.run({ prompt: "hi" });
      const proc = fake.processes[0];
      proc?.writeStdout("response");
      proc?.writeStderr("warn");
      await flushStreams();
      proc?.close(1);
      const result = await pending;

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.exitCode).toBe(1);
      expect(result.value.stdout).toBe("response");
      expect(result.value.stderr).toBe("warn");
      expect(result.value.provider).toBe("claude");
    });

    it("rejects a non-positive timeout as invalid configuration", async () => {
      const fake = createFakeSpawn();
      const service = new AgentService({
        resolveExecutable: installedResolver(),
        processRunner: new ProcessRunner({ spawnFn: fake.spawn }),
      });
      const result = await service.run({ prompt: "hi", timeoutMs: 0 });
      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.error).toBeInstanceOf(AgentConfigError);
      expect(fake.records).toHaveLength(0);
    });

    it("reports a timed-out run honestly (no fake success)", async () => {
      const fake = createFakeSpawn();
      const service = new AgentService({
        resolveExecutable: installedResolver(),
        processRunner: new ProcessRunner({ spawnFn: fake.spawn, killGraceMs: 5 }),
      });
      const pending = service.run({ prompt: "slow", timeoutMs: 10 });
      const proc = fake.processes[0];
      expect(proc).toBeDefined();
      await new Promise((resolve) => setTimeout(resolve, 25));
      proc?.close(null, "SIGTERM");
      const result = await pending;

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.timedOut).toBe(true);
      expect(result.value.exitCode).toBeNull();
    });
  });
});
