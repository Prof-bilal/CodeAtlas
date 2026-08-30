/**
 * Plan-authority guard (Phase 2, P2.5 — small-model intelligence execution
 * plan; ADR-015).
 *
 * Ensures model annotations on a `ContextPlan` are strictly additive: a model
 * may append notes to existing plan steps but never delete, reorder, or
 * contradict a deterministic step. When a conflict is detected, the guard
 * escalates to re-retrieval rather than silently overriding.
 *
 * Pure and deterministic: no AI, no IO.
 */

import type { ContextPlan, PlanStep } from "@atlas/core";

/** A model-proposed annotation on a plan step. */
export interface ModelAnnotation {
  /** The 1-based step order this annotation targets. */
  readonly stepOrder: number;
  /** The note the model wants to append. */
  readonly note: string;
}

/** The result of applying model annotations to a plan. */
export interface PlanAnnotationResult {
  /** The plan after annotations are applied (additive-only). */
  readonly plan: ContextPlan;
  /** True when all annotations were applied cleanly. */
  readonly allApplied: boolean;
  /** Annotations that were rejected (conflicts with deterministic steps). */
  readonly rejected: readonly ModelAnnotation[];
  /** Human-readable explanation of any rejections. */
  readonly rejectionReasons: readonly string[];
}

/** Words that signal a model is trying to contradict a deterministic step. */
const CONTRADICTION_SIGNALS = [
  /\b(skip|remove|delete|drop|omit)\b.*\b(step|action|step \d)\b/i,
  /\b(step \d|step)\b.*\b(is wrong|is incorrect|should be|must be changed)\b/i,
  /\b(don't|do not|never)\b.*\b(need|require|include|perform)\b.*\b(step|action)\b/i,
  /\b(replace|swap|substitute)\b.*\b(step|action)\b/i,
  /\b(reorder|rearrange|move)\b.*\b(step|action)\b/i,
];

/** Negation words that signal the model wants to skip/avoid something. */
const NEGATION_WORDS = /\b(skip|drop|omit|remove|delete|don'?t|do\s+not|never|avoid)\b/i;

/**
 * Check if a model note attempts to contradict a deterministic step.
 */
function isContradictory(note: string, step: PlanStep): boolean {
  // Direct step references (e.g. "step 1", "step 2").
  const stepRef = new RegExp(`\\bstep\\s*${step.order}\\b`, "i");
  const mentionsStep = stepRef.test(note);

  // Generic contradiction signals.
  const hasContradiction = CONTRADICTION_SIGNALS.some((re) => re.test(note));

  // If the note explicitly mentions this step AND contains contradiction
  // signals, reject.
  if (mentionsStep && hasContradiction) {
    return true;
  }

  // Direct action-text contradiction: the note contains a negation word AND
  // references the step's action text (by matching significant words from
  // the action). This catches "Skip identifying the failing behavior"
  // against step "Identify the failing behavior" without requiring "step 1".
  if (NEGATION_WORDS.test(note)) {
    const actionWords = step.action
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4);
    const matchingWords = actionWords.filter((word) => note.toLowerCase().includes(word));
    // If the note negates AND matches 2+ words from the action, it's contradictory.
    if (matchingWords.length >= 2) {
      return true;
    }
  }

  return false;
}

/**
 * Apply model annotations to a plan, enforcing additive-only semantics.
 *
 * Annotations that attempt to delete, reorder, or contradict deterministic
 * steps are rejected with an explanation. Accepted annotations are appended
 * to the step's rationale.
 *
 * @param plan - The deterministic plan to annotate.
 * @param annotations - The model's proposed annotations.
 * @returns A result with the (possibly modified) plan and rejection details.
 */
export function applyPlanAnnotations(
  plan: ContextPlan,
  annotations: readonly ModelAnnotation[],
): PlanAnnotationResult {
  if (annotations.length === 0) {
    return { plan, allApplied: true, rejected: [], rejectionReasons: [] };
  }

  const steps = [...plan.steps];
  const rejected: ModelAnnotation[] = [];
  const rejectionReasons: string[] = [];

  for (const annotation of annotations) {
    const step = steps.find((s) => s.order === annotation.stepOrder);
    if (step === undefined) {
      rejected.push(annotation);
      rejectionReasons.push(`Step ${annotation.stepOrder} does not exist in the plan.`);
      continue;
    }

    if (isContradictory(annotation.note, step)) {
      rejected.push(annotation);
      rejectionReasons.push(
        `Annotation on step ${step.order} contradicts the deterministic step: "${annotation.note.slice(0, 100)}"`,
      );
      continue;
    }

    // Additive-only: append the note to the step's rationale.
    steps[steps.indexOf(step)] = {
      ...step,
      rationale: `${step.rationale} [Model note: ${annotation.note}]`,
    };
  }

  return {
    plan: { ...plan, steps },
    allApplied: rejected.length === 0,
    rejected,
    rejectionReasons,
  };
}
