import { existsSync } from "node:fs";
import { basename } from "node:path";
import {
  type MeasuredQuantity,
  type Session,
  type SessionPort,
  createContextSDK,
  createSessionManager,
  createUsageService,
} from "@atlas/sdk";
import type { Command } from "commander";
import { contextDbPath } from "./search";
import { formatMeasured, usageDbPath } from "./usage";

/** Injectable services for {@link registerSessions}. */
export interface SessionsCommandOptions {
  /** Session manager override (defaults to a real in-memory manager). */
  readonly sessions?: SessionPort;
}

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

/** The token-impact figures printed when a session stops. */
export interface SessionTokenImpact {
  /** Tokens the session burned (usage records scoped to its session id). */
  readonly burned: MeasuredQuantity;
  /** Estimated tokens the whole repo would cost without CodeAtlas context. */
  readonly withoutCodeAtlas: MeasuredQuantity;
  /** Estimated tokens saved by using CodeAtlas (`withoutCodeAtlas − burned`). */
  readonly saved: MeasuredQuantity;
}

/**
 * Combine the burned and baseline figures into a full impact report. `saved`
 * stays `unknown` unless both inputs are numeric — the tri-state model never
 * invents a difference.
 */
export function computeSessionTokenImpact(
  burned: MeasuredQuantity,
  withoutCodeAtlas: MeasuredQuantity,
): SessionTokenImpact {
  const saved: MeasuredQuantity =
    burned.value !== null && withoutCodeAtlas.value !== null
      ? {
          source: "estimated",
          value: withoutCodeAtlas.value - burned.value,
          note: "estimated; whole-repo baseline minus burned session usage",
        }
      : { source: "unknown", value: null, note: "needs numeric burned and baseline tokens" };
  return { burned, withoutCodeAtlas, saved };
}

/** Render the token-impact report for `atlas sessions stop`. */
export function renderSessionTokenImpact(impact: SessionTokenImpact): string {
  return [
    "Token impact",
    `Burned:            ${formatMeasured(impact.burned)}`,
    `Without CodeAtlas: ${formatMeasured(impact.withoutCodeAtlas)}`,
    `Saved:             ${formatMeasured(impact.saved)}`,
  ].join("\n");
}

/** Read the tokens recorded for one session from `.codeatlas/usage.db`. */
export function sessionBurnedTokens(root: string, sessionId: string): MeasuredQuantity {
  const dbPath = usageDbPath(root);
  if (!existsSync(dbPath)) {
    return { source: "unknown", value: null, note: "no usage database" };
  }
  const usage = createUsageService({ filePath: dbPath });
  try {
    return usage.statistics({ sessionId }).tokens.total;
  } finally {
    usage.close();
  }
}

/**
 * Estimate the "without CodeAtlas" baseline: the whole repo's source tokens
 * (indexed file bytes ÷ 4, the documented character→token heuristic), or
 * `unknown` when there is no index.
 */
export function wholeRepoBaselineTokens(root: string): MeasuredQuantity {
  const dbPath = contextDbPath(root);
  if (!existsSync(dbPath)) {
    return { source: "unknown", value: null, note: "no context index" };
  }
  const context = createContextSDK({ dbPath, repositoryPath: root });
  try {
    const files = context.files.listFiles();
    if (files.length === 0) {
      return { source: "unknown", value: null, note: "no indexed files" };
    }
    const bytes = files.reduce((sum, file) => sum + file.size, 0);
    return {
      source: "estimated",
      value: Math.ceil(bytes / 4),
      note: "indexed source bytes ÷ 4 (character→token heuristic)",
    };
  } finally {
    context.close();
  }
}

export function registerSessions(program: Command, options: SessionsCommandOptions = {}): void {
  const manager = options.sessions ?? createSessionManager();
  const sessions = program.command("sessions").description("Manage external AI agent sessions");

  sessions
    .command("list")
    .description("List tracked agent sessions")
    .action(async () => {
      await listSessions(manager);
    });

  sessions
    .command("info <sessionId>")
    .description("Show details for one session")
    .action(async (sessionId: string) => {
      await showSession(manager, sessionId);
    });

  sessions
    .command("stop <sessionId>")
    .description("Gracefully stop a running session and report its token impact")
    .action(async (sessionId: string) => {
      await stopSession(manager, sessionId);
    });

  // Bare `atlas sessions` lists sessions, mirroring `atlas sessions list`.
  sessions.action(async () => {
    await listSessions(manager);
  });
}

async function listSessions(manager: SessionPort): Promise<void> {
  console.log(renderSessionsTable(manager.listSessions()));
}

async function showSession(manager: SessionPort, sessionId: string): Promise<void> {
  const session = manager.getSession(sessionId);
  if (session === undefined) {
    console.error(`Session not found: ${sessionId}`);
    process.exitCode = 1;
    return;
  }
  console.log(formatSessionInfo(session));
}

async function stopSession(manager: SessionPort, sessionId: string): Promise<void> {
  const session = manager.getSession(sessionId);
  if (session === undefined) {
    console.error(`Session not found: ${sessionId}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Stopping session ${sessionId}...`);
  const result = await manager.stopSession(sessionId);
  if (!result.ok) {
    console.error(result.error.message);
    process.exitCode = 1;
    return;
  }
  console.log("✓ Session stopped");
  const impact = computeSessionTokenImpact(
    sessionBurnedTokens(session.repositoryPath, session.id),
    wholeRepoBaselineTokens(session.repositoryPath),
  );
  console.log(renderSessionTokenImpact(impact));
}
