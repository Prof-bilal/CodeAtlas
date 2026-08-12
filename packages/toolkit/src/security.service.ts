import type {
  SecurityAssessment,
  SecurityAssessmentInput,
  SecurityCheck,
  SecurityDecision,
  SecurityOverride,
  SecurityPort,
  ToolSecurityStatusValue,
  ToolTrustLevel,
} from "@atlas/core";
import { type Result, fail, ok } from "@atlas/shared";
import { InstallerError } from "./installer-errors";

const DANGEROUS = /[\r\n;]/;
const SAFE_NAME = /^[a-zA-Z0-9._@/+:-]+$/;

/** Pure, offline, fail-closed assessment of untrusted tool metadata. */
export class SecurityAssessor implements SecurityPort {
  public constructor(private readonly now: () => Date = () => new Date()) {}

  public async assess(input: SecurityAssessmentInput): Promise<Result<SecurityAssessment>> {
    if (!SAFE_NAME.test(input.toolName) || hasDangerousText(input.toolName)) {
      return fail(new InstallerError("Security assessment rejected an unsafe tool name"));
    }
    const checks: SecurityCheck[] = [
      check("license", input.license, "license metadata"),
      sourceCheck(input),
      commandCheck(input.installCommand),
      dependencyCheck(input.dependenciesDeclared),
      permissionCheck(input.permissions ?? []),
      check("maintainer", input.maintainer, "maintainer metadata"),
      check("release-provenance", input.releaseProvenance, "release provenance"),
      repositoryCheck(input.repository),
    ];
    const failCount = checks.filter((item) => item.verdict === "fail").length;
    const unknownCount = checks.filter((item) => item.verdict === "unknown").length;
    const warnCount = checks.filter((item) => item.verdict === "warn").length;
    const risk =
      failCount > 0 ? "critical" : unknownCount > 0 ? "high" : warnCount > 0 ? "medium" : "low";
    let status: ToolSecurityStatusValue =
      input.declaredStatus === "blocked" || input.declaredTrust === "blocked" || failCount > 0
        ? "blocked"
        : "unverified";
    let trust: ToolTrustLevel = status;
    if (status !== "blocked" && failCount === 0) {
      if (
        (input.declaredStatus === "reviewed" || input.declaredStatus === "community") &&
        input.declaredTrust === input.declaredStatus
      ) {
        status = trust = input.declaredStatus;
      } else if (input.humanReview?.passed && input.humanReview.checklist.length > 0) {
        trust = input.humanReview.verified && unknownCount === 0 ? "verified" : "reviewed";
        status = trust;
      } else if (input.communityReported) {
        trust = status = "community";
      }
    }
    const assessment: SecurityAssessment = {
      toolName: input.toolName,
      checks,
      risk,
      status,
      trust,
      note:
        status === "blocked"
          ? "A security check or declared block prevents installation."
          : "Trust is not promoted without documented review.",
      assessedAt: this.now().toISOString(),
      overrideRequired: status === "unverified",
    };
    return ok(assessment);
  }

  public async decide(
    input: SecurityAssessmentInput,
    override?: SecurityOverride,
  ): Promise<Result<SecurityDecision>> {
    const assessment = await this.assess(input);
    if (!assessment.ok) return fail(assessment.error);
    const blocked = assessment.value.status === "blocked" || assessment.value.trust === "blocked";
    const overrideApplied = override?.granted === true && override.note.trim().length > 0;
    return ok({
      allowed: !blocked && (!assessment.value.overrideRequired || overrideApplied),
      requiresOverride: assessment.value.overrideRequired,
      assessment: assessment.value,
      overrideApplied,
    });
  }
}

function check(id: string, value: string | null | undefined, label: string): SecurityCheck {
  return value === undefined ||
    value === null ||
    value.trim() === "" ||
    value.toLowerCase() === "unknown"
    ? { id, verdict: "unknown", detail: `${label} is unavailable` }
    : hasDangerousText(value)
      ? { id, verdict: "fail", detail: `${label} contains control characters or shell syntax` }
      : { id, verdict: "pass", detail: `${label} supplied` };
}
function sourceCheck(input: SecurityAssessmentInput): SecurityCheck {
  return input.packageSource === "unknown"
    ? { id: "source", verdict: "unknown", detail: "package source is not an official channel" }
    : { id: "source", verdict: "pass", detail: `${input.packageSource} source` };
}
function commandCheck(command: SecurityAssessmentInput["installCommand"]): SecurityCheck {
  return command === null || command === undefined
    ? { id: "install-command", verdict: "unknown", detail: "install command is unavailable" }
    : !SAFE_NAME.test(command.binary) || command.args.some((arg) => hasDangerousText(arg))
      ? { id: "install-command", verdict: "fail", detail: "unsafe executable or argument" }
      : { id: "install-command", verdict: "pass", detail: "argument-array command" };
}
function dependencyCheck(declared: boolean | undefined): SecurityCheck {
  return declared === true
    ? {
        id: "dependencies",
        verdict: "warn",
        detail: "transitive supply chain remains an assessed risk",
      }
    : { id: "dependencies", verdict: "unknown", detail: "dependency graph is unavailable" };
}
function permissionCheck(permissions: readonly string[]): SecurityCheck {
  return permissions.includes("secrets")
    ? { id: "permissions", verdict: "fail", detail: "secret access is not permitted" }
    : permissions.includes("unknown")
      ? { id: "permissions", verdict: "unknown", detail: "required permissions are incomplete" }
      : permissions.length > 0
        ? {
            id: "permissions",
            verdict: "warn",
            detail: `declared permissions: ${permissions.join(", ")}`,
          }
        : { id: "permissions", verdict: "pass", detail: "no elevated permissions declared" };
}
function repositoryCheck(repository: string | null | undefined): SecurityCheck {
  return repository === undefined || repository === null
    ? { id: "repository", verdict: "unknown", detail: "repository metadata is unavailable" }
    : /^https:\/\//.test(repository)
      ? { id: "repository", verdict: "pass", detail: "HTTPS repository metadata" }
      : { id: "repository", verdict: "fail", detail: "repository must use HTTPS" };
}

function hasDangerousText(value: string): boolean {
  return value.includes("\0") || DANGEROUS.test(value);
}
