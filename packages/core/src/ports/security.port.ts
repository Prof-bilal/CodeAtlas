import type { Result } from "@atlas/shared";
import type { ToolSecurityStatusValue, ToolTrustLevel } from "./tool-registry.port";

export type SecurityCheckVerdict = "pass" | "warn" | "fail" | "unknown";
export type SecurityRiskLevel = "low" | "medium" | "high" | "critical";

export interface SecurityAssessmentInput {
  readonly toolName: string;
  readonly license?: string | null;
  readonly repository?: string | null;
  readonly packageSource: "official-registry" | "official-release" | "repository" | "unknown";
  readonly packageName?: string | null;
  readonly dependenciesDeclared?: boolean;
  readonly installCommand?: { readonly binary: string; readonly args: readonly string[] } | null;
  readonly permissions?: readonly ("network" | "filesystem" | "process" | "secrets" | "unknown")[];
  readonly maintainer?: string | null;
  readonly releaseProvenance?: string | null;
  readonly declaredStatus?: ToolSecurityStatusValue;
  readonly declaredTrust?: ToolTrustLevel;
  readonly communityReported?: boolean;
  readonly humanReview?: {
    readonly passed: boolean;
    readonly verified: boolean;
    readonly checklist: readonly string[];
    readonly reviewer: string;
  };
}

export interface SecurityCheck {
  readonly id: string;
  readonly verdict: SecurityCheckVerdict;
  readonly detail: string;
}

export interface SecurityAssessment {
  readonly toolName: string;
  readonly checks: readonly SecurityCheck[];
  readonly risk: SecurityRiskLevel;
  readonly status: ToolSecurityStatusValue;
  readonly trust: ToolTrustLevel;
  readonly note: string;
  readonly assessedAt: string;
  readonly overrideRequired: boolean;
}

export interface SecurityOverride {
  readonly granted: boolean;
  readonly note: string;
}

export interface SecurityDecision {
  readonly allowed: boolean;
  readonly requiresOverride: boolean;
  readonly assessment: SecurityAssessment;
  readonly overrideApplied: boolean;
}

export interface SecurityPort {
  assess(input: SecurityAssessmentInput): Promise<Result<SecurityAssessment>>;
  decide(
    input: SecurityAssessmentInput,
    override?: SecurityOverride,
  ): Promise<Result<SecurityDecision>>;
}
