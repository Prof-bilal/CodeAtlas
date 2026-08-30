import type { VerifierPort } from "@atlas/core";
import { createVerifierService } from "@atlas/verifier";
import type { VerifierServiceDeps } from "@atlas/verifier";

export type { VerifierServiceDeps } from "@atlas/verifier";

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
