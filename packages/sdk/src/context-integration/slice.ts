/**
 * The Context Slice — the selective AI context delivery unit.
 *
 * A {@link ContextSlice} is a persisted, serializable projection of one
 * {@link ContextPackage} (ADR-008): the smallest ranked, budgeted,
 * deny-filtered set of repository context assembled for ONE task. Every
 * delivery channel (CLI `atlas ask`, `atlas context export`, the MCP
 * `get_context_slice` tool, the HTTP API) serves slices — never the whole
 * repository scan output.
 *
 * The slice extends (does not replace) the package with provenance the
 * channels need: a stable id (hash of `{repo, task, budget}`), repository
 * provenance, an honest token estimate, the retrieval strategy/latency, and
 * the staleness signal carried end-to-end.
 */

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { hashContent } from "@atlas/hashing";
import type { ContextSDK } from "../context/sdk";
import { type AssembleOptions, assembleContextPackage } from "./assemble";
import type {
  BudgetRecord,
  ContextBudget,
  ContextPackage,
  ContextPackageItem,
  ExclusionRecord,
  StaleContextSignal,
} from "./models";
import { detectStaleness } from "./staleness";

/** The deterministic retrieval strategy that produced slices (contract field). */
export const SLICE_STRATEGY = "deterministic-v1" as const;

/** Length of a slice id (leading hex chars of the `{repo, task, budget}` hash). */
const SLICE_ID_LENGTH = 16;

/** Repository provenance carried on every slice. */
export interface ContextSliceRepository {
  /** Repository directory name (display only; never a secret-bearing path). */
  readonly name: string;
  /** Best-effort HEAD commit (present only when derivable from `.git/`). */
  readonly commit?: string | undefined;
  /** ISO timestamp of the last index write (`""` when unavailable). */
  readonly lastIndexedAt: string;
}

/**
 * A ranked, budgeted, deny-filtered selection of repository context for one
 * task — the serializable projection of a {@link ContextPackage} that every
 * delivery channel serves.
 */
export interface ContextSlice {
  /** Stable hash of `{repository, task, budget}` (same input ⇒ same slice file). */
  readonly id: string;
  readonly task: string;
  /** ISO timestamp of slice creation. */
  readonly createdAt: string;
  readonly repository: ContextSliceRepository;
  /** Ordered items: instructions, then overview, then rank-descending context. */
  readonly items: readonly ContextPackageItem[];
  /** Estimated token count of the whole slice (chars/4 heuristic, always labeled). */
  readonly tokens: { readonly estimated: number; readonly method: "estimated" };
  /** What the budget enforcement actually did. */
  readonly budget: BudgetRecord;
  /** What was deliberately NOT included (deny-filtered paths/patterns). */
  readonly exclusions: ExclusionRecord;
  /** The staleness signal at assembly time (carried to every channel). */
  readonly staleness: StaleContextSignal;
  readonly retrieval: {
    readonly latencyMs: number;
    readonly strategy: typeof SLICE_STRATEGY;
  };
}

/** Inputs to {@link buildContextSlice}. */
export interface BuildSliceInput {
  /** The read façade the slice is assembled from (never the DB directly). */
  readonly context: ContextSDK;
  /** The task/question the slice answers. */
  readonly task: string;
  /**
   * Pre-computed staleness signal; detected via {@link detectStaleness} when
   * absent. Callers that auto-refresh first (the CLI/MCP freshness contract)
   * pass the post-refresh signal.
   */
  readonly staleness?: StaleContextSignal;
  /** Assemble options (budget overrides, scoping, …); defaults are conservative. */
  readonly options?: AssembleOptions;
}

/**
 * Build a Context Slice for one task: assemble the deterministic package and
 * project it with provenance. No AI, no network — the slice strategy is
 * `deterministic-v1`.
 */
export async function buildContextSlice(input: BuildSliceInput): Promise<ContextSlice> {
  const staleness = input.staleness ?? (await detectStaleness(input.context));
  return projectContextSlice(input.context, input.task, staleness, input.options ?? {});
}

/**
 * The assembly half of {@link buildContextSlice} with an explicit staleness
 * signal — the seam the Context → Agent integration uses after its
 * auto-refresh step.
 */
export function projectContextSlice(
  context: ContextSDK,
  task: string,
  staleness: StaleContextSignal,
  options: AssembleOptions,
): ContextSlice {
  const repositoryPath = context.config.repositoryPath;
  const startedAt = performance.now();
  const pkg = assembleContextPackage({ context, repositoryPath, task, staleness, options });
  return toContextSlice(pkg, {
    repositoryPath,
    latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
  });
}

/**
 * Project an assembled package to a slice (adds id, provenance, tokens,
 * retrieval metadata). Pure — no I/O.
 */
export function toContextSlice(
  pkg: ContextPackage,
  provenance: { readonly repositoryPath: string; readonly latencyMs: number },
): ContextSlice {
  const commit = readGitCommit(provenance.repositoryPath);
  return {
    id: sliceId(provenance.repositoryPath, pkg.task, pkg.budget.budget),
    task: pkg.task,
    createdAt: new Date().toISOString(),
    repository: {
      name: repositoryName(provenance.repositoryPath),
      ...(commit === undefined ? {} : { commit }),
      lastIndexedAt: pkg.staleness.lastUpdated,
    },
    items: pkg.items,
    tokens: { estimated: pkg.budget.tokensEstimated, method: "estimated" },
    budget: pkg.budget,
    exclusions: pkg.exclusions,
    staleness: pkg.staleness,
    retrieval: { latencyMs: provenance.latencyMs, strategy: SLICE_STRATEGY },
  };
}

/**
 * The stable slice id: a hash of `{repository, task, budget}`. The same task
 * under the same budget on the same repository maps to the same id, so saved
 * slice files are idempotent (`--save` overwrites rather than accumulating).
 */
export function sliceId(repositoryPath: string, task: string, budget: ContextBudget): string {
  const payload = JSON.stringify({
    repository: repositoryPath.replace(/\\/g, "/"),
    task,
    budget,
  });
  return hashContent(payload).slice(0, SLICE_ID_LENGTH);
}

/** The repository display name (trailing separators stripped). */
function repositoryName(repositoryPath: string): string {
  return basename(repositoryPath.replace(/[/\\]+$/, "")) || repositoryPath;
}

/**
 * Best-effort, read-only HEAD commit derivation from `.git/` — no process
 * spawn, no worktree/GIT_DIR resolution. Returns `undefined` whenever the
 * commit cannot be derived; slices never guess.
 */
function readGitCommit(repositoryPath: string): string | undefined {
  const gitDir = join(repositoryPath, ".git");
  let head: string;
  try {
    head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
  } catch {
    return undefined; // no git metadata (or a worktree `.git` file) — honest omit
  }
  if (/^[0-9a-f]{40}$/i.test(head)) {
    return head;
  }
  if (!head.startsWith("ref: ")) {
    return undefined;
  }
  const ref = head.slice("ref: ".length).trim();
  try {
    const loose = readFileSync(join(gitDir, ref), "utf8").trim();
    if (/^[0-9a-f]{40}$/i.test(loose)) {
      return loose;
    }
  } catch {
    // Fall through to packed-refs.
  }
  try {
    for (const line of readFileSync(join(gitDir, "packed-refs"), "utf8").split("\n")) {
      const entry = line.trim();
      if (entry.startsWith("#") || entry.startsWith("^")) {
        continue;
      }
      const [sha, name] = entry.split(/\s+/, 2);
      if (name === ref && /^[0-9a-f]{40}$/i.test(sha)) {
        return sha;
      }
    }
  } catch {
    // No packed-refs — commit stays honestly undefined.
  }
  return undefined;
}

// ── rendering ───────────────────────────────────────────────────────────────

/** Honest staleness wording for the slice header (never serve stale silently). */
const STALENESS_NOTE: Readonly<Record<string, string>> = {
  fresh: "fresh — the index matches the working tree",
  stale: "**STALE** — files changed since the index was built; run `atlas update`",
  unknown: "unknown — the index state could not be compared with the working tree",
  unavailable: "unavailable — no context index exists",
};

/** Language fence hints per item kind (file items parse theirs from content). */
const KIND_FENCE: Readonly<Record<string, string>> = {
  instructions: "markdown",
  summary: "text",
  dependency: "text",
  overview: "text",
  symbol: "typescript",
  file: "",
};

/**
 * Render a slice as a self-contained markdown bundle an external AI agent can
 * read directly: a provenance header, ranked items with reasons inside code
 * fences, and the budget/exclusion footer. Staleness is always stated.
 */
export function renderContextSlice(slice: ContextSlice): string {
  const lines: string[] = [];
  const commit =
    slice.repository.commit === undefined ? "" : ` @ ${slice.repository.commit.slice(0, 10)}`;
  lines.push(`# Context slice — ${slice.task}`);
  lines.push("");
  lines.push(
    `- Repository: ${slice.repository.name}${commit} (index ${slice.repository.lastIndexedAt || "unknown"})`,
  );
  lines.push(`- Generated: ${slice.createdAt} by CodeAtlas — do not edit`);
  lines.push(`- Tokens: ~${slice.tokens.estimated} (estimated) across ${slice.items.length} items`);
  lines.push(
    `- Retrieval: ${slice.retrieval.strategy} in ${slice.retrieval.latencyMs}ms · ` +
      `index is ${STALENESS_NOTE[slice.staleness.state] ?? slice.staleness.state}`,
  );
  if (slice.staleness.state === "stale") {
    const drifted = [
      ...slice.staleness.changed.slice(0, 5),
      ...slice.staleness.added.slice(0, 5),
      ...slice.staleness.deleted.slice(0, 5),
    ];
    if (drifted.length > 0) {
      lines.push(`- Changed since the index was built: ${drifted.join(", ")}`);
    }
  }
  lines.push("");

  lines.push("## Ranked context");
  for (const [index, item] of slice.items.entries()) {
    lines.push("");
    lines.push(`### ${index + 1}. ${item.title}`);
    lines.push(
      `- kind: ${item.kind} · source: ${item.source} · score: ${item.score} · ` +
        `tokens: ~${item.tokens}${item.truncated ? " (truncated)" : ""}`,
    );
    lines.push(`- reason: ${item.reason}`);
    lines.push("");
    lines.push(`${fence(item)}${sliceItemFenceLanguage(item)}`);
    lines.push(item.content);
    lines.push(fence(item));
  }

  lines.push("");
  lines.push("## Budget");
  lines.push(
    `${slice.budget.itemsIncluded}/${slice.budget.itemsRequested} items included · ` +
      `~${slice.budget.tokensEstimated} tokens (cap ${slice.budget.budget.maxTokensTotal}) · ` +
      `truncated: ${slice.budget.itemsTruncated.length} · dropped by tokens: ` +
      `${slice.budget.droppedByTokens.length} · dropped by count: ${slice.budget.itemsDroppedByCount.length}`,
  );
  if (slice.budget.budgetExceeded) {
    lines.push("Warning: essential context alone exceeds the total token budget.");
  }
  if (slice.exclusions.droppedPaths.length > 0) {
    lines.push(`Excluded by the secret deny-filter: ${slice.exclusions.droppedPaths.join(", ")}.`);
  }
  return lines.join("\n");
}

/**
 * The opening/closing fence for an item's content. The fence is always one
 * backtick longer than the longest backtick run inside the content, so fenced
 * markdown (instruction files) can never break out of the block.
 */
function fence(item: ContextPackageItem): string {
  const longest = item.content.match(/`+/g)?.reduce((a, b) => (b.length > a.length ? b : a), "");
  return "`".repeat((longest?.length ?? 0) + 3);
}

/** The fence info string for an item (file items carry their language). */
export function sliceItemFenceLanguage(item: ContextPackageItem): string {
  if (item.kind === "file") {
    const match = item.content.match(/^Language: (\S+)$/m);
    if (match !== null) {
      return match[1];
    }
  }
  return KIND_FENCE[item.kind] ?? "";
}
