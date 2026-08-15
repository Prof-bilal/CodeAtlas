export type EntityId = string;

export function createId(prefix: string, value: string): EntityId {
  return `${prefix}_${value.toLowerCase().replaceAll(/\s+/g, "-")}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
