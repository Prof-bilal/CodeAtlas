import type {
  CriticCheckInput,
  CriticCheckItem,
  CriticCheckResult,
  CriticConfig,
  CriticIssue,
  CriticPort,
  CriticReview,
  CriticVerdict,
  ProviderPort,
} from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";

export type { CriticConfig, CriticReview } from "@atlas/core";

/** Default critic configuration. */
export const DEFAULT_CRITIC_CONFIG: CriticConfig = {
  model: "same",
  maxRevisions: 1,
};

/**
 * AI critic prompt template.
 *
 * The {checklist} and {answer} placeholders are replaced at runtime.
 */
const CRITIC_PROMPT_TEMPLATE = `You are a code review critic. Given an answer and a checklist of
deterministic checks, produce a structured review.

Checklist results:
{checklist}

Answer to review:
{answer}

Review the answer for:
1. Factual accuracy (do cited paths/symbols exist?)
2. Completeness (are all plan steps addressed?)
3. Logical consistency (do the claims match the evidence?)
4. Quality (is the answer clear, actionable, and correct?)

Return a JSON object with exactly these keys:
- "issues": array of objects with "severity" (error|warning|info), "category" (string), "description" (string), optional "filePath" (string)
- "assessment": string — overall quality assessment
- "revisionRecommended": boolean — whether the answer needs revision
- "schemas": array of strings — specific revision suggestions`;

/**
 * Run the deterministic critic checklist (no AI, no IO).
 *
 * Checks:
 * 1. Cited paths exist in the plan impact set or are valid references
 * 2. Plan steps are addressed by the answer
 * 3. Output contract assertions are satisfied
 * 4. Verification claims match (failed claims = checklist failure)
 */
export function runChecklist(input: CriticCheckInput): CriticCheckResult {
  const items: CriticCheckItem[] = [];

  // Check 1: Cited paths — at least some should be in the plan targets
  if (input.citedPaths.length > 0 && input.planTargets.length > 0) {
    const overlap = input.citedPaths.filter((p) =>
      input.planTargets.some((t) => p === t || p.endsWith(`/${t}`) || t.endsWith(`/${p}`)),
    );
    const passed = overlap.length > 0 || input.planTargets.length === 0;
    items.push({
      id: "path-plan-overlap",
      name: "Cited paths overlap with plan targets",
      category: "path-exists",
      passed,
      detail: passed
        ? `${overlap.length} cited path(s) match plan targets`
        : `No cited paths (${input.citedPaths.join(", ")}) match plan targets (${input.planTargets.join(", ")})`,
    });
  }

  // Check 2: Plan coverage — each plan target should be mentioned in the answer
  const answerLower = input.answer.toLowerCase();
  const missingTargets: string[] = [];
  for (const target of input.planTargets) {
    const targetBase = target.split("/").pop() ?? target;
    if (
      !answerLower.includes(target.toLowerCase()) &&
      !answerLower.includes(targetBase.toLowerCase())
    ) {
      missingTargets.push(target);
    }
  }
  items.push({
    id: "plan-coverage",
    name: "Plan targets addressed",
    category: "plan-coverage",
    passed: missingTargets.length === 0,
    detail:
      missingTargets.length === 0
        ? `All ${input.planTargets.length} plan target(s) addressed`
        : `Missing ${missingTargets.length} plan target(s): ${missingTargets.join(", ")}`,
  });

  // Check 3: Output contract
  if (input.outputContract !== undefined && input.outputContract.length > 0) {
    const contractFailures: string[] = [];
    for (const assertion of input.outputContract) {
      const valueLower = assertion.value.toLowerCase();
      if (assertion.kind === "contains" && !answerLower.includes(valueLower)) {
        contractFailures.push(`missing "${assertion.value}"`);
      } else if (assertion.kind === "not-contains" && answerLower.includes(valueLower)) {
        contractFailures.push(`should not contain "${assertion.value}"`);
      }
    }
    items.push({
      id: "output-contract",
      name: "Output contract satisfied",
      category: "contract-satisfied",
      passed: contractFailures.length === 0,
      detail:
        contractFailures.length === 0
          ? "All contract assertions satisfied"
          : `Contract failures: ${contractFailures.join("; ")}`,
    });
  }

  // Check 4: Verification claim alignment
  if (input.claimResults.failed > 0) {
    const failedChecks = input.claimResults.checks.filter((c) => !c.passed);
    items.push({
      id: "verification-claims",
      name: "Verification claims passed",
      category: "verification-match",
      passed: false,
      detail: `${input.claimResults.failed} verification claim(s) failed: ${failedChecks.map((c) => c.detail).join("; ")}`,
    });
  } else if (input.claimResults.checks.length > 0) {
    items.push({
      id: "verification-claims",
      name: "Verification claims passed",
      category: "verification-match",
      passed: true,
      detail: `All ${input.claimResults.passed} verification claim(s) passed`,
    });
  }

  // Check 5: Completeness — answer has substance
  const answerLength = input.answer.trim().length;
  items.push({
    id: "answer-completeness",
    name: "Answer has substance",
    category: "completeness",
    passed: answerLength > 50,
    detail:
      answerLength > 50
        ? `Answer is ${answerLength} characters long`
        : `Answer is too short (${answerLength} characters) — may be incomplete`,
  });

  const passed = items.filter((i) => i.passed).length;
  const failed = items.filter((i) => !i.passed).length;
  const verdict: CriticVerdict =
    failed === 0 ? "pass" : failed >= items.length ? "fail" : "partial";

  return {
    items,
    passed,
    failed,
    allPassed: failed === 0,
    verdict,
  };
}

/**
 * Run the AI critic review (requires provider).
 *
 * Calls the model with the answer + checklist results and produces
 * a structured review with issues and revision suggestions.
 */
async function runAiReview(
  provider: ProviderPort,
  answer: string,
  checklistResult: CriticCheckResult,
  contextSummary: string,
  model?: string,
): Promise<Result<CriticReview>> {
  const checklistText = checklistResult.items
    .map((item) => `[${item.passed ? "PASS" : "FAIL"}] ${item.name}: ${item.detail}`)
    .join("\n");

  const prompt = CRITIC_PROMPT_TEMPLATE.replace("{checklist}", checklistText).replace(
    "{answer}",
    answer.slice(0, 8000),
  );

  const response = await provider.complete({
    prompt,
    system: `You are a meticulous code review critic. Be specific and cite file paths. Context summary: ${contextSummary.slice(0, 2000)}`,
    json: true,
    ...(model !== undefined ? { model } : {}),
  });

  if (!response.ok) {
    return fail(response.error);
  }

  const parsed = parseCriticReview(response.value.content);
  return parsed;
}

/**
 * Parse the AI critic's JSON response into a CriticReview.
 */
function parseCriticReview(content: string): Result<CriticReview> {
  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    const issues: CriticIssue[] = [];
    if (Array.isArray(raw["issues"])) {
      for (const item of raw["issues"]) {
        if (typeof item === "object" && item !== null) {
          const obj = item as Record<string, unknown>;
          issues.push({
            severity:
              (obj["severity"] as string) === "error"
                ? "error"
                : (obj["severity"] as string) === "warning"
                  ? "warning"
                  : "info",
            category: String(obj["category"] ?? "general"),
            description: String(obj["description"] ?? ""),
            ...(typeof obj["filePath"] === "string" ? { filePath: obj["filePath"] } : {}),
          });
        }
      }
    }
    return ok({
      issues,
      assessment: String(raw["assessment"] ?? "No assessment provided"),
      revisionRecommended: Boolean(raw["revisionRecommended"]),
      suggestions: Array.isArray(raw["schemas"])
        ? raw["schemas"].map(String)
        : Array.isArray(raw["suggestions"])
          ? raw["suggestions"].map(String)
          : [],
    });
  } catch {
    return fail(new Error(`Failed to parse critic review: ${content.slice(0, 200)}`));
  }
}

/**
 * Create the CriticPort with deterministic checklist + optional AI review.
 *
 * @param provider - Provider for AI review (undefined = deterministic only)
 * @param config - Critic configuration
 */
export function createCritic(
  provider?: ProviderPort,
  config: CriticConfig = DEFAULT_CRITIC_CONFIG,
): CriticPort {
  return {
    check(input: CriticCheckInput): CriticCheckResult {
      return runChecklist(input);
    },

    async review(
      answer: string,
      checklistResult: CriticCheckResult,
      contextSummary: string,
    ): Promise<Result<CriticReview>> {
      if (config.model === "none" || provider === undefined) {
        // Deterministic-only mode: produce a review from checklist results
        const issues: CriticIssue[] = [];
        for (const item of checklistResult.items) {
          if (!item.passed) {
            issues.push({
              severity: "error",
              category: item.category,
              description: item.detail,
            });
          }
        }
        return ok({
          issues,
          assessment:
            checklistResult.verdict === "pass"
              ? "All deterministic checks passed"
              : `${checklistResult.failed} check(s) failed`,
          revisionRecommended: !checklistResult.allPassed,
          suggestions: [],
        });
      }

      return runAiReview(provider, answer, checklistResult, contextSummary);
    },
  };
}
