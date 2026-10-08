/**
 * Task ledger persistence — `.codeatlas/tasks/<id>.json` (ADR-025).
 *
 * A Task outlives in-memory sessions so a later provider can continue the
 * same work. Files are untrusted input (Tool Manifest / slice-store rules):
 * path-safe ids, size-bounded reads, structural validation, never executed.
 */

import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { HashSnapshot } from "@prof-bilal/atlas-core";
import { buildSnapshot, compareHashes } from "@prof-bilal/atlas-hashing";
import { TaskLedgerNotFoundError, TaskLedgerValidationError } from "./errors";

/** Sub-directory of `.codeatlas/` holding task ledgers. */
export const TASKS_DIR_NAME = "tasks";

/** Schema version of the task JSON file (bump on breaking shape changes). */
export const TASK_LEDGER_SCHEMA_VERSION = 1;

/** Upper bound on a task file's size. */
export const MAX_TASK_FILE_BYTES = 1 * 1024 * 1024;

/** Captured prior-model output stored on the ledger (32 KiB). */
export const MAX_TASK_OUTPUT_CHARS = 32 * 1024;

/** Cap on listed files-touched so a huge tree cannot blow the handoff. */
export const MAX_FILES_TOUCHED = 200;

/** Task ids are 16 lowercase hex characters — path-safe by shape. */
export const SAFE_TASK_ID = /^[0-9a-f]{16}$/;

const MAX_HASH_ENTRIES = 10_000;
const MAX_SESSIONS = 50;

/** One supervised session that belonged to this task. */
export interface TaskSessionRecord {
  readonly sessionId: string;
  readonly provider: string;
  readonly model: string | null;
  readonly status: string;
  readonly startedAt: number | undefined;
  readonly endedAt: number | undefined;
}

/** Bounded progress captured from prior sessions. */
export interface TaskProgress {
  /** Last captured stdout / chat-agent reply (may be empty). */
  readonly lastOutput: string;
  readonly lastOutputTruncated: boolean;
  /** Repo-relative paths that changed, were added, or were deleted. */
  readonly filesTouched: readonly string[];
  readonly filesTouchedTruncated: boolean;
  /** True when there was no start snapshot to compare against. */
  readonly filesTouchedUnknown: boolean;
  /**
   * True when we have captured agent output. Interactive CLIs (`stdio:
   * inherit`) cannot be transcribed — the handoff prompt must say so.
   */
  readonly transcriptAvailable: boolean;
}

/** Durable task that can span many provider sessions. */
export interface TaskLedger {
  readonly id: string;
  readonly schemaVersion: number;
  readonly task: string;
  readonly repositoryPath: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly sessions: readonly TaskSessionRecord[];
  readonly progress: TaskProgress;
  /** Repo-relative path → SHA-256 at task start (for later hash-delta). */
  readonly hashSnapshotAtStart: HashSnapshot;
}

/** Listing projection (no bulky output / hashes). */
export interface TaskLedgerSummary {
  readonly id: string;
  readonly task: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly sessionCount: number;
  readonly lastProvider: string | null;
  readonly filesTouched: number;
  readonly transcriptAvailable: boolean;
}

/** Allocate a new 16-hex task id. */
export function taskId(): string {
  return randomBytes(8).toString("hex");
}

/** The `.codeatlas/tasks/` directory of a repository. */
export function contextTasksDir(repositoryPath: string): string {
  return join(repositoryPath, ".codeatlas", TASKS_DIR_NAME);
}

/** On-disk JSON path for a task id. Throws for ids that are not path-safe. */
export function contextTaskPath(repositoryPath: string, id: string): string {
  if (!SAFE_TASK_ID.test(id)) {
    throw new TaskLedgerValidationError(
      `"${id}" is not a valid task id (expected 16 hex characters).`,
    );
  }
  return join(contextTasksDir(repositoryPath), `${id}.json`);
}

/** Create a new in-memory ledger (not yet saved). */
export function createTaskLedgerDocument(input: {
  readonly task: string;
  readonly repositoryPath: string;
  readonly hashes?: Readonly<Record<string, string>>;
  readonly now?: string;
}): TaskLedger {
  const now = input.now ?? new Date().toISOString();
  return {
    id: taskId(),
    schemaVersion: TASK_LEDGER_SCHEMA_VERSION,
    task: input.task,
    repositoryPath: input.repositoryPath,
    createdAt: now,
    updatedAt: now,
    sessions: [],
    progress: emptyProgress(),
    hashSnapshotAtStart: { hashes: relativeHashes(input.repositoryPath, input.hashes ?? {}) },
  };
}

export function emptyProgress(): TaskProgress {
  return {
    lastOutput: "",
    lastOutputTruncated: false,
    filesTouched: [],
    filesTouchedTruncated: false,
    filesTouchedUnknown: true,
    transcriptAvailable: false,
  };
}

/** Persist a ledger as `<id>.json`. */
export async function saveTaskLedger(repositoryPath: string, ledger: TaskLedger): Promise<string> {
  const path = contextTaskPath(repositoryPath, ledger.id);
  await mkdir(contextTasksDir(repositoryPath), { recursive: true });
  await writeFile(path, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return path;
}

/**
 * Load a saved ledger, validated as untrusted input. Returns `null` when it
 * does not exist; throws {@link TaskLedgerValidationError} when oversized,
 * not JSON, or invalid.
 */
export async function loadTaskLedger(
  repositoryPath: string,
  id: string,
): Promise<TaskLedger | null> {
  const jsonPath = contextTaskPath(repositoryPath, id);
  if (!existsSync(jsonPath)) {
    return null;
  }
  const size = (await stat(jsonPath)).size;
  if (size > MAX_TASK_FILE_BYTES) {
    throw new TaskLedgerValidationError(
      `Task file exceeds the ${MAX_TASK_FILE_BYTES} byte bound: ${jsonPath}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(jsonPath, "utf8"));
  } catch (error) {
    throw new TaskLedgerValidationError(
      `Task file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const ledger = validateTaskLedger(parsed);
  if (ledger.id !== id) {
    throw new TaskLedgerValidationError(
      `Task file id "${ledger.id}" does not match the requested id "${id}".`,
    );
  }
  return ledger;
}

/** List saved tasks (newest first). Corrupt files are skipped, never thrown. */
export async function listTaskLedgers(
  repositoryPath: string,
): Promise<readonly TaskLedgerSummary[]> {
  const dir = contextTasksDir(repositoryPath);
  if (!existsSync(dir)) {
    return [];
  }
  const summaries: TaskLedgerSummary[] = [];
  for (const entry of await readdir(dir)) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    const id = entry.slice(0, -".json".length);
    try {
      const ledger = await loadTaskLedger(repositoryPath, id);
      if (ledger === null) {
        continue;
      }
      const last = ledger.sessions[ledger.sessions.length - 1];
      summaries.push({
        id: ledger.id,
        task: ledger.task,
        createdAt: ledger.createdAt,
        updatedAt: ledger.updatedAt,
        sessionCount: ledger.sessions.length,
        lastProvider: last?.provider ?? null,
        filesTouched: ledger.progress.filesTouched.length,
        transcriptAvailable: ledger.progress.transcriptAvailable,
      });
    } catch {
      // Corrupt/oversized file — skip it.
    }
  }
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Find the ledger that recorded `sessionId`, or `null`. */
export async function findTaskLedgerBySessionId(
  repositoryPath: string,
  sessionId: string,
): Promise<TaskLedger | null> {
  const dir = contextTasksDir(repositoryPath);
  if (!existsSync(dir)) {
    return null;
  }
  for (const entry of await readdir(dir)) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    const id = entry.slice(0, -".json".length);
    try {
      const ledger = await loadTaskLedger(repositoryPath, id);
      if (ledger?.sessions.some((session) => session.sessionId === sessionId) === true) {
        return ledger;
      }
    } catch {
      // skip corrupt
    }
  }
  return null;
}

/**
 * Resolve a user-supplied id as either a 16-hex task id or a session id.
 * Throws {@link TaskLedgerNotFoundError} when neither matches.
 */
export async function resolveTaskLedger(repositoryPath: string, id: string): Promise<TaskLedger> {
  if (SAFE_TASK_ID.test(id)) {
    const byTask = await loadTaskLedger(repositoryPath, id);
    if (byTask !== null) {
      return byTask;
    }
  }
  const bySession = await findTaskLedgerBySessionId(repositoryPath, id);
  if (bySession !== null) {
    return bySession;
  }
  throw new TaskLedgerNotFoundError(id);
}

/** Append a session row and refresh `updatedAt`. */
export function withTaskSession(ledger: TaskLedger, session: TaskSessionRecord): TaskLedger {
  const sessions = [...ledger.sessions, session].slice(-MAX_SESSIONS);
  return { ...ledger, sessions, updatedAt: new Date().toISOString() };
}

/** Replace progress (bounded) and refresh `updatedAt`. */
export function withTaskProgress(ledger: TaskLedger, progress: TaskProgress): TaskLedger {
  return { ...ledger, progress: boundProgress(progress), updatedAt: new Date().toISOString() };
}

/** Clip output / file lists to the documented bounds. */
export function boundProgress(progress: TaskProgress): TaskProgress {
  const truncatedOutput = progress.lastOutput.length > MAX_TASK_OUTPUT_CHARS;
  const truncatedFiles = progress.filesTouched.length > MAX_FILES_TOUCHED;
  return {
    lastOutput: truncatedOutput
      ? progress.lastOutput.slice(0, MAX_TASK_OUTPUT_CHARS)
      : progress.lastOutput,
    lastOutputTruncated: progress.lastOutputTruncated || truncatedOutput,
    filesTouched: truncatedFiles
      ? progress.filesTouched.slice(0, MAX_FILES_TOUCHED)
      : progress.filesTouched,
    filesTouchedTruncated: progress.filesTouchedTruncated || truncatedFiles,
    filesTouchedUnknown: progress.filesTouchedUnknown,
    transcriptAvailable: progress.transcriptAvailable && progress.lastOutput.trim() !== "",
  };
}

/**
 * Compare the task-start snapshot to the current working tree (indexed paths).
 * Paths are stored repo-relative. A missing/empty start snapshot is unknown.
 */
export async function computeFilesTouched(
  repositoryPath: string,
  start: HashSnapshot,
): Promise<{
  readonly filesTouched: readonly string[];
  readonly truncated: boolean;
  readonly unknown: boolean;
}> {
  const previous = relativeHashes(repositoryPath, start.hashes);
  if (Object.keys(previous).length === 0) {
    return { filesTouched: [], truncated: false, unknown: true };
  }
  const absolutePrevious: Record<string, string> = {};
  for (const [path, hash] of Object.entries(previous)) {
    absolutePrevious[resolve(repositoryPath, path)] = hash;
  }
  const current = await buildSnapshot(Object.keys(absolutePrevious));
  if (!current.ok || Object.keys(current.value.hashes).length === 0) {
    return { filesTouched: [], truncated: false, unknown: true };
  }
  const diff = compareHashes({ hashes: absolutePrevious }, current.value);
  const touched = [...diff.changed, ...diff.added, ...diff.deleted].map((path) =>
    toRelative(repositoryPath, path),
  );
  const unique = [...new Set(touched)].sort();
  return {
    filesTouched: unique.slice(0, MAX_FILES_TOUCHED),
    truncated: unique.length > MAX_FILES_TOUCHED,
    unknown: false,
  };
}

/** Normalize snapshot keys to repo-relative POSIX-ish paths. */
export function relativeHashes(
  repositoryPath: string,
  hashes: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, hash] of Object.entries(hashes)) {
    if (typeof hash !== "string" || hash.length === 0) {
      continue;
    }
    out[toRelative(repositoryPath, path)] = hash;
  }
  return out;
}

function toRelative(repositoryPath: string, path: string): string {
  if (path.startsWith(repositoryPath)) {
    const rel = relative(repositoryPath, path);
    return rel === "" ? path : rel;
  }
  return path;
}

/** Validate an unknown value as a {@link TaskLedger} (untrusted input). */
export function validateTaskLedger(value: unknown): TaskLedger {
  if (!isRecord(value)) {
    throw new TaskLedgerValidationError("Task ledger root is not an object.");
  }
  if (value["schemaVersion"] !== TASK_LEDGER_SCHEMA_VERSION) {
    throw new TaskLedgerValidationError(
      `Unsupported task schema version: ${String(value["schemaVersion"])} ` +
        `(expected ${TASK_LEDGER_SCHEMA_VERSION}).`,
    );
  }
  const id = value["id"];
  if (typeof id !== "string" || !SAFE_TASK_ID.test(id)) {
    throw new TaskLedgerValidationError("Task id is missing or not 16 hex characters.");
  }
  requireString(value, "task", id);
  requireString(value, "repositoryPath", id);
  requireString(value, "createdAt", id);
  requireString(value, "updatedAt", id);

  const sessions = value["sessions"];
  if (!Array.isArray(sessions) || sessions.length > MAX_SESSIONS) {
    throw new TaskLedgerValidationError(
      `Task ${id}: sessions is not a bounded array (max ${MAX_SESSIONS}).`,
    );
  }
  const validatedSessions = sessions.map((session, index) =>
    validateSessionRecord(session, id, index),
  );

  return {
    id,
    schemaVersion: TASK_LEDGER_SCHEMA_VERSION,
    task: value["task"] as string,
    repositoryPath: value["repositoryPath"] as string,
    createdAt: value["createdAt"] as string,
    updatedAt: value["updatedAt"] as string,
    sessions: validatedSessions,
    progress: validateProgress(value["progress"], id),
    hashSnapshotAtStart: validateSnapshot(value["hashSnapshotAtStart"], id),
  };
}

function validateSessionRecord(
  value: unknown,
  taskIdValue: string,
  index: number,
): TaskSessionRecord {
  if (!isRecord(value)) {
    throw new TaskLedgerValidationError(`Task ${taskIdValue}: session ${index} is not an object.`);
  }
  if (typeof value["sessionId"] !== "string" || value["sessionId"].length === 0) {
    throw new TaskLedgerValidationError(`Task ${taskIdValue}: session ${index} sessionId missing.`);
  }
  if (typeof value["provider"] !== "string" || value["provider"].length === 0) {
    throw new TaskLedgerValidationError(`Task ${taskIdValue}: session ${index} provider missing.`);
  }
  if (typeof value["status"] !== "string") {
    throw new TaskLedgerValidationError(`Task ${taskIdValue}: session ${index} status missing.`);
  }
  const model = value["model"];
  if (model !== null && model !== undefined && typeof model !== "string") {
    throw new TaskLedgerValidationError(`Task ${taskIdValue}: session ${index} model is invalid.`);
  }
  const startedAt = value["startedAt"];
  const endedAt = value["endedAt"];
  if (startedAt !== undefined && typeof startedAt !== "number") {
    throw new TaskLedgerValidationError(`Task ${taskIdValue}: session ${index} startedAt invalid.`);
  }
  if (endedAt !== undefined && typeof endedAt !== "number") {
    throw new TaskLedgerValidationError(`Task ${taskIdValue}: session ${index} endedAt invalid.`);
  }
  return {
    sessionId: value["sessionId"],
    provider: value["provider"],
    model: typeof model === "string" ? model : null,
    status: value["status"],
    startedAt: typeof startedAt === "number" ? startedAt : undefined,
    endedAt: typeof endedAt === "number" ? endedAt : undefined,
  };
}

function validateProgress(value: unknown, taskIdValue: string): TaskProgress {
  if (!isRecord(value)) {
    throw new TaskLedgerValidationError(`Task ${taskIdValue}: progress is not an object.`);
  }
  if (typeof value["lastOutput"] !== "string") {
    throw new TaskLedgerValidationError(
      `Task ${taskIdValue}: progress.lastOutput is not a string.`,
    );
  }
  for (const flag of [
    "lastOutputTruncated",
    "filesTouchedTruncated",
    "filesTouchedUnknown",
    "transcriptAvailable",
  ] as const) {
    if (typeof value[flag] !== "boolean") {
      throw new TaskLedgerValidationError(
        `Task ${taskIdValue}: progress.${flag} is not a boolean.`,
      );
    }
  }
  const files = value["filesTouched"];
  if (!Array.isArray(files) || files.length > MAX_FILES_TOUCHED + 1) {
    throw new TaskLedgerValidationError(`Task ${taskIdValue}: progress.filesTouched is invalid.`);
  }
  if (files.some((entry) => typeof entry !== "string")) {
    throw new TaskLedgerValidationError(
      `Task ${taskIdValue}: progress.filesTouched is not a string array.`,
    );
  }
  return boundProgress({
    lastOutput: value["lastOutput"],
    lastOutputTruncated: value["lastOutputTruncated"] as boolean,
    filesTouched: files as string[],
    filesTouchedTruncated: value["filesTouchedTruncated"] as boolean,
    filesTouchedUnknown: value["filesTouchedUnknown"] as boolean,
    transcriptAvailable: value["transcriptAvailable"] as boolean,
  });
}

function validateSnapshot(value: unknown, taskIdValue: string): HashSnapshot {
  if (!isRecord(value)) {
    throw new TaskLedgerValidationError(
      `Task ${taskIdValue}: hashSnapshotAtStart is not an object.`,
    );
  }
  const hashes = value["hashes"];
  if (!isRecord(hashes)) {
    throw new TaskLedgerValidationError(`Task ${taskIdValue}: hashSnapshotAtStart.hashes missing.`);
  }
  const keys = Object.keys(hashes);
  if (keys.length > MAX_HASH_ENTRIES) {
    throw new TaskLedgerValidationError(`Task ${taskIdValue}: too many hash entries.`);
  }
  const out: Record<string, string> = {};
  for (const key of keys) {
    if (key.includes("..") || key.includes("\0")) {
      throw new TaskLedgerValidationError(`Task ${taskIdValue}: unsafe hash path "${key}".`);
    }
    const hash = hashes[key];
    if (typeof hash !== "string") {
      throw new TaskLedgerValidationError(
        `Task ${taskIdValue}: hash for "${key}" is not a string.`,
      );
    }
    out[key] = hash;
  }
  return { hashes: out };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, field: string, id: string): void {
  if (typeof record[field] !== "string") {
    throw new TaskLedgerValidationError(`Task ${id}: field "${field}" is not a string.`);
  }
}
