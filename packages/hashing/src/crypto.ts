import { createHash } from "node:crypto";

/** Length of a SHA-256 hex digest (64 characters). */
export const SHA256_HEX_LENGTH = 64;

/**
 * Compute the SHA-256 hex digest of a string. This is synchronous and never
 * fails.
 *
 * @param content - The string content to hash.
 * @returns A 64-character lowercase hex digest.
 */
export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
