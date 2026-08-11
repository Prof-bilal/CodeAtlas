import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSessionManager } from "../src/index";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe("createSessionManager", () => {
  it("returns a provider-agnostic session port", () => {
    const sessions = createSessionManager();
    expect(sessions.listSessions()).toEqual([]);
    expect(sessions.getActiveSessions()).toEqual([]);
  });

  it("creates and inspects a session", () => {
    const repo = mkdtempSync(join(tmpdir(), "atlas-sdk-session-"));
    tempDirs.push(repo);
    const sessions = createSessionManager();

    const created = sessions.createSession({ provider: "claude", repositoryPath: repo });

    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.value.status).toBe("CREATED");
    expect(sessions.getSession(created.value.id)).toBeDefined();
    expect(sessions.listSessions()).toHaveLength(1);
  });

  it("rejects an unknown session id cleanly on stop", async () => {
    const sessions = createSessionManager();
    const result = await sessions.stopSession("nope");

    expect(result.ok).toBe(false);
  });
});
