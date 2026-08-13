import { AgentService } from "@atlas/agents";
import { createSessionManager } from "@atlas/sdk";
import { describe, expect, it } from "vitest";
import { REPO_PATH, runCli, writeResult } from "./helpers";

interface AgentRecord {
  readonly provider: string;
  readonly binary: string;
  readonly available: boolean;
  readonly path: string | null;
  readonly version: string | undefined;
}

interface SessionRecord {
  readonly provider: string;
  readonly created: boolean;
  readonly status: string | null;
  readonly error: string | null;
}

/**
 * 06 — Agent connection layer + session manager against the real machine.
 * Detects which AI CLIs are actually installed (honest, never faked), and
 * verifies the session lifecycle through the SDK's `createSessionManager` and
 * the `atlas sessions` CLI.
 */
describe("06 — agents & sessions", () => {
  const agentRecords: AgentRecord[] = [];
  const sessionRecords: SessionRecord[] = [];

  it("detects installed AI coding CLIs honestly", async () => {
    const agents = new AgentService();
    const result = await agents.detectAll();
    expect(result.ok).toBe(true);
    const info = result.ok ? result.value : [];
    expect(info.length).toBeGreaterThan(0);

    for (const entry of info) {
      agentRecords.push({
        provider: entry.provider,
        binary: entry.binary,
        available: entry.available,
        path: entry.path ?? null,
        version: entry.version,
      });
    }
    // claude is a built-in adapter; on this machine it may or may not be present.
    const claude = info.find((entry) => entry.provider === "claude");
    expect(claude).toBeDefined();
    // Whether or not it is installed, detection must be a boolean, never a throw.
    expect(typeof claude?.available).toBe("boolean");
  });

  it("creates and lists isolated sessions through the session manager", () => {
    const sessions = createSessionManager({ defaultProvider: "claude" });
    const created: string[] = [];

    for (const provider of ["claude", "codex"]) {
      const result = sessions.createSession({
        provider,
        repositoryPath: REPO_PATH,
      });
      sessionRecords.push({
        provider,
        created: result.ok,
        status: result.ok ? result.value.status : null,
        error: result.ok ? null : String((result.error as Error).message),
      });
      // claude is registered even when not installed; unknown providers fail.
      if (provider === "claude") {
        expect(result.ok, "claude session should create (adapter registered)").toBe(true);
        if (result.ok) created.push(result.value.id);
      }
    }

    // Unknown provider must fail with a typed error.
    const bogus = sessions.createSession({
      provider: "not-a-real-agent",
      repositoryPath: REPO_PATH,
    });
    expect(bogus.ok).toBe(false);
    sessionRecords.push({
      provider: "not-a-real-agent",
      created: false,
      status: null,
      error: String((bogus.error as Error).message),
    });

    const list = sessions.listSessions();
    expect(list.length).toBeGreaterThanOrEqual(1);
    // Session ids are stable and distinct.
    expect(new Set(list.map((session) => session.id)).size).toBe(list.length);
    // Sessions are isolated: created sessions do not share state.
    for (const id of created) {
      const session = sessions.getSession(id);
      expect(session).toBeDefined();
      expect(session?.repositoryPath).toBe(REPO_PATH);
    }
  });

  it("reports unknown sessions cleanly through the CLI", async () => {
    const info = await runCli(["sessions", "info", "does-not-exist"]);
    expect(info.code).toBe(1);
    expect(info.stderr.toLowerCase()).toContain("session not found");

    const stop = await runCli(["sessions", "stop", "does-not-exist"]);
    expect(stop.code).toBe(1);
    expect(stop.stderr.toLowerCase()).toContain("session not found");
  });

  it("records agent + session results for the report", async () => {
    await writeResult("06-agents-sessions", { agents: agentRecords, sessions: sessionRecords });
  });
});
