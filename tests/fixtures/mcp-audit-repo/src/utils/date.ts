export const MINUTE_MS = 60_000;

export function minutesFromNow(minutes: number, now = new Date()): Date {
  return new Date(now.getTime() + minutes * MINUTE_MS);
}

export function isExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
