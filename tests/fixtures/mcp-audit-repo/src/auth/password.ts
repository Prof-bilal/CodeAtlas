import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Hash a password with a random salt. The result is `<salt>:<sha256>` so it can
 * be verified later without storing the plaintext.
 */
export function hashPassword(password: string, salt = generateSalt()): string {
  const hash = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a stored `<salt>:<hash>` string. Constant-time when
 * the hash lengths match; fails fast otherwise.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (salt === undefined || hash === undefined) {
    return false;
  }
  const candidate = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(candidate, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}