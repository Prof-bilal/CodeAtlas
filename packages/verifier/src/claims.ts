import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { ClaimCheck, ClaimCheckInput, ClaimCheckResult } from "@atlas/core";

let claimCounter = 0;
function nextId(): string {
  return `claim-${++claimCounter}`;
}

export function resetClaimCounter(): void {
  claimCounter = 0;
}

function checkPathExists(filePath: string, cwd: string): ClaimCheck {
  const resolved = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
  const passed = existsSync(resolved);
  return {
    id: nextId(),
    kind: "path-exists",
    target: filePath,
    passed,
    detail: passed ? `File exists at ${resolved}` : `File not found at ${resolved}`,
  };
}

function checkSymbolExists(symbolName: string, symbols: readonly string[]): ClaimCheck {
  const normalizedTarget = symbolName.trim();
  const passed = symbols.some((s) => s === normalizedTarget);
  return {
    id: nextId(),
    kind: "symbol-exists",
    target: normalizedTarget,
    passed,
    detail: passed
      ? `Symbol "${normalizedTarget}" found in index`
      : `Symbol "${normalizedTarget}" not found in index`,
  };
}

function checkPlanCoverage(planTarget: string, answer: string): ClaimCheck {
  const normalizedTarget = planTarget.trim().toLowerCase();
  const normalizedAnswer = answer.toLowerCase();
  const passed = normalizedAnswer.includes(normalizedTarget);
  return {
    id: nextId(),
    kind: "plan-coverage",
    target: planTarget,
    passed,
    detail: passed
      ? `Plan target "${planTarget}" is addressed in the answer`
      : `Plan target "${planTarget}" not addressed in the answer`,
  };
}

function checkOutputContract(
  assertion: { kind: string; value: string },
  answer: string,
): ClaimCheck {
  let passed = false;
  let detail = "";

  switch (assertion.kind) {
    case "contains-text":
      passed = answer.includes(assertion.value);
      detail = passed
        ? `Answer contains "${assertion.value}"`
        : `Answer does not contain "${assertion.value}"`;
      break;
    case "no-errors":
      passed = !answer.toLowerCase().includes("error");
      detail = passed ? "No error mentions found in answer" : "Answer mentions errors";
      break;
    case "contains-function": {
      const pattern = new RegExp(
        `(?:function\\s+${escapeRegex(assertion.value)}|const\\s+${escapeRegex(assertion.value)}\\s*=|export\\s+(?:default\\s+)?(?:function|const)\\s+${escapeRegex(assertion.value)})`,
      );
      passed = pattern.test(answer);
      detail = passed
        ? `Function "${assertion.value}" definition found`
        : `Function "${assertion.value}" definition not found`;
      break;
    }
    default:
      detail = `Unknown output contract kind: ${assertion.kind}`;
  }

  return {
    id: nextId(),
    kind: "output-contract",
    target: `${assertion.kind}: ${assertion.value}`,
    passed,
    detail,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface ClaimCheckerDeps {
  /** Resolve symbols from the context index for the given project. */
  readonly resolveSymbols: (cwd: string) => Promise<readonly string[]>;
  /** Read the raw answer text. */
  readonly getAnswerText: () => string;
}

export async function checkClaims(
  input: ClaimCheckInput,
  cwd: string,
  deps: ClaimCheckerDeps,
): Promise<ClaimCheckResult> {
  const answer = deps.getAnswerText();
  const symbols = await deps.resolveSymbols(cwd);

  const checks: ClaimCheck[] = [];

  for (const path of input.citedPaths) {
    checks.push(checkPathExists(path, cwd));
  }

  for (const symbol of input.citedSymbols) {
    checks.push(checkSymbolExists(symbol, symbols));
  }

  for (const target of input.planTargets) {
    checks.push(checkPlanCoverage(target, answer));
  }

  if (input.outputContract) {
    for (const assertion of input.outputContract) {
      checks.push(checkOutputContract(assertion, answer));
    }
  }

  const failed = checks.filter((c) => !c.passed).length;
  const passed = checks.length - failed;

  return {
    checks,
    passed,
    failed,
    allPassed: failed === 0,
  };
}
