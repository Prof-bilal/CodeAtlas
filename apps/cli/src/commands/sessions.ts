import type { Command } from "commander";
import { basename } from "node:path";
import { createSessionManager, type Session, type SessionPort } from "@atlas/sdk";

/** Display label for a known provider id (falls back to a capitalized id). */
export function agentLabel(provider: string): string {
  if (provider === "opencode") {
    return "OpenCode";
  }
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** Short repository display name for the table (basename of the path). */
export function repositoryLabel(repositoryPath: string): string {
  return basename(repositoryPath) || repositoryPath;
}

/**
 * Render the `atlas sessions list` table. `Active Sessions` is the title even
 * when some rows are stopped — every tracked session is listed.
 */
export function renderSessionsTable(sessions: readonly Session[]): string {
  if (sessions.length === 0) {
    return "No sessions.";
  }
  const headers = ["ID", "Agent", "Repository", "Status"];
  const rows = sessions.map((session) => [
    session.id,
    agentLabel(session.provider),
    repositoryLabel(session.repositoryPath),
    session.status,
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );
  const pad = (cells: readonly string[]): string =>
    cells.map((cell, index) => cell.padEnd(widths[index] + 2)).join("");
  const rule = widths.map((width) => "─".repeat(width)).join("  ");
  return ["Active Sessions", pad(headers), rule, ...rows.map((row) => pad(row))].join("\n");
}

/** Render one session's details for `atlas sessions info`. */
export function formatSessionInfo(session: Session): string {
  const lines = [
    `Session: ${session.id}`,
    `Provider: ${agentLabel(session.provider)}`,
    `Status: ${session.status}`,
    `Repository: ${session.repositoryPath}`,
  ];
  if (session.processId !== undefined) {
    lines.push(`PID: ${session.processId}`);
  }
  if (session.startedAt !== undefined) {
    lines.push(`Started: ${new Date(session.startedAt).toISOString()}`);
  }
  if (session.endedAt !== undefined) {
    lines.push(`Ended: ${new Date(session.endedAt).toISOString()}`);
  }
  if (session.exitCode !== undefined) {
    lines.push(`Exit code: ${session.exitCode === null ? "killed by signal" : session.exitCode}`);
  }
  if (session.error !== undefined) {
    lines.push(`Error: ${session.error}`);
  }
  return lines.join("\n");
}

export function registerSessions(program: Command): void {
  const sessions = program.command("sessions").description("Manage external AI agent sessions");

  sessions
    .command("list")
    .description("List tracked agent sessions")
    .action(async () => {
      await listSessions();
    });

  sessions
    .command("info <sessionId>")
    .description("Show details for one session")
    .action(async (sessionId: string) => {
      await showSession(sessionId);
    });

  sessions
    .command("stop <sessionId>")
    .description("Gracefully stop a running session")
    .action(async (sessionId: string) => {
      await stopSession(sessionId);
    });

  // Bare `atlas sessions` lists sessions, mirroring `atlas sessions list`.
  sessions.action(async () => {
    await listSessions();
  });
}

function manager(): SessionPort {
  return createSessionManager();
}

async function listSessions(): Promise<void> {
  console.log(renderSessionsTable(manager().listSessions()));
}

async function showSession(sessionId: string): Promise<void> {
  const session = manager().getSession(sessionId);
  if (session === undefined) {
    console.error(`Session not found: ${sessionId}`);
    process.exitCode = 1;
    return;
  }
  console.log(formatSessionInfo(session));
}

async function stopSession(sessionId: string): Promise<void> {
  const sessions = manager();
  const session = sessions.getSession(sessionId);
  if (session === undefined) {
    console.error(`Session not found: ${sessionId}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Stopping session ${sessionId}...`);
  const result = await sessions.stopSession(sessionId);
  if (!result.ok) {
    console.error(result.error.message);
    process.exitCode = 1;
    return;
  }
  console.log("✓ Session stopped");
}
