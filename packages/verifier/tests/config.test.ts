import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { VerifyConfigError, loadVerifyConfig } from "../src/config.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = resolve(tmpdir(), `verifier-config-${Date.now()}`);
  mkdirSync(resolve(tmpDir, ".codeatlas"), { recursive: true });
});

function writeConfig(config: unknown): void {
  writeFileSync(
    resolve(tmpDir, ".codeatlas", "verify.json"),
    JSON.stringify(config, null, 2),
    "utf-8",
  );
}

describe("loadVerifyConfig", () => {
  it("returns undefined when config file does not exist", () => {
    const emptyDir = resolve(tmpdir(), `verifier-empty-${Date.now()}`);
    mkdirSync(emptyDir, { recursive: true });
    expect(loadVerifyConfig(emptyDir)).toBeUndefined();
  });

  it("loads a valid config", () => {
    writeConfig({
      enabled: true,
      commands: {
        typecheck: { command: "npx", args: ["tsc", "--noEmit"], timeoutMs: 60000 },
      },
    });
    const config = loadVerifyConfig(tmpDir);
    expect(config).toBeDefined();
    expect(config?.enabled).toBe(true);
    expect(config?.commands.typecheck).toEqual({
      command: "npx",
      args: ["tsc", "--noEmit"],
      timeoutMs: 60000,
    });
  });

  it("loads config with enabled: false", () => {
    writeConfig({ enabled: false, commands: {} });
    const config = loadVerifyConfig(tmpDir);
    expect(config?.enabled).toBe(false);
  });

  it("defaults enabled to true when omitted", () => {
    writeConfig({ commands: {} });
    const config = loadVerifyConfig(tmpDir);
    expect(config?.enabled).toBe(true);
  });

  it("rejects non-object config", () => {
    writeConfig("not an object");
    expect(() => loadVerifyConfig(tmpDir)).toThrow(VerifyConfigError);
  });

  it("rejects non-boolean enabled", () => {
    writeConfig({ enabled: "yes", commands: {} });
    expect(() => loadVerifyConfig(tmpDir)).toThrow("enabled");
  });

  it("rejects invalid command config", () => {
    writeConfig({
      commands: {
        typecheck: { command: 123, args: "not-array" },
      },
    });
    expect(() => loadVerifyConfig(tmpDir)).toThrow("invalid config");
  });

  it("rejects non-string command args", () => {
    writeConfig({
      commands: {
        typecheck: { command: "tsc", args: [123, true] },
      },
    });
    expect(() => loadVerifyConfig(tmpDir)).toThrow("invalid config");
  });

  it("accepts command without timeoutMs", () => {
    writeConfig({
      commands: {
        lint: { command: "eslint", args: ["."] },
      },
    });
    const config = loadVerifyConfig(tmpDir);
    expect(config?.commands.lint).toEqual({
      command: "eslint",
      args: ["."],
    });
  });

  it("rejects non-number timeoutMs", () => {
    writeConfig({
      commands: {
        test: { command: "vitest", args: ["run"], timeoutMs: "forever" },
      },
    });
    expect(() => loadVerifyConfig(tmpDir)).toThrow("invalid config");
  });
});
