/** Vocabulary shared by goal compilation and goal-contract validation. */
export const ASSERTIONS = [
  "artifact-presence",
  "literal-presence",
  "literal-absence",
  "symbol-presence",
  "contract-unchanged",
  "type-sound",
  "build-succeeds",
  "test-suite-passes",
  "runtime-behavior",
  "review-only",
] as const;
export const EVIDENCE_KINDS = [
  "artifact-exists",
  "text-absent",
  "text-present",
  "symbol-exists",
  "type-check",
  "build",
  "test",
  "contract-unchanged",
  "runtime-probe",
  "manual-review",
] as const;
export const PRIORITIES = ["MUST", "SHOULD", "MAY"] as const;
export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export const LEVELS = [0, 1, 2, 3, 4, 5] as const;
export const DETECTOR_KINDS = ["text-present", "artifact-exists", "symbol-exists"] as const;
