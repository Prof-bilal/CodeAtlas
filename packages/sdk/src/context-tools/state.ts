import type { PlanStep, VerificationStrategy } from "@atlas/core";

/**
 * Bounded agent state tracked across tool-loop rounds (Phase 5, P5.1).
 *
 * State is deterministic-owned — the system updates it from tool results and
 * verification outputs; the model may propose updates via structured output.
 * State is rendered compactly into each round's prompt.
 */
export interface AgentState {
  /** The raw user task text. */
  readonly task: string;
  /** Task category from the classifier (optional). */
  readonly category?: string;
  /** Classification confidence (0–1). */
  readonly confidence?: number;
  /** Entities extracted from the task. */
  readonly entities: readonly string[];
  /** Plan steps (optional, populated by planner). */
  readonly planSteps: readonly PlanStep[];
  /** Files the plan expects to touch (impact set). */
  readonly planFiles: readonly string[];
  /** Things the plan cannot resolve deterministically. */
  readonly unknowns: readonly string[];
  /** Recommended verification strategy. */
  readonly verificationStrategy: VerificationStrategy;
  /** Accumulated deterministic facts gathered from tool results. */
  readonly knownFacts: readonly string[];
  /** Files inspected so far (union of tool-read file paths). */
  readonly filesInspected: readonly string[];
  /** Tool calls executed (name + query key, for dedup and reporting). */
  readonly toolsUsed: readonly ToolUsage[];
  /** File changes proposed by the model. */
  readonly changes: readonly FileChange[];
  /** Verification runs (claim checks, command runners). */
  readonly verificationRuns: readonly VerificationRun[];
  /** Risks identified during the loop. */
  readonly risks: readonly string[];
  /** Current round number (0-indexed). */
  readonly round: number;
  /** Stop reason (set when the loop terminates). */
  readonly stopReason?: StopReason;
}

/** A single tool usage record. */
export interface ToolUsage {
  /** Canonical tool name (without MCP prefix). */
  readonly name: string;
  /** Query key (search term, node, path — for dedup tracking). */
  readonly queryKey: string;
  /** Round when executed. */
  readonly round: number;
  /** Whether the result was cached (near-duplicate). */
  readonly cached: boolean;
  /** Character length of the tool output. */
  readonly outputChars?: number;
}

/** A file change proposed by the model. */
export interface FileChange {
  /** Absolute file path. */
  readonly path: string;
  /** Nature of the change. */
  readonly kind: "add" | "modify" | "delete";
}

/** A verification run record. */
export interface VerificationRun {
  /** The verification strategy used. */
  readonly strategy: VerificationStrategy;
  /** How many claim checks passed. */
  readonly claimsPassed: number;
  /** How many claim checks failed. */
  readonly claimsFailed: number;
  /** Command runner results (empty for claim-checks strategy). */
  readonly commandsRun: readonly string[];
  /** Overall verdict. */
  readonly verdict: "pass" | "fail" | "partial" | "skipped" | "error";
}

/** Why the tool loop terminated. */
export type StopReason =
  | "final-answer"
  | "max-rounds"
  | "budget-exhausted"
  | "low-growth"
  | "verification-failed"
  | "error";

/** Maximum known facts before compaction drops oldest entries. */
const MAX_KNOWN_FACTS = 50;

/** Maximum files inspected before compaction drops oldest entries. */
const MAX_FILES_INSPECTED = 100;

/** Maximum tool usage records before compaction drops oldest entries. */
const MAX_TOOLS_USED = 60;

/** Maximum risks before compaction drops oldest entries. */
const MAX_RISKS = 20;

/** Maximum characters for the rendered state summary in the prompt. */
export const MAX_STATE_SUMMARY_CHARS = 2_000;

/**
 * Create a fresh AgentState for a new task.
 */
export function createAgentState(task: string): AgentState {
  return {
    task,
    entities: [],
    planSteps: [],
    planFiles: [],
    unknowns: [],
    verificationStrategy: "none",
    knownFacts: [],
    filesInspected: [],
    toolsUsed: [],
    changes: [],
    verificationRuns: [],
    risks: [],
    round: 0,
  };
}

/**
 * Create a new state with the round counter incremented.
 */
export function nextRound(state: AgentState): AgentState {
  return { ...state, round: state.round + 1 };
}

/**
 * Record a tool usage in the state.
 */
export function recordToolUsage(state: AgentState, usage: ToolUsage): AgentState {
  const toolsUsed = [...state.toolsUsed, usage];
  return compactState({ ...state, toolsUsed });
}

/**
 * Record known facts extracted from a tool result.
 *
 * Facts are merged (deduplicated by exact string match) and bounded.
 */
export function addKnownFacts(state: AgentState, facts: readonly string[]): AgentState {
  const merged = [...new Set([...state.knownFacts, ...facts])];
  const knownFacts = merged.slice(-MAX_KNOWN_FACTS);
  return { ...state, knownFacts };
}

/**
 * Record a file as inspected.
 */
export function recordFileInspected(state: AgentState, filePath: string): AgentState {
  if (state.filesInspected.includes(filePath)) return state;
  const filesInspected = [...state.filesInspected, filePath];
  return compactState({ ...state, filesInspected });
}

/**
 * Record a verification run.
 */
export function recordVerificationRun(state: AgentState, run: VerificationRun): AgentState {
  return {
    ...state,
    verificationRuns: [...state.verificationRuns, run],
  };
}

/**
 * Record a risk identified during the loop.
 */
export function addRisk(state: AgentState, risk: string): AgentState {
  const risks = [...state.risks, risk];
  return compactState({ ...state, risks });
}

/**
 * Set the stop reason on the state.
 */
export function setStopReason(state: AgentState, reason: StopReason): AgentState {
  return { ...state, stopReason: reason };
}

/**
 * Update plan-related fields (from planner output).
 */
export function setPlan(
  state: AgentState,
  plan: {
    steps: readonly PlanStep[];
    impactSet: readonly string[];
    unknowns: readonly string[];
    verificationStrategy: VerificationStrategy;
  },
): AgentState {
  return {
    ...state,
    planSteps: plan.steps,
    planFiles: plan.impactSet,
    unknowns: plan.unknowns,
    verificationStrategy: plan.verificationStrategy,
  };
}

/**
 * Update task classification fields.
 */
export function setClassification(
  state: AgentState,
  classification: {
    category: string;
    confidence: number;
    entities: readonly string[];
  },
): AgentState {
  return {
    ...state,
    category: classification.category,
    confidence: classification.confidence,
    entities: classification.entities,
  };
}

/**
 * Compact state arrays that exceed their bounds (drop oldest entries).
 */
function compactState(state: AgentState): AgentState {
  let changed = false;
  let { knownFacts, filesInspected, toolsUsed, risks } = state;

  if (knownFacts.length > MAX_KNOWN_FACTS) {
    knownFacts = knownFacts.slice(-MAX_KNOWN_FACTS);
    changed = true;
  }
  if (filesInspected.length > MAX_FILES_INSPECTED) {
    filesInspected = filesInspected.slice(-MAX_FILES_INSPECTED);
    changed = true;
  }
  if (toolsUsed.length > MAX_TOOLS_USED) {
    toolsUsed = toolsUsed.slice(-MAX_TOOLS_USED);
    changed = true;
  }
  if (risks.length > MAX_RISKS) {
    risks = risks.slice(-MAX_RISKS);
    changed = true;
  }

  return changed ? { ...state, knownFacts, filesInspected, toolsUsed, risks } : state;
}

/**
 * Render a compact state summary for injection into the round prompt.
 *
 * The summary is bounded to {@link MAX_STATE_SUMMARY_CHARS} characters.
 * Older entries are truncated first (the most recent facts/files/tools
 * are the most relevant).
 */
export function renderStateSummary(state: AgentState): string {
  const lines: string[] = [];

  lines.push(`[AgentState round=${state.round}]`);

  if (state.category !== undefined) {
    lines.push(
      `Task: ${state.task.slice(0, 120)} (${state.category}, conf=${state.confidence ?? "?"})`,
    );
  } else {
    lines.push(`Task: ${state.task.slice(0, 120)}`);
  }

  if (state.planSteps.length > 0) {
    lines.push(
      `Plan: ${state.planSteps.length} steps (${state.verificationStrategy} verification)`,
    );
    for (const step of state.planSteps) {
      lines.push(`  ${step.order}. ${step.action}`);
    }
  }

  if (state.unknowns.length > 0) {
    lines.push(`Unknowns: ${state.unknowns.join(", ")}`);
  }

  if (state.knownFacts.length > 0) {
    const recentFacts = state.knownFacts.slice(-8);
    lines.push(`Known facts (${state.knownFacts.length} total):`);
    for (const fact of recentFacts) {
      lines.push(`  - ${fact.slice(0, 120)}`);
    }
  }

  if (state.filesInspected.length > 0) {
    const recentFiles = state.filesInspected.slice(-6);
    lines.push(`Files inspected (${state.filesInspected.length}): ${recentFiles.join(", ")}`);
  }

  if (state.toolsUsed.length > 0) {
    const recentTools = state.toolsUsed.slice(-5);
    lines.push(
      `Tools used (${state.toolsUsed.length}): ${recentTools.map((t) => t.name).join(", ")}`,
    );
  }

  if (state.risks.length > 0) {
    lines.push(`Risks: ${state.risks.slice(-3).join("; ")}`);
  }

  if (state.stopReason !== undefined) {
    lines.push(`Stop: ${state.stopReason}`);
  }

  const summary = lines.join("\n");
  if (summary.length > MAX_STATE_SUMMARY_CHARS) {
    return `${summary.slice(0, MAX_STATE_SUMMARY_CHARS)}\n… [state truncated]`;
  }
  return summary;
}
