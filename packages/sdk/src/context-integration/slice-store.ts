/**
 * Context Slice persistence — `.codeatlas/slices/<id>.{json,md}`.
 *
 * Saved slices are plain files on the user's disk; loading them treats the
 * files as **untrusted input** (the Tool Manifest rules): ids must be safe
 * file names (no traversal), files are size-bounded before reading, and the
 * JSON shape is structurally validated — a hostile or corrupt file is
 * rejected with a typed error, never executed or merged blindly.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ContextSliceValidationError } from "./errors";
import type { ContextSlice } from "./slice";
import { renderContextSlice } from "./slice";

/** Sub-directory of `.codeatlas/` holding saved slices. */
export const SLICES_DIR_NAME = "slices";

/** Schema version of the slice JSON file (bump on breaking shape changes). */
export const CONTEXT_SLICE_SCHEMA_VERSION = 1;

/**
 * Upper bound on a slice file's size. Slices are budgeted (~12K tokens ≈ 48KB
 * by default); 4MB is a generous ceiling that a hostile file cannot blow past.
 */
export const MAX_SLICE_FILE_BYTES = 4 * 1024 * 1024;

/** Slice ids are exactly the hex chars `sliceId()` emits — path-safe by shape. */
const SAFE_SLICE_ID = /^[0-9a-f]{16}$/;

/** Kinds/sources a validated slice item may carry (mirrors `models.ts`). */
const ITEM_KINDS = new Set([
  "file",
  "symbol",
  "summary",
  "dependency",
  "instructions",
  "overview",
  "digest",
]);
const ITEM_SOURCES = new Set([
  "search",
  "explicit",
  "summary",
  "dependency",
  "dependency-chain",
  "instructions",
  "overview",
  "digest",
]);
const STALENESS_STATES = new Set(["fresh", "stale", "unknown", "unavailable"]);

/** The wrapped JSON document persisted for a slice. */
export interface ContextSliceFile {
  readonly schemaVersion: number;
  readonly slice: ContextSlice;
}

/** Where a saved slice lives (both files share the id stem). */
export interface ContextSlicePaths {
  readonly jsonPath: string;
  readonly markdownPath: string;
}

/** The listing projection of a saved slice (no bulky item content). */
export interface ContextSliceSummary {
  readonly id: string;
  readonly task: string;
  readonly createdAt: string;
  readonly repository: string;
  readonly items: number;
  readonly tokensEstimated: number;
  readonly stalenessState: string;
}

/** The `.codeatlas/slices/` directory of a repository. */
export function contextSlicesDir(repositoryPath: string): string {
  return join(repositoryPath, ".codeatlas", SLICES_DIR_NAME);
}

/**
 * The on-disk paths of a saved slice. Throws a typed
 * {@link ContextSliceValidationError} for ids that are not safe file names,
 * so untrusted ids can never escape the slices directory.
 */
export function contextSlicePaths(repositoryPath: string, id: string): ContextSlicePaths {
  if (!SAFE_SLICE_ID.test(id)) {
    throw new ContextSliceValidationError(
      `"${id}" is not a valid slice id (expected 16 hex characters).`,
    );
  }
  const dir = contextSlicesDir(repositoryPath);
  return { jsonPath: join(dir, `${id}.json`), markdownPath: join(dir, `${id}.md`) };
}

/**
 * Persist a slice as `<id>.json` (machine, schema-versioned) and `<id>.md`
 * (the agent-readable bundle). Same `{repo, task, budget}` ⇒ same id, so a
 * re-save overwrites idempotently instead of accumulating copies.
 */
export async function saveContextSlice(
  repositoryPath: string,
  slice: ContextSlice,
): Promise<ContextSlicePaths> {
  const paths = contextSlicePaths(repositoryPath, slice.id);
  const document: ContextSliceFile = {
    schemaVersion: CONTEXT_SLICE_SCHEMA_VERSION,
    slice,
  };
  await mkdir(contextSlicesDir(repositoryPath), { recursive: true });
  await writeFile(paths.jsonPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await writeFile(paths.markdownPath, `${renderContextSlice(slice)}\n`, "utf8");
  return paths;
}

/**
 * Load a saved slice's JSON document, validated as untrusted input. Returns
 * `null` when it does not exist; throws {@link ContextSliceValidationError}
 * when the file is oversized, not JSON, or has an invalid shape.
 */
export async function loadContextSlice(
  repositoryPath: string,
  id: string,
): Promise<ContextSlice | null> {
  const { jsonPath } = contextSlicePaths(repositoryPath, id);
  if (!existsSync(jsonPath)) {
    return null;
  }
  const size = (await stat(jsonPath)).size;
  if (size > MAX_SLICE_FILE_BYTES) {
    throw new ContextSliceValidationError(
      `Slice file exceeds the ${MAX_SLICE_FILE_BYTES} byte bound: ${jsonPath}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(jsonPath, "utf8"));
  } catch (error) {
    throw new ContextSliceValidationError(
      `Slice file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const document = validateContextSliceFile(parsed);
  if (document.slice.id !== id) {
    throw new ContextSliceValidationError(
      `Slice file id "${document.slice.id}" does not match the requested id "${id}".`,
    );
  }
  return document.slice;
}

/**
 * List saved slices (newest first), skipping entries that fail validation —
 * a listing never throws because one corrupt file exists.
 */
export async function listContextSlices(
  repositoryPath: string,
): Promise<readonly ContextSliceSummary[]> {
  const dir = contextSlicesDir(repositoryPath);
  if (!existsSync(dir)) {
    return [];
  }
  const summaries: ContextSliceSummary[] = [];
  for (const entry of await readdir(dir)) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    const id = entry.slice(0, -".json".length);
    try {
      const slice = await loadContextSlice(repositoryPath, id);
      if (slice === null) {
        continue;
      }
      summaries.push({
        id: slice.id,
        task: slice.task,
        createdAt: slice.createdAt,
        repository: slice.repository.name,
        items: slice.items.length,
        tokensEstimated: slice.tokens.estimated,
        stalenessState: slice.staleness.state,
      });
    } catch {
      // Corrupt/oversized file — skip it; listing stays honest for the rest.
    }
  }
  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Validate an unknown value as a {@link ContextSliceFile} (untrusted input). */
export function validateContextSliceFile(value: unknown): ContextSliceFile {
  if (!isRecord(value)) {
    throw new ContextSliceValidationError("Slice file root is not an object.");
  }
  if (value["schemaVersion"] !== CONTEXT_SLICE_SCHEMA_VERSION) {
    throw new ContextSliceValidationError(
      `Unsupported slice schema version: ${String(value["schemaVersion"])} ` +
        `(expected ${CONTEXT_SLICE_SCHEMA_VERSION}).`,
    );
  }
  return {
    schemaVersion: CONTEXT_SLICE_SCHEMA_VERSION,
    slice: validateContextSlice(value["slice"]),
  };
}

/** Validate an unknown value as a {@link ContextSlice} (untrusted input). */
export function validateContextSlice(value: unknown): ContextSlice {
  if (!isRecord(value)) {
    throw new ContextSliceValidationError("Slice is not an object.");
  }
  const id = value["id"];
  if (typeof id !== "string" || !SAFE_SLICE_ID.test(id)) {
    throw new ContextSliceValidationError("Slice id is missing or not 16 hex characters.");
  }
  requireString(value, "task", id);
  requireString(value, "createdAt", id);

  const repository = value["repository"];
  if (!isRecord(repository)) {
    throw new ContextSliceValidationError(`Slice ${id}: repository is not an object.`);
  }
  requireString(repository, "name", id);
  requireString(repository, "lastIndexedAt", id);
  if (repository["commit"] !== undefined && typeof repository["commit"] !== "string") {
    throw new ContextSliceValidationError(`Slice ${id}: repository.commit is not a string.`);
  }

  const items = value["items"];
  if (!Array.isArray(items) || items.length > 1000) {
    throw new ContextSliceValidationError(
      `Slice ${id}: items is not a bounded array (max 1000 entries).`,
    );
  }
  const validatedItems = items.map((item, index) => validateSliceItem(item, id, index));

  const tokens = value["tokens"];
  if (!isRecord(tokens)) {
    throw new ContextSliceValidationError(`Slice ${id}: tokens is not an object.`);
  }
  if (typeof tokens["estimated"] !== "number" || tokens["method"] !== "estimated") {
    throw new ContextSliceValidationError(
      `Slice ${id}: tokens must be { estimated: number, method: "estimated" }.`,
    );
  }

  const budget = validateBudgetRecord(value["budget"], id);
  const exclusions = validateExclusions(value["exclusions"], id);
  const staleness = validateStaleness(value["staleness"], id);

  const retrieval = value["retrieval"];
  if (!isRecord(retrieval)) {
    throw new ContextSliceValidationError(`Slice ${id}: retrieval is not an object.`);
  }
  if (typeof retrieval["latencyMs"] !== "number" || typeof retrieval["strategy"] !== "string") {
    throw new ContextSliceValidationError(
      `Slice ${id}: retrieval must be { latencyMs: number, strategy: string }.`,
    );
  }

  return {
    id,
    task: value["task"] as string,
    createdAt: value["createdAt"] as string,
    repository: {
      name: repository["name"] as string,
      ...(repository["commit"] === undefined ? {} : { commit: repository["commit"] as string }),
      lastIndexedAt: repository["lastIndexedAt"] as string,
    },
    items: validatedItems,
    tokens: { estimated: tokens["estimated"] as number, method: "estimated" },
    budget,
    exclusions,
    staleness,
    retrieval: {
      latencyMs: retrieval["latencyMs"] as number,
      strategy: retrieval["strategy"] as ContextSlice["retrieval"]["strategy"],
    },
  };
}

function validateSliceItem(
  value: unknown,
  sliceId: string,
  index: number,
): ContextSlice["items"][number] {
  if (!isRecord(value)) {
    throw new ContextSliceValidationError(`Slice ${sliceId}: item ${index} is not an object.`);
  }
  for (const field of ["id", "title", "content", "reason"] as const) {
    if (typeof value[field] !== "string") {
      throw new ContextSliceValidationError(
        `Slice ${sliceId}: item ${index} field "${field}" is not a string.`,
      );
    }
  }
  if (typeof value["score"] !== "number" || typeof value["tokens"] !== "number") {
    throw new ContextSliceValidationError(
      `Slice ${sliceId}: item ${index} score/tokens are not numbers.`,
    );
  }
  if (typeof value["truncated"] !== "boolean") {
    throw new ContextSliceValidationError(
      `Slice ${sliceId}: item ${index} truncated is not a boolean.`,
    );
  }
  const kind = value["kind"];
  if (typeof kind !== "string" || !ITEM_KINDS.has(kind)) {
    throw new ContextSliceValidationError(`Slice ${sliceId}: item ${index} has an unknown kind.`);
  }
  const source = value["source"];
  if (typeof source !== "string" || !ITEM_SOURCES.has(source)) {
    throw new ContextSliceValidationError(`Slice ${sliceId}: item ${index} has an unknown source.`);
  }
  const path = value["path"];
  if (path !== null && typeof path !== "string") {
    throw new ContextSliceValidationError(
      `Slice ${sliceId}: item ${index} path is not a string or null.`,
    );
  }
  return {
    id: value["id"] as string,
    kind: kind as ContextSlice["items"][number]["kind"],
    title: value["title"] as string,
    path: (path as string | null) ?? null,
    content: value["content"] as string,
    score: value["score"] as number,
    source: source as ContextSlice["items"][number]["source"],
    reason: value["reason"] as string,
    truncated: value["truncated"] as boolean,
    tokens: value["tokens"] as number,
  };
}

function validateBudgetRecord(value: unknown, sliceId: string): ContextSlice["budget"] {
  if (!isRecord(value)) {
    throw new ContextSliceValidationError(`Slice ${sliceId}: budget is not an object.`);
  }
  const budget = value["budget"];
  if (
    !isRecord(budget) ||
    typeof budget["maxItems"] !== "number" ||
    typeof budget["maxTokensPerItem"] !== "number" ||
    typeof budget["maxTokensTotal"] !== "number"
  ) {
    throw new ContextSliceValidationError(
      `Slice ${sliceId}: budget.budget is not a ContextBudget.`,
    );
  }
  for (const field of [
    "itemsRequested",
    "itemsIncluded",
    "tokensEstimated",
    "budgetExceeded",
  ] as const) {
    if (typeof value[field] !== "number" && typeof value[field] !== "boolean") {
      throw new ContextSliceValidationError(
        `Slice ${sliceId}: budget.${field} is missing or has the wrong type.`,
      );
    }
  }
  for (const field of ["itemsDroppedByCount", "itemsTruncated", "droppedByTokens"] as const) {
    if (!Array.isArray(value[field]) || value[field].some((v) => typeof v !== "string")) {
      throw new ContextSliceValidationError(
        `Slice ${sliceId}: budget.${field} is not a string array.`,
      );
    }
  }
  return {
    budget: {
      maxItems: budget["maxItems"] as number,
      maxTokensPerItem: budget["maxTokensPerItem"] as number,
      maxTokensTotal: budget["maxTokensTotal"] as number,
    },
    itemsRequested: value["itemsRequested"] as number,
    itemsIncluded: value["itemsIncluded"] as number,
    tokensEstimated: value["tokensEstimated"] as number,
    itemsDroppedByCount: value["itemsDroppedByCount"] as string[],
    itemsTruncated: value["itemsTruncated"] as string[],
    droppedByTokens: value["droppedByTokens"] as string[],
    budgetExceeded: value["budgetExceeded"] as boolean,
  };
}

function validateExclusions(value: unknown, sliceId: string): ContextSlice["exclusions"] {
  if (!isRecord(value)) {
    throw new ContextSliceValidationError(`Slice ${sliceId}: exclusions is not an object.`);
  }
  for (const field of ["droppedPaths", "droppedPatterns"] as const) {
    if (!Array.isArray(value[field]) || value[field].some((v) => typeof v !== "string")) {
      throw new ContextSliceValidationError(
        `Slice ${sliceId}: exclusions.${field} is not a string array.`,
      );
    }
  }
  return {
    droppedPaths: value["droppedPaths"] as string[],
    droppedPatterns: value["droppedPatterns"] as string[],
  };
}

function validateStaleness(value: unknown, sliceId: string): ContextSlice["staleness"] {
  if (!isRecord(value)) {
    throw new ContextSliceValidationError(`Slice ${sliceId}: staleness is not an object.`);
  }
  const state = value["state"];
  if (typeof state !== "string" || !STALENESS_STATES.has(state)) {
    throw new ContextSliceValidationError(`Slice ${sliceId}: staleness.state is unknown.`);
  }
  if (typeof value["available"] !== "boolean" || typeof value["lastUpdated"] !== "string") {
    throw new ContextSliceValidationError(
      `Slice ${sliceId}: staleness.available/lastUpdated are missing.`,
    );
  }
  for (const field of ["changed", "added", "deleted"] as const) {
    if (!Array.isArray(value[field]) || value[field].some((v) => typeof v !== "string")) {
      throw new ContextSliceValidationError(
        `Slice ${sliceId}: staleness.${field} is not a string array.`,
      );
    }
  }
  return {
    state: state as ContextSlice["staleness"]["state"],
    available: value["available"] as boolean,
    lastUpdated: value["lastUpdated"] as string,
    changed: value["changed"] as string[],
    added: value["added"] as string[],
    deleted: value["deleted"] as string[],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, field: string, id: string): void {
  if (typeof record[field] !== "string") {
    throw new ContextSliceValidationError(`Slice ${id}: field "${field}" is not a string.`);
  }
}
