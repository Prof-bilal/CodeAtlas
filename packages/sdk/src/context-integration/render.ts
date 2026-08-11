import type { ContextExplanation, ContextPackage, ContextPackageItem } from "./models";

/**
 * Render helpers for the Context → Agent integration layer.
 *
 * A {@link ContextPackage} is provider-independent; consumers (the CLI, a slash
 * command, an editor) format it however they need. These two helpers cover the
 * common cases: a full prompt (with item content) for launching an AI CLI, and
 * a compact `--explain` listing (without bulky content). Neither knows anything
 * about a specific provider.
 */

const STALENESS_LABEL: Readonly<Record<string, string>> = {
  fresh: "context index is fresh",
  stale: "context index is STALE (files changed since it was built)",
  unknown: "context staleness is unknown",
  unavailable: "no context index exists",
};

/** Render a full, provider-independent prompt from a context package. */
export function renderContextPackage(pkg: ContextPackage): string {
  const lines: string[] = [];
  lines.push(`# Task`);
  lines.push(pkg.task);
  lines.push("");
  lines.push(
    `# Repository context (${STALENESS_LABEL[pkg.staleness.state] ?? pkg.staleness.state})`,
  );
  if (pkg.staleness.changed.length > 0) {
    lines.push(`Changed files: ${pkg.staleness.changed.join(", ")}`);
  }
  if (pkg.staleness.added.length > 0) {
    lines.push(`Added files: ${pkg.staleness.added.join(", ")}`);
  }
  if (pkg.staleness.deleted.length > 0) {
    lines.push(`Deleted files: ${pkg.staleness.deleted.join(", ")}`);
  }
  lines.push("");
  for (const item of pkg.items) {
    lines.push(`## ${item.title}`);
    lines.push(item.content);
    lines.push("");
    lines.push(`> reason: ${item.reason}`);
    if (item.truncated) {
      lines.push(`> truncated to ${item.tokens} tokens (per-item cap)`);
    }
    lines.push("");
  }
  lines.push(`# Budget`);
  lines.push(
    `${pkg.budget.itemsIncluded}/${pkg.budget.itemsRequested} items, ` +
      `${pkg.budget.tokensEstimated} estimated tokens (cap ${pkg.budget.budget.maxTokensTotal}).`,
  );
  if (pkg.budget.budgetExceeded) {
    lines.push(`Warning: essential context alone exceeds the total token budget.`);
  }
  if (pkg.exclusions.droppedPaths.length > 0) {
    lines.push(`Excluded (secrets/deny-filter): ${pkg.exclusions.droppedPaths.join(", ")}.`);
  }
  return lines.join("\n");
}

/** Render a compact, content-free explanation of a package. */
export function renderContextExplanation(explanation: ContextExplanation): string {
  const lines: string[] = [];
  lines.push(`Task: ${explanation.task}`);
  lines.push(`Staleness: ${explanation.staleness.state}`);
  lines.push("");
  lines.push("Selected items:");
  for (const item of explanation.items) {
    lines.push(`- [${item.kind}/${item.source}] ${item.title} — score ${item.score}`);
    lines.push(`  ${item.reason}`);
  }
  lines.push("");
  lines.push(
    `Budget: ${explanation.budget.itemsIncluded}/${explanation.budget.itemsRequested} items, ` +
      `${explanation.budget.tokensEstimated} tokens (truncated: ${explanation.budget.itemsTruncated.length}, ` +
      `dropped by tokens: ${explanation.budget.droppedByTokens.length}, ` +
      `dropped by count: ${explanation.budget.itemsDroppedByCount.length}).`,
  );
  if (explanation.exclusions.droppedPaths.length > 0) {
    lines.push(`Excluded: ${explanation.exclusions.droppedPaths.join(", ")}.`);
  }
  return lines.join("\n");
}

/** Project a package to its content-free explanation form. */
export function toContextExplanation(pkg: ContextPackage): ContextExplanation {
  return {
    task: pkg.task,
    items: pkg.items.map(toExplanationItem),
    staleness: pkg.staleness,
    budget: pkg.budget,
    exclusions: pkg.exclusions,
  };
}

function toExplanationItem(item: ContextPackageItem): ContextExplanation["items"][number] {
  return {
    id: item.id,
    title: item.title,
    kind: item.kind,
    source: item.source,
    score: item.score,
    reason: item.reason,
    truncated: item.truncated,
    tokens: item.tokens,
  };
}
