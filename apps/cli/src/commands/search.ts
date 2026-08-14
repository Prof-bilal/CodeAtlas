import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type SearchHitKind,
  type SearchRequest,
  type SearchResult,
  createContextSDK,
} from "@atlas/sdk";
import { InvalidArgumentError } from "commander";
import type { Command } from "commander";

/** The result kinds `atlas search --type` accepts. */
const SEARCH_KINDS: readonly SearchHitKind[] = [
  "file",
  "symbol",
  "module",
  "dependency",
  "summary",
];

/** Parsed `atlas search` CLI options (Commander's camel-cased values). */
export interface SearchCliOptions {
  readonly repo?: string;
  readonly limit?: number;
  readonly type?: string[];
  readonly fuzzy: boolean;
  readonly json?: boolean;
}

/** The project root: `ATLAS_ROOT` when set, else the working directory. */
export function resolveProjectRoot(): string {
  return resolve(process.env["ATLAS_ROOT"] ?? process.cwd());
}

/** Path of the on-disk context database for a project root. */
export function contextDbPath(root: string): string {
  return join(root, ".codeatlas", "context.db");
}

/** Render ranked hits as human-readable text (used by the command and tests). */
export function renderSearchHits(query: string, hits: readonly SearchResult[]): string {
  if (hits.length === 0) {
    return `No results for "${query}".`;
  }
  const lines = [`${hits.length} result${hits.length === 1 ? "" : "s"} for "${query}":`];
  for (const hit of hits) {
    const kind = hit.kind.padEnd(10);
    const relation = hit.relation === undefined ? "" : ` [${hit.relation}]`;
    const path = hit.path ?? "";
    lines.push(`  ${kind} ${hit.title}${relation}  ${path}  (score ${hit.score})`);
    if (hit.snippet !== undefined) {
      lines.push(`           ${hit.snippet}`);
    }
  }
  return lines.join("\n");
}

export function registerSearch(program: Command): void {
  program
    .command("search")
    .description("Search the CodeAtlas index (symbols, files, modules, dependencies, summaries)")
    .argument("<query...>", "search query (multiple words are joined)")
    .option("--repo <path>", "repository path (defaults to ATLAS_ROOT or cwd)")
    .option("-l, --limit <number>", "maximum number of results to show", parseLimit, 20)
    .option(
      "-t, --type <kind>",
      "restrict results to a kind (repeatable)",
      collectType,
      [] as string[],
    )
    .option("--no-fuzzy", "disable typo-tolerant fuzzy matching")
    .option("--json", "print results as JSON")
    .action(async (query: string[], options: SearchCliOptions) => {
      await runSearch(query.join(" "), options);
    });
}

async function runSearch(query: string, options: SearchCliOptions): Promise<void> {
  const root = options.repo === undefined ? resolveProjectRoot() : resolve(options.repo);
  const dbPath = contextDbPath(root);
  if (!existsSync(dbPath)) {
    console.error(`No context index found at ${dbPath}.`);
    console.error("Build the index first (e.g. via the SDK `ContextStore.saveContext`).");
    process.exitCode = 1;
    return;
  }

  const context = createContextSDK({ dbPath });
  try {
    const types =
      options.type !== undefined && options.type.length > 0
        ? (options.type as readonly SearchHitKind[])
        : undefined;
    const request: SearchRequest = {
      fuzzy: options.fuzzy,
      ...(options.limit !== undefined ? { limit: options.limit } : {}),
      ...(types !== undefined ? { types } : {}),
    };
    const hits = context.search.search(query, request);

    if (options.json === true) {
      console.log(JSON.stringify(hits, null, 2));
    } else {
      console.log(renderSearchHits(query, hits));
    }
  } finally {
    // Release the SQLite file handle (WAL) so the on-disk index can be replaced.
    context.close();
  }
}

function parseLimit(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`--limit must be a positive integer, got "${value}"`);
  }
  return parsed;
}

function collectType(value: string, previous: string[]): string[] {
  if (!(SEARCH_KINDS as readonly string[]).includes(value)) {
    throw new InvalidArgumentError(
      `--type must be one of ${SEARCH_KINDS.join(", ")}, got "${value}"`,
    );
  }
  previous.push(value);
  return previous;
}
