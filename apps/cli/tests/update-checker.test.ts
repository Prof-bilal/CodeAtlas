import type {} from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    readFile: vi.fn().mockRejectedValue(new Error("no cache")),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  };
});

import { execFile } from "node:child_process";
import { checkForUpdate } from "../src/update-checker";

const mockExecFile = vi.mocked(execFile);

beforeEach(() => {
  vi.clearAllMocks();
});

function fakeNpmView(version: string | null): void {
  mockExecFile.mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as (error: Error | null, stdout: string) => void;
    if (version === null) {
      cb(new Error("npm not found"), "");
    } else {
      cb(null, `${version}\n`);
    }
  });
}

describe("checkForUpdate", () => {
  it("prints notice when current version is older than latest", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    fakeNpmView("1.0.0");

    await checkForUpdate("0.4.0-beta.0");

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("0.4.0-beta.0 → 1.0.0"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("npm install -g codeatlas-cli"));
  });

  it("does not print when current version is up to date", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    fakeNpmView("0.4.0-beta.0");

    await checkForUpdate("0.4.0-beta.0");

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("does not print when current version is newer than latest", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    fakeNpmView("0.3.0");

    await checkForUpdate("0.4.0-beta.0");

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("does not crash when npm view fails", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    fakeNpmView(null);

    await checkForUpdate("0.4.0-beta.0");

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("does not crash when npm view returns empty output", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    fakeNpmView("");

    await checkForUpdate("0.4.0-beta.0");

    expect(logSpy).not.toHaveBeenCalled();
  });
});
