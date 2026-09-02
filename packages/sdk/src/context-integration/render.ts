import type {
  ContextBriefing,
  ContextExplanation,
  ContextPackage,
  ContextPackageItem,
} from "./models";

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
  lines.push("# Task");
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
  // Agent-facing transparency notes (beta audit Fix 7): the model must know
  // when the delivered context is incomplete so it can compensate with
  // targeted searches instead of assuming the context is exhaustive.
  const contextIncomplete =
    pkg.budget.budgetExceeded ||
    pkg.budget.droppedByTokens.length > 0 ||
    pkg.budget.itemsTruncated.length > 0 ||
    pkg.budget.itemsDroppedByCount.length > 0;
  if (contextIncomplete) {
    lines.push(
      "⚠️ NOTE: Context was truncated to stay within token budget. " +
        "The available context may be incomplete. " +
        "Call search/read tools for additional details beyond what's shown below.",
    );
    lines.push("");
  }
  if (pkg.staleness.state !== "fresh") {
    lines.push(
      `⚠️ NOTE: Context index may be out of date (${pkg.staleness.state}). Verify with search if results seem inconsistent.`,
    );
    lines.push("");
  }
  if (pkg.exclusions.droppedPaths.length > 0) {
    lines.push(
      `🔒 ${pkg.exclusions.droppedPaths.length} file(s) excluded by security policy (secrets/sensitive data filtered).`,
    );
    lines.push("");
  }
  // Deterministic engine analysis (ADR-017): in digest mode the package leads
  // with the computed conclusion so a weak model can verify and present rather
  // than re-derive the whole structure from the excerpts below. This converts
  // a reasoning task into a verification task; the evidence chain names the
  // files/symbols to check.
  if (pkg.synthesis !== undefined) {
    lines.push("# Engine analysis");
    lines.push("The engine has analyzed the code structure and concluded:");
    lines.push(pkg.synthesis.conclusion);
    lines.push("");
    if (pkg.synthesis.evidence.length > 0) {
      lines.push("Evidence chain:");
      for (const step of pkg.synthesis.evidence) {
        lines.push(`- ${step}`);
      }
      lines.push("");
    }
    if (pkg.synthesis.centralFiles.length > 0) {
      lines.push(`Central files: ${pkg.synthesis.centralFiles.join(", ")}`);
      lines.push("");
    }
    lines.push(
      "> Verify this conclusion against the excerpts below before answering. " +
        "If they contradict the conclusion, trust the excerpts.",
    );
    lines.push("");
  }
  for (const item of pkg.items) {
    lines.push(`## ${item.title}`);
    lines.push(item.content);
    lines.push("");
    // Compact deterministic annotation: tier + line ranges + reason on one
    // line keeps the metadata the model needs without bloating each item's
    // render (P1.5, tier-first / range annotations).
    const meta: string[] = [item.reason];
    if (item.tier !== undefined) {
      meta.push(`tier: ${item.tier}`);
    }
    if (item.ranges !== undefined && item.ranges.length > 0) {
      meta.push(
        `lines: ${item.ranges.map((range) => `${range.startLine}-${range.endLine}`).join(", ")}`,
      );
    }
    lines.push(`> ${meta.join(" · ")}`);
    if (item.truncated) {
      lines.push(`> truncated to ${item.tokens} tokens (per-item cap)`);
    }
    lines.push("");
  }
  lines.push("# Budget");
  lines.push(
    `${pkg.budget.itemsIncluded}/${pkg.budget.itemsRequested} items, ` +
      `${pkg.budget.tokensEstimated} estimated tokens (cap ${pkg.budget.budget.maxTokensTotal}).`,
  );
  if (pkg.budget.budgetExceeded) {
    lines.push("Warning: essential context alone exceeds the total token budget.");
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
    const tier = item.tier ?? "unranked";
    lines.push(`- [${item.kind}/${item.source}/${tier}] ${item.title} — score ${item.score}`);
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

/** Render a briefing: the deterministic package plus its AI section. */
export function renderContextBriefing(briefing: ContextBriefing): string {
  return `${renderContextPackage(briefing.package)}\n\n${renderBriefingSection(briefing)}`;
}

/** Render just the AI briefing section (without the deterministic package). */
export function renderBriefingSection(briefing: ContextBriefing): string {
  const meta = briefing.metadata;
  const lines = [
    `# AI context briefing (${meta.provider}/${meta.model}${meta.cacheHit ? ", cached" : ""})`,
    briefing.content.overview,
  ];
  for (const point of briefing.content.keyPoints) {
    lines.push(`- ${point}`);
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
    ...(item.tier === undefined ? {} : { tier: item.tier }),
  };
}
