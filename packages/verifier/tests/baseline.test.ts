import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { CommandRunResult } from "@atlas/core";
import { beforeEach, describe, expect, it } from "vitest";
import { classifyResults, loadBaseline, saveBaseline } from "../src/baseline.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = resolve(tmpdir(), `verifier-baseline-${Date.now()}`);
  mkdirSync(resolve(tmpDir, ".codeatlas"), { recursive: true });
});

function fakeResult(overrides: Partial<CommandRunResult> = {}): CommandRunResult {
  return {
    command: "tsc",
    args: ["--noEmit"],
    exitCode: 0,
    stdout: "",
    stderr: "",
    timedOut: false,
    durationMs: 100,
    preExisting: false,
    ...overrides,
  };
}

describe("classifyResults", () => {
  it("marks all failures as pre-existing when no baseline exists", async () => {
    const results = [fakeResult({ exitCode: 0 }), fakeResult({ exitCode: 1, stderr: "error" })];
    const classified = await classifyResults(results, tmpDir, {
      computeFingerprint: async () => "abc",
    });
    expect(classified[0]?.preExisting).toBe(false); // passing
    expect(classified[1]?.preExisting).toBe(true); // failing, no baseline = pre-existing
  });

  it("marks failures as introduced when baseline shows them passing", async () => {
    saveBaseline(tmpDir, "abc", [
      fakeResult({ exitCode: 0 }), // was passing
    ]);

    const results = [
      fakeResult({ exitCode: 1, stderr: "new error" }), // now failing
    ];
    const classified = await classifyResults(results, tmpDir, {
      computeFingerprint: async () => "abc", // same fingerprint
    });
    // Same fingerprint + was passing + now failing = introduced
    expect(classified[0]?.preExisting).toBe(false);
  });

  it("marks failures as pre-existing when baseline shows them already failing", async () => {
    saveBaseline(tmpDir, "abc", [
      fakeResult({ exitCode: 1, stderr: "old error" }), // was already failing
    ]);

    const results = [
      fakeResult({ exitCode: 1, stderr: "old error" }), // still failing
    ];
    const classified = await classifyResults(results, tmpDir, {
      computeFingerprint: async () => "abc", // same fingerprint
    });
    expect(classified[0]?.preExisting).toBe(true);
  });

  it("reclassifies when fingerprint changes", async () => {
    saveBaseline(tmpDir, "old-fp", [
      fakeResult({ exitCode: 0 }), // was passing with old fingerprint
    ]);

    const results = [
      fakeResult({ exitCode: 1 }), // now failing
    ];
    const classified = await classifyResults(results, tmpDir, {
      computeFingerprint: async () => "new-fp", // fingerprint changed
    });
    // Changed fingerprint: old baseline doesn't apply, failure is introduced
    expect(classified[0]?.preExisting).toBe(false);
  });

  it("returns empty array for empty results", async () => {
    const classified = await classifyResults([], tmpDir, {
      computeFingerprint: async () => "abc",
    });
    expect(classified).toEqual([]);
  });
});

describe("saveBaseline / loadBaseline", () => {
  it("saves and loads a baseline", () => {
    const results = [fakeResult({ exitCode: 0 }), fakeResult({ exitCode: 1, stderr: "error" })];
    saveBaseline(tmpDir, "fingerprint-123", results);

    const loaded = loadBaseline(tmpDir);
    expect(loaded).toBeDefined();
    expect(loaded?.fingerprint).toBe("fingerprint-123");
    expect(loaded?.entries).toHaveLength(2);
    expect(loaded?.entries[0]?.exitCode).toBe(0);
    expect(loaded?.entries[1]?.exitCode).toBe(1);
  });

  it("returns undefined when no baseline exists", () => {
    const emptyDir = resolve(tmpdir(), `verifier-nobaseline-${Date.now()}`);
    mkdirSync(resolve(emptyDir, ".codeatlas"), { recursive: true });
    expect(loadBaseline(emptyDir)).toBeUndefined();
  });
});
