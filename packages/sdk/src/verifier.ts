import type { VerifierPort } from "@prof-bilal/atlas-core";
import { createVerifierService } from "@prof-bilal/atlas-verifier";
import type { VerifierServiceDeps } from "@prof-bilal/atlas-verifier";

export type { VerifierServiceDeps } from "@prof-bilal/atlas-verifier";

/**
 * Create a VerifierPort backed by the built-in implementation.
 *
 * The caller must supply:
 * - `resolveSymbols`: resolves symbol names from the context index
 * - `getAnswerText`: returns the raw answer text to verify
 * - `computeFingerprint`: computes a project-state fingerprint for baseline diff
 * - `log` (optional): user-visible logging for command execution
 */
export function createVerifier(deps: VerifierServiceDeps): VerifierPort {
  return createVerifierService(deps);
}
