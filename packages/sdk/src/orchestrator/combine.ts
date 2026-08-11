import type { RoleResult, RoleStatus } from "@atlas/core";

/** One attributed section of a combined report (one role). */
export interface CombinedSection {
  readonly roleId: string;
  readonly roleName: string;
  readonly provider: string;
  readonly status: RoleStatus;
  /** The role's output (its captured stdout, or its safe error). */
  readonly output: string;
}

/** An obvious disagreement between two or more roles about one topic. */
export interface RoleConflict {
  /** The topic the roles disagree about (a code identifier or quoted term). */
  readonly topic: string;
  /** The role ids involved in the disagreement. */
  readonly roleIds: readonly string[];
  /** One opposing statement per side, surfaced verbatim for the user. */
  readonly statements: readonly string[];
  /** Human-readable summary of the disagreement. */
  readonly description: string;
}

/** The combined, attributed result of a run, with surfaced conflicts. */
export interface CombinedReport {
  readonly sections: readonly CombinedSection[];
  readonly conflicts: readonly RoleConflict[];
}

/** Marker words that make a claim read as *negative* (finding present). */
const NEGATIVE_MARKERS = [
  "vulnerab",
  "issue",
  "problem",
  "bug",
  "fail",
  "error",
  "risk",
  "incorrect",
  "broken",
  "unsafe",
  "wrong",
  "flaw",
  "defect",
  "crash",
  "expos",
];

/** Marker words that make a claim read as *positive* (finding absent/resolved). */
const POSITIVE_MARKERS = [
  "secure",
  "correct",
  "works",
  "pass",
  "good",
  "clean",
  "safe",
  "proper",
  "resolved",
  "fixed",
  "handled",
  "mitigated",
];

/**
 * Collect each role's output into attributed sections and detect obvious
 * conflicts between roles. Combination is deterministic and honest: sections
 * keep the role attribution, conflicts are surfaced rather than merged away.
 */
export function combineResults(results: readonly RoleResult[]): CombinedReport {
  return {
    sections: results.map(sectionOf),
    conflicts: detectConflicts(results),
  };
}

/**
 * Detect *obvious* conflicts: the same topic (a code identifier or quoted
 * term) appears in at least two completed roles with opposing verdicts (one
 * claim negative, another positive). Best-effort and deterministic — it is a
 * heuristic over plain text, not a semantic judge.
 */
export function detectConflicts(results: readonly RoleResult[]): readonly RoleConflict[] {
  interface Mention {
    roleId: string;
    polarity: "positive" | "negative";
    statement: string;
  }
  const mentions = new Map<string, Mention[]>();

  for (const result of results) {
    // Only finished output can be compared; failed/timed-out/cancelled roles
    // contribute nothing (their partial output is reported in their section).
    if (result.status !== "succeeded" && result.status !== "stopped") {
      continue;
    }
    for (const sentence of splitSentences(result.stdout)) {
      const polarity = polarityOf(sentence);
      if (polarity === "neutral") {
        continue;
      }
      for (const topic of topicsOf(sentence)) {
        const list = mentions.get(topic) ?? [];
        list.push({ roleId: result.role.id, polarity, statement: sentence });
        mentions.set(topic, list);
      }
    }
  }

  const conflicts: RoleConflict[] = [];
  for (const [topic, list] of mentions) {
    const positive = list.filter((m) => m.polarity === "positive");
    const negative = list.filter((m) => m.polarity === "negative");
    if (positive.length === 0 || negative.length === 0) {
      continue;
    }
    const roleIds = [...new Set([...positive, ...negative].map((m) => m.roleId))];
    conflicts.push({
      topic,
      roleIds,
      statements: [positive[0].statement, negative[0].statement],
      description: `Roles ${roleIds.join(" and ")} disagree about "${topic}".`,
    });
  }
  return conflicts;
}

/** Render the combined report to text, attributing every section. */
export function renderCombinedReport(report: CombinedReport): string {
  const lines: string[] = [];
  lines.push("# Combined report");
  lines.push("");
  report.sections.forEach((section, index) => {
    lines.push(`## ${index + 1}. ${section.roleName} (${section.provider}) — ${section.status}`);
    lines.push(section.output || "(no output)");
    lines.push("");
  });
  if (report.conflicts.length > 0) {
    lines.push("# Conflicts detected");
    lines.push("");
    for (const conflict of report.conflicts) {
      lines.push(`- ${conflict.description}`);
      for (const statement of conflict.statements) {
        lines.push(`  - "${statement}"`);
      }
    }
  } else {
    lines.push("# Conflicts detected");
    lines.push("");
    lines.push("No obvious conflicts between roles.");
  }
  return lines.join("\n");
}

/** Build one attributed section for a role result. */
function sectionOf(result: RoleResult): CombinedSection {
  const output = result.stdout.trim() !== "" ? result.stdout.trim() : (result.error ?? "");
  return {
    roleId: result.role.id,
    roleName: result.role.name,
    provider: result.role.provider,
    status: result.status,
    output,
  };
}

/** Split free text into sentences (period/question/exclamation or line breaks). */
function splitSentences(text: string): readonly string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * The verdict of one sentence: `"negative"` (a finding/defect is claimed),
 * `"positive"` (a clean pass or resolution is claimed), or `"neutral"`.
 * A negated negative marker ("no issues", "not vulnerable") reads positive.
 */
function polarityOf(sentence: string): "positive" | "negative" | "neutral" {
  const text = sentence.toLowerCase();
  const negated = /\b(?:not|no|never|hardly|no longer|isn'?t|doesn'?t|won'?t)\b/.test(text);
  const negative = NEGATIVE_MARKERS.some((marker) => text.includes(marker));
  const positive = POSITIVE_MARKERS.some((marker) => text.includes(marker));
  if (negated && negative) {
    return "positive";
  }
  if (negative && !positive) {
    return "negative";
  }
  if (positive && !negative) {
    return "positive";
  }
  return "neutral";
}

/** Extract candidate topics from a sentence: quoted terms and identifiers. */
function topicsOf(sentence: string): readonly string[] {
  const topics = new Set<string>();
  for (const match of sentence.match(/[`"']([^`"'\n]{1,60})[`"']/g) ?? []) {
    const term = match.slice(1, -1).trim();
    if (term !== "") {
      topics.add(term);
    }
  }
  for (const match of sentence.match(/\b[A-Z][A-Za-z0-9_]{1,60}\b/g) ?? []) {
    topics.add(match);
  }
  return [...topics];
}
