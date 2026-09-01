import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type ContextSDK,
  type MetricsPort,
  type SearchHitKind,
  type SearchRequest,
  type SearchResult,
  type Summary,
  type SummaryPort,
  type UsagePort,
  createContextSDK,
} from "@atlas/sdk";
import { InvalidArgumentError } from "commander";
import type { Command } from "commander";
import { openMetrics } from "./metrics";
import { openUsage } from "./usage";

/** The result kinds `atlas search --type` accepts. */
const SEARCH_KINDS: readonly SearchHitKind[] = [
  "file",
  "symbol",
  "module",
  "dependency",
  "summary",
];

/** The maximum number of top file hits summarized by `atlas search --ai`. */
export const AI_SUMMARY_LIMIT = 5;

/** Injectable services for {@link registerSearch}. */
export interface SearchCommandOptions {
  /** Summary generation port override (defaults to the SDK's provider-backed port). */
  readonly summary?: SummaryPort;
  /** Metrics port override (defaults to a `.codeatlas/metrics.json` service). */
  readonly metrics?: MetricsPort;
  /** Usage port override (defaults to a `.codeatlas/usage.db` service). */
  readonly usage?: UsagePort;
}

/** Parsed `atlas search` CLI options (Commander's camel-cased values). */
export interface SearchCliOptions {
  readonly repo?: string;
  readonly limit?: number;
  readonly type?: string[];
  readonly fuzzy: boolean;
  readonly json?: boolean;
  readonly ai?: boolean;
}

/** The project root: `ATLAS_ROOT` when set, else the working directory. */
export function resolveProjectRoot(): string {
  return resolve(process.env["ATLAS_ROOT"] ?? process.cwd());
}

/** Path of the on-disk context database for a project root. */
export function contextDbPath(root: string): string {
  return join(root, ".codeatlas", "context.db");
}

/** Path of the on-disk metrics file for a project root. */
export function metricsPath(root: string): string {
  return join(root, ".codeatlas", "metrics.json");
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

/** One AI summary attached to a file hit by `atlas search --ai`. */
export interface SearchAISummaryEntry {
  readonly path: string;
  /** The summary when a stored one existed or generation succeeded. */
  readonly summary?: Summary;
  /** Message when the summary could not be produced (e.g. no provider). */
  readonly message?: string;
}

/** Build AI summary entries for the top file hits: stored first, else fresh. */
export async function buildSearchAI(
  context: ContextSDK,
  hits: readonly SearchResult[],
  limit: number = AI_SUMMARY_LIMIT,
): Promise<readonly SearchAISummaryEntry[]> {
  const fileHits = hits.filter((hit) => hit.kind === "file").slice(0, limit);
  const entries: SearchAISummaryEntry[] = [];
  for (const hit of fileHits) {
    const path = hit.path;
    if (path === null || path === "") {
      continue;
    }
    const stored = context.summaries.getFileSummary(path);
    if (stored !== undefined) {
      entries.push({ path, summary: stored });
      continue;
    }
    const generated = await context.summaries.generateFile(path);
    if (generated.ok) {
      entries.push({ path, summary: generated.value });
    } else {
      entries.push({ path, message: generated.error.message });
    }
  }
  return entries;
}

/** Render the AI summaries section of `atlas search --ai`. */
export function renderSearchAI(entries: readonly SearchAISummaryEntry[]): string {
  if (entries.length === 0) {
    return "AI summaries: no file hits to summarize.";
  }
  const lines = ["AI summaries (top file hits):"];
  for (const entry of entries) {
    if (entry.summary !== undefined) {
      const meta = entry.summary.metadata;
      const note = meta.cacheHit ? " (cached)" : "";
      lines.push(`  ${entry.path} (${meta.provider}/${meta.model}${note}):`);
      lines.push(`    ${entry.summary.content.overview}`);
      for (const point of entry.summary.content.keyPoints) {
        lines.push(`    • ${point}`);
      }
    } else {
      lines.push(`  ${entry.path}: ${entry.message ?? "summary unavailable"}`);
    }
  }
  return lines.join("\n");
}

export function registerSearch(program: Command, options: SearchCommandOptions = {}): void {
  program
    .command("search")
    .description("Search the CodeAtlas index (symbols, files, modules, dependencies, summaries)")
    .argument("<query...>", "search query (multiple words are joined)")
    .option("--repo <path>", "repository path (defaults to ATLAS_ROOT or cwd)")
    .option("-l, --limit <number>", "maximum number of results to show", parseLimit, () =>
      Number.parseInt(process.env.LIMIT ?? "20", 10),
    )
    .option(
      "-t, --type <kind>",
      "restrict results to a kind (repeatable)",
      collectType,
      [] as string[],
    )
    .option("--no-fuzzy", "disable typo-tolerant fuzzy matching")
    .option("--json", "print results as JSON")
    .option("--ai", "generate AI summaries for the top file hits (requires a configured provider)")
    .action(async (query: string[], cliOptions: SearchCliOptions) => {
      await runSearch(query.join(" "), cliOptions, options);
    });
}

async function runSearch(
  query: string,
  options: SearchCliOptions,
  commandOptions: SearchCommandOptions = {},
): Promise<void> {
  const root = options.repo === undefined ? resolveProjectRoot() : resolve(options.repo);
  const dbPath = contextDbPath(root);
  if (!existsSync(dbPath)) {
    console.error(`No context index found at ${dbPath}.`);
    console.error("Build the index first (e.g. via the SDK `ContextStore.saveContext`).");
    process.exitCode = 1;
    return;
  }

  const metrics = commandOptions.metrics ?? openMetrics(root);
  const usage = commandOptions.usage ?? openUsage(root);
  const context = createContextSDK({
    dbPath,
    metrics,
    usage,
    ...(commandOptions.summary === undefined ? {} : { summary: commandOptions.summary }),
  });
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

    const aiEntries = options.ai === true ? await buildSearchAI(context, hits) : [];

    if (options.json === true) {
      const output = options.ai === true ? { hits, aiSummaries: aiEntries } : hits;
      console.log(JSON.stringify(output, null, 2));
    } else {
      const rendered = [renderSearchHits(query, hits)];
      if (options.ai === true) {
        rendered.push("", renderSearchAI(aiEntries));
      }
      console.log(rendered.join("\n"));
    }
  } finally {
    // Release the SQLite file handle (WAL) so the on-disk index can be replaced.
    context.close();
    metrics.flush();
    metrics.close();
    usage.close();
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
