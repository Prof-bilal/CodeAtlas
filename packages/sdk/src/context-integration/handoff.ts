/**
 * Provider-independent handoff rendering (ADR-025).
 *
 * Appends a bounded "Handoff" section to a Context Package prompt so a new
 * agent can continue a task another model started. No provider-specific
 * formatting lives here.
 */

import { estimateTokens } from "@prof-bilal/atlas-shared";
import { denyFilter } from "./deny";
import type { ContextPackage } from "./models";
import { renderContextPackage } from "./render";
import type { TaskLedger, TaskProgress, TaskSessionRecord } from "./task-ledger";

/** Token budget reserved for the handoff section (does not replace the package budget). */
export const DEFAULT_HANDOFF_MAX_TOKENS = 2000;

export interface HandoffRenderOptions {
  readonly maxTokens?: number;
}

/** Sanitize progress: drop secret-bearing paths and content before sending. */
export function sanitizeTaskProgress(progress: TaskProgress): TaskProgress {
  const filesTouched = progress.filesTouched.filter((path) => denyFilter(path, "").accepted);
  const content = denyFilter("handoff-output.txt", progress.lastOutput);
  return {
    ...progress,
    lastOutput: content.accepted ? progress.lastOutput : "",
    transcriptAvailable: content.accepted && progress.transcriptAvailable,
    filesTouched,
  };
}

/** Render the Handoff markdown section (no repository package). */
export function renderHandoffSection(
  ledger: TaskLedger,
  options: HandoffRenderOptions = {},
): string {
  const maxTokens = options.maxTokens ?? DEFAULT_HANDOFF_MAX_TOKENS;
  const progress = sanitizeTaskProgress(ledger.progress);
  const lines: string[] = [];
  lines.push("# Handoff");
  lines.push(
    "Continue the same task. Do not re-scan the whole repository; CodeAtlas already indexed it.",
  );
  lines.push("");
  lines.push(`Original task: ${ledger.task}`);
  lines.push(`Task id: ${ledger.id}`);
  const providers = uniqueProviders(ledger.sessions);
  if (providers.length > 0) {
    lines.push(`Prior providers: ${providers.join(" → ")}`);
  }
  lines.push("");
  if (progress.filesTouchedUnknown) {
    lines.push("Files touched since the previous session: unknown (no start snapshot).");
  } else if (progress.filesTouched.length === 0) {
    lines.push("Files touched since the previous session: none detected.");
  } else {
    lines.push("Files touched since the previous session:");
    for (const path of progress.filesTouched) {
      lines.push(`- ${path}`);
    }
    if (progress.filesTouchedTruncated) {
      lines.push("(file list truncated)");
    }
  }
  lines.push("");
  if (progress.transcriptAvailable && progress.lastOutput.trim() !== "") {
    lines.push("Prior model output (captured, possibly truncated):");
    lines.push("");
    lines.push("```");
    lines.push(progress.lastOutput.trimEnd());
    if (progress.lastOutputTruncated) {
      lines.push("… [truncated]");
    }
    lines.push("```");
  } else {
    lines.push(
      "Prior model transcript is not available (interactive CLI sessions cannot be captured).",
    );
    lines.push("Use the original task and the files-touched list; do not invent prior replies.");
  }
  return truncateToTokens(lines.join("\n"), maxTokens);
}

/** Package prompt plus the handoff section. */
export function renderHandoffPrompt(
  pkg: ContextPackage,
  ledger: TaskLedger,
  options: HandoffRenderOptions = {},
): string {
  return `${renderContextPackage(pkg)}\n\n${renderHandoffSection(ledger, options)}`;
}

function uniqueProviders(sessions: readonly TaskSessionRecord[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const session of sessions) {
    if (!seen.has(session.provider)) {
      seen.add(session.provider);
      out.push(session.provider);
    }
  }
  return out;
}

function truncateToTokens(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) {
    return text;
  }
  // ~4 chars/token (same heuristic as the rest of the SDK).
  const maxChars = Math.max(32, maxTokens * 4);
  return `${text.slice(0, maxChars)}\n… [handoff truncated to ${maxTokens} tokens]`;
}
